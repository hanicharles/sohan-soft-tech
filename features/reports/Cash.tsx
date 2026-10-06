"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Failure,
  Field,
  FormDialog,
  Input,
  money,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Landmark, LockKeyhole, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DailyClosureWizard } from "./DailyClosureWizard";
export function Cash() {
  const { boot, scope, request, refresh, can } = useApp(),
    [date, setDate] = useState(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    ),
    [campus, setCampus] = useState(scope.campus || boot.campuses[0]?.id || ""),
    [kind, setKind] = useState(""),
    [closure, setClosure] = useState(false),
    [amount, setAmount] = useState(""),
    [notes, setNotes] = useState(""),
    [reference, setReference] = useState(""),
    [busy, setBusy] = useState(false),
    r = useResource("cash?date=" + date + "&campus=" + campus);
  return (
    <>
      <PageHead
        eyebrow="FINANCE / CASH MANAGEMENT"
        title="Cash management"
        description="Track collections, deposits and daily cash closing."
        actions={
          <>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Cash date"
            />
            <Picker
              value={campus}
              onChange={setCampus}
              options={boot.campuses.map((c: Row) => ({
                value: c.id,
                label: c.name,
              }))}
            />
          </>
        }
      />
      {r.error ? (
        <Failure message={r.error} retry={r.retry} />
      ) : (
        <>
          <div className="cash-kpis">
            {[
              { label: "Opening cash", value: r.data?.opening },
              { label: "Cash collected", value: r.data?.collected },
              { label: "Cash refunds", value: r.data?.refunds },
              { label: "Cash deposited", value: r.data?.deposits },
              { label: "Expected closing", value: r.data?.expected },
            ].map((c) => (
              <Card key={c.label}>
                <span>{c.label}</span>
                <strong>{money(c.value)}</strong>
              </Card>
            ))}
          </div>
          <Card
            title="Daily cash register"
            action={<Status value={r.data?.closing ? "Closed" : "Open"} />}
          >
            <div className="cash-actions">
              {!r.data?.closing && (
                <>
                  <Button
                    disabled={!can("payments.manage")}
                    variant="outline"
                    onClick={() => {
                      setKind("Opening");
                      setAmount("");
                    }}
                  >
                    <Plus size={16} />
                    Opening balance
                  </Button>
                  <Button
                    disabled={!can("payments.manage")}
                    variant="outline"
                    onClick={() => {
                      setKind("Deposit");
                      setAmount("");
                    }}
                  >
                    <Landmark size={16} />
                    Record deposit
                  </Button>
                  <Button
                    onClick={() => {
                      setClosure(true);
                    }}
                  >
                    <LockKeyhole size={16} />
                    Close cash day
                  </Button>
                </>
              )}
            </div>
            <DataTable
              rows={r.data?.entries || []}
              columns={[
                { key: "entry_date", label: "Date" },
                { key: "kind", label: "Entry" },
                { key: "reference", label: "Reference" },
                { key: "notes", label: "Notes" },
                {
                  key: "amount_paise",
                  label: "Amount",
                  align: "right",
                  render: (r) => money(r.amount_paise),
                },
              ]}
            />
            {r.data?.closing && (
              <div className="cash-closing-summary">
                <strong>Cash day closed</strong>
                <span>
                  Counted: {money(r.data.closing.counted_paise)} · Variance:{" "}
                  {money(r.data.closing.variance_paise)}
                </span>
                <p>{r.data.closing.notes}</p>
              </div>
            )}
          </Card>
        </>
      )}
      {r.data && (
        <DailyClosureWizard
          open={closure}
          onClose={() => setClosure(false)}
          summary={r.data}
          onRefresh={r.retry}
        />
      )}
      <FormDialog
        open={!!kind}
        onClose={() => setKind("")}
        title={
          kind === "Close"
            ? "Close cash day"
            : kind === "Deposit"
              ? "Record bank deposit"
              : "Record opening cash"
        }
        busy={busy}
        submitLabel={
          kind === "Close" ? "Confirm cash closing" : "Save cash entry"
        }
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("cash", {
              method: "POST",
              body: {
                campusId: campus,
                yearId: scope.year,
                date,
                kind,
                amount,
                notes,
                reference,
              },
            });
            toast.success("Cash record saved.");
            setKind("");
            refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={kind === "Close" ? "Cash counted (₹)" : "Amount (₹)"}>
          <Input
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        {kind === "Deposit" && (
          <Field label="Bank deposit reference">
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
            />
          </Field>
        )}
        <Field label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FormDialog>
    </>
  );
}
