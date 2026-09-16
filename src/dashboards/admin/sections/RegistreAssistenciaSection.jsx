import { useEffect, useState } from "react"
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  writeBatch,
  Timestamp,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { ChevronDown, ChevronUp, Loader2, Users, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { ca } from "date-fns/locale"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]

// Firestore writeBatch admet un màxim de 500 operacions.
const BATCH_SIZE = 450
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export default function RegistreAssistenciaSection() {
  const { esAdmin, categories: catUsuari } = useUser()
  const { toast } = useToast()
  const categoriesDisponibles = esAdmin ? TOTES_CATEGORIES : catUsuari

  const [categoriaFiltre, setCategoriaFiltre] = useState("totes")
  const [registres, setRegistres] = useState([])
  const [loading, setLoading] = useState(true)
  const [obert, setObert] = useState(null)
  const [presenciaEdit, setPresenciaEdit] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [eliminarConfirm, setEliminarConfirm] = useState(null)
  const [eliminantLoading, setEliminantLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      if (esAdmin) {
        const snap = await getDocs(collection(db, "assistencies"))
        setRegistres(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } else if (catUsuari.length === 0) {
        setRegistres([])
      } else {
        // Firestore "in" admet fins a 10 valors — sobra marge per a les categories d'un entrenador.
        const snap = await getDocs(query(
          collection(db, "assistencies"),
          where("categoria", "in", catUsuari.slice(0, 10))
        ))
        setRegistres(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "No s'ha pogut carregar el registre" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const obrirSessio = (key, session) => {
    if (obert === key) {
      setObert(null)
      return
    }
    const inicial = {}
    session.registres.forEach((r) => { inicial[r.athleteId] = r.present })
    setPresenciaEdit(inicial)
    setObert(key)
  }

  const toggleEdit = (athleteId) =>
    setPresenciaEdit((prev) => ({ ...prev, [athleteId]: !prev[athleteId] }))

  const desarCanvis = async (session) => {
    const canviats = session.registres.filter((r) => presenciaEdit[r.athleteId] !== r.present)
    if (canviats.length === 0) {
      toast({ title: "Sense canvis per desar" })
      return
    }
    setSavingEdit(true)
    try {
      for (const group of chunk(canviats, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach((r) => batch.update(doc(db, "assistencies", r.id), {
          present: presenciaEdit[r.athleteId],
          actualitzat: Timestamp.now(),
        }))
        await batch.commit()
      }
      toast({
        title: "Assistència actualitzada",
        description: `${canviats.length} canvi${canviats.length > 1 ? "s" : ""} desat${canviats.length > 1 ? "s" : ""}`,
      })
      await load()
    } catch {
      toast({ variant: "destructive", title: "Error desant", description: "Torna-ho a provar" })
    } finally {
      setSavingEdit(false)
    }
  }

  // Agrupem els registres individuals (un per atleta) en sessions (dia + categoria)
  const sessions = (() => {
    const mapa = new Map()
    registres.forEach((r) => {
      if (categoriaFiltre !== "totes" && r.categoria !== categoriaFiltre) return
      const key = `${r.dataISO}__${r.categoria}`
      if (!mapa.has(key)) mapa.set(key, { dataISO: r.dataISO, categoria: r.categoria, registres: [] })
      mapa.get(key).registres.push(r)
    })
    return Array.from(mapa.values())
      .map((s) => ({
        ...s,
        total: s.registres.length,
        presents: s.registres.filter((r) => r.present).length,
      }))
      .sort((a, b) => b.dataISO.localeCompare(a.dataISO))
  })()

  const confirmarEliminar = async () => {
    if (!eliminarConfirm) return
    setEliminantLoading(true)
    try {
      const ids = eliminarConfirm.registres.map((r) => r.id)
      for (const group of chunk(ids, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach((id) => batch.delete(doc(db, "assistencies", id)))
        await batch.commit()
      }
      toast({ title: "Sessió eliminada" })
      setEliminarConfirm(null)
      load()
    } catch {
      toast({ variant: "destructive", title: "Error eliminant", description: "Torna-ho a provar" })
    } finally {
      setEliminantLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Registre d'assistència</h1>
        <p className="text-sm text-muted-foreground mt-1">Historial de les llistes passades, per categoria i dia</p>
      </div>

      <Select value={categoriaFiltre} onValueChange={setCategoriaFiltre}>
        <SelectTrigger className="w-52"><SelectValue placeholder="Categoria" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="totes">Totes les categories</SelectItem>
          {categoriesDisponibles.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Encara no hi ha cap assistència registrada.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const key = `${s.dataISO}__${s.categoria}`
            const isObert = obert === key
            const dateObj = new Date(`${s.dataISO}T00:00:00`)
            return (
              <div key={key} className="rounded-xl border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => obrirSessio(key, s)}
                  className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold capitalize">{format(dateObj, "EEEE d MMMM yyyy", { locale: ca })}</span>
                    <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">{s.categoria}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${s.presents === s.total ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {s.presents}/{s.total} presents
                    </span>
                    {isObert ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {isObert && (
                  <div className="border-t px-4 py-3 space-y-3">
                    <p className="text-xs text-muted-foreground">Toca un nom per canviar-lo entre present i absent.</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {s.registres
                        .slice()
                        .sort((a, b) => (a.athleteNom ?? "").localeCompare(b.athleteNom ?? "", "ca"))
                        .map((r) => {
                          const present = !!presenciaEdit[r.athleteId]
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => toggleEdit(r.athleteId)}
                              className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-sm transition-all ${
                                present
                                  ? "border-emerald-300 bg-emerald-50"
                                  : "border-rose-300 bg-rose-50"
                              }`}
                            >
                              <span className="font-medium">{r.athleteNom}</span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                present ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                              }`}>
                                {present ? "Present" : "Absent"}
                              </span>
                            </button>
                          )
                        })}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="destructive" onClick={() => setEliminarConfirm(s)}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Eliminar sessió
                      </Button>
                      <Button size="sm" onClick={() => desarCanvis(s)} disabled={savingEdit}>
                        {savingEdit ? "Desant…" : "Desar canvis"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!eliminarConfirm} onOpenChange={(open) => !open && setEliminarConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar aquesta sessió d'assistència?</AlertDialogTitle>
            <AlertDialogDescription>
              S'eliminaran els {eliminarConfirm?.total} registres d'assistència d'aquest dia. Aquesta acció no es pot desfer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminantLoading}>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarEliminar} disabled={eliminantLoading}>
              {eliminantLoading ? "Eliminant…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
