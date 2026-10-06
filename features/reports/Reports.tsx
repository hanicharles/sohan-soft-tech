"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Card,
  DataTable,
  ExportButton,
  Failure,
  money,
  PageHead,
} from "@/components/campus/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  FileBarChart2,
  IndianRupee,
  Percent,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { TallyExport } from "./TallyExport";
const reports = [
  ["collections", "Collection report"],
  ["outstanding", "Outstanding report"],
  ["defaulters", "Defaulter report"],
  ["class", "Class-wise collection"],
  ["section", "Section-wise collection"],
  ["stream", "Stream-wise collection"],
  ["components", "Fee component report"],
  ["methods", "Payment method report"],
  ["discounts", "Discount report"],
  ["scholarships", "Scholarship report"],
  ["refunds", "Refund report"],
  ["latefees", "Late fee report"],
  ["waivers", "Fee waiver report"],
  ["receipts", "Receipt register"],
  ["cash", "Cash collection report"],
  ["online", "Online payment report"],
  ["reconciliation", "Reconciliation report"],
];
export function Reports() {
  const { query, t } = useApp(),
    [report, setReport] = useState("collections"),
    [tab, setTab] = useState("reports"),
    r = useResource("reports/" + report + "?" + query({ size: "100" })),
    accounting = useResource("reports/summary?" + query());
  const k = accounting.data?.kpi;
  return (
    <>
      <PageHead
        eyebrow="FINANCE / REPORTS"
        title={t("Reports")}
        description={t("ReportsIntro")}
        actions={
          <>
            <TallyExport />
            <ExportButton report={report} />
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="page-tabs">
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="accounting">Accounting summary</TabsTrigger>
        </TabsList>
        <TabsContent value="reports">
          <div className="report-layout">
            <Card className="report-menu">
              <div className="report-menu-title">
                <FileBarChart2 size={18} />
                <h2>Report library</h2>
              </div>
              {reports.map(([value, label]) => (
                <button
                  key={value}
                  className={report === value ? "active" : ""}
                  onClick={() => setReport(value)}
                >
                  {label}
                </button>
              ))}
            </Card>
            <Card
              title={r.data?.title || "Report"}
              action={
                <span className="record-count">
                  {r.data?.total || 0} records
                </span>
              }
              className="report-data"
            >
              {r.error ? (
                <Failure message={r.error} retry={r.retry} />
              ) : (
                <DataTable
                  columns={(r.data?.columns || []).map((c: Row) => ({
                    ...c,
                    align: c.money ? "right" : undefined,
                    render: c.money
                      ? (r: Row) => money(r[c.key], true)
                      : undefined,
                  }))}
                  rows={r.data?.rows?.slice(0, 100) || []}
                  loading={r.loading}
                />
              )}
              <div className="report-summary">
                <span>
                  Displayed: {Math.min(r.data?.total || 0, 100)} records
                </span>
                <strong>
                  {r.data?.columns
                    ?.filter((c: Row) => c.money)
                    .map((c: Row) => (
                      <span key={c.key}>
                        {c.label}:{" "}
                        {money(
                          (r.data?.rows || []).reduce(
                            (s: number, r: Row) => s + (r[c.key] || 0),
                            0,
                          ),
                          true,
                        )}{" "}
                      </span>
                    ))}
                </strong>
              </div>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="accounting">
          <div className="accounting-grid">
            {[
              {
                label: "Net fee revenue",
                value: k?.expected,
                icon: IndianRupee,
              },
              { label: "Net collected", value: k?.collected, icon: Wallet },
              {
                label: "Outstanding",
                value: k?.outstanding,
                icon: CalendarDays,
              },
              { label: "Refunded", value: k?.refunds, icon: RotateCcw },
              { label: "Discounts", value: k?.discounts, icon: Percent },
              { label: "Scholarships", value: k?.scholarships, icon: Percent },
            ].map((c) => (
              <Card key={c.label} className="accounting-card">
                <c.icon size={20} />
                <span>{c.label}</span>
                <strong>{money(c.value)}</strong>
              </Card>
            ))}
          </div>
          <Card title="Adjustments and late fees">
            <DataTable
              rows={accounting.data?.adjustments || []}
              columns={[
                { key: "kind", label: "Adjustment type" },
                {
                  key: "amount",
                  label: "Net amount",
                  align: "right",
                  render: (r) => money(r.amount, true),
                },
              ]}
            />
          </Card>
          <Card title="Class-wise summary">
            <DataTable
              rows={accounting.data?.byClass || []}
              columns={[
                { key: "name", label: "Class" },
                { key: "students", label: "Students" },
                {
                  key: "expected",
                  label: "Expected",
                  align: "right",
                  render: (r) => money(r.expected),
                },
                {
                  key: "collected",
                  label: "Collected",
                  align: "right",
                  render: (r) => money(r.collected),
                },
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
