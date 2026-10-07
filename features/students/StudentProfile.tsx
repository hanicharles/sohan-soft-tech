"use client";
import {
  Row,
  useApp,
  useResource,
  useCampusRouter as useRouter,
} from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  downloadDocument,
  Failure,
  Field,
  FormDialog,
  Initials,
  Input,
  Loading,
  money,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignDialog } from "@/features/fees/AssignDialog";
import { PaymentDialog } from "@/features/payments/PaymentDialog";
import { Phone, Plus, ShieldCheck, UserRound } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { ParentAccess } from "./ParentAccess";
import { StudentLifecycleAndAcademics } from "./StudentLifecycleAndAcademics";
import { TaxEvidence } from "./TaxEvidence";
const FeeHistory = lazy(() => import("./FeeHistory"));
const Documents = lazy(() => import("./Documents"));
const GuardianInfo = lazy(() => import("./GuardianInfo"));
export function StudentProfile({
  id,
  portal = false,
}: {
  id: string;
  portal?: boolean;
}) {
  const {
      request,
      query,
      scope,
      refresh,
      admin,
      can,
      collect,
      finance,
      institutionId,
      t,
      boot,
    } = useApp("fees.manage"),
    router = useRouter(),
    r = useResource("students/" + id + "?" + query()),
    [pay, setPay] = useState(false),
    [assign, setAssign] = useState(false),
    [adjust, setAdjust] = useState(false),
    [details, setDetails] = useState(false),
    [due, setDue] = useState(false),
    [clearance, setClearance] = useState(false),
    [studentStatus, setStudentStatus] = useState("Active"),
    [busy, setBusy] = useState(false),
    [parents, setParents] = useState<Row[]>([]),
    [parentId, setParentId] = useState("");
  const [d, setD] = useState<Row>({
    installmentId: "",
    kind: "Concession",
    amount: "",
    direction: "Credit",
    reason: "",
    componentId: "",
    benefitId: "",
    dueDate: "",
  });
  const studentRecord = r.data?.student || {};
  const lifecycle = StudentLifecycleAndAcademics({
    studentId: id,
    student: studentRecord,
    onRefresh: refresh,
  });
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  const data = r.data,
    s = data?.student;
  if (!s) return null;
  const installments = data.installments || [],
    invoices = data.invoices || [],
    payments = data.payments || [];
  const download = (kind: string, id: string, print = false, format = "a4") =>
    downloadDocument(kind, id, institutionId, print, format).catch((e) =>
      toast.error(e.message),
    );
  if (!finance)
    return (
      <>
        <PageHead
          title={s.name}
          description={
            s.class_name + " " + s.section_name + " · " + s.admission_number
          }
        />
        <Card title="Student details">
          <div className="summary-lines">
            {[
              ["Name", s.name],
              ["Date of birth", s.dob],
              ["Guardian", s.parent_name],
              ["Mobile", s.mobile],
              ["Admission number", s.admission_number],
              ["Status", s.status],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <b>{value || "—"}</b>
              </div>
            ))}
          </div>
        </Card>
      </>
    );
  const creditColumns = [
    {
      key: "created_at",
      label: "Date",
      render: (r: Row) => r.created_at.slice(0, 10),
    },
    { key: "kind", label: "Type" },
    { key: "reason", label: "Reason" },
    { key: "approved_by", label: "Approved by" },
    {
      key: "amount_paise",
      label: "Amount",
      align: "right" as const,
      render: (r: Row) => money(Math.abs(r.amount_paise), true),
    },
  ];
  return (
    <>
      <PageHead
        eyebrow="WORKSPACE / STUDENTS / FEE PROFILE"
        title="Student fee profile"
        actions={
          <>
            <Button variant="outline" onClick={() => setDetails(true)}>
              <UserRound size={16} />
              Student details
            </Button>
            {s.parent_id && can("students.manage") && (
              <ParentAccess parentId={s.parent_id} />
            )}
            {s.parent_id && can("settings.manage") && (
              <TaxEvidence parentId={s.parent_id} payments={payments} />
            )}
            {can("fees.invoice") && (
              <Button variant="outline" onClick={() => setAssign(true)}>
                <Plus size={16} />
                Assign fees
              </Button>
            )}
            {collect && !portal && (
              <Button onClick={() => setPay(true)}>
                <Plus size={16} />
                Collect fee
              </Button>
            )}
          </>
        }
      />
      <Card className="profile-header">
        <div className="profile-identity">
          {s.photo_key ? (
            <img
              src={"/api/campus/" + boot.institution.slug + "/uploads/" + s.id}
              alt={s.name}
              className="profile-photo"
            />
          ) : (
            <Initials name={s.name} className="large" />
          )}
          <div>
            <div className="profile-name">
              <h2>{s.name}</h2>
              <Status value={s.status} />
            </div>
            <p>
              {s.admission_number} <span>•</span> {s.class_name}{" "}
              {s.section_name}
              {s.stream_name ? " · " + s.stream_name : ""} <span>•</span>{" "}
              {s.academic_year}
            </p>
            <div className="profile-contact">
              <span>
                <UserRound size={14} />
                {s.parent_name || "No guardian linked"}
              </span>
              <span>
                <Phone size={14} />
                {s.mobile || "—"}
              </span>
            </div>
          </div>
        </div>
      </Card>
      <div className="profile-kpis">
        {[
          { label: "Total fee", value: s.total_paise },
          { label: "Paid", value: s.paid_paise, color: "teal" },
          { label: "Outstanding", value: s.outstanding_paise, color: "indigo" },
          { label: "Overdue", value: s.overdue_paise, color: "red" },
        ].map((k) => (
          <Card key={k.label} className={"profile-kpi " + (k.color || "")}>
            <span>{k.label}</span>
            <strong>{money(k.value)}</strong>
          </Card>
        ))}
      </div>
      <Tabs defaultValue="overview" className="profile-tabs">
        <div className="profile-tab-scroll">
          <TabsList variant="line">
            {[
              "Overview",
              "Fee structure",
              "Installments",
              "Payments",
              "Ledger",
              "Invoices",
              "Receipts",
              "Discounts",
              "Scholarships",
              "Notifications",
              "Guardian",
              "Emergency",
              "Academics",
              "LMS",
              "Transfer & Status",
              "Timeline",
            ].map((name) => (
              <TabsTrigger
                key={name}
                value={name.toLowerCase().replace(" ", "-")}
              >
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="guardian">
          <Card title="Guardian contact">
            <Suspense fallback={<Loading />}>
              <GuardianInfo student={s} />
            </Suspense>
          </Card>
        </TabsContent>
        <TabsContent value="overview">
          <div className="profile-overview-grid">
            <Card
              title="Installment schedule"
              action={
                admin && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setD({ ...d, installmentId: installments[0]?.id || "" });
                      setAdjust(true);
                    }}
                  >
                    Fee adjustment
                  </Button>
                )
              }
            >
              <DataTable
                rows={installments}
                columns={[
                  { key: "title", label: "Installment" },
                  { key: "due_date", label: "Due date" },
                  {
                    key: "total_paise",
                    label: "Amount",
                    align: "right",
                    render: (r) => money(r.total_paise),
                  },
                  {
                    key: "paid_paise",
                    label: "Paid",
                    align: "right",
                    render: (r) => money(r.paid_paise),
                  },
                  {
                    key: "outstanding_paise",
                    label: "Balance",
                    align: "right",
                    render: (r) => <b>{money(r.outstanding_paise)}</b>,
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => <Status value={r.status} />,
                  },
                ]}
              />
            </Card>
            <Card title="Account summary">
              <div className="summary-lines">
                <div>
                  <span>Academic year</span>
                  <b>{s.academic_year}</b>
                </div>
                <div>
                  <span>Annual fees</span>
                  <b>{money(s.total_paise)}</b>
                </div>
                <div>
                  <span>Discounts</span>
                  <b>
                    {money(
                      invoices.reduce(
                        (a: number, i: Row) => a + i.discount_paise,
                        0,
                      ),
                    )}
                  </b>
                </div>
                <div>
                  <span>Scholarships</span>
                  <b>
                    {money(
                      invoices.reduce(
                        (a: number, i: Row) => a + i.scholarship_paise,
                        0,
                      ),
                    )}
                  </b>
                </div>
                <div>
                  <span>Next installment due</span>
                  <b>{s.next_due_date || "All paid"}</b>
                </div>
                <div>
                  <span>Financial clearance</span>
                  <Status value={s.clearance} />
                </div>
              </div>
              {admin && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setClearance(true)}
                >
                  <ShieldCheck size={16} />
                  Mark financial clearance
                </Button>
              )}
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="fee-structure">
          <Card title="Assigned fee components">
            <DataTable
              rows={data.items || []}
              columns={[
                { key: "name", label: "Fee component" },
                {
                  key: "amount_paise",
                  label: "Gross fee",
                  align: "right",
                  render: (r) => money(r.amount_paise, true),
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="installments">
          <Card
            title="Installments"
            action={
              admin && (
                <div className="inline-actions">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setD({
                        ...d,
                        installmentId: installments[0]?.id || "",
                        dueDate: installments[0]?.due_date || "",
                      });
                      setDue(true);
                    }}
                  >
                    Change due date
                  </Button>
                  <Button
                    onClick={() => {
                      setD({ ...d, installmentId: installments[0]?.id || "" });
                      setAdjust(true);
                    }}
                  >
                    Adjust fee
                  </Button>
                </div>
              )
            }
          >
            <DataTable
              rows={installments}
              columns={[
                { key: "title", label: "Installment" },
                { key: "due_date", label: "Due date" },
                {
                  key: "amount_paise",
                  label: "Base fee",
                  align: "right",
                  render: (r) => money(r.amount_paise),
                },
                {
                  key: "adjustment_paise",
                  label: "Adjustments",
                  align: "right",
                  render: (r) => money(r.adjustment_paise),
                },
                {
                  key: "paid_paise",
                  label: "Paid",
                  align: "right",
                  render: (r) => money(r.paid_paise),
                },
                {
                  key: "outstanding_paise",
                  label: "Pending",
                  align: "right",
                  render: (r) => <strong>{money(r.outstanding_paise)}</strong>,
                },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <Status value={r.status} />,
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="payments">
          <Suspense fallback={<Loading />}>
            <FeeHistory
              view="payments"
              id={id}
              data={data}
              payments={payments}
              invoices={invoices}
              download={download}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="ledger">
          <Suspense fallback={<Loading />}>
            <FeeHistory
              view="ledger"
              id={id}
              data={data}
              payments={payments}
              invoices={invoices}
              download={download}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="invoices">
          <Suspense fallback={<Loading />}>
            <Documents
              view="invoices"
              id={id}
              data={data}
              payments={payments}
              invoices={invoices}
              download={download}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="receipts">
          <Suspense fallback={<Loading />}>
            <Documents
              view="receipts"
              id={id}
              data={data}
              payments={payments}
              invoices={invoices}
              download={download}
            />
          </Suspense>
        </TabsContent>
        {["discounts", "scholarships"].map((kind) => (
          <TabsContent key={kind} value={kind}>
            <Card
              title={
                kind === "discounts"
                  ? "Discounts & concessions"
                  : "Scholarships"
              }
              action={
                admin && (
                  <Button
                    onClick={() => {
                      setD({
                        ...d,
                        kind: kind === "discounts" ? "Discount" : "Scholarship",
                        installmentId:
                          installments.find((i: Row) => i.outstanding_paise > 0)
                            ?.id || "",
                      });
                      setAdjust(true);
                    }}
                  >
                    <Plus size={15} />
                    Apply benefit
                  </Button>
                )
              }
            >
              <DataTable
                rows={[
                  ...invoices
                    .filter((i: Row) =>
                      kind === "discounts"
                        ? i.discount_paise > 0
                        : i.scholarship_paise > 0,
                    )
                    .map((i: Row) => ({
                      id: i.id,
                      created_at: i.created_at,
                      kind: kind === "discounts" ? "Discount" : "Scholarship",
                      reason: "Approved at fee assignment",
                      approved_by: i.created_by,
                      amount_paise:
                        kind === "discounts"
                          ? i.discount_paise
                          : i.scholarship_paise,
                    })),
                  ...data.adjustments.filter((a: Row) =>
                    kind === "discounts"
                      ? ["Discount", "Concession", "Waiver"].includes(a.kind)
                      : a.kind === "Scholarship",
                  ),
                ]}
                columns={creditColumns}
              />
            </Card>
          </TabsContent>
        ))}
        <TabsContent value="notifications">
          <Card title="Notification history">
            <DataTable
              rows={data.notifications || []}
              columns={[
                {
                  key: "created_at",
                  label: "Date",
                  render: (r) => r.created_at.slice(0, 10),
                },
                { key: "channel", label: "Channel" },
                { key: "message", label: "Message" },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <Status value={r.status} />,
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="emergency">
          {lifecycle.renderEmergencyTab()}
        </TabsContent>
        <TabsContent value="academics">
          {lifecycle.renderAcademicsTab()}
        </TabsContent>
        <TabsContent value="lms">
          {lifecycle.renderLmsTab()}
        </TabsContent>
        <TabsContent value="transfer-&-status">
          {lifecycle.renderLifecycleTab()}
        </TabsContent>
        <TabsContent value="timeline">
          {lifecycle.renderTimelineTab()}
        </TabsContent>
      </Tabs>
      {collect && (
        <PaymentDialog
          open={pay}
          onClose={() => setPay(false)}
          studentId={id}
        />
      )}{" "}
      {can("fees.invoice") && (
        <AssignDialog
          open={assign}
          onClose={() => setAssign(false)}
          studentId={id}
        />
      )}
      <FormDialog
        open={adjust}
        onClose={() => setAdjust(false)}
        title="Approve fee adjustment"
        description="An adjustment entry is added to the ledger. Original fees remain in the financial history."
        busy={busy}
        submitLabel="Approve adjustment"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("fees/adjust", {
              method: "POST",
              body: Object.fromEntries(
                Object.entries(d).filter(
                  ([k, v]) => v !== "" && k !== "dueDate",
                ),
              ),
            });
            toast.success("Adjustment approved and posted to ledger.");
            refresh();
            setAdjust(false);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Installment">
          <Picker
            value={d.installmentId}
            onChange={(v) => setD({ ...d, installmentId: v })}
            options={[
              { value: "", label: "Choose installment" },
              ...installments.map((i: Row) => ({
                value: i.id,
                label: i.title + " · " + money(i.outstanding_paise) + " unpaid",
              })),
            ]}
          />
        </Field>
        <div className="form-grid">
          <Field label="Adjustment type">
            <Picker
              value={d.kind}
              onChange={(v) =>
                setD({
                  ...d,
                  kind: v,
                  direction: v === "Late Fee" ? "Debit" : "Credit",
                })
              }
              options={[
                "Discount",
                "Scholarship",
                "Concession",
                "Waiver",
                "Adjustment",
                "Late Fee",
              ].map((v) => ({ value: v, label: v }))}
            />
          </Field>
          <Field label="Amount (₹)">
            <Input
              required
              value={d.amount}
              onChange={(e) => setD({ ...d, amount: e.target.value })}
            />
          </Field>
          <Field label="Direction">
            <Picker
              value={d.direction}
              onChange={(v) => setD({ ...d, direction: v })}
              options={[
                { value: "Credit", label: "Reduce fee (credit)" },
                { value: "Debit", label: "Increase fee (debit)" },
              ]}
            />
          </Field>
          <Field label="Fee component (optional)">
            <Picker
              value={d.componentId}
              onChange={(v) => setD({ ...d, componentId: v })}
              options={[
                { value: "", label: "Whole installment" },
                ...boot.components.map((c: Row) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
            />
          </Field>
          <Field label="Approval reason" required className="span-2">
            <Input
              required
              minLength={3}
              value={d.reason}
              onChange={(e) => setD({ ...d, reason: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>
      <FormDialog
        open={due}
        onClose={() => setDue(false)}
        title="Change installment due date"
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("installments/" + d.installmentId, {
              method: "PATCH",
              body: { dueDate: d.dueDate, reason: d.reason },
            });
            toast.success("Due date updated and audited.");
            refresh();
            setDue(false);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Installment">
          <Picker
            value={d.installmentId}
            onChange={(v) =>
              setD({
                ...d,
                installmentId: v,
                dueDate:
                  installments.find((i: Row) => i.id === v)?.due_date || "",
              })
            }
            options={installments.map((i: Row) => ({
              value: i.id,
              label: i.title,
            }))}
          />
        </Field>
        <Field label="New due date">
          <Input
            type="date"
            required
            value={d.dueDate}
            onChange={(e) => setD({ ...d, dueDate: e.target.value })}
          />
        </Field>
        <Field label="Reason">
          <Input
            required
            minLength={3}
            value={d.reason}
            onChange={(e) => setD({ ...d, reason: e.target.value })}
          />
        </Field>
      </FormDialog>
      <Sheet open={details} onOpenChange={setDetails}>
        <SheetContent className="student-sheet">
          <SheetHeader>
            <SheetTitle>{s.name}</SheetTitle>
            <SheetDescription>Student and guardian details</SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <Suspense fallback={<Loading />}>
              <GuardianInfo student={s} />
            </Suspense>
            {can("students.manage") && (
              <>
                <Field label="Student photo">
                  <Input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        if (file.size > 1000000)
                          throw new Error("Photo must be under 1 MB.");
                        const bytes = new Uint8Array(await file.arrayBuffer());
                        await request("uploads", {
                          method: "POST",
                          body: {
                            studentId: id,
                            type: file.type,
                            content: btoa(
                              Array.from(bytes, (b) =>
                                String.fromCharCode(b),
                              ).join(""),
                            ),
                          },
                        });
                        toast.success("Photo updated.");
                        refresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  />
                </Field>
                <Field label="Student status">
                  <Picker
                    value={studentStatus}
                    onChange={setStudentStatus}
                    options={[
                      "Active",
                      "Inactive",
                      "Transferred",
                      "Graduated",
                      "Left",
                      "Suspended",
                    ].map((v) => ({ value: v, label: v }))}
                  />
                </Field>
                <Field label="Change reason">
                  <Input
                    value={d.reason}
                    onChange={(e) => setD({ ...d, reason: e.target.value })}
                  />
                </Field>
                <Button
                  onClick={async () => {
                    try {
                      await request("students/" + id, {
                        method: "PATCH",
                        body: { status: studentStatus, reason: d.reason },
                      });
                      refresh();
                      toast.success("Student status updated.");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Update status
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await request(
                        "parents?" + query({ size: "100" }),
                      );
                      setParents(result.rows);
                      setDetails(false);
                      setD({ ...d, kind: "Link guardian" });
                      setParentId("");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Link another guardian
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <FormDialog
        open={parents.length > 0}
        onClose={() => setParents([])}
        title="Link guardian"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await request("students/link-parent", {
              method: "POST",
              body: { studentId: id, parentId },
            });
            toast.success("Guardian linked to student.");
            setParents([]);
            refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <Field label="Existing guardian">
          <Picker
            value={parentId}
            onChange={setParentId}
            options={[
              { value: "", label: "Choose guardian" },
              ...parents.map((p) => ({
                value: p.id,
                label: p.guardian_name + " · " + p.mobile,
              })),
            ]}
          />
        </Field>
      </FormDialog>
      <AlertDialog open={clearance} onOpenChange={setClearance}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark financial clearance?</AlertDialogTitle>
            <AlertDialogDescription>
              Clearance is allowed only when the selected academic year has no
              outstanding fees. Historical records remain available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await request("students/" + id, {
                    method: "PATCH",
                    body: {
                      clearance: true,
                      yearId: s.academic_year_id,
                      reason: "Authorized financial clearance",
                    },
                  });
                  refresh();
                  toast.success("Financial clearance recorded.");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Confirm clearance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {lifecycle.renderDialogs()}
    </>
  );
}
