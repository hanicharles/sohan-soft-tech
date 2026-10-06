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
  ExportButton,
  Failure,
  Field,
  FormDialog,
  Input,
  PageHead,
  Picker,
  SearchBox,
  Status,
  StudentCell,
  downloadDocument,
  money,
} from "@/components/campus/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Download, Plus, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PaymentDialog } from "./PaymentDialog";
export function Registers({
  kind,
  collectOnOpen = false,
}: {
  kind: string;
  collectOnOpen?: boolean;
}) {
  const { query, t, admin, collect, can, request, refresh, institutionId } =
      useApp("fees.invoice"),
    router = useRouter(),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [pay, setPay] = useState(collect && collectOnOpen),
    [refund, setRefund] = useState(false),
    [approval, setApproval] = useState<Row | null>(null),
    [clearPayment, setClearPayment] = useState<Row | null>(null),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [payments, setPayments] = useState<Row[]>([]),
    [paymentId, setPaymentId] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [method, setMethod] = useState("Bank Transfer"),
    [refundKey, setRefundKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const r = useResource(
      kind +
        "?" +
        query({ q: search, page: String(page), size: "100", status }),
    ),
    d = r.data;
  const title = t(
      kind === "payments"
        ? "Payments"
        : kind === "receipts"
          ? "Receipts"
          : kind === "refunds"
            ? "Refunds"
            : "Invoices",
    ),
    description = t(
      kind === "payments"
        ? "PaymentIntro"
        : kind === "receipts"
          ? "ReceiptIntro"
          : kind === "refunds"
            ? "RefundIntro"
            : "InvoiceIntro",
    );
  const doc = (docKind: string, id: string, print = false) =>
    downloadDocument(docKind, id, institutionId, print).catch((e) =>
      toast.error(e.message),
    );
  let columns: any[] = [
    {
      key: "student",
      label: "Student",
      render: (r: Row) => (
        <StudentCell
          row={r}
          onClick={() => router.push("/students/" + r.student_id)}
        />
      ),
    },
  ];
  if (kind === "invoices")
    columns = [
      { key: "number", label: "Invoice number" },
      ...columns,
      { key: "issued_date", label: "Invoice date" },
      { key: "due_date", label: "Due date" },
      {
        key: "total_paise",
        label: "Total",
        align: "right",
        render: (r: Row) => money(r.total_paise),
      },
      {
        key: "paid_paise",
        label: "Paid",
        align: "right",
        render: (r: Row) => money(r.paid_paise),
      },
      {
        key: "outstanding_paise",
        label: "Balance",
        align: "right",
        render: (r: Row) => <b>{money(r.outstanding_paise)}</b>,
      },
      {
        key: "status",
        label: "Status",
        render: (r: Row) => <Status value={r.status} />,
      },
      {
        key: "actions",
        label: "",
        render: (r: Row) => (
          <div className="inline-actions">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => doc("invoice", r.id)}
              aria-label="Download invoice"
            >
              <Download size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => doc("invoice", r.id, true)}
              aria-label="Print invoice"
            >
              <Printer size={16} />
            </Button>
          </div>
        ),
      },
    ];
  if (kind === "payments")
    columns = [
      ...columns,
      {
        key: "paid_at",
        label: "Date",
        render: (r: Row) => r.paid_at.slice(0, 10),
      },
      { key: "method", label: "Method" },
      {
        key: "reference",
        label: "Reference",
        render: (r: Row) => (
          <span className="reference-text">
            {r.reference || r.gateway_transaction_id || "—"}
          </span>
        ),
      },
      {
        key: "amount_paise",
        label: "Amount",
        align: "right",
        render: (r: Row) => (
          <div>
            <strong>{money(r.amount_paise)}</strong>
            {r.refunded_paise > 0 && (
              <small className="cell-sub">
                {money(r.refunded_paise)} refunded
              </small>
            )}
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (r: Row) => (
          <Status
            value={
              r.refunded_paise >= r.amount_paise
                ? "Refunded"
                : r.refunded_paise > 0
                  ? "Partially Refunded"
                  : r.status
            }
          />
        ),
      },
      {
        key: "actions",
        label: "",
        render: (r: Row) =>
          r.status === "Pending" && can("payments.manage") ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setClearPayment(r);
                setReference(r.reference || "");
                setConfirmed(false);
              }}
            >
              <CheckCircle2 size={15} />
              Clear cheque
            </Button>
          ) : r.receipt_id ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => doc("receipt", r.receipt_id)}
            >
              <Download size={15} />
              Receipt
            </Button>
          ) : null,
      },
    ];
  if (kind === "receipts")
    columns = [
      { key: "number", label: "Receipt number" },
      ...columns,
      {
        key: "paid_at",
        label: "Date",
        render: (r: Row) => r.paid_at.slice(0, 10),
      },
      { key: "method", label: "Method" },
      {
        key: "amount_paise",
        label: "Amount",
        align: "right",
        render: (r: Row) => money(r.amount_paise),
      },
      {
        key: "actions",
        label: "",
        render: (r: Row) => (
          <div className="inline-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => doc("receipt", r.id)}
            >
              <Download size={15} />
              PDF
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => doc("receipt", r.id, true)}
              aria-label="Print receipt"
            >
              <Printer size={15} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadDocument(
                  "receipt",
                  r.id,
                  institutionId,
                  true,
                  "thermal",
                ).catch((e) => toast.error(e.message))
              }
            >
              80mm
            </Button>
          </div>
        ),
      },
    ];
  if (kind === "refunds")
    columns = [
      ...columns,
      {
        key: "created_at",
        label: "Requested",
        render: (r: Row) => r.created_at.slice(0, 10),
      },
      { key: "reason", label: "Reason" },
      { key: "method", label: "Method" },
      {
        key: "amount_paise",
        label: "Amount",
        align: "right",
        render: (r: Row) => money(r.amount_paise),
      },
      {
        key: "status",
        label: "Status",
        render: (r: Row) => <Status value={r.status} />,
      },
      {
        key: "actions",
        label: "",
        render: (r: Row) =>
          r.status === "Requested" && can("refunds.approve") ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setApproval(r);
                setReference("");
                setConfirmed(false);
              }}
            >
              Review refund
            </Button>
          ) : (
            r.reference || "—"
          ),
      },
    ];
  return (
    <>
      <PageHead
        eyebrow={"FINANCE / " + title.toUpperCase()}
        title={title}
        description={description}
        actions={
          <>
            <ExportButton
              report={
                kind === "invoices"
                  ? "outstanding"
                  : kind === "receipts"
                    ? "receipts"
                    : kind === "refunds"
                      ? "refunds"
                      : "collections"
              }
            />
            {kind === "payments" && collect && (
              <Button onClick={() => setPay(true)}>
                <Plus size={16} />
                Collect fee
              </Button>
            )}
            {kind === "invoices" && admin && (
              <Button onClick={() => router.push("/students")}>
                <Plus size={16} />
                Generate invoices
              </Button>
            )}
            {kind === "refunds" && can("refunds.request") && (
              <Button
                onClick={async () => {
                  try {
                    const data = await request(
                      "payments?" +
                        query({ size: "100", status: "Successful" }),
                    );
                    setPayments(data.rows);
                    setPaymentId("");
                    setAmount("");
                    setReason("");
                    setRefund(true);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Plus size={16} />
                Request refund
              </Button>
            )}
          </>
        }
      />
      <Card>
        <div className="table-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder={
              "Search student, admission or " +
              (kind === "invoices"
                ? "invoice"
                : kind === "receipts"
                  ? "receipt"
                  : "transaction")
            }
          />
          {["payments", "invoices", "refunds"].includes(kind) && (
            <Picker
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={[
                { value: "", label: "All statuses" },
                ...(kind === "payments"
                  ? [
                      "Successful",
                      "Pending",
                      "Initiated",
                      "Processing",
                      "Failed",
                      "Cancelled",
                    ]
                  : kind === "invoices"
                    ? ["Paid", "Partial", "Overdue", "Unpaid"]
                    : ["Requested", "Processed", "Rejected"]
                ).map((v) => ({ value: v, label: v })),
              ]}
            />
          )}
          <span className="record-count">{d?.total || 0} records</span>
        </div>
        {r.error ? (
          <Failure message={r.error} retry={r.retry} />
        ) : (
          <DataTable
            virtualized
            rows={d?.rows || []}
            columns={columns}
            loading={r.loading}
            total={d?.total}
            size={100}
            page={page}
            onPage={setPage}
          />
        )}
      </Card>
      <PaymentDialog open={pay} onClose={() => setPay(false)} />
      <FormDialog
        open={refund}
        onClose={() => setRefund(false)}
        title="Request refund"
        description="Refunds require institution-admin authorization and a return reference."
        busy={busy}
        submitLabel="Request refund"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("refunds", {
              method: "POST",
              body: {
                paymentId,
                amount,
                reason,
                method,
                idempotencyKey: refundKey,
              },
            });
            toast.success("Refund request created.");
            setRefund(false);
            setRefundKey(crypto.randomUUID());
            refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Original successful payment">
          <Picker
            value={paymentId}
            onChange={setPaymentId}
            options={[
              { value: "", label: "Choose payment" },
              ...payments
                .filter((p) => !p.gateway)
                .map((p) => ({
                  value: p.id,
                  label:
                    p.student_name +
                    " · " +
                    money(p.amount_paise) +
                    " · " +
                    p.paid_at.slice(0, 10),
                })),
            ]}
          />
        </Field>
        <Field label="Refund amount (₹)">
          <Input
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Refund method">
          <Picker
            value={method}
            onChange={setMethod}
            options={["Cash", "UPI", "Bank Transfer", "Cheque"].map((v) => ({
              value: v,
              label: v,
            }))}
          />
        </Field>
        <Field label="Reason">
          <Input
            required
            minLength={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </FormDialog>
      <FormDialog
        open={!!approval}
        onClose={() => setApproval(null)}
        title="Review refund"
        description={
          approval?.student_name +
          " · " +
          money(approval?.amount_paise) +
          " · " +
          approval?.reason
        }
        busy={busy}
        submitLabel="Confirm refund returned"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!confirmed) {
            toast.error("Confirm the money has been returned.");
            return;
          }
          setBusy(true);
          try {
            await request("refunds/" + approval!.id + "/approve", {
              method: "POST",
              body: { reference },
            });
            toast.success("Refund posted. Balances and ledger updated.");
            refresh();
            setApproval(null);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Refund transaction reference">
          <Input
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <label className="checkbox-field">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
          />
          <span>
            I authorize this refund and confirm the money has been returned.
          </span>
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await request("refunds/" + approval!.id + "/reject", {
                method: "POST",
                body: {},
              });
              toast.success("Refund rejected.");
              setApproval(null);
              refresh();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Reject refund
        </Button>
      </FormDialog>
      <FormDialog
        open={!!clearPayment}
        onClose={() => setClearPayment(null)}
        title="Confirm cheque clearance"
        description={
          clearPayment?.student_name + " · " + money(clearPayment?.amount_paise)
        }
        busy={busy}
        submitLabel="Confirm & issue receipt"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!confirmed) {
            toast.error("Confirm that your bank has cleared the cheque.");
            return;
          }
          setBusy(true);
          try {
            await request("payments/" + clearPayment!.id + "/confirm", {
              method: "POST",
              body: { reference },
            });
            toast.success("Payment confirmed and receipt generated.");
            refresh();
            setClearPayment(null);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Bank / cheque reference">
          <Input
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <label className="checkbox-field">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
          />
          <span>
            The cheque has cleared and funds are in the institution’s account.
          </span>
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await request("payments/" + clearPayment!.id + "/cancel", {
                method: "POST",
                body: {},
              });
              toast.success("Pending cheque cancelled.");
              refresh();
              setClearPayment(null);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Cancel uncleared cheque
        </Button>
      </FormDialog>
    </>
  );
}
