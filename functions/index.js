const { setGlobalOptions } = require("firebase-functions/v2")
const { onCall, HttpsError } = require("firebase-functions/v2/https")
const { onSchedule } = require("firebase-functions/v2/scheduler")
const { defineSecret } = require("firebase-functions/params")
const admin = require("firebase-admin")
const nodemailer = require("nodemailer")

admin.initializeApp()

setGlobalOptions({ maxInstances: 10 })

/* ─────────────────────────────────────────────
   HELPERS DE SEGURETAT
   Totes les accions sensibles (Firebase Auth) passen per aquí.
   ───────────────────────────────────────────── */

async function getCallerDoc(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Cal estar autenticat")
  const snap = await admin.firestore().collection("admins").doc(request.auth.uid).get()
  return snap.exists ? snap.data() : null
}

async function assertAdmin(request) {
  const dades = await getCallerDoc(request)
  if (!dades || dades.rol !== "admin") {
    throw new HttpsError("permission-denied", "Cal ser admin per fer aquesta acció")
  }
}

async function assertStaff(request) {
  const dades = await getCallerDoc(request)
  if (!dades) throw new HttpsError("permission-denied", "Cal ser admin o entrenador")
  return dades
}

async function assertDeveloper(request) {
  const dades = await getCallerDoc(request)
  if (!dades || !dades.isDeveloper) {
    throw new HttpsError("permission-denied", "Cal ser developer per fer aquesta acció")
  }
}

/* ─────────────────────────────────────────────
   AUDITORIA
   Registre de qui ha fet què amb les accions sensibles (Firebase Auth),
   incloent els intents denegats — així queda constància si algú prova
   d'usar una funció sense els permisos necessaris. Es guarda a la
   col·lecció "audit_logs"; un error desant el log mai bloqueja l'acció
   real (només queda escrit als logs de la Function).
   ───────────────────────────────────────────── */

async function logAudit(request, action, { ok, target = null, extra = {} } = {}) {
  try {
    await admin.firestore().collection("audit_logs").add({
      action,
      ok: !!ok,
      actorUid: request.auth?.uid ?? null,
      target,
      extra,
      at: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (e) {
    console.error("No s'ha pogut desar el log d'auditoria", e)
  }
}

/* ─────────────────────────────────────────────
   GESTIÓ D'USUARIS ADMIN / ENTRENADOR
   ───────────────────────────────────────────── */

exports.createAdminUser = onCall(async (request) => {
  try {
    await assertAdmin(request)
  } catch (err) {
    await logAudit(request, "createAdminUser", { ok: false, extra: { reason: err.message } })
    throw err
  }

  const { email, password, rol, categories, nom } = request.data

  if (!email || !password) {
    throw new HttpsError("invalid-argument", "Email i contrasenya obligatoris")
  }

  try {
    const user = await admin.auth().createUser({ email, password })

    await admin.firestore().collection("admins").doc(user.uid).set({
      nom:        nom ?? email.split("@")[0],
      email,
      rol:        rol ?? "admin",
      categories: rol === "admin" ? [] : (categories ?? []),
      createdAt:  admin.firestore.FieldValue.serverTimestamp(),
    })

    // Mai es desa la contrasenya al log — només qui s'ha creat i amb quin rol.
    await logAudit(request, "createAdminUser", { ok: true, target: user.uid, extra: { email, rol: rol ?? "admin" } })
    return { uid: user.uid }
  } catch (error) {
    console.error(error)
    await logAudit(request, "createAdminUser", { ok: false, extra: { email, error: error.message } })
    throw new HttpsError("internal", error.message ?? "Error creant usuari")
  }
})

// Elimina un usuari admin/entrenador tant de Firebase Auth com de Firestore
// (abans "Eliminar" només esborrava el document de Firestore i la persona es
// quedava amb el compte d'accés viu a Firebase Auth).
exports.deleteAdminUser = onCall(async (request) => {
  try {
    await assertAdmin(request)
  } catch (err) {
    await logAudit(request, "deleteAdminUser", { ok: false, extra: { reason: err.message } })
    throw err
  }

  const { uid } = request.data
  if (!uid) throw new HttpsError("invalid-argument", "Falta l'uid")
  if (uid === request.auth.uid) {
    await logAudit(request, "deleteAdminUser", { ok: false, target: uid, extra: { reason: "auto-eliminació" } })
    throw new HttpsError("failed-precondition", "No et pots eliminar a tu mateix")
  }

  // Un developer només el pot eliminar un altre developer.
  const objectiu = await admin.firestore().collection("admins").doc(uid).get()
  const caller = await getCallerDoc(request)
  if (objectiu.exists && objectiu.data().isDeveloper && !caller?.isDeveloper) {
    await logAudit(request, "deleteAdminUser", { ok: false, target: uid, extra: { reason: "objectiu developer" } })
    throw new HttpsError("permission-denied", "Només un developer pot eliminar un developer")
  }

  try {
    await admin.auth().deleteUser(uid).catch((err) => {
      if (err.code !== "auth/user-not-found") throw err
    })
    await admin.firestore().collection("admins").doc(uid).delete()
    await logAudit(request, "deleteAdminUser", { ok: true, target: uid })
    return { ok: true }
  } catch (error) {
    console.error(error)
    await logAudit(request, "deleteAdminUser", { ok: false, target: uid, extra: { error: error.message } })
    throw new HttpsError("internal", error.message ?? "Error eliminant usuari")
  }
})

// Activa/desactiva l'accés d'un usuari a Firebase Auth (bloqueig immediat,
// no cal esperar que torni a carregar la pàgina). Reservat a developers.
exports.setUserDisabled = onCall(async (request) => {
  try {
    await assertDeveloper(request)
  } catch (err) {
    await logAudit(request, "setUserDisabled", { ok: false, extra: { reason: err.message } })
    throw err
  }

  const { uid, disabled } = request.data
  if (!uid || typeof disabled !== "boolean") {
    throw new HttpsError("invalid-argument", "Falten dades (uid, disabled)")
  }
  if (uid === request.auth.uid) {
    await logAudit(request, "setUserDisabled", { ok: false, target: uid, extra: { reason: "auto-desactivació" } })
    throw new HttpsError("failed-precondition", "No et pots desactivar a tu mateix")
  }

  try {
    await admin.auth().updateUser(uid, { disabled })
    await admin.firestore().collection("admins").doc(uid).set({ disabled }, { merge: true })
    await logAudit(request, "setUserDisabled", { ok: true, target: uid, extra: { disabled } })
    return { ok: true }
  } catch (error) {
    console.error(error)
    await logAudit(request, "setUserDisabled", { ok: false, target: uid, extra: { error: error.message } })
    throw new HttpsError("internal", error.message ?? "Error actualitzant l'usuari")
  }
})

// Canvia l'email d'inici de sessió (Firebase Auth) d'un usuari i el sincronitza
// amb el seu document a Firestore. Reservat a developers.
exports.updateUserEmail = onCall(async (request) => {
  try {
    await assertDeveloper(request)
  } catch (err) {
    await logAudit(request, "updateUserEmail", { ok: false, extra: { reason: err.message } })
    throw err
  }

  const { uid, newEmail } = request.data
  if (!uid || !newEmail) {
    throw new HttpsError("invalid-argument", "Falten dades (uid, newEmail)")
  }

  try {
    await admin.auth().updateUser(uid, { email: newEmail })
    await admin.firestore().collection("admins").doc(uid).set({ email: newEmail }, { merge: true })
    await logAudit(request, "updateUserEmail", { ok: true, target: uid, extra: { newEmail } })
    return { ok: true }
  } catch (error) {
    console.error(error)
    await logAudit(request, "updateUserEmail", { ok: false, target: uid, extra: { newEmail, error: error.message } })
    throw new HttpsError("internal", error.message ?? "Error canviant l'email")
  }
})

// Concedeix o revoca el rol de developer (per sobre d'admin). Si encara no hi
// ha cap developer configurat al club, permet que un admin s'auto-concedeixi
// el rol un únic cop, perquè algú l'ha de poder activar la primera vegada.
exports.setDeveloperStatus = onCall(async (request) => {
  const { uid, isDeveloper } = request.data
  if (!uid || typeof isDeveloper !== "boolean") {
    throw new HttpsError("invalid-argument", "Falten dades (uid, isDeveloper)")
  }

  const callerDades = await getCallerDoc(request)
  if (!callerDades) {
    await logAudit(request, "setDeveloperStatus", { ok: false, target: uid, extra: { reason: "sense perfil d'admin" } })
    throw new HttpsError("permission-denied", "No tens perfil d'administrador")
  }

  const esArrencada = uid === request.auth.uid && isDeveloper === true

  if (!callerDades.isDeveloper) {
    if (!esArrencada) {
      await logAudit(request, "setDeveloperStatus", { ok: false, target: uid, extra: { reason: "no és developer" } })
      throw new HttpsError("permission-denied", "Cal ser developer per fer aquesta acció")
    }
    const existents = await admin.firestore()
      .collection("admins")
      .where("isDeveloper", "==", true)
      .limit(1)
      .get()
    if (!existents.empty) {
      await logAudit(request, "setDeveloperStatus", { ok: false, target: uid, extra: { reason: "ja hi ha developer" } })
      throw new HttpsError("permission-denied", "Ja hi ha un developer configurat — demana-li que t'hi afegeixi")
    }
  }

  if (uid === request.auth.uid && isDeveloper === false) {
    await logAudit(request, "setDeveloperStatus", { ok: false, target: uid, extra: { reason: "auto-revocació" } })
    throw new HttpsError("failed-precondition", "No et pots treure el rol de developer a tu mateix")
  }

  try {
    await admin.firestore().collection("admins").doc(uid).set({ isDeveloper }, { merge: true })
    await logAudit(request, "setDeveloperStatus", { ok: true, target: uid, extra: { isDeveloper, arrencada: esArrencada } })
    return { ok: true }
  } catch (error) {
    console.error(error)
    await logAudit(request, "setDeveloperStatus", { ok: false, target: uid, extra: { error: error.message } })
    throw new HttpsError("internal", error.message ?? "Error actualitzant el rol de developer")
  }
})


/* ─────────────────────────────────────────────
   INSCRIPCIONS A COMPETICIONS
   Els pares (sense Firebase Auth, entren amb el codi d'accés de l'atleta)
   diuen des del Calendari si el seu fill/a va a cada competició. Ho fan
   via aquestes Cloud Functions, que validen el codi al servidor — mai
   escriuen directament a Firestore.

   Col·lecció "inscripcions", id = `${eventId}_${athleteId}`:
     { eventId, athleteId, nom, categoria, va: boolean, origen, actualitzat }

   Tancament: per defecte el divendres de la setmana anterior a la
   competició (a les 23:59, hora de Barcelona). L'admin el pot canviar per
   event (events/{id}.tancamentInscripcions). Quan es tanca, la funció
   programada envia totes les inscripcions per correu als destinataris de
   config_privada/inscripcions.emails.

   Correu: SMTP de Gmail amb una contrasenya d'aplicació, guardada com a
   secret de Firebase (mai al codi):
     firebase functions:secrets:set SMTP_USER   (ex: elclub@gmail.com)
     firebase functions:secrets:set SMTP_PASS   (contrasenya d'aplicació)
   ───────────────────────────────────────────── */

const SMTP_USER = defineSecret("SMTP_USER")
const SMTP_PASS = defineSecret("SMTP_PASS")
const TZ = "Europe/Madrid"

// ── Dates (la mateixa lògica que src/lib/inscripcions.js — mantenir iguals)
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
function mitjanitMadrid(y, m, d) {
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offsetMinutsMadrid(new Date(guess)) * 60000
  t = guess - offsetMinutsMadrid(new Date(t)) * 60000
  return new Date(t)
}
function tancamentPerDefecte(dataEvent) {
  const { y, m, d, wd } = partsMadrid(dataEvent)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() - (wd + 2) + 1)
  return mitjanitMadrid(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate())
}
function tancamentDe(ev) {
  const override = ev.tancamentInscripcions?.toDate?.()
  if (override) return override
  const data = ev.date?.toDate?.()
  return data ? tancamentPerDefecte(data) : null
}
function formatData(date, opts = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) {
  return date.toLocaleDateString("ca-ES", { timeZone: TZ, ...opts })
}

function normalitzaCodi(codi) {
  return String(codi ?? "").trim().toUpperCase().replace(/\s+/g, "")
}

// Atletes als quals dona accés un codi de pares (codisAcces nou o codiPublic vell).
async function atletesDelCodi(codiInput) {
  const codi = normalitzaCodi(codiInput)
  if (!codi) throw new HttpsError("invalid-argument", "Falta el codi d'accés")
  const db = admin.firestore()
  const [snapNous, snapLlegat] = await Promise.all([
    db.collection("athletes").where("codisAcces", "array-contains", codi).get(),
    db.collection("athletes").where("codiPublic", "==", codi).get(),
  ])
  const trobats = new Map()
  snapNous.docs.forEach((d) => trobats.set(d.id, { id: d.id, ...d.data() }))
  snapLlegat.docs.forEach((d) => trobats.set(d.id, { id: d.id, ...d.data() }))
  const atletes = Array.from(trobats.values())
  if (atletes.length === 0) throw new HttpsError("permission-denied", "Codi d'accés no vàlid")
  return atletes
}

// Proves de l'event per categoria/sexe (mateixa lògica que src/lib/provesEvent.js)
function provesIdsDe(ev, categoria, sexe) {
  if (!categoria || !sexe) return []
  return ev?.provesPerCategoria?.[categoria]?.[sexe] ?? []
}
function maxProvesDe(ev, categoria) {
  const m = Number(ev?.provesPerCategoria?.[categoria]?.max)
  return Number.isFinite(m) && m > 0 ? m : null
}
function calTriarProves(ev, categoria, sexe) {
  return provesIdsDe(ev, categoria, sexe).length > 0
}
function provesEfectives(ev, categoria, sexe, triades) {
  const totes = provesIdsDe(ev, categoria, sexe)
  if (!calTriarProves(ev, categoria, sexe)) return totes
  if (totes.length === 1) return totes // una sola opció (distància de cros): res a triar
  return (triades ?? []).filter((id) => totes.includes(id))
}

function eventAdmetAtleta(ev, atleta) {
  const cats = ev.categories ?? []
  return cats.length === 0 || cats.includes(atleta.categoria)
}

// Pares: estat de les inscripcions de tots els fills del codi.
exports.getInscripcionsPares = onCall(async (request) => {
  const atletes = await atletesDelCodi(request.data?.codi)
  const ids = atletes.map((a) => a.id).slice(0, 30) // límit de "in"
  const snap = await admin.firestore().collection("inscripcions").where("athleteId", "in", ids).get()
  return {
    inscripcions: snap.docs.map((d) => {
      const x = d.data()
      return { eventId: x.eventId, athleteId: x.athleteId, va: x.va === true, proves: x.proves ?? [] }
    }),
  }
})

// Pares: apuntar / desapuntar un fill d'una competició.
exports.setInscripcioPares = onCall(async (request) => {
  const { codi, eventId, athleteId, va, proves } = request.data ?? {}
  if (!eventId || !athleteId || typeof va !== "boolean") {
    throw new HttpsError("invalid-argument", "Falten dades (eventId, athleteId, va)")
  }

  const atletes = await atletesDelCodi(codi)
  const atleta = atletes.find((a) => a.id === athleteId)
  if (!atleta) throw new HttpsError("permission-denied", "Aquest codi no dona accés a aquest atleta")

  const db = admin.firestore()
  const evSnap = await db.collection("events").doc(eventId).get()
  if (!evSnap.exists) throw new HttpsError("not-found", "La competició no existeix")
  const ev = evSnap.data()

  if (ev.inscripcionsActives === false) {
    throw new HttpsError("failed-precondition", "Aquesta competició no té inscripcions")
  }
  if (!eventAdmetAtleta(ev, atleta)) {
    throw new HttpsError("failed-precondition", "Aquesta competició no és de la categoria de l'atleta")
  }
  const tancament = tancamentDe(ev)
  if (!tancament || new Date() >= tancament) {
    throw new HttpsError("failed-precondition", "Les inscripcions d'aquesta competició ja estan tancades")
  }

  // Proves triades pels pares (si la competició en té per a la seva categoria/sexe):
  // han de ser de les de l'event per a la seva categoria/sexe i no passar del màxim.
  let provesTriades = []
  if (va && !calTriarProves(ev, atleta.categoria, atleta.sexe)) {
    throw new HttpsError("failed-precondition", "Aquesta competició encara no té proves per a la seva categoria")
  }
  if (va) {
    const permeses = provesIdsDe(ev, atleta.categoria, atleta.sexe)
    provesTriades = permeses.length === 1
      ? [...permeses]
      : [...new Set(Array.isArray(proves) ? proves : [])].filter((id) => permeses.includes(id))
    const max = maxProvesDe(ev, atleta.categoria)
    if (provesTriades.length === 0) {
      throw new HttpsError("failed-precondition", "Cal triar almenys una prova")
    }
    if (max && provesTriades.length > max) {
      throw new HttpsError("failed-precondition", `Com a màxim es poden triar ${max} proves`)
    }
  }

  await db.collection("inscripcions").doc(`${eventId}_${athleteId}`).set({
    eventId,
    athleteId,
    nom: atleta.nom ?? "",
    categoria: atleta.categoria ?? null,
    va,
    proves: provesTriades,
    origen: "pares",
    actualitzat: admin.firestore.FieldValue.serverTimestamp(),
  })
  return { ok: true }
})

// ── Enviament per correu ────────────────────────────────────────────────

function escapaHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
}
function csvCell(t) {
  const s = String(t ?? "")
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function destinatarisInscripcions() {
  const snap = await admin.firestore().collection("config_privada").doc("inscripcions").get()
  const raw = snap.exists ? (snap.data().emails ?? "") : ""
  return raw.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"))
}

// Envia el correu d'un event i el marca com a enviat. `forcar`: envia
// encara que no hi hagi cap inscrit (enviament manual des de l'admin).
async function enviarInscripcionsEvent(eventId, { forcar = false } = {}) {
  const db = admin.firestore()
  const evRef = db.collection("events").doc(eventId)
  const evSnap = await evRef.get()
  if (!evSnap.exists) throw new Error("Event no trobat")
  const ev = evSnap.data()

  const insSnap = await db.collection("inscripcions").where("eventId", "==", eventId).get()
  const inscrits = insSnap.docs.map((d) => d.data()).filter((x) => x.va === true)

  if (inscrits.length === 0 && !forcar) {
    await evRef.update({ inscripcionsEnviadesAt: admin.firestore.FieldValue.serverTimestamp(), inscripcionsEnviadesCount: 0 })
    return { enviat: false, total: 0 }
  }

  const destinataris = await destinatarisInscripcions()
  if (destinataris.length === 0) throw new Error("No hi ha cap correu destinatari configurat (Configuració → Inscripcions)")

  // Dades actuals dels atletes (naixement, sexe) per si la federació les demana.
  const refs = inscrits.map((x) => db.collection("athletes").doc(x.athleteId))
  const atletesSnap = refs.length ? await db.getAll(...refs) : []
  const atletes = new Map(atletesSnap.filter((s) => s.exists).map((s) => [s.id, s.data()]))

  // Proves de l'event per categoria i sexe (events/{id}.provesPerCategoria)
  const ppc = ev.provesPerCategoria ?? {}
  // Els ids "dist:<metres>" són distàncies de cros (no existeixen a "proves").
  const esDistancia = (id) => typeof id === "string" && id.startsWith("dist:")
  const idsProves = [...new Set(Object.values(ppc).flatMap((x) => [...(x?.M ?? []), ...(x?.F ?? [])]))].filter((id) => !esDistancia(id))
  const provesSnap = idsProves.length ? await db.getAll(...idsProves.map((id) => db.collection("proves").doc(id))) : []
  const nomProva = new Map(provesSnap.filter((s) => s.exists).map((s) => [s.id, s.data().nom ?? ""]))
  const provesDe = (categoria, sexe, triades) => {
    const ids = provesEfectives(ev, categoria, sexe, triades)
    if (calTriarProves(ev, categoria, sexe) && ids.length === 0) return "(sense triar)"
    return ids.map((id) => (esDistancia(id) ? `${id.slice(5)} m` : nomProva.get(id))).filter(Boolean).join(", ")
  }

  const files = inscrits
    .map((x) => {
      const a = atletes.get(x.athleteId) ?? {}
      const naix = a.naixement?.toDate?.()
      return {
        nom: a.nom ?? x.nom ?? "",
        categoria: a.categoria ?? x.categoria ?? "",
        sexe: a.sexe === "F" ? "F" : a.sexe === "M" ? "M" : "",
        naixement: naix ? formatData(naix, { day: "2-digit", month: "2-digit", year: "numeric" }) : "",
        proves: provesDe(a.categoria ?? x.categoria, a.sexe, x.proves),
      }
    })
    .sort((a, b) => (a.categoria ?? "").localeCompare(b.categoria ?? "", "ca") || a.nom.localeCompare(b.nom, "ca"))

  const dataEv = ev.date?.toDate?.()
  const dataTxt = dataEv ? formatData(dataEv) : ""
  const titol = ev.title ?? "Competició"

  const perCategoria = new Map()
  files.forEach((f) => {
    const k = f.categoria || "Sense categoria"
    if (!perCategoria.has(k)) perCategoria.set(k, [])
    perCategoria.get(k).push(f)
  })

  const blocsHtml = Array.from(perCategoria.entries()).map(([cat, llista]) => `
    <h3 style="margin:20px 0 6px;font-size:15px">${escapaHtml(cat)} · ${llista.length}</h3>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;min-width:420px">
      <tr style="background:#f1f5f9;text-align:left"><th>#</th><th>Nom</th><th>Sexe</th><th>Naixement</th><th>Proves</th></tr>
      ${llista.map((f, i) => `<tr style="border-top:1px solid #e2e8f0"><td>${i + 1}</td><td>${escapaHtml(f.nom)}</td><td>${f.sexe}</td><td>${f.naixement}</td><td>${escapaHtml(f.proves)}</td></tr>`).join("")}
    </table>`).join("")

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a">
      <h2 style="margin:0 0 4px">Inscripcions: ${escapaHtml(titol)}</h2>
      <p style="margin:0;color:#475569">${escapaHtml(dataTxt)}${ev.lloc ? " · " + escapaHtml(ev.lloc) : ""}</p>
      <p style="margin:12px 0 0"><strong>${files.length}</strong> atleta${files.length === 1 ? "" : "s"} inscrit${files.length === 1 ? "" : "s"}.</p>
      ${files.length ? blocsHtml : "<p>No s'hi ha apuntat ningú.</p>"}
      <p style="margin-top:24px;font-size:12px;color:#94a3b8">Enviat automàticament des de camsub10.site. Adjunt: llistat en CSV.</p>
    </div>`

  const text = [
    `Inscripcions: ${titol}`,
    `${dataTxt}${ev.lloc ? " · " + ev.lloc : ""}`,
    `${files.length} atletes inscrits`,
    "",
    ...files.map((f) => `- ${f.nom} (${f.categoria}${f.sexe ? ", " + f.sexe : ""}${f.naixement ? ", " + f.naixement : ""})${f.proves ? " — " + f.proves : ""}`),
  ].join("\n")

  const csv = "﻿" + ["Nom;Categoria;Sexe;Naixement;Proves", ...files.map((f) => [f.nom, f.categoria, f.sexe, f.naixement, f.proves].map(csvCell).join(";"))].join("\n")

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  })
  await transporter.sendMail({
    from: `"CAM Inscripcions" <${SMTP_USER.value()}>`,
    to: destinataris.join(", "),
    subject: `Inscripcions ${titol}${dataEv ? " (" + formatData(dataEv, { day: "numeric", month: "numeric" }) + ")" : ""} — ${files.length} atletes`,
    text,
    html,
    attachments: [{ filename: `inscripcions-${titol.replace(/[^\w\-]+/g, "_")}.csv`, content: csv, contentType: "text/csv; charset=utf-8" }],
  })

  await evRef.update({
    inscripcionsEnviadesAt: admin.firestore.FieldValue.serverTimestamp(),
    inscripcionsEnviadesCount: files.length,
  })
  return { enviat: true, total: files.length, destinataris }
}

// Cada hora (al minut 5) mira si alguna competició acaba de tancar
// inscripcions i encara no s'han enviat.
exports.enviarInscripcionsProgramat = onSchedule(
  { schedule: "5 * * * *", timeZone: TZ, secrets: [SMTP_USER, SMTP_PASS] },
  async () => {
    const ara = new Date()
    const snap = await admin.firestore()
      .collection("events")
      .where("date", ">=", admin.firestore.Timestamp.fromDate(ara))
      .get()

    for (const d of snap.docs) {
      const ev = d.data()
      if (ev.inscripcionsActives === false) continue
      if (ev.inscripcionsEnviadesAt) continue
      const tancament = tancamentDe(ev)
      if (!tancament || ara < tancament) continue
      try {
        const res = await enviarInscripcionsEvent(d.id)
        console.log(`Inscripcions ${d.id} (${ev.title}):`, res)
      } catch (e) {
        console.error(`Error enviant inscripcions de ${d.id} (${ev.title})`, e)
      }
    }
  }
)

// Admin/entrenador: enviar (o reenviar) ara mateix el correu d'un event.
exports.enviarInscripcionsAra = onCall({ secrets: [SMTP_USER, SMTP_PASS] }, async (request) => {
  try {
    await assertStaff(request)
  } catch (err) {
    await logAudit(request, "enviarInscripcionsAra", { ok: false, extra: { reason: err.message } })
    throw err
  }
  const { eventId } = request.data ?? {}
  if (!eventId) throw new HttpsError("invalid-argument", "Falta l'eventId")
  try {
    const res = await enviarInscripcionsEvent(eventId, { forcar: true })
    await logAudit(request, "enviarInscripcionsAra", { ok: true, target: eventId, extra: { total: res.total } })
    return res
  } catch (error) {
    console.error(error)
    await logAudit(request, "enviarInscripcionsAra", { ok: false, target: eventId, extra: { error: error.message } })
    throw new HttpsError("internal", error.message ?? "Error enviant el correu")
  }
})

/* ─────────────────────────────────────────────
   CERCADOR DE COMPETICIONS DE LA FCA
   El navegador no pot llegir fcatletisme.cat directament (CORS), així que
   la funció descarrega el llistat públic (The Events Calendar) i en treu:
   nom, data, lloc, tipus de pista (categoria de la FCA), reglament (enllaç
   "r"), web (enllaç "w") i la pàgina de la competició. Només staff.
   ───────────────────────────────────────────── */

function decodeHtml(txt = "") {
  return txt
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tipusPistaDeCategories(noms) {
  const n = noms.map((x) => x.toLowerCase())
  if (n.some((x) => x.includes("cros") || x.includes("cross"))) return "cross"
  if (n.some((x) => x.includes("ruta") || x.includes("marxa"))) return "marxa_ruta"
  if (n.some((x) => x.includes("coberta"))) return "coberta"
  if (n.some((x) => x.includes("aire"))) return "aire_lliure"
  return null
}

function parseLlistatFCA(html) {
  const avui = new Date()
  const files = []
  const reRow = /<tr[^>]*id="post-(\d+)"[^>]*>([\s\S]*?)<\/tr>/g
  let m
  while ((m = reRow.exec(html))) {
    const [, id, cos] = m
    const tds = [...cos.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1])
    const titol = cos.match(/<a class="url" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!titol) continue
    const categories = [...cos.matchAll(/<a rel="tag"[^>]*>([\s\S]*?)<\/a>/g)].map((x) => decodeHtml(x[1]))
    const dm = (tds[1] ?? "").match(/(\d{1,2})\.(\d{1,2})/)
    let data = null
    if (dm) {
      const dia = Number(dm[1]), mes = Number(dm[2])
      let any = avui.getFullYear()
      // El llistat només mostra dia.mes: si ja fa més de 60 dies, és de l'any vinent.
      if (new Date(any, mes - 1, dia) < new Date(avui.getTime() - 60 * 864e5)) any += 1
      data = `${any}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    }
    const reglament = cos.match(/<a[^>]*title="Reglament"[^>]*href="([^"]+)"/)?.[1] ?? cos.match(/<a[^>]*href="([^"]+)"[^>]*title="Reglament"/)?.[1] ?? ""
    const web = cos.match(/<a[^>]*title="Pàgina web"[^>]*href="([^"]+)"/)?.[1] ?? cos.match(/<a[^>]*href="([^"]+)"[^>]*title="P[^"]*gina web"/)?.[1] ?? ""
    const lloc = decodeHtml((cos.match(/tribe-events-venue-details">([\s\S]*?)<\/div>/)?.[1] ?? "").replace(/<[^>]+>/g, ""))
    files.push({
      id,
      nom: decodeHtml(titol[2].replace(/<[^>]+>/g, "")),
      url: decodeHtml(titol[1]),
      data,
      lloc,
      categories,
      tipusPista: tipusPistaDeCategories(categories),
      reglament: decodeHtml(reglament),
      web: decodeHtml(web),
    })
  }
  return files
}

exports.cercaCompeticionsFCA = onCall(async (request) => {
  await assertStaff(request)
  const q = String(request.data?.q ?? "").trim().slice(0, 100)
  const url = new URL("https://fcatletisme.cat/")
  url.searchParams.set("post_type", "tribe_events")
  if (q) url.searchParams.set("s", q)
  let resp
  try {
    resp = await fetch(url, { headers: { "User-Agent": "camsub10-app/1.0" }, signal: AbortSignal.timeout(15000) })
  } catch {
    throw new HttpsError("unavailable", "No s'ha pogut connectar amb la web de la FCA")
  }
  if (!resp.ok) throw new HttpsError("unavailable", `La web de la FCA ha respost ${resp.status}`)
  return { resultats: parseLlistatFCA(await resp.text()).slice(0, 30) }
})
