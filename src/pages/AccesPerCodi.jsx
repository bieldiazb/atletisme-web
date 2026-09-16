import { useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { entrarAmbCodi } from "@/lib/accesPares"
import { Loader2 } from "lucide-react"

// Accés per enllaç/QR (/acces/:codi): fa la mateixa validació que el
// formulari manual de Landing.jsx (entrarAmbCodi), però sense haver de
// teclejar res — pensat per compartir per WhatsApp o imprimir en un QR.
// Si el codi no és vàlid, torna a la pantalla de login amb l'error mostrat.
export default function AccesPerCodi() {
  const { codi } = useParams()
  const navigate = useNavigate()
  const intentat = useRef(false)

  useEffect(() => {
    if (intentat.current) return
    intentat.current = true

    entrarAmbCodi(codi).then((resultat) => {
      if (resultat.ok) {
        navigate("/pares", { replace: true })
      } else {
        navigate(`/?error=${resultat.reason}`, { replace: true })
      }
    })
  }, [codi, navigate])

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Accedint…</p>
      </div>
    </div>
  )
}
