import { collection, getDocs, query, where, getDoc, doc } from "firebase/firestore"
import { db } from "../../firebaseClient"

// Lògica compartida per validar un codi d'accés de pares (codi de categoria
// o codi d'atleta individual) i deixar la sessió preparada. La fan servir
// tant el formulari manual (Landing.jsx) com l'accés directe per
// enllaç/QR (AccesPerCodi.jsx), perquè es comportin exactament igual —
// un mateix codi ha de donar el mateix resultat es tecleg o s'obri per link.
export async function entrarAmbCodi(codiInput) {
  const codi = (codiInput ?? "").trim().toUpperCase().replace(/\s+/g, "")
  if (!codi) return { ok: false, reason: "empty" }

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
        return { ok: true, tipus: "categoria", categoria }
      }
    }

    // 2. Codi d'atleta individual — codisAcces (nou, array) o codiPublic (vell)
    const [snapNous, snapLlegat] = await Promise.all([
      getDocs(query(collection(db, "athletes"), where("codisAcces", "array-contains", codi))),
      getDocs(query(collection(db, "athletes"), where("codiPublic", "==", codi))),
    ])

    if (snapNous.empty && snapLlegat.empty) {
      return { ok: false, reason: "not_found" }
    }

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
