"use client";
import { useState } from "react";
import { useApp, Row } from "@/components/campus/context";
import { Button, Card, Field, Input } from "@/components/campus/ui";
import { toast } from "sonner";
const accounts = [
  ["ACCOUNTS_RECEIVABLE", "Student Fees Receivable"],
  ["CASH", "Cash"],
  ["BANK_CLEARING", "Bank Receipts"],
  ["CONCESSION_EXPENSE", "Fee Concessions"],
  ["FEE_REVENUE", "Fee Income"],
  ["LATE_FEE_REVENUE", "Late Fee Income"],
  ["OPENING_BALANCE_CLEARING", "Academic Year Transfer"],
  ["service:Transport", "Transport Fee Income"],
  ["service:Hostel", "Hostel Fee Income"],
];
export function AccountingSettings() {
  const { boot, request, reload } = useApp(),
    [company, setCompany] = useState(
      boot.institution.settings.tally?.company || boot.institution.name,
    ),
    [ledgers, setLedgers] = useState<Record<string, string>>(
      boot.institution.settings.tally?.ledgers || {},
    ),
    [busy, setBusy] = useState(false);
  return (
    <Card title="TallyPrime account mapping">
      <p className="mb-5 text-sm text-slate-500">
        Use the exact company and ledger names configured in TallyPrime. Create
        the corresponding ledgers in Tally before importing the XML. Stable
        voucher IDs support controlled re-import; review Tally’s import options
        to avoid duplicates.
      </p>
      <Field label="Tally company">
        <Input value={company} onChange={(e) => setCompany(e.target.value)} />
      </Field>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {[
          ...accounts,
          ...(boot.components || []).map((c: Row) => [
            "component:" + c.id,
            c.name,
          ]),
        ].map(([code, label]) => (
          <Field key={code} label={label}>
            <Input
              value={ledgers[code] || ""}
              placeholder={label}
              onChange={(e) =>
                setLedgers({ ...ledgers, [code]: e.target.value })
              }
            />
          </Field>
        ))}
      </div>
      <Button
        className="mt-5"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await request("settings", {
              method: "PATCH",
              body: {
                name: boot.institution.name,
                address: boot.institution.address,
                email: boot.institution.email,
                phone: boot.institution.phone,
                settings: {
                  ...boot.institution.settings,
                  tally: {
                    company,
                    ledgers: Object.fromEntries(
                      Object.entries(ledgers).filter(([, name]) => name.trim()),
                    ),
                  },
                },
              },
            });
            await reload();
            toast.success("Accounting mappings saved.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save account mappings
      </Button>
    </Card>
  );
}
