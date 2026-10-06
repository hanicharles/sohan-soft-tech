import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!field || quoted) quoted = !quoted;
      else field += c;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((s) => s.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((s) => s.trim())) rows.push(row);
  return rows;
}
export const csv = (rows: unknown[][]) =>
  "\uFEFF" +
  rows
    .map((r) =>
      r
        .map(
          (v) =>
            '"' +
            String(v ?? "")
              .replace(/^([=+@\-])/, "'$1")
              .replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
const xml = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const unxml = (v: string) =>
  v
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
const column = (i: number): string =>
  i < 26
    ? String.fromCharCode(65 + i)
    : column(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
export function xlsx(rows: unknown[][]): Uint8Array {
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((v, j) => (typeof v === "number" ? `<c r="${column(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
      "xl/workbook.xml": strToU8(
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sohan Soft Tech" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    },
    { level: 6 },
  );
}
export function parseXlsx(data: Uint8Array): string[][] {
  if (data.length > 2000000) throw new Error("Excel file must be under 2 MB.");
  const entries = unzipSync(data, {
      filter: (file) =>
        file.originalSize < 2000000 &&
        /^xl\/(worksheets\/sheet1\.xml|sharedStrings\.xml)$/.test(file.name),
    }),
    sheet = entries["xl/worksheets/sheet1.xml"];
  if (!sheet) throw new Error("Excel file must contain a first worksheet.");
  const shared = entries["xl/sharedStrings.xml"]
    ? [
        ...strFromU8(entries["xl/sharedStrings.xml"]).matchAll(
          /<si[ >]([\s\S]*?)<\/si>/g,
        ),
      ].map((m) =>
        unxml(
          [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((t) => t[1])
            .join(""),
        ),
      )
    : [];
  return [...strFromU8(sheet).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(
    (row) => {
      const values: string[] = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const address = /r="([A-Z]+)\d+"/.exec(cell[1])?.[1] || "A";
        let index = 0;
        for (const letter of address)
          index = index * 26 + letter.charCodeAt(0) - 64;
        const val = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] || "",
          inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[2])?.[1];
        values[index - 1] = unxml(
          inline ?? (/t="s"/.test(cell[1]) ? shared[Number(val)] || "" : val),
        );
      }
      return Array.from({ length: values.length }, (_, i) => values[i] || "");
    },
  );
}

// Shared sizing contract; the React hook lives in the client DataTable so server
// CSV/XLSX exports never import React hooks or depend on a browser.
export const virtualTableOptions = (count: number) => ({
  count,
  estimateSize: () => 56,
  overscan: 8,
  initialRect: { width: 1000, height: 560 },
});
