import { collection, getDocs, query, where } from "firebase/firestore"
import { jsPDF } from "jspdf"
import { db } from "../../firebaseClient"
import logoCam from "@/assets/logo_cam.png"

// Lògica compartida per generar el diploma en PDF d'un atleta — la fan
// servir tant l'admin (DiplomesSection.jsx, per generar-los tots de cop)
// com els pares (DiplomaSection.jsx, per baixar el del seu fill/a des del
// seu propi panell), perquè el disseny sigui exactament el mateix als dos
// llocs i només calgui tocar-lo en un fitxer.

// Canvia-ho aquí si el nom que ha de sortir al diploma és un altre (nom
// complet del club, per exemple) — és l'únic lloc on cal tocar-ho.
export const NOM_CLUB = "CAM"

/* ── Helpers de marques: mateixa lògica que EstadistiquesSection.jsx (pares)
   per detectar si una prova és de temps o de distància i formatar-la — no es
   toca aquell fitxer, simplement es reprodueix aquí el mateix criteri. ── */
export function parseMarca(marca) {
  if (!marca) return null
  const clean = marca.toString().trim().replace(/\s*(s|m)\s*$/i, "").replace(",", ".")
  if (clean.includes(":")) {
    const [min, sec] = clean.split(":")
    return Number(min) * 60 + Number(sec)
  }
  const v = parseFloat(clean)
  return isNaN(v) ? null : v
}

export function marcaEsTemps(marca) {
  if (!marca) return null
  const m = marca.toString().trim()
  if (/\s*s\s*$/i.test(m)) return true
  if (/\s*m\s*$/i.test(m)) return false
  if (m.includes(":")) return true
  return null
}

export function isTempsProva(tipus, marca) {
  const pesMarca = marcaEsTemps(marca)
  if (pesMarca !== null) return pesMarca
  return ["velocitat", "fons", "marxa"].includes(tipus)
}

export function formatMarca(value, esTemps) {
  if (value == null) return "—"
  if (esTemps) {
    const m = Math.floor(value / 60)
    const s = (value % 60).toFixed(2).padStart(5, "0")
    return m > 0 ? `${m}:${s}` : `${s} s`
  }
  return `${value.toFixed(2)} m`
}

export function nomFitxerSegur(text) {
  return (text ?? "").replace(/[\\/:*?"<>|]/g, "").trim()
}

// Millor marca per prova d'un atleta, per un any concret (mateix criteri
// que a l'Estadístiques dels pares). `proves` és el mapa { provaId: {nom, tipus} }.
export async function millorsMarquesDe(athleteId, any, proves) {
  const snap = await getDocs(query(collection(db, "marques"), where("atletaId", "==", athleteId)))
  const marquesAny = snap.docs
    .map((d) => d.data())
    .filter((m) => m.data?.toDate?.().getFullYear() === any)

  const byProva = {}
  marquesAny.forEach((m) => {
    const val = parseMarca(m.marca)
    if (val == null) return
    const provaInfo = proves[m.provaId]
    if (!provaInfo?.nom) return
    const isTem = isTempsProva(provaInfo.tipus, m.marca)
    const actual = byProva[m.provaId]
    if (!actual || (isTem ? val < actual.val : val > actual.val)) {
      byProva[m.provaId] = { nom: provaInfo.nom, val, isTem, data: m.data.toDate() }
    }
  })
  return Object.values(byProva).sort((a, b) => a.data - b.data)
}

// Mapa { provaId: {nom, tipus} } — cal per calcular les millors marques.
export async function carregarProves() {
  const snap = await getDocs(collection(db, "proves"))
  const provesMap = {}
  snap.docs.forEach((d) => (provesMap[d.id] = d.data()))
  return provesMap
}

/* ── Precarrega una imatge com a HTMLImageElement, ja que jsPDF necessita
   el píxel real (no una simple URL) per fer doc.addImage(...). Si falla la
   càrrega, es resol a null i el diploma cau en un fallback de text. ── */
export function carregarImatge(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Precarrega el logo real del club (src/assets/logo_cam.png) — cridar-ho un
// cop en cada pantalla que generi diplomes i passar el resultat a
// dibuixarDiploma com a `logoImg`.
export function carregarLogoCam() {
  return carregarImatge(logoCam)
}

/* ── Dibuixa una estrelleta (5 puntes) plena, per decorar el diploma
   d'una manera infantil. ── */
function dibuixaEstrella(doc, cx, cy, r, color, rotacio = 0) {
  const rOut = r
  const rIn = r * 0.45
  const punts = []
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2 + rotacio
    const rad = i % 2 === 0 ? rOut : rIn
    punts.push([cx + rad * Math.cos(angle), cy + rad * Math.sin(angle)])
  }
  const deltes = []
  for (let i = 1; i < punts.length; i++) {
    deltes.push([punts[i][0] - punts[i - 1][0], punts[i][1] - punts[i - 1][1]])
  }
  deltes.push([punts[0][0] - punts[punts.length - 1][0], punts[0][1] - punts[punts.length - 1][1]])
  doc.setFillColor(...color)
  doc.lines(deltes, punts[0][0], punts[0][1], [1, 1], "F", true)
}

/* ── Dibuixa el diploma d'un atleta amb jsPDF: disseny infantil i alegre,
   amb el logo real del club i colors vius, format A4 horitzontal. ── */
export function dibuixarDiploma(athlete, millors, any, logoImg) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const W = 297, H = 210
  const CREMA = [253, 247, 227]
  const CORAL = [231, 111, 81]
  const GROC = [244, 196, 48]
  const BLAU = [69, 123, 157]
  const VERD = [96, 166, 90]
  const TEXT = [82, 63, 45]

  // Fons crema càlid + marc gruixut de colors (en comptes del navy/or formal)
  doc.setFillColor(...CREMA)
  doc.rect(0, 0, W, H, "F")

  doc.setDrawColor(...CORAL)
  doc.setLineWidth(2.4)
  doc.roundedRect(7, 7, W - 14, H - 14, 10, 10, "S")
  doc.setDrawColor(...GROC)
  doc.setLineWidth(0.9)
  doc.roundedRect(11.5, 11.5, W - 23, H - 23, 8, 8, "S")

  // Confeti d'estrelletes de colors a les cantonades (no al centre, perquè
  // no molestin el text)
  const confeti = [
    [20, 22, GROC, 2.6], [W - 20, 22, BLAU, 2.6],
    [20, H - 22, BLAU, 2.4], [W - 20, H - 65, GROC, 2.2],
    [26, H / 2 + 6, VERD, 2], [W - 26, 40, VERD, 2],
    [17, 60, CORAL, 1.8], [W - 17, H - 100, CORAL, 1.8],
  ]
  confeti.forEach(([cx, cy, color, r], i) => dibuixaEstrella(doc, cx, cy, r, color, i))

  const centreX = W / 2

  // Logo del club (imatge real si s'ha pogut carregar; si no, fallback de
  // text amb el nom del club) — quadrat, centrat, a dalt de tot
  const logoMida = 30
  const logoY = 13
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", centreX - logoMida / 2, logoY, logoMida, logoMida)
    } catch {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(16)
      doc.setTextColor(...CORAL)
      doc.text(NOM_CLUB.toUpperCase(), centreX, logoY + logoMida / 2 + 4, { align: "center" })
    }
  } else {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.setTextColor(...CORAL)
    doc.text(NOM_CLUB.toUpperCase(), centreX, logoY + logoMida / 2 + 4, { align: "center" })
  }

  // Títol "DIPLOMA" amb efecte "adhesiu" (ombra groga darrere el coral)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(40)
  doc.setTextColor(...GROC)
  doc.text("DIPLOMA", centreX + 1.2, 65.2, { align: "center" })
  doc.setTextColor(...CORAL)
  doc.text("DIPLOMA", centreX, 64, { align: "center" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(13.5)
  doc.setTextColor(...BLAU)
  doc.text(`PER LA SEVA GRAN TEMPORADA ${any}!`, centreX, 73, { align: "center" })

  // Separador de puntets de colors
  const colorsPunts = [CORAL, GROC, BLAU, VERD, GROC, CORAL]
  const ampleTotal = 60
  colorsPunts.forEach((color, i) => {
    doc.setFillColor(...color)
    doc.circle(centreX - ampleTotal / 2 + (i * ampleTotal) / (colorsPunts.length - 1), 79, 1.1, "F")
  })

  // Fórmula + nom de l'atleta
  doc.setFont("helvetica", "italic")
  doc.setFontSize(12.5)
  doc.setTextColor(...TEXT)
  doc.text("Amb molt d'orgull, entreguem aquest diploma a:", centreX, 92, { align: "center" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(28)
  doc.setTextColor(...BLAU)
  doc.text(athlete.nom ?? "—", centreX, 107, { align: "center" })
  doc.setDrawColor(...GROC)
  doc.setLineWidth(1.6)
  const amplNom = doc.getTextWidth(athlete.nom ?? "—") + 10
  doc.line(centreX - amplNom / 2, 110.5, centreX + amplNom / 2, 110.5)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(12)
  doc.setTextColor(...TEXT)
  doc.text(
    `per formar part de l'equip ${athlete.categoria ?? ""} amb moltíssimes ganes durant la temporada ${any}!`,
    centreX,
    119,
    { align: "center" }
  )

  // Llistat de millors marques (si n'hi ha), com a "xips" de colors
  if (millors.length > 0) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11.5)
    doc.setTextColor(...CORAL)
    doc.text("Les seves marques d'aquesta temporada:", centreX, 131, { align: "center" })

    const colorsXip = [CORAL, BLAU, VERD]
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)

    const filesPerColumna = Math.ceil(millors.length / (millors.length > 4 ? 2 : 1))
    const dobleColumna = millors.length > 4
    const colX = dobleColumna ? [centreX - 82, centreX + 18] : [centreX - 42]

    millors.forEach((m, i) => {
      const col = dobleColumna ? Math.floor(i / filesPerColumna) : 0
      const fila = dobleColumna ? i % filesPerColumna : i
      const y = 140 + fila * 8
      const color = colorsXip[i % colorsXip.length]
      doc.setFillColor(...color)
      doc.circle(colX[col] - 3, y - 1.3, 1.3, "F")
      doc.setTextColor(...TEXT)
      const text = `${m.nom}:  ${formatMarca(m.val, m.isTem)}`
      doc.text(text, colX[col] + 1, y, { align: "left" })
    })
  } else {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(11.5)
    doc.setTextColor(...TEXT)
    doc.text("Per tot l'esforç, les ganes i els somriures durant la temporada!", centreX, 134, { align: "center" })
  }

  // Peu: data amistosa + firma + medalla de colors (en comptes del segell
  // formal navy/or d'abans)
  const dataText = new Date().toLocaleDateString("ca-ES", { day: "2-digit", month: "long", year: "numeric" })
  doc.setFont("helvetica", "italic")
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)
  doc.text(`Fet amb molta il·lusió el ${dataText}`, 24, H - 20)

  doc.setDrawColor(...BLAU)
  doc.setLineWidth(0.5)
  doc.line(centreX - 28, H - 30, centreX + 28, H - 30)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(...BLAU)
  doc.text("El teu entrenador/a", centreX, H - 25, { align: "center" })

  // Medalla: cinta de dos colors + cercle
  const medX = W - 34, medY = H - 30
  doc.setFillColor(...CORAL)
  doc.triangle(medX - 9, medY, medX - 2, medY, medX - 6, medY + 16, "F")
  doc.setFillColor(...BLAU)
  doc.triangle(medX + 2, medY, medX + 9, medY, medX + 6, medY + 16, "F")
  doc.setFillColor(...GROC)
  doc.circle(medX, medY, 12, "F")
  doc.setDrawColor(...CORAL)
  doc.setLineWidth(0.8)
  doc.circle(medX, medY, 12, "S")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(...CORAL)
  doc.text(NOM_CLUB.toUpperCase(), medX, medY - 1, { align: "center" })
  doc.setFontSize(6.5)
  doc.text(String(any), medX, medY + 4, { align: "center" })

  return doc
}
