import { useEffect, useState } from "react"
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { logAudit } from "@/lib/auditLog"
import {
  inscripcionsActives,
  inscripcionsObertes,
  tancamentDe,
  formatDiaLimit,
  enviarInscripcionsAra,
} from "@/lib/inscripcions"
import { provesEfectives, calTriarProves, esIdDistancia, nomDistancia } from "@/lib/provesEvent"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AtletaCombobox } from "@/components/AtletaCombobox"
import { useToast } from "@/hooks/use-toast"
import { generarLlistaConvocats, nomFitxerConvocats } from "@/lib/llistaConvocats"
import { Check, X, Mail, Copy, Loader2, Lock, Clock, Send, FileDown } from "lucide-react"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14"]

// Llista d'inscrits d'un event (el que han marcat els pares des del seu
// Calendari), amb opció d'apuntar/desapuntar algú a mà i d'enviar el
// correu ara mateix sense esperar al tancament automàtic.
export default function InscripcionsEventSheet({ event, open, onOpenChange, onChanged, isMobile }) {
  const { toast } = useToast()
  const { userData, filtraCat } = useUser()

  const [inscripcions, setInscripcions] = useState([])
  const [athletes, setAthletes] = useState([])
  const [nomsProves, setNomsProves] = useState({})
  const [loading, setLoading] = useState(false)
  const [enviant, setEnviant] = useState(false)
  const [afegirId, setAfegirId] = useState("")

  const load = async () => {
    if (!event) return
    setLoading(true)
    try {
      const [insSnap, athSnap, provesSnap] = await Promise.all([
        getDocs(query(collection(db, "inscripcions"), where("eventId", "==", event.id))),
        athletes.length ? null : getDocs(collection(db, "athletes")),
        Object.keys(nomsProves).length ? null : getDocs(collection(db, "proves")),
      ])
      if (provesSnap) {
        const m = {}
        provesSnap.docs.forEach((d) => { m[d.id] = d.data().nom ?? "" })
        setNomsProves(m)
      }
      setInscripcions(insSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      if (athSnap) setAthletes(athSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    } catch {
      toast({ variant: "destructive", title: "Error carregant inscripcions", description: "Torna-ho a provar" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && event) { setAfegirId(""); load() }
  }, [open, event?.id])

  if (!event) return null

  const cats = event.categories ?? []
  const elegibles = filtraCat(
    athletes.filter((a) => a.actiu !== false && (cats.length === 0 || cats.includes(a.categoria))),
    "categoria"
  )

  // Text de les proves que farà un inscrit (triades o totes les de la seva categoria/sexe).
  const textProves = (ins) => {
    const a = athletes.find((x) => x.id === ins.athleteId)
    const cat = a?.categoria ?? ins.categoria
    const sexe = a?.sexe
    const ids = provesEfectives(event, cat, sexe, ins.proves)
    if (calTriarProves(event, cat, sexe) && ids.length === 0) return "Proves sense triar"
    return ids.map((id) => (esIdDistancia(id) ? nomDistancia(id) : nomsProves[id])).filter(Boolean).join(", ")
  }

  const ordena = (a, b) => (a.categoria ?? "").localeCompare(b.categoria ?? "", "ca") || (a.nom ?? "").localeCompare(b.nom ?? "", "ca")
  const hiVan = inscripcions.filter((x) => x.va === true).sort(ordena)
  const noHiVan = inscripcions.filter((x) => x.va === false).sort(ordena)
  const idsHiVan = new Set(hiVan.map((x) => x.athleteId))

  const oberta = inscripcionsObertes(event)
  const tancament = tancamentDe(event)
  const enviades = event.inscripcionsEnviadesAt?.toDate?.()

  const apuntar = async (athleteId) => {
    const a = athletes.find((x) => x.id === athleteId)
    if (!a) return
    try {
      await setDoc(doc(db, "inscripcions", `${event.id}_${a.id}`), {
        eventId: event.id,
        athleteId: a.id,
        nom: a.nom ?? "",
        categoria: a.categoria ?? null,
        va: true,
        origen: "staff",
        actualitzat: serverTimestamp(),
      })
      logAudit(userData, "inscripcions.afegir", { target: event.id, extra: { atleta: a.nom } })
      setAfegirId("")
      await load()
      onChanged?.()
    } catch {
      toast({ variant: "destructive", title: "No s'ha pogut apuntar", description: "Torna-ho a provar" })
    }
  }

  const treure = async (ins) => {
    try {
      await deleteDoc(doc(db, "inscripcions", ins.id))
      logAudit(userData, "inscripcions.treure", { target: event.id, extra: { atleta: ins.nom } })
      await load()
      onChanged?.()
    } catch {
      toast({ variant: "destructive", title: "No s'ha pogut treure", description: "Torna-ho a provar" })
    }
  }

  const copiar = async () => {
    const text = hiVan.map((x) => `${x.nom} (${x.categoria ?? "—"})`).join("\n")
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: "Llista copiada", description: `${hiVan.length} atletes` })
    } catch {
      toast({ variant: "destructive", title: "No s'ha pogut copiar" })
    }
  }

  // PDF imprimible amb els que hi van: per categoria, amb proves, dorsal i casella de presència.
  const descarregarPdf = () => {
    try {
      const files = hiVan.map((x) => {
        const a = athletes.find((y) => y.id === x.athleteId)
        const naix = a?.naixement?.toDate?.()
        return {
          nom: a?.nom ?? x.nom ?? "",
          categoria: a?.categoria ?? x.categoria ?? "",
          sexe: a?.sexe,
          naixement: naix ? naix.toLocaleDateString("ca-ES") : "",
          proves: textProves(x),
        }
      })
      const data = event.date?.toDate?.()
      const doc = generarLlistaConvocats({
        event,
        files,
        dataText: data ? data.toLocaleDateString("ca-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "",
      })
      doc.save(nomFitxerConvocats(event))
    } catch {
      toast({ variant: "destructive", title: "No s'ha pogut generar el PDF", description: "Torna-ho a provar" })
    }
  }

  const enviar = async () => {
    setEnviant(true)
    try {
      const res = await enviarInscripcionsAra(event.id)
      toast({ title: "Correu enviat", description: `${res.total} inscrits → ${(res.destinataris ?? []).join(", ")}` })
      onChanged?.()
    } catch (err) {
      toast({ variant: "destructive", title: "No s'ha pogut enviar", description: err?.message ?? "Torna-ho a provar" })
    } finally {
      setEnviant(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "h-[85vh] rounded-t-xl overflow-y-auto" : "w-[460px] sm:max-w-[460px] overflow-y-auto"}
      >
        <SheetHeader>
          <SheetTitle>Inscripcions · {event.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Estat */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
            {!inscripcionsActives(event) ? (
              <p className="text-muted-foreground">Aquest event no té inscripcions per als pares.</p>
            ) : (
              <>
                <p className="flex items-center gap-1.5">
                  {oberta ? <Clock className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                  {oberta ? "Oberta fins al " : "Tancada el "}
                  <span className="font-semibold">{tancament ? formatDiaLimit(tancament) : "—"}</span>
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {enviades
                    ? `Correu enviat el ${enviades.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "short" })} (${event.inscripcionsEnviadesCount ?? 0} inscrits)`
                    : "El correu s'enviarà automàticament en tancar-se"}
                </p>
              </>
            )}
          </div>

          {/* Accions */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={enviar} disabled={enviant}>
              {enviant ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              {enviades ? "Reenviar correu ara" : "Enviar correu ara"}
            </Button>
            <Button size="sm" variant="outline" onClick={copiar} disabled={hiVan.length === 0}>
              <Copy className="mr-1.5 h-4 w-4" />
              Copiar llista
            </Button>
            <Button size="sm" variant="outline" onClick={descarregarPdf} disabled={hiVan.length === 0}>
              <FileDown className="mr-1.5 h-4 w-4" />
              Llista en PDF
            </Button>
          </div>

          {/* Afegir a mà */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Apuntar un atleta a mà</p>
            <AtletaCombobox
              athletes={elegibles.filter((a) => !idsHiVan.has(a.id))}
              value={afegirId}
              onChange={(id) => { setAfegirId(id); apuntar(id) }}
              categoriesOrdre={TOTES_CATEGORIES}
              placeholder="Cerca un atleta per apuntar-lo"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Check className="h-4 w-4 text-emerald-600" /> Hi van ({hiVan.length})
                </p>
                {hiVan.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Encara no s'hi ha apuntat ningú.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {hiVan.map((x) => (
                      <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="truncate">{x.nom}</span>
                          <span className="ml-2 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">{x.categoria ?? "—"}</span>
                          {x.origen === "staff" && <span className="ml-1 text-xs text-muted-foreground">(a mà)</span>}
                          {textProves(x) && (
                            <span className="block text-xs text-muted-foreground mt-0.5">{textProves(x)}</span>
                          )}
                        </span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => treure(x)} aria-label="Treure">
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {noHiVan.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                    <X className="h-4 w-4" /> No hi van ({noHiVan.length})
                  </p>
                  <p className="text-sm text-muted-foreground">{noHiVan.map((x) => x.nom).join(", ")}</p>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
