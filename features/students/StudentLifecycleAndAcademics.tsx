"use client";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Field,
  FormDialog,
  Input,
  Loading,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Archive,
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  FileText,
  History,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function StudentLifecycleAndAcademics({
  studentId,
  student,
  onRefresh,
}: {
  studentId: string;
  student: Row;
  onRefresh: () => void;
}) {
  const { request, can } = useApp();
  const [contacts, setContacts] = useState<Row[]>([]);
  const [exams, setExams] = useState<Row[]>([]);
  const [courses, setCourses] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [contactDialog, setContactDialog] = useState(false);
  const [tcDialog, setTcDialog] = useState(false);
  const [examDialog, setExamDialog] = useState(false);
  const [courseDialog, setCourseDialog] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form states
  const [contactForm, setContactForm] = useState({
    name: "",
    relationship: "Uncle",
    phone: "",
    alternatePhone: "",
    address: "",
    isPrimary: false,
  });

  const [tcForm, setTcForm] = useState({
    reason: "Parent Relocation",
    conductRating: "Excellent",
    remarks: "Cleared all school obligations and dues.",
  });

  const [examForm, setExamForm] = useState({
    examName: "Mid-Term Examination 2026",
    term: "Term 1",
    subject: "Mathematics",
    maxMarks: "100",
    marksObtained: "88",
    grade: "A",
    remarks: "Good problem solving skills",
  });

  const [courseForm, setCourseForm] = useState({
    courseCode: "CS101",
    courseName: "Foundations of Computer Science",
    teacherName: "Prof. Vikram Sharma",
  });

  const [newStatus, setNewStatus] = useState(student.status || "Active");

  const canManage = can("students.manage");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, eRes, coRes, hRes] = await Promise.all([
        request<{ contacts: Row[] }>(`students/${studentId}/emergency-contacts`),
        request<{ exams: Row[] }>(`students/${studentId}/exams`),
        request<{ courses: Row[] }>(`students/${studentId}/courses`),
        request<{ history: Row[] }>(`students/${studentId}/history`),
      ]);
      setContacts(cRes.contacts || []);
      setExams(eRes.exams || []);
      setCourses(coRes.courses || []);
      setHistory(hRes.history || []);
    } catch (e) {
      // silent or toast
    } finally {
      setLoading(false);
    }
  }, [request, studentId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Add Contact
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request(`students/${studentId}/emergency-contacts`, {
        method: "POST",
        body: contactForm,
      });
      toast.success("Emergency contact added.");
      setContactDialog(false);
      setContactForm({
        name: "",
        relationship: "Uncle",
        phone: "",
        alternatePhone: "",
        address: "",
        isPrimary: false,
      });
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Delete Contact
  const handleDeleteContact = async (id: string) => {
    try {
      await request(`students/${studentId}/emergency-contacts/${id}`, {
        method: "DELETE",
      });
      toast.success("Emergency contact removed.");
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Issue Transfer Certificate
  const handleIssueTC = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await request<{ tcNumber: string }>(`students/${studentId}/transfer`, {
        method: "POST",
        body: tcForm,
      });
      toast.success(`Transfer Certificate ${res.tcNumber} generated successfully.`);
      setTcDialog(false);
      onRefresh();
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Archive Student
  const handleArchive = async () => {
    try {
      await request(`students/${studentId}/archive`, {
        method: "POST",
        body: { reason: "Archived via student profile" },
      });
      toast.success("Student record archived.");
      onRefresh();
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Restore Student
  const handleRestore = async () => {
    try {
      await request(`students/${studentId}/restore`, {
        method: "POST",
        body: {},
      });
      toast.success("Student record restored to active.");
      onRefresh();
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Update Status
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request(`students/${studentId}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      toast.success(`Student status updated to ${newStatus}.`);
      setStatusDialog(false);
      onRefresh();
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Add Exam Result
  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request(`students/${studentId}/exams`, {
        method: "POST",
        body: {
          examName: examForm.examName,
          term: examForm.term,
          subject: examForm.subject,
          maxMarks: Number(examForm.maxMarks),
          marksObtained: Number(examForm.marksObtained),
          grade: examForm.grade,
          remarks: examForm.remarks,
        },
      });
      toast.success("Exam result recorded.");
      setExamDialog(false);
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Enroll in LMS Course
  const handleEnrollCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request(`students/${studentId}/courses`, {
        method: "POST",
        body: courseForm,
      });
      toast.success("Student enrolled in LMS course.");
      setCourseDialog(false);
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return {
    renderEmergencyTab: () => (
      <Card
        title="Emergency Contacts"
        action={
          canManage && (
            <Button size="sm" onClick={() => setContactDialog(true)}>
              <Plus size={15} /> Add Emergency Contact
            </Button>
          )
        }
      >
        <DataTable
          rows={contacts}
          columns={[
            {
              key: "name",
              label: "Contact Name",
              render: (m) => (
                <div>
                  <strong>{m.name}</strong>
                  {Boolean(m.is_primary) && <Badge className="ml-2 text-xs">Primary</Badge>}
                  <div className="text-xs text-muted-foreground">{m.relationship}</div>
                </div>
              ),
            },
            {
              key: "phone",
              label: "Phone Numbers",
              render: (m) => (
                <div>
                  <div>{m.phone}</div>
                  {m.alternate_phone && <small className="text-muted-foreground">Alt: {m.alternate_phone}</small>}
                </div>
              ),
            },
            { key: "address", label: "Address", render: (m) => m.address || "—" },
            {
              key: "actions",
              label: "",
              render: (m) =>
                canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDeleteContact(m.id)}
                  >
                    <Trash2 size={15} />
                  </Button>
                ),
            },
          ]}
        />
      </Card>
    ),

    renderLifecycleTab: () => (
      <div className="space-y-6">
        <Card title="Student Lifecycle & Status Management">
          <div className="flex flex-wrap items-center justify-between gap-4 p-2">
            <div>
              <div className="text-sm text-muted-foreground">Current Enrollment Status</div>
              <div className="text-xl font-semibold flex items-center gap-2 mt-1">
                <Status value={student.status} />
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setStatusDialog(true)}>
                  Change Status
                </Button>
                {student.status !== "Archived" ? (
                  <Button variant="outline" onClick={handleArchive}>
                    <Archive size={15} /> Archive Record
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleRestore}>
                    <RefreshCw size={15} /> Restore Record
                  </Button>
                )}
                {student.status !== "Transferred" && (
                  <Button onClick={() => setTcDialog(true)}>
                    <FileText size={15} /> Issue TC (Transfer)
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>

        {student.status === "Transferred" && (
          <Card title="Transfer Certificate Information">
            <div className="p-3 bg-muted/40 rounded-lg text-sm space-y-2">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <CheckCircle size={16} /> Official Transfer Certificate Issued
              </div>
              <div>Student has been formally transferred from this institution. Academic and fee clearance records are sealed.</div>
            </div>
          </Card>
        )}
      </div>
    ),

    renderAcademicsTab: () => (
      <Card
        title="Integrated Academic Exams & Evaluations"
        action={
          canManage && (
            <Button size="sm" onClick={() => setExamDialog(true)}>
              <Plus size={15} /> Add Exam Marks
            </Button>
          )
        }
      >
        <DataTable
          rows={exams}
          columns={[
            {
              key: "exam_name",
              label: "Exam / Assessment",
              render: (m) => (
                <div>
                  <strong>{m.exam_name}</strong>
                  <div className="text-xs text-muted-foreground">{m.term}</div>
                </div>
              ),
            },
            { key: "subject", label: "Subject" },
            {
              key: "marks",
              label: "Marks Obtained",
              render: (m) => (
                <div>
                  <strong className="text-primary">{m.marks_obtained}</strong> / {m.max_marks}
                </div>
              ),
            },
            {
              key: "grade",
              label: "Grade",
              render: (m) => <Badge variant="secondary">{m.grade || "—"}</Badge>,
            },
            { key: "remarks", label: "Remarks", render: (m) => m.remarks || "—" },
          ]}
        />
      </Card>
    ),

    renderLmsTab: () => (
      <Card
        title="LMS Courses & Learning Modules"
        action={
          canManage && (
            <Button size="sm" onClick={() => setCourseDialog(true)}>
              <Plus size={15} /> Enroll in Course
            </Button>
          )
        }
      >
        <DataTable
          rows={courses}
          columns={[
            {
              key: "course_name",
              label: "Course Title",
              render: (m) => (
                <div>
                  <strong>{m.course_name}</strong>
                  <div className="text-xs text-muted-foreground font-mono">{m.course_code}</div>
                </div>
              ),
            },
            { key: "teacher_name", label: "Instructor", render: (m) => m.teacher_name || "—" },
            {
              key: "progress_percent",
              label: "Progress",
              render: (m) => (
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${m.progress_percent || 0}%` }}
                    />
                  </div>
                  <span className="text-xs">{m.progress_percent || 0}%</span>
                </div>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (m) => <Status value={m.status || "Active"} />,
            },
          ]}
        />
      </Card>
    ),

    renderTimelineTab: () => (
      <Card title="Student Audit History & Lifecycle Timeline">
        <div className="space-y-3 p-2">
          {history.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No historical events recorded for this student yet.
            </div>
          ) : (
            history.map((h: Row) => (
              <div
                key={h.id}
                className="flex items-start gap-3 p-3 rounded border bg-card text-sm"
              >
                <div className="p-2 rounded-full bg-primary/10 text-primary mt-0.5">
                  <History size={16} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <strong>{h.event_type.replace(/_/g, " ")}</strong>
                    <span className="text-xs text-muted-foreground font-mono">
                      {h.created_at ? h.created_at.replace("T", " ").slice(0, 19) : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{h.description}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    ),

    renderDialogs: () => (
      <>
        {/* ADD EMERGENCY CONTACT DIALOG */}
        <FormDialog
          open={contactDialog}
          onClose={() => setContactDialog(false)}
          title="Add Emergency Contact"
          description="Provide details for emergency notification or alternate guardian."
          busy={busy}
          onSubmit={handleAddContact}
        >
          <div className="form-grid">
            <Field label="Full Name" required>
              <Input
                required
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
            </Field>
            <Field label="Relationship" required>
              <Picker
                value={contactForm.relationship}
                onChange={(v) => setContactForm({ ...contactForm, relationship: v })}
                options={[
                  { value: "Mother", label: "Mother" },
                  { value: "Father", label: "Father" },
                  { value: "Grandparent", label: "Grandparent" },
                  { value: "Uncle", label: "Uncle" },
                  { value: "Aunt", label: "Aunt" },
                  { value: "Sibling", label: "Sibling" },
                  { value: "Guardian", label: "Legal Guardian" },
                  { value: "Other", label: "Other" },
                ]}
              />
            </Field>
            <Field label="Primary Phone" required>
              <Input
                required
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              />
            </Field>
            <Field label="Alternate Phone">
              <Input
                type="tel"
                value={contactForm.alternatePhone}
                onChange={(e) => setContactForm({ ...contactForm, alternatePhone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Residential Address">
            <Input
              value={contactForm.address}
              onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer text-sm mt-2">
            <input
              type="checkbox"
              checked={contactForm.isPrimary}
              onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
            />
            <span>Set as Primary Emergency Contact</span>
          </label>
        </FormDialog>

        {/* ISSUE TC DIALOG */}
        <FormDialog
          open={tcDialog}
          onClose={() => setTcDialog(false)}
          title="Issue Transfer Certificate (TC)"
          description="Formally withdraw and transfer student. Generates official TC serial number."
          busy={busy}
          onSubmit={handleIssueTC}
        >
          <Field label="Reason for Leaving" required>
            <Input
              required
              value={tcForm.reason}
              onChange={(e) => setTcForm({ ...tcForm, reason: e.target.value })}
            />
          </Field>
          <Field label="Conduct / Behavioral Rating" required>
            <Picker
              value={tcForm.conductRating}
              onChange={(v) => setTcForm({ ...tcForm, conductRating: v })}
              options={[
                { value: "Excellent", label: "Excellent" },
                { value: "Very Good", label: "Very Good" },
                { value: "Good", label: "Good" },
                { value: "Satisfactory", label: "Satisfactory" },
              ]}
            />
          </Field>
          <Field label="Official Remarks">
            <Input
              value={tcForm.remarks}
              onChange={(e) => setTcForm({ ...tcForm, remarks: e.target.value })}
            />
          </Field>
        </FormDialog>

        {/* STATUS CHANGE DIALOG */}
        <FormDialog
          open={statusDialog}
          onClose={() => setStatusDialog(false)}
          title="Change Student Lifecycle Status"
          busy={busy}
          onSubmit={handleUpdateStatus}
        >
          <Field label="Enrollment Status" required>
            <Picker
              value={newStatus}
              onChange={setNewStatus}
              options={[
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
                { value: "Suspended", label: "Suspended" },
                { value: "Graduated", label: "Graduated / Alumni" },
                { value: "Transferred", label: "Transferred" },
                { value: "Archived", label: "Archived" },
              ]}
            />
          </Field>
        </FormDialog>

        {/* ADD EXAM RESULT DIALOG */}
        <FormDialog
          open={examDialog}
          onClose={() => setExamDialog(false)}
          title="Record Academic Exam Marks"
          busy={busy}
          onSubmit={handleAddExam}
        >
          <div className="form-grid">
            <Field label="Exam Name" required>
              <Input
                required
                value={examForm.examName}
                onChange={(e) => setExamForm({ ...examForm, examName: e.target.value })}
              />
            </Field>
            <Field label="Academic Term" required>
              <Input
                required
                value={examForm.term}
                onChange={(e) => setExamForm({ ...examForm, term: e.target.value })}
              />
            </Field>
            <Field label="Subject" required>
              <Input
                required
                value={examForm.subject}
                onChange={(e) => setExamForm({ ...examForm, subject: e.target.value })}
              />
            </Field>
            <Field label="Grade Awarded">
              <Input
                placeholder="e.g. A+, A, B"
                value={examForm.grade}
                onChange={(e) => setExamForm({ ...examForm, grade: e.target.value })}
              />
            </Field>
            <Field label="Maximum Marks" required>
              <Input
                required
                type="number"
                value={examForm.maxMarks}
                onChange={(e) => setExamForm({ ...examForm, maxMarks: e.target.value })}
              />
            </Field>
            <Field label="Marks Obtained" required>
              <Input
                required
                type="number"
                value={examForm.marksObtained}
                onChange={(e) => setExamForm({ ...examForm, marksObtained: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Teacher Remarks">
            <Input
              value={examForm.remarks}
              onChange={(e) => setExamForm({ ...examForm, remarks: e.target.value })}
            />
          </Field>
        </FormDialog>

        {/* ENROLL LMS COURSE DIALOG */}
        <FormDialog
          open={courseDialog}
          onClose={() => setCourseDialog(false)}
          title="Enroll in LMS Course"
          busy={busy}
          onSubmit={handleEnrollCourse}
        >
          <div className="form-grid">
            <Field label="Course Code" required>
              <Input
                required
                value={courseForm.courseCode}
                onChange={(e) => setCourseForm({ ...courseForm, courseCode: e.target.value })}
              />
            </Field>
            <Field label="Course Title" required>
              <Input
                required
                value={courseForm.courseName}
                onChange={(e) => setCourseForm({ ...courseForm, courseName: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Course Instructor / Teacher">
            <Input
              value={courseForm.teacherName}
              onChange={(e) => setCourseForm({ ...courseForm, teacherName: e.target.value })}
            />
          </Field>
        </FormDialog>
      </>
    ),
  };
}
