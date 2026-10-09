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
import { hashPassword } from "./auth-service";
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
  await ensureMember1Demonstration(tenantId, actor.userId);
  await ensureMember2AndMember3Demonstration(tenantId, actor.userId);
  const institution = await one("SELECT * FROM institutions WHERE id=?", [
    tenantId,
  ]);
  const members = await all(
    "SELECT m.role,m.institution_id,i.name institution_name,i.slug FROM memberships m JOIN institutions i ON i.id=m.institution_id WHERE m.user_id=? AND m.active=1 AND m.role NOT IN ('SUPER_ADMIN','PARENT','STUDENT')",
    [actor.userId],
  );
  const [
    years,
    campuses,
    classes,
    sections,
    streams,
    components,
    benefits,
    departments,
    programs,
    subjects,
    facultyList,
  ] = await Promise.all([
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
    all("SELECT * FROM departments WHERE institution_id=? ORDER BY name", [
      tenantId,
    ]).catch(() => []),
    all("SELECT * FROM programs WHERE institution_id=? ORDER BY name", [
      tenantId,
    ]).catch(() => []),
    all("SELECT * FROM subjects WHERE institution_id=? ORDER BY name", [
      tenantId,
    ]).catch(() => []),
    all("SELECT * FROM faculty WHERE institution_id=? ORDER BY name", [
      tenantId,
    ]).catch(() => []),
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
    departments,
    programs,
    subjects,
    faculty: facultyList,
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

export async function ensureMember1Demonstration(tenantId: string, actorId: string) {
  try {
    // 1. Working days
    const hasWorkingDays = await one("SELECT id FROM working_days WHERE institution_id=? LIMIT 1", [tenantId]);
    if (!hasWorkingDays) {
      const days = [
        { day: 0, isWorking: 0, open: "08:00", close: "15:00" },
        { day: 1, isWorking: 1, open: "08:00", close: "15:00" },
        { day: 2, isWorking: 1, open: "08:00", close: "15:00" },
        { day: 3, isWorking: 1, open: "08:00", close: "15:00" },
        { day: 4, isWorking: 1, open: "08:00", close: "15:00" },
        { day: 5, isWorking: 1, open: "08:00", close: "15:00" },
        { day: 6, isWorking: 1, open: "08:00", close: "13:00" },
      ];
      for (const d of days) {
        await stmt(
          `INSERT OR IGNORE INTO working_days(id, institution_id, day_of_week, is_working, open_time, close_time, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), tenantId, d.day, d.isWorking, d.open, d.close, now(), now(), actorId, actorId],
        ).run();
      }
    }

    // 2. Holidays
    const hasHolidays = await one("SELECT id FROM holidays WHERE institution_id=? LIMIT 1", [tenantId]);
    if (!hasHolidays) {
      const holidaysData = [
        { title: "Independence Day", date: "2026-08-15", type: "National", desc: "Celebration of Indian Independence" },
        { title: "Gandhi Jayanti", date: "2026-10-02", type: "National", desc: "Mahatma Gandhi Birthday" },
        { title: "Diwali Holidays", date: "2026-11-08", endDate: "2026-11-12", type: "Festival", desc: "Deepawali Vacation" },
        { title: "Winter Break", date: "2026-12-24", endDate: "2027-01-02", type: "Institutional", desc: "Year-end winter recess" },
        { title: "Republic Day", date: "2027-01-26", type: "National", desc: "Celebration of the Constitution of India" },
      ];
      for (const h of holidaysData) {
        await stmt(
          `INSERT INTO holidays(id, institution_id, title, date, end_date, type, description, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), tenantId, h.title, h.date, h.endDate || null, h.type, h.desc, now(), now(), actorId, actorId],
        ).run();
      }
    }

    // 3. Campuses
    const campusCount = await one<{ count: number }>("SELECT COUNT(*) as count FROM campuses WHERE institution_id=?", [tenantId]);
    if ((campusCount?.count || 0) < 2) {
      const extraCampuses = [
        { name: "North Branch Campus", address: "Plot 42, Knowledge Park, North Sector" },
        { name: "South City Campus", address: "88 Ring Road, South City" },
      ];
      for (const c of extraCampuses) {
        await stmt(
          `INSERT OR IGNORE INTO campuses(id, institution_id, name, address, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), tenantId, c.name, c.address, now(), now(), actorId, actorId],
        ).run();
      }
    }

    // 4. Admissions Enquiries & Applications
    const hasEnquiries = await one("SELECT id FROM admissions_enquiries WHERE institution_id=? LIMIT 1", [tenantId]);
    const year = await one<{ id: string }>("SELECT id FROM academic_years WHERE institution_id=? ORDER BY start_date DESC LIMIT 1", [tenantId]);
    if (!hasEnquiries && year) {
      const enquiries = [
        { sName: "Rohan Gupta", pName: "Vikas Gupta", phone: "9876543211", email: "vikas.gupta@example.test", cls: "Class 6", src: "Walk-in", st: "New" },
        { sName: "Ananya Verma", pName: "Suresh Verma", phone: "9876543212", email: "suresh.v@example.test", cls: "Class 8", src: "Website", st: "Contacted" },
        { sName: "Kabir Singh", pName: "Deepak Singh", phone: "9876543213", email: "deepak.s@example.test", cls: "Class 10", src: "Referral", st: "Converted" },
        { sName: "Meera Nair", pName: "Ravi Nair", phone: "9876543214", email: "ravi.nair@example.test", cls: "Class 9", src: "Call", st: "Closed" },
      ];
      for (const eq of enquiries) {
        await stmt(
          `INSERT INTO admissions_enquiries(id, institution_id, academic_year_id, student_name, parent_name, email, phone, class_applied, source, notes, status, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Initial consultation completed', ?, ?, ?, ?, ?)`,
          [uuid(), tenantId, year.id, eq.sName, eq.pName, eq.email, eq.phone, eq.cls, eq.src, eq.st, now(), now(), actorId, actorId],
        ).run();
      }

      const applications = [
        { appNum: "APP/2026/0001", sName: "Dev Sharma", pName: "Manoj Sharma", phone: "9876543215", st: "Applied", prevSchool: "Greenwood High", prevGrade: "5", prevPct: "88%" },
        { appNum: "APP/2026/0002", sName: "Ishaan Joshi", pName: "Alok Joshi", phone: "9876543216", st: "Interview Scheduled", intDate: "2026-11-20", intTime: "10:00 AM", prevSchool: "St. Xavier's", prevGrade: "6", prevPct: "91%" },
        { appNum: "APP/2026/0003", sName: "Priya Patel", pName: "Kiran Patel", phone: "9876543217", st: "Selected", intResult: "Cleared", prevSchool: "DPS City", prevGrade: "7", prevPct: "94%" },
        { appNum: "APP/2026/0004", sName: "Aditya Rao", pName: "Sanjay Rao", phone: "9876543218", st: "Confirmed", intResult: "Cleared", prevSchool: "Modern Public", prevGrade: "8", prevPct: "86%" },
      ];
      for (const app of applications) {
        const appId = uuid();
        await stmt(
          `INSERT INTO admissions_applications(
            id, institution_id, academic_year_id, application_number,
            student_name, parent_name, parent_phone, previous_school, previous_grade, previous_percentage,
            status, interview_date, interview_time, interview_result, selection_notes,
            created_at, updated_at, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved by admissions committee', ?, ?, ?, ?)`,
          [
            appId,
            tenantId,
            year.id,
            app.appNum,
            app.sName,
            app.pName,
            app.phone,
            app.prevSchool,
            app.prevGrade,
            app.prevPct,
            app.st,
            app.intDate || null,
            app.intTime || null,
            app.intResult || "Pending",
            now(),
            now(),
            actorId,
            actorId,
          ],
        ).run();

        await stmt(
          `INSERT INTO admissions_documents(id, institution_id, application_id, document_name, document_type, verification_status, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, 'Birth Certificate', 'Birth Certificate', 'Verified', ?, ?, ?, ?)`,
          [uuid(), tenantId, appId, now(), now(), actorId, actorId],
        ).run();
      }
    }

    // 5. Seed Users for all 8 roles & Credentials
    const demoUsers = [
      { email: "superadmin@sst.com", username: "superadmin", name: "Super Administrator", role: "SUPER_ADMIN", pwd: "SuperAdmin@123" },
      { email: "admin@sst.com", username: "admin", name: "Institution Administrator", role: "INSTITUTION_ADMIN", pwd: "Admin@123" },
      { email: "principal@sst.com", username: "principal", name: "Dr. Arvind Principal", role: "PRINCIPAL", pwd: "Principal@123" },
      { email: "faculty@sst.com", username: "faculty", name: "Prof. Sunita Sharma", role: "FACULTY", pwd: "Faculty@123" },
      { email: "student@sst.com", username: "student", name: "Aarav Kumar (Student)", role: "STUDENT", pwd: "Student@123" },
      { email: "parent@sst.com", username: "parent", name: "Rajesh Kumar (Parent)", role: "PARENT", pwd: "Parent@123" },
      { email: "accountant@sst.com", username: "accountant", name: "Mahesh Accountant", role: "ACCOUNTANT", pwd: "Accountant@123" },
      { email: "staff@sst.com", username: "staff", name: "Pooja Staff", role: "STAFF", pwd: "Staff@123" },
    ];

    const sampleStudent = await one<{ id: string }>("SELECT id FROM students WHERE institution_id=? LIMIT 1", [tenantId]);
    const sampleParent = await one<{ id: string }>("SELECT id FROM parents WHERE institution_id=? LIMIT 1", [tenantId]);

    for (const du of demoUsers) {
      let u = await one<{ id: string }>("SELECT id FROM users WHERE lower(email)=?", [du.email.toLowerCase()]);
      if (!u) {
        const newId = uuid();
        await stmt(
          "INSERT INTO users(id, email, name, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [newId, du.email, du.name, now(), now(), actorId, actorId],
        ).run();
        u = { id: newId };
      }

      if (du.role === "SUPER_ADMIN") {
        await stmt(
          "INSERT OR IGNORE INTO platform_admins(user_id, active, created_at, updated_at, created_by, updated_by) VALUES (?, 1, ?, ?, ?, ?)",
          [u.id, now(), now(), actorId, actorId],
        ).run();
      } else {
        await stmt(
          `INSERT INTO memberships(id, institution_id, user_id, role, display_name, active, student_id, parent_id, permissions, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, '[]', ?, ?, ?, ?)
           ON CONFLICT(institution_id, user_id) DO UPDATE SET role=excluded.role, student_id=excluded.student_id, parent_id=excluded.parent_id, active=1`,
          [
            uuid(),
            tenantId,
            u.id,
            du.role,
            du.name,
            du.role === "STUDENT" ? sampleStudent?.id || null : null,
            du.role === "PARENT" ? sampleParent?.id || null : null,
            now(),
            now(),
            actorId,
            actorId,
          ],
        ).run();
      }

      const salt = uuid();
      const hash = await hashPassword(du.pwd, salt);
      await stmt(
        `INSERT INTO user_credentials(user_id, username, password_hash, salt, failed_attempts, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 1, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash, salt=excluded.salt, active=1`,
        [u.id, du.username, hash, salt, now(), now()],
      ).run();
    }

    // 6. Student Exams, LMS, Emergency Contacts, History
    if (sampleStudent && year) {
      const hasExams = await one("SELECT id FROM student_exams WHERE student_id=? LIMIT 1", [sampleStudent.id]);
      if (!hasExams) {
        const examEntries = [
          { exam: "Mid-Term Examination 2026", sub: "Mathematics", marks: 92, max: 100, gr: "A+" },
          { exam: "Mid-Term Examination 2026", sub: "Science", marks: 88, max: 100, gr: "A" },
          { exam: "Mid-Term Examination 2026", sub: "English", marks: 95, max: 100, gr: "A+" },
          { exam: "Monthly Quiz - October", sub: "Social Studies", marks: 46, max: 50, gr: "A+" },
        ];
        for (const ex of examEntries) {
          await stmt(
            `INSERT INTO student_exams(id, institution_id, student_id, academic_year_id, exam_name, subject, marks_obtained, max_marks, grade, remarks, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Excellent understanding', ?, ?, ?, ?)`,
            [uuid(), tenantId, sampleStudent.id, year.id, ex.exam, ex.sub, ex.marks, ex.max, ex.gr, now(), now(), actorId, actorId],
          ).run();
        }

        const lmsEntries = [
          { course: "Advanced Mathematics (Grade 10)", inst: "Prof. S. Sharma", pct: 75, st: "In Progress" },
          { course: "Physics: Mechanics & Waves", inst: "Dr. K. Patel", pct: 90, st: "In Progress" },
          { course: "Computer Science & Python", inst: "Er. R. Joshi", pct: 100, st: "Completed" },
        ];
        for (const lms of lmsEntries) {
          await stmt(
            `INSERT INTO student_lms_courses(id, institution_id, student_id, course_name, instructor, progress_percent, status, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuid(), tenantId, sampleStudent.id, lms.course, lms.inst, lms.pct, lms.st, now(), now(), actorId, actorId],
          ).run();
        }

        await stmt(
          `INSERT INTO student_emergency_contacts(id, institution_id, student_id, name, relationship, phone, address, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, 'Mr. Rajesh Kumar', 'Father', '9876543210', '12 Park Avenue, Civil Lines', ?, ?, ?, ?)`,
          [uuid(), tenantId, sampleStudent.id, now(), now(), actorId, actorId],
        ).run();

        await stmt(
          `INSERT INTO student_history(id, institution_id, student_id, action, details, actor_id, actor_name, created_at)
           VALUES (?, ?, ?, 'Enrolled', '{"note":"Initial academic admission"}', ?, 'System', ?)`,
          [uuid(), tenantId, sampleStudent.id, actorId, now()],
        ).run();
      }
    }
  } catch (err) {
    // Ignore demonstration seed errors to keep primary workflows uninterrupted
  }
}

export async function ensureMember2AndMember3Demonstration(tenantId: string, actorId: string) {
  try {
    const year = await one<{ id: string }>(
      "SELECT id FROM academic_years WHERE institution_id=? ORDER BY start_date DESC LIMIT 1",
      [tenantId],
    );
    if (!year) return;

    const hasDept = await one("SELECT id FROM departments WHERE institution_id=? LIMIT 1", [tenantId]);
    if (!hasDept) {
      const cseId = "dept-cse-" + tenantId.slice(0, 8);
      const sciId = "dept-sci-" + tenantId.slice(0, 8);
      const humId = "dept-hum-" + tenantId.slice(0, 8);

      await stmt(
        `INSERT OR IGNORE INTO departments(id, institution_id, code, name, description, hod_name, status, created_at, updated_at, created_by, updated_by)
         VALUES 
         (?, ?, 'CSE', 'Computer Science & Engineering', 'Core computing, software engineering and algorithms', 'Prof. Sunita Sharma', 'Active', ?, ?, ?, ?),
         (?, ?, 'SCI', 'Natural Sciences & Mathematics', 'Applied mathematics, physics and computational sciences', 'Dr. Arvind Principal', 'Active', ?, ?, ?, ?),
         (?, ?, 'HUM', 'Humanities & Social Sciences', 'Languages, professional ethics and communications', 'Dr. Meenakshi Sundaram', 'Active', ?, ?, ?, ?)`,
        [
          cseId, tenantId, now(), now(), actorId, actorId,
          sciId, tenantId, now(), now(), actorId, actorId,
          humId, tenantId, now(), now(), actorId, actorId,
        ],
      ).run();

      const progCse = "prog-cse-" + tenantId.slice(0, 8);
      const progBsc = "prog-bsc-" + tenantId.slice(0, 8);
      await stmt(
        `INSERT OR IGNORE INTO programs(id, institution_id, department_id, code, name, degree_level, duration_years, total_semesters, total_credits, coordinator_name, status, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, 'BTECH-CSE', 'B.Tech Computer Science & Engineering', 'Undergraduate', 4, 8, 160, 'Prof. Sunita Sharma', 'Active', ?, ?, ?, ?),
         (?, ?, ?, 'BSC-SCI', 'B.Sc Integrated Sciences', 'Undergraduate', 3, 6, 120, 'Dr. Arvind Principal', 'Active', ?, ?, ?, ?)`,
        [
          progCse, tenantId, cseId, now(), now(), actorId, actorId,
          progBsc, tenantId, sciId, now(), now(), actorId, actorId,
        ],
      ).run();

      const sem1 = "sem-1-" + tenantId.slice(0, 8);
      const sem2 = "sem-2-" + tenantId.slice(0, 8);
      await stmt(
        `INSERT OR IGNORE INTO academic_semesters(id, institution_id, academic_year_id, program_id, name, start_date, end_date, is_current, status, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, ?, 'Semester 1 (Autumn 2026)', '2026-07-01', '2026-12-15', 1, 'Active', ?, ?, ?, ?),
         (?, ?, ?, ?, 'Semester 2 (Spring 2027)', '2027-01-05', '2027-05-31', 0, 'Upcoming', ?, ?, ?, ?)`,
        [
          sem1, tenantId, year.id, progCse, now(), now(), actorId, actorId,
          sem2, tenantId, year.id, progCse, now(), now(), actorId, actorId,
        ],
      ).run();

      // Faculty
      const facultyUser = await one<{ id: string }>("SELECT id FROM users WHERE lower(email)='faculty@sst.com'");
      const principalUser = await one<{ id: string }>("SELECT id FROM users WHERE lower(email)='principal@sst.com'");
      const fac1 = "fac-sunita-" + tenantId.slice(0, 8);
      const fac2 = "fac-arvind-" + tenantId.slice(0, 8);
      const fac3 = "fac-meenakshi-" + tenantId.slice(0, 8);

      await stmt(
        `INSERT OR IGNORE INTO faculty(id, institution_id, user_id, employee_id, name, email, phone, department_id, department_name, designation, qualification, specialization, experience_years, joining_date, status, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, 'EMP-FAC-001', 'Prof. Sunita Sharma', 'faculty@sst.com', '9876543201', ?, 'Computer Science & Engineering', 'Associate Professor', 'Ph.D in Computer Science', 'Distributed Algorithms & AI', 12, '2020-07-01', 'Active', ?, ?, ?, ?),
         (?, ?, ?, 'EMP-FAC-002', 'Dr. Arvind Principal', 'principal@sst.com', '9876543202', ?, 'Natural Sciences & Mathematics', 'Professor & Principal', 'Ph.D in Applied Physics', 'Quantum Optics & Nanotech', 20, '2015-06-01', 'Active', ?, ?, ?, ?),
         (?, ?, NULL, 'EMP-FAC-003', 'Dr. Meenakshi Sundaram', 'meenakshi@sst.com', '9876543203', ?, 'Humanities & Social Sciences', 'Assistant Professor', 'Ph.D in English Literature', 'Technical Communication', 8, '2022-08-01', 'Active', ?, ?, ?, ?)`,
        [
          fac1, tenantId, facultyUser?.id || null, cseId, now(), now(), actorId, actorId,
          fac2, tenantId, principalUser?.id || null, sciId, now(), now(), actorId, actorId,
          fac3, tenantId, humId, now(), now(), actorId, actorId,
        ],
      ).run();

      // Faculty Documents
      await stmt(
        `INSERT OR IGNORE INTO faculty_documents(id, institution_id, faculty_id, title, document_type, file_url, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, 'Prof_Sunita_Curriculum_Vitae.pdf', 'Resume', 'https://campus.test/docs/fac1-cv.pdf', ?, ?, ?, ?),
         (?, ?, ?, 'Appointment_Letter_SST.pdf', 'Appointment Letter', 'https://campus.test/docs/fac1-apt.pdf', ?, ?, ?, ?)`,
        [
          uuid(), tenantId, fac1, now(), now(), actorId, actorId,
          uuid(), tenantId, fac1, now(), now(), actorId, actorId,
        ],
      ).run();

      // Sample class and section
      const sampleClass = await one<{ id: string }>("SELECT id FROM classes WHERE institution_id=? ORDER BY sort_order DESC LIMIT 1", [tenantId]);
      const sampleSection = await one<{ id: string }>("SELECT id FROM sections WHERE institution_id=? LIMIT 1", [tenantId]);
      const classId = sampleClass?.id || null;
      const sectionId = sampleSection?.id || null;

      // Subjects
      const sub1 = "sub-cs101-" + tenantId.slice(0, 8);
      const sub2 = "sub-cs102-" + tenantId.slice(0, 8);
      const sub3 = "sub-phy101-" + tenantId.slice(0, 8);
      const sub4 = "sub-cs101l-" + tenantId.slice(0, 8);

      await stmt(
        `INSERT OR IGNORE INTO subjects(id, institution_id, department_id, class_id, code, name, type, credits, faculty_id, status, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, ?, 'CS101', 'Data Structures & Algorithms', 'Theory', 4, ?, 'Active', ?, ?, ?, ?),
         (?, ?, ?, ?, 'CS102', 'Database Management Systems', 'Theory', 4, ?, 'Active', ?, ?, ?, ?),
         (?, ?, ?, ?, 'PHY101', 'Engineering Physics', 'Theory', 3, ?, 'Active', ?, ?, ?, ?),
         (?, ?, ?, ?, 'CS101L', 'Data Structures Laboratory', 'Practical', 2, ?, 'Active', ?, ?, ?, ?)`,
        [
          sub1, tenantId, cseId, classId, fac1, now(), now(), actorId, actorId,
          sub2, tenantId, cseId, classId, fac1, now(), now(), actorId, actorId,
          sub3, tenantId, sciId, classId, fac2, now(), now(), actorId, actorId,
          sub4, tenantId, cseId, classId, fac1, now(), now(), actorId, actorId,
        ],
      ).run();

      // Timetable Slots
      if (classId && sectionId) {
        const slots = [
          { day: "Monday", p: 1, start: "09:00", end: "09:55", sub: sub1, fac: fac1, room: "Lab-301" },
          { day: "Monday", p: 2, start: "10:00", end: "10:55", sub: sub2, fac: fac1, room: "LH-102" },
          { day: "Monday", p: 3, start: "11:15", end: "12:10", sub: sub3, fac: fac2, room: "LH-105" },
          { day: "Tuesday", p: 1, start: "09:00", end: "09:55", sub: sub3, fac: fac2, room: "LH-105" },
          { day: "Tuesday", p: 2, start: "10:00", end: "10:55", sub: sub1, fac: fac1, room: "LH-102" },
          { day: "Wednesday", p: 1, start: "09:00", end: "09:55", sub: sub4, fac: fac1, room: "Lab-301" },
          { day: "Wednesday", p: 2, start: "10:00", end: "10:55", sub: sub4, fac: fac1, room: "Lab-301" },
          { day: "Thursday", p: 1, start: "09:00", end: "09:55", sub: sub1, fac: fac1, room: "LH-102" },
          { day: "Friday", p: 1, start: "09:00", end: "09:55", sub: sub2, fac: fac1, room: "LH-102" },
        ];
        for (const s of slots) {
          await stmt(
            `INSERT OR IGNORE INTO timetable_slots(id, institution_id, academic_year_id, class_id, section_id, subject_id, faculty_id, day_of_week, period_number, start_time, end_time, room_number, status, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Published', ?, ?, ?, ?)`,
            [uuid(), tenantId, year.id, classId, sectionId, s.sub, s.fac, s.day, s.p, s.start, s.end, s.room, now(), now(), actorId, actorId],
          ).run();
        }
      }

      // Student Attendance (Sample student Aarav)
      const sampleStudent = await one<{ id: string }>("SELECT id FROM students WHERE institution_id=? LIMIT 1", [tenantId]);
      if (sampleStudent && classId && sectionId) {
        const attDates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"];
        for (let idx = 0; idx < attDates.length; idx++) {
          const st = idx === 2 ? "Late" : idx === 4 ? "Absent" : "Present";
          await stmt(
            `INSERT OR IGNORE INTO student_attendance(id, institution_id, academic_year_id, class_id, section_id, student_id, date, period_number, status, remarks, recorded_by, created_at, updated_at, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, '', 'Prof. Sunita Sharma', ?, ?, ?, ?)`,
            [uuid(), tenantId, year.id, classId, sectionId, sampleStudent.id, attDates[idx], st, now(), now(), actorId, actorId],
          ).run();
        }
      }

      // Faculty Attendance & Leaves
      await stmt(
        `INSERT OR IGNORE INTO faculty_attendance(id, institution_id, faculty_id, date, check_in, check_out, status, notes, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, '2026-10-06', '08:45', '16:30', 'Present', 'On time', ?, ?, ?, ?),
         (?, ?, ?, '2026-10-07', '08:52', NULL, 'Present', 'Morning session ongoing', ?, ?, ?, ?)`,
        [
          uuid(), tenantId, fac1, now(), now(), actorId, actorId,
          uuid(), tenantId, fac1, now(), now(), actorId, actorId,
        ],
      ).run();

      await stmt(
        `INSERT OR IGNORE INTO faculty_leaves(id, institution_id, faculty_id, leave_type, start_date, end_date, days_count, reason, substitute_faculty_id, substitute_name, status, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, 'Casual', '2026-10-15', '2026-10-16', 2, 'Attending IEEE Academic Symposium', ?, 'Dr. Arvind Principal', 'Pending', ?, ?, ?, ?),
         (?, ?, ?, 'Sick', '2026-09-12', '2026-09-13', 2, 'Seasonal fever and medical rest', NULL, '', 'Approved', ?, ?, ?, ?)`,
        [
          uuid(), tenantId, fac1, fac2, now(), now(), actorId, actorId,
          uuid(), tenantId, fac1, now(), now(), actorId, actorId,
        ],
      ).run();

      // LMS Course 1: CS101
      const course1 = "lms-cs101-" + tenantId.slice(0, 8);
      await stmt(
        `INSERT OR IGNORE INTO lms_courses(id, institution_id, code, title, description, thumbnail_url, department_id, subject_id, faculty_id, faculty_name, class_id, section_id, level, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, 'CS101', 'Data Structures & Algorithms in Practice', 'Master linear and non-linear data structures with practical coding exercises in TypeScript & C++.', 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600', ?, ?, ?, 'Prof. Sunita Sharma', ?, ?, 'Intermediate', 'Published', ?, ?, ?, ?)`,
        [course1, tenantId, cseId, sub1, fac1, classId, sectionId, now(), now(), actorId, actorId],
      ).run();

      // LMS Modules & Lessons
      const mod1 = "mod-linear-" + tenantId.slice(0, 8);
      const mod2 = "mod-trees-" + tenantId.slice(0, 8);
      await stmt(
        `INSERT OR IGNORE INTO lms_modules(id, institution_id, course_id, title, description, sort_order, status, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, 'Module 1: Linear Data Structures', 'Arrays, Dynamic Memory, and Linked Lists', 1, 'Published', ?, ?, ?, ?),
         (?, ?, ?, 'Module 2: Trees and Graphs', 'Binary Trees, Search Trees and Graph Traversals', 2, 'Published', ?, ?, ?, ?)`,
        [
          mod1, tenantId, course1, now(), now(), actorId, actorId,
          mod2, tenantId, course1, now(), now(), actorId, actorId,
        ],
      ).run();

      const les1 = "les-dynarray-" + tenantId.slice(0, 8);
      const les2 = "les-linkedlist-" + tenantId.slice(0, 8);
      const les3 = "les-bst-" + tenantId.slice(0, 8);
      await stmt(
        `INSERT OR IGNORE INTO lms_lessons(id, institution_id, course_id, module_id, title, content, duration_minutes, video_url, sort_order, status, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, ?, 'Lesson 1: Dynamic Arrays & Memory Allocations', 'Comprehensive exploration of amortized analysis, capacity doubling and cache locality.', 25, 'https://www.youtube.com/watch?v=sample1', 1, 'Published', ?, ?, ?, ?),
         (?, ?, ?, ?, 'Lesson 2: Singly and Doubly Linked Lists', 'Pointer manipulation, sentinel nodes, and reversing linked lists iteratively and recursively.', 30, 'https://www.youtube.com/watch?v=sample2', 2, 'Published', ?, ?, ?, ?),
         (?, ?, ?, ?, 'Lesson 3: Binary Search Tree (BST) Operations', 'Node insertions, deletions with 2 children, in-order traversal and balanced property.', 35, 'https://www.youtube.com/watch?v=sample3', 1, 'Published', ?, ?, ?, ?)`,
        [
          les1, tenantId, course1, mod1, now(), now(), actorId, actorId,
          les2, tenantId, course1, mod1, now(), now(), actorId, actorId,
          les3, tenantId, course1, mod2, now(), now(), actorId, actorId,
        ],
      ).run();

      // LMS Resources
      await stmt(
        `INSERT OR IGNORE INTO lms_resources(id, institution_id, course_id, lesson_id, title, type, file_url, file_size_bytes, is_downloadable, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, ?, 'CS101 Lecture Notes - Chapter 1.pdf', 'PDF', 'https://campus.test/lms/notes-ch1.pdf', 2048576, 1, ?, ?, ?, ?),
         (?, ?, ?, ?, 'Dynamic Arrays Source Code Repository', 'Link', 'https://github.com/example/ds-typescript', 0, 1, ?, ?, ?, ?),
         (?, ?, ?, ?, 'Practice Problem Set 1.docx', 'Word', 'https://campus.test/lms/problem-set-1.docx', 512000, 1, ?, ?, ?, ?)`,
        [
          uuid(), tenantId, course1, les1, now(), now(), actorId, actorId,
          uuid(), tenantId, course1, les1, now(), now(), actorId, actorId,
          uuid(), tenantId, course1, les2, now(), now(), actorId, actorId,
        ],
      ).run();

      // LMS Student Enrollment
      if (sampleStudent) {
        await stmt(
          `INSERT OR IGNORE INTO lms_enrollments(id, institution_id, course_id, student_id, enrolled_date, progress_percent, completed_lessons, last_accessed_lesson_id, last_accessed_at, status, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, '2026-09-01', 67, ?, ?, ?, 'Active', ?, ?, ?, ?)`,
          [
            uuid(),
            tenantId,
            course1,
            sampleStudent.id,
            JSON.stringify([les1, les2]),
            les2,
            now(),
            now(),
            now(),
            actorId,
            actorId,
          ],
        ).run();
      }

      // LMS Assignments & Submissions
      const asgn1 = "asgn-bst-" + tenantId.slice(0, 8);
      await stmt(
        `INSERT OR IGNORE INTO lms_assignments(id, institution_id, course_id, subject_id, class_id, section_id, faculty_id, title, instructions, attachment_url, max_marks, due_date, allow_late, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Assignment 1: Balanced BST & AVL Rotation Engine', 'Implement self-balancing rotations (LL, RR, LR, RL) for a Binary Search Tree with unit tests in TypeScript.', 'https://campus.test/lms/asgn1-starter.zip', 100, '2026-10-31', 1, 'Published', ?, ?, ?, ?)`,
        [asgn1, tenantId, course1, sub1, classId, sectionId, fac1, now(), now(), actorId, actorId],
      ).run();

      if (sampleStudent) {
        await stmt(
          `INSERT OR IGNORE INTO lms_submissions(id, institution_id, assignment_id, student_id, student_name, content, attachment_url, submitted_at, status, marks_obtained, feedback, graded_by, graded_at, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'Aarav Kumar (Student)', 'Implemented AVL rotations, height balancing, and in-order validation tests.', 'https://campus.test/lms/aarav-bst-submission.zip', '2026-10-04T14:30:00.000Z', 'Graded', 94, 'Outstanding code organization, clear comments and 100% test coverage passing.', 'Prof. Sunita Sharma', '2026-10-05T10:00:00.000Z', ?, ?, ?, ?)`,
          [uuid(), tenantId, asgn1, sampleStudent.id, now(), now(), actorId, actorId],
        ).run();
      }

      // LMS Quizzes & Questions & Attempts
      const quiz1 = "quiz-linear-" + tenantId.slice(0, 8);
      await stmt(
        `INSERT OR IGNORE INTO lms_quizzes(id, institution_id, course_id, faculty_id, title, description, time_limit_minutes, total_marks, passing_marks, due_date, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, 'CS101 Mid-Semester Quiz: Linear Data Structures', '30 minutes assessment on arrays, amortized cost and linked lists.', 30, 30, 15, '2026-10-25', 'Published', ?, ?, ?, ?)`,
        [quiz1, tenantId, course1, fac1, now(), now(), actorId, actorId],
      ).run();

      const q1 = "q1-" + tenantId.slice(0, 8);
      const q2 = "q2-" + tenantId.slice(0, 8);
      const q3 = "q3-" + tenantId.slice(0, 8);
      await stmt(
        `INSERT OR IGNORE INTO lms_quiz_questions(id, institution_id, quiz_id, question, type, options, correct_answer, explanation, marks, sort_order, created_at, updated_at, created_by, updated_by)
         VALUES
         (?, ?, ?, 'What is the amortized time complexity of inserting an element into a dynamic array (vector)?', 'MCQ', '["O(1)", "O(n)", "O(log n)", "O(n^2)"]', 'O(1)', 'Although resizing takes O(n), it occurs rarely enough that the average time per append is constant O(1).', 10, 1, ?, ?, ?, ?),
         (?, ?, ?, 'Which data structure allows O(1) insertion at both ends without shifting elements?', 'MCQ', '["Array", "Singly Linked List", "Doubly Linked List / Deque", "Stack"]', 'Doubly Linked List / Deque', 'With head and tail pointers, a deque allows O(1) push and pop on both ends.', 10, 2, ?, ?, ?, ?),
         (?, ?, ?, 'In a singly linked list, reversing the list in-place requires O(n) extra auxiliary space.', 'MCQ', '["True", "False"]', 'False', 'A linked list can be reversed in O(1) auxiliary space using three pointers (prev, current, next).', 10, 3, ?, ?, ?, ?)`,
        [
          q1, tenantId, quiz1, now(), now(), actorId, actorId,
          q2, tenantId, quiz1, now(), now(), actorId, actorId,
          q3, tenantId, quiz1, now(), now(), actorId, actorId,
        ],
      ).run();

      if (sampleStudent) {
        await stmt(
          `INSERT OR IGNORE INTO lms_quiz_attempts(id, institution_id, quiz_id, student_id, student_name, answers, score, max_score, percentage, passed, time_spent_seconds, completed_at, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, 'Aarav Kumar (Student)', ?, 30, 30, 100, 1, 740, '2026-10-05T11:25:00.000Z', ?, ?, ?, ?)`,
          [
            uuid(),
            tenantId,
            quiz1,
            sampleStudent.id,
            JSON.stringify({ [q1]: "O(1)", [q2]: "Doubly Linked List / Deque", [q3]: "False" }),
            now(),
            now(),
            actorId,
            actorId,
          ],
        ).run();
      }
    }
  } catch (err) {
    console.warn("Member 2 & 3 demonstration seed notice:", err);
  }
}

// ---------------------------------------------------------------------------
// Student Portal Sections 13-24 Seed Demonstration (Member 2 - Part 2)
// Strictly Idempotent: Can be executed multiple times without duplicate records.
// Populates 2 Demo Students in primary institution (Student A, Student B)
// and 1 Demo Student in secondary cross-tenant institution (Student C).
// ---------------------------------------------------------------------------

export async function ensureStudentPortalPart2Demonstration(
  tenantIdIn?: string,
  actorIdIn?: string,
  customDb?: any,
) {
  const dbRun = async (sql: string, params: unknown[] = []) => {
    if (customDb) {
      return await customDb.prepare(sql).bind(...params).run();
    }
    return await run(sql, params);
  };

  const dbOne = async <T = Record<string, any>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> => {
    if (customDb) {
      return (await customDb.prepare(sql).bind(...params).first()) as T | null;
    }
    return await one<T>(sql, params);
  };

  const actorId = actorIdIn || "seed-actor-m2";
  let tenant1Id = tenantIdIn;
  if (!tenant1Id) {
    const mainInst = await dbOne<{ id: string }>(
      "SELECT id FROM institutions ORDER BY created_at LIMIT 1",
    );
    tenant1Id = mainInst?.id || "csa-main-campus";
  }

  // 1. Ensure Institution 1 (Main Tenant)
  await dbRun(
    `INSERT OR IGNORE INTO institutions(id, name, slug, address, email, phone, subscription, status, settings, created_at, updated_at, created_by, updated_by)
     VALUES (?, 'Chaitanya Shree Academy', ?, '24 Vidyanagar, Bengaluru', 'accounts@csa.test', '080-2345-6789', 'Professional', 'Active', '{"theme":"system","feedback":{"allow_anonymous":true,"faculty_enabled":true},"class_comparison_allowed":false}', ?, ?, ?, ?)`,
    [tenant1Id, tenant1Id, now(), now(), actorId, actorId],
  );

  let year1 = await dbOne<{ id: string }>(
    "SELECT id FROM academic_years WHERE institution_id=? AND status='Active' LIMIT 1",
    [tenant1Id],
  );
  if (!year1) {
    const yid = `ay-2026-${tenant1Id.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO academic_years(id, institution_id, name, start_date, end_date, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, '2026–27', '2026-06-01', '2027-05-31', 'Active', ?, ?, ?, ?)`,
      [yid, tenant1Id, now(), now(), actorId, actorId],
    );
    year1 = { id: yid };
  }

  let camp1 = await dbOne<{ id: string }>(
    "SELECT id FROM campuses WHERE institution_id=? LIMIT 1",
    [tenant1Id],
  );
  if (!camp1) {
    const cid = `camp-main-${tenant1Id.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO campuses(id, institution_id, name, address, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, 'Main Campus', 'Vidyanagar, Bengaluru', ?, ?, ?, ?)`,
      [cid, tenant1Id, now(), now(), actorId, actorId],
    );
    camp1 = { id: cid };
  }

  let cls1 = await dbOne<{ id: string }>(
    "SELECT id FROM classes WHERE institution_id=? LIMIT 1",
    [tenant1Id],
  );
  if (!cls1) {
    const clsid = `cls-10-${tenant1Id.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO classes(id, institution_id, name, level, sort_order, active, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, 'Class 10', 'School', 10, 1, ?, ?, ?, ?)`,
      [clsid, tenant1Id, now(), now(), actorId, actorId],
    );
    cls1 = { id: clsid };
  }

  let sec1 = await dbOne<{ id: string }>(
    "SELECT id FROM sections WHERE institution_id=? LIMIT 1",
    [tenant1Id],
  );
  if (!sec1) {
    const secid = `sec-a-${tenant1Id.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO sections(id, institution_id, academic_year_id, class_id, campus_id, name, capacity, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'Section A', 40, ?, ?, ?, ?)`,
      [secid, tenant1Id, year1.id, cls1.id, camp1.id, now(), now(), actorId, actorId],
    );
    sec1 = { id: secid };
  }

  let dept1 = await dbOne<{ id: string }>(
    "SELECT id FROM departments WHERE institution_id=? LIMIT 1",
    [tenant1Id],
  );
  if (!dept1) {
    const did = `dept-cse-${tenant1Id.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO departments(id, institution_id, code, name, description, hod_name, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, 'CSE', 'Computer Science & Engineering', 'Core computing and algorithms', 'Prof. Sunita Sharma', 'Active', ?, ?, ?, ?)`,
      [did, tenant1Id, now(), now(), actorId, actorId],
    );
    dept1 = { id: did };
  }

  let prog1 = await dbOne<{ id: string }>(
    "SELECT id FROM programs WHERE institution_id=? LIMIT 1",
    [tenant1Id],
  );
  if (!prog1) {
    const pid = `prog-btech-${tenant1Id.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO programs(id, institution_id, department_id, code, name, degree_level, duration_years, total_semesters, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, 'BTECH-CSE', 'B.Tech Computer Science & Engineering', 'Undergraduate', 4, 8, 'Active', ?, ?, ?, ?)`,
      [pid, tenant1Id, dept1.id, now(), now(), actorId, actorId],
    );
    prog1 = { id: pid };
  }

  // 2. Ensure Institution 2 (Cross-Tenant)
  const tenant2Id = "inst-cross-tenant-sst";
  await dbRun(
    `INSERT OR IGNORE INTO institutions(id, name, slug, address, email, phone, subscription, status, settings, created_at, updated_at, created_by, updated_by)
     VALUES (?, 'St. Xavier International Academy', 'st-xavier-intl', '45 Park Street, Kolkata', 'accounts@stxavier.test', '033-2289-1000', 'Professional', 'Active', '{"theme":"system","feedback":{"allow_anonymous":true,"faculty_enabled":true},"class_comparison_allowed":false}', ?, ?, ?, ?)`,
    [tenant2Id, now(), now(), actorId, actorId],
  );

  let year2 = await dbOne<{ id: string }>(
    "SELECT id FROM academic_years WHERE institution_id=? AND status='Active' LIMIT 1",
    [tenant2Id],
  );
  if (!year2) {
    const yid = `ay-2026-cross`;
    await dbRun(
      `INSERT OR IGNORE INTO academic_years(id, institution_id, name, start_date, end_date, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, '2026–27', '2026-06-01', '2027-05-31', 'Active', ?, ?, ?, ?)`,
      [yid, tenant2Id, now(), now(), actorId, actorId],
    );
    year2 = { id: yid };
  }

  let camp2 = await dbOne<{ id: string }>(
    "SELECT id FROM campuses WHERE institution_id=? LIMIT 1",
    [tenant2Id],
  );
  if (!camp2) {
    const cid = `camp-cross-main`;
    await dbRun(
      `INSERT OR IGNORE INTO campuses(id, institution_id, name, address, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, 'Main City Campus', '45 Park Street, Kolkata', ?, ?, ?, ?)`,
      [cid, tenant2Id, now(), now(), actorId, actorId],
    );
    camp2 = { id: cid };
  }

  let cls2 = await dbOne<{ id: string }>(
    "SELECT id FROM classes WHERE institution_id=? LIMIT 1",
    [tenant2Id],
  );
  if (!cls2) {
    const clsid = `cls-10-cross`;
    await dbRun(
      `INSERT OR IGNORE INTO classes(id, institution_id, name, level, sort_order, active, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, 'Class 10', 'School', 10, 1, ?, ?, ?, ?)`,
      [clsid, tenant2Id, now(), now(), actorId, actorId],
    );
    cls2 = { id: clsid };
  }

  let sec2 = await dbOne<{ id: string }>(
    "SELECT id FROM sections WHERE institution_id=? LIMIT 1",
    [tenant2Id],
  );
  if (!sec2) {
    const secid = `sec-a-cross`;
    await dbRun(
      `INSERT OR IGNORE INTO sections(id, institution_id, academic_year_id, class_id, campus_id, name, capacity, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'Section A', 40, ?, ?, ?, ?)`,
      [secid, tenant2Id, year2.id, cls2.id, camp2.id, now(), now(), actorId, actorId],
    );
    sec2 = { id: secid };
  }

  let dept2 = await dbOne<{ id: string }>(
    "SELECT id FROM departments WHERE institution_id=? LIMIT 1",
    [tenant2Id],
  );
  if (!dept2) {
    const did = `dept-cse-cross`;
    await dbRun(
      `INSERT OR IGNORE INTO departments(id, institution_id, code, name, description, hod_name, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, 'CSE-X', 'Computer Science & Engineering', 'Computing sciences department', 'Dr. Alok Ghosh', 'Active', ?, ?, ?, ?)`,
      [did, tenant2Id, now(), now(), actorId, actorId],
    );
    dept2 = { id: did };
  }

  let prog2 = await dbOne<{ id: string }>(
    "SELECT id FROM programs WHERE institution_id=? LIMIT 1",
    [tenant2Id],
  );
  if (!prog2) {
    const pid = `prog-btech-cross`;
    await dbRun(
      `INSERT OR IGNORE INTO programs(id, institution_id, department_id, code, name, degree_level, duration_years, total_semesters, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, 'BTECH-X', 'B.Tech Computer Science & Engineering', 'Undergraduate', 4, 8, 'Active', ?, ?, ?, ?)`,
      [pid, tenant2Id, dept2.id, now(), now(), actorId, actorId],
    );
    prog2 = { id: pid };
  }

  // 2B. Faculty, Subjects & Timetable for Tenant 1
  const fac1Id = `fac-advisor-${tenant1Id.slice(0, 8)}`;
  await dbRun(
    `INSERT OR IGNORE INTO faculty(id, institution_id, employee_id, name, email, phone, department_id, department_name, designation, status, joining_date, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, 'EMP-FAC-001', 'Prof. Sunita Sharma', 'faculty@sst.com', '9876543201', ?, 'Computer Science & Engineering', 'Associate Professor', 'Active', '2020-07-01', ?, ?, ?, ?)`,
    [fac1Id, tenant1Id, dept1.id, now(), now(), actorId, actorId],
  );
  const sub1Id = `sub-cs101-${tenant1Id.slice(0, 8)}`;
  await dbRun(
    `INSERT OR IGNORE INTO subjects(id, institution_id, department_id, class_id, code, name, type, credits, faculty_id, status, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, 'CS101', 'Data Structures & Algorithms', 'Theory', 4, ?, 'Active', ?, ?, ?, ?)`,
    [sub1Id, tenant1Id, dept1.id, cls1.id, fac1Id, now(), now(), actorId, actorId],
  );
  await dbRun(
    `INSERT OR IGNORE INTO timetable_slots(id, institution_id, academic_year_id, campus_id, class_id, section_id, subject_id, faculty_id, day_of_week, period_number, start_time, end_time, room_number, status, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Monday', 1, '09:00', '10:00', 'Room 101', 'Published', ?, ?, ?, ?)`,
    [`tt-1-${tenant1Id.slice(0, 8)}`, tenant1Id, year1.id, camp1.id, cls1.id, sec1.id, sub1Id, fac1Id, now(), now(), actorId, actorId],
  );

  // 2C. Faculty, Subjects & Timetable for Tenant 2 (Cross-Tenant)
  const fac2Id = `fac-advisor-cross`;
  await dbRun(
    `INSERT OR IGNORE INTO faculty(id, institution_id, employee_id, name, email, phone, department_id, department_name, designation, status, joining_date, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, 'EMP-FAC-CROSS-01', 'Dr. Alok Ghosh', 'faculty.cross@sst.test', '033-2289-1001', ?, 'Computer Science & Engineering', 'Professor & HOD', 'Active', '2018-07-01', ?, ?, ?, ?)`,
    [fac2Id, tenant2Id, dept2.id, now(), now(), actorId, actorId],
  );
  const sub2Id = `sub-cs101-cross`;
  await dbRun(
    `INSERT OR IGNORE INTO subjects(id, institution_id, department_id, class_id, code, name, type, credits, faculty_id, status, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, 'CS101-X', 'Data Structures & Algorithms', 'Theory', 4, ?, 'Active', ?, ?, ?, ?)`,
    [sub2Id, tenant2Id, dept2.id, cls2.id, fac2Id, now(), now(), actorId, actorId],
  );
  await dbRun(
    `INSERT OR IGNORE INTO timetable_slots(id, institution_id, academic_year_id, campus_id, class_id, section_id, subject_id, faculty_id, day_of_week, period_number, start_time, end_time, room_number, status, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Monday', 1, '09:00', '10:00', 'Lab 201', 'Published', ?, ?, ?, ?)`,
    [`tt-2-cross`, tenant2Id, year2.id, camp2.id, cls2.id, sec2.id, sub2Id, fac2Id, now(), now(), actorId, actorId],
  );

  // 3. Define the 3 Demo Students
  // Student A in Tenant 1
  const studentAId = `stu-demo-a-${tenant1Id.slice(0, 8)}`;
  await dbRun(
    `INSERT OR IGNORE INTO students(id, institution_id, admission_number, name, dob, gender, admission_date, status, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, 'CSA/2026/0001', 'Aarav Kumar (Student A)', '2010-05-15', 'Male', '2026-06-01', 'Active', ?, ?, ?, ?)`,
    [studentAId, tenant1Id, now(), now(), actorId, actorId],
  );

  let userA = await dbOne<{ id: string }>(
    "SELECT id FROM users WHERE lower(email)='student@sst.com'",
  );
  if (!userA) {
    const uaid = `user-stu-a-${tenant1Id.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO users(id, email, name, created_at, updated_at, created_by, updated_by)
       VALUES (?, 'student@sst.com', 'Aarav Kumar (Student A)', ?, ?, ?, ?)`,
      [uaid, now(), now(), actorId, actorId],
    );
    userA = { id: uaid };
  }

  await dbRun(
    `INSERT INTO memberships(id, institution_id, user_id, role, display_name, active, student_id, permissions, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, 'STUDENT', 'Aarav Kumar (Student A)', 1, ?, '[]', ?, ?, ?, ?)
     ON CONFLICT(institution_id, user_id) DO UPDATE SET student_id=excluded.student_id, role='STUDENT', active=1`,
    [`mem-stu-a-${tenant1Id.slice(0, 8)}`, tenant1Id, userA.id, studentAId, now(), now(), actorId, actorId],
  );

  await dbRun(
    `INSERT OR IGNORE INTO enrollments(id, institution_id, student_id, academic_year_id, section_id, roll_number, clearance, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, '1', 'Approved', ?, ?, ?, ?)`,
    [`enr-stu-a-${tenant1Id.slice(0, 8)}`, tenant1Id, studentAId, year1.id, sec1.id, now(), now(), actorId, actorId],
  );

  // Student B in Tenant 1
  const studentBId = `stu-demo-b-${tenant1Id.slice(0, 8)}`;
  await dbRun(
    `INSERT OR IGNORE INTO students(id, institution_id, admission_number, name, dob, gender, admission_date, status, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, 'CSA/2026/0002', 'Diya Sharma (Student B)', '2010-08-20', 'Female', '2026-06-01', 'Active', ?, ?, ?, ?)`,
    [studentBId, tenant1Id, now(), now(), actorId, actorId],
  );

  let userB = await dbOne<{ id: string }>(
    "SELECT id FROM users WHERE lower(email)='student.b@sst.com'",
  );
  if (!userB) {
    const ubid = `user-stu-b-${tenant1Id.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO users(id, email, name, created_at, updated_at, created_by, updated_by)
       VALUES (?, 'student.b@sst.com', 'Diya Sharma (Student B)', ?, ?, ?, ?)`,
      [ubid, now(), now(), actorId, actorId],
    );
    userB = { id: ubid };
  }

  await dbRun(
    `INSERT INTO memberships(id, institution_id, user_id, role, display_name, active, student_id, permissions, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, 'STUDENT', 'Diya Sharma (Student B)', 1, ?, '[]', ?, ?, ?, ?)
     ON CONFLICT(institution_id, user_id) DO UPDATE SET student_id=excluded.student_id, role='STUDENT', active=1`,
    [`mem-stu-b-${tenant1Id.slice(0, 8)}`, tenant1Id, userB.id, studentBId, now(), now(), actorId, actorId],
  );

  await dbRun(
    `INSERT OR IGNORE INTO enrollments(id, institution_id, student_id, academic_year_id, section_id, roll_number, clearance, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, '2', 'Approved', ?, ?, ?, ?)`,
    [`enr-stu-b-${tenant1Id.slice(0, 8)}`, tenant1Id, studentBId, year1.id, sec1.id, now(), now(), actorId, actorId],
  );

  // Student C in Tenant 2 (Cross-Tenant)
  const studentCId = `stu-demo-c-cross`;
  await dbRun(
    `INSERT OR IGNORE INTO students(id, institution_id, admission_number, name, dob, gender, admission_date, status, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, 'SXI/2026/0003', 'Rohan Varma (Student C - Cross Tenant)', '2010-03-12', 'Male', '2026-06-01', 'Active', ?, ?, ?, ?)`,
    [studentCId, tenant2Id, now(), now(), actorId, actorId],
  );

  let userC = await dbOne<{ id: string }>(
    "SELECT id FROM users WHERE lower(email)='student.c@sst.com'",
  );
  if (!userC) {
    const ucid = `user-stu-c-cross`;
    await dbRun(
      `INSERT OR IGNORE INTO users(id, email, name, created_at, updated_at, created_by, updated_by)
       VALUES (?, 'student.c@sst.com', 'Rohan Varma (Student C - Cross Tenant)', ?, ?, ?, ?)`,
      [ucid, now(), now(), actorId, actorId],
    );
    userC = { id: ucid };
  }

  await dbRun(
    `INSERT INTO memberships(id, institution_id, user_id, role, display_name, active, student_id, permissions, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, 'STUDENT', 'Rohan Varma (Student C - Cross Tenant)', 1, ?, '[]', ?, ?, ?, ?)
     ON CONFLICT(institution_id, user_id) DO UPDATE SET student_id=excluded.student_id, role='STUDENT', active=1`,
    [`mem-stu-c-cross`, tenant2Id, userC.id, studentCId, now(), now(), actorId, actorId],
  );

  await dbRun(
    `INSERT OR IGNORE INTO enrollments(id, institution_id, student_id, academic_year_id, section_id, roll_number, clearance, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, '1', 'Approved', ?, ?, ?, ?)`,
    [`enr-stu-c-cross`, tenant2Id, studentCId, year2.id, sec2.id, now(), now(), actorId, actorId],
  );

  const demoStudents = [
    {
      id: studentAId,
      name: "Aarav Kumar (Student A)",
      instId: tenant1Id,
      yearId: year1.id,
      classId: cls1.id,
      sectionId: sec1.id,
      deptId: dept1.id,
      progId: prog1.id,
      prefix: "stuA",
    },
    {
      id: studentBId,
      name: "Diya Sharma (Student B)",
      instId: tenant1Id,
      yearId: year1.id,
      classId: cls1.id,
      sectionId: sec1.id,
      deptId: dept1.id,
      progId: prog1.id,
      prefix: "stuB",
    },
    {
      id: studentCId,
      name: "Rohan Varma (Student C - Cross Tenant)",
      instId: tenant2Id,
      yearId: year2.id,
      classId: cls2.id,
      sectionId: sec2.id,
      deptId: dept2.id,
      progId: prog2.id,
      prefix: "stuC",
    },
  ];

  // 4. Seed Data per Student
  for (const s of demoStudents) {
    const instId = s.instId;
    const yearId = s.yearId;
    const stuId = s.id;
    const pfx = `${s.prefix}-${instId.slice(0, 6)}`;

    // A. INVOICES, INSTALLMENTS, PAYMENTS, RECEIPTS
    const existingInvs = await dbOne<{ id: string }>(
      "SELECT id FROM invoices WHERE institution_id=? AND student_id=? LIMIT 1",
      [instId, stuId],
    );

    if (!existingInvs) {
      // Find or create fee component
      let cmp = await dbOne<{ id: string }>(
        "SELECT id FROM fee_components WHERE institution_id=? ORDER BY created_at LIMIT 1",
        [instId],
      );
      if (!cmp) {
        const cmpId = `comp-tut-${pfx}`;
        await dbRun(
          `INSERT OR IGNORE INTO fee_components(id, institution_id, name, category, active, sort_order, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, 'Tuition Fee', 'Academic', 1, 1, ?, ?, ?, ?)`,
          [cmpId, instId, now(), now(), actorId, actorId],
        );
        cmp = { id: cmpId };
      }

      // Fee structures for this student's invoices
      const str1 = `str-term1-${pfx}`;
      const str2 = `str-term2-${pfx}`;
      const str3 = `str-term3-${pfx}`;

      await dbRun(
        `INSERT OR IGNORE INTO fee_structures(id, institution_id, academic_year_id, class_id, name, frequency, schedule, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, 'Term 1 Fee Structure', 'Quarterly', '[]', 'Active', ?, ?, ?, ?),
                (?, ?, ?, ?, 'Term 2 Fee Structure', 'Quarterly', '[]', 'Active', ?, ?, ?, ?),
                (?, ?, ?, ?, 'Term 3 Composite Fee Structure', 'Quarterly', '[]', 'Active', ?, ?, ?, ?)`,
        [
          str1, instId, yearId, s.classId, now(), now(), actorId, actorId,
          str2, instId, yearId, s.classId, now(), now(), actorId, actorId,
          str3, instId, yearId, s.classId, now(), now(), actorId, actorId,
        ],
      );

      await dbRun(
        `INSERT OR IGNORE INTO fee_structure_items(id, institution_id, structure_id, component_id, amount_paise)
         VALUES (?, ?, ?, ?, 2000000),
                (?, ?, ?, ?, 2500000),
                (?, ?, ?, ?, 4500000)`,
        [
          `fsi-1-${pfx}`, instId, str1, cmp.id,
          `fsi-2-${pfx}`, instId, str2, cmp.id,
          `fsi-3-${pfx}`, instId, str3, cmp.id,
        ],
      );

      // 1. INVOICE 1: PAID (₹20,000 / 2,000,000 paise)
      const asg1 = `asg-1-${pfx}`;
      const inv1 = `inv-paid-${pfx}`;
      const inst1 = `inst-paid-${pfx}`;
      const pay1 = `pay-paid-${pfx}`;
      const rec1 = `rec-paid-${pfx}`;

      await dbRun(
        `INSERT INTO student_fee_assignments(id, institution_id, student_id, academic_year_id, structure_id, discount_paise, scholarship_paise, reason, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 0, 0, 'Term 1 Standard Enrollment', ?, ?, ?, ?)`,
        [asg1, instId, stuId, yearId, str1, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO invoices(id, institution_id, student_id, academic_year_id, assignment_id, gross_paise, discount_paise, scholarship_paise, net_paise, issued_date, due_date, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 2000000, 0, 0, 2000000, '2026-06-01', '2026-06-30', ?, ?, ?, ?)`,
        [inv1, instId, stuId, yearId, asg1, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO invoice_items(id, institution_id, invoice_id, component_id, name, amount_paise)
         VALUES (?, ?, ?, ?, 'Tuition Fee - Term 1', 2000000)`,
        [`ii-1-${pfx}`, instId, inv1, cmp.id],
      );
      await dbRun(
        `INSERT INTO installments(id, institution_id, invoice_id, student_id, academic_year_id, title, amount_paise, due_date, sort_order, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Term 1 Installment', 2000000, '2026-06-30', 1, ?, ?, ?, ?)`,
        [inst1, instId, inv1, stuId, yearId, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO ledger_entries(id, institution_id, student_id, academic_year_id, invoice_id, kind, description, debit_paise, credit_paise, entry_date, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Fee', 'Term 1 Tuition Fee', 2000000, 0, '2026-06-01', ?, ?, ?, ?)`,
        [`le-fee-1-${pfx}`, instId, stuId, yearId, inv1, now(), now(), actorId, actorId],
      );
      // Successful payment + allocation + ledger payment credit + receipt
      await dbRun(
        `INSERT INTO payments(id, institution_id, student_id, academic_year_id, amount_paise, method, status, reference, idempotency_key, request_hash, paid_at, notes, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, 2000000, 'UPI', 'Successful', ?, ?, 'seed', '2026-06-25T10:00:00.000Z', 'Online portal payment', ?, ?, ?, ?)`,
        [pay1, instId, stuId, yearId, `UPI-REF-${pfx}-01`, `idem-pay1-${pfx}`, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO payment_allocations(id, institution_id, payment_id, invoice_id, installment_id, amount_paise)
         VALUES (?, ?, ?, ?, ?, 2000000)`,
        [`pa-1-${pfx}`, instId, pay1, inv1, inst1],
      );
      await dbRun(
        `INSERT INTO ledger_entries(id, institution_id, student_id, academic_year_id, payment_id, kind, description, debit_paise, credit_paise, entry_date, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Payment', 'UPI payment for Term 1', 0, 2000000, '2026-06-25', ?, ?, ?, ?)`,
        [`le-pay-1-${pfx}`, instId, stuId, yearId, pay1, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO receipts(id, institution_id, payment_id, academic_year_id, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [rec1, instId, pay1, yearId, now(), now(), actorId, actorId],
      );

      // 2. INVOICE 2: PENDING / UPCOMING (₹25,000 / 2,500,000 paise)
      const asg2 = `asg-2-${pfx}`;
      const inv2 = `inv-pend-${pfx}`;
      const inst2 = `inst-pend-${pfx}`;

      await dbRun(
        `INSERT INTO student_fee_assignments(id, institution_id, student_id, academic_year_id, structure_id, discount_paise, scholarship_paise, reason, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 0, 0, 'Term 2 Academic Enrollment', ?, ?, ?, ?)`,
        [asg2, instId, stuId, yearId, str2, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO invoices(id, institution_id, student_id, academic_year_id, assignment_id, gross_paise, discount_paise, scholarship_paise, net_paise, issued_date, due_date, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 2500000, 0, 0, 2500000, '2026-10-01', '2026-12-15', ?, ?, ?, ?)`,
        [inv2, instId, stuId, yearId, asg2, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO invoice_items(id, institution_id, invoice_id, component_id, name, amount_paise)
         VALUES (?, ?, ?, ?, 'Tuition Fee - Term 2', 2500000)`,
        [`ii-2-${pfx}`, instId, inv2, cmp.id],
      );
      await dbRun(
        `INSERT INTO installments(id, institution_id, invoice_id, student_id, academic_year_id, title, amount_paise, due_date, sort_order, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Term 2 Installment', 2500000, '2026-12-15', 1, ?, ?, ?, ?)`,
        [inst2, instId, inv2, stuId, yearId, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO ledger_entries(id, institution_id, student_id, academic_year_id, invoice_id, kind, description, debit_paise, credit_paise, entry_date, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Fee', 'Term 2 Tuition Fee', 2500000, 0, '2026-10-01', ?, ?, ?, ?)`,
        [`le-fee-2-${pfx}`, instId, stuId, yearId, inv2, now(), now(), actorId, actorId],
      );

      // Pending payment attempt
      const pay2 = `pay-pend-${pfx}`;
      await dbRun(
        `INSERT INTO payments(id, institution_id, student_id, academic_year_id, amount_paise, method, status, reference, idempotency_key, request_hash, paid_at, notes, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, 2500000, 'Net Banking', 'Pending', ?, ?, 'seed', '2026-10-06T09:30:00.000Z', 'Awaiting gateway settlement callback', ?, ?, ?, ?)`,
        [pay2, instId, stuId, yearId, `NB-REF-${pfx}-02`, `idem-pay2-${pfx}`, now(), now(), actorId, actorId],
      );

      // 3. INVOICE 3: OVERDUE WITH LATE FEE + SCHOLARSHIP/DISCOUNT
      // Gross: 4,500,000, Discount: 500,000, Scholarship: 1,000,000, Net: 3,000,000
      const asg3 = `asg-3-${pfx}`;
      const inv3 = `inv-overdue-${pfx}`;
      const inst3 = `inst-overdue-${pfx}`;
      const adj3 = `adj-late-${pfx}`;

      await dbRun(
        `INSERT INTO student_fee_assignments(id, institution_id, student_id, academic_year_id, structure_id, discount_paise, scholarship_paise, reason, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 500000, 1000000, 'Merit scholarship and sibling concession', ?, ?, ?, ?)`,
        [asg3, instId, stuId, yearId, str3, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO invoices(id, institution_id, student_id, academic_year_id, assignment_id, gross_paise, discount_paise, scholarship_paise, net_paise, issued_date, due_date, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 4500000, 500000, 1000000, 3000000, '2026-06-01', '2026-07-15', ?, ?, ?, ?)`,
        [inv3, instId, stuId, yearId, asg3, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO invoice_items(id, institution_id, invoice_id, component_id, name, amount_paise)
         VALUES (?, ?, ?, ?, 'Composite Annual Academic Fee', 4500000)`,
        [`ii-3-${pfx}`, instId, inv3, cmp.id],
      );
      await dbRun(
        `INSERT INTO installments(id, institution_id, invoice_id, student_id, academic_year_id, title, amount_paise, due_date, sort_order, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Annual Installment', 3000000, '2026-07-15', 1, ?, ?, ?, ?)`,
        [inst3, instId, inv3, stuId, yearId, now(), now(), actorId, actorId],
      );
      // Ledgers for invoice 3: Fee debit, Discount credit, Scholarship credit
      await dbRun(
        `INSERT INTO ledger_entries(id, institution_id, student_id, academic_year_id, invoice_id, kind, description, debit_paise, credit_paise, entry_date, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Fee', 'Composite Annual Academic Fee', 4500000, 0, '2026-06-01', ?, ?, ?, ?),
                (?, ?, ?, ?, ?, 'Discount', 'Approved sibling concession', 0, 500000, '2026-06-01', ?, ?, ?, ?),
                (?, ?, ?, ?, ?, 'Scholarship', 'Approved merit academic scholarship', 0, 1000000, '2026-06-01', ?, ?, ?, ?)`,
        [
          `le-fee-3-${pfx}`, instId, stuId, yearId, inv3, now(), now(), actorId, actorId,
          `le-disc-3-${pfx}`, instId, stuId, yearId, inv3, now(), now(), actorId, actorId,
          `le-schol-3-${pfx}`, instId, stuId, yearId, inv3, now(), now(), actorId, actorId,
        ],
      );
      // Late Fee adjustment: 50,000 paise (₹500)
      await dbRun(
        `INSERT INTO late_fee_runs(id, institution_id, installment_id, period, amount_paise, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, '2026-08-01', 50000, ?, ?, ?, ?)`,
        [`lfr-3-${pfx}`, instId, inst3, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO fee_adjustments(id, institution_id, student_id, academic_year_id, invoice_id, installment_id, kind, amount_paise, reason, approved_by, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, 'Late Fee', 50000, 'Automatic late fee accrued after due date', ?, ?, ?, ?, ?)`,
        [adj3, instId, stuId, yearId, inv3, inst3, actorId, now(), now(), actorId, actorId],
      );
      await dbRun(
        `INSERT INTO ledger_entries(id, institution_id, student_id, academic_year_id, invoice_id, adjustment_id, kind, description, debit_paise, credit_paise, entry_date, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, 'Late Fee', 'Automatic late fee accrued', 50000, 0, '2026-08-01', ?, ?, ?, ?)`,
        [`le-adj-3-${pfx}`, instId, stuId, yearId, inv3, adj3, now(), now(), actorId, actorId],
      );

      // Failed payment attempt
      const pay3 = `pay-fail-${pfx}`;
      await dbRun(
        `INSERT INTO payments(id, institution_id, student_id, academic_year_id, amount_paise, method, status, reference, idempotency_key, request_hash, paid_at, notes, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, 3050000, 'Card', 'Failed', ?, ?, 'seed', '2026-10-04T12:00:00.000Z', 'Payment declined by issuing bank: 3DS verification timeout', ?, ?, ?, ?)`,
        [pay3, instId, stuId, yearId, `CARD-REF-${pfx}-03`, `idem-pay3-${pfx}`, now(), now(), actorId, actorId],
      );
    }

    // B. DOCUMENTS IN ALL 4 CATEGORIES (VERIFIED / PENDING / REJECTED)
    const docs = [
      {
        id: `doc-pers-${pfx}`,
        title: "National Identity Aadhaar Card",
        cat: "Student",
        type: "Identity Proof",
        url: "https://campus.test/docs/aadhaar.pdf",
        name: "aadhaar_card.pdf",
        status: "Verified",
        notes: "Identity verified against official UIDAI database",
        by: actorId,
        at: "2026-06-10T10:00:00.000Z",
      },
      {
        id: `doc-adms-${pfx}`,
        title: "Previous School Transfer Certificate",
        cat: "Admission",
        type: "Transfer Certificate",
        url: "https://campus.test/docs/tc_school.pdf",
        name: "school_tc.pdf",
        status: "Verified",
        notes: "Verified and counter-signed by admissions authority",
        by: actorId,
        at: "2026-06-12T11:30:00.000Z",
      },
      {
        id: `doc-acad-${pfx}`,
        title: "Class 10 State Board Official Marksheet",
        cat: "Academic",
        type: "Marksheet",
        url: "https://campus.test/docs/marksheet_10.pdf",
        name: "class_10_marksheet.pdf",
        status: "Pending",
        notes: "Pending physical document verification at administrative desk",
        by: null,
        at: null,
      },
      {
        id: `doc-inst-${pfx}`,
        title: "Hostel Conduct & Clearance Certificate",
        cat: "Institutional",
        type: "Clearance Certificate",
        url: "https://campus.test/docs/hostel_conduct.pdf",
        name: "hostel_conduct.pdf",
        status: "Rejected",
        notes: "Warden stamp and official seal missing. Please re-upload signed copy.",
        by: actorId,
        at: "2026-09-01T15:00:00.000Z",
      },
    ];
    for (const d of docs) {
      await dbRun(
        `INSERT OR IGNORE INTO student_documents(id, institution_id, student_id, title, category, document_type, file_url, file_name, file_size_bytes, mime_type, verification_status, verification_notes, verified_by, verified_at, is_student_uploaded, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1048576, 'application/pdf', ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [d.id, instId, stuId, d.title, d.cat, d.type, d.url, d.name, d.status, d.notes, d.by, d.at, now(), now(), actorId, actorId],
      );
    }

    // C. CERTIFICATE REQUESTS (ONE ISSUED WITH NUMBER + VERIFICATION CODE, ONE PENDING)
    await dbRun(
      `INSERT OR IGNORE INTO student_certificate_requests(id, institution_id, student_id, certificate_type, reason, status, certificate_number, verification_code, qr_payload, pdf_url, approved_by, approved_at, issued_at, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, 'Bonafide Certificate', 'Passport application requirement', 'Issued', ?, ?, ?, 'https://campus.test/certs/bonafide.pdf', ?, '2026-09-10T10:00:00.000Z', '2026-09-10T12:00:00.000Z', ?, ?, ?, ?)`,
      [
        `cert-iss-${pfx}`, instId, stuId,
        `CERT-${pfx.toUpperCase()}-001`,
        `VER-${pfx.toUpperCase()}-789`,
        `https://campus.test/verify/CERT-${pfx.toUpperCase()}-001`,
        actorId, now(), now(), actorId, actorId,
      ],
    );
    await dbRun(
      `INSERT OR IGNORE INTO student_certificate_requests(id, institution_id, student_id, certificate_type, reason, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, 'Character Certificate', 'Summer internship background check', 'Pending', ?, ?, ?, ?)`,
      [`cert-pend-${pfx}`, instId, stuId, now(), now(), actorId, actorId],
    );

    // D. ANNOUNCEMENTS (INSTITUTE, DEPARTMENT, PROGRAM, CLASS, SECTION, STUDENT-GROUP; ONE EXPIRED; ONE WITH ATTACHMENT)
    const announcements = [
      {
        id: `ann-inst-${pfx}`,
        title: "Annual Campus Tech & Cultural Symposium 2026",
        content: "We are thrilled to announce the dates for the Annual Inter-Collegiate Symposium.",
        scope: "Institute",
        dept: null, prog: null, cls: null, sec: null, grp: "",
        att: JSON.stringify([{ name: "symposium_schedule.pdf", url: "https://campus.test/docs/symposium.pdf", size: 524288 }]),
        exp: null,
      },
      {
        id: `ann-dept-${pfx}`,
        title: "Department of Computer Science: Guest Lecture Series",
        content: "Join us this Friday for a special session on AI systems and modern microservices.",
        scope: "Department",
        dept: s.deptId, prog: null, cls: null, sec: null, grp: "",
        att: "[]",
        exp: null,
      },
      {
        id: `ann-prog-${pfx}`,
        title: "B.Tech Curriculum Advisory: Elective Registration Window",
        content: "Open elective selection for next semester starts on the portal next week.",
        scope: "Program",
        dept: null, prog: s.progId, cls: null, sec: null, grp: "",
        att: "[]",
        exp: null,
      },
      {
        id: `ann-cls-${pfx}`,
        title: "Class Practical Examination Guidelines",
        content: "Detailed lab experiment evaluation rubric and schedule for Class 10.",
        scope: "Class",
        dept: null, prog: null, cls: s.classId, sec: null, grp: "",
        att: "[]",
        exp: null,
      },
      {
        id: `ann-sec-${pfx}`,
        title: "Section Project Mentor Allotment",
        content: "Project team review timings and mentor allocations for Section A.",
        scope: "Section",
        dept: null, prog: null, cls: null, sec: s.sectionId, grp: "",
        att: "[]",
        exp: null,
      },
      {
        id: `ann-grp-${pfx}`,
        title: "Robotics Club Early Registration (Expired)",
        content: "Early bird access to intra-college robotics design workshops.",
        scope: "StudentGroup",
        dept: null, prog: null, cls: null, sec: null, grp: "Robotics Club",
        att: "[]",
        exp: "2026-08-31T23:59:59.000Z", // EXPIRED
      },
    ];
    for (const an of announcements) {
      await dbRun(
        `INSERT OR IGNORE INTO campus_announcements(id, institution_id, title, content, category, priority, target_scope, department_id, program_id, class_id, section_id, student_group, attachments, is_pinned, published_at, expires_at, author_name, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, 'General', 'Normal', ?, ?, ?, ?, ?, ?, ?, 0, '2026-10-01T08:00:00.000Z', ?, 'Academic Dean Office', ?, ?, ?, ?)`,
        [an.id, instId, an.title, an.content, an.scope, an.dept, an.prog, an.cls, an.sec, an.grp, an.att, an.exp, now(), now(), actorId, actorId],
      );
    }
    // Read record for announcement
    await dbRun(
      `INSERT OR IGNORE INTO student_announcement_reads(id, institution_id, announcement_id, student_id, read_at)
       VALUES (?, ?, ?, ?, '2026-10-02T10:00:00.000Z')`,
      [`ann-rd-1-${pfx}`, instId, `ann-inst-${pfx}`, stuId],
    );

    // E. NOTIFICATIONS OF ALL 10 TYPES (READ + UNREAD)
    const notifTypes = [
      { type: "Assignment", title: "Assignment Graded", msg: "Your AVL Tree submission was graded: 94/100" },
      { type: "Quiz", title: "Quiz Published", msg: "Linear Data Structures Quiz is active until Friday" },
      { type: "Exam", title: "Mid-Term Examination Schedule", msg: "Exam timetable published by controller of exams" },
      { type: "Result", title: "Semester Results Available", msg: "Official grade card published on student portal" },
      { type: "Attendance", title: "Attendance Warning / Update", msg: "Current attendance standing is 88%" },
      { type: "Fee", title: "Fee Due Reminder", msg: "Term fee installment is upcoming on schedule" },
      { type: "Admission/document", title: "Document Verified", msg: "Transfer certificate has been verified" },
      { type: "Event", title: "Sports Tournament Announcement", msg: "Annual sports meet registrations now open" },
      { type: "LMS", title: "New Lesson Content", msg: "Lesson 3: Binary Search Tree operations available" },
      { type: "System", title: "Scheduled Maintenance Alert", msg: "Portal maintenance scheduled on Sunday at 2 AM" },
    ];
    for (const nt of notifTypes) {
      // 1 Unread
      await dbRun(
        `INSERT OR IGNORE INTO student_portal_notifications(id, institution_id, student_id, type, title, message, action_url, is_read, read_at, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, '/portal/alerts', 0, NULL, ?, ?, ?, ?)`,
        [`notif-u-${nt.type.toLowerCase().replace(/[^a-z0-9]/g, "")}-${pfx}`, instId, stuId, nt.type, nt.title, nt.msg, now(), now(), actorId, actorId],
      );
      // 1 Read
      await dbRun(
        `INSERT OR IGNORE INTO student_portal_notifications(id, institution_id, student_id, type, title, message, action_url, is_read, read_at, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, '/portal/alerts', 1, '2026-10-06T12:00:00.000Z', ?, ?, ?, ?)`,
        [`notif-r-${nt.type.toLowerCase().replace(/[^a-z0-9]/g, "")}-${pfx}`, instId, stuId, nt.type, `[Read] ${nt.title}`, nt.msg, now(), now(), actorId, actorId],
      );
    }

    // F. CONVERSATIONS WITH MESSAGES (FACULTY, SUPPORT, HELPDESK)
    const convos = [
      {
        id: `conv-fac-${pfx}`,
        type: "Faculty",
        partId: `fac-advisor-${pfx}`,
        partName: "Prof. Sunita Sharma",
        role: "Faculty Advisor",
        sub: "Data Structures & Algorithms Course Clarification",
        msg1: "Good morning Professor, could you please clarify problem 3 in the assignment?",
        msg2: "Hello! Check the sample testbench in lecture 2 notes. Self-balancing rotations are required.",
        hasAtt: true,
      },
      {
        id: `conv-sup-${pfx}`,
        type: "Support",
        partId: `sup-finance-${pfx}`,
        partName: "Campus Accounts & Finance Support",
        role: "Finance Officer",
        sub: "Fee Receipt Verification Inquiry",
        msg1: "Hi, I have paid the Term 1 fee online. When will the official tax receipt be visible?",
        msg2: "Hello! Payment has cleared and your receipt is now downloadable under the Receipts tab.",
        hasAtt: false,
      },
      {
        id: `conv-hpd-${pfx}`,
        type: "Helpdesk",
        partId: `hpd-it-${pfx}`,
        partName: "Campus IT & Network Helpdesk",
        role: "Network Engineer",
        sub: "Hostel Wi-Fi MAC Address Whitelisting",
        msg1: "Please whitelist my laptop MAC address for the hostel wireless network.",
        msg2: "Your MAC address has been registered. Please reconnect to CampusNet with your credentials.",
        hasAtt: false,
      },
    ];
    for (const c of convos) {
      await dbRun(
        `INSERT OR IGNORE INTO student_conversations(id, institution_id, student_id, participant_type, participant_id, participant_name, participant_role, subject, last_message_at, last_message_preview, unread_count_student, unread_count_participant, status, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-06T14:30:00.000Z', ?, 0, 0, 'Active', ?, ?, ?, ?)`,
        [c.id, instId, stuId, c.type, c.partId, c.partName, c.role, c.sub, c.msg2.slice(0, 50), now(), now(), actorId, actorId],
      );
      // Student message
      await dbRun(
        `INSERT OR IGNORE INTO student_messages(id, institution_id, conversation_id, sender_type, sender_id, sender_name, content, attachments, read_at, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, 'Student', ?, ?, ?, '[]', '2026-10-06T14:10:00.000Z', '2026-10-06T14:00:00.000Z', '2026-10-06T14:00:00.000Z', ?, ?)`,
        [`msg-1-${c.id}`, instId, c.id, stuId, s.name, c.msg1, actorId, actorId],
      );
      // Participant reply
      const attJson = c.hasAtt
        ? JSON.stringify([{ name: "avl_sample.pdf", url: "https://campus.test/docs/avl_sample.pdf" }])
        : "[]";
      await dbRun(
        `INSERT OR IGNORE INTO student_messages(id, institution_id, conversation_id, sender_type, sender_id, sender_name, content, attachments, read_at, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-06T15:00:00.000Z', '2026-10-06T14:30:00.000Z', '2026-10-06T14:30:00.000Z', ?, ?)`,
        [`msg-2-${c.id}`, instId, c.id, c.type, c.partId, c.partName, c.msg2, attJson, actorId, actorId],
      );
    }

    // G. EVENTS (ACADEMIC, WORKSHOP, SEMINAR, SPORTS, PARENT_MEETING, HOLIDAY, INSTITUTE; ONE WITH REGISTRATION AND ATTENDANCE)
    const events = [
      { id: `evt-acad-${pfx}`, title: "Annual Science & Tech Project Exhibition", cat: "Academic", loc: "Seminar Hall A", date: "2026-11-10" },
      { id: `evt-work-${pfx}`, title: "Full-Stack Development with TypeScript Workshop", cat: "Workshop", loc: "Computer Lab 3", date: "2026-10-02" },
      { id: `evt-semi-${pfx}`, title: "National Academic Seminar on Quantum AI", cat: "Seminar", loc: "Main Auditorium", date: "2026-11-20" },
      { id: `evt-spor-${pfx}`, title: "Inter-House Football Championship 2026", cat: "Sports", loc: "Campus Stadium", date: "2026-11-25" },
      { id: `evt-parm-${pfx}`, title: "Semester 1 Parent-Faculty Academic Consultation", cat: "Parent_Meeting", loc: "Administrative Hall", date: "2026-11-05" },
      { id: `evt-holi-${pfx}`, title: "Diwali Festivities & Institutional Recess", cat: "Holiday", loc: "Campus-wide", date: "2026-11-08" },
      { id: `evt-inst-${pfx}`, title: "Annual Foundation Day Honors Ceremony", cat: "Institute", loc: "Open Air Amphitheatre", date: "2026-12-01" },
    ];
    for (const ev of events) {
      await dbRun(
        `INSERT OR IGNORE INTO campus_events(id, institution_id, title, description, category, location, start_date, end_date, is_all_day, target_scope, max_participants, registration_deadline, status, image_url, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, 'Official campus event for student participation', ?, ?, ?, ?, 0, 'All', 200, '2026-10-31', 'Upcoming', '', ?, ?, ?, ?)`,
        [ev.id, instId, ev.title, ev.cat, ev.loc, `${ev.date}T09:00:00.000Z`, `${ev.date}T17:00:00.000Z`, now(), now(), actorId, actorId],
      );
    }
    // Event Registration WITH Attendance (attended workshop)
    await dbRun(
      `INSERT OR IGNORE INTO student_event_registrations(id, institution_id, event_id, student_id, status, registered_at, attendance_status, attended_at, reminder_enabled, reminder_minutes_before, notes, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'Registered', '2026-09-20T10:00:00.000Z', 'Attended', '2026-10-02T09:15:00.000Z', 1, 60, 'Completed full workshop and capstone evaluation', ?, ?, ?, ?)`,
      [`evreg-work-${pfx}`, instId, `evt-work-${pfx}`, stuId, now(), now(), actorId, actorId],
    );
    // Upcoming event registration
    await dbRun(
      `INSERT OR IGNORE INTO student_event_registrations(id, institution_id, event_id, student_id, status, registered_at, attendance_status, attended_at, reminder_enabled, reminder_minutes_before, notes, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'Registered', '2026-10-01T15:00:00.000Z', 'Pending', NULL, 1, 60, 'Enrolled for seat reservation', ?, ?, ?, ?)`,
      [`evreg-semi-${pfx}`, instId, `evt-semi-${pfx}`, stuId, now(), now(), actorId, actorId],
    );

    // H. TICKETS IN EVERY STATUS WITH REPLIES AND STATUS HISTORY
    // Statuses: Open, In Progress, Waiting for Student, Resolved, Closed
    const tickets = [
      {
        id: `tkt-open-${pfx}`,
        num: `TKT-${pfx.toUpperCase()}-01`,
        cat: "Academic",
        sub: "Engineering Physics Marks Mismatch",
        desc: "My continuous assessment score shows 14 instead of 19.",
        pri: "High",
        status: "Open",
        assignedTo: null,
        assignedName: "",
        hist: [{ old: "New", new: "Open", reason: "Ticket logged by student" }],
        replies: [{ sender: "Student", msg: "Please verify marks from physical answer sheet." }],
      },
      {
        id: `tkt-prog-${pfx}`,
        num: `TKT-${pfx.toUpperCase()}-02`,
        cat: "Hostel",
        sub: "Electrical Socket Repair in Room 204",
        desc: "Study table socket sparking when connecting charger.",
        pri: "Medium",
        status: "In Progress",
        assignedTo: actorId,
        assignedName: "Hostel Maintenance Desk",
        hist: [
          { old: "Open", new: "Assigned", reason: "Assigned to hostel electrician" },
          { old: "Assigned", new: "In Progress", reason: "Electrician inspection ongoing" },
        ],
        replies: [
          { sender: "Student", msg: "Please send electrician during evening study hours." },
          { sender: "Staff", msg: "Electrician assigned and visiting between 4 PM and 5 PM today." },
        ],
      },
      {
        id: `tkt-wait-${pfx}`,
        num: `TKT-${pfx.toUpperCase()}-03`,
        cat: "Library",
        sub: "Return Deposit Fine Dispute",
        desc: "Introduction to Algorithms returned on time but overdue fine charged.",
        pri: "Low",
        status: "Waiting for Student",
        assignedTo: actorId,
        assignedName: "Chief Circulation Librarian",
        hist: [
          { old: "Open", new: "In Progress", reason: "Under staff review" },
          { old: "In Progress", new: "Waiting for Student", reason: "Requested deposit slip copy" },
        ],
        replies: [
          { sender: "Student", msg: "I dropped the book into the circulation slot on Friday." },
          { sender: "Staff", msg: "Please upload photo of the circulation receipt slip for waiver." },
        ],
      },
      {
        id: `tkt-res-${pfx}`,
        num: `TKT-${pfx.toUpperCase()}-04`,
        cat: "Finance",
        sub: "Online Payment Double Deduction Reconciliation",
        desc: "Bank debited twice for online transaction ref DEMO-1001.",
        pri: "Urgent",
        status: "Resolved",
        assignedTo: actorId,
        assignedName: "Accounts Officer",
        resAt: "2026-09-15T16:00:00.000Z",
        resNotes: "Duplicate charge reversed to original payment method with ARN 891230",
        hist: [
          { old: "Open", new: "In Progress", reason: "Reconciliation initiated with payment gateway" },
          { old: "In Progress", new: "Resolved", reason: "Reconciliation complete and refund processed" },
        ],
        replies: [
          { sender: "Student", msg: "Kindly verify duplicate bank statement deduction." },
          { sender: "Staff", msg: "Settlement reconciled and duplicate refund processed." },
        ],
      },
      {
        id: `tkt-cls-${pfx}`,
        num: `TKT-${pfx.toUpperCase()}-05`,
        cat: "Transport",
        sub: "Bus Route 12 Timing Adjustment",
        desc: "Requesting bus pickup shift by 10 minutes at stop 4.",
        pri: "Low",
        status: "Closed",
        assignedTo: actorId,
        assignedName: "Transport Manager",
        resAt: "2026-08-20T11:00:00.000Z",
        closedAt: "2026-08-22T10:00:00.000Z",
        resNotes: "Pickup timings revised and circular published to parents",
        hist: [
          { old: "Open", new: "In Progress", reason: "Reviewing route traffic timing" },
          { old: "In Progress", new: "Resolved", reason: "New schedule implemented" },
          { old: "Resolved", new: "Closed", reason: "Confirmed satisfactory by passengers" },
        ],
        replies: [
          { sender: "Student", msg: "Bus arrived before scheduled time." },
          { sender: "Staff", msg: "Timings have been synchronized with GPS logs." },
          { sender: "Student", msg: "Thank you, timings are optimal now." },
        ],
      },
    ];
    for (const tk of tickets) {
      await dbRun(
        `INSERT OR IGNORE INTO student_tickets(id, institution_id, student_id, ticket_number, category, subject, description, priority, status, assigned_to, assigned_to_name, resolved_at, resolution_notes, closed_at, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tk.id, instId, stuId, tk.num, tk.cat, tk.sub, tk.desc, tk.pri, tk.status,
          tk.assignedTo || null, tk.assignedName, tk.resAt || null, tk.resNotes || "", tk.closedAt || null,
          now(), now(), actorId, actorId,
        ],
      );
      // Status history
      for (let hIdx = 0; hIdx < tk.hist.length; hIdx++) {
        const h = tk.hist[hIdx];
        await dbRun(
          `INSERT OR IGNORE INTO student_ticket_status_history(id, institution_id, ticket_id, old_status, new_status, changed_by, changed_by_name, change_reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'Support Agent', ?, ?)`,
          [`tkh-${tk.id}-${hIdx}`, instId, tk.id, h.old, h.new, actorId, h.reason, now()],
        );
      }
      // Messages / replies
      for (let rIdx = 0; rIdx < tk.replies.length; rIdx++) {
        const rep = tk.replies[rIdx];
        const isStu = rep.sender === "Student";
        await dbRun(
          `INSERT OR IGNORE INTO student_ticket_messages(id, institution_id, ticket_id, sender_type, sender_id, sender_name, message, attachments, created_at, updated_at, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?)`,
          [
            `tkm-${tk.id}-${rIdx}`, instId, tk.id,
            isStu ? "Student" : "Staff",
            isStu ? stuId : actorId,
            isStu ? s.name : "Support Officer",
            rep.msg, now(), now(), actorId, actorId,
          ],
        );
      }
    }

    // I. FEEDBACK (COURSE, FACULTY, EVENT, ASSIGNMENT, SUPPORT)
    const feedbacks = [
      { id: `fb-crs-${pfx}`, type: "Course", target: "CS101: Data Structures", rating: 5, anon: 0, title: "Comprehensive Course Content", comments: "Exceptional coding challenges and balanced theoretical explanations." },
      { id: `fb-fac-${pfx}`, type: "Faculty", target: "Prof. Sunita Sharma", rating: 5, anon: 1, title: "Supportive Faculty Guidance", comments: "Always ready to assist students with algorithmic problem solving." },
      { id: `fb-evt-${pfx}`, type: "Event", target: "Annual Campus Hackathon", rating: 4, anon: 0, title: "Great Coding Event", comments: "Well coordinated mentorship and interesting problem statements." },
      { id: `fb-asg-${pfx}`, type: "Assignment", target: "Assignment 1: Balanced BST", rating: 4, anon: 0, title: "Challenging Implementation", comments: "Unit test suite made local verification very smooth." },
      { id: `fb-sup-${pfx}`, type: "Support", target: "Campus IT & Network Helpdesk", rating: 5, anon: 1, title: "Prompt Wi-Fi Whitelisting", comments: "Device MAC address whitelisted within two hours of ticket." },
    ];
    for (const fb of feedbacks) {
      await dbRun(
        `INSERT OR IGNORE INTO student_feedback_submissions(id, institution_id, student_id, feedback_type, target_name, rating, title, comments, is_anonymous, status, response_notes, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', 'Thank you for your valuable feedback', ?, ?, ?, ?)`,
        [fb.id, instId, stuId, fb.type, fb.target, fb.rating, fb.title, fb.comments, fb.anon, now(), now(), actorId, actorId],
      );
    }

    // J. PERSONAL DEADLINES
    const deadlines = [
      { id: `dl-term-${pfx}`, title: "Complete CS101 Term Paper on Graph Algorithms", due: "2026-11-15", cat: "Academic", pri: "High", comp: 0, compAt: null },
      { id: `dl-mess-${pfx}`, title: "Renew Hostel Accommodation & Mess Subscription", due: "2026-11-20", cat: "Administrative", pri: "Medium", comp: 0, compAt: null },
      { id: `dl-pass-${pfx}`, title: "Submit Bonafide Certificate Copy for Passport Verification", due: "2026-10-10", cat: "Personal", pri: "High", comp: 1, compAt: "2026-10-09T14:00:00.000Z" },
    ];
    for (const dl of deadlines) {
      await dbRun(
        `INSERT OR IGNORE INTO student_personal_deadlines(id, institution_id, student_id, title, description, due_date, category, priority, is_completed, completed_at, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [dl.id, instId, stuId, dl.title, dl.due, dl.cat, dl.pri, dl.comp, dl.compAt, now(), now(), actorId, actorId],
      );
    }

    // K. SETTINGS
    await dbRun(
      `INSERT INTO student_portal_settings(id, institution_id, student_id, theme, language, email_notifications, sms_notifications, push_notifications, fee_alerts, exam_alerts, assignment_alerts, event_alerts, compact_view, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, 'system', 'en', 1, 0, 1, 1, 1, 1, 1, 0, ?, ?, ?, ?)
       ON CONFLICT(institution_id, student_id) DO UPDATE SET theme=excluded.theme, language=excluded.language`,
      [`set-${pfx}`, instId, stuId, now(), now(), actorId, actorId],
    );

    // L. STUDENT ATTENDANCE (10 sessions: 9 Present, 1 Late -> 90%)
    for (let day = 1; day <= 10; day++) {
      const dStr = `2026-09-${String(day + 10).padStart(2, "0")}`;
      const attStatus = day === 5 ? "Late" : "Present";
      await dbRun(
        `INSERT OR IGNORE INTO student_attendance(id, institution_id, academic_year_id, class_id, section_id, student_id, date, period_number, status, remarks, recorded_by, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'Regular lecture session', ?, ?, ?, ?, ?)`,
        [`att-${day}-${pfx}`, instId, yearId, s.classId, s.sectionId, stuId, dStr, attStatus, actorId, now(), now(), actorId, actorId],
      );
    }

    // M. STUDENT EXAMS (Mid-Term examination records)
    await dbRun(
      `INSERT OR IGNORE INTO student_exams(id, institution_id, student_id, academic_year_id, exam_name, subject, marks_obtained, max_marks, grade, remarks, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'Mid-Term Examination 2026', 'Data Structures & Algorithms', 88, 100, 'A', 'Strong analytical performance', ?, ?, ?, ?),
              (?, ?, ?, ?, 'Mid-Term Examination 2026', 'Discrete Mathematics', 92, 100, 'A+', 'Outstanding problem solving', ?, ?, ?, ?)`,
      [
        `exam-1-${pfx}`, instId, stuId, yearId, now(), now(), actorId, actorId,
        `exam-2-${pfx}`, instId, stuId, yearId, now(), now(), actorId, actorId,
      ],
    );

    // N. STUDENT LMS COURSES & ENROLLMENTS & ASSIGNMENTS & QUIZZES
    await dbRun(
      `INSERT OR IGNORE INTO student_lms_courses(id, institution_id, student_id, course_name, instructor, progress_percent, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, 'Data Structures & Modern Algorithms', 'Prof. Sunita Sharma', 75, 'Enrolled', ?, ?, ?, ?)`,
      [`lms-crs-${pfx}`, instId, stuId, now(), now(), actorId, actorId],
    );

    const lmsCourseId = `lms-c-cs101-${instId.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO lms_courses(id, institution_id, department_id, class_id, section_id, faculty_name, code, title, description, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'Prof. Sunita Sharma', 'CS101', 'Data Structures & Algorithms', 'Foundations of computation and algorithmic efficiency', 'Published', ?, ?, ?, ?)`,
      [lmsCourseId, instId, s.deptId, s.classId, s.sectionId, now(), now(), actorId, actorId],
    );
    await dbRun(
      `INSERT OR IGNORE INTO lms_enrollments(id, institution_id, course_id, student_id, enrolled_date, progress_percent, completed_lessons, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, '2026-06-15', 75, '["les-1","les-2","les-3"]', 'Active', ?, ?, ?, ?)`,
      [`lms-enr-${pfx}`, instId, lmsCourseId, stuId, now(), now(), actorId, actorId],
    );
    const asgId = `lms-asg-1-${instId.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO lms_assignments(id, institution_id, course_id, class_id, section_id, title, instructions, max_marks, due_date, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'Assignment 1: Balanced BST', 'Implement AVL rotations and balance invariant checks', 100, '2026-11-15T23:59:59.000Z', 'Published', ?, ?, ?, ?)`,
      [asgId, instId, lmsCourseId, s.classId, s.sectionId, now(), now(), actorId, actorId],
    );
    await dbRun(
      `INSERT OR IGNORE INTO lms_submissions(id, institution_id, assignment_id, student_id, student_name, content, submitted_at, status, marks_obtained, feedback, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'AVL tree completed with all rotation test cases passing.', '2026-10-05T14:00:00.000Z', 'Graded', 94, 'Excellent test case coverage and clean implementation.', ?, ?, ?, ?)`,
      [`lms-sub-${pfx}`, instId, asgId, stuId, s.name, now(), now(), actorId, actorId],
    );
    const quizId = `lms-quiz-1-${instId.slice(0, 8)}`;
    await dbRun(
      `INSERT OR IGNORE INTO lms_quizzes(id, institution_id, course_id, title, description, time_limit_minutes, total_marks, passing_marks, due_date, status, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, 'Linear Data Structures Quiz', 'Covers stacks, queues, and doubly-linked lists', 30, 30, 15, '2026-11-20T23:59:59.000Z', 'Published', ?, ?, ?, ?)`,
      [quizId, instId, lmsCourseId, now(), now(), actorId, actorId],
    );
    await dbRun(
      `INSERT OR IGNORE INTO lms_quiz_attempts(id, institution_id, quiz_id, student_id, student_name, answers, score, max_score, percentage, passed, time_spent_seconds, completed_at, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, '{}', 28, 30, 93, 1, 920, '2026-10-04T16:00:00.000Z', ?, ?, ?, ?)`,
      [`lms-qatt-${pfx}`, instId, quizId, stuId, s.name, now(), now(), actorId, actorId],
    );

    // O. HOLIDAYS
    await dbRun(
      `INSERT OR IGNORE INTO holidays(id, institution_id, academic_year_id, campus_id, title, date, end_date, type, description, created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'Diwali Institutional Recess', '2026-11-08', '2026-11-10', 'Institutional', 'Festival holidays and campus recess', ?, ?, ?, ?)`,
      [`hol-diwali-${instId.slice(0, 8)}`, instId, yearId, s.classId, now(), now(), actorId, actorId],
    );
  }
}

export const seedStudentPortalPart2 = ensureStudentPortalPart2Demonstration;



