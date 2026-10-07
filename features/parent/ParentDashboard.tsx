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
  money,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Badge } from "@/components/ui/badge";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  Link as LinkIcon,
  Phone,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function ParentDashboard() {
  const { request, boot, can } = useApp();
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [linkDialog, setLinkDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  const [linkForm, setLinkForm] = useState({
    admissionNumber: "",
    dob: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await request<Row>("parent-portal/summary");
      setData(res);
      if (res.children && res.children.length > 0 && !selectedChildId) {
        setSelectedChildId(res.children[0].id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [request, selectedChildId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleLinkChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request("parent-portal/link-child", {
        method: "POST",
        body: linkForm,
      });
      toast.success("Child linked to your guardian account successfully.");
      setLinkDialog(false);
      setLinkForm({ admissionNumber: "", dob: "" });
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <Failure message={error} retry={loadData} />;

  const children = data?.children || [];
  const selectedChild = children.find((c: Row) => c.id === selectedChildId) || children[0];
  const feeBalance = data?.feeBalance || { total_paise: 0, paid_paise: 0, outstanding_paise: 0 };
  const parentProfile = data?.parent || {};

  return (
    <>
      <PageHead
        eyebrow="PARENT & GUARDIAN PORTAL"
        title="Family & Guardian Dashboard"
        description="Unified portal for parents: view multiple children, track attendance, monitor academic performance, and manage school fee payments."
        actions={
          <Button onClick={() => setLinkDialog(true)} variant="outline">
            <LinkIcon size={16} /> Link Another Child
          </Button>
        }
      />

      {children.length === 0 ? (
        <Card title="No Children Linked">
          <div className="text-center py-8 space-y-3">
            <Users className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              No students are currently linked to your guardian account.
            </p>
            <Button onClick={() => setLinkDialog(true)}>
              Link Student by Admission Number
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* MULTI-CHILD SELECTOR */}
          {children.length > 1 && (
            <div className="flex items-center gap-3 bg-muted/40 p-3 rounded-lg border">
              <span className="text-sm font-medium">Select Child:</span>
              <div className="flex flex-wrap gap-2">
                {children.map((c: Row) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedChildId(c.id)}
                    className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                      selectedChild?.id === c.id
                        ? "bg-primary text-primary-foreground shadow"
                        : "bg-background text-foreground hover:bg-muted border"
                    }`}
                  >
                    <GraduationCap className="inline mr-1.5 h-4 w-4" />
                    {c.name} ({c.class_name || "Enrolled"})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVE CHILD SUMMARY */}
          {selectedChild && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="md:col-span-2">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                    {selectedChild.name ? selectedChild.name.slice(0, 2).toUpperCase() : "ST"}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{selectedChild.name}</h2>
                    <div className="text-sm text-muted-foreground">
                      Admission #{selectedChild.admission_number} · Class {selectedChild.class_name || "—"}{" "}
                      {selectedChild.section_name || ""}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Status value={selectedChild.status || "Active"} />
                      <span className="text-xs text-muted-foreground">
                        Roll: {selectedChild.roll_number || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="text-xs text-muted-foreground">Attendance Standing</div>
                <div className="text-2xl font-bold text-emerald-600 mt-1">96.5%</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  Regular & Prompt
                </div>
              </Card>

              <Card>
                <div className="text-xs text-muted-foreground">Fee Balance</div>
                <div className="text-2xl font-bold text-primary mt-1">
                  {money(feeBalance.outstanding_paise || 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {feeBalance.outstanding_paise > 0 ? "Next due: Upcoming" : "All cleared"}
                </div>
              </Card>
            </div>
          )}

          {/* CHILD OVERVIEW TABS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="Student Academic Details">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Date of Birth</span>
                  <span className="font-medium">{selectedChild?.dob || "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Gender</span>
                  <span className="font-medium">{selectedChild?.gender || "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Blood Group</span>
                  <span className="font-medium">{selectedChild?.blood_group || "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Class & Section</span>
                  <span className="font-medium">
                    {selectedChild?.class_name} - {selectedChild?.section_name}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Enrollment Year</span>
                  <span className="font-medium">
                    {boot.years.find((y: Row) => y.status === "Active")?.name || "2025-2026"}
                  </span>
                </div>
              </div>
            </Card>

            <Card title="Guardian Information">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Guardian Name</span>
                  <span className="font-medium">{parentProfile.guardian_name || boot.user.displayName || "Parent"}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Contact Mobile</span>
                  <span className="font-medium">{parentProfile.mobile || "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{parentProfile.email || boot.user.email}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Total Linked Children</span>
                  <span className="font-medium">{children.length}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* LINK CHILD MODAL */}
      <FormDialog
        open={linkDialog}
        onClose={() => setLinkDialog(false)}
        title="Link Student to Guardian Portal"
        description="Verify and link your child's record using student admission number and date of birth."
        busy={busy}
        onSubmit={handleLinkChild}
      >
        <div className="form-grid">
          <Field label="Student Admission Number" required>
            <Input
              required
              placeholder="e.g. ADM-2025-001"
              value={linkForm.admissionNumber}
              onChange={(e) => setLinkForm({ ...linkForm, admissionNumber: e.target.value })}
            />
          </Field>
          <Field label="Student Date of Birth" required>
            <Input
              required
              type="date"
              value={linkForm.dob}
              onChange={(e) => setLinkForm({ ...linkForm, dob: e.target.value })}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Note: Details must match the official student registration records on file with the school administration.
        </p>
      </FormDialog>
    </>
  );
}
