"use client";
import {
  Row,
  useApp,
  useResource,
  useCampusRouter as useRouter,
} from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  ExportButton,
  Failure,
  Initials,
  Loading,
  money,
  PageHead,
  Status,
  StudentCell,
} from "@/components/campus/ui";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentDialog } from "@/features/payments/PaymentDialog";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  IndianRupee,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
const colors = [
  "#4863ee",
  "#23aa96",
  "#f4b456",
  "#869ab6",
  "#ac78d3",
  "#62bcdf",
  "#e58282",
];
export function Dashboard() {
  const { query, t, collect, can } = useApp(),
    router = useRouter(),
    [group, setGroup] = useState("month"),
    [pay, setPay] = useState(false),
    resource = useResource("dashboard?" + query({ group }));
  if (resource.loading && !resource.data) return <Loading />;
  if (resource.error)
    return <Failure message={resource.error} retry={resource.retry} />;
  const data = resource.data,
    k = data?.kpi || {};
  const cards = [
    {
      key: "expected",
      title: t("Expected"),
      amount: k.expected,
      icon: IndianRupee,
      color: "indigo",
      detail: "Annual fee obligations",
    },
    {
      key: "collected",
      title: t("Collected"),
      amount: k.collected,
      icon: Wallet,
      color: "teal",
      detail: `${k.collection_rate}% of expected fees`,
    },
    {
      key: "outstanding",
      title: t("Balance"),
      amount: k.outstanding,
      icon: Clock3,
      color: "amber",
      detail: "Across all unpaid installments",
    },
    {
      key: "overdue",
      title: t("Overdue"),
      amount: k.overdue,
      icon: AlertCircle,
      color: "red",
      detail: `${k.defaulters || 0} students need a follow-up`,
    },
  ];
  const chart =
    data?.collection.map((r: Row) => ({
      ...r,
      label:
        group === "month"
          ? new Date(r.period + "-01").toLocaleDateString("en-IN", {
              month: "short",
            })
          : r.period.slice(5),
      amount: r.amount / 100,
    })) || [];
  const collectedSum = (data?.methods || []).reduce(
    (s: number, r: Row) => s + r.value,
    0,
  );
  return (
    <>
      <PageHead
        eyebrow="WORKSPACE / DASHBOARD"
        title={t("FeeOverview")}
        description={t("DashboardIntro")}
        actions={
          <>
            <ExportButton report="collections" label={t("DownloadReport")} />
            {collect && (
              <Button onClick={() => setPay(true)}>
                <Plus size={17} />
                {t("CollectFee")}
              </Button>
            )}
          </>
        }
      />
      <div className="dashboard-quick-actions">
        {can("students.manage") && (
          <Button
            variant="outline"
            onClick={() => router.push("/students?new=1")}
          >
            <Plus size={15} />
            Add Student
          </Button>
        )}
        {can("fees.manage") && (
          <Button variant="outline" onClick={() => router.push("/fees?new=1")}>
            Add Fee Structure
          </Button>
        )}
        {can("users.manage") && (
          <Button variant="outline" onClick={() => router.push("/users?new=1")}>
            Add User
          </Button>
        )}
        {can("payments.collect") && (
          <Button variant="outline" onClick={() => setPay(true)}>
            Collect & Generate Receipt
          </Button>
        )}
        {can("reports.view") && (
          <Button variant="outline" onClick={() => router.push("/reports")}>
            View Reports
          </Button>
        )}
      </div>
      <div className="kpi-grid">
        {cards.map((c) => (
          <Card key={c.title} className={"kpi-card " + c.color}>
            <div className="kpi-top">
              <span>{c.title}</span>
              <span className="kpi-icon">
                <c.icon size={18} />
              </span>
            </div>
            <strong className="kpi-amount">{money(c.amount)}</strong>
            <p>{c.detail}</p>
            <span
              className="inline-block rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600"
              title="Current academic-year totals compared with the entire previous academic year, using the same institution, class and campus filters."
            >
              {data?.comparison
                ? `${data.comparison.deltas[c.key] === null ? "No baseline" : (data.comparison.deltas[c.key] > 0 ? "+" : "") + data.comparison.deltas[c.key] + "%"} vs ${data.comparison.label}`
                : "No previous academic year"}
            </span>
            <span className="kpi-accent" />
          </Card>
        ))}
      </div>
      <div className="mini-kpis">
        {[
          {
            label: t("TotalStudents"),
            value: String(k.students || 0),
            icon: Users,
          },
          { label: t("TodayCollection"), value: money(k.today), icon: Wallet },
          {
            label: t("MonthCollection"),
            value: money(k.month),
            icon: CalendarDays,
          },
          { label: t("Pending"), value: String(k.pending || 0), icon: Clock3 },
        ].map((item) => (
          <div key={item.label}>
            <span className="mini-icon">
              <item.icon size={18} />
            </span>
            <span>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </span>
          </div>
        ))}
      </div>
      <Card
        title="Outstanding aging"
        action={
          <span className="text-xs text-slate-500">
            Current balance · due-date filters
          </span>
        }
      >
        <div className="h-64 px-4 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data?.aging || []}
              margin={{ top: 12, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 5" />
              <XAxis dataKey="name" tickLine={false} />
              <YAxis
                tickFormatter={(v) => "₹" + (v / 10000000).toFixed(1) + "L"}
                width={72}
              />
              <Tooltip formatter={(v: any) => money(Number(v), true)} />
              <Bar
                dataKey="amount"
                name="Outstanding"
                fill="#ea9a43"
                radius={[6, 6, 0, 0]}
                onClick={(entry: any) => {
                  const b = entry.payload || entry;
                  router.push(
                    `/outstanding?minDays=${b.minDays}&maxDays=${b.maxDays}`,
                  );
                }}
                cursor="pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          {(data?.aging || []).map((bucket: Row) => (
            <Button
              key={bucket.name}
              size="sm"
              variant="outline"
              onClick={() =>
                router.push(
                  `/outstanding?minDays=${bucket.minDays}&maxDays=${bucket.maxDays}`,
                )
              }
            >
              {bucket.name} · {money(bucket.amount)}
            </Button>
          ))}
        </div>
      </Card>
      <div className="dashboard-charts">
        <Card
          title={t("CollectionTrend")}
          action={
            <Tabs value={group} onValueChange={setGroup}>
              <TabsList className="compact-tabs">
                <TabsTrigger value="day">Daily</TabsTrigger>
                <TabsTrigger value="week">Weekly</TabsTrigger>
                <TabsTrigger value="month">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          className="trend-panel"
        >
          <div className="chart-heading">
            <strong>{money(collectedSum)}</strong>
            <span>Collection in selected period</span>
            <div className="chart-legend">
              <i />
              Fees collected
            </div>
          </div>
          <div className="collection-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chart}
                margin={{ top: 18, right: 10, bottom: 0, left: -15 }}
              >
                <CartesianGrid
                  strokeDasharray="3 5"
                  vertical={false}
                  stroke="#edf0f5"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#8290a4" }}
                  dy={10}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#8290a4" }}
                  tickFormatter={(v) => "₹" + (v / 100000).toFixed(1) + "L"}
                />
                <Tooltip
                  formatter={(v: any) => money(Number(v) * 100)}
                  contentStyle={{
                    border: "1px solid #e5eaf1",
                    borderRadius: 10,
                    fontSize: 14,
                  }}
                />
                <Bar
                  dataKey="amount"
                  fill="#4863ee"
                  radius={[5, 5, 0, 0]}
                  barSize={35}
                  maxBarSize={42}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#243ab2"
                  strokeWidth={2}
                  dot={{
                    fill: "#fff",
                    stroke: "#4863ee",
                    strokeWidth: 2,
                    r: 4,
                  }}
                  tooltipType="none"
                />
                <Brush
                  dataKey="label"
                  height={20}
                  stroke="#c7d2fe"
                  travellerWidth={8}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-footnote">
            <CalendarDays size={14} />
            Collections are based on successful payment records.
          </div>
        </Card>
        <Card title={t("CollectionRate")} className="rate-panel">
          <div className="rate-visual">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { value: k.collected || 0 },
                    { value: k.outstanding || 1 },
                  ]}
                  dataKey="value"
                  innerRadius={70}
                  outerRadius={87}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  cornerRadius={5}
                >
                  <Cell fill="#4863ee" />
                  <Cell fill="#eef1f8" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="rate-label">
              <strong>
                {k.collection_rate || 0}
                <span>%</span>
              </strong>
              <small>of annual fees</small>
            </div>
          </div>
          <div className="rate-key">
            <span>
              <i style={{ background: "#4863ee" }} />
              Collected
            </span>
            <strong>{money(k.collected)}</strong>
          </div>
          <div className="rate-key">
            <span>
              <i style={{ background: "#dde3f0" }} />
              Outstanding
            </span>
            <strong>{money(k.outstanding)}</strong>
          </div>
          <div className="rate-separator" />
          <h3>{t("PaymentMethods")}</h3>
          <div className="method-bar">
            {data?.methods.map((r: Row, i: number) => (
              <span
                key={r.name}
                style={{
                  width: `${collectedSum ? (r.value / collectedSum) * 100 : 0}%`,
                  background: colors[i % colors.length],
                }}
                title={r.name}
              />
            ))}
          </div>
          <div className="method-list">
            {data?.methods.slice(0, 4).map((r: Row, i: number) => (
              <div key={r.name}>
                <span>
                  <i style={{ background: colors[i] }} />
                  {r.name}
                </span>
                <strong>
                  {collectedSum
                    ? Math.round((r.value / collectedSum) * 100)
                    : 0}
                  %
                </strong>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="dashboard-lower">
        <Card
          title={t("RecentPayments")}
          action={
            <Button
              variant="ghost"
              className="text-primary"
              onClick={() => router.push("/payments")}
            >
              {t("ViewAll")}
            </Button>
          }
        >
          <DataTable
            columns={[
              {
                key: "student",
                label: t("Student"),
                render: (r) => (
                  <StudentCell
                    row={r}
                    onClick={() => router.push("/students/" + r.student_id)}
                  />
                ),
              },
              {
                key: "class_name",
                label: t("Class"),
                render: (r) => (
                  <span className="class-tag">
                    {r.class_name} {r.section_name}
                  </span>
                ),
              },
              {
                key: "method",
                label: t("Method"),
                render: (r) => <span className="method-label">{r.method}</span>,
              },
              {
                key: "amount_paise",
                label: t("Amount"),
                align: "right",
                render: (r) => <strong>{money(r.amount_paise)}</strong>,
              },
              {
                key: "status",
                label: t("Status"),
                render: (r) => <Status value={r.status} />,
              },
            ]}
            rows={data?.recent || []}
          />
        </Card>
        <Card
          title={t("NeedsAttention")}
          action={<span className="attention-count">{k.defaulters || 0}</span>}
          className="attention-panel"
        >
          <p className="attention-caption">
            Students with overdue installments
          </p>
          {data?.attention.length ? (
            data.attention.slice(0, 4).map((r: Row) => (
              <button
                key={r.id}
                className="attention-row"
                onClick={() => router.push("/students/" + r.id)}
              >
                <Initials name={r.name} />
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.class_name} {r.section_name} · {r.next_due_date}
                  </small>
                </span>
                <b>{money(r.overdue_paise)}</b>
              </button>
            ))
          ) : (
            <p className="no-attention">
              <CheckCircle2 />
              No overdue fees
            </p>
          )}
          <Button
            variant="outline"
            className="w-full attention-button"
            onClick={() => router.push("/defaulters")}
          >
            View defaulters
          </Button>
        </Card>
      </div>
      <Card
        title="Class-wise fee position"
        action={<ExportButton report="class" />}
        className="class-collection"
      >
        <div className="class-bars">
          {data?.byClass.slice(0, 8).map((r: Row) => (
            <div key={r.name}>
              <div>
                <span>{r.name}</span>
                <strong>
                  {r.expected
                    ? Math.round((r.collected / r.expected) * 100)
                    : 0}
                  %
                </strong>
              </div>
              <Progress
                value={r.expected ? (r.collected / r.expected) * 100 : 0}
              />
              <small>
                {money(r.collected)} of {money(r.expected)}
              </small>
            </div>
          ))}
        </div>
      </Card>
      <PaymentDialog open={pay} onClose={() => setPay(false)} />
    </>
  );
}
