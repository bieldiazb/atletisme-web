// Parser de CSV senzill (sense dependències): admet camps entre cometes amb
// comes/salts de línia a dins, cometes escapades ("") i CRLF/LF/CR. Prou
// per als fitxers que exportaria un Excel/Google Sheets normal.
export function parseCsv(text) {
  const s = (text ?? "").replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  const rows = []
  let row = []
  let field = ""
  let inQuotes = false
  let i = 0

  const pushField = () => { row.push(field); field = "" }
  const pushRow = () => { pushField(); rows.push(row); row = [] }

  while (i < s.length) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ",") { pushField(); i++; continue }
    if (c === "\n") { pushRow(); i++; continue }
    field += c; i++
  }
  if (field.length > 0 || row.length > 0) pushRow()

  // Treu línies completament buides (per exemple la del final del fitxer)
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) rows.pop()

  const [headerRow, ...dataRows] = rows
  const headers = (headerRow ?? []).map((h) => h.trim().toLowerCase())
  const records = dataRows
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, (r[idx] ?? "").trim()])))

  return { headers, records }
}
