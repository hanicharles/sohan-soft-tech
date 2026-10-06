"use client";
import type { Row } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Failure,
  PageHead,
  Picker,
  SearchBox,
  Status,
} from "@/components/campus/ui";
import { usePlatformResource } from "@/features/platform/context";
import { useRouter } from "@/lib/browser-navigation";
import { Plus } from "lucide-react";
import { useState } from "react";
export function Institutions() {
  const router = useRouter(),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    r = usePlatformResource(
      "institutions?" +
        new URLSearchParams({ q, status, page: String(page), size: "15" }),
    );
  return (
    <>
      <PageHead
        eyebrow="PLATFORM / INSTITUTIONS"
        title="Institutions"
        description="Manage institution portals, administrator access and subscriptions."
        actions={
          <Button onClick={() => router.push("/admin/institutions/new")}>
            <Plus size={17} />
            Create Institution
          </Button>
        }
      />
      <Card>
        <div className="table-toolbar">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Search institutions..."
          />
          <Picker
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            placeholder="Status"
            options={["", "Active", "Suspended", "Archived"].map((v) => ({
              value: v,
              label: v || "All statuses",
            }))}
          />
        </div>
        {r.error ? (
          <Failure message={r.error} retry={r.retry} />
        ) : (
          <DataTable
            loading={r.loading}
            rows={r.data?.rows || []}
            columns={[
              {
                key: "name",
                label: "Institution",
                render: (v: Row) => (
                  <div className="register-name">
                    <strong>{v.name}</strong>
                    <small>
                      {v.institution_code} · {v.institution_type}
                    </small>
                  </div>
                ),
              },
              {
                key: "status",
                label: "Status",
                render: (v: Row) => <Status value={v.status} />,
              },
              { key: "plan_name", label: "Plan" },
              {
                key: "subscription_status",
                label: "Subscription",
                render: (v: Row) => <Status value={v.subscription_status} />,
              },
              {
                key: "student_count",
                label: "Students",
                render: (v: Row) => `${v.student_count} / ${v.student_limit}`,
              },
              {
                key: "admin_emails",
                label: "Administrator",
                render: (v: Row) =>
                  v.admin_emails ||
                  v.pending_admin_emails ||
                  "Access not configured",
              },
              {
                key: "actions",
                label: "",
                render: (v: Row) => (
                  <div className="row-actions">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push("/admin/institutions/" + v.id)}
                    >
                      Manage
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        window.open("/campus/" + v.slug, "_blank", "noopener")
                      }
                    >
                      Open Institution
                    </Button>
                  </div>
                ),
              },
            ]}
            total={r.data?.total}
            page={page}
            size={15}
            onPage={setPage}
          />
        )}
      </Card>
    </>
  );
}
