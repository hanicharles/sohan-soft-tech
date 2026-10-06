"use client";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Field,
  FormDialog,
  Initials,
  Input,
  Picker,
  downloadDocument,
  money,
} from "@/components/campus/ui";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { CheckCircle2, Download, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
export function PaymentDialog({
  open,
  onClose,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  studentId?: string;
}) {
  const { request, query, scope, refresh, institutionId } = useApp(),
    [q, setQ] = useState(""),
    [students, setStudents] = useState<Row[]>([]),
    [selected, setSelected] = useState(studentId || ""),
    [profile, setProfile] = useState<Row | null>(null),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState("UPI"),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState(""),
    [installment, setInstallment] = useState(""),
    [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<Row | null>(null),
    [key, setKey] = useState("");
  useEffect(() => {
    if (open) {
      setSelected(studentId || "");
      setReceipt(null);
      setProfile(null);
      setAmount("");
      setReference("");
      setNotes("");
      setInstallment("");
      setKey(crypto.randomUUID());
    }
  }, [open, studentId]);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () =>
        request("students?" + query({ q, size: "15" }), {
          signal: abort.signal,
        })
          .then((d) => setStudents(d.rows))
          .catch((e) => {
            if (e.name !== "AbortError") toast.error(e.message);
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [q, open, request, query]);
  useEffect(() => {
    if (!selected || !open) return;
    const abort = new AbortController();
    request("students/" + selected + "?" + query(), { signal: abort.signal })
      .then((d) => {
        setProfile(d);
        const next = d.installments.find((i: Row) => i.outstanding_paise > 0);
        setAmount(next ? (next.outstanding_paise / 100).toFixed(2) : "");
      })
      .catch((e) => {
        if (e.name !== "AbortError") toast.error(e.message);
      });
    return () => abort.abort();
  }, [selected, open, request, query]);
  const label = (s: Row) => s.name + " · " + s.admission_number;
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !profile) {
      toast.error("Choose a student first.");
      return;
    }
    setBusy(true);
    try {
      const data = await request("payments", {
        method: "POST",
        body: {
          studentId: selected,
          yearId: profile.student.academic_year_id,
          amount,
          method,
          reference: reference || undefined,
          notes,
          idempotencyKey: key,
          ...(installment
            ? { allocations: [{ installmentId: installment, amount }] }
            : {}),
        },
      });
      refresh();
      if (data.receipt) setReceipt(data.receipt);
      else {
        toast.success(
          "Cheque recorded. A receipt will be issued after clearance.",
        );
        onClose();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (receipt)
    return (
      <FormDialog
        mobileDrawer
        open={open}
        onClose={onClose}
        title="Payment collected"
        description="The payment, allocations, ledger and receipt have been recorded."
      >
        <div className="payment-success">
          <CheckCircle2 size={54} />
          <strong>{money(Number(amount) * 100, true)}</strong>
          <p>{receipt.number}</p>
          <span>
            {profile?.student.name} · {method}
          </span>
          <Button
            onClick={() =>
              downloadDocument("receipt", receipt.id, institutionId).catch(
                (e) => toast.error(e.message),
              )
            }
          >
            <Download size={16} />
            Download receipt
          </Button>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </FormDialog>
    );
  return (
    <FormDialog
      mobileDrawer
      open={open}
      onClose={onClose}
      title="Collect fee"
      description="Record a verified offline payment against the student’s installments."
      onSubmit={handleSubmit}
      submitLabel={
        method === "Cheque" ? "Record pending cheque" : "Collect payment"
      }
      busy={busy}
      wide
    >
      <div className="form-grid">
        <Field label="Student" required className="span-2">
          <Combobox
            items={students.map(label)}
            value={
              students.find((s) => s.id === selected)
                ? label(students.find((s) => s.id === selected)!)
                : null
            }
            onValueChange={(v: string | null) => {
              const student = students.find((s) => label(s) === v);
              if (student) setSelected(student.id);
            }}
            onInputValueChange={(v: string) => setQ(v)}
          >
            <ComboboxInput
              placeholder="Search name, admission number or mobile"
              aria-label="Find student"
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>No matching students</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
        {profile && (
          <div className="payment-student-summary span-2">
            <div className="student-line">
              <Initials name={profile.student.name} />
              <div>
                <strong>{profile.student.name}</strong>
                <small>
                  {profile.student.class_name} {profile.student.section_name} ·{" "}
                  {profile.student.academic_year}
                </small>
              </div>
            </div>
            <div className="payment-totals">
              <div>
                <span>Total fee</span>
                <b>{money(profile.student.total_paise)}</b>
              </div>
              <div>
                <span>Paid</span>
                <b>{money(profile.student.paid_paise)}</b>
              </div>
              <div>
                <span>Outstanding</span>
                <b>{money(profile.student.outstanding_paise)}</b>
              </div>
              <div>
                <span>Overdue</span>
                <b className="text-red-600">
                  {money(profile.student.overdue_paise)}
                </b>
              </div>
            </div>
          </div>
        )}
        <Field label="Allocate payment to" className="span-2">
          <Picker
            value={installment}
            onChange={(v) => {
              setInstallment(v);
              const i = profile?.installments.find((r: Row) => r.id === v);
              if (i) setAmount((i.outstanding_paise / 100).toFixed(2));
            }}
            options={[
              { value: "", label: "Oldest unpaid installments first" },
              ...(profile?.installments || [])
                .filter((i: Row) => i.outstanding_paise > 0)
                .map((i: Row) => ({
                  value: i.id,
                  label: `${i.title} · due ${i.due_date} · ${money(i.outstanding_paise)}`,
                })),
            ]}
            placeholder="Installment"
          />
        </Field>
        <Field label="Amount (₹)" required>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            required
            pattern="[0-9]+(\.[0-9]{1,2})?"
          />
        </Field>
        <Field label="Payment method" required>
          <Picker
            value={method}
            onChange={setMethod}
            options={[
              "Cash",
              "UPI",
              "Bank Transfer",
              "Cheque",
              "Card",
              "Net Banking",
            ].map((v) => ({ value: v, label: v }))}
          />
        </Field>
        <Field
          label={
            method === "Cheque" ? "Cheque number" : "Transaction reference"
          }
          required={method !== "Cash"}
          className="span-2"
        >
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={
              method === "Cash"
                ? "Optional cash reference"
                : "UTR, bank reference or cheque number"
            }
            required={method !== "Cash"}
          />
        </Field>
        <Field label="Notes" className="span-2">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional collection note"
          />
        </Field>
        <p className="form-note span-2">
          <ShieldCheck size={16} />
          {method === "Cheque"
            ? "Cheque receipts are issued only after staff confirm bank clearance."
            : "Confirm receipt of funds before recording this payment. Partial payments are supported."}
        </p>
      </div>
    </FormDialog>
  );
}
export async function launchOnlinePayment(
  request: any,
  student: Row,
  amount: string,
  gateway: string,
  onComplete: () => void,
) {
  const intent = await request("payments/initiate", {
    method: "POST",
    body: {
      studentId: student.id,
      yearId: student.academic_year_id,
      amount,
      gateway,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  const load = (src: string) =>
    new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        reject(new Error("The payment checkout could not be loaded."));
      };
      document.head.appendChild(script);
    });
  if (gateway === "Razorpay") {
    await load("https://checkout.razorpay.com/v1/checkout.js");
    const checkout = new (window as any).Razorpay({
      key: intent.keyId,
      order_id: intent.id,
      amount: intent.amount,
      currency: "INR",
      name: "Sohan Soft Tech · School fees",
      description: student.name,
      prefill: {
        name: student.parent_name || student.name,
        contact: student.mobile,
      },
      theme: { color: "#4863ee" },
      handler: async (response: Row) => {
        try {
          await request("payments/verify", {
            method: "POST",
            body: { paymentId: intent.paymentId, ...response },
          });
          toast.success("Payment verified. Your receipt is ready.");
          onComplete();
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
    });
    checkout.open();
  } else {
    await load("https://sdk.cashfree.com/js/v3/cashfree.js");
    const cashfree = (window as any).Cashfree({ mode: intent.mode });
    await cashfree.checkout({
      paymentSessionId: intent.sessionId,
      redirectTarget: "_modal",
    });
    await request("payments/verify", {
      method: "POST",
      body: { paymentId: intent.paymentId },
    });
    toast.success("Payment verified. Your receipt is ready.");
    onComplete();
  }
}
