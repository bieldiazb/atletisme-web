import { createContext, useContext, useState, useEffect } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { auth, db } from "./firebaseClient"

/**
 * UserContext — context global amb informació del rol i categories.
 *
 * Llegeix l'UID de Firebase Auth automàticament i carrega el document
 * corresponent de la col·lecció "admins".
 *
 * Estructura del document admins/{uid}:
 *   {
 *     email, rol: "admin"|"entrenador", categories: ["Sub-10","Sub-12"],
 *     isDeveloper?: boolean,
 *     permisosVistes?: string[],  // keys del menú que aquest usuari en concret
 *                                 // pot veure — si no existeix, s'aplica el
 *                                 // comportament per defecte segons el rol
 *     potGestionar?: string[],    // (només admins) uids d'entrenadors que
 *                                 // aquest admin pot gestionar (editar-los
 *                                 // permisosVistes) — assignat pel developer
 *   }
 *
 * Valors per defecte per rol quan un usuari NO té permisosVistes propi:
 * config/permisosDefault = { entrenador: string[], admin: string[] },
 * editable pel developer des de "Permisos de visualització". Si no existeix
 * (o no té el rol en qüestió), es manté el comportament de tota la vida.
 *
 * Ús:
 *   const { rol, categories, esAdmin, esDeveloper, filtraCat, teAccesCat, potVeureItem } = useUser()
 */

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [userData, setUserData] = useState(null)
  const [loading, setLoading]   = useState(true)
  // Valors per defecte de permisosVistes per rol (config/permisosDefault),
  // editables pel developer des de "Permisos de visualització". Lectura
  // pública (com la resta de "config"), independent de l'estat d'auth.
  const [permisosDefault, setPermisosDefault] = useState(null)

  useEffect(() => {
    getDoc(doc(db, "config", "permisosDefault"))
      .then(snap => { if (snap.exists()) setPermisosDefault(snap.data()) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Escolta canvis d'autenticació de Firebase Auth
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserData(null)
        setLoading(false)
        return
      }
      try {
        const snap = await getDoc(doc(db, "admins", user.uid))
        if (snap.exists()) {
          const data = snap.data()
          const derivedNom = data.nom ?? user.email?.split("@")[0] ?? ""
          setUserData({ id: snap.id, ...data, nom: derivedNom })
          if (!data.nom && user.email) {
            await updateDoc(doc(db, "admins", user.uid), { nom: derivedNom })
          }
        } else {
          // L'usuari existeix a Auth però no a Firestore admins
          const derivedNom = user.email?.split("@")[0] ?? ""
          setUserData({ id: user.uid, email: user.email, rol: "admin", categories: [], nom: derivedNom })
        }
      } catch (e) {
        console.error("UserContext: error carregant admin", e)
        setUserData(null)
      } finally {
        setLoading(false)
      }
    })
    return () => unsub()
  }, [])

  const rol        = userData?.rol ?? "admin"
  const categories = userData?.categories ?? []
  const esAdmin    = rol === "admin"
  // Developer: un nivell per sobre d'admin, no substitueix el rol (així
  // segueix tenint accés a tot el que ja té un admin) — habilita accions
  // extra de Firebase Auth (desactivar comptes, canviar email...).
  const esDeveloper = userData?.isDeveloper === true
  const nom        = userData?.nom ?? ""
  // undefined/null = encara no s'ha personalitzat res per aquest usuari
  // (comportament per defecte segons rol); array = llista exacta i explícita.
  const permisosVistes = Array.isArray(userData?.permisosVistes) ? userData.permisosVistes : null
  const potGestionar   = userData?.potGestionar ?? []

  /**
   * Filtra una llista per categoria. Admin veu-ho tot.
   * @param {Array}  llista  - array d'objectes
   * @param {string} camp    - camp que conté la categoria (default: "categoria")
   */
  const filtraCat = (llista, camp = "categoria") => {
    if (esAdmin || categories.length === 0) return llista
    return llista.filter(item => categories.includes(item[camp]))
  }

  /** Comprova si l'usuari té accés a una categoria concreta. */
  const teAccesCat = (cat) => esAdmin || categories.includes(cat)

  /**
   * Decideix si l'usuari actual pot veure un item concret del menú admin.
   * Substitueix el filtre antic (grup.adminOnly / item.developerOnly) per un
   * de per-usuari: si el developer li ha personalitzat els permisos
   * (permisosVistes és un array), és aquesta llista qui mana; si no, es
   * manté el comportament de sempre segons el rol.
   *
   * @param {{key:string, developerOnly?:boolean, nomesGestors?:boolean}} item
   * @param {boolean} grupEsAdminOnly  si l'item pertany a un grup marcat adminOnly
   */
  const potVeureItem = (item, grupEsAdminOnly) => {
    // Sostre dur: les eines de developer mai es poden obrir a ningú més,
    // encara que algú personalitzi permisos — no formen part del sistema
    // de permisos personalitzats.
    if (item.developerOnly) return esDeveloper
    // Item especial (la mateixa secció de "Permisos de visualització"): la
    // seva visibilitat es calcula a part, no amb la llista de permisos.
    if (item.nomesGestors) return esDeveloper || (esAdmin && potGestionar.length > 0)
    if (esDeveloper) return true
    if (permisosVistes) return permisosVistes.includes(item.key)
    // Sense personalitzar: valors per defecte editables (config/permisosDefault)
    // si el developer els ha desat; si no, el comportament de sempre.
    const plantilla = permisosDefault?.[esAdmin ? "admin" : "entrenador"]
    if (Array.isArray(plantilla)) return plantilla.includes(item.key)
    return grupEsAdminOnly ? esAdmin : true
  }

  return (
    <UserContext.Provider value={{
      userData, loading, rol, nom, categories, esAdmin, esDeveloper,
      permisosVistes, potGestionar, permisosDefault, filtraCat, teAccesCat, potVeureItem,
    }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useUser s'ha d'usar dins de <UserProvider>")
  return ctx
}

export default UserContext