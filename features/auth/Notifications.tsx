"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Failure,
  FormDialog,
  PageHead,
  Status,
} from "@/components/campus/ui";
import { MessageSquare, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
export function Notifications({ audit = false }: { audit?: boolean }) {
  const { query, t, request, refresh, admin } = useApp(),
    [page, setPage] = useState(1),
    [details, setDetails] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    r = useResource(
      (audit ? "audit" : "notifications") + "?" + query({ page: String(page) }),
    );
  return (
    <>
      <PageHead
        eyebrow={"ADMINISTRATION / " + (audit ? "AUDIT LOGS" : "NOTIFICATIONS")}
        title={t(audit ? "Audit" : "Notifications")}
        description={t(audit ? "AuditIntro" : "NotificationIntro")}
        actions={
          !audit &&
          admin && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await request("notifications/process", {
                    method: "POST",
                    body: {},
                  });
                  toast.success(
                    "Delivery queued in the background. Refresh the register to see progress.",
                  );
                  refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Play size={16} />
              Process queue
            </Button>
          )
        }
      />
      {!audit && (
        <div className="notice-bar">
          <span className="notice-icon">
            <MessageSquare size={18} />
          </span>
          <div>
            <strong>
              Notification delivery is tracked separately from payment
              collection
            </strong>
            <span>
              Connect SMS, WhatsApp or Email providers in Settings to deliver
              queued reminders.
            </span>
          </div>
        </div>
      )}
      <Card
        action={
          <Button size="sm" variant="outline" onClick={r.retry}>
            Refresh status
          </Button>
        }
        title={audit ? "Audit register" : "Delivery register"}
      >
        {r.error ? (
          <Failure message={r.error} retry={r.retry} />
        ) : (
          <DataTable
            rows={r.data?.rows || []}
            loading={r.loading}
            total={r.data?.total}
            page={page}
            onPage={setPage}
            columns={
              audit
                ? [
                    {
                      key: "created_at",
                      label: "Timestamp",
                      render: (r) =>
                        new Date(r.created_at).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        }),
                    },
                    { key: "user_name", label: "User" },
                    { key: "action", label: "Action" },
                    { key: "entity", label: "Record type" },
                    { key: "ip", label: "IP" },
                    {
                      key: "actions",
                      label: "",
                      render: (r) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetails(r)}
                        >
                          View change
                        </Button>
                      ),
                    },
                  ]
                : [
                    {
                      key: "created_at",
                      label: "Queued",
                      render: (r) => r.created_at.slice(0, 10),
                    },
                    { key: "recipient", label: "Recipient" },
                    { key: "student_name", label: "Student" },
                    { key: "channel", label: "Channel" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r) => <Status value={r.status} />,
                    },
                    {
                      key: "sent_at",
                      label: "Sent",
                      render: (r) => r.sent_at?.slice(0, 10) || "—",
                    },
                    {
                      key: "actions",
                      label: "",
                      render: (r) => (
                        <div className="inline-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetails(r)}
                          >
                            View message
                          </Button>
                          {r.status === "Failed" && admin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Retry message"
                              onClick={async () => {
                                try {
                                  await request(
                                    "notifications/" + r.id + "/retry",
                                    { method: "POST", body: {} },
                                  );
                                  refresh();
                                  toast.success("Message queued again.");
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                              }}
                            >
                              <RotateCcw size={15} />
                            </Button>
                          )}
                        </div>
                      ),
                    },
                  ]
            }
          />
        )}
      </Card>
      <FormDialog
        open={!!details}
        onClose={() => setDetails(null)}
        title={audit ? "Audit entry" : "Notification"}
        description={audit ? details?.action : details?.recipient}
      >
        {audit ? (
          <>
            <p>
              {details?.user_name} · {details?.created_at}
            </p>
            <FieldBlock label="Previous value" value={details?.old_value} />
            <FieldBlock label="New value" value={details?.new_value} />
          </>
        ) : (
          <>
            <div className="message-preview">{details?.message}</div>
            <div className="summary-lines">
              <div>
                <span>Channel</span>
                <b>{details?.channel}</b>
              </div>
              <div>
                <span>Status</span>
                <Status value={details?.status || "Queued"} />
              </div>
              <div>
                <span>Reference</span>
                <b>{details?.reference_id || "—"}</b>
              </div>
              <div>
                <span>Attempts</span>
                <b>{details?.attempts}</b>
              </div>
              <div>
                <span>Delivery issue</span>
                <b>{details?.last_error || "—"}</b>
              </div>
            </div>
          </>
        )}
      </FormDialog>
    </>
  );
}
function FieldBlock({ label, value }: { label: string; value: string }) {
  let text = value || "—";
  try {
    text = JSON.stringify(JSON.parse(value), null, 2);
  } catch {}
  return (
    <div className="audit-value">
      <strong>{label}</strong>
      <pre>{text}</pre>
    </div>
  );
}
