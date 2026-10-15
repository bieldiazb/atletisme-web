import { useState } from "react"
import { httpsCallable } from "firebase/functions"
import { functions } from "../../../../firebaseClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Search, FileText, ChevronDown, ChevronUp } from "lucide-react"

// Cerca competicions al calendari de la FCA (fcatletisme.cat) i en deixa
// triar una per omplir el formulari de l'event: nom, lloc, data, tipus de
// pista i enllaç del reglament (el "r" del llistat; si no n'hi ha, la web o
// la pàgina de la competició). La descàrrega la fa la Cloud Function
// cercaCompeticionsFCA, perquè el navegador no pot llegir la web de la FCA.
export default function CercadorFCA({ onTria }) {
  const [obert, setObert] = useState(false)
  const [q, setQ] = useState("")
  const [carregant, setCarregant] = useState(false)
  const [resultats, setResultats] = useState(null)
  const [error, setError] = useState("")

  const cerca = async (e) => {
    e?.preventDefault()
    setCarregant(true)
    setError("")
    try {
      const fn = httpsCallable(functions, "cercaCompeticionsFCA")
      const { data } = await fn({ q: q.trim() })
      setResultats(data?.resultats ?? [])
    } catch (err) {
      setResultats(null)
      // Una funció no desplegada no respon amb capçaleres CORS: el navegador només veu "internal".
      setError(err?.code === "functions/internal" || err?.code === "functions/not-found"
        ? "La cerca no respon: cal desplegar la funció (firebase deploy --only functions)."
        : err?.message ?? "No s'ha pogut cercar")
    } finally {
      setCarregant(false)
    }
  }

  const tria = (r) => {
    onTria({
      title: r.nom,
      lloc: r.lloc,
      data: r.data,
      tipusPista: r.tipusPista,
      link: r.reglament || r.web || r.url || "",
    })
    setObert(false)
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setObert((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-1.5"><Search className="h-4 w-4" /> Cercar a la FCA</span>
        {obert ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {obert && (
        <div className="space-y-3 border-t p-3">
          <form onSubmit={cerca} className="flex gap-2">
            <Input
              autoFocus
              placeholder="Nom de la competició (ex: cros castellar)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" disabled={carregant}>
              {carregant ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cercar"}
            </Button>
          </form>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {resultats && resultats.length === 0 && (
            <p className="text-xs text-muted-foreground">Cap competició trobada.</p>
          )}

          {resultats && resultats.length > 0 && (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {resultats.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => tria(r)}
                    className="w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-muted/50"
                  >
                    <span className="block font-medium leading-snug">{r.nom}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {r.data && <span>{r.data.split("-").reverse().join("/")}</span>}
                      {r.lloc && <span>{r.lloc}</span>}
                      {r.categories?.length > 0 && <span>{r.categories.join(" · ")}</span>}
                      {r.reglament && (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <FileText className="h-3 w-3" /> reglament
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
