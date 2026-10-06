"use client";
import { useState } from "react";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Field,
  FormDialog,
  Input,
  Picker,
  money,
} from "@/components/campus/ui";
import { toast } from "sonner";
export function TaxEvidence({
  parentId,
  payments,
}: {
  parentId: string;
  payments: Row[];
}) {
  const { request } = useApp(),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState("tuition"),
    [busy, setBusy] = useState(false),
    [paymentId, setPayment] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [year, setYear] = useState(new Date().getFullYear()),
    [reference, setReference] = useState(""),
    [urn, setUrn] = useState(""),
    [pan, setPan] = useState(""),
    [ack, setAck] = useState(""),
    [file, setFile] = useState<File | null>(null);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Tax certificate evidence
      </Button>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Approve certificate evidence"
        description="A supervisor must verify the underlying tuition allocation or the official donation certificate before making it available to a guardian."
        busy={busy}
        submitLabel="Approve evidence"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (kind === "tuition")
              await request("certificates/tuition-allocations", {
                method: "POST",
                body: { paymentId, amount, reason },
              });
            else {
              if (!file) throw new Error("Select the official Form 10BE PDF.");
              if (file.size > 2000000)
                throw new Error("PDF must be under 2 MB.");
              const bytes = new Uint8Array(await file.arrayBuffer());
              let binary = "";
              for (let n = 0; n < bytes.length; n += 8192)
                binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
              await request("certificates/donations", {
                method: "POST",
                body: {
                  parentId,
                  financialYear: year,
                  donationReference: reference,
                  amount,
                  urn,
                  doneePan: pan,
                  form10bdAcknowledgement: ack,
                  approved: true,
                  pdfBase64: btoa(binary),
                },
              });
            }
            toast.success(
              "Approved evidence is available in the parent portal.",
            );
            setOpen(false);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Document type">
          <Picker
            value={kind}
            onChange={setKind}
            options={[
              { value: "tuition", label: "Annual tuition payment certificate" },
              { value: "donation", label: "Official donation Form 10BE" },
            ]}
          />
        </Field>
        {kind === "tuition" ? (
          <>
            <Field label="Settled payment">
              <Picker
                value={paymentId}
                onChange={setPayment}
                options={[
                  { value: "", label: "Choose payment" },
                  ...payments
                    .filter((p) =>
                      ["Successful", "Partially Refunded"].includes(p.status),
                    )
                    .map((p) => ({
                      value: p.id,
                      label: `${p.paid_at?.slice(0, 10)} · ${money(p.amount_paise)} · ${p.reference || p.id}`,
                    })),
                ]}
              />
            </Field>
            <Field label="Verified tuition portion (₹)">
              <Input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Allocation evidence and approval reason">
              <Input
                required
                minLength={10}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <p className="text-sm text-slate-500">
              Include only actual tuition. Development, transport, hostel and
              donation amounts are not tuition. Approval records cannot be
              overwritten.
            </p>
          </>
        ) : (
          <>
            <Field label="Financial year start">
              <Input
                required
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </Field>
            <Field label="Donation reference">
              <Input
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field label="Donation amount (₹)">
              <Input
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="80G registration URN">
              <Input
                required
                value={urn}
                onChange={(e) => setUrn(e.target.value)}
              />
            </Field>
            <Field label="Donee PAN">
              <Input
                required
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Form 10BD acknowledgement">
              <Input
                required
                value={ack}
                onChange={(e) => setAck(e.target.value)}
              />
            </Field>
            <Field label="Official Form 10BE PDF">
              <Input
                required
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </Field>
            <p className="text-sm text-slate-500">
              Upload the certificate downloaded after the institution’s
              statutory filing. School fees cannot be converted into charitable
              donations.
            </p>
          </>
        )}
      </FormDialog>
    </>
  );
}
