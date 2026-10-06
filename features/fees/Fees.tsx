"use client";
import { CatalogDialog } from "@/components/campus/CatalogDialog";
import { Row, useApp, useResource } from "@/components/campus/context";
import { ImportDialog } from "@/components/campus/ImportDialog";
import {
  Button,
  Card,
  DataTable,
  Failure,
  Field,
  FormDialog,
  Input,
  PageHead,
  Picker,
  Status,
  money,
} from "@/components/campus/ui";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Layers3, Plus, Settings2, Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StructureForm } from "./StructureForm";
export function Fees() {
  const { boot, scope, query, t, admin, request, refresh, reload } =
      useApp("fees.manage"),
    params = useSearchParams(),
    [page, setPage] = useState(1),
    r = useResource("structures?" + query({ size: "100", page: String(page) })),
    [create, setCreate] = useState(admin && params.get("new") === "1"),
    [catalog, setCatalog] = useState(""),
    [bulk, setBulk] = useState(false),
    [structure, setStructure] = useState(""),
    [benefit, setBenefit] = useState(""),
    [preview, setPreview] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [importOpen, setImport] = useState(false),
    [component, setComponent] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [items, setItems] = useState<Row[]>([]);
  useEffect(() => setPage(1), [scope.year, scope.class, scope.section]);
  const structures = r.data?.rows || [];
  return (
    <>
      <PageHead
        eyebrow="FINANCE / FEE STRUCTURES"
        title={t("Fees")}
        description={t("FeesIntro")}
        actions={
          admin && (
            <>
              <Button variant="outline" onClick={() => setImport(true)}>
                <Upload size={16} />
                Import
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setBulk(true);
                }}
              >
                <Layers3 size={16} />
                Generate fees
              </Button>
              <Button onClick={() => setCreate(true)}>
                <Plus size={16} />
                New structure
              </Button>
            </>
          )
        }
      />
      <Tabs defaultValue="structures">
        <TabsList className="page-tabs">
          <TabsTrigger value="structures">Fee structures</TabsTrigger>
          <TabsTrigger value="components">
            Fee components{" "}
            <span className="tab-count">{boot.components.length}</span>
          </TabsTrigger>
          <TabsTrigger value="benefits">Discounts & scholarships</TabsTrigger>
        </TabsList>
        <TabsContent value="structures">
          {r.error ? (
            <Failure message={r.error} retry={r.retry} />
          ) : (
            <>
              <Card>
                <DataTable
                  virtualized
                  rows={structures}
                  loading={r.loading}
                  page={page}
                  size={100}
                  total={r.data?.total}
                  onPage={setPage}
                  columns={[
                    { key: "name", label: "Fee structure" },
                    { key: "class_name", label: "Class" },
                    { key: "stream_name", label: "Stream" },
                    {
                      key: "total_paise",
                      label: "Annual amount",
                      align: "right",
                      render: (s) => money(s.total_paise),
                    },
                    { key: "assigned", label: "Students" },
                    {
                      key: "status",
                      label: "Status",
                      render: (s) => <Status value={s.status} />,
                    },
                    {
                      key: "actions",
                      label: "",
                      render: (s) => (
                        <div className="inline-actions">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const data = await request(
                                  "structure-items?" +
                                    query({ structure: s.id, size: "100" }),
                                );
                                setItems(data.rows);
                                setDetail(s);
                              } catch (e) {
                                toast.error((e as Error).message);
                              }
                            }}
                          >
                            View
                          </Button>
                          {admin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setStructure(s.id);
                                setPreview(null);
                                setBulk(true);
                              }}
                            >
                              Assign fees
                            </Button>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          )}
        </TabsContent>
        <TabsContent value="components">
          <Card
            title="Fee components"
            action={
              admin && (
                <Button onClick={() => setCatalog("components")}>
                  <Plus size={15} />
                  Add component
                </Button>
              )
            }
          >
            <DataTable
              virtualized
              rows={boot.components}
              columns={[
                { key: "name", label: "Component" },
                { key: "category", label: "Category" },
                { key: "sort_order", label: "Order" },
                {
                  key: "active",
                  label: "Status",
                  render: (c) => (
                    <Status value={c.active ? "Active" : "Inactive"} />
                  ),
                },
                {
                  key: "actions",
                  label: "",
                  render: (c) =>
                    admin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setComponent({ ...c, active: !!c.active })
                        }
                      >
                        <Settings2 size={15} />
                        Edit
                      </Button>
                    ),
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="benefits">
          <Card
            title="Discount & scholarship rules"
            action={
              admin && (
                <Button onClick={() => setCatalog("benefits")}>
                  <Plus size={15} />
                  Add benefit
                </Button>
              )
            }
          >
            <DataTable
              virtualized
              rows={boot.benefits}
              columns={[
                { key: "name", label: "Benefit" },
                { key: "kind", label: "Type" },
                {
                  key: "value",
                  label: "Value",
                  render: (b) =>
                    b.calculation === "Percentage"
                      ? b.value / 100 + "%"
                      : money(b.value),
                },
                { key: "eligibility", label: "Eligibility" },
                {
                  key: "auto_apply",
                  label: "Application",
                  render: (b) =>
                    b.auto_apply
                      ? "Automatic when eligible"
                      : "Manual approval",
                },
                {
                  key: "valid_until",
                  label: "Validity",
                  render: (b) => b.valid_until || "No expiry",
                },
                {
                  key: "status",
                  label: "Status",
                  render: (b) => <Status value={b.status} />,
                },
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>
      <StructureForm open={create} onClose={() => setCreate(false)} />
      <CatalogDialog
        open={!!catalog}
        kind={catalog || "components"}
        onClose={() => setCatalog("")}
      />
      <ImportDialog
        kind="structures"
        open={importOpen}
        onClose={() => setImport(false)}
      />
      <FormDialog
        open={bulk}
        onClose={() => setBulk(false)}
        title="Generate student fees"
        description="Preview applicable students before creating assignments and invoices."
        wide
      >
        {!preview ? (
          <>
            <Field label="Fee structure">
              <Picker
                value={structure}
                onChange={setStructure}
                options={[
                  { value: "", label: "Choose fee structure" },
                  ...structures.map((s: Row) => ({
                    value: s.id,
                    label: s.name + " · " + money(s.total_paise),
                  })),
                ]}
              />
            </Field>
            <Field label="Approved benefit (optional)">
              <Picker
                value={benefit}
                onChange={setBenefit}
                options={[
                  { value: "", label: "Standard class fees" },
                  ...boot.benefits.map((b: Row) => ({
                    value: b.id,
                    label: b.name,
                  })),
                ]}
              />
            </Field>
            <Button
              disabled={!structure || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setPreview(
                    await request("fees/bulk", {
                      method: "POST",
                      body: {
                        structureId: structure,
                        benefitId: benefit || undefined,
                        commit: false,
                      },
                    }),
                  );
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Preparing preview..." : "Preview assignments"}
            </Button>
          </>
        ) : (
          <>
            <div className="bulk-summary">
              <CheckCircle2 size={20} />
              <span>
                <strong>{preview.count} students ready</strong>
                <small>Existing assignments are skipped.</small>
              </span>
              <b>{money(preview.total)}</b>
            </div>
            <DataTable
              virtualized
              rows={preview.rows}
              columns={[
                { key: "name", label: "Student" },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => <Status value={r.status} />,
                },
                {
                  key: "amount",
                  label: "Annual fee",
                  align: "right",
                  render: (r) => money(r.amount),
                },
              ]}
            />
            <div className="import-footer">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Back
              </Button>
              <Button
                disabled={busy || !preview.count}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const data = await request("fees/bulk", {
                      method: "POST",
                      body: {
                        structureId: structure,
                        benefitId: benefit || undefined,
                        commit: true,
                      },
                    });
                    toast.success(
                      data.count + " fee assignments and invoices generated.",
                    );
                    refresh();
                    setBulk(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Generating..."
                  : "Generate " + preview.count + " invoices"}
              </Button>
            </div>
          </>
        )}
      </FormDialog>
      <FormDialog
        open={!!component}
        onClose={() => setComponent(null)}
        title="Edit fee component"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await request("components/" + component!.id, {
              method: "PATCH",
              body: {
                name: component!.name,
                category: component!.category,
                active: component!.active,
                sortOrder: Number(component!.sort_order),
              },
            });
            toast.success("Fee component updated.");
            await reload();
            refresh();
            setComponent(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <Field label="Name">
          <Input
            value={component?.name || ""}
            onChange={(e) =>
              setComponent({ ...component, name: e.target.value })
            }
          />
        </Field>
        <Field label="Category">
          <Input
            value={component?.category || ""}
            onChange={(e) =>
              setComponent({ ...component, category: e.target.value })
            }
          />
        </Field>
        <Field label="Display order">
          <Input
            type="number"
            value={component?.sort_order || 0}
            onChange={(e) =>
              setComponent({ ...component, sort_order: e.target.value })
            }
          />
        </Field>
        <Field label="Enabled">
          <Switch
            checked={component?.active || false}
            onCheckedChange={(v) => setComponent({ ...component, active: v })}
          />
        </Field>
      </FormDialog>
      <FormDialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name || "Fee structure"}
        description={detail?.frequency + " installment plan"}
      >
        <DataTable
          virtualized
          rows={items}
          columns={[
            { key: "name", label: "Fee component" },
            {
              key: "amount_paise",
              label: "Annual amount",
              align: "right",
              render: (r) => money(r.amount_paise),
            },
          ]}
        />
        <div className="schedule-chips">
          {detail &&
            JSON.parse(detail.schedule).map((date: string, i: number) => (
              <span key={date}>
                {i + 1}. {date}
              </span>
            ))}
        </div>
        <strong className="detail-total">
          Annual fee: {money(detail?.total_paise)}
        </strong>
      </FormDialog>
    </>
  );
}
