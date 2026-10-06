"use client";
import type { Row } from "@/components/campus/context";
import {
  Button,
  Card,
  Failure,
  Loading,
  PageHead,
} from "@/components/campus/ui";
import { usePlatformResource } from "@/features/platform/context";
import { useRouter } from "@/lib/browser-navigation";
import {
  Building2,
  CalendarClock,
  CircleCheck,
  GraduationCap,
  PauseCircle,
  Plus,
  Timer,
  UsersRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
const colors = [
  "#3348d8",
  "#12a38a",
  "#eab05b",
  "#a1b0c8",
  "#cf6588",
  "#7673bf",
];
export function AdminDashboard() {
  const router = useRouter(),
    r = usePlatformResource("dashboard");
  if (r.error) return <Failure message={r.error} retry={r.retry} />;
  if (!r.data) return <Loading />;
  const d = r.data,
    cards = [
      { label: "Total Institutions", key: "institutions", icon: Building2 },
      { label: "Active Institutions", key: "active", icon: CircleCheck },
      { label: "Trial Institutions", key: "trial", icon: Timer },
      { label: "Suspended Institutions", key: "suspended", icon: PauseCircle },
      { label: "Total Students", key: "students", icon: GraduationCap },
      { label: "Institution Users", key: "users", icon: UsersRound },
      {
        label: "Active Subscriptions",
        key: "activeSubscriptions",
        icon: CircleCheck,
      },
      {
        label: "Expiring in " + (d.expiryNoticeDays || 30) + " Days",
        key: "expiring",
        icon: CalendarClock,
      },
    ];
  return (
    <>
      <PageHead
        eyebrow="PLATFORM / OVERVIEW"
        title="Platform dashboard"
        description="Institutions, subscriptions and usage across Sohan Soft Tech."
        actions={
          <Button onClick={() => router.push("/admin/institutions/new")}>
            <Plus size={17} />
            Create Institution
          </Button>
        }
      />
      <div className="platform-kpis">
        {cards.map((c) => (
          <Card key={c.key}>
            <div className="kpi-top">
              <span>{c.label}</span>
              <c.icon size={18} />
            </div>
            <strong className="platform-kpi-value">
              {Number(d[c.key] || 0).toLocaleString("en-IN")}
            </strong>
          </Card>
        ))}
      </div>
      <div className="platform-chart-grid">
        <Card title="Institutions growth">
          <div className="platform-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.growth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip />
                <Bar
                  dataKey="count"
                  name="New institutions"
                  fill="#3348d8"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Subscription distribution">
          <div className="platform-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Pie
                  data={d.distribution}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={55}
                  outerRadius={85}
                >
                  {d.distribution.map((v: Row, i: number) => (
                    <Cell key={v.status} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="platform-chart-legend">
            {d.distribution.map((v: Row, i: number) => (
              <span key={v.status}>
                <i style={{ background: colors[i % colors.length] }} />
                {v.status} · {v.count}
              </span>
            ))}
          </div>
        </Card>
      </div>
      <div className="platform-lower-grid">
        <Card
          title="Student usage"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/admin/usage")}
            >
              View usage
            </Button>
          }
        >
          <div className="platform-usage-list">
            {d.usage.map((v: Row) => (
              <div key={v.name}>
                <span>
                  <strong>{v.name}</strong>
                  <small>
                    {v.students} / {v.student_limit} students
                  </small>
                </span>
                <div className="usage-track">
                  <i
                    style={{
                      width:
                        Math.min(100, (v.students / v.student_limit) * 100) +
                        "%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recent institution activity">
          <div className="platform-activity">
            {d.activity.length ? (
              d.activity.map((a: Row) => (
                <div key={a.id}>
                  <span className="activity-icon">
                    <Building2 size={16} />
                  </span>
                  <span>
                    <strong>{a.action}</strong>
                    <small>
                      {a.institution_name || "Platform"} · {a.user_name}
                    </small>
                  </span>
                  <time>
                    {new Date(a.created_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </time>
                </div>
              ))
            ) : (
              <p>No platform activity yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
