"use client";
import { Row } from "@/components/campus/context";
export default function GuardianInfo({ student: s }: { student: Row }) {
  return (
    <div className="summary-lines">
      {[
        ["Admission number", s.admission_number],
        ["Roll number", s.roll_number],
        ["Date of birth", s.dob],
        ["Gender", s.gender],
        ["Blood group", s.blood_group],
        ["Aadhaar", s.aadhaar_last4 ? "XXXX XXXX " + s.aadhaar_last4 : "—"],
        ["Admission date", s.admission_date],
        ["Previous school", s.previous_school],
        ["Guardian", s.parent_name],
        ["Mobile", s.mobile],
        ["Email", s.parent_email],
      ].map(([label, v]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{v || "—"}</b>
        </div>
      ))}
    </div>
  );
}
