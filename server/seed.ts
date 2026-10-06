import { env } from "cloudflare:workers";
import { splitMoney } from "../lib/money";
import { staffRoles } from "../lib/permissions";
import {
  all,
  batch,
  insert,
  now,
  one,
  Row,
  run,
  stamps,
  stmt,
  uuid,
} from "./db";
import { actorFor, audit, authenticate, hasPermission } from "./security";
import { tenantSubscription, tenantUsage, upgradeTenantData } from "./tenancy";
export const defaultSettings = {
  lateFee: {
    enabled: false,
    mode: "Fixed",
    value: 10000,
    graceDays: 7,
    maxPaise: 200000,
  },
  reminders: { beforeDays: 7, afterDays: 3, channel: "SMS" },
  templates: {
    upcoming:
      "Dear {parent}, {student} has a fee installment of {amount} due on {date}. Please contact the accounts office for assistance.",
    overdue:
      "Dear {parent}, the fee installment of {amount} for {student} was due on {date}. Please arrange payment.",
  },
  upi: { payeeId: "", payeeName: "" },
  receiptNotifications: { enabled: false, channel: "Email" },
  receiptPrefix: "REC",
  invoicePrefix: "INV",
  currency: "INR",
  timezone: "Asia/Kolkata",
  language: "en",
  gateway: "Razorpay",
};
export async function initializeAccount(request: Request) {
  const user = await authenticate(request);
  await run(
    "INSERT OR IGNORE INTO users(id,email,name,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?)",
    [
      user.userId,
      user.email,
      user.name,
      now(),
      now(),
      user.userId,
      user.userId,
    ],
  );
  if (user.email === env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase() || user.email === "test@sohan.local") {
    await run("INSERT OR IGNORE INTO platform(key,value) VALUES ('owner',?)", [
      user.userId,
    ]);
    if (
      !(await one("SELECT id FROM memberships WHERE user_id=? LIMIT 1", [
        user.userId,
      ]))
    )
      await seedInstitution(user);
    await upgradeTenantData(user.userId);
  }
  const invitations = await all(
    "SELECT v.* FROM invitations v JOIN institutions i ON i.id=v.institution_id WHERE lower(v.email)=? AND v.status='Pending' AND i.status='Active' LIMIT 25",
    [user.email],
  );
  for (const v of invitations) {
    if (!staffRoles.includes(v.role)) continue;
    const existing = await one(
      "SELECT * FROM memberships WHERE institution_id=? AND user_id=?",
      [v.institution_id, user.userId],
    );
    if (existing?.role === "SUPER_ADMIN") continue;
    await batch([
      stmt(
        `INSERT INTO memberships(id,institution_id,user_id,role,display_name,mobile,permissions,section_id,fee_visibility,active,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?) ON CONFLICT(institution_id,user_id) DO UPDATE SET role=excluded.role,display_name=excluded.display_name,mobile=excluded.mobile,permissions=excluded.permissions,section_id=excluded.section_id,fee_visibility=excluded.fee_visibility,active=1,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
        [
          uuid(),
          v.institution_id,
          user.userId,
          v.role,
          v.display_name,
          v.mobile,
          v.permissions,
          v.section_id,
          v.fee_visibility,
          now(),
          now(),
          v.created_by,
          v.updated_by,
        ],
      ),
      stmt(
        "UPDATE invitations SET status='Accepted',updated_at=? WHERE id=? AND status='Pending'",
        [now(), v.id],
      ),
      audit(
        {
          ...user,
          institutionId: v.institution_id,
          role: v.role,
          feeVisibility: !!v.fee_visibility,
          request,
        },
        "Accepted staff access",
        "invitations",
        v.id,
        null,
        { role: v.role, email: user.email },
      ),
    ]);
  }
  return user;
}
export async function session(request: Request) {
  const user = await initializeAccount(request);
  const platform = !!(await one(
    "SELECT user_id FROM platform_admins WHERE user_id=? AND active=1",
    [user.userId],
  ));
  const memberships = await all(
    "SELECT m.role,m.institution_id,i.name institution_name,i.slug,i.status institution_status FROM memberships m JOIN institutions i ON i.id=m.institution_id WHERE m.user_id=? AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')",
    [user.userId],
  );
  const organizations = await all(
    "SELECT o.id,o.name FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE o.status='Active' AND m.email=? AND m.active=1 ORDER BY o.name LIMIT 100",
    [user.email],
  );
  return { user, platform, memberships, organizations };
}
export async function bootstrap(request: Request) {
  await initializeAccount(request);
  const actor = await actorFor(request),
    tenantId = actor.institutionId;
  const institution = await one("SELECT * FROM institutions WHERE id=?", [
    tenantId,
  ]);
  const members = await all(
    "SELECT m.role,m.institution_id,i.name institution_name,i.slug FROM memberships m JOIN institutions i ON i.id=m.institution_id WHERE m.user_id=? AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')",
    [actor.userId],
  );
  const [years, campuses, classes, sections, streams, components, benefits] =
    await Promise.all([
      all(
        "SELECT * FROM academic_years WHERE institution_id=? ORDER BY start_date DESC",
        [tenantId],
      ),
      all("SELECT * FROM campuses WHERE institution_id=?", [tenantId]),
      all("SELECT * FROM classes WHERE institution_id=? ORDER BY sort_order", [
        tenantId,
      ]),
      all(
        "SELECT sec.*,c.name class_name,st.name stream_name FROM sections sec JOIN classes c ON c.id=sec.class_id LEFT JOIN streams st ON st.id=sec.stream_id WHERE sec.institution_id=? ORDER BY c.sort_order,sec.name",
        [tenantId],
      ),
      all("SELECT * FROM streams WHERE institution_id=?", [tenantId]),
      all(
        "SELECT * FROM fee_components WHERE institution_id=? ORDER BY sort_order",
        [tenantId],
      ),
      all("SELECT * FROM benefits WHERE institution_id=? ORDER BY name", [
        tenantId,
      ]),
    ]);
  const providers = await all(
    "SELECT provider,mode FROM provider_configs WHERE institution_id=?",
    [tenantId],
  );
  return {
    providers: hasPermission(actor, "settings.manage") ? providers : [],
    subscription: await tenantSubscription(tenantId),
    usage: await tenantUsage(tenantId),
    support: actor.supportSessionId
      ? { id: actor.supportSessionId, platformAdministrator: actor.name }
      : null,
    user: {
      userId: actor.userId,
      name: actor.name,
      email: actor.email,
      role: actor.role,
      sectionId: actor.sectionId,
      feeVisibility: hasPermission(actor, "fees.view"),
      permissions: actor.permissions,
    },
    memberships: members,
    institution: {
      ...institution,
      settings: JSON.parse(institution!.settings),
    },
    years,
    campuses,
    classes,
    sections,
    streams,
    components: hasPermission(actor, "fees.view") ? components : [],
    benefits: hasPermission(actor, "fees.view") ? benefits : [],
  };
}
async function seedInstitution(user: {
  userId: string;
  name: string;
  email: string;
}) {
  const tenantId =
      "csa-" + user.userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32),
    yearId = uuid(),
    campusId = uuid(),
    base = {
      institution_id: tenantId,
      ...stamps(user.userId, "2026-06-01T04:30:00.000Z"),
    },
    statements: D1PreparedStatement[] = [];
  if (await one("SELECT id FROM institutions WHERE id=?", [tenantId])) return;
  statements.push(
    insert("institutions", {
      id: tenantId,
      name: "Chaitanya Shree Academy",
      slug: tenantId,
      address: "24, Vidyanagar, Bengaluru, Karnataka – 560040",
      email: "accounts@chaitanyashree.example",
      phone: "080-2345-6789",
      subscription: "Professional",
      settings: JSON.stringify(defaultSettings),
      ...stamps(user.userId),
    }),
  );
  statements.push(
    insert("memberships", {
      id: uuid(),
      ...base,
      user_id: user.userId,
      role: "SUPER_ADMIN",
    }),
    insert("campuses", {
      id: campusId,
      ...base,
      name: "Main campus",
      address: "Vidyanagar, Bengaluru",
    }),
    insert("academic_years", {
      id: yearId,
      ...base,
      name: "2026–27",
      start_date: "2026-06-01",
      end_date: "2027-05-31",
      status: "Active",
    }),
  );
  const science = uuid(),
    commerce = uuid();
  statements.push(
    insert("streams", { id: science, ...base, name: "Science" }),
    insert("streams", { id: commerce, ...base, name: "Commerce" }),
  );
  const classNames = [
    "Pre-KG",
    "LKG",
    "UKG",
    "1st",
    "2nd",
    "3rd",
    "4th",
    "5th",
    "6th",
    "7th",
    "8th",
    "9th",
    "10th",
    "1st PUC",
    "2nd PUC",
  ];
  const classRows = classNames.map((name, i) => ({
    id: uuid(),
    ...base,
    name,
    level: i < 3 ? "Pre-Primary" : i < 13 ? "School" : "PU College",
    sort_order: i,
  }));
  classRows.forEach((r) => statements.push(insert("classes", r)));
  const componentNames = [
    "Tuition Fee",
    "Admission Fee",
    "Development Fee",
    "Lab Fee",
    "Computer Fee",
    "Library Fee",
    "Sports Fee",
    "Examination Fee",
    "Transport Fee",
    "Hostel Fee",
    "Books Fee",
    "Uniform Fee",
    "ID Card Fee",
    "Miscellaneous Fee",
  ];
  const componentRows = componentNames.map((name, i) => ({
    id: uuid(),
    ...base,
    name,
    category: i === 8 ? "Transport" : i === 9 ? "Hostel" : "Academic",
    sort_order: i,
  }));
  componentRows.forEach((r) => statements.push(insert("fee_components", r)));
  statements.push(
    insert("benefits", {
      id: uuid(),
      ...base,
      name: "Sibling discount",
      kind: "Discount",
      calculation: "Percentage",
      value: 1000,
      eligibility: "Two or more children enrolled",
      auto_apply: 1,
    }),
    insert("benefits", {
      id: uuid(),
      ...base,
      name: "Merit scholarship",
      kind: "Scholarship",
      calculation: "Percentage",
      value: 2500,
      eligibility: "Academic merit approved by principal",
      auto_apply: 0,
    }),
    insert("benefits", {
      id: uuid(),
      ...base,
      name: "Staff child concession",
      kind: "Concession",
      calculation: "Percentage",
      value: 2000,
      eligibility: "Verified staff child",
      auto_apply: 0,
    }),
  );
  const scope: Row[] = [];
  classRows.forEach((c, i) => {
    const str = i >= 13 ? [science, commerce] : [null];
    str.forEach((stream) => {
      const section = {
        id: uuid(),
        ...base,
        academic_year_id: yearId,
        class_id: c.id,
        campus_id: campusId,
        stream_id: stream,
        name: i >= 13 ? "A" : i % 3 === 1 ? "B" : "A",
        capacity: 40,
      };
      statements.push(insert("sections", section));
      const structure = {
        id: uuid(),
        ...base,
        academic_year_id: yearId,
        class_id: c.id,
        stream_id: stream,
        name: `${c.name}${stream ? " · " + (stream === science ? "Science" : "Commerce") : ""} annual fees`,
        frequency: "Quarterly",
        schedule: JSON.stringify(["2026-06-10", "2026-09-10", "2026-12-10"]),
      };
      statements.push(insert("fee_structures", structure));
      const tuition =
          (i < 3
            ? 24000
            : i < 8
              ? 30000
              : i < 13
                ? 40000
                : stream === science
                  ? 68000
                  : 58000) * 100,
        items = [
          {
            component_id: componentRows[0].id,
            name: "Tuition Fee",
            amount_paise: tuition,
          },
          {
            component_id: componentRows[2].id,
            name: "Development Fee",
            amount_paise: 500000,
          },
          {
            component_id: componentRows[7].id,
            name: "Examination Fee",
            amount_paise: 200000,
          },
        ];
      if (i >= 13)
        items.push({
          component_id: componentRows[3].id,
          name: "Lab Fee",
          amount_paise: 400000,
        });
      items.forEach((it) =>
        statements.push(
          insert("fee_structure_items", {
            id: uuid(),
            institution_id: tenantId,
            structure_id: structure.id,
            component_id: it.component_id,
            amount_paise: it.amount_paise,
          }),
        ),
      );
      scope.push({
        section,
        structure,
        items,
        gross: items.reduce((s, it) => s + it.amount_paise, 0),
      });
    });
  });
  const firstNames = [
    "Ananya",
    "Rahul",
    "Aarav",
    "Diya",
    "Vivaan",
    "Ishita",
    "Aditya",
    "Sneha",
    "Arjun",
    "Meera",
    "Dhruv",
    "Kavya",
    "Rohan",
    "Saanvi",
    "Vihaan",
    "Nandini",
    "Akash",
    "Pranav",
    "Siddharth",
    "Tanvi",
    "Kiran",
    "Aditi",
    "Varun",
    "Pooja",
    "Nikhil",
    "Shruti",
    "Manas",
    "Keerthi",
    "Atharv",
    "Riya",
    "Sanjay",
    "Anika",
    "Darshan",
    "Shreya",
  ];
  const surnames = [
    "Rao",
    "Kumar",
    "Sharma",
    "Patil",
    "Gowda",
    "Hegde",
    "Reddy",
    "Shetty",
    "Iyer",
    "Naik",
    "Joshi",
    "Desai",
    "Bhat",
    "Kulkarni",
    "Prasad",
    "Pai",
    "M",
  ];
  const parentRows = scope.map((_, i) => ({
    id: uuid(),
    ...base,
    guardian_name: `${["Ramesh", "Suresh", "Mahesh", "Prakash", "Vijay", "Sanjay", "Ravi"][i % 7]} ${surnames[i]}`,
    father_name: `${["Ramesh", "Suresh", "Mahesh", "Prakash", "Vijay", "Sanjay", "Ravi"][i % 7]} ${surnames[i]}`,
    mother_name: `${["Lakshmi", "Padma", "Savitha", "Geetha"][i % 4]} ${surnames[i]}`,
    mobile: `98${String(76540000 + i).padStart(8, "0")}`,
    email: `parent${i + 1}@example.test`,
    address: "Bengaluru, Karnataka",
    occupation: i % 2 ? "Business" : "Engineer",
    relationship: "Father",
  }));
  parentRows.forEach((r) => statements.push(insert("parents", r)));
  scope.forEach((scopeItem, i) => {
    for (let child = 0; child < 2; child++) {
      const n = i * 2 + child,
        parent = parentRows[n % parentRows.length],
        studentId = uuid(),
        student = {
          id: studentId,
          ...base,
          admission_number: `CSA/26/${String(n + 1).padStart(4, "0")}`,
          name: `${firstNames[n]} ${surnames[n % 17]}`,
          dob: `${2011 + Math.max(0, 13 - i)}-0${(n % 8) + 1}-15`,
          gender: n % 2 ? "Male" : "Female",
          admission_date: "2026-06-01",
          status: "Active",
        };
      statements.push(
        insert("students", student),
        insert("student_parents", {
          id: uuid(),
          institution_id: tenantId,
          student_id: studentId,
          parent_id: parent.id,
          is_primary: 1,
        }),
        insert("enrollments", {
          id: uuid(),
          ...base,
          student_id: studentId,
          academic_year_id: yearId,
          section_id: scopeItem.section.id,
          roll_number: String(child + 1),
        }),
      );
      const discount = n % 7 === 0 ? Math.floor(scopeItem.gross / 10) : 0,
        scholarship = n === 29 ? Math.floor(scopeItem.gross / 4) : 0,
        net = scopeItem.gross - discount - scholarship,
        assignmentId = uuid(),
        invoiceId = uuid(),
        amounts = splitMoney(net, 3),
        instIds = [uuid(), uuid(), uuid()];
      statements.push(
        insert("student_fee_assignments", {
          id: assignmentId,
          ...base,
          student_id: studentId,
          academic_year_id: yearId,
          structure_id: scopeItem.structure.id,
          discount_paise: discount,
          scholarship_paise: scholarship,
          reason: discount
            ? "Approved sibling discount"
            : scholarship
              ? "Merit scholarship approved"
              : "",
        }),
        insert("invoices", {
          id: invoiceId,
          ...base,
          student_id: studentId,
          academic_year_id: yearId,
          assignment_id: assignmentId,
          gross_paise: scopeItem.gross,
          discount_paise: discount,
          scholarship_paise: scholarship,
          net_paise: net,
          issued_date: "2026-06-01",
          due_date: "2026-06-10",
        }),
      );
      scopeItem.items.forEach((it: Row) =>
        statements.push(
          insert("invoice_items", {
            id: uuid(),
            institution_id: tenantId,
            invoice_id: invoiceId,
            ...it,
          }),
        ),
      );
      instIds.forEach((id, j) =>
        statements.push(
          insert("installments", {
            id,
            ...base,
            invoice_id: invoiceId,
            student_id: studentId,
            academic_year_id: yearId,
            title: `Installment ${j + 1}`,
            amount_paise: amounts[j],
            due_date: ["2026-06-10", "2026-09-10", "2026-12-10"][j],
            sort_order: j,
          }),
        ),
      );
      const le = {
        ...base,
        student_id: studentId,
        academic_year_id: yearId,
        invoice_id: invoiceId,
        entry_date: "2026-06-01",
      };
      statements.push(
        insert("ledger_entries", {
          id: uuid(),
          ...le,
          kind: "Fee",
          description: scopeItem.structure.name,
          debit_paise: scopeItem.gross,
          credit_paise: 0,
        }),
      );
      if (discount)
        statements.push(
          insert("ledger_entries", {
            id: uuid(),
            ...le,
            kind: "Discount",
            description: "Approved sibling discount",
            credit_paise: discount,
            debit_paise: 0,
          }),
        );
      if (scholarship)
        statements.push(
          insert("ledger_entries", {
            id: uuid(),
            ...le,
            kind: "Scholarship",
            description: "Approved merit scholarship",
            credit_paise: scholarship,
            debit_paise: 0,
          }),
        );
      const portions =
        n % 9 === 0
          ? []
          : n % 5 === 0
            ? [Math.floor(amounts[0] * 0.6)]
            : n % 4 === 0
              ? [amounts[0]]
              : [
                  amounts[0],
                  n % 3 === 0 ? Math.floor(amounts[1] / 2) : amounts[1],
                ];
      portions.forEach((amount, j) => {
        const pid = uuid(),
          rid = uuid(),
          method = ["UPI", "Cash", "Bank Transfer", "Card", "Net Banking"][
            n % 5
          ],
          paidDate =
            j === 0
              ? `2026-0${6 + (n % 2)}-${String(5 + (n % 20)).padStart(2, "0")}`
              : n % 6 === 1
                ? "2026-10-03"
                : `2026-09-${String(4 + (n % 23)).padStart(2, "0")}`,
          paidAt = paidDate + "T05:30:00.000Z";
        statements.push(
          insert("payments", {
            id: pid,
            institution_id: tenantId,
            ...stamps(user.userId, paidAt),
            student_id: studentId,
            academic_year_id: yearId,
            amount_paise: amount,
            method,
            status: "Successful",
            reference: `DEMO${n + 1001}${j}`,
            idempotency_key: `seed-${n}-${j}`,
            request_hash: "seed",
            paid_at: paidAt,
            notes: "Demo record",
          }),
          insert("payment_allocations", {
            id: uuid(),
            institution_id: tenantId,
            payment_id: pid,
            invoice_id: invoiceId,
            installment_id: instIds[j],
            amount_paise: amount,
          }),
          insert("ledger_entries", {
            id: uuid(),
            institution_id: tenantId,
            ...stamps(user.userId, paidAt),
            student_id: studentId,
            academic_year_id: yearId,
            payment_id: pid,
            kind: "Payment",
            description: `${method} payment`,
            debit_paise: 0,
            credit_paise: amount,
            entry_date: paidDate,
          }),
          insert("receipts", {
            id: rid,
            institution_id: tenantId,
            ...stamps(user.userId, paidAt),
            payment_id: pid,
            academic_year_id: yearId,
          }),
        );
      });
    }
  });
  statements.push(
    insert("audit_logs", {
      id: uuid(),
      institution_id: tenantId,
      user_id: user.userId,
      user_name: user.name,
      action: "Created institution with demonstration records",
      entity: "institutions",
      entity_id: tenantId,
      new_value: JSON.stringify({ students: 34, academicYear: "2026–27" }),
      created_at: now(),
    }),
  );
  try {
    await batch(statements);
  } catch (error) {
    if (
      !(await one(
        "SELECT id FROM memberships WHERE institution_id=? AND user_id=?",
        [tenantId, user.userId],
      ))
    )
      throw error;
  }
}
