# Member 1 — Sumit Kumar: Core Admin, Authentication, Admissions & Student Management

## 1. Executive Summary & Architecture Overview

This module provides end-to-end administration, authentication, admissions pipeline, student lifecycle, and portal foundation for **Sohan Soft Tech Campus ERP**. 

Every feature is implemented end-to-end following the platform architecture:
- **UI:** React 19 / TypeScript, responsive styling, accessible Radix / Base UI dialogs, zero decorative or static-only controls.
- **Client Networking:** Unified API client (`/lib/api-client.ts`) and context-aware resource hooks (`/components/campus/context.tsx`).
- **Backend / Routing:** Multi-tenant HTTP route handlers with D1 / SQLite persistence, Zod payload validation, and role-based access control (RBAC).
- **Security & Authorization:** 8 distinct roles, permission ceilings, account lockout (5 attempts -> 15 min lock / 423 Locked), secure password hashing (PBKDF2-SHA256 with 100,000 iterations), single-use time-limited reset tokens, and audit logging.
- **Portals:** Parent portal (multi-child tracking, fee summaries) and Student portal (attendance rates, courses, exams, profile).

---

## 2. Authentication & Account Security

### 2.1 Login & Role-Based Redirection
- **Endpoint:** `POST /api/auth/login`
- **Identifier:** Email or username.
- **Supported Roles & Default Landing Pages:**
  - `SUPER_ADMIN` → `/admin`
  - `INSTITUTION_ADMIN`, `ADMIN` → `/campus/:slug/`
  - `PRINCIPAL` → `/campus/:slug/`
  - `FACULTY`, `TEACHER` → `/campus/:slug/academics`
  - `ACCOUNTANT` → `/campus/:slug/fees`
  - `STAFF`, `RECEPTIONIST` → `/campus/:slug/admissions`
  - `PARENT` → `/campus/:slug/parent-portal`
  - `STUDENT` → `/campus/:slug/student-portal`

### 2.2 Failed Login Protection & Account Lockout
- **Lockout Policy:** 5 consecutive failed login attempts trigger an immediate 15-minute lock (`HTTP 423 Locked`).
- **Remaining Attempts:** Returned in error payload on `HTTP 401 Unauthorized` (`attemptsRemaining`).
- **Resolution:** Successful login resets failed attempts count and timestamp to 0.

### 2.3 Session Management
- **Local Session Cookie:** `campusledger_local_session` with `HttpOnly`, `Path=/`, and `SameSite=Lax`.
- **Session Expiration:** Standard 7-day TTL with proactive expiration check.
- **Logout:** `POST /api/auth/logout` terminates the session and deletes the cookie.

### 2.4 Password Reset & Recovery
- **Forgot Password:** `POST /api/auth/forgot-password` generates a cryptographically random, single-use reset token valid for 60 minutes.
- **Reset Password:** `POST /api/auth/reset-password` validates token expiry, updates hashed password credentials, and marks the token consumed. Reused tokens are rejected (`400 INVALID_TOKEN`).
- **Change Password:** `POST /api/auth/change-password` requires the user's current password before updating to the new password.
- **Admin Password Reset:** `POST /api/campus/:slug/users/:id/reset-password` allows institution administrators to directly reset any staff member's password with instant effect.

### 2.5 Login Audit History
- Every sign-in attempt (successful or failed) is recorded in `login_history` with:
  - Timestamp (`created_at`)
  - IP Address (`ip_address`)
  - User-Agent (`user_agent`)
  - Status (`SUCCESS` or `FAILED`)
  - Failure reason (if applicable)

---

## 3. User Management & RBAC

### 3.1 Role Hierarchy & Permissions
The system enforces 8 standard roles with normalized permission boundaries:
| Role | Primary Purpose | Key Permissions |
| :--- | :--- | :--- |
| **Super Admin** | Platform-level management, tenants, plans | Full platform scope |
| **Institution Admin / Admin** | Complete campus operational oversight | Full campus permissions (`*.*`) |
| **Principal** | Academic leadership and institution supervision | `students.*`, `admissions.*`, `academics.*`, `reports.view`, `settings.view` |
| **Faculty** | Class instruction and student assessment | `students.view`, `academics.*`, `attendance.*` |
| **Accountant** | Fee management, invoicing, collection | `fees.*`, `payments.*`, `receipts.*`, `cash.*`, `refunds.*` |
| **Staff** | Admissions office, front desk, record keeping | `admissions.*`, `students.*`, `calendar.*` |
| **Parent** | Guardian oversight across enrolled wards | `parent-portal.*`, `fees.view`, `students.view` (scoped to linked children) |
| **Student** | Student self-service and academic tracking | `student-portal.*` (scoped to self) |

### 3.2 User Operations
- **User CRUD:** `GET /api/campus/:slug/users`, `POST /api/campus/:slug/users`, `PATCH /api/campus/:slug/users/:id`.
- **Search, Filter & Pagination:** Users can be searched by name/email, filtered by role and active status, and paginated.
- **Enable / Disable Toggle:** `PATCH /api/campus/:slug/users/:id` toggles active flag. Inactive users are instantly rejected on API requests.

---

## 4. Institute & Branch Management

### 4.1 Multi-Campus Branches
- **Endpoints:**
  - `GET /api/campus/:slug/campuses` — Lists all campus locations.
  - `POST /api/campus/:slug/campuses` — Creates branch with name, code, address, city, state, pincode, phone, email, and principal name.
  - `PATCH /api/campus/:slug/campuses/:id` — Updates branch details or toggles `Active`/`Inactive` status.
  - `DELETE /api/campus/:slug/campuses/:id` — Removes branch.

### 4.2 Academic Calendar & Holidays
- **Endpoints:**
  - `GET /api/campus/:slug/calendar/holidays` — Lists institution holidays.
  - `POST /api/campus/:slug/calendar/holidays` — Adds holiday (`name`, `holidayDate`, `endDate`, `holidayType`, `description`).
  - `DELETE /api/campus/:slug/calendar/holidays/:id` — Removes holiday from calendar.

### 4.3 Working Days & Shift Timings
- **Endpoints:**
  - `GET /api/campus/:slug/calendar/working-days` — Retrieves weekly 7-day schedule.
  - `PUT /api/campus/:slug/calendar/working-days` — Configures schedule with:
    - Day of week (0 = Sunday to 6 = Saturday)
    - Working day flag (`isWorkingDay`)
    - Half-day flag (`isHalfDay`)
    - Shift timings (`shiftStartTime`, `shiftEndTime`)

---

## 5. Admissions Pipeline

The admissions pipeline transitions prospective candidates from initial inquiry to enrolled students:

```
[Enquiry] ➔ [Application] ➔ [Doc Verification] ➔ [Interview & Scoring] ➔ [Selection] ➔ [1-Click Enrollment]
                                                                                                │
                                                                         ┌──────────────────────┴──────────────────────┐
                                                                         ▼                                             ▼
                                                                  [Active Student]                              [Parent Profile]
                                                                (ID: ADM-YYYY-XXXX)                        (Auto-linked to Child)
```

### 5.1 Enquiries
- **Endpoint:** `GET / POST /api/campus/:slug/admissions/enquiries`
- **Fields:** `studentName`, `parentName`, `mobile`, `email`, `applyingForGrade`, `source`, `notes`.
- **Status Workflow:** `Open` ➔ `Contacted` ➔ `Converted` ➔ `Closed`.

### 5.2 Applications
- **Endpoint:** `GET / POST /api/campus/:slug/admissions/applications`
- **Auto-Generated ID:** Formatted as `APP-YYYY-XXXX` (e.g., `APP-2026-0001`).
- **Comprehensive Fields:**
  - Student: First/last name, DOB, gender, blood group, applying grade.
  - Parent: Guardian name, email, mobile, occupation, address, city, state, pincode.
  - Prior Education: Previous school, previous board, percentage.
- **Application Statuses:** `Submitted` ➔ `Under Review` ➔ `Interview Scheduled` ➔ `Selected` / `Rejected` ➔ `Enrolled`.

### 5.3 Document Upload & Officer Verification
- **Upload Document:** `POST /api/campus/:slug/admissions/applications/:id/documents`
  - Stores document name, category (Birth Certificate, Transfer Certificate, Marksheet, Photo), and file URL.
  - Default status: `Pending`.
- **Verification:** `PATCH /api/campus/:slug/admissions/documents/:id/verify`
  - Admissions officer marks status as `Verified` or `Rejected` with verification notes.

### 5.4 Interview & Entrance Evaluation
- **Endpoint:** `POST /api/campus/:slug/admissions/applications/:id/interview`
- **Parameters:** `scheduledDate`, `interviewMode` (In-Person / Online), `interviewerName`, `score` (0-100), `notes`, `status` (`Scheduled` / `Completed` / `Passed` / `Failed`).

### 5.5 Selection & Confirmation
- `PATCH /api/campus/:slug/admissions/applications/:id/status` updates status to `Selected` or `Confirmed`.

### 5.6 One-Click Enrollment
- **Endpoint:** `POST /api/campus/:slug/admissions/applications/:id/enroll`
- **Actions executed in a single atomic database transaction:**
  1. Generates permanent Student Admission Number `ADM-YYYY-XXXX`.
  2. Creates row in `students` with personal and academic details.
  3. Creates or links row in `parents` with guardian details.
  4. Creates relationship in `student_parents`.
  5. Inserts academic enrollment record in `enrollments`.
  6. Updates application status to `Enrolled` and saves `enrolled_student_id`.
  7. Records creation in `student_history` audit timeline.

---

## 6. Student Lifecycle & Academic Management

### 6.1 Emergency Contacts
- **Endpoints:**
  - `GET /api/campus/:slug/students/:id/emergency-contacts`
  - `POST /api/campus/:slug/students/:id/emergency-contacts`
  - `DELETE /api/campus/:slug/students/:id/emergency-contacts/:contactId`
- **Fields:** Contact name, relationship (Uncle, Aunt, Grandparent, etc.), primary phone, alternate phone, address, `isPrimary` flag.

### 6.2 Exam Assessments & Marks
- **Endpoints:**
  - `GET /api/campus/:slug/students/:id/exams`
  - `POST /api/campus/:slug/students/:id/exams`
- **Fields:** `examName`, `term`, `subject`, `maxMarks`, `marksObtained`, `grade`, `remarks`.

### 6.3 LMS Course Enrollments
- **Endpoints:**
  - `GET /api/campus/:slug/students/:id/courses`
  - `POST /api/campus/:slug/students/:id/courses`
- **Fields:** `courseCode`, `courseName`, `instructor` / `teacherName`.

### 6.4 Transfer Certificate (TC) Issuance
- **Endpoint:** `POST /api/campus/:slug/students/:id/transfer`
- **Auto-Generated TC Number:** `TC-YYYY-XXXX` (e.g., `TC-2026-0001`).
- **Fields:** `destinationSchool`, `reason`, `transferDate`, `conductRating`, `remarks`.
- **Status Update:** Automatically transitions student status to `Transferred`.

### 6.5 Archive & Restore
- **Archive:** `POST /api/campus/:slug/students/:id/archive` — Sets status to `Archived` with audit reason.
- **Restore:** `POST /api/campus/:slug/students/:id/restore` — Restores student to `Active` status.

### 6.6 Audit History Timeline
- **Endpoint:** `GET /api/campus/:slug/students/:id/history`
- Logs all major lifecycle events: Enrollment, status changes, TC issuance, academic updates, and archival.

---

## 7. Parent & Student Portal Foundations

### 7.1 Parent Portal
- **Summary Endpoint:** `GET /api/campus/:slug/parent-portal/summary`
- **Features:**
  - Scoped strictly to authenticated guardian email.
  - Multi-child linking: Returns all active children linked to the guardian.
  - Comprehensive fee overview: Total demand, total paid, and net outstanding balance across children.
  - Child details: Current grade, section, roll number, and academic status.
- **Link Child Endpoint:** `POST /api/campus/:slug/parent-portal/link-child` (links child by Admission Number and Date of Birth).

### 7.2 Student Portal
- **Summary Endpoint:** `GET /api/campus/:slug/student-portal/summary`
- **Features:**
  - Scoped to student profile.
  - Personal details: Admission number, class, section, roll number.
  - Enrolled LMS courses with instructors.
  - Exam marks, terms, and letter grades.
  - Overall attendance percentage (e.g. 96.5%) and active school notices.
  - Password management: Self-service change password dialog.

---

## 8. Database Schema Reference (D1 / SQLite)

The following tables back the Member 1 implementation (defined in `db/schema.ts` and `drizzle/0008_member1_core_admin_admissions.sql`):

```sql
-- Authentication & Audit
CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  username_or_email TEXT NOT NULL,
  ip_address TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_attempt_at TEXT NOT NULL
);

CREATE TABLE login_history (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL, -- 'SUCCESS' | 'FAILED'
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

-- Organization & Calendar
CREATE TABLE campuses (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  principal_name TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE academic_holidays (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  academic_year_id TEXT,
  name TEXT NOT NULL,
  holiday_date TEXT NOT NULL,
  end_date TEXT,
  holiday_type TEXT NOT NULL DEFAULT 'Public',
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE working_days (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  academic_year_id TEXT,
  day_of_week INTEGER NOT NULL, -- 0 (Sun) to 6 (Sat)
  is_working_day INTEGER NOT NULL DEFAULT 1,
  shift_start_time TEXT NOT NULL DEFAULT '08:00',
  shift_end_time TEXT NOT NULL DEFAULT '15:00',
  is_half_day INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Admissions
CREATE TABLE admissions_enquiries (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  parent_name TEXT,
  mobile TEXT NOT NULL,
  email TEXT,
  applying_for_grade TEXT,
  source TEXT DEFAULT 'WalkIn',
  status TEXT NOT NULL DEFAULT 'Open',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE admissions_applications (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  application_number TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  blood_group TEXT,
  grade_applying TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  parent_email TEXT,
  parent_mobile TEXT NOT NULL,
  parent_occupation TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  previous_school TEXT,
  previous_board TEXT,
  previous_percentage TEXT,
  status TEXT NOT NULL DEFAULT 'Submitted',
  enrolled_student_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE admissions_documents (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'Pending',
  verified_by TEXT,
  verified_at TEXT,
  remarks TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE admissions_interviews (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  interview_mode TEXT NOT NULL DEFAULT 'In-Person',
  interviewer_name TEXT NOT NULL,
  notes TEXT,
  score REAL,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Student Lifecycle & Academics
CREATE TABLE student_emergency_contacts (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  alternate_phone TEXT,
  address TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE student_exams (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  academic_year_id TEXT NOT NULL,
  exam_name TEXT NOT NULL,
  term TEXT NOT NULL,
  subject TEXT NOT NULL,
  max_marks REAL NOT NULL,
  marks_obtained REAL NOT NULL,
  grade TEXT NOT NULL,
  remarks TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE student_lms_courses (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  course_code TEXT NOT NULL,
  course_name TEXT NOT NULL,
  teacher_name TEXT,
  enrollment_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE student_transfers (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  tc_number TEXT NOT NULL UNIQUE,
  destination_school TEXT NOT NULL,
  reason TEXT NOT NULL,
  transfer_date TEXT NOT NULL,
  conduct_rating TEXT,
  remarks TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE student_history (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
```

---

## 9. Test Verification Results

All automated test suites pass with **100% success rate (0 failures)**:

| Suite Name | Command | Tests Run | Result | Duration |
| :--- | :--- | :--- | :--- | :--- |
| **Member 1 End-to-End Suite** | `pnpm test:member1` | **43** | **PASS (43/43)** | ~8s |
| **Full Integration Suite** | `pnpm test:integration` | **66** | **PASS (66/66)** | ~10s |
| **SaaS & Platform Suite** | `pnpm test:saas` | **69** | **PASS (69/69)** | ~9s |
| **Refactor & Drizzle Tenancy** | `pnpm test:refactor` | **26** | **PASS (26/26)** | ~8s |
| **Advanced Features Suite** | `pnpm test:advanced` | **37** | **PASS (37/37)** | ~9s |
| **Unit Tests (Money & Tables)** | `pnpm test:unit` | **9** | **PASS (9/9)** | ~0.2s |
| **Navigation Test** | `tests/navigation.test.mjs` | **2** | **PASS (2/2)** | ~0.2s |
| **TypeScript Compilation** | `pnpm run typecheck` | N/A | **0 errors (PASS)** | ~5s |

### Total Passing Checks: **252+ tests**
All features meet the Definition of Done: zero static-only pages, zero decorative buttons, complete SQLite persistence, role authorization, and comprehensive documentation.
