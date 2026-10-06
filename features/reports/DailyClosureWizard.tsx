"use client";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Field,
  FormDialog,
  Input,
  money,
} from "@/components/campus/ui";
import { countedCash, denominations } from "@/lib/cash";
import { useEffect, useState } from "react";
import { toast } from "sonner";
export function DailyClosureWizard({
  open,
  onClose,
  summary,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  summary: Row;
  onRefresh: () => void;
}) {
  const { request, scope, refresh } = useApp(),
    [step, setStep] = useState(0),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [snapshot, setSnapshot] = useState(summary);
  useEffect(() => {
    if (open) {
      setStep(0);
      setCounts({});
      setNotes("");
      setSnapshot(summary);
    }
  }, [open]);
  let counted = 0,
    countError = "";
  try {
    counted = countedCash(counts);
  } catch (e) {
    countError = (e as Error).message;
  }
  const variance = counted - (snapshot?.expected || 0);
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Daily closure"
      description={`Step ${step + 1} of 3 · ${snapshot?.date || ""}`}
      busy={busy}
      submitLabel={step < 2 ? "Continue" : "Confirm and close day"}
      submitDisabled={
        !!countError ||
        (step === 2 && variance !== 0 && notes.trim().length < 5)
      }
      onSubmit={async (e) => {
        e.preventDefault();
        if (step < 2) {
          setStep(step + 1);
          return;
        }
        setBusy(true);
        try {
          await request("cash", {
            method: "POST",
            body: {
              kind: "Close",
              campusId: snapshot.campusId,
              yearId: scope.year,
              date: snapshot.date,
              denominations: counts,
              expectedPaise: snapshot.expected,
              notes,
            },
          });
          toast.success(
            "Cash day closed. The count and variance are recorded.",
          );
          refresh();
          onRefresh();
          onClose();
        } catch (e) {
          toast.error((e as Error).message);
          onRefresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="mb-5 flex gap-2" aria-label="Closure progress">
        {["Review register", "Count currency", "Confirm variance"].map(
          (label, i) => (
            <span
              key={label}
              className={`flex-1 rounded-md px-2 py-2 text-xs ${step === i ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}
            >
              {i + 1}. {label}
            </span>
          ),
        )}
      </div>
      {step === 0 && (
        <div className="summary-lines">
          {[
            ["Opening", snapshot?.opening],
            ["Collected", snapshot?.collected],
            ["Refunds", snapshot?.refunds],
            ["Deposited", snapshot?.deposits],
            ["Expected cash", snapshot?.expected],
          ].map(([label, amount]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{money(amount)}</strong>
            </div>
          ))}
          <p className="text-sm text-slate-500">
            Count the physical cash before closing. The server checks for new
            transactions at submission.
          </p>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              setSnapshot(summary);
              onRefresh();
            }}
          >
            Refresh register
          </Button>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-2">
          {denominations.map((value) => (
            <div key={value} className="grid grid-cols-3 items-center gap-3">
              <label htmlFor={`currency-${value}`}>₹{value}</label>
              <Input
                id={`currency-${value}`}
                type="number"
                inputMode="numeric"
                min="0"
                max="1000000"
                step="1"
                value={counts[value] || ""}
                placeholder="0"
                onChange={(e) =>
                  setCounts({
                    ...counts,
                    [value]: e.target.value === "" ? 0 : Number(e.target.value),
                  })
                }
              />
              <span className="text-right text-sm">
                {money(value * 100 * (counts[value] || 0))}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-3 font-semibold">
            <span>Physical cash</span>
            <span>{money(counted, true)}</span>
          </div>
          {countError && (
            <p role="alert" className="text-red-600">
              {countError}
            </p>
          )}
        </div>
      )}
      {step === 2 && (
        <>
          <div
            className={`rounded-xl p-4 ${variance ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
          >
            <strong>
              {variance === 0
                ? "Cash matches the register"
                : variance < 0
                  ? "Cash shortage"
                  : "Cash surplus"}
            </strong>
            <p>
              Expected {money(snapshot.expected, true)} · Counted{" "}
              {money(counted, true)}
            </p>
            <p className="mt-2 text-xl font-semibold">
              Variance: {money(variance, true)}
            </p>
          </div>
          <Field
            label={variance ? "Explain the variance" : "Closing notes"}
            required={variance !== 0}
          >
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </Field>
          <p className="text-xs text-slate-500">
            This closing is permanent. Further cash entries for this day will be
            blocked.
          </p>
        </>
      )}
      {step > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="mt-3"
          onClick={() => setStep(step - 1)}
        >
          Back
        </Button>
      )}
    </FormDialog>
  );
}
