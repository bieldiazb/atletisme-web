import { httpsCallable } from "firebase/functions"
import { functions } from "../../firebaseClient"

// ─────────────────────────────────────────────────────────────────────────
// INSCRIPCIONS A COMPETICIONS
// Els pares diuen des del Calendari si el seu fill/a va a cada competició.
// Les inscripcions es tanquen per defecte el DIVENDRES DE LA SETMANA
// ANTERIOR a la competició (competició dissabte 17 → tanca divendres 9 a
// les 23:59), i en tancar-se s'envien totes per correu (Cloud Function
// programada, vegeu functions/index.js). L'admin pot canviar la data límit
// d'un event concret des de Calendari → Editar.
//
// IMPORTANT: aquesta mateixa lògica de dates està duplicada a
// functions/index.js (el servidor no pot importar d'aquí). Si es canvia
// la regla, s'ha de canviar als dos llocs.
// ─────────────────────────────────────────────────────────────────────────

const TZ = "Europe/Madrid"
const DIES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function partsMadrid(date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, wd: DIES.indexOf(p.weekday) + 1 }
}

function offsetMinutsMadrid(date) {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT"
  const m = s.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return 0
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

// Instant de les 00:00 (hora de Barcelona) del dia y-m-d.
function mitjanitMadrid(y, m, d) {
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offsetMinutsMadrid(new Date(guess)) * 60000
  const off2 = offsetMinutsMadrid(new Date(t))
  t = guess - off2 * 60000
  return new Date(t)
}

// Data límit per defecte: final del divendres de la setmana anterior.
// Es retorna com l'instant en què es TANCA (dissabte a les 00:00).
export function tancamentPerDefecte(dataEvent) {
  const { y, m, d, wd } = partsMadrid(dataEvent)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() - (wd + 2) + 1) // divendres anterior + 1 dia
  return mitjanitMadrid(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate())
}

// Accepta el document de l'event (amb Timestamps de Firestore).
export function tancamentDe(event) {
  const override = event?.tancamentInscripcions?.toDate?.()
  if (override) return override
  const data = event?.date?.toDate?.()
  return data ? tancamentPerDefecte(data) : null
}

// Les inscripcions estan actives per defecte (també als events antics que
// no tenen el camp).
export function inscripcionsActives(event) {
  return event?.inscripcionsActives !== false
}

export function inscripcionsObertes(event, ara = new Date()) {
  if (!inscripcionsActives(event)) return false
  const t = tancamentDe(event)
  return !!t && ara < t
}

// Últim dia en què encara es pot apuntar (el dia abans de l'instant de tancament).
export function ultimDiaInscripcio(tancament) {
  return new Date(tancament.getTime() - 1)
}

// L'admin tria "últim dia per apuntar-se" → es desa l'instant de tancament
// (l'endemà a les 00:00).
export function tancamentDesDeUltimDia(dia) {
  return mitjanitMadrid(dia.getFullYear(), dia.getMonth() + 1, dia.getDate() + 1)
}

export function formatDiaLimit(tancament) {
  return ultimDiaInscripcio(tancament).toLocaleDateString("ca-ES", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long",
  })
}

// ─── Crides a les Cloud Functions (els pares no estan autenticats) ──────
export async function carregarInscripcionsPares(codi) {
  const fn = httpsCallable(functions, "getInscripcionsPares")
  const res = await fn({ codi })
  return res.data?.inscripcions ?? []
}

export async function desarInscripcioPares({ codi, eventId, athleteId, va, proves = [] }) {
  const fn = httpsCallable(functions, "setInscripcioPares")
  await fn({ codi, eventId, athleteId, va, proves })
}

export async function enviarInscripcionsAra(eventId) {
  const fn = httpsCallable(functions, "enviarInscripcionsAra")
  const res = await fn({ eventId })
  return res.data
}
