"use client";
import { CatalogDialog } from "@/components/campus/CatalogDialog";
import { Row, useApp, useResource } from "@/components/campus/context";
import { ImportDialog } from "@/components/campus/ImportDialog";
import {
  Button,
  Card,
  DataTable,
  Failure,
  FormDialog,
  Initials,
  PageHead,
  SearchBox,
} from "@/components/campus/ui";
import { Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
export function Parents() {
  const { t, query, admin } = useApp("students.manage"),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [add, setAdd] = useState(false),
    [importOpen, setImport] = useState(false),
    [details, setDetails] = useState<Row | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const r = useResource("parents?" + query({ q: search, page: String(page) }));
  return (
    <>
      <PageHead
        eyebrow="WORKSPACE / PARENTS"
        title={t("Parents")}
        description={t("ParentIntro")}
        actions={
          admin && (
            <>
              <Button variant="outline" onClick={() => setImport(true)}>
                <Upload size={16} />
                Import
              </Button>
              <Button onClick={() => setAdd(true)}>
                <Plus size={16} />
                Add guardian
              </Button>
            </>
          )
        }
      />
      <Card>
        <div className="table-toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search guardian, mobile or email"
          />
          <span className="record-count">{r.data?.total || 0} guardians</span>
        </div>
        {r.error ? (
          <Failure message={r.error} retry={r.retry} />
        ) : (
          <DataTable
            rows={r.data?.rows || []}
            loading={r.loading}
            total={r.data?.total}
            page={page}
            onPage={setPage}
            columns={[
              {
                key: "guardian_name",
                label: "Parent / guardian",
                render: (r) => (
                  <button
                    className="student-cell"
                    onClick={() => setDetails(r)}
                  >
                    <Initials name={r.guardian_name} />
                    <span>
                      <strong>{r.guardian_name}</strong>
                      <small>{r.relationship}</small>
                    </span>
                  </button>
                ),
              },
              { key: "mobile", label: "Mobile" },
              { key: "email", label: "Email" },
              {
                key: "children",
                label: "Children",
                render: (r) => (
                  <div>
                    <strong>
                      {r.children} {r.children === 1 ? "child" : "children"}
                    </strong>
                    <small className="cell-sub">{r.children_names}</small>
                  </div>
                ),
              },
              { key: "occupation", label: "Occupation" },
              {
                key: "actions",
                label: "",
                render: (r) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetails(r)}
                  >
                    View details
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      <CatalogDialog kind="parents" open={add} onClose={() => setAdd(false)} />
      <ImportDialog
        kind="parents"
        open={importOpen}
        onClose={() => setImport(false)}
      />
      <FormDialog
        open={!!details}
        onClose={() => setDetails(null)}
        title={details?.guardian_name || "Guardian"}
        description="Parent and linked children"
      >
        <div className="summary-lines">
          {[
            ["Father", details?.father_name],
            ["Mother", details?.mother_name],
            ["Guardian", details?.guardian_name],
            ["Relationship", details?.relationship],
            ["Mobile", details?.mobile],
            ["Email", details?.email],
            ["Address", details?.address],
            ["Occupation", details?.occupation],
            ["Children", details?.children_names],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{value || "—"}</b>
            </div>
          ))}
        </div>
        <p className="form-note">
          Grant parent portal access from Users & roles using this guardian’s
          email.
        </p>
      </FormDialog>
    </>
  );
}
