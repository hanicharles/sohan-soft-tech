import { z } from "zod";
import { parseMoney } from "../lib/money";
import { batch, insert, one, Row, stamps, today, uuid } from "./db";
import { Actor, ApiError, audit, own, permit } from "./security";
import { checkCapacity } from "./tenancy";
export const textField = z.string().trim().min(1).max(160);
export const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const mobileField = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");
export const emailField = z.string().email().or(z.literal("")).optional();
const amountField = z.string().transform((v) => parseMoney(v));
const studentSchema = z.object({
  name: textField,
  admissionNumber: textField,
  yearId: z.string(),
  sectionId: z.string(),
  parentId: z.string().optional(),
  parentName: z.string().max(160).optional(),
  mobile: mobileField.optional(),
  email: emailField,
  dob: dateField.optional().or(z.literal("")),
  gender: z
    .enum(["Male", "Female", "Other", "Not specified"])
    .default("Not specified"),
  rollNumber: z.string().max(30).optional(),
  bloodGroup: z.string().max(5).optional(),
  aadhaarLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .or(z.literal("")),
  admissionDate: dateField.default(today()),
  previousSchool: z.string().max(160).default(""),
  status: z
    .enum([
      "Active",
      "Inactive",
      "Transferred",
      "Graduated",
      "Left",
      "Suspended",
    ])
    .default("Active"),
});
export async function createStudent(
  actor: Actor,
  input: unknown,
  commit = true,
) {
  permit(actor, "students.manage");
  await checkCapacity(actor, "students");
  const d = studentSchema.parse(input),
    year = await own(actor, "academic_years", d.yearId),
    section = await own(actor, "sections", d.sectionId, d.yearId);
  if (["Closed", "Archived"].includes(year.status))
    throw new ApiError(409, "YEAR_CLOSED", "Choose an open academic year.");
  if (
    await one(
      "SELECT id FROM students WHERE institution_id=? AND admission_number=?",
      [actor.institutionId, d.admissionNumber],
    )
  )
    throw new ApiError(
      409,
      "DUPLICATE_ADMISSION",
      "This admission number is already in use.",
    );
  const id = uuid(),
    base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
    record = {
      id,
      ...base,
      name: d.name,
      admission_number: d.admissionNumber,
      dob: d.dob || null,
      gender: d.gender,
      admission_date: d.admissionDate,
      previous_school: d.previousSchool,
      status: d.status,
      blood_group: d.bloodGroup || null,
      aadhaar_last4: d.aadhaarLast4 || null,
    },
    statements = [
      insert("students", record),
      insert("enrollments", {
        id: uuid(),
        ...base,
        student_id: id,
        academic_year_id: d.yearId,
        section_id: section.id,
        roll_number: d.rollNumber || null,
      }),
    ];
  let parentId = d.parentId;
  if (parentId) await own(actor, "parents", parentId);
  else if (d.parentName && d.mobile) {
    parentId = uuid();
    statements.push(
      insert("parents", {
        id: parentId,
        ...base,
        guardian_name: d.parentName,
        father_name: d.parentName,
        mobile: d.mobile,
        email: d.email || null,
        relationship: "Guardian",
      }),
    );
  }
  if (parentId)
    statements.push(
      insert("student_parents", {
        id: uuid(),
        institution_id: actor.institutionId,
        student_id: id,
        parent_id: parentId,
        is_primary: 1,
      }),
    );
  statements.push(
    audit(actor, "Added student", "students", id, null, {
      ...d,
      aadhaarLast4: d.aadhaarLast4 ? "****" : null,
    }),
  );
  if (commit) await batch(statements);
  return { id, statements };
}
export async function createCatalog(
  actor: Actor,
  kind: string,
  input: unknown,
) {
  permit(
    actor,
    kind === "parents"
      ? "students.manage"
      : ["components", "benefits", "structures"].includes(kind)
        ? "fees.manage"
        : "academics.manage",
  );
  const id = uuid(),
    base = { id, institution_id: actor.institutionId, ...stamps(actor.userId) };
  let table = "",
    record: Row = base,
    extra: D1PreparedStatement[] = [];
  switch (kind) {
    case "years": {
      const d = z
        .object({
          name: textField,
          startDate: dateField,
          endDate: dateField,
          status: z
            .enum(["Draft", "Active", "Closed", "Archived"])
            .default("Draft"),
        })
        .parse(input);
      if (d.startDate >= d.endDate)
        throw new ApiError(
          422,
          "INVALID_DATE_RANGE",
          "End date must follow start date.",
        );
      table = "academic_years";
      record = {
        ...base,
        name: d.name,
        start_date: d.startDate,
        end_date: d.endDate,
        status: d.status,
      };
      break;
    }
    case "classes": {
      const d = z
        .object({
          name: textField,
          level: z.enum([
            "Pre-Primary",
            "School",
            "PU College",
            "Degree",
            "Course",
          ]),
          department: z.string().max(160).optional(),
        })
        .parse(input);
      table = "classes";
      record = {
        ...base,
        name: d.name,
        level: d.level,
        department: d.department || null,
        sort_order: (await one(
          "SELECT COUNT(*) n FROM classes WHERE institution_id=?",
          [actor.institutionId],
        ))!.n,
      };
      break;
    }
    case "sections": {
      const d = z
        .object({
          name: textField,
          yearId: z.string(),
          classId: z.string(),
          campusId: z.string(),
          streamId: z.string().optional(),
          capacity: z.coerce.number().int().min(1).max(500).default(40),
        })
        .parse(input);
      await own(actor, "academic_years", d.yearId);
      await own(actor, "classes", d.classId);
      await own(actor, "campuses", d.campusId);
      if (d.streamId) await own(actor, "streams", d.streamId);
      table = "sections";
      record = {
        ...base,
        name: d.name,
        academic_year_id: d.yearId,
        class_id: d.classId,
        campus_id: d.campusId,
        stream_id: d.streamId || null,
        capacity: d.capacity,
      };
      break;
    }
    case "streams": {
      const d = z.object({ name: textField }).parse(input);
      table = "streams";
      record = { ...base, name: d.name };
      break;
    }
    case "campuses": {
      const d = z
        .object({ name: textField, address: z.string().max(500).default("") })
        .parse(input);
      table = "campuses";
      record = { ...base, ...d };
      break;
    }
    case "parents": {
      const d = z
        .object({
          guardianName: textField,
          fatherName: z.string().max(160).default(""),
          motherName: z.string().max(160).default(""),
          mobile: mobileField,
          alternateMobile: mobileField.optional().or(z.literal("")),
          email: emailField,
          address: z.string().max(500).default(""),
          occupation: z.string().max(160).default(""),
          relationship: z
            .enum(["Father", "Mother", "Guardian"])
            .default("Guardian"),
        })
        .parse(input);
      table = "parents";
      record = {
        ...base,
        guardian_name: d.guardianName,
        father_name: d.fatherName,
        mother_name: d.motherName,
        mobile: d.mobile,
        alternate_mobile: d.alternateMobile || null,
        email: d.email || null,
        address: d.address,
        occupation: d.occupation,
        relationship: d.relationship,
      };
      break;
    }
    case "components": {
      const d = z
        .object({
          name: textField,
          category: textField,
          active: z.boolean().default(true),
          sortOrder: z.coerce.number().int().min(0).default(0),
        })
        .parse(input);
      table = "fee_components";
      record = {
        ...base,
        name: d.name,
        category: d.category,
        active: d.active ? 1 : 0,
        sort_order: d.sortOrder,
      };
      break;
    }
    case "benefits": {
      const d = z
        .object({
          name: textField,
          kind: z.enum(["Discount", "Scholarship", "Concession"]),
          calculation: z.enum(["Fixed", "Percentage"]),
          value: z.string(),
          eligibility: z.string().max(500).default(""),
          componentId: z.string().optional(),
          installmentIndex: z.coerce.number().int().min(0).max(11).optional(),
          recurring: z.boolean().default(false),
          autoApply: z.boolean().default(false),
          validUntil: dateField.optional().or(z.literal("")),
        })
        .parse(input);
      if (d.componentId) await own(actor, "fee_components", d.componentId);
      const value =
        d.calculation === "Fixed" ? parseMoney(d.value) : parseMoney(d.value);
      if (d.calculation === "Percentage" && value > 10000)
        throw new ApiError(
          422,
          "INVALID_PERCENTAGE",
          "Enter a percentage between 0 and 100.",
        );
      table = "benefits";
      record = {
        ...base,
        name: d.name,
        kind: d.kind,
        calculation: d.calculation,
        value,
        eligibility: d.eligibility,
        component_id: d.componentId || null,
        installment_index: d.installmentIndex ?? null,
        recurring: +d.recurring,
        auto_apply: +d.autoApply,
        valid_until: d.validUntil || null,
      };
      break;
    }
    case "structures": {
      const d = z
        .object({
          name: textField,
          yearId: z.string(),
          classId: z.string(),
          sectionId: z.string().optional(),
          streamId: z.string().optional(),
          frequency: z.enum([
            "Monthly",
            "Quarterly",
            "Half-yearly",
            "Annual",
            "Custom",
          ]),
          dates: z.array(dateField).min(1).max(12),
          items: z
            .array(z.object({ componentId: z.string(), amount: amountField }))
            .min(1)
            .max(30),
        })
        .parse(input);
      const year = await own(actor, "academic_years", d.yearId);
      if (["Closed", "Archived"].includes(year.status))
        throw new ApiError(409, "YEAR_CLOSED", "Choose an open academic year.");
      await own(actor, "classes", d.classId);
      if (d.sectionId) await own(actor, "sections", d.sectionId, d.yearId);
      if (d.streamId) await own(actor, "streams", d.streamId);
      if (new Set(d.items.map((i) => i.componentId)).size !== d.items.length)
        throw new ApiError(
          422,
          "DUPLICATE_COMPONENT",
          "Select each component once.",
        );
      if (d.dates.some((dt) => dt < year.start_date || dt > year.end_date))
        throw new ApiError(
          422,
          "INVALID_DUE_DATE",
          "Installment dates must be within the academic year.",
        );
      table = "fee_structures";
      record = {
        ...base,
        name: d.name,
        academic_year_id: d.yearId,
        class_id: d.classId,
        section_id: d.sectionId || null,
        stream_id: d.streamId || null,
        frequency: d.frequency,
        schedule: JSON.stringify([...d.dates].sort()),
      };
      for (const item of d.items) {
        const component = await own(actor, "fee_components", item.componentId);
        if (!component.active)
          throw new ApiError(
            422,
            "COMPONENT_DISABLED",
            "Disabled components cannot be added.",
          );
        extra.push(
          insert("fee_structure_items", {
            id: uuid(),
            institution_id: actor.institutionId,
            structure_id: id,
            component_id: item.componentId,
            amount_paise: item.amount,
          }),
        );
      }
      break;
    }
    default:
      throw new ApiError(404, "NOT_FOUND", "Unknown catalog.");
  }
  await batch([
    insert(table, record),
    ...extra,
    audit(actor, "Created " + kind, table, id, null, record),
  ]);
  return { id };
}
export async function promote(actor: Actor, input: unknown) {
  permit(actor, "academics.manage");
  const d = z
      .object({
        studentIds: z.array(z.string()).min(1).max(100),
        yearId: z.string(),
        sectionId: z.string(),
      })
      .parse(input),
    year = await own(actor, "academic_years", d.yearId),
    section = await own(actor, "sections", d.sectionId, d.yearId);
  if (["Closed", "Archived"].includes(year.status))
    throw new ApiError(409, "YEAR_CLOSED", "Choose an open academic year.");
  const statements = [];
  for (const studentId of d.studentIds) {
    await own(actor, "students", studentId);
    statements.push(
      insert("enrollments", {
        id: uuid(),
        institution_id: actor.institutionId,
        ...stamps(actor.userId),
        student_id: studentId,
        academic_year_id: year.id,
        section_id: section.id,
      }),
      audit(actor, "Promoted student", "students", studentId, null, d),
    );
  }
  await batch(statements);
  return { count: d.studentIds.length };
}
export { invite } from "./staff";
