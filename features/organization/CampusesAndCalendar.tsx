"use client";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Failure,
  Field,
  FormDialog,
  Input,
  Loading,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building,
  Building2,
  Calendar,
  Clock,
  Info,
  MapPin,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function CampusesAndCalendar() {
  const { request, boot, can, institutionId } = useApp();
  const [activeTab, setActiveTab] = useState("campuses");
  const [campuses, setCampuses] = useState<Row[]>([]);
  const [holidays, setHolidays] = useState<Row[]>([]);
  const [workingDays, setWorkingDays] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Dialogs
  const [campusDialog, setCampusDialog] = useState(false);
  const [holidayDialog, setHolidayDialog] = useState(false);

  // Forms
  const [campusForm, setCampusForm] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: "",
    principalName: "",
    status: "Active",
  });

  const [holidayForm, setHolidayForm] = useState({
    name: "",
    holidayDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    holidayType: "Public",
    description: "",
  });

  const canManage = can("settings.manage") || can("calendar.manage");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [campRes, holRes, workRes] = await Promise.all([
        request<{ campuses: Row[] }>("campuses"),
        request<{ holidays: Row[] }>("calendar/holidays"),
        request<{ workingDays: Row[] }>("calendar/working-days"),
      ]);
      setCampuses(campRes.campuses || []);
      setHolidays(holRes.holidays || []);
      setWorkingDays(workRes.workingDays || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Create Campus
  const handleCreateCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request("campuses", {
        method: "POST",
        body: campusForm,
      });
      toast.success("Campus branch registered successfully.");
      setCampusDialog(false);
      setCampusForm({
        name: "",
        code: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
        phone: "",
        email: "",
        principalName: "",
        status: "Active",
      });
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Toggle Campus Status
  const handleToggleCampusStatus = async (c: Row) => {
    try {
      const newStatus = c.status === "Active" ? "Inactive" : "Active";
      await request(`campuses/${c.id}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      toast.success(`Campus branch marked as ${newStatus}`);
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Create Holiday
  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const currentYear = boot.years.find((y: Row) => y.status === "Active") || boot.years[0];
      await request("calendar/holidays", {
        method: "POST",
        body: {
          ...holidayForm,
          academicYearId: currentYear?.id || "",
          endDate: holidayForm.endDate || undefined,
        },
      });
      toast.success("Academic holiday added to calendar.");
      setHolidayDialog(false);
      setHolidayForm({
        name: "",
        holidayDate: new Date().toISOString().slice(0, 10),
        endDate: "",
        holidayType: "Public",
        description: "",
      });
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Delete Holiday
  const handleDeleteHoliday = async (id: string) => {
    try {
      await request(`calendar/holidays/${id}`, { method: "DELETE" });
      toast.success("Holiday removed.");
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Update Working Day row locally
  const updateWorkingDay = (dayOfWeek: number, field: string, value: any) => {
    setWorkingDays((prev) =>
      prev.map((d) => (d.day_of_week === dayOfWeek ? { ...d, [field]: value } : d)),
    );
  };

  // Save Working Days
  const handleSaveWorkingDays = async () => {
    setBusy(true);
    try {
      const schedule = workingDays.map((d) => ({
        dayOfWeek: d.day_of_week,
        isWorkingDay: Boolean(d.is_working_day),
        shiftStartTime: d.shift_start_time || "08:30",
        shiftEndTime: d.shift_end_time || "15:30",
        isHalfDay: Boolean(d.is_half_day),
      }));
      await request("calendar/working-days", {
        method: "PUT",
        body: { schedule },
      });
      toast.success("Working days schedule saved successfully.");
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  if (loading && !campuses.length && !holidays.length) return <Loading />;
  if (error) return <Failure message={error} retry={loadData} />;

  return (
    <>
      <PageHead
        eyebrow="ORGANIZATION & CALENDAR"
        title="Campuses & Academic Calendar"
        description="Multi-campus directory, academic calendar schedule, institutional working days, and gazetted holidays."
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              {activeTab === "campuses" && (
                <Button onClick={() => setCampusDialog(true)}>
                  <Plus size={16} /> Add Campus Branch
                </Button>
              )}
              {activeTab === "holidays" && (
                <Button onClick={() => setHolidayDialog(true)}>
                  <Plus size={16} /> Add Holiday
                </Button>
              )}
            </div>
          )
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="campuses">
            Campuses & Branches ({campuses.length})
          </TabsTrigger>
          <TabsTrigger value="holidays">
            Academic Holidays ({holidays.length})
          </TabsTrigger>
          <TabsTrigger value="working-days">
            Working Days & Timings
          </TabsTrigger>
          <TabsTrigger value="profile">
            Institute Profile
          </TabsTrigger>
        </TabsList>

        {/* CAMPUSES TAB */}
        <TabsContent value="campuses">
          <Card title="Institute Campuses & Branches">
            <DataTable
              rows={campuses}
              columns={[
                {
                  key: "name",
                  label: "Campus Name",
                  render: (m) => (
                    <div>
                      <strong>{m.name}</strong>
                      {m.code && <Badge variant="outline" className="ml-2 text-xs">{m.code}</Badge>}
                      <div className="text-xs text-muted-foreground">
                        {m.city ? `${m.city}, ${m.state || ""}` : m.address || "—"}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "principal_name",
                  label: "Branch Head / Principal",
                  render: (m) => m.principal_name || "—",
                },
                {
                  key: "contact",
                  label: "Contact",
                  render: (m) => (
                    <div>
                      <div>{m.phone || "—"}</div>
                      <small className="text-muted-foreground">{m.email || ""}</small>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (m) => <Status value={m.status || "Active"} />,
                },
                {
                  key: "actions",
                  label: "",
                  render: (m) =>
                    canManage && (
                      <div className="row-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleCampusStatus(m)}
                        >
                          {m.status === "Active" ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    ),
                },
              ]}
            />
          </Card>
        </TabsContent>

        {/* HOLIDAYS TAB */}
        <TabsContent value="holidays">
          <Card title="Academic Calendar Holidays">
            <DataTable
              rows={holidays}
              columns={[
                {
                  key: "name",
                  label: "Holiday Occasion",
                  render: (m) => (
                    <div>
                      <strong>{m.name}</strong>
                      {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                    </div>
                  ),
                },
                {
                  key: "holiday_date",
                  label: "Date",
                  render: (m) => (
                    <div>
                      <strong>{m.holiday_date}</strong>
                      {m.end_date && m.end_date !== m.holiday_date && (
                        <span className="text-xs text-muted-foreground ml-1">to {m.end_date}</span>
                      )}
                    </div>
                  ),
                },
                {
                  key: "holiday_type",
                  label: "Type",
                  render: (m) => <Badge variant="secondary">{m.holiday_type || "Public"}</Badge>,
                },
                {
                  key: "actions",
                  label: "",
                  render: (m) =>
                    canManage && (
                      <div className="row-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteHoliday(m.id)}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    ),
                },
              ]}
            />
          </Card>
        </TabsContent>

        {/* WORKING DAYS TAB */}
        <TabsContent value="working-days">
          <Card
            title="Institutional Working Days & Bell Timings"
            action={
              canManage && (
                <Button size="sm" onClick={handleSaveWorkingDays} disabled={busy}>
                  Save Schedule
                </Button>
              )
            }
          >
            <div className="divide-y">
              {Array.from({ length: 7 }, (_, i) => {
                const record = workingDays.find((w) => w.day_of_week === i) || {
                  day_of_week: i,
                  is_working_day: i >= 1 && i <= 5,
                  shift_start_time: "08:30",
                  shift_end_time: "15:30",
                  is_half_day: i === 6,
                };
                return (
                  <div key={i} className="flex flex-wrap items-center justify-between py-3 gap-4">
                    <div className="w-36 font-medium text-sm">
                      {dayNames[i]}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(record.is_working_day)}
                        disabled={!canManage}
                        onChange={(e) => updateWorkingDay(i, "is_working_day", e.target.checked)}
                      />
                      <span>Working Day</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(record.is_half_day)}
                        disabled={!canManage || !record.is_working_day}
                        onChange={(e) => updateWorkingDay(i, "is_half_day", e.target.checked)}
                      />
                      <span>Half Day</span>
                    </label>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock size={15} className="text-muted-foreground" />
                      <input
                        type="time"
                        className="border rounded px-2 py-1 text-sm bg-background"
                        value={record.shift_start_time || "08:30"}
                        disabled={!canManage || !record.is_working_day}
                        onChange={(e) => updateWorkingDay(i, "shift_start_time", e.target.value)}
                      />
                      <span>to</span>
                      <input
                        type="time"
                        className="border rounded px-2 py-1 text-sm bg-background"
                        value={record.shift_end_time || "15:30"}
                        disabled={!canManage || !record.is_working_day}
                        onChange={(e) => updateWorkingDay(i, "shift_end_time", e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        {/* INSTITUTE PROFILE TAB */}
        <TabsContent value="profile">
          <Card title="Institution Master Profile">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Institute Legal Name</span>
                  <div className="font-semibold text-lg">{boot.institution.name}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Portal URL Slug</span>
                  <div className="font-mono text-sm">/campus/{boot.institution.slug}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Primary Contact Email</span>
                  <div className="text-sm">{boot.institution.settings?.contactEmail || "admin@institution.edu"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Contact Phone</span>
                  <div className="text-sm">{boot.institution.settings?.contactPhone || "+91 98765 43210"}</div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Official Campus Address</span>
                  <div className="text-sm">{boot.institution.settings?.address || "Main Institutional Campus, Sector 4"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Affiliation / Registration Code</span>
                  <div className="text-sm font-mono">{boot.institution.settings?.affiliationCode || "REG-SST-2026-001"}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Currency & Timezone</span>
                  <div className="text-sm">INR (₹) · Asia/Kolkata</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Active Academic Year</span>
                  <div className="text-sm font-medium">
                    {boot.years.find((y: Row) => y.status === "Active")?.name || "2025-2026"}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CREATE CAMPUS MODAL */}
      <FormDialog
        open={campusDialog}
        onClose={() => setCampusDialog(false)}
        title="Add Campus Branch"
        description="Register a new branch or campus facility for this educational institution."
        busy={busy}
        onSubmit={handleCreateCampus}
      >
        <div className="form-grid">
          <Field label="Campus Name" required>
            <Input
              required
              value={campusForm.name}
              onChange={(e) => setCampusForm({ ...campusForm, name: e.target.value })}
            />
          </Field>
          <Field label="Branch Code" required>
            <Input
              required
              placeholder="e.g. MAIN, NORTH, S-CAMPUS"
              value={campusForm.code}
              onChange={(e) => setCampusForm({ ...campusForm, code: e.target.value })}
            />
          </Field>
          <Field label="Branch Head / Principal">
            <Input
              value={campusForm.principalName}
              onChange={(e) => setCampusForm({ ...campusForm, principalName: e.target.value })}
            />
          </Field>
          <Field label="Campus Phone">
            <Input
              type="tel"
              value={campusForm.phone}
              onChange={(e) => setCampusForm({ ...campusForm, phone: e.target.value })}
            />
          </Field>
          <Field label="Campus Email">
            <Input
              type="email"
              value={campusForm.email}
              onChange={(e) => setCampusForm({ ...campusForm, email: e.target.value })}
            />
          </Field>
          <Field label="City">
            <Input
              value={campusForm.city}
              onChange={(e) => setCampusForm({ ...campusForm, city: e.target.value })}
            />
          </Field>
          <Field label="Address">
            <Input
              value={campusForm.address}
              onChange={(e) => setCampusForm({ ...campusForm, address: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>

      {/* CREATE HOLIDAY MODAL */}
      <FormDialog
        open={holidayDialog}
        onClose={() => setHolidayDialog(false)}
        title="Add Academic Calendar Holiday"
        description="Declare an institutional or public holiday in the academic calendar."
        busy={busy}
        onSubmit={handleCreateHoliday}
      >
        <div className="form-grid">
          <Field label="Holiday Name" required>
            <Input
              required
              placeholder="e.g. Republic Day, Diwali Break"
              value={holidayForm.name}
              onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
            />
          </Field>
          <Field label="Holiday Date" required>
            <Input
              required
              type="date"
              value={holidayForm.holidayDate}
              onChange={(e) => setHolidayForm({ ...holidayForm, holidayDate: e.target.value })}
            />
          </Field>
          <Field label="End Date (if multi-day break)">
            <Input
              type="date"
              value={holidayForm.endDate}
              onChange={(e) => setHolidayForm({ ...holidayForm, endDate: e.target.value })}
            />
          </Field>
          <Field label="Holiday Category">
            <Picker
              value={holidayForm.holidayType}
              onChange={(v) => setHolidayForm({ ...holidayForm, holidayType: v })}
              options={[
                { value: "Public", label: "Public / Gazetted Holiday" },
                { value: "Institutional", label: "Institutional / School Holiday" },
                { value: "Vacation", label: "Seasonal Vacation Break" },
                { value: "Observance", label: "Special Observance" },
              ]}
            />
          </Field>
        </div>
        <Field label="Description / Circular Remarks">
          <Input
            placeholder="Official government notification or school circular note"
            value={holidayForm.description}
            onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
          />
        </Field>
      </FormDialog>
    </>
  );
}
