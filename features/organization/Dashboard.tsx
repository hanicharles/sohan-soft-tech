"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import {
  Button,
  Card,
  DataTable,
  Field,
  Input,
  PageHead,
  money,
} from "@/components/campus/ui";
type Report = {
  organization: { name: string };
  rows: {
    id: string;
    name: string;
    students: number;
    collected_paise: number;
    refunded_paise: number;
    outstanding_paise: number;
  }[];
  page: number;
  total: number;
  limit: number;
  totals: {
    students: number;
    collected_paise: number;
    refunded_paise: number;
    outstanding_paise: number;
  };
};
export default function OrganizationDashboard({ id }: { id: string }) {
  const [data, setData] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    api<Report>(
      "organizations/" +
        id +
        "/reports?" +
        new URLSearchParams({
          page: String(page),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }),
    )
      .then((r) => {
        setData(r);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [id, from, to, page]);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHead
        eyebrow="SOHAN SOFT TECH / TRUST REPORTING"
        title={data?.organization.name || "Organization reports"}
        description="Consolidated receipts, refunds and outstanding balances for your authorized institutions."
        actions={<a href="/">Back to workspaces</a>}
      />
      <div className="flex gap-4">
        <Field label="From">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Through">
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      {data && (
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            ["Students", data.totals.students],
            ["Collected", money(data.totals.collected_paise)],
            ["Refunded", money(data.totals.refunded_paise)],
            ["Outstanding", money(data.totals.outstanding_paise)],
          ].map(([label, value]) => (
            <Card key={label}>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      )}
      {error ? (
        <Card>
          <p role="alert">{error}</p>
          <a href="/">
            Sign in
          </a>
        </Card>
      ) : (
        <Card>
          <DataTable
            rows={data?.rows || []}
            loading={!data}
            columns={[
              { key: "name", label: "Institution" },
              { key: "students", label: "Active students" },
              {
                key: "collected_paise",
                label: "Collected",
                render: (r) => money(r.collected_paise),
              },
              {
                key: "refunded_paise",
                label: "Refunded",
                render: (r) => money(r.refunded_paise),
              },
              {
                key: "outstanding_paise",
                label: "Outstanding as of end date",
                render: (r) => money(r.outstanding_paise),
              },
            ]}
          />
          <div className="flex items-center gap-4">
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {page} · {data?.total || 0} institutions
            </span>
            <Button
              disabled={!data || page * data.limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
      <p className="text-sm text-slate-500">
        Group report access is separate from institution staff access.
        Collections and refunds use the selected period; outstanding is
        cumulative through the end date.
      </p>
    </main>
  );
}
