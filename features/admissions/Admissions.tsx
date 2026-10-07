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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  MessageSquare,
  Plus,
  Search,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function Admissions() {
  const { request, boot, can } = useApp();
  const [activeTab, setActiveTab] = useState("enquiries");
  const [enquiries, setEnquiries] = useState<Row[]>([]);
  const [applications, setApplications] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Dialog states
  const [enquiryDialog, setEnquiryDialog] = useState(false);
  const [appDialog, setAppDialog] = useState(false);
  const [interviewDialog, setInterviewDialog] = useState<Row | null>(null);
  const [enrollDialog, setEnrollDialog] = useState<Row | null>(null);
  const [selectedApp, setSelectedApp] = useState<Row | null>(null);
  const [docDialog, setDocDialog] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  // Form states
  const [enquiryForm, setEnquiryForm] = useState({
    studentName: "",
    parentName: "",
    email: "",
    mobile: "",
    applyingForGrade: "",
    source: "Website",
    notes: "",
  });

  const [appForm, setAppForm] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    gender: "Male",
    bloodGroup: "",
    gradeApplying: "",
    parentName: "",
    parentEmail: "",
    parentMobile: "",
    parentOccupation: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    previousSchool: "",
    previousBoard: "",
    previousPercentage: "",
  });

  const [interviewForm, setInterviewForm] = useState({
    scheduledDate: "",
    interviewMode: "In-Person",
    interviewerName: "",
    notes: "",
    score: "",
    status: "Scheduled",
  });

  const [enrollForm, setEnrollForm] = useState({
    classId: "",
    sectionId: "",
    rollNumber: "",
    admissionDate: new Date().toISOString().slice(0, 10),
  });

  const [docForm, setDocForm] = useState({
    documentType: "Birth Certificate",
    documentName: "",
    fileUrl: "https://example.com/docs/cert.pdf",
  });

  const canManage = can("admissions.manage");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [enqRes, appRes] = await Promise.all([
        request<{ enquiries: Row[] }>("admissions/enquiries"),
        request<{ applications: Row[] }>("admissions/applications"),
      ]);
      setEnquiries(enqRes.enquiries || []);
      setApplications(appRes.applications || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Create Enquiry
  const handleCreateEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request("admissions/enquiries", {
        method: "POST",
        body: enquiryForm,
      });
      toast.success("Admissions enquiry registered successfully.");
      setEnquiryDialog(false);
      setEnquiryForm({
        studentName: "",
        parentName: "",
        email: "",
        mobile: "",
        applyingForGrade: "",
        source: "Website",
        notes: "",
      });
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Update Enquiry Status
  const handleUpdateEnquiryStatus = async (id: string, status: string) => {
    try {
      await request(`admissions/enquiries/${id}`, {
        method: "PATCH",
        body: { status },
      });
      toast.success(`Enquiry status updated to ${status}`);
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Create Application
  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const currentYear = boot.years.find((y: Row) => y.status === "Active") || boot.years[0];
      await request("admissions/applications", {
        method: "POST",
        body: {
          ...appForm,
          academicYearId: currentYear?.id || "",
        },
      });
      toast.success("Application submitted successfully.");
      setAppDialog(false);
      setAppForm({
        firstName: "",
        lastName: "",
        dob: "",
        gender: "Male",
        bloodGroup: "",
        gradeApplying: "",
        parentName: "",
        parentEmail: "",
        parentMobile: "",
        parentOccupation: "",
        address: "",
        city: "",
        state: "",
        pincode: "",
        previousSchool: "",
        previousBoard: "",
        previousPercentage: "",
      });
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Update Application Status
  const handleUpdateAppStatus = async (id: string, status: string) => {
    try {
      await request(`admissions/applications/${id}/status`, {
        method: "PATCH",
        body: { status },
      });
      toast.success(`Application marked as ${status}`);
      if (selectedApp?.id === id) {
        setSelectedApp((prev) => (prev ? { ...prev, status } : null));
      }
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Save Interview
  const handleSaveInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interviewDialog) return;
    setBusy(true);
    try {
      await request(`admissions/applications/${interviewDialog.id}/interview`, {
        method: "POST",
        body: {
          scheduledDate: interviewForm.scheduledDate,
          interviewMode: interviewForm.interviewMode,
          interviewerName: interviewForm.interviewerName,
          notes: interviewForm.notes,
          score: interviewForm.score ? Number(interviewForm.score) : undefined,
          status: interviewForm.status,
        },
      });
      toast.success("Interview schedule & evaluation updated.");
      setInterviewDialog(null);
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Enroll Student
  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollDialog) return;
    setBusy(true);
    try {
      const currentYear = boot.years.find((y: Row) => y.status === "Active") || boot.years[0];
      const res = await request<{ studentId: string; admissionNumber: string }>(
        `admissions/applications/${enrollDialog.id}/enroll`,
        {
          method: "POST",
          body: {
            academicYearId: currentYear?.id || "",
            classId: enrollForm.classId,
            sectionId: enrollForm.sectionId,
            rollNumber: enrollForm.rollNumber || undefined,
            admissionDate: enrollForm.admissionDate,
          },
        },
      );
      toast.success(
        `Student enrolled successfully! Admission ID: ${res.admissionNumber || res.studentId}`,
      );
      setEnrollDialog(null);
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Add Document
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docDialog) return;
    setBusy(true);
    try {
      await request(`admissions/applications/${docDialog.id}/documents`, {
        method: "POST",
        body: docForm,
      });
      toast.success("Document attached.");
      setDocDialog(null);
      setDocForm({
        documentType: "Birth Certificate",
        documentName: "",
        fileUrl: "https://example.com/docs/cert.pdf",
      });
      // reload full app view if open
      const res = await request<{ application: Row; documents: Row[] }>(
        `admissions/applications/${docDialog.id}`,
      );
      setSelectedApp({ ...res.application, documents: res.documents });
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Verify Document
  const handleVerifyDocument = async (docId: string, status: "Verified" | "Rejected") => {
    try {
      await request(`admissions/documents/${docId}/verify`, {
        method: "PATCH",
        body: { status, verificationRemarks: `Document ${status.toLowerCase()} by admin.` },
      });
      toast.success(`Document marked as ${status}`);
      if (selectedApp) {
        const res = await request<{ application: Row; documents: Row[] }>(
          `admissions/applications/${selectedApp.id}`,
        );
        setSelectedApp({ ...res.application, documents: res.documents });
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const filteredEnquiries = enquiries.filter((item) => {
    const matchesSearch =
      !search ||
      item.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      item.parent_name?.toLowerCase().includes(search.toLowerCase()) ||
      item.mobile?.includes(search) ||
      item.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredApplications = applications.filter((item) => {
    const matchesSearch =
      !search ||
      item.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      item.application_number?.toLowerCase().includes(search.toLowerCase()) ||
      item.parent_name?.toLowerCase().includes(search.toLowerCase()) ||
      item.parent_mobile?.includes(search);
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading && !enquiries.length && !applications.length) return <Loading />;
  if (error) return <Failure message={error} retry={loadData} />;

  return (
    <>
      <PageHead
        eyebrow="ADMISSIONS & ENROLLMENT"
        title="Admissions Management"
        description="Comprehensive admissions lifecycle: prospective enquiries, application processing, entrance interviews, document verification, and one-click student enrollment."
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <Button onClick={() => setEnquiryDialog(true)} variant="outline">
                <Plus size={16} /> New Enquiry
              </Button>
              <Button onClick={() => setAppDialog(true)}>
                <UserPlus size={16} /> New Application
              </Button>
            </div>
          )
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearch(""); setStatusFilter("ALL"); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="enquiries">
            Enquiries ({enquiries.length})
          </TabsTrigger>
          <TabsTrigger value="applications">
            Applications ({applications.length})
          </TabsTrigger>
          <TabsTrigger value="interviews">
            Interviews & Tests ({applications.filter((a) => a.interview_status || a.status === "InterviewScheduled").length})
          </TabsTrigger>
          <TabsTrigger value="enrollment">
            Ready to Enroll ({applications.filter((a) => ["Selected", "Confirmed"].includes(a.status)).length})
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by student, parent, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Picker
              value={statusFilter}
              onChange={setStatusFilter}
              options={
                activeTab === "enquiries"
                  ? [
                      { value: "ALL", label: "All Statuses" },
                      { value: "New", label: "New" },
                      { value: "Contacted", label: "Contacted" },
                      { value: "FollowUp", label: "Follow Up" },
                      { value: "Converted", label: "Converted" },
                      { value: "Closed", label: "Closed" },
                    ]
                  : [
                      { value: "ALL", label: "All Statuses" },
                      { value: "Draft", label: "Draft" },
                      { value: "Submitted", label: "Submitted" },
                      { value: "UnderReview", label: "Under Review" },
                      { value: "InterviewScheduled", label: "Interview Scheduled" },
                      { value: "Selected", label: "Selected" },
                      { value: "Confirmed", label: "Confirmed" },
                      { value: "Enrolled", label: "Enrolled" },
                      { value: "Rejected", label: "Rejected" },
                    ]
              }
            />
          </div>
        </div>

        {/* ENQUIRIES TAB */}
        <TabsContent value="enquiries">
          <Card title="Prospective Student Enquiries">
            <DataTable
              rows={filteredEnquiries}
              columns={[
                {
                  key: "student_name",
                  label: "Candidate",
                  render: (m) => (
                    <div>
                      <strong>{m.student_name}</strong>
                      <div className="text-xs text-muted-foreground">
                        Grade: {m.applying_for_grade || "—"} · Source: {m.source}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "parent_name",
                  label: "Parent / Contact",
                  render: (m) => (
                    <div>
                      <div>{m.parent_name || "—"}</div>
                      <small className="text-muted-foreground">{m.mobile} · {m.email}</small>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (m) => <Status value={m.status} />,
                },
                {
                  key: "notes",
                  label: "Notes",
                  render: (m) => <span className="text-sm">{m.notes || "—"}</span>,
                },
                {
                  key: "created_at",
                  label: "Date",
                  render: (m) => (m.created_at ? m.created_at.slice(0, 10) : "—"),
                },
                {
                  key: "actions",
                  label: "",
                  render: (m) =>
                    canManage && (
                      <div className="row-actions">
                        {m.status !== "Converted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAppForm((prev) => ({
                                ...prev,
                                firstName: m.student_name.split(" ")[0] || "",
                                lastName: m.student_name.split(" ").slice(1).join(" ") || "",
                                gradeApplying: m.applying_for_grade || "",
                                parentName: m.parent_name || "",
                                parentEmail: m.email || "",
                                parentMobile: m.mobile || "",
                              }));
                              setAppDialog(true);
                              void handleUpdateEnquiryStatus(m.id, "Converted");
                            }}
                          >
                            Convert to App
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleUpdateEnquiryStatus(
                              m.id,
                              m.status === "New" ? "Contacted" : m.status === "Contacted" ? "FollowUp" : "Closed",
                            )
                          }
                        >
                          Progress
                        </Button>
                      </div>
                    ),
                },
              ]}
            />
          </Card>
        </TabsContent>

        {/* APPLICATIONS TAB */}
        <TabsContent value="applications">
          <Card title="Submitted Applications">
            <DataTable
              rows={filteredApplications}
              columns={[
                {
                  key: "application_number",
                  label: "App Number",
                  render: (m) => (
                    <div>
                      <strong className="text-primary">{m.application_number}</strong>
                      <div className="text-xs text-muted-foreground">{m.grade_applying}</div>
                    </div>
                  ),
                },
                {
                  key: "student_name",
                  label: "Student",
                  render: (m) => (
                    <div>
                      <strong>{m.student_name}</strong>
                      <div className="text-xs text-muted-foreground">
                        DOB: {m.dob || "—"} · Gender: {m.gender || "—"}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "parent_name",
                  label: "Parent Contact",
                  render: (m) => (
                    <div>
                      <div>{m.parent_name}</div>
                      <small className="text-muted-foreground">{m.parent_mobile} · {m.parent_email}</small>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (m) => <Status value={m.status} />,
                },
                {
                  key: "submission_date",
                  label: "Date",
                  render: (m) => (m.submission_date ? m.submission_date.slice(0, 10) : "—"),
                },
                {
                  key: "actions",
                  label: "",
                  render: (m) => (
                    <div className="row-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const res = await request<{ application: Row; documents: Row[] }>(
                            `admissions/applications/${m.id}`,
                          );
                          setSelectedApp({ ...res.application, documents: res.documents });
                        }}
                      >
                        View Details
                      </Button>
                      {canManage && m.status === "Submitted" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateAppStatus(m.id, "UnderReview")}
                        >
                          Review
                        </Button>
                      )}
                      {canManage && ["Submitted", "UnderReview"].includes(m.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setInterviewDialog(m);
                            setInterviewForm({
                              scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
                              interviewMode: "In-Person",
                              interviewerName: boot.user.displayName || "Admin",
                              notes: "",
                              score: "",
                              status: "Scheduled",
                            });
                          }}
                        >
                          Interview
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </TabsContent>

        {/* INTERVIEWS TAB */}
        <TabsContent value="interviews">
          <Card title="Entrance Tests & Interview Evaluations">
            <DataTable
              rows={applications.filter((a) => a.interview_status || a.status === "InterviewScheduled")}
              columns={[
                {
                  key: "application_number",
                  label: "Application",
                  render: (m) => (
                    <div>
                      <strong>{m.application_number}</strong>
                      <div className="text-xs text-muted-foreground">{m.student_name} ({m.grade_applying})</div>
                    </div>
                  ),
                },
                {
                  key: "interview_date",
                  label: "Schedule",
                  render: (m) => (
                    <div>
                      <div>{m.interview_date ? m.interview_date.replace("T", " ") : "Not set"}</div>
                      <small className="text-muted-foreground">{m.interview_mode || "In-Person"}</small>
                    </div>
                  ),
                },
                {
                  key: "interviewer_name",
                  label: "Interviewer",
                  render: (m) => m.interviewer_name || "—",
                },
                {
                  key: "interview_score",
                  label: "Score / Grade",
                  render: (m) => (m.interview_score !== null && m.interview_score !== undefined ? `${m.interview_score}/100` : "Pending"),
                },
                {
                  key: "interview_status",
                  label: "Interview Status",
                  render: (m) => <Status value={m.interview_status || "Scheduled"} />,
                },
                {
                  key: "actions",
                  label: "",
                  render: (m) =>
                    canManage && (
                      <div className="row-actions">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setInterviewDialog(m);
                            setInterviewForm({
                              scheduledDate: m.interview_date || "",
                              interviewMode: m.interview_mode || "In-Person",
                              interviewerName: m.interviewer_name || boot.user.displayName || "Admin",
                              notes: m.interview_notes || "",
                              score: m.interview_score !== null && m.interview_score !== undefined ? String(m.interview_score) : "",
                              status: m.interview_status || "Completed",
                            });
                          }}
                        >
                          Evaluate / Edit
                        </Button>
                        {m.status !== "Selected" && m.status !== "Enrolled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUpdateAppStatus(m.id, "Selected")}
                          >
                            Select
                          </Button>
                        )}
                        {m.status !== "Rejected" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUpdateAppStatus(m.id, "Rejected")}
                          >
                            Reject
                          </Button>
                        )}
                      </div>
                    ),
                },
              ]}
            />
          </Card>
        </TabsContent>

        {/* ENROLLMENT TAB */}
        <TabsContent value="enrollment">
          <Card title="Candidates Approved for Formal Enrollment">
            <DataTable
              rows={applications.filter((a) => ["Selected", "Confirmed"].includes(a.status))}
              columns={[
                {
                  key: "application_number",
                  label: "Application #",
                  render: (m) => (
                    <div>
                      <strong>{m.application_number}</strong>
                      <div className="text-xs text-muted-foreground">{m.grade_applying}</div>
                    </div>
                  ),
                },
                {
                  key: "student_name",
                  label: "Student",
                  render: (m) => (
                    <div>
                      <strong>{m.student_name}</strong>
                      <div className="text-xs text-muted-foreground">
                        Parent: {m.parent_name} ({m.parent_mobile})
                      </div>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: "Admission Stage",
                  render: (m) => <Status value={m.status} />,
                },
                {
                  key: "interview_score",
                  label: "Test Score",
                  render: (m) => (m.interview_score !== null && m.interview_score !== undefined ? `${m.interview_score} pts` : "—"),
                },
                {
                  key: "actions",
                  label: "",
                  render: (m) =>
                    canManage && (
                      <div className="row-actions">
                        {m.status === "Selected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateAppStatus(m.id, "Confirmed")}
                          >
                            Confirm Seat
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => {
                            setEnrollDialog(m);
                            // default class/section
                            const firstClass = boot.classes[0];
                            const firstSection = boot.sections.find((s: Row) => s.class_id === firstClass?.id) || boot.sections[0];
                            setEnrollForm({
                              classId: firstClass?.id || "",
                              sectionId: firstSection?.id || "",
                              rollNumber: "",
                              admissionDate: new Date().toISOString().slice(0, 10),
                            });
                          }}
                        >
                          <UserCheck size={16} /> Complete Enrollment
                        </Button>
                      </div>
                    ),
                },
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>

      {/* CREATE ENQUIRY MODAL */}
      <FormDialog
        open={enquiryDialog}
        onClose={() => setEnquiryDialog(false)}
        title="Register Admissions Enquiry"
        description="Record initial inquiry details from parent or prospective student."
        busy={busy}
        onSubmit={handleCreateEnquiry}
      >
        <div className="form-grid">
          <Field label="Student Candidate Name" required>
            <Input
              required
              value={enquiryForm.studentName}
              onChange={(e) => setEnquiryForm({ ...enquiryForm, studentName: e.target.value })}
            />
          </Field>
          <Field label="Parent / Guardian Name" required>
            <Input
              required
              value={enquiryForm.parentName}
              onChange={(e) => setEnquiryForm({ ...enquiryForm, parentName: e.target.value })}
            />
          </Field>
          <Field label="Contact Mobile" required>
            <Input
              required
              type="tel"
              value={enquiryForm.mobile}
              onChange={(e) => setEnquiryForm({ ...enquiryForm, mobile: e.target.value })}
            />
          </Field>
          <Field label="Email Address">
            <Input
              type="email"
              value={enquiryForm.email}
              onChange={(e) => setEnquiryForm({ ...enquiryForm, email: e.target.value })}
            />
          </Field>
          <Field label="Applying for Grade / Class" required>
            <Input
              required
              placeholder="e.g. Grade 1, Grade 11 Science"
              value={enquiryForm.applyingForGrade}
              onChange={(e) => setEnquiryForm({ ...enquiryForm, applyingForGrade: e.target.value })}
            />
          </Field>
          <Field label="Source of Enquiry">
            <Picker
              value={enquiryForm.source}
              onChange={(v) => setEnquiryForm({ ...enquiryForm, source: v })}
              options={[
                { value: "Website", label: "School Website" },
                { value: "WalkIn", label: "Campus Walk-in" },
                { value: "Referral", label: "Parent Referral" },
                { value: "Advertisement", label: "Advertisement / Social Media" },
                { value: "Phone", label: "Phone Inquiry" },
              ]}
            />
          </Field>
        </div>
        <Field label="Counselor Notes / Remarks">
          <Input
            placeholder="Specific interests, transport requirement, previous school..."
            value={enquiryForm.notes}
            onChange={(e) => setEnquiryForm({ ...enquiryForm, notes: e.target.value })}
          />
        </Field>
      </FormDialog>

      {/* CREATE APPLICATION MODAL */}
      <FormDialog
        open={appDialog}
        onClose={() => setAppDialog(false)}
        title="Submit New Admission Application"
        description="Collect full student profile, parent details, and previous academic history."
        wide
        busy={busy}
        onSubmit={handleCreateApplication}
      >
        <div className="space-y-4">
          <h4 className="font-semibold text-sm border-b pb-1">1. Student Information</h4>
          <div className="form-grid">
            <Field label="First Name" required>
              <Input
                required
                value={appForm.firstName}
                onChange={(e) => setAppForm({ ...appForm, firstName: e.target.value })}
              />
            </Field>
            <Field label="Last Name" required>
              <Input
                required
                value={appForm.lastName}
                onChange={(e) => setAppForm({ ...appForm, lastName: e.target.value })}
              />
            </Field>
            <Field label="Date of Birth" required>
              <Input
                required
                type="date"
                value={appForm.dob}
                onChange={(e) => setAppForm({ ...appForm, dob: e.target.value })}
              />
            </Field>
            <Field label="Gender" required>
              <Picker
                value={appForm.gender}
                onChange={(v) => setAppForm({ ...appForm, gender: v })}
                options={[
                  { value: "Male", label: "Male" },
                  { value: "Female", label: "Female" },
                  { value: "Other", label: "Other" },
                ]}
              />
            </Field>
            <Field label="Blood Group">
              <Input
                placeholder="e.g. O+, A+, B+"
                value={appForm.bloodGroup}
                onChange={(e) => setAppForm({ ...appForm, bloodGroup: e.target.value })}
              />
            </Field>
            <Field label="Grade / Class Applying" required>
              <Input
                required
                placeholder="e.g. Class 1, Class 9"
                value={appForm.gradeApplying}
                onChange={(e) => setAppForm({ ...appForm, gradeApplying: e.target.value })}
              />
            </Field>
          </div>

          <h4 className="font-semibold text-sm border-b pb-1 pt-2">2. Parent / Guardian Details</h4>
          <div className="form-grid">
            <Field label="Parent Full Name" required>
              <Input
                required
                value={appForm.parentName}
                onChange={(e) => setAppForm({ ...appForm, parentName: e.target.value })}
              />
            </Field>
            <Field label="Primary Mobile" required>
              <Input
                required
                type="tel"
                value={appForm.parentMobile}
                onChange={(e) => setAppForm({ ...appForm, parentMobile: e.target.value })}
              />
            </Field>
            <Field label="Email Address">
              <Input
                type="email"
                value={appForm.parentEmail}
                onChange={(e) => setAppForm({ ...appForm, parentEmail: e.target.value })}
              />
            </Field>
            <Field label="Occupation / Employer">
              <Input
                value={appForm.parentOccupation}
                onChange={(e) => setAppForm({ ...appForm, parentOccupation: e.target.value })}
              />
            </Field>
            <Field label="Residential Address" required>
              <Input
                required
                value={appForm.address}
                onChange={(e) => setAppForm({ ...appForm, address: e.target.value })}
              />
            </Field>
            <Field label="City">
              <Input
                value={appForm.city}
                onChange={(e) => setAppForm({ ...appForm, city: e.target.value })}
              />
            </Field>
          </div>

          <h4 className="font-semibold text-sm border-b pb-1 pt-2">3. Previous Education (Optional)</h4>
          <div className="form-grid">
            <Field label="Previous School Name">
              <Input
                value={appForm.previousSchool}
                onChange={(e) => setAppForm({ ...appForm, previousSchool: e.target.value })}
              />
            </Field>
            <Field label="Board / Curriculum">
              <Input
                placeholder="CBSE / ICSE / State Board"
                value={appForm.previousBoard}
                onChange={(e) => setAppForm({ ...appForm, previousBoard: e.target.value })}
              />
            </Field>
            <Field label="Last Marks / Percentage">
              <Input
                placeholder="e.g. 88%"
                value={appForm.previousPercentage}
                onChange={(e) => setAppForm({ ...appForm, previousPercentage: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </FormDialog>

      {/* SCHEDULE & EVALUATE INTERVIEW MODAL */}
      <FormDialog
        open={!!interviewDialog}
        onClose={() => setInterviewDialog(null)}
        title={`Interview & Evaluation · ${interviewDialog?.student_name}`}
        description="Schedule entrance examination or enter interview evaluation score and feedback."
        busy={busy}
        onSubmit={handleSaveInterview}
      >
        <div className="form-grid">
          <Field label="Date & Time" required>
            <Input
              required
              type="datetime-local"
              value={interviewForm.scheduledDate}
              onChange={(e) => setInterviewForm({ ...interviewForm, scheduledDate: e.target.value })}
            />
          </Field>
          <Field label="Interview Mode">
            <Picker
              value={interviewForm.interviewMode}
              onChange={(v) => setInterviewForm({ ...interviewForm, interviewMode: v })}
              options={[
                { value: "In-Person", label: "In-Person Campus Interview" },
                { value: "Online", label: "Online Video Assessment" },
                { value: "Written-Exam", label: "Written Entrance Examination" },
              ]}
            />
          </Field>
          <Field label="Interviewer / Examiner Name" required>
            <Input
              required
              value={interviewForm.interviewerName}
              onChange={(e) => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
            />
          </Field>
          <Field label="Evaluation Status">
            <Picker
              value={interviewForm.status}
              onChange={(v) => setInterviewForm({ ...interviewForm, status: v })}
              options={[
                { value: "Scheduled", label: "Scheduled" },
                { value: "Completed", label: "Completed" },
                { value: "Absent", label: "Candidate Absent" },
                { value: "Cancelled", label: "Cancelled" },
              ]}
            />
          </Field>
          <Field label="Score (0-100)">
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="e.g. 85"
              value={interviewForm.score}
              onChange={(e) => setInterviewForm({ ...interviewForm, score: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Interviewer Notes & Recommendation">
          <Input
            placeholder="Academic readiness, behavioral observation, special talents..."
            value={interviewForm.notes}
            onChange={(e) => setInterviewForm({ ...interviewForm, notes: e.target.value })}
          />
        </Field>
      </FormDialog>

      {/* ENROLL STUDENT MODAL */}
      <FormDialog
        open={!!enrollDialog}
        onClose={() => setEnrollDialog(null)}
        title={`Complete Enrollment · ${enrollDialog?.student_name}`}
        description="Promote application to full student record with auto-generated Student ID, Class, Section, and Parent access."
        busy={busy}
        onSubmit={handleEnrollStudent}
      >
        <div className="form-grid">
          <Field label="Assign Class" required>
            <Picker
              value={enrollForm.classId}
              onChange={(v) => {
                const matchingSection = boot.sections.find((s: Row) => s.class_id === v);
                setEnrollForm({
                  ...enrollForm,
                  classId: v,
                  sectionId: matchingSection?.id || enrollForm.sectionId,
                });
              }}
              options={boot.classes.map((c: Row) => ({
                value: c.id,
                label: c.name,
              }))}
            />
          </Field>
          <Field label="Assign Section" required>
            <Picker
              value={enrollForm.sectionId}
              onChange={(v) => setEnrollForm({ ...enrollForm, sectionId: v })}
              options={boot.sections
                .filter((s: Row) => !enrollForm.classId || s.class_id === enrollForm.classId)
                .map((s: Row) => ({
                  value: s.id,
                  label: `${s.name} (${s.class_name || ""})`,
                }))}
            />
          </Field>
          <Field label="Roll Number">
            <Input
              placeholder="Optional roll number"
              value={enrollForm.rollNumber}
              onChange={(e) => setEnrollForm({ ...enrollForm, rollNumber: e.target.value })}
            />
          </Field>
          <Field label="Admission Date" required>
            <Input
              required
              type="date"
              value={enrollForm.admissionDate}
              onChange={(e) => setEnrollForm({ ...enrollForm, admissionDate: e.target.value })}
            />
          </Field>
        </div>
        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground mt-2">
          <strong>Auto-provisioning:</strong> Enrolling this candidate will automatically generate a unique admission number, create the student profile, link the parent record, establish the academic enrollment, and generate an audit history log entry.
        </div>
      </FormDialog>

      {/* APPLICATION DETAILS & DOCUMENT VERIFICATION SHEET / MODAL */}
      {selectedApp && (
        <FormDialog
          open={!!selectedApp}
          onClose={() => setSelectedApp(null)}
          title={`Application Details · ${selectedApp.application_number}`}
          description={`${selectedApp.student_name} · Grade: ${selectedApp.grade_applying}`}
          wide
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/40 p-4 rounded-lg">
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <div className="mt-1"><Status value={selectedApp.status} /></div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Date of Birth</span>
                <div className="font-medium text-sm mt-1">{selectedApp.dob || "—"}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Gender</span>
                <div className="font-medium text-sm mt-1">{selectedApp.gender || "—"}</div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Blood Group</span>
                <div className="font-medium text-sm mt-1">{selectedApp.blood_group || "—"}</div>
              </div>
            </div>

            <div className="border rounded-md p-4 space-y-2">
              <h4 className="font-medium text-sm text-foreground">Parent & Contact Details</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <div><span className="text-muted-foreground">Parent:</span> {selectedApp.parent_name}</div>
                <div><span className="text-muted-foreground">Mobile:</span> {selectedApp.parent_mobile}</div>
                <div><span className="text-muted-foreground">Email:</span> {selectedApp.parent_email || "—"}</div>
                <div><span className="text-muted-foreground">Occupation:</span> {selectedApp.parent_occupation || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {selectedApp.address || "—"}, {selectedApp.city || ""} {selectedApp.state || ""}</div>
              </div>
            </div>

            <div className="border rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm text-foreground">Verified Documents & Proofs</h4>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDocDialog(selectedApp);
                    }}
                  >
                    <Plus size={14} /> Attach Document
                  </Button>
                )}
              </div>
              {selectedApp.documents && selectedApp.documents.length > 0 ? (
                <div className="space-y-2">
                  {selectedApp.documents.map((doc: Row) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2 rounded bg-background border text-sm"
                    >
                      <div>
                        <strong>{doc.document_type}</strong>
                        {doc.document_name && <span className="ml-2 text-xs text-muted-foreground">{doc.document_name}</span>}
                        <div className="text-xs text-muted-foreground">
                          Status: <Badge variant="outline">{doc.verification_status}</Badge>
                          {doc.verified_at && ` · Verified on ${doc.verified_at.slice(0, 10)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManage && doc.verification_status !== "Verified" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleVerifyDocument(doc.id, "Verified")}
                          >
                            <CheckCircle2 size={16} /> Verify
                          </Button>
                        )}
                        {canManage && doc.verification_status !== "Rejected" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleVerifyDocument(doc.id, "Rejected")}
                          >
                            <XCircle size={16} /> Reject
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground py-2">No documents attached yet.</div>
              )}
            </div>

            {selectedApp.interview_status && (
              <div className="border rounded-md p-4 space-y-2">
                <h4 className="font-medium text-sm text-foreground">Interview Evaluation</h4>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Status:</span> {selectedApp.interview_status}</div>
                  <div><span className="text-muted-foreground">Score:</span> {selectedApp.interview_score ?? "—"}/100</div>
                  <div><span className="text-muted-foreground">Examiner:</span> {selectedApp.interviewer_name || "—"}</div>
                </div>
                {selectedApp.interview_notes && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Notes: {selectedApp.interview_notes}
                  </div>
                )}
              </div>
            )}
          </div>
        </FormDialog>
      )}

      {/* ATTACH DOCUMENT MODAL */}
      <FormDialog
        open={!!docDialog}
        onClose={() => setDocDialog(null)}
        title="Attach Verification Document"
        description="Upload or link applicant certificate, marksheet, or identity proof."
        busy={busy}
        onSubmit={handleAddDocument}
      >
        <div className="form-grid">
          <Field label="Document Type" required>
            <Picker
              value={docForm.documentType}
              onChange={(v) => setDocForm({ ...docForm, documentType: v })}
              options={[
                { value: "Birth Certificate", label: "Birth Certificate" },
                { value: "Transfer Certificate", label: "Previous School Transfer Certificate (TC)" },
                { value: "Marksheet", label: "Previous Academic Marksheet" },
                { value: "Address Proof", label: "Address Proof / Utility Bill" },
                { value: "Photo", label: "Student Passport Photograph" },
                { value: "Parent ID", label: "Parent Identity Document" },
              ]}
            />
          </Field>
          <Field label="File / Reference Name">
            <Input
              placeholder="e.g. TC_2025_001.pdf"
              value={docForm.documentName}
              onChange={(e) => setDocForm({ ...docForm, documentName: e.target.value })}
            />
          </Field>
          <Field label="Document File URL" required>
            <Input
              required
              value={docForm.fileUrl}
              onChange={(e) => setDocForm({ ...docForm, fileUrl: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>
    </>
  );
}
