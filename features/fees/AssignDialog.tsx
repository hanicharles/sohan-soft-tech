"use client";
import { Row, useApp } from "@/components/campus/context";
import {
  Field,
  FormDialog,
  Input,
  money,
  Picker,
} from "@/components/campus/ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";
export function AssignDialog({
  open,
  onClose,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
}) {
  const { request, query, refresh, can } = useApp(),
    [structures, setStructures] = useState<Row[]>([]),
    [structureId, setStructure] = useState(""),
    [discount, setDiscount] = useState("0"),
    [scholarship, setScholarship] = useState("0"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      request("structures?" + query({ size: "100" }))
        .then((d) => setStructures(d.rows))
        .catch((e) => toast.error(e.message));
  }, [open, request, query]);
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Assign fees & generate invoice"
      description="An invoice, installment schedule and permanent ledger entries are created together."
      busy={busy}
      submitLabel="Assign & generate invoice"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await request("invoices", {
            method: "POST",
            body: { studentId, structureId, discount, scholarship, reason },
          });
          toast.success("Fee structure assigned. Invoice generated.");
          refresh();
          onClose();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Fee structure" required>
        <Picker
          value={structureId}
          onChange={setStructure}
          options={[
            { value: "", label: "Choose applicable fee structure" },
            ...structures.map((r) => ({
              value: r.id,
              label: r.name + " · " + money(r.total_paise),
            })),
          ]}
        />
      </Field>
      {can("fees.manage") && (
        <div className="form-grid">
          <Field label="Discount (₹)">
            <Input
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Scholarship (₹)">
            <Input
              value={scholarship}
              onChange={(e) => setScholarship(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Approval reason" className="span-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required when applying a concession"
            />
          </Field>
        </div>
      )}
    </FormDialog>
  );
}
