"use client";
import { Row, useApp } from "@/components/campus/context";
import { DraftNotice } from "@/components/campus/DraftNotice";
import { Field, FormDialog, Input, Picker } from "@/components/campus/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalDraft } from "@/hooks/use-local-draft";
import { fieldErrors, studentFormSchema } from "@/lib/form-validation";
import { useState } from "react";
import { toast } from "sonner";
export function StudentForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { boot, scope, request, refresh, institutionId } = useApp(),
    [busy, setBusy] = useState(false),
    [d, setD] = useState<Row>({
      name: "",
      admissionNumber: "",
      sectionId: "",
      gender: "Not specified",
      parentName: "",
      mobile: "",
      email: "",
      dob: "",
      rollNumber: "",
      bloodGroup: "",
      aadhaarLast4: "",
      previousSchool: "",
    });
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [key]: e.target.value });
  const [submitted, setSubmitted] = useState(false);
  const draft = useLocalDraft<Row>({
    storageKey: [
      boot.user.id || boot.user.email,
      institutionId,
      scope.year,
      "student",
    ].join(":"),
    open,
    value: d,
    restore: (value) =>
      setD({
        ...d,
        ...Object.fromEntries(
          Object.entries(value).filter(
            ([k, v]) => k in d && typeof v === "string",
          ),
        ),
      }),
    reset: () => {
      setSubmitted(false);
      setD({
        name: "",
        admissionNumber: "",
        sectionId: "",
        gender: "Not specified",
        parentName: "",
        mobile: "",
        email: "",
        dob: "",
        rollNumber: "",
        bloodGroup: "",
        aadhaarLast4: "",
        previousSchool: "",
      });
    },
  });
  const errors = fieldErrors(studentFormSchema, d);
  const error = (key: string) =>
    submitted || d[key] ? errors[key] : undefined;
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Add student"
      description={
        "Admission for " +
        (boot.years.find((y: Row) => y.id === scope.year)?.name ||
          "selected academic year")
      }
      busy={busy}
      wide
      submitLabel="Add student"
      onSubmit={async (e) => {
        e.preventDefault();
        setSubmitted(true);
        const valid = studentFormSchema.safeParse(d);
        if (!valid.success) {
          toast.error("Check the highlighted fields in each tab.");
          return;
        }
        setBusy(true);
        try {
          const body = Object.fromEntries(
            Object.entries({ ...d, yearId: scope.year }).filter(
              ([_, v]) => v !== "",
            ),
          );
          await request("students", { method: "POST", body });
          toast.success("Student and guardian records saved.");
          draft.clear();
          refresh();
          onClose();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <DraftNotice status={draft.status} onDiscard={draft.discard} />
      {submitted && Object.keys(errors).length > 0 && (
        <p role="alert" className="text-sm text-red-600">
          Check student and guardian details:{" "}
          {Object.values(errors).join(" · ")}
        </p>
      )}
      <Tabs defaultValue="student">
        <TabsList className="form-tabs">
          <TabsTrigger value="student">Student details</TabsTrigger>
          <TabsTrigger value="guardian">Parent / guardian</TabsTrigger>
          <TabsTrigger value="additional">Additional details</TabsTrigger>
        </TabsList>
        <TabsContent value="student">
          <div className="form-grid">
            <Field label="Student name" error={error("name")} required>
              <Input
                required
                value={d.name}
                onChange={set("name")}
                placeholder="Full name"
              />
            </Field>
            <Field
              label="Admission number"
              error={error("admissionNumber")}
              required
            >
              <Input
                required
                value={d.admissionNumber}
                onChange={set("admissionNumber")}
                placeholder="CSA/26/0101"
              />
            </Field>
            <Field
              label="Class / section"
              error={error("sectionId")}
              required
              className="span-2"
            >
              <Picker
                value={d.sectionId}
                onChange={(v) => setD({ ...d, sectionId: v })}
                placeholder="Choose class and section"
                options={[
                  { value: "", label: "Choose class and section" },
                  ...boot.sections
                    .filter((s: Row) => s.academic_year_id === scope.year)
                    .map((s: Row) => ({
                      value: s.id,
                      label: `${s.class_name} · ${s.name}${s.stream_name ? " · " + s.stream_name : ""}`,
                    })),
                ]}
              />
            </Field>
            <Field label="Date of birth" error={error("dob")}>
              <Input type="date" value={d.dob} onChange={set("dob")} />
            </Field>
            <Field label="Gender">
              <Picker
                value={d.gender}
                onChange={(v) => setD({ ...d, gender: v })}
                options={["Not specified", "Male", "Female", "Other"].map(
                  (v) => ({ value: v, label: v }),
                )}
              />
            </Field>
            <Field label="Roll number" error={error("rollNumber")}>
              <Input value={d.rollNumber} onChange={set("rollNumber")} />
            </Field>
            <Field label="Blood group" error={error("bloodGroup")}>
              <Input
                value={d.bloodGroup}
                onChange={set("bloodGroup")}
                placeholder="e.g. O+"
              />
            </Field>
          </div>
        </TabsContent>
        <TabsContent value="guardian">
          <div className="form-grid">
            <Field
              label="Parent / guardian name"
              error={error("parentName")}
              required
              className="span-2"
            >
              <Input
                value={d.parentName}
                onChange={set("parentName")}
                placeholder="Full name"
              />
            </Field>
            <Field label="Mobile number" error={error("mobile")} required>
              <Input
                value={d.mobile}
                onChange={set("mobile")}
                pattern="[6-9][0-9]{9}"
                inputMode="tel"
                placeholder="10-digit mobile"
              />
            </Field>
            <Field label="Email" error={error("email")}>
              <Input
                type="email"
                value={d.email}
                onChange={set("email")}
                placeholder="parent@example.com"
              />
            </Field>
            <p className="form-note span-2">
              You can link an existing guardian to multiple children from the
              student profile.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="additional">
          <div className="form-grid">
            <Field
              label="Aadhaar last 4 digits"
              error={error("aadhaarLast4")}
              hint="Only the masked identifier is stored."
            >
              <Input
                value={d.aadhaarLast4}
                onChange={set("aadhaarLast4")}
                pattern="[0-9]{4}"
                maxLength={4}
              />
            </Field>
            <Field label="Previous school" error={error("previousSchool")}>
              <Input
                value={d.previousSchool}
                onChange={set("previousSchool")}
              />
            </Field>
          </div>
        </TabsContent>
      </Tabs>
    </FormDialog>
  );
}
