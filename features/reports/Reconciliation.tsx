"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import { ImportDialog } from "@/components/campus/ImportDialog";
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
  Status,
  money,
} from "@/components/campus/ui";
import { Link2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BankImportDialog } from "./BankImportDialog";
export function Reconciliation() {
  const { query, request, refresh, t } = useApp(),
    [page, setPage] = useState(1),
    [importOpen, setImport] = useState(false),
    [bankOpen, setBank] = useState(false),
    [match, setMatch] = useState<Row | null>(null),
    [payments, setPayments] = useState<Row[]>([]),
    [paymentId, setPayment] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    r = useResource("reconciliation?" + query({ page: String(page) }));
  return (
    <>
      <PageHead
        eyebrow="FINANCE / RECONCILIATION"
        title={t("Reconciliation")}
        description={t("ReconciliationIntro")}
        actions={
          <>
            <ExportButton report="reconciliation" />
            <Button variant="outline" onClick={() => setImport(true)}>
              Gateway CSV / Excel
            </Button>
            <Button onClick={() => setBank(true)}>
              <Upload size={16} />
              Import statement
            </Button>
          </>
        }
      />
      <div className="notice-bar">
        <span className="notice-icon">
          <Link2 size={18} />
        </span>
        <div>
          <strong>
            Match transactions without creating duplicate payments
          </strong>
          <span>
            Bank imports are compared with existing payment references and exact
            amounts.
          </span>
        </div>
      </div>
      <Card>
        {r.error ? (
          <Failure message={r.error} retry={r.retry} />
        ) : (
          <DataTable
            rows={r.data?.rows || []}
            loading={r.loading}
            total={r.data?.total}
            page={page}
            onPage={setPage}
            columns={[
              { key: "transaction_id", label: "Bank / gateway reference" },
              { key: "transaction_date", label: "Date" },
              { key: "student_name", label: "Matched student" },
              {
                key: "amount_paise",
                label: "Amount",
                align: "right",
                render: (r) => money(r.amount_paise),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => <Status value={r.status} />,
              },
              { key: "notes", label: "Notes" },
              {
                key: "actions",
                label: "",
                render: (r) =>
                  r.status !== "Duplicate" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const d = await request(
                            "payments?" +
                              query({ size: "100", status: "Successful" }),
                          );
                          setPayments(d.rows);
                          setMatch(r);
                          setPayment(r.payment_id || "");
                          setNotes(r.notes);
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      {r.status === "Matched"
                        ? "Review match"
                        : "Match payment"}
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Card>
      <BankImportDialog open={bankOpen} onClose={() => setBank(false)} />
      <ImportDialog
        kind="reconciliation"
        open={importOpen}
        onClose={() => setImport(false)}
      />
      <FormDialog
        open={!!match}
        onClose={() => setMatch(null)}
        title="Match bank transaction"
        description={match?.transaction_id + " · " + money(match?.amount_paise)}
        busy={busy}
        submitLabel="Save reconciliation"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("reconciliation/" + match!.id + "/match", {
              method: "POST",
              body: { paymentId, notes },
            });
            toast.success("Reconciliation saved.");
            refresh();
            setMatch(null);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Successful payment">
          <Picker
            value={paymentId}
            onChange={setPayment}
            options={[
              { value: "", label: "Choose matching payment" },
              ...payments.map((p) => ({
                value: p.id,
                label:
                  p.student_name +
                  " · " +
                  money(p.amount_paise) +
                  " · " +
                  (p.reference || p.id),
              })),
            ]}
          />
        </Field>
        <Field label="Review note">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </FormDialog>
    </>
  );
}
