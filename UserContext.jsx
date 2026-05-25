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
 *   { email, rol: "admin"|"entrenador", categories: ["Sub-10","Sub-12"] }
 *
 * Ús:
 *   const { rol, categories, esAdmin, filtraCat, teAccesCat } = useUser()
 */

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [userData, setUserData] = useState(null)
  const [loading, setLoading]   = useState(true)

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
  const nom        = userData?.nom ?? ""

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

  return (
    <UserContext.Provider value={{ userData, loading, rol, nom, categories, esAdmin, filtraCat, teAccesCat }}>
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