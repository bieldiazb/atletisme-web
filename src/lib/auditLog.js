import { addDoc, collection, serverTimestamp } from "firebase/firestore"
import { db } from "../../firebaseClient"

/**
 * Registre d'auditoria per a les operacions normals de CRUD (atletes,
 * marques, marques de relleu, events) — crear, editar, eliminar (individual
 * i en massa). No confondre amb les accions de Firebase Auth (crear usuari,
 * desactivar compte...), que ja queden registrades des de dins de les Cloud
 * Functions a functions/index.js.
 *
 * Aquest registre es fa directament des del client: és prou per tenir
 * traçabilitat entre un equip petit de confiança (qui ha tocat què i quan),
 * però no és a prova de manipulació — algú amb accés directe a Firestore es
 * podria saltar el registre. Si mai cal el nivell de garantia dels usuaris
 * (impossible de saltar-se'l), caldria moure aquestes operacions també a
 * Cloud Functions, com ja es fa amb la gestió d'usuaris.
 *
 * @param {{id?: string, nom?: string, email?: string}} actor  userData de useUser()
 * @param {string} action   ex: "athletes.create", "marques.delete", "events.bulkUpdate"
 * @param {{target?: string|null, extra?: object}} opts
 */
export async function logAudit(actor, action, { target = null, extra = {} } = {}) {
  try {
    await addDoc(collection(db, "audit_logs"), {
      action,
      ok: true,
      actorUid: actor?.id ?? null,
      actorNom: actor?.nom ?? actor?.email ?? null,
      target,
      extra,
      at: serverTimestamp(),
    })
  } catch (e) {
    // Un log fallit mai ha de trencar l'acció real de l'usuari.
    console.error("No s'ha pogut desar el log d'auditoria", e)
  }
}
