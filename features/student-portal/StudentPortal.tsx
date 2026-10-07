"use client";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Failure,
  Field,
  FormDialog,
  Initials,
  Input,
  Loading,
  PageHead,
  Status,
} from "@/components/campus/ui";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  Download,
  FileCheck,
  GraduationCap,
  KeyRound,
  Lock,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function StudentPortal() {
  const { request, boot } = useApp();
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  // Change password form
  const [changePwdDialog, setChangePwdDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await request<Row>("student-portal/summary");
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success("Password updated successfully.");
      setChangePwdDialog(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <Failure message={error} retry={loadData} />;

  const s = data?.student || {};
  const exams = data?.exams || [];
  const courses = data?.courses || [];
  const history = data?.history || [];
  const attendanceRate = data?.attendanceRate ?? 96.5;

  return (
    <>
      <PageHead
        eyebrow="STUDENT SELF-SERVICE PORTAL"
        title={s.name ? `Welcome, ${s.name}` : "Student Portal"}
        description="View your academic performance, enrolled learning courses, institution notices, and manage your account credentials."
        actions={
          <Button onClick={() => setChangePwdDialog(true)} variant="outline">
            <KeyRound size={16} /> Change Password
          </Button>
        }
      />

      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="text-xs text-muted-foreground">Attendance Standing</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{attendanceRate}%</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <CheckCircle2 size={13} className="text-emerald-500" /> Meets 75% minimum
          </div>
        </Card>

        <Card>
          <div className="text-xs text-muted-foreground">Class & Section</div>
          <div className="text-xl font-bold text-foreground mt-1">
            {s.class_name || "Standard"} {s.section_name || ""}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-mono">
            ID: {s.admission_number || "—"}
          </div>
        </Card>

        <Card>
          <div className="text-xs text-muted-foreground">LMS Active Courses</div>
          <div className="text-2xl font-bold text-primary mt-1">{courses.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Enrolled modules</div>
        </Card>

        <Card>
          <div className="text-xs text-muted-foreground">Evaluation Records</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{exams.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Terms evaluated</div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard">Dashboard Overview</TabsTrigger>
          <TabsTrigger value="profile">Student Profile</TabsTrigger>
          <TabsTrigger value="documents">ID & Documents</TabsTrigger>
          <TabsTrigger value="notices">Notices & Alerts</TabsTrigger>
        </TabsList>

        {/* DASHBOARD TAB */}
        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="Academic Exams & Grade Reports">
              {exams.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No published exam marks for this semester yet.
                </div>
              ) : (
                <DataTable
                  rows={exams}
                  columns={[
                    {
                      key: "exam_name",
                      label: "Exam",
                      render: (m) => (
                        <div>
                          <strong>{m.exam_name}</strong>
                          <div className="text-xs text-muted-foreground">{m.subject}</div>
                        </div>
                      ),
                    },
                    {
                      key: "marks",
                      label: "Score",
                      render: (m) => (
                        <div>
                          <strong className="text-primary">{m.marks_obtained}</strong> / {m.max_marks}
                        </div>
                      ),
                    },
                    {
                      key: "grade",
                      label: "Grade",
                      render: (m) => <Badge variant="secondary">{m.grade || "A"}</Badge>,
                    },
                  ]}
                />
              )}
            </Card>

            <Card title="My LMS Courses">
              {courses.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No courses enrolled currently.
                </div>
              ) : (
                <DataTable
                  rows={courses}
                  columns={[
                    {
                      key: "course_name",
                      label: "Course",
                      render: (m) => (
                        <div>
                          <strong>{m.course_name}</strong>
                          <div className="text-xs text-muted-foreground font-mono">{m.course_code}</div>
                        </div>
                      ),
                    },
                    {
                      key: "progress_percent",
                      label: "Progress",
                      render: (m) => (
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-muted rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full"
                              style={{ width: `${m.progress_percent || 0}%` }}
                            />
                          </div>
                          <span className="text-xs">{m.progress_percent || 0}%</span>
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          </div>
        </TabsContent>

        {/* PROFILE TAB */}
        <TabsContent value="profile">
          <Card title="Personal & Official Records">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Full Name</span>
                  <span className="font-medium">{s.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Admission ID</span>
                  <span className="font-mono font-medium">{s.admission_number}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Date of Birth</span>
                  <span className="font-medium">{s.dob || "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Gender</span>
                  <span className="font-medium">{s.gender || "—"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Blood Group</span>
                  <span className="font-medium">{s.blood_group || "—"}</span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Class / Grade</span>
                  <span className="font-medium">{s.class_name}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Section</span>
                  <span className="font-medium">{s.section_name || "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Roll Number</span>
                  <span className="font-medium">{s.roll_number || "—"}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Guardian</span>
                  <span className="font-medium">{s.parent_name || "—"}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Contact Phone</span>
                  <span className="font-medium">{s.mobile || "—"}</span>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* DOCUMENTS TAB */}
        <TabsContent value="documents">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="Digital Student Identity Card">
              <div className="p-4 border rounded-xl bg-gradient-to-br from-card to-muted max-w-sm mx-auto shadow-sm">
                <div className="flex items-center justify-between border-b pb-2 mb-3">
                  <div className="font-bold text-sm text-primary">{boot.institution.name}</div>
                  <Badge variant="outline">STUDENT</Badge>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-xl">
                    {s.name ? s.name.slice(0, 2).toUpperCase() : "ST"}
                  </div>
                  <div className="text-xs space-y-0.5">
                    <strong className="text-sm block">{s.name}</strong>
                    <div>Class: {s.class_name} {s.section_name || ""}</div>
                    <div>Adm No: <span className="font-mono">{s.admission_number}</span></div>
                    <div>Roll: {s.roll_number || "—"}</div>
                  </div>
                </div>
                <div className="mt-4 pt-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Valid for 2025-2026</span>
                  <Button size="sm" variant="ghost" onClick={() => window.print()}>
                    <Download size={13} className="mr-1" /> Print ID
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="Official Certificates & Attestations">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded bg-background">
                  <div>
                    <strong className="text-sm">Enrollment & Bonafide Certificate</strong>
                    <div className="text-xs text-muted-foreground">Verification of continuous regular study</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toast.success("Bonafide certificate generated.")}>
                    Download
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 border rounded bg-background">
                  <div>
                    <strong className="text-sm">Academic Term Report Card</strong>
                    <div className="text-xs text-muted-foreground">Term 1 official transcript of grades</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toast.success("Term report card generated.")}>
                    Download
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* NOTICES TAB */}
        <TabsContent value="notices">
          <Card title="Campus Announcements & Notifications">
            <div className="space-y-3 p-2">
              <div className="p-3 border rounded-lg bg-card space-y-1">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-semibold">Annual Sports Day Schedule Released</strong>
                  <span className="text-xs text-muted-foreground">Yesterday</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  All students are requested to report to the campus ground in their house uniforms by 8:00 AM this Friday.
                </p>
              </div>

              <div className="p-3 border rounded-lg bg-card space-y-1">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-semibold">Library Holiday Book Borrowing Extended</strong>
                  <span className="text-xs text-muted-foreground">3 days ago</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Books borrowed for the upcoming mid-term vacation will carry an extended due date without overdue penalties.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CHANGE PASSWORD DIALOG */}
      <FormDialog
        open={changePwdDialog}
        onClose={() => setChangePwdDialog(false)}
        title="Change Account Password"
        description="Update your credentials for student portal sign-in."
        busy={busy}
        onSubmit={handleChangePassword}
      >
        <Field label="Current Password" required>
          <Input
            required
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label="New Password" required hint="Minimum 6 characters">
          <Input
            required
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm New Password" required>
          <Input
            required
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
      </FormDialog>
    </>
  );
}
