import { useState, useRef, useCallback } from "react"
import {
  collection, getDocs, addDoc, query, where, orderBy, Timestamp
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { Upload, FileText, CheckCircle2, AlertCircle, X, Save, ChevronDown, ChevronUp, CalendarDays, MapPin } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ─── Parser de text PDF ────────────────────────────────────────────────────

/**
 * Format real del PDF de Conersys Sports Solutions llegit per pdf.js.
 *
 * Cada atleta genera TRES línies:
 *   1. "NOM COGNOM COGNOM DD/M/YYYY"           ← nom + data naixement
 *   2. "pos   dorsal   CLUB   calle   MARCA"    ← números (la marca pot portar MMP/MMT)
 *   3. "Nom club complet   CAT-xxx / CLxxxx"   ← club (ignorar)
 *
 * La marca pot ser:
 *   - Temps:    "9.58", "1:58.32", "2:04.31"
 *   - Distància: "4.06", "3.84", "1.20"
 *   - Pot tenir sufix: "4.06 MMP 8", "3.84 MMT 5", "10.97 (.963) 6"
 *   - DNS/DQ/NM: ignorar
 *
 * El nom de prova apareix:
 *   - Com a línia sola: "60m Hombres AL U10M", "Longitud Hombres U12M"
 *   - O dins la línia d'horari (ignorar): "11:28   Men's 400m SUB 10 M   Final 4/4"
 */
function parsearPDF(text) {
  const linies = text.replace(/\f/g, "\n").split("\n").map(l => l.trim()).filter(Boolean)
  const proves = {}
 
  let nomProvaActual = null
  let tipusProva = null
  let dataActual = null
  let enResultats = false
  let nomPendent = null
  let estat = null
 
  const RE_NOM_DATA        = /^(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{4})/
  const RE_NUMS_COMPLET    = /^(\d{1,2})\s+(\d{1,4})\s+([A-Z]{3,6})\s/
  const RE_NUMS_SOLS       = /^(\d{1,2})\s+(\d{1,4})\s*$/
  const RE_RESULTAT_ALCADA = /^(\d\.\d{2})\s*(MMP|MMT|RCAM|RCAT)?\s*[\d.]*\s*$/
  const RE_DNS             = /\bDNS\b|\bDQ\b|\bNM\b|Abandon/i
 
  const BAD_WORDS = ['RCAT','RCAM','Gestión','Leyenda','Hora','Nombre','Puesto',
                     'Club','Calificació','Pasos','Licencia','Gavà','Sabadell',
                     'Igualada','Serrahima','Manresa','Terrassa','Castellar','El Prat',
                     'Trofeu','Jornada','Pista','Atletisme','Atletismo']
 
  function detectarTipus(n) {
    const s = n.toLowerCase()
    if (/llargada|longitud|triple/.test(s))                         return 'llargada'
    if (/alçada|altura|perxa|p[eé]rtiga/.test(s))                  return 'alcada'
    if (/\bpes\b|\bpeso\b|disc|martell|javelina|jabalina|vortex/.test(s)) return 'pes'
    return 'velocitat'
  }
 
  function guardarMarca(nom, marca) {
    if (!nomProvaActual || !marca) return
    if (!proves[nomProvaActual])
      proves[nomProvaActual] = { prova: nomProvaActual, data: dataActual, resultats: [] }
    const nomN = normalitzarNom(nom)
    if (!proves[nomProvaActual].resultats.find(r => normalitzarNom(r.nom) === nomN))
      proves[nomProvaActual].resultats.push({ nom, marca })
  }
 
  function reset() { nomPendent = null; estat = null }
 
  function extraureUltimDecimal(linia) {
    const nums = [...linia.matchAll(/\b(\d+\.\d+)\b/g)]
      .map(m => m[1]).filter(n => parseFloat(n) > 1.0)
    return nums.length ? nums[nums.length - 1] : null
  }
 
  function extraurePrimerTempsDist(linia) {
    return [...linia.matchAll(/\b(\d+[:.]\d+(?:[:.]\d+)?)\b/g)]
      .map(m => m[1])
      .find(m => m.includes(':') ||
        (parseFloat(m) > 1.5 && m.includes('.') && m.split('.')[1]?.length >= 2)
      ) ?? null
  }
 
  const esTipusProva = (l) => (
    /(U\d+[MF]|SUB\s?\d+|Hombres|Mujeres|AL\s+U|Men'?s|Women'?s|masculins?|femenins?)/i.test(l) &&
    /(\d+\s*m\b|\d+\.\d{3}\s*m|Longitud|Alçada|Llargada|Altura|Triple|Jabalina|Pes\b|Peso\b|Perxa|P[eé]rtiga|Disco|Vortex|tanques|Obst)/i.test(l) &&
    !/Final\s*\d/.test(l) && !/^\d{2}:\d{2}/.test(l) &&
    !l.includes('RESULTADOS') && !/CAT\s*-|CL\d{4}/.test(l) && l.length < 80
  ) || (
    /^(Alçada|Llargada|Perxa|Pes\s|Pes$)/i.test(l) &&
    /(masculina?|femenina?)/i.test(l) && l.length < 40
  )
 
  for (let i = 0; i < linies.length; i++) {
    const l = linies[i]
 
    if (/^(Trofeu|Jornada|Pista\s|El Prat|Sabadell\s*[\(\i]|SESION|HORARIO|Gestión de)/i.test(l)) {
      enResultats = false; reset(); continue
    }
    if (/^(Leyenda[:\s]|Mejor\s|Calificación|Pasos intermedios)/i.test(l)) continue
    if (/^(Nombre\s+Fecha|Puesto\s+Dorsal|Club\s+Licencia|Rank\s+Dorsal|Hora\s+Prueba)/i.test(l)) continue
    if (/^(RCAT|RCAM)\s/.test(l)) continue
    if (/(?:CAT\s*-\s*\d|CL\d{4,})/.test(l)) continue
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(l)) { dataActual = l; continue }
    if (/Hora de Comienzo/i.test(l)) {
      if (l.includes('RESULTADOS')) enResultats = true
      reset(); continue
    }
    if (l === 'RESULTADOS' || l === 'SUMARIO') { enResultats = true; continue }
    if (/^\d{2}:\d{2}/.test(l)) continue
    if (/^(Final|Semifinal)(\s+\d+\/\d+)?$/i.test(l)) continue
    if (/^(Clasificatoria|Serie\s)/i.test(l)) continue
    if (/^\d\s+\d\s+\d\s+\d/.test(l) && !enResultats) continue
 
    if (esTipusProva(l)) {
      nomProvaActual = l.trim()
      tipusProva = detectarTipus(nomProvaActual)
      enResultats = false; reset(); continue
    }
 
    if (!enResultats) continue
 
    // ── NOM + DATA ────────────────────────────────────────────────────────────
    const mNomData = RE_NOM_DATA.exec(l)
    if (mNomData) {
      const nomCandidat = mNomData[1].trim()
      if (BAD_WORDS.some(w => nomCandidat.includes(w))) continue
      if (nomCandidat.length <= 4) continue
      // Descartar "Muntanyenc S.Cugat" (club) — té minúscules i cap paraula ≥2 majúscules seguides
      if (/^[A-Z][a-záéíóúàèìòùüïëä\s'·\-]+$/.test(nomCandidat) &&
          !/\s[A-Z]{2,}/.test(nomCandidat)) continue
 
      nomPendent = nomCandidat
      if (tipusProva === 'alcada')     estat = 'esperant_resultat_a'
      else if (tipusProva === 'llargada')  estat = 'esperant_resultat_l'
      else if (tipusProva === 'pes')   estat = 'esperant_resultat_p'
      else                             estat = 'esperant_marca_v'
      continue
    }
 
    // ── FORMAT V — POS DORSAL sols ────────────────────────────────────────────
    if (RE_NUMS_SOLS.test(l) && nomPendent && estat === 'esperant_marca_v') {
      if (RE_DNS.test(l)) { reset(); continue }
      continue
    }
 
    // ── FORMAT V — línia amb CALLE + MARCA ───────────────────────────────────
    if (estat === 'esperant_marca_v' && nomPendent) {
      if (/^[A-Za-záéíóúàèìòùüïëä\s'·\-]+$/.test(l)) continue
      if (/^[A-Z]{3,6}$/.test(l)) continue
      if (RE_DNS.test(l)) { reset(); continue }
      const marca = extraurePrimerTempsDist(l)
      if (marca) { guardarMarca(nomPendent, marca); reset() }
      continue
    }
 
    // ── FORMAT L — Llargada: POS DORSAL CLUB_COD ... RESULTAT (al final) ─────
    if (estat === 'esperant_resultat_l' && nomPendent) {
      if (/^[A-Z][a-záéíóúàèìòùüïëä]/.test(l)) continue
      if (/^[A-Z]{3,6}$/.test(l)) continue
      if (RE_DNS.test(l)) { reset(); continue }
      if (RE_NUMS_COMPLET.test(l) || RE_NUMS_SOLS.test(l) || /^\d+\s+\d+\s+[A-Z]{3,6}/.test(l)) {
        const marca = extraureUltimDecimal(l)
        if (marca && parseFloat(marca) > 1.0) { guardarMarca(nomPendent, marca); reset() }
        continue
      }
      continue
    }
 
    // ── FORMAT P — Pes: agafem el màxim de tots els intents ──────────────────
    if (estat === 'esperant_resultat_p' && nomPendent) {
      if (/^[A-Za-záéíóúàèìòùüïëä\s'·\-]+$/.test(l) && !RE_NUMS_COMPLET.test(l)) continue
      if (RE_DNS.test(l)) { reset(); continue }
      const nums = [...l.matchAll(/\b(\d+\.\d+)\b/g)].map(m => parseFloat(m[1])).filter(n => n > 1.0)
      if (nums.length) {
        const best = Math.max(...nums)
        const marcaStr = [...l.matchAll(/\b(\d+\.\d+)\b/g)].map(m => m[1]).find(n => parseFloat(n) === best)
        if (marcaStr) { guardarMarca(nomPendent, marcaStr); reset() }
        continue
      }
      continue
    }
 
    // ── FORMAT A — Alçada/Perxa ─────────────────────────────────────────────
    // Dos sub-formats:
    // A1 (pdftotext): línia separada "1.90 MMP 6"
    // A2 (pdf.js prod): tot compacte "3   344   CAMB   1.90   MMP   6"
    if (estat === 'esperant_resultat_a' && nomPendent) {
      if (RE_DNS.test(l)) { reset(); continue }
      // A1: la línia comença pel resultat
      const mA1 = RE_RESULTAT_ALCADA.exec(l)
      if (mA1) { guardarMarca(nomPendent, mA1[1]); reset(); continue }
      // A2: resultat encastat dins la línia compacta (sempre entre 1.00 i 3.00m)
      const mA2 = l.match(/\b([1-3]\.\d{2})\b/)
      if (mA2) { guardarMarca(nomPendent, mA2[1]); reset(); continue }
      // Qualsevol altra línia (XXX, club sense dorsal...) → skip sense reset
      continue
    }
 
    // ── FORMAT Pratenc compacte ───────────────────────────────────────────────
    if (RE_NUMS_COMPLET.test(l) && nomPendent && tipusProva === 'velocitat') {
      if (RE_DNS.test(l)) { reset(); continue }
      const marca = extraurePrimerTempsDist(l)
      if (marca) { guardarMarca(nomPendent, marca); reset() }
      continue
    }
 
    if ((RE_NUMS_COMPLET.test(l) || RE_NUMS_SOLS.test(l)) && !nomPendent) reset()
  }
 
  return Object.values(proves).filter(p => p.resultats.length > 0)
}


function normalitzarNom(nom) {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // elimina accents (à→a, é→e, ó→o, etc.)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")      // elimina apòstrofs, guions, punts...
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Comprova si un nom del PDF coincideix amb un atleta de la BD.
 * Compara paraules: si ≥2 paraules del nom del PDF estan al nom de l'atleta → match
 */
function nomCoincideix(nomPDF, nomAtleta) {
  const nPDF    = normalitzarNom(nomPDF)
  const nAtleta = normalitzarNom(nomAtleta)

  if (nPDF === nAtleta) return true

  // BD format: "NOM COG1 [COG2]"  ex: "ALEX GARCIA FERRER"
  // PDF format: pot ser "COG1 NOM" o "NOM COG1 COG2" etc.
  // Exigim que NOM (par[0]) i COG1 (par[1]) de la BD estiguin al PDF
  // I que COG1 sigui entre les primeres 2 paraules del PDF (evita falsos positius)
  const parAtleta = nAtleta.split(" ").filter(p => p.length > 1)
  const parPDF    = nPDF.split(" ").filter(p => p.length > 1)

  if (parAtleta.length < 2 || parPDF.length < 2) return false

  const nomAtl  = parAtleta[0]  // ex: "ALEX"
  const cog1Atl = parAtleta[1]  // ex: "GARCIA"

  const teNom           = parPDF.includes(nomAtl)
  const teCog1          = parPDF.includes(cog1Atl)
  const cog1EnPosCorrecta = parPDF[0] === cog1Atl || parPDF[1] === cog1Atl

  return teNom && teCog1 && cog1EnPosCorrecta
}


/**
 * Mapeja el nom de prova del PDF a la clau de prova de Firestore.
 * Retorna el nom simplificat per buscar a la col·lecció "proves".
 */
/**
 * Mapeja el nom de prova del PDF a una clau de cerca per la BD.
 * PDF: "60m Hombres AL U10M", "400m Mujeres U10F", "Longitud Mujeres U16F"
 * BD:  "60 mll", "400 mll", "Llargada", "Alçada", "Pes", "Vortex"...
 */
function mapProvaToClau(nomPDF) {
  // Normalitzem: minúscules, eliminem punts/apòstrofs, "60m" → "60 ", "1.000" → "1000"
  let n = nomPDF.toLowerCase().replace(/[.\']/g, "")
  n = n.replace(/(\d+)\s*m/g, "$1 ")   // "120m" → "120 ", "60m " → "60 "
  n = n.replace(/(\d)[,](\d{3})/g, "$1$2") // "1,000" → "1000"
  n = n.replace(/\s+/g, " ").trim()

  // Tanques / PC (comprovar ABANS dels llisos)
  const esTanques = n.includes("valla") || n.includes("tanq") || n.includes(" pc ")
  if (esTanques && /\b50\b/.test(n))  return "50 mt"
  if (esTanques && /\b60\b/.test(n))  return "60 mt"
  if (esTanques && /\b80\b/.test(n))  return "80 mt"
  if (esTanques && /\b100\b/.test(n)) return "100 mt"
  if (esTanques && /\b110\b/.test(n)) return "110 mt"
  if (esTanques && /\b120\b/.test(n)) return "120 mt"
  if (n.includes("obst"))               return "obst"

  // Llisos
  if (/\b50\b/.test(n))   return "50 mll"
  if (/\b60\b/.test(n))   return "60 mll"
  if (/\b80\b/.test(n))   return "80 mll"
  if (/\b100\b/.test(n))  return "100 mll"
  if (/\b120\b/.test(n))  return "120 mll"
  if (/\b150\b/.test(n))  return "150 mll"
  if (/\b200\b/.test(n))  return "200 mll"
  if (/\b300\b/.test(n))  return "300 mll"
  if (/\b400\b/.test(n))  return "400 mll"
  if (/\b500\b/.test(n))  return "500 mll"
  if (/\b600\b/.test(n))  return "600 mll"
  if (/\b800\b/.test(n))  return "800 mll"
  if (/\b1000\b/.test(n)) return "1000 mll"
  if (/\b1500\b/.test(n)) return "1500 mll"
  if (/\b2000\b/.test(n)) return "2000 mll"
  if (/\b3000\b/.test(n)) return "3000 mll"
  if (/\b5000\b/.test(n)) return "5000 mll"

  // Salts
  if (n.includes("longitud")) return "llargada"
  if (n.includes("altura"))   return "alçada"
  if (n.includes("triple"))   return "triple"
  if (n.includes("pértiga") || n.includes("perxa")) return "perxa"

  // Llançaments
  if (n.includes("jabalina")) return "javelina"
  if (/\bpeso\b/.test(n))   return "pes"
  if (n.includes("disco"))    return "disc"
  if (n.includes("martillo")) return "martell"
  if (n.includes("vortex") || n.includes("pilota")) return "vortex"
  if (n.includes("relevo") || n.includes("relleu"))  return "relleu"

  return nomPDF
}

function cercarProvaDB(nomPDF, provesData) {
  const clau = normalitzarNom(mapProvaToClau(nomPDF))
  let trobada = provesData.find(p => normalitzarNom(p.nom) === clau)
  if (trobada) return trobada
  trobada = provesData.find(p => {
    const nomDB = normalitzarNom(p.nom)
    return nomDB.includes(clau) || clau.includes(nomDB)
  })
  return trobada ?? null
}


// ─── COMPONENT PRINCIPAL ────────────────────────────────────────────────────

export default function ImportarResultatsPDF({ eventId }) {
  const { filtraCat, esAdmin, categories: catUsuari } = useUser()
  const [fase, setFase] = useState("upload") // upload | analitzant | preview | guardant | fet
  const [proves, setProves] = useState([])       // proves detectades del PDF
  const [matchedRows, setMatchedRows] = useState([]) // { provaKey, provaNom, atletaId, atletaNom, marca, seleccionat }
  const [atletes, setAtletes] = useState([])
  const [provesDB, setProvesDB] = useState([])
  const [error, setError] = useState(null)
  const [provesObertes, setProvesObertes] = useState({})
  const [comptGuardat, setComptGuardat] = useState(0)
  const [eventSeleccionat, setEventSeleccionat] = useState(null)
  const [events, setEvents] = useState([])
  const fileRef = useRef()

  const processarPDF = useCallback(async (text) => {
    setFase("analitzant")
    setError(null)

    try {
      // Carregar atletes i proves de Firestore
      const [atletesSnap, provesSnap, eventsSnap] = await Promise.all([
        getDocs(query(collection(db, "athletes"), where("actiu", "!=", false))),
        getDocs(collection(db, "proves")),
        getDocs(query(collection(db, "events"), orderBy("date", "desc"))),
      ])
      const atletesAll = atletesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const atletesData = filtraCat(atletesAll, "categoria")
      const provesData = provesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const eventsData = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAtletes(atletesData)
      setProvesDB(provesData)
      setEvents(eventsData)

      // Parsejar PDF
      const provesDetectades = parsearPDF(text)
      setProves(provesDetectades)

      // Fer matching atletes
      const rows = []
      for (const prova of provesDetectades) {
        const provaDB = cercarProvaDB(prova.prova, provesData)

        for (const r of prova.resultats) {
          const atletaTrobat = atletesData.find(a => nomCoincideix(r.nom, a.nom))
          if (atletaTrobat) {
            rows.push({
              id: `${prova.prova}_${r.nom}`,
              provaPDF: prova.prova,
              provaNomMapat: mapProvaToClau(prova.prova),
              provaId: provaDB?.id ?? null,
              provaNom: provaDB?.nom ?? prova.prova,
              atletaId: atletaTrobat.id,
              atletaNom: atletaTrobat.nom,
              nomPDF: r.nom,
              marca: r.marca,
              data: prova.data,
              seleccionat: true,
            })
          }
        }
      }

      setMatchedRows(rows)
      // Obrir totes les proves per defecte
      const obertes = {}
      for (const r of rows) { obertes[r.provaPDF] = true }
      setProvesObertes(obertes)
      setFase("preview")

    } catch (e) {
      console.error(e)
      setError("Error processant el PDF: " + e.message)
      setFase("upload")
    }
  }, [])

  const onFile = async (file) => {
    if (!file || file.type !== "application/pdf") {
      setError("Selecciona un fitxer PDF vàlid.")
      return
    }
    setFase("analitzant")
    setError(null)
    try {
      // ── 1. Carregar pdf.js des de CDN ──────────────────────────────
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script")
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs"
          s.type = "module"
          // pdf.js com a mòdul ES no s'exposa fàcilment a window
          // Usem la versió legacy (UMD) que sí ho fa
          s.remove()
          const s2 = document.createElement("script")
          s2.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
          s2.onload = resolve
          s2.onerror = reject
          document.head.appendChild(s2)
        })
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
      }

      // ── 2. Llegir PDF com ArrayBuffer ──────────────────────────────
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise

      // ── 3. Extreure text de totes les pàgines ─────────────────────
      let textComplet = ""
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i)
        const content = await page.getTextContent()
        // Reconstruïm el text preservant posicions (simulem layout)
        // Agrupem items per y-position per reconstruir línies
        const items = content.items
        if (!items.length) { textComplet += "\f"; continue }

        // Ordenar per y descendent (pdf coordenades invertes), x ascendent
        const sorted = [...items].sort((a, b) => {
          const dy = b.transform[5] - a.transform[5]
          return Math.abs(dy) > 3 ? dy : a.transform[4] - b.transform[4]
        })

        // Agrupar en línies (items amb y similar = mateixa línia)
        const linies = []
        let linieActual = []
        let yActual = null
        for (const item of sorted) {
          const y = item.transform[5]
          if (yActual === null || Math.abs(y - yActual) > 3) {
            if (linieActual.length) linies.push(linieActual)
            linieActual = [item]
            yActual = y
          } else {
            linieActual.push(item)
          }
        }
        if (linieActual.length) linies.push(linieActual)

        // Convertir a text
        for (const linia of linies) {
          textComplet += linia.map(i => i.str).join(" ").trim() + "\n"
        }
        textComplet += "\f" // separador de pàgina
      }

      // ── 4. Parsejar i fer matching ─────────────────────────────────
      const provesDetectades = parsearPDF(textComplet)

      const [atletesSnap, provesSnap, eventsSnap2] = await Promise.all([
        getDocs(collection(db, "athletes")),
        getDocs(collection(db, "proves")),
        getDocs(query(collection(db, "events"), orderBy("date", "desc"))),
      ])
      const atletesAll2 = atletesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const atletesData = filtraCat(atletesAll2, "categoria")
      const provesData  = provesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const eventsData2 = eventsSnap2.docs.map(d => ({ id: d.id, ...d.data() }))
      setAtletes(atletesData)
      setProvesDB(provesData)
      setEvents(eventsData2)
      setProves(provesDetectades)

      const rows = []
      for (const prova of provesDetectades) {
        const provaDB = cercarProvaDB(prova.prova, provesData)
        for (const r of prova.resultats) {
          const atletaTrobat = atletesData.find(a => nomCoincideix(r.nom, a.nom))
          if (!atletaTrobat) {
          }
          if (atletaTrobat) {
            rows.push({
              id: `${prova.prova}_${r.nom}`,
              provaPDF: prova.prova,
              provaNomMapat: mapProvaToClau(prova.prova),
              provaId: provaDB?.id ?? null,
              provaNom: provaDB?.nom ?? prova.prova,
              atletaId: atletaTrobat.id,
              atletaNom: atletaTrobat.nom,
              nomPDF: r.nom,
              marca: r.marca,
              data: prova.data,
              seleccionat: true,
            })
          }
        }
      }

      setMatchedRows(rows)
      const obertes = {}
      for (const r of rows) { obertes[r.provaPDF] = true }
      setProvesObertes(obertes)
      setFase("preview")

    } catch (e) {
      console.error(e)
      setError("Error processant el PDF: " + e.message)
      setFase("upload")
    }
  }

  const toggleRow = (id) => {
    setMatchedRows(prev => prev.map(r => r.id === id ? { ...r, seleccionat: !r.seleccionat } : r))
  }

  const toggleProva = (provaPDF) => {
    const totsSeleccionats = matchedRows.filter(r => r.provaPDF === provaPDF).every(r => r.seleccionat)
    setMatchedRows(prev => prev.map(r =>
      r.provaPDF === provaPDF ? { ...r, seleccionat: !totsSeleccionats } : r
    ))
  }

  const guardar = async () => {
    setFase("guardant")
    const aGuardar = matchedRows.filter(r => r.seleccionat)
    let guardats = 0
    for (const r of aGuardar) {
      try {
        // Parsejar data DD/MM/YYYY
        let dataObj = new Date()
        if (r.data) {
          const [d, m, y] = r.data.split("/")
          dataObj = new Date(y, m - 1, d)
        }
        await addDoc(collection(db, "marques"), {
          atletaId: r.atletaId,
          provaId: r.provaId,
          eventId: eventSeleccionat ?? null,
          marca: r.marca,
          data: Timestamp.fromDate(dataObj),
          font: "pdf_import",
          createdAt: Timestamp.now(),
        })
        guardats++
        setComptGuardat(guardats)
      } catch (e) {
        console.error("Error guardant marca:", e)
      }
    }
    setFase("fet")
  }

  // Agrupar rows per prova per mostrar-les
  const rowsPerProva = {}
  for (const r of matchedRows) {
    if (!rowsPerProva[r.provaPDF]) rowsPerProva[r.provaPDF] = []
    rowsPerProva[r.provaPDF].push(r)
  }

  const totalSeleccionats = matchedRows.filter(r => r.seleccionat).length

  // ── RENDER ────────────────────────────────────────────────────────────────

  if (fase === "upload") return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/10 p-3">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-black">Importar resultats PDF</h2>
          <p className="text-sm text-muted-foreground">Penja un PDF de resultats i importa les marques dels teus atletes</p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div
        className="rounded-2xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors cursor-pointer bg-muted/20 hover:bg-primary/5"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}
      >
        <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
          <div className="rounded-2xl bg-primary/10 p-5">
            <Upload className="h-10 w-10 text-primary" />
          </div>
          <div>
            <p className="font-bold text-lg">Arrossega el PDF aquí</p>
            <p className="text-sm text-muted-foreground mt-1">o fes clic per seleccionar-lo</p>
          </div>
          <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5">
            Format Conersys Sports Solutions compatible
          </p>
        </div>
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => onFile(e.target.files[0])} />
      </div>
    </div>
  )

  if (fase === "analitzant") return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      <p className="font-semibold text-lg">Analitzant el PDF...</p>
      <p className="text-sm text-muted-foreground">Claude està llegint els resultats i buscant els teus atletes</p>
    </div>
  )

  if (fase === "guardant") return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="h-12 w-12 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
      <p className="font-semibold text-lg">Guardant marques...</p>
      <p className="text-sm text-muted-foreground">{comptGuardat} de {totalSeleccionats} guardades</p>
    </div>
  )

  if (fase === "fet") return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="rounded-full bg-green-100 p-5">
        <CheckCircle2 className="h-12 w-12 text-green-600" />
      </div>
      <p className="font-black text-2xl">✓ Importació completada</p>
      <p className="text-muted-foreground">{comptGuardat} marques guardades correctament</p>
      <button
        onClick={() => { setFase("upload"); setMatchedRows([]); setProves([]); setComptGuardat(0) }}
        className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"
      >
        Importar un altre PDF
      </button>
    </div>
  )

  // ── PREVIEW ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black">Resultats detectats</h2>
            <p className="text-sm text-muted-foreground">
              {matchedRows.length} atletes identificats en {Object.keys(rowsPerProva).length} proves
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setFase("upload"); setMatchedRows([]); setProves([]) }}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" /> Cancel·lar
          </button>
          <button
            onClick={guardar}
            disabled={totalSeleccionats === 0}
            className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" /> Guardar {totalSeleccionats} marques
          </button>
        </div>
      </div>

      {/* Selector d'event */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/20 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-bold">Event associat</p>
          <span className="text-xs text-muted-foreground ml-1">— opcional</span>
        </div>
        <div className="p-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Opció "Sense event" */}
          <button
            onClick={() => setEventSeleccionat(null)}
            className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
              !eventSeleccionat
                ? "border-primary bg-primary/5"
                : "border-transparent bg-muted/30 hover:bg-muted/50"
            }`}
          >
            <p className={`text-sm font-semibold ${!eventSeleccionat ? "text-primary" : "text-muted-foreground"}`}>
              Sense event
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">No associar a cap event</p>
          </button>

          {/* Events */}
          {events.map(ev => {
            const seleccionat = eventSeleccionat === ev.id
            const data = ev.date?.toDate ? ev.date.toDate() : null
            return (
              <button
                key={ev.id}
                onClick={() => setEventSeleccionat(ev.id)}
                className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                  seleccionat
                    ? "border-primary bg-primary/5"
                    : "border-transparent bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <p className={`text-sm font-semibold truncate ${seleccionat ? "text-primary" : ""}`}>
                  {ev.title ?? ev.id}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  {data && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      {data.toLocaleDateString("ca-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                  {ev.lloc && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {ev.lloc}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {matchedRows.length === 0 && (
        <div className="rounded-2xl border bg-amber-50 border-amber-200 px-5 py-8 text-center">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="font-semibold text-amber-800">Cap atleta identificat</p>
          <p className="text-sm text-amber-600 mt-1">
            Cap dels noms del PDF coincideix amb els atletes donats d'alta.<br />
            Comprova que els atletes estiguin registrats al sistema.
          </p>
        </div>
      )}

      {/* Llista per proves */}
      {Object.entries(rowsPerProva).map(([provaPDF, rows]) => {
        const obert = provesObertes[provaPDF] !== false
        const seleccionats = rows.filter(r => r.seleccionat).length
        const tots = rows.length

        return (
          <div key={provaPDF} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            {/* Capçalera de prova */}
            <button
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/20 transition-colors text-left"
              onClick={() => setProvesObertes(prev => ({ ...prev, [provaPDF]: !obert }))}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={seleccionats === tots}
                  ref={el => { if (el) el.indeterminate = seleccionats > 0 && seleccionats < tots }}
                  onChange={() => toggleProva(provaPDF)}
                  onClick={e => e.stopPropagation()}
                  className="h-4 w-4 accent-primary"
                />
                <div>
                  <p className="font-bold">{rows[0].provaNom}</p>
                  <p className="text-xs text-muted-foreground">{provaPDF}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                  seleccionats === tots
                    ? "bg-green-100 text-green-700 border-green-200"
                    : seleccionats > 0
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}>
                  {seleccionats}/{tots}
                </span>
                {!rows[0].provaId && (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <span className="rounded-full bg-red-100 border border-red-200 text-red-600 text-xs px-2 py-0.5 font-semibold whitespace-nowrap">
                      ❌ No trobada
                    </span>
                    <Select
                        value=""
                        onValueChange={provaId => {
                          if (!provaId) return
                          const prova = provesDB.find(p => p.id === provaId)
                          setMatchedRows(prev => prev.map(r =>
                            r.provaPDF === provaPDF
                              ? { ...r, provaId, provaNom: prova?.nom ?? provaPDF }
                              : r
                          ))
                        }}
                      >
                        <SelectTrigger className="w-44 h-8 text-xs rounded-xl">
                          <SelectValue placeholder="Assignar prova…" />
                        </SelectTrigger>
                        <SelectContent>
                          {provesDB
                            .filter(p => {
                              if (esAdmin) return true
                              const cats = p.categories ?? []
                              return cats.length === 0 || cats.some(c => catUsuari.includes(c))
                            })
                            .slice().sort((a, b) => a.nom.localeCompare(b.nom, "ca"))
                            .map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">{p.nom}</SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                  </div>
                )}
                {obert ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {/* Files d'atletes */}
            {obert && (
              <div className="border-t divide-y">
                {rows.map(r => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-4 px-5 py-3 cursor-pointer transition-colors ${
                      r.seleccionat ? "hover:bg-muted/20" : "opacity-50 hover:opacity-70 bg-muted/10"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={r.seleccionat}
                      onChange={() => toggleRow(r.id)}
                      className="h-4 w-4 accent-primary flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{r.atletaNom}</p>
                      <p className="text-xs text-muted-foreground">PDF: {r.nomPDF}</p>
                    </div>
                    <p className="font-black text-primary text-lg leading-none flex-shrink-0">{r.marca}</p>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}