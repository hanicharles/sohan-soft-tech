import { createCatalog, createStudent } from "./catalog";
import { batch, one, uuid } from "./db";
import { makeAssignment } from "./fees";
import { createInstitution } from "./institutions";
import { collectPayment } from "./payments";
import { Actor, ApiError } from "./security";
import { platformAudit } from "./tenancy";

// Explicitly requested validation data, provisioned with the same operations as the UI.
// The existing Test School's financial records are never updated here.
export async function provisionValidationTenant(
  request: Request,
  ownerId: string,
) {
  const owner = await one("SELECT * FROM users WHERE id=?", [ownerId]);
  if (
    !owner ||
    !(await one(
      "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
      [ownerId],
    ))
  )
    throw new ApiError(403, "FORBIDDEN", "Platform owner is required.");
  const platform: Actor = {
    userId: owner.id,
    email: owner.email,
    name: owner.name + " (SaaS upgrade)",
    institutionId: "",
    role: "SUPER_ADMIN",
    platform: true,
    feeVisibility: false,
    request,
  };
  const existing = await one(
    "SELECT id,slug FROM institutions WHERE institution_code='GV-TEST'",
  );
  if (existing)
    return {
      id: existing.id,
      portalPath: "/campus/" + existing.slug,
      alreadyExists: true,
    };
  const created = await createInstitution(platform, {
    name: "Green Valley Test School",
    institutionCode: "GV-TEST",
    institutionType: "School",
    email: "accounts@green-valley.example.test",
    phone: "9876543210",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    address: "Demo institution · Bengaluru, Karnataka",
    adminName: "Green Valley Test Administrator",
    adminEmail: "admin@green-valley.example.test",
    adminMobile: "9876543210",
    planId: "plan-starter",
    subscriptionStatus: "Trial",
    subscriptionStart: "2026-10-03",
    subscriptionEnd: "2026-11-02",
    setupAcademic: true,
    yearName: "2026–27",
    startDate: "2026-06-01",
    endDate: "2027-05-31",
  });
  const actor: Actor = {
    ...platform,
    institutionId: created.id,
    role: "INSTITUTION_ADMIN",
    platform: false,
    feeVisibility: true,
  };
  const year = await one(
    "SELECT id FROM academic_years WHERE institution_id=? AND status='Active'",
    [created.id],
  );
  const section = await one(
    "SELECT s.id,s.class_id FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.institution_id=? AND c.name='10th'",
    [created.id],
  );
  const component = await one(
    "SELECT id FROM fee_components WHERE institution_id=? AND name='Tuition Fee'",
    [created.id],
  );
  const student = await createStudent(actor, {
    name: "Aarav Rao (Test)",
    admissionNumber: "GV/2026/0001",
    yearId: year!.id,
    sectionId: section!.id,
    parentName: "Vijay Rao (Test)",
    mobile: "9876500011",
    email: "guardian@green-valley.example.test",
  });
  const structure = await createCatalog(actor, "structures", {
    name: "10th annual fee · Test",
    yearId: year!.id,
    classId: section!.class_id,
    sectionId: section!.id,
    frequency: "Quarterly",
    dates: ["2026-06-10", "2026-09-10", "2026-12-10"],
    items: [{ componentId: component!.id, amount: "42000" }],
  });
  const fee = await makeAssignment(
    actor,
    student.id,
    structure.id,
    0,
    0,
    "Requested isolated SaaS validation record",
  );
  await batch(fee.statements);
  const payment = await collectPayment(actor, {
    studentId: student.id,
    yearId: year!.id,
    amountPaise: 600000,
    method: "UPI",
    reference: "GV-TEST-UPI-0001",
    idempotencyKey: uuid(),
    notes: "Recorded demonstration payment. No real funds collected.",
  });
  await batch([
    platformAudit(
      platform,
      "Provisioned isolated validation institution",
      "institutions",
      created.id,
      null,
      {
        test: true,
        students: 1,
        expectedPaise: 4200000,
        collectedPaise: 600000,
      },
      created.id,
    ),
  ]);
  return {
    id: created.id,
    portalPath: created.portalPath,
    studentId: student.id,
    invoiceId: fee.invoiceId,
    receiptId: payment.receipt?.id,
    alreadyExists: false,
  };
}
