import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { onAuthStateChanged } from "firebase/auth"
import { auth, db } from "../../firebaseClient"
import { doc, getDoc } from "firebase/firestore"

export default function AdminRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAllowed(false)
        setLoading(false)
        return
      }

      const adminRef = doc(db, "admins", user.uid)
      const adminSnap = await getDoc(adminRef)

      setAllowed(adminSnap.exists())
      setLoading(false)
    })

    return () => unsub()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Comprovant permisos...</p>
      </div>
    )
  }

  if (!allowed) {
    return <Navigate to="/login" replace />
  }

  return children
}
