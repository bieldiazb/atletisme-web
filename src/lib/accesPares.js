import { collection, getDocs, query, where, getDoc, doc } from "firebase/firestore"
import { db } from "../../firebaseClient"

// ── Límit d'intents ─────────────────────────────────────────────────────────
// Després de MAX_FALLITS codis no trobats seguits, es bloqueja el formulari un
// temps creixent (1, 5, 15, 60 min). Es guarda al navegador (localStorage):
// frena qui prova codis a mà o amb enllaços /acces/XXXX, però no és una
// protecció de servidor contra un script que ignori el navegador. Els codis
// són de 6 caràcters aleatoris, que ja fa molt difícil encertar-ne un.
const CLAU_INTENTS = "paresIntents"
const MAX_FALLITS = 5
const BLOQUEJOS_MIN = [1, 5, 15, 60]

function llegeixIntents() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAU_INTENTS) ?? "{}")
    return { fallits: Number(d.fallits) || 0, bloquejos: Number(d.bloquejos) || 0, finsA: Number(d.finsA) || 0 }
  } catch {
    return { fallits: 0, bloquejos: 0, finsA: 0 }
  }
}

function desaIntents(d) {
  try { localStorage.setItem(CLAU_INTENTS, JSON.stringify(d)) } catch { /* sense emmagatzematge: sense límit */ }
}

// Segons que queden de bloqueig (0 = lliure).
export function segonsBloqueig() {
  const { finsA } = llegeixIntents()
  return Math.max(0, Math.ceil((finsA - Date.now()) / 1000))
}

function registraFallada() {
  const d = llegeixIntents()
  d.fallits += 1
  if (d.fallits >= MAX_FALLITS) {
    const min = BLOQUEJOS_MIN[Math.min(d.bloquejos, BLOQUEJOS_MIN.length - 1)]
    d.bloquejos += 1
    d.fallits = 0
    d.finsA = Date.now() + min * 60_000
  }
  desaIntents(d)
}

function registraEncert() {
  desaIntents({ fallits: 0, bloquejos: 0, finsA: 0 })
}

// Lògica compartida per validar un codi d'accés de pares (codi de categoria
// o codi d'atleta individual) i deixar la sessió preparada. La fan servir
// tant el formulari manual (Landing.jsx) com l'accés directe per
// enllaç/QR (AccesPerCodi.jsx), perquè es comportin exactament igual —
// un mateix codi ha de donar el mateix resultat es tecleg o s'obri per link.
export async function entrarAmbCodi(codiInput) {
  const codi = (codiInput ?? "").trim().toUpperCase().replace(/\s+/g, "")
  if (!codi) return { ok: false, reason: "empty" }
  if (segonsBloqueig() > 0) return { ok: false, reason: "bloquejat", segons: segonsBloqueig() }

  try {
    // 1. Codi de categoria (config/codisAcces)
    const configSnap = await getDoc(doc(db, "config", "codisAcces"))
    if (configSnap.exists()) {
      const codisCategoria = configSnap.data()
      const categoriaEntry = Object.entries(codisCategoria).find(
        ([, c]) => c?.toUpperCase() === codi
      )
      if (categoriaEntry) {
        const [categoria] = categoriaEntry
        sessionStorage.setItem("paresCategoria", categoria)
        sessionStorage.removeItem("athleteCode")
        registraEncert()
        return { ok: true, tipus: "categoria", categoria }
      }
    }

    // 2. Codi d'atleta individual — codisAcces (nou, array) o codiPublic (vell)
    const [snapNous, snapLlegat] = await Promise.all([
      getDocs(query(collection(db, "athletes"), where("codisAcces", "array-contains", codi))),
      getDocs(query(collection(db, "athletes"), where("codiPublic", "==", codi))),
    ])

    if (snapNous.empty && snapLlegat.empty) {
      registraFallada()
      const segons = segonsBloqueig()
      return segons > 0 ? { ok: false, reason: "bloquejat", segons } : { ok: false, reason: "not_found" }
    }

    registraEncert()
    localStorage.setItem("athleteCode", codi)
    sessionStorage.removeItem("paresCategoria")
    return { ok: true, tipus: "atleta" }
  } catch {
    return { ok: false, reason: "error" }
  }
}

// URL d'accés directe per a un codi — la mateixa que genera el QR, per
// mantenir-ho en un sol lloc.
export function urlAcces(codi) {
  return `${window.location.origin}/acces/${codi}`
}
