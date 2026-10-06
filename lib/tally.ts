export type TallyPosting = {
  ledger: string;
  paise: number;
  side: "Debit" | "Credit";
};
export type TallyVoucher = {
  id: string;
  date: string;
  number: string;
  narration: string;
  type: "Journal" | "Receipt" | "Payment";
  postings: TallyPosting[];
};
export function xmlEscape(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
}
export function exactDecimal(paise: number) {
  if (!Number.isSafeInteger(paise) || paise < 0)
    throw new Error("Invalid monetary amount");
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}
export function tallyXml(company: string, vouchers: TallyVoucher[]) {
  const xml = vouchers
    .map((v) => {
      let balance = BigInt(0);
      for (const p of v.postings) {
        if (!p.ledger.trim() || !Number.isSafeInteger(p.paise) || p.paise <= 0)
          throw new Error("Invalid posting");
        balance +=
          (p.side === "Debit" ? BigInt(1) : -BigInt(1)) * BigInt(p.paise);
      }
      if (balance !== BigInt(0)) throw new Error("Unbalanced Tally voucher");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date))
        throw new Error("Invalid voucher date");
      return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER REMOTEID="${xmlEscape(v.id)}" VCHTYPE="${v.type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${v.date.replaceAll("-", "")}</DATE><GUID>${xmlEscape(v.id)}</GUID><VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xmlEscape(v.number)}</VOUCHERNUMBER><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE><NARRATION>${xmlEscape(v.narration)}</NARRATION>${v.postings.map((p) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(p.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${p.side === "Debit" ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${p.side === "Debit" ? "-" : ""}${exactDecimal(p.paise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join("")}</VOUCHER></TALLYMESSAGE>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${xml}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
