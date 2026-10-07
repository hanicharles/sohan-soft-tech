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


