export const staffRoles = [
  "INSTITUTION_ADMIN",
  "ADMIN",
  "PRINCIPAL",
  "FACULTY",
  "TEACHER",
  "ACCOUNTANT",
  "FEE_COLLECTOR",
  "FEE_COUNTER_CASHIER",
  "AUDITOR",
  "STAFF",
  "RECEPTIONIST",
  "CUSTOM",
] as const;
export const allRoles = [
  ...staffRoles,
  "STUDENT",
  "PARENT",
] as const;
export const modules = [
  "students",
  "academics",
  "admissions",
  "calendar",
  "fees",
  "payments",
  "receipts",
  "reports",
  "users",
  "settings",
] as const;
export const permissions = [
  "students.view",
  "students.manage",
  "academics.view",
  "academics.manage",
  "admissions.view",
  "admissions.manage",
  "calendar.manage",
  "fees.view",
  "fees.manage",
  "fees.invoice",
  "payments.view",
  "payments.collect",
  "payments.manage",
  "cash.close",
  "receipts.view",
  "reports.view",
  "reports.export",
  "users.view",
  "users.manage",
  "settings.view",
  "settings.manage",
  "refunds.request",
  "refunds.approve",
] as const;
export type Permission = (typeof permissions)[number];
export const permissionLabels: Record<Permission, string> = {
  "students.view": "View students",
  "students.manage": "Create and edit students",
  "academics.view": "View academics",
  "academics.manage": "Manage academics",
  "admissions.view": "View admissions & enquiries",
  "admissions.manage": "Manage enquiries, applications and enrollment",
  "calendar.manage": "Manage academic calendar, working days & holidays",
  "fees.view": "View fee details",
  "fees.manage": "Configure fees and concessions",
  "fees.invoice": "Generate invoices",
  "payments.view": "View payments",
  "payments.collect": "Collect fees",
  "payments.manage": "Clear/cancel pending payments and reconcile",
  "cash.close": "Count and close cash days",
  "receipts.view": "View and download receipts",
  "reports.view": "View financial reports",
  "reports.export": "Export reports",
  "users.view": "View institution users",
  "users.manage": "Manage users and access",
  "settings.view": "View settings",
  "settings.manage": "Change settings",
  "refunds.request": "Request refunds",
  "refunds.approve": "Approve refunds",
};
const defaults: Record<string, Permission[]> = {
  INSTITUTION_ADMIN: [...permissions],
  ADMIN: [...permissions],
  PRINCIPAL: [
    "students.view",
    "students.manage",
    "academics.view",
    "academics.manage",
    "admissions.view",
    "admissions.manage",
    "calendar.manage",
    "fees.view",
    "reports.view",
    "reports.export",
    "users.view",
    "settings.view",
  ],
  FACULTY: ["students.view", "academics.view"],
  TEACHER: ["students.view", "academics.view"],
  STAFF: [
    "students.view",
    "students.manage",
    "admissions.view",
    "admissions.manage",
    "academics.view",
  ],
  ACCOUNTANT: [
    "payments.manage",
    "cash.close",
    "students.view",
    "academics.view",
    "fees.view",
    "fees.invoice",
    "payments.view",
    "payments.collect",
    "receipts.view",
    "reports.view",
    "reports.export",
    "refunds.request",
  ],
  FEE_COUNTER_CASHIER: [
    "students.view",
    "academics.view",
    "fees.view",
    "payments.view",
    "payments.collect",
    "receipts.view",
    "cash.close",
  ],
  AUDITOR: ["reports.view", "reports.export"],
  FEE_COLLECTOR: [
    "cash.close",
    "students.view",
    "academics.view",
    "fees.view",
    "payments.view",
    "payments.collect",
    "receipts.view",
  ],
  RECEPTIONIST: [
    "students.view",
    "students.manage",
    "admissions.view",
    "admissions.manage",
    "academics.view",
  ],
  STUDENT: ["students.view", "academics.view"],
  PARENT: ["students.view", "fees.view"],
  CUSTOM: [],
};
export function normalizedPermissions(
  role: string,
  assigned: unknown = [],
): Permission[] {
  const selected = Array.isArray(assigned)
    ? assigned.filter(
        (value): value is Permission =>
          typeof value === "string" &&
          permissions.includes(value as Permission),
      )
    : [];
  const result = new Set<Permission>(
    role === "CUSTOM"
      ? selected
      : selected.length
        ? selected
        : defaults[role] || [],
  );
  if (role === "INSTITUTION_ADMIN" || role === "ADMIN") return [...permissions];
  if (["FEE_COUNTER_CASHIER", "AUDITOR"].includes(role))
    return [...defaults[role]];
  for (const value of [...result]) {
    const area = value.split(".")[0];
    if (value.endsWith(".manage") || value.endsWith(".export")) {
      const read = area + ".view";
      if (permissions.includes(read as Permission))
        result.add(read as Permission);
    }
    if (value === "payments.collect" || value === "fees.invoice")
      ["students.view", "fees.view", "payments.view", "receipts.view"].forEach(
        (v) => result.add(v as Permission),
      );
    if (value.startsWith("refunds.")) result.add("payments.view");
    if (value === "fees.view" || value === "receipts.view")
      result.add("students.view");
  }
  return [...result];
}
export const roleLabel = (role: string) =>
  role === "CUSTOM"
    ? "Custom user"
    : role
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

// Platform identity is resolved separately from institution memberships.
export const platformRoles = ["SUPER_ADMIN"] as const;
