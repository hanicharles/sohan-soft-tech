"use client";
import { Row } from "@/components/campus/context";
import { Button, Card, DataTable, money, Status } from "@/components/campus/ui";
import { Download, Printer } from "lucide-react";
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
export default function Documents({
  view,
  id,
  data,
  payments,
  invoices,
  download,
}: Props) {
  if (view === "invoices")
    return (
      <>
        <Card title="Invoices">
          <DataTable
            rows={invoices}
            columns={[
              { key: "number", label: "Invoice number" },
              { key: "issued_date", label: "Date" },
              {
                key: "total_paise",
                label: "Total",
                align: "right",
                render: (r) => money(r.total_paise),
              },
              {
                key: "outstanding_paise",
                label: "Balance",
                align: "right",
                render: (r) => money(r.outstanding_paise),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => <Status value={r.status} />,
              },
              {
                key: "actions",
                label: "",
                render: (r) => (
                  <div className="inline-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => download("invoice", r.id)}
                    >
                      <Download size={15} />
                      PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => download("invoice", r.id, true)}
                      aria-label="Print invoice"
                    >
                      <Printer size={15} />
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </>
    );
  if (view === "receipts")
    return (
      <>
        <Card title="Receipts">
          <DataTable
            rows={payments.filter((p: Row) => p.receipt_id)}
            columns={[
              { key: "receipt_number", label: "Receipt number" },
              {
                key: "paid_at",
                label: "Date",
                render: (r) => r.paid_at.slice(0, 10),
              },
              { key: "method", label: "Method" },
              {
                key: "amount_paise",
                label: "Amount",
                align: "right",
                render: (r) => money(r.amount_paise),
              },
              {
                key: "actions",
                label: "",
                render: (r) => (
                  <div className="inline-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => download("receipt", r.receipt_id)}
                    >
                      <Download size={15} />
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => download("receipt", r.receipt_id, true)}
                      aria-label="Print receipt"
                    >
                      <Printer size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        download("receipt", r.receipt_id, true, "thermal")
                      }
                    >
                      80mm
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </>
    );
  return null;
}
