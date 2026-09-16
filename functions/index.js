const { setGlobalOptions } = require("firebase-functions/v2")
const { onCall, HttpsError } = require("firebase-functions/v2/https")
const admin = require("firebase-admin")

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
