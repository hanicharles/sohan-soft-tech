"use client";
import { Row } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  ExportButton,
  money,
  Status,
} from "@/components/campus/ui";
import { Download } from "lucide-react";
type Props = {
  view: string;
  id: string;
  data: Row;
  payments: Row[];
  invoices: Row[];
  download: (
    kind: string,
    id: string,
    print?: boolean,
    format?: string,
  ) => void;
};
export default function FeeHistory({
  view,
  id,
  data,
  payments,
  invoices,
  download,
}: Props) {
  if (view === "payments")
    return (
      <>
        <Card title="Payment history">
          <DataTable
            rows={payments}
            columns={[
              {
                key: "paid_at",
                label: "Date",
                render: (r) => r.paid_at.slice(0, 10),
              },
              { key: "method", label: "Method" },
              { key: "reference", label: "Reference" },
              {
                key: "amount_paise",
                label: "Amount",
                align: "right",
                render: (r) => money(r.amount_paise, true),
              },
              {
                key: "refunded_paise",
                label: "Refunded",
                align: "right",
                render: (r) => money(r.refunded_paise),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => <Status value={r.status} />,
              },
              {
                key: "actions",
                label: "",
                render: (r) =>
                  r.receipt_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => download("receipt", r.receipt_id)}
                    >
                      <Download size={15} />
                      Receipt
                    </Button>
                  ),
              },
            ]}
          />
        </Card>
      </>
    );
  if (view === "ledger")
    return (
      <>
        <Card
          title="Student ledger"
          action={<ExportButton report="ledger" studentId={id} />}
        >
          <DataTable
            rows={data.ledger || []}
            columns={[
              { key: "entry_date", label: "Date" },
              { key: "description", label: "Description" },
              {
                key: "debit_paise",
                label: "Debit",
                align: "right",
                render: (r) =>
                  r.debit_paise ? money(r.debit_paise, true) : "—",
              },
              {
                key: "credit_paise",
                label: "Credit",
                align: "right",
                render: (r) =>
                  r.credit_paise ? money(r.credit_paise, true) : "—",
              },
              {
                key: "balance_paise",
                label: "Balance",
                align: "right",
                render: (r) => <strong>{money(r.balance_paise, true)}</strong>,
              },
            ]}
          />
        </Card>
        <Card title="Double-entry journal">
          <DataTable
            virtualized
            rows={data.journal || []}
            columns={[
              { key: "entry_date", label: "Date" },
              { key: "event_type", label: "Event" },
              { key: "account_code", label: "Account" },
              {
                key: "debit_paise",
                label: "Debit",
                render: (r) => money(r.debit_paise, true),
              },
              {
                key: "credit_paise",
                label: "Credit",
                render: (r) => money(r.credit_paise, true),
              },
            ]}
          />
        </Card>
      </>
    );
  return null;
}
