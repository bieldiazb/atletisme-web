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
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { CalendarIcon, Check, X, Loader2, ClipboardCheck } from "lucide-react"
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

function dataISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export default function PassarLlistaSection() {
  const { esAdmin, categories: catUsuari } = useUser()
  const { toast } = useToast()

  const categoriesDisponibles = esAdmin ? TOTES_CATEGORIES : catUsuari

  const [categoria, setCategoria] = useState(categoriesDisponibles[0] ?? "")
  const [data, setData] = useState(new Date())
  const [athletes, setAthletes] = useState([])
  const [presencia, setPresencia] = useState({}) // { athleteId: boolean }
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [jaGuardat, setJaGuardat] = useState(false)

  useEffect(() => {
    if (!categoria) return

    const load = async () => {
      setLoading(true)
      try {
        const iso = dataISO(data)
        const [snapAtletes, snapAssist] = await Promise.all([
          getDocs(query(collection(db, "athletes"), where("categoria", "==", categoria))),
          getDocs(query(
            collection(db, "assistencies"),
            where("dataISO", "==", iso),
            where("categoria", "==", categoria)
          )),
        ])

        const llistaAtletes = snapAtletes.docs
          .map((d) => ({ id: d.id, nom: d.data().nom }))
          .sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? "", "ca"))

        const existent = {}
        snapAssist.docs.forEach((d) => {
          existent[d.data().athleteId] = d.data().present
        })

        const inicial = {}
        llistaAtletes.forEach((a) => {
          // Per defecte marquem tothom present — normalment cal desmarcar
          // només els absents, que sol ser més ràpid.
          inicial[a.id] = a.id in existent ? existent[a.id] : true
        })

        setAthletes(llistaAtletes)
        setPresencia(inicial)
        setJaGuardat(snapAssist.size > 0)
      } catch {
        toast({ variant: "destructive", title: "Error", description: "No s'ha pogut carregar la llista" })
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [categoria, data])

  const togglePresencia = (id) =>
    setPresencia((prev) => ({ ...prev, [id]: !prev[id] }))

  const marcarTots = (valor) => {
    const next = {}
    athletes.forEach((a) => { next[a.id] = valor })
    setPresencia(next)
  }

  const guardar = async () => {
    if (athletes.length === 0) return
    setSaving(true)
    try {
      const iso = dataISO(data)
      const registres = athletes.map((a) => ({
        id: `${iso}_${categoria}_${a.id}`,
        present: !!presencia[a.id],
        athleteId: a.id,
        athleteNom: a.nom ?? "",
        categoria,
        dataISO: iso,
        data: Timestamp.fromDate(new Date(data.getFullYear(), data.getMonth(), data.getDate())),
        actualitzat: Timestamp.now(),
      }))

      for (const group of chunk(registres, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach((r) => batch.set(doc(db, "assistencies", r.id), r))
        await batch.commit()
      }

      const presents = registres.filter((r) => r.present).length
      toast({
        title: "Assistència desada",
        description: `${presents}/${registres.length} presents el ${format(data, "dd/MM/yyyy")}`,
      })
      setJaGuardat(true)
    } catch {
      toast({ variant: "destructive", title: "Error desant", description: "Torna-ho a provar" })
    } finally {
      setSaving(false)
    }
  }

  const presentsCount = athletes.filter((a) => presencia[a.id]).length

  if (categoriesDisponibles.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Passar llista</h1>
        <p className="text-sm text-muted-foreground">No tens cap categoria assignada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Passar llista</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Marca l'assistència de la sessió d'avui (o d'un altre dia) per categoria
        </p>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            {categoriesDisponibles.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start text-left font-normal capitalize">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(data, "EEEE d MMMM", { locale: ca })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={data}
              onSelect={(d) => d && setData(d)}
              initialFocus
              locale={ca}
            />
          </PopoverContent>
        </Popover>
      </div>

      {jaGuardat && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Ja hi ha una assistència desada per aquest dia i categoria. Si guardes, se sobreescriurà.
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : athletes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No hi ha atletes en aquesta categoria.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{presentsCount}/{athletes.length} presents</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => marcarTots(true)}>Tots presents</Button>
              <Button size="sm" variant="outline" onClick={() => marcarTots(false)}>Tots absents</Button>
            </div>
          </div>

          <div className="space-y-2">
            {athletes.map((a) => {
              const present = !!presencia[a.id]
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => togglePresencia(a.id)}
                  className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
                    present
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-rose-300 bg-rose-50"
                  }`}
                >
                  <span className="font-medium">{a.nom}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                    present ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                  }`}>
                    {present ? <><Check className="h-3.5 w-3.5" /> Present</> : <><X className="h-3.5 w-3.5" /> Absent</>}
                  </span>
                </button>
              )
            })}
          </div>

          <Button className="w-full" size="lg" onClick={guardar} disabled={saving}>
            {saving
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Desant…</>
              : <><ClipboardCheck className="mr-2 h-4 w-4" /> Desar assistència</>
            }
          </Button>
        </>
      )}
    </div>
  )
}
