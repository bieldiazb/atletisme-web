import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Share } from "lucide-react"

// Botó "Instal·la l'app": a Android/Chrome usa el diàleg d'instal·lació del
// navegador; a iPhone/iPad (que no el té) mostra com afegir-la a l'inici.
// No es mostra si l'app ja està instal·lada o s'obre en mode independent.
export default function InstalaApp({ className = "" }) {
  const [prompt, setPrompt] = useState(null)
  const [instalada, setInstalada] = useState(false)
  const [ajudaIos, setAjudaIos] = useState(false)

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setPrompt(e) }
    const onInstalled = () => { setInstalada(true); setPrompt(null) }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (standalone || instalada) return null
  if (!prompt && !ios) return null

  const instala = async () => {
    if (prompt) {
      prompt.prompt()
      await prompt.userChoice.catch(() => {})
      setPrompt(null)
    } else {
      setAjudaIos((v) => !v)
    }
  }

  return (
    <div className={className}>
      <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={instala}>
        <Download className="h-4 w-4" />
        Instal·la l'app al mòbil
      </Button>
      {ajudaIos && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Toca <Share className="mx-0.5 inline h-3.5 w-3.5" /> (Compartir) a Safari i tria «Afegeix a la pantalla d'inici».
        </p>
      )}
    </div>
  )
}
