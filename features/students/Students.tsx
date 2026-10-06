"use client";
import {
  Row,
  useApp,
  useResource,
  useCampusRouter as useRouter,
} from "@/components/campus/context";
import { ImportDialog } from "@/components/campus/ImportDialog";
import {
  Button,
  Card,
  DataTable,
  ExportButton,
  Failure,
  Field,
  FormDialog,
  money,
  PageHead,
  Picker,
  SearchBox,
  Status,
  StudentCell,
} from "@/components/campus/ui";
import { Plus, Send, Upload, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StudentForm } from "./StudentForm";
export function Students({ mode = "students" }: { mode?: string }) {
  const { query, t, admin, collect, finance, scope, request, refresh } =
      useApp("students.manage"),
    params = useSearchParams(),
    router = useRouter(),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [add, setAdd] = useState(admin && params.get("new") === "1"),
    [importOpen, setImport] = useState(false),
    [remind, setRemind] = useState<Row | null>(null),
    [channel, setChannel] = useState("SMS"),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const resource = useResource(
      mode +
        "?" +
        query({
          q: search,
          page: String(page),
          size: "100",
          status,
          ...(params.has("minDays")
            ? {
                minDays: params.get("minDays")!,
                maxDays: params.get("maxDays") || "100000",
              }
            : {}),
        }),
    ),
    d = resource.data;
  const title =
      mode === "defaulters"
        ? t("Defaulters")
        : mode === "outstanding"
          ? t("Outstanding")
          : t("Students"),
    intro =
      mode === "defaulters"
        ? t("DefaulterIntro")
        : mode === "outstanding"
          ? t("OutstandingIntro")
          : t("StudentIntro");
  const columns = [
    {
      key: "name",
      label: t("Student"),
      render: (r: Row) => (
        <StudentCell row={r} onClick={() => router.push("/students/" + r.id)} />
      ),
    },
    {
      key: "class_name",
      label: t("Class"),
      render: (r: Row) => (
        <div>
          <span className="class-tag">
            {r.class_name} {r.section_name}
          </span>
          {r.stream_name && <small className="cell-sub">{r.stream_name}</small>}
        </div>
      ),
    },
    {
      key: "parent_name",
      label: t("Guardian"),
      render: (r: Row) => (
        <div>
          {r.parent_name || "—"}
          <small className="cell-sub">{r.mobile}</small>
        </div>
      ),
    },
    {
      key: "total_paise",
      label: t("Total"),
      align: "right" as const,
      render: (r: Row) => money(r.total_paise),
    },
    {
      key: "paid_paise",
      label: t("Paid"),
      align: "right" as const,
      render: (r: Row) => money(r.paid_paise),
    },
    {
      key: "outstanding_paise",
      label: mode === "defaulters" ? "Overdue" : "Outstanding",
      align: "right" as const,
      render: (r: Row) => (
        <strong className={r.overdue_paise > 0 ? "amount-overdue" : ""}>
          {money(mode === "defaulters" ? r.overdue_paise : r.outstanding_paise)}
        </strong>
      ),
    },
    {
      key: "status",
      label: t("Status"),
      render: (r: Row) => (
        <Status
          value={
            mode === "students"
              ? r.status
              : r.overdue_paise > 0
                ? "Overdue"
                : "Upcoming"
          }
        />
      ),
    },
    {
      key: "actions",
      label: "",
      render: (r: Row) =>
        mode === "students" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/students/" + r.id)}
          >
            View profile
          </Button>
        ) : collect ? (
          <Button variant="outline" size="sm" onClick={() => setRemind(r)}>
            <Send size={14} />
            Remind
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <PageHead
        title={title}
        description={
          params.has("minDays")
            ? `${intro} Showing installments overdue ${params.get("minDays")}–${params.get("maxDays")} days.`
            : intro
        }
        eyebrow={"WORKSPACE / " + title.toUpperCase()}
        actions={
          <>
            {mode === "students" ? (
              <>
                {admin && (
                  <Button variant="outline" onClick={() => setImport(true)}>
                    <Upload size={16} />
                    {t("Import")}
                  </Button>
                )}
                {admin && (
                  <Button onClick={() => setAdd(true)}>
                    <Plus size={17} />
                    {t("AddStudent")}
                  </Button>
                )}
              </>
            ) : (
              <ExportButton report={mode} />
            )}
          </>
        }
      />
      {mode !== "students" && (
        <div className="notice-bar">
          <span className="notice-icon">
            <Users size={18} />
          </span>
          <div>
            <strong>
              {d?.total || 0} students{" "}
              {mode === "defaulters"
                ? "have overdue installments"
                : "have outstanding fees"}
            </strong>
            <span>
              Amounts reflect payments, refunds and approved fee adjustments.
            </span>
          </div>
        </div>
      )}
      <Card>
        <div className="table-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search name, admission number or mobile"
          />
          {mode === "students" && (
            <Picker
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              placeholder="Student status"
              options={[
                { value: "", label: "All statuses" },
                ...[
                  "Active",
                  "Inactive",
                  "Transferred",
                  "Graduated",
                  "Left",
                  "Suspended",
                ].map((v) => ({ value: v, label: v })),
              ]}
            />
          )}
          <span className="record-count">{d?.total || 0} students</span>
        </div>
        {resource.error ? (
          <Failure message={resource.error} retry={resource.retry} />
        ) : (
          <DataTable
            virtualized
            columns={
              finance
                ? columns
                : columns.filter(
                    (c) =>
                      ![
                        "total_paise",
                        "paid_paise",
                        "outstanding_paise",
                      ].includes(c.key),
                  )
            }
            rows={d?.rows || []}
            loading={resource.loading}
            total={d?.total}
            size={100}
            page={page}
            onPage={setPage}
          />
        )}
      </Card>
      <StudentForm open={add} onClose={() => setAdd(false)} />
      <ImportDialog
        kind="students"
        open={importOpen}
        onClose={() => setImport(false)}
      />
      <FormDialog
        open={!!remind}
        onClose={() => setRemind(null)}
        title="Send payment reminder"
        description={remind?.name + " · " + money(remind?.outstanding_paise)}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("notifications", {
              method: "POST",
              body: { studentIds: [remind!.id], channel },
            });
            toast.success(
              "Reminder queued. Delivery requires a connected provider.",
            );
            refresh();
            setRemind(null);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        busy={busy}
        submitLabel="Queue reminder"
      >
        <Field label="Channel">
          <Picker
            value={channel}
            onChange={setChannel}
            options={["SMS", "WhatsApp", "Email"].map((v) => ({
              value: v,
              label: v,
            }))}
          />
        </Field>
        <p className="form-note">
          Recipient:{" "}
          {channel === "Email" ? remind?.parent_email : remind?.mobile}
        </p>
      </FormDialog>
    </>
  );
}
