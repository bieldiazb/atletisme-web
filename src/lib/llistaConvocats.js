import { jsPDF } from "jspdf"

// Llista de convocats d'una competició, pensada per imprimir: un bloc per
// categoria amb nom, sexe, naixement, proves, una casella per dorsal i una per
// marcar presència el dia de la competició.
//
// `files`: [{ nom, categoria, sexe, naixement (text), proves (text) }]
const COLS = [
  { k: "n", t: "#", w: 9 },
  { k: "nom", t: "Nom", w: 70 },
  { k: "sexe", t: "Sexe", w: 14 },
  { k: "naixement", t: "Naixement", w: 25 },
  { k: "proves", t: "Proves", w: 85 },
  { k: "dorsal", t: "Dorsal", w: 22 },
  { k: "present", t: "Present", w: 18 },
]
const MARGE = 12
const ALCADA_FILA = 8

export function generarLlistaConvocats({ event, files, dataText, nomClub = "CAM" }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const amplada = doc.internal.pageSize.getWidth()
  const alt = doc.internal.pageSize.getHeight()

  const capcalera = () => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(15)
    doc.text(`Llista de convocats · ${event.title ?? ""}`, MARGE, 14)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    const detalls = [dataText, event.lloc, `${files.length} atletes`].filter(Boolean).join("  ·  ")
    doc.text(detalls, MARGE, 20)
    doc.setDrawColor(200)
    doc.line(MARGE, 23, amplada - MARGE, 23)
    return 28
  }

  const capcaleraTaula = (y) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setFillColor(240, 240, 240)
    doc.rect(MARGE, y - 5, COLS.reduce((a, c) => a + c.w, 0), 7, "F")
    let x = MARGE
    COLS.forEach((c) => { doc.text(c.t, x + 1.5, y); x += c.w })
    return y + 5
  }

  let y = capcalera()

  const perCategoria = new Map()
  files.forEach((f) => {
    const c = f.categoria || "Sense categoria"
    if (!perCategoria.has(c)) perCategoria.set(c, [])
    perCategoria.get(c).push(f)
  })
  const categories = [...perCategoria.keys()].sort((a, b) => a.localeCompare(b, "ca", { numeric: true }))

  if (files.length === 0) {
    doc.setFontSize(11)
    doc.text("Encara no hi ha cap atleta apuntat.", MARGE, y + 6)
  }

  categories.forEach((cat) => {
    const llista = perCategoria.get(cat).sort((a, b) =>
      (a.sexe ?? "").localeCompare(b.sexe ?? "") || (a.nom ?? "").localeCompare(b.nom ?? "", "ca"))

    if (y + 22 > alt - MARGE) { doc.addPage(); y = capcalera() }
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text(`${cat} (${llista.length})`, MARGE, y)
    y = capcaleraTaula(y + 6)

    llista.forEach((f, i) => {
      if (y + ALCADA_FILA > alt - MARGE) {
        doc.addPage()
        y = capcaleraTaula(capcalera())
      }
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      let x = MARGE
      const cel = {
        n: String(i + 1),
        nom: f.nom ?? "",
        sexe: f.sexe === "F" ? "Nena" : f.sexe === "M" ? "Nen" : "",
        naixement: f.naixement ?? "",
        proves: f.proves ?? "",
      }
      COLS.forEach((c) => {
        if (c.k === "dorsal") {
          doc.setDrawColor(150)
          doc.line(x + 2, y + 1, x + c.w - 3, y + 1)
        } else if (c.k === "present") {
          doc.setDrawColor(120)
          doc.rect(x + c.w / 2 - 2.5, y - 3.5, 5, 5)
        } else {
          const text = doc.splitTextToSize(cel[c.k] ?? "", c.w - 3)[0] ?? ""
          doc.text(text, x + 1.5, y)
        }
        x += c.w
      })
      doc.setDrawColor(225)
      doc.line(MARGE, y + 3, MARGE + COLS.reduce((a, c) => a + c.w, 0), y + 3)
      y += ALCADA_FILA
    })
    y += 6
  })

  // Peu amb número de pàgina
  const pagines = doc.getNumberOfPages()
  for (let p = 1; p <= pagines; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(130)
    doc.text(`${nomClub} · pàgina ${p}/${pagines}`, amplada - MARGE, alt - 6, { align: "right" })
    doc.setTextColor(0)
  }

  return doc
}

export function nomFitxerConvocats(event) {
  const net = (event.title ?? "competicio").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()
  return `convocats-${net || "competicio"}.pdf`
}
