"use client";
import { CatalogDialog } from "@/components/campus/CatalogDialog";
import { Row, useApp } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Field,
  FormDialog,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, GraduationCap, Plus } from "lucide-react";
import { useState } from "react";
import { RolloverWizard } from "./RolloverWizard";
import { toast } from "sonner";
export function Academic({ initialTab = "years" }: { initialTab?: string }) {
  const { boot, t, scope, request, reload, admin, query, refresh } =
      useApp("academics.manage"),
    [rollover, setRollover] = useState(false),
    [catalog, setCatalog] = useState(""),
    [promote, setPromote] = useState(false),
    [targetYear, setTargetYear] = useState(""),
    [targetSection, setTargetSection] = useState(""),
    [students, setStudents] = useState<Row[]>([]),
    [ids, setIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(
      ["years", "classes", "sections", "streams", "campuses"].includes(
        initialTab,
      )
        ? initialTab
        : "years",
    );
  const title =
    tab === "years"
      ? "Academic year"
      : tab === "classes"
        ? "Class / program"
        : tab === "sections"
          ? "Section"
          : tab === "streams"
            ? "Stream"
            : "Campus";
  return (
    <>
      <RolloverWizard open={rollover} onClose={() => setRollover(false)} />
      <PageHead
        eyebrow="ADMINISTRATION / ACADEMIC"
        title={t("Academic")}
        description={t("AcademicIntro")}
        actions={
          admin && (
            <>
              <Button variant="outline" onClick={() => setRollover(true)}>
                Year rollover
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const data = await request(
                      "students?" + query({ size: "100" }),
                    );
                    setStudents(data.rows);
                    setIds([]);
                    setTargetYear("");
                    setTargetSection("");
                    setPromote(true);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <GraduationCap size={16} />
                Promote students
              </Button>
              <Button onClick={() => setCatalog(tab)}>
                <Plus size={16} />
                Add {title.toLowerCase()}
              </Button>
            </>
          )
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="page-tabs">
          <TabsTrigger value="years">Academic years</TabsTrigger>
          <TabsTrigger value="classes">Classes & programs</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="streams">Streams</TabsTrigger>
          <TabsTrigger value="campuses">Campuses</TabsTrigger>
        </TabsList>
        <TabsContent value="years">
          <div className="year-grid">
            {boot.years.map((y: Row) => (
              <Card key={y.id} className="year-card">
                <div>
                  <span className="structure-icon">
                    <CalendarDays size={22} />
                  </span>
                  <Status value={y.status} />
                </div>
                <h2>{y.name}</h2>
                <p>
                  {y.start_date} — {y.end_date}
                </p>
                <span className="year-info">
                  Fee structures and financial records are isolated by academic
                  year.
                </span>
                {admin && (
                  <Field label="Year status">
                    <Picker
                      value={y.status}
                      onChange={async (value) => {
                        try {
                          await request("years/" + y.id, {
                            method: "PATCH",
                            body: { status: value },
                          });
                          await reload();
                          refresh();
                          toast.success("Academic year updated.");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                      options={["Draft", "Active", "Closed", "Archived"].map(
                        (v) => ({ value: v, label: v }),
                      )}
                    />
                  </Field>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="classes">
          <Card title="Classes and programs">
            <DataTable
              rows={boot.classes}
              columns={[
                { key: "name", label: "Class / program" },
                { key: "level", label: "Education level" },
                { key: "department", label: "Department / course" },
                { key: "sort_order", label: "Display order" },
                {
                  key: "active",
                  label: "Status",
                  render: (r) => (
                    <Status value={r.active ? "Active" : "Inactive"} />
                  ),
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="sections">
          <Card title="Sections in the selected academic year">
            <DataTable
              rows={boot.sections.filter(
                (r: Row) => r.academic_year_id === scope.year,
              )}
              columns={[
                { key: "class_name", label: "Class" },
                { key: "name", label: "Section" },
                { key: "stream_name", label: "Stream" },
                {
                  key: "campus_id",
                  label: "Campus",
                  render: (r) =>
                    boot.campuses.find((c: Row) => c.id === r.campus_id)?.name,
                },
                { key: "capacity", label: "Capacity" },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="streams">
          <Card title="Streams">
            <DataTable
              rows={boot.streams}
              columns={[
                { key: "name", label: "Stream" },
                {
                  key: "created_at",
                  label: "Created",
                  render: (r) => r.created_at.slice(0, 10),
                },
              ]}
            />
          </Card>
        </TabsContent>
        <TabsContent value="campuses">
          <Card title="Campuses">
            <DataTable
              rows={boot.campuses}
              columns={[
                { key: "name", label: "Campus" },
                { key: "address", label: "Address" },
              ]}
            />
          </Card>
        </TabsContent>
      </Tabs>
      <CatalogDialog
        kind={catalog || "years"}
        open={!!catalog}
        onClose={() => setCatalog("")}
      />
      <FormDialog
        open={promote}
        onClose={() => setPromote(false)}
        title="Promote students"
        description="Create enrollments in a new year while retaining every earlier fee record."
        wide
        busy={busy}
        submitLabel={"Promote " + ids.length + " students"}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("students/promote", {
              method: "POST",
              body: {
                studentIds: ids,
                yearId: targetYear,
                sectionId: targetSection,
              },
            });
            toast.success(ids.length + " students promoted.");
            refresh();
            setPromote(false);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Target academic year">
            <Picker
              value={targetYear}
              onChange={(v) => {
                setTargetYear(v);
                setTargetSection("");
              }}
              options={[
                { value: "", label: "Choose next academic year" },
                ...boot.years
                  .filter((y: Row) => y.id !== scope.year)
                  .map((y: Row) => ({ value: y.id, label: y.name })),
              ]}
            />
          </Field>
          <Field label="Target class / section / stream">
            <Picker
              value={targetSection}
              onChange={setTargetSection}
              options={[
                { value: "", label: "Choose section" },
                ...boot.sections
                  .filter((s: Row) => s.academic_year_id === targetYear)
                  .map((s: Row) => ({
                    value: s.id,
                    label:
                      s.class_name +
                      " " +
                      s.name +
                      (s.stream_name ? " · " + s.stream_name : ""),
                  })),
              ]}
            />
          </Field>
        </div>
        <DataTable
          rows={students}
          columns={[
            {
              key: "selected",
              label: "Select",
              render: (r) => (
                <Checkbox
                  checked={ids.includes(r.id)}
                  onCheckedChange={(v) =>
                    setIds(
                      v === true
                        ? [...ids, r.id]
                        : ids.filter((id) => id !== r.id),
                    )
                  }
                  aria-label={"Promote " + r.name}
                />
              ),
            },
            { key: "name", label: "Student" },
            { key: "class_name", label: "Current class" },
            { key: "admission_number", label: "Admission number" },
          ]}
        />
      </FormDialog>
    </>
  );
}
