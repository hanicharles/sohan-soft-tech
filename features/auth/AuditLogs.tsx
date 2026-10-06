"use client";
import { useState } from "react";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  Failure,
  Input,
  PageHead,
  Picker,
} from "@/components/campus/ui";
import { Clock3, ShieldCheck } from "lucide-react";
export function AuditLogs() {
  const { query } = useApp(),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [kind, setKind] = useState(""),
    r = useResource(
      "audit?" + query({ page: String(page), q, category: kind }),
    );
  function pretty(value: string | null) {
    if (!value) return "—";
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return (
    <>
      <PageHead
        eyebrow="ADMINISTRATION / IMMUTABLE AUDIT"
        title="Audit trail"
        description="Timestamped approvals, fee adjustments, access changes and financial corrections. Historical records cannot be edited."
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          aria-label="Search audit"
          placeholder="Search action, user or record"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Picker
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "All actions" },
            { value: "approval", label: "Supervisor approvals" },
            { value: "waiver", label: "Concessions & penalty waivers" },
            { value: "backdated", label: "Backdated corrections" },
          ]}
        />
      </div>
      {r.error ? (
        <Failure message={r.error} retry={r.retry} />
      ) : (
        <Card>
          {r.loading && !r.data ? (
            <p>Loading audit history…</p>
          ) : !r.data?.rows.length ? (
            <p>No audit records match these filters.</p>
          ) : (
            <ol className="divide-y">
              {r.data.rows.map((a: Row) => (
                <li key={a.id} className="py-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      className="mt-1 shrink-0 text-blue-700"
                      size={20}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h2 className="font-medium">{a.action}</h2>
                        <time className="flex items-center gap-1 text-sm text-slate-500">
                          <Clock3 size={14} />
                          {new Date(a.created_at).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })}{" "}
                          IST
                        </time>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {a.user_name} · {a.entity} · {a.entity_id}
                      </p>
                      {a.support_session_id && (
                        <p className="text-sm text-amber-700">
                          Platform support session
                        </p>
                      )}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-blue-700">
                          View recorded change
                        </summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {[
                            ["Before", a.old_value],
                            ["After", a.new_value],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <strong className="text-sm">{label}</strong>
                              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-sm">
                                {pretty(value)}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 flex justify-end gap-3">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="self-center text-sm">Page {page}</span>
            <Button
              variant="outline"
              disabled={page * 25 >= (r.data?.total || 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
