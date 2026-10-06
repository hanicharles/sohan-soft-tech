import { z } from "zod";
import { parseMoney } from "./money";
export const realDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Enter a real calendar date",
  );
const text = z.string().trim().min(1, "This field is required").max(160);
export const studentFormSchema = z.object({
  name: text,
  admissionNumber: text,
  sectionId: z.string().min(1, "Choose a class and section"),
  parentName: text,
  mobile: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  email: z.string().email("Enter a valid email").or(z.literal("")),
  dob: realDate.or(z.literal("")),
  gender: z.enum(["Male", "Female", "Other", "Not specified"]),
  aadhaarLast4: z
    .string()
    .regex(/^\d{4}$/, "Enter exactly 4 digits")
    .or(z.literal("")),
  rollNumber: z.string().max(30),
  bloodGroup: z.string().max(5),
  previousSchool: z.string().max(160),
});
const amount = z.string().refine((v) => {
  try {
    return parseMoney(v) > 0;
  } catch {
    return false;
  }
}, "Enter a positive amount with at most 2 decimal places");
export const structureFormSchema = z
  .object({
    name: text,
    cls: z.string().min(1, "Choose a class"),
    stream: z.string(),
    section: z.string(),
    frequency: z.enum([
      "Monthly",
      "Quarterly",
      "Half-yearly",
      "Annual",
      "Custom",
    ]),
    items: z
      .array(
        z.object({
          componentId: z.string().min(1, "Choose a fee component"),
          amount,
        }),
      )
      .min(1)
      .max(30),
    dates: z.array(realDate).min(1).max(12),
  })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    d.items.forEach((item, i) => {
      if (ids.has(item.componentId))
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "componentId"],
          message: "This component is already selected",
        });
      ids.add(item.componentId);
    });
    if (new Set(d.dates).size !== d.dates.length)
      ctx.addIssue({
        code: "custom",
        path: ["dates"],
        message: "Installment dates must be unique",
      });
  });
export function fieldErrors(
  schema: z.ZodTypeAny,
  value: unknown,
): Record<string, string> {
  const result = schema.safeParse(value);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
}
