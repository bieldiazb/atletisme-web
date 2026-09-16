import { useEffect, useState, useMemo } from "react"
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { categoriaPerAny } from "@/lib/categoria"
import { agruparProvesPerTipus } from "@/lib/proves"

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Activity,
  Star,
  Users,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/* ================= HELPERS ================= */

function parseMarca(marca) {
  if (!marca) return null
  // Elimina suffix "s" (segons) o "m" (metres) al final
  const clean = marca.toString().trim().replace(/\s*(s|m)\s*$/i, "").replace(",", ".")
  if (clean.includes(":")) {
    const [min, sec] = clean.split(":")
    return Number(min) * 60 + Number(sec)
  }
  const v = parseFloat(clean)
  return isNaN(v) ? null : v
}

// Detecta si la marca és un temps pel sufix "s" o format mm:ss
function marcaEsTemps(marca) {
  if (!marca) return null
  const m = marca.toString().trim()
  if (/\s*s\s*$/i.test(m)) return true   // "10.25 s" → temps
  if (/\s*m\s*$/i.test(m)) return false  // "20.54 m" → distància
  if (m.includes(":")) return true       // "1:23.4" → temps
  return null
}

function formatMarca(value, tipusPrimitiu) {
  if (value == null) return "—"
  if (tipusPrimitiu === "temps") {
    const m = Math.floor(value / 60)
    const s = (value % 60).toFixed(2).padStart(5, "0")
    return m > 0 ? `${m}:${s}` : `${s} s`
  }
  return `${value.toFixed(2)} m`
}

function isTempsProva(tipus, marca) {
  const pesMarca = marcaEsTemps(marca)
  if (pesMarca !== null) return pesMarca
  return ["velocitat", "fons", "marxa"].includes(tipus)
}

function calcTendencia(data, tipusPrimitiu) {
  if (data.length < 2) return "neutral"
  const first = data[0].value
  const last = data[data.length - 1].value
  if (first == null || last == null) return "neutral"
  return (tipusPrimitiu === "temps" ? first > last : last > first) ? "up" : "down"
}

const TIPUS_EMOJI = { velocitat:"⚡", fons:"🏃", salt:"🦘", "llançament":"🎯", marxa:"🚶" }

function CustomTooltip({ active, payload, label, tipusPrimitiu }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border bg-card shadow-lg px-3 py-2 text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <p className="font-black text-primary">{formatMarca(payload[0].value, tipusPrimitiu)}</p>
    </div>
  )
}

/* ================= COMPONENT ================= */

export default function AdminEstadistiquesSection() {
  const { esAdmin, filtraCat } = useUser()

  // Dades globals
  const [athletes, setAthletes] = useState([])
  const [provesMap, setProvesMap] = useState({})
  const [eventsMap, setEventsMap] = useState({})
  const [allMarques, setAllMarques] = useState({}) // { atletaId: [...marques] }
  const [loadingGlobal, setLoadingGlobal] = useState(true)

  // Selectors
  const [atletaSeleccionat, setAtletaSeleccionat] = useState(null)
  const [provaSeleccionada, setProvaSeleccionada] = useState(null)
  const [pistaFiltre, setPistaFiltre] = useState("totes") // "totes" | "coberta" | "aire_lliure"

  /* ===== CÀRREGA GLOBAL ===== */
  useEffect(() => {
    const load = async () => {
      setLoadingGlobal(true)

      const [athletesSnap, provesSnap, eventsSnap, marquesSnap] = await Promise.all([
        getDocs(collection(db, "athletes")),
        getDocs(collection(db, "proves")),
        getDocs(collection(db, "events")),
        getDocs(collection(db, "marques")),
      ])

      const atletesAll = athletesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => a.actiu !== false)
        .sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? "", "ca"))
      // Filtra per categoria del rol
      const atletesData = filtraCat(atletesAll, "categoria")

      const pMap = {}
      provesSnap.docs.forEach(d => (pMap[d.id] = d.data()))
      const eMap = {}
      eventsSnap.docs.forEach(d => (eMap[d.id] = d.data()))

      // Agrupar marques per atleta
      const mByAtleta = {}
      marquesSnap.docs.forEach(d => {
        const m = { id: d.id, ...d.data() }
        if (!m.data) return
        if (!mByAtleta[m.atletaId]) mByAtleta[m.atletaId] = []
        mByAtleta[m.atletaId].push(m)
      })
      // Ordenar per data
      Object.keys(mByAtleta).forEach(id => {
        mByAtleta[id].sort((a, b) => a.data.toDate() - b.data.toDate())
      })

      // Filtra atletes per categoria del rol
      setAthletes(atletesData)
      setProvesMap(pMap)
      setEventsMap(eMap)
      setAllMarques(mByAtleta)

      // Seleccionar primer atleta per defecte
      if (atletesData.length > 0) {
        const first = atletesData[0].id
        setAtletaSeleccionat(first)
        // Prova amb més registres
        const count = {}
        ;(mByAtleta[first] ?? []).forEach(m => {
          count[m.provaId] = (count[m.provaId] || 0) + 1
        })
        const bestProva = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0]
        setProvaSeleccionada(bestProva ?? null)
      }

      setLoadingGlobal(false)
    }
    load()
  }, [])

  // Quan canvia l'atleta, actualitzar la prova per defecte
  const handleAtletaChange = (id) => {
    setAtletaSeleccionat(id)
    const marques = allMarques[id] ?? []
    const count = {}
    marques.forEach(m => { count[m.provaId] = (count[m.provaId] || 0) + 1 })
    const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0]
    setProvaSeleccionada(best ?? null)
  }

  /* ===== DADES DERIVADES PER L'ATLETA SELECCIONAT ===== */

  const marquesAtleta = useMemo(() => {
    const totes = allMarques[atletaSeleccionat] ?? []
    if (pistaFiltre === "totes") return totes
    return totes.filter((m) => eventsMap[m.eventId]?.tipusPista === pistaFiltre)
  }, [allMarques, atletaSeleccionat, pistaFiltre, eventsMap])

  const provesAmbDades = useMemo(() => {
    const ids = [...new Set(marquesAtleta.map(m => m.provaId))]
    return agruparProvesPerTipus(ids.map(id => ({ id, ...provesMap[id] })).filter(p => p.nom))
  }, [marquesAtleta, provesMap])

  const evolucioData = useMemo(() => {
    if (!provaSeleccionada) return []
    return marquesAtleta
      .filter(m => m.provaId === provaSeleccionada)
      .map(m => ({
        label: m.data.toDate().toLocaleDateString("ca-ES", { day: "2-digit", month: "short" }),
        event: eventsMap[m.eventId]?.title ?? "—",
        value: parseMarca(m.marca),
        marcaText: m.marca,
      }))
  }, [marquesAtleta, provaSeleccionada, eventsMap])

  const millorPerProva = useMemo(() => {
    const byProva = {}
    marquesAtleta.forEach(m => {
      const val = parseMarca(m.marca)
      if (val == null) return
      const tipus = provesMap[m.provaId]?.tipus
      const nom = provesMap[m.provaId]?.nom
      if (!nom) return
      if (!byProva[m.provaId]) {
        byProva[m.provaId] = { nom, tipus, value: val, marcaRef: m.marca }
      } else {
        const isTem = isTempsProva(tipus, m.marca)
        if (isTem ? val < byProva[m.provaId].value : val > byProva[m.provaId].value) {
          byProva[m.provaId].value = val
          byProva[m.provaId].marcaRef = m.marca
        }
      }
    })
    return Object.values(byProva)
  }, [marquesAtleta, provesMap])

  const activitatMensual = useMemo(() => {
    const byMonth = {}
    marquesAtleta.forEach(m => {
      const d = m.data.toDate()
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = d.toLocaleDateString("ca-ES", { month: "short", year: "2-digit" })
      if (!byMonth[key]) byMonth[key] = { label, count: 0 }
      byMonth[key].count++
    })
    return Object.values(byMonth)
  }, [marquesAtleta])

  const provaActual = provesMap[provaSeleccionada]
  const primeraMaraProva = evolucioData[0]?.marcaText ?? null
  const tipusPrimitiu = isTempsProva(provaActual?.tipus, primeraMaraProva) ? "temps" : "distancia"
  const tendencia = calcTendencia(evolucioData, tipusPrimitiu)

  const millorMarca = useMemo(() => {
    if (!evolucioData.length) return null
    return evolucioData.reduce((best, cur) => {
      if (!best) return cur
      return (tipusPrimitiu === "temps" ? cur.value < best.value : cur.value > best.value) ? cur : best
    }, null)
  }, [evolucioData, tipusPrimitiu])

  const ultimaMarca = evolucioData[evolucioData.length - 1]

  const atletaActual = athletes.find(a => a.id === atletaSeleccionat)
  const anyNaix = atletaActual?.naixement?.toDate?.()?.getFullYear()
  const categoria = anyNaix ? categoriaPerAny(anyNaix) : "—"

  /* ===== RENDER ===== */
  if (loadingGlobal) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Carregant estadístiques…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/10 p-3">
          <BarChart2 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-black">Estadístiques</h2>
          <p className="text-sm text-muted-foreground">{filtraCat(athletes, "categoria").length} atletes amb dades</p>
        </div>
      </div>

      {/* ===== SELECTOR D'ATLETA ===== */}
      <div className="rounded-2xl border bg-card shadow-sm p-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground min-w-fit">
            <Users className="h-4 w-4" /> Atleta
          </div>
          <Select value={atletaSeleccionat ?? ""} onValueChange={handleAtletaChange}>
            <SelectTrigger className="w-full sm:w-72 rounded-xl">
              <SelectValue placeholder="Selecciona atleta" />
            </SelectTrigger>
            <SelectContent>
              {filtraCat(athletes, "categoria").map(a => {
                const any = a.naixement?.toDate?.()?.getFullYear()
                const cat = any ? categoriaPerAny(any) : ""
                return (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-medium">{a.nom}</span>
                    {cat && <span className="ml-2 text-xs text-muted-foreground">· {cat}</span>}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>

          {/* Filtre per tipus de pista — afecta totes les dades i gràfics de sota */}
          <Select value={pistaFiltre} onValueChange={setPistaFiltre}>
            <SelectTrigger className="w-full sm:w-48 rounded-xl">
              <SelectValue placeholder="Pista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="totes">Tots els tipus</SelectItem>
              <SelectItem value="coberta">Coberta</SelectItem>
              <SelectItem value="aire_lliure">Aire lliure</SelectItem>
              <SelectItem value="cross">Cross</SelectItem>
              <SelectItem value="marxa_ruta">Marxa en ruta</SelectItem>
            </SelectContent>
          </Select>

          {/* Info ràpida de l'atleta */}
          {atletaActual && (
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {categoria}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {marquesAtleta.length} marques
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {new Set(marquesAtleta.map(m => m.eventId)).size} competicions
              </span>
            </div>
          )}
        </div>
      </div>

      {marquesAtleta.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground rounded-2xl border bg-card">
          <Activity className="h-10 w-10 opacity-30" />
          <p className="text-sm">Aquest atleta no té marques registrades.</p>
        </div>
      ) : (
        <>
          {/* ===== EVOLUCIÓ ===== */}
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b bg-muted/30">
              <div className="flex items-center gap-2 flex-1">
                <Activity className="h-5 w-5 text-primary" />
                <h3 className="font-bold">Evolució de marca</h3>
              </div>
              <Select value={provaSeleccionada ?? ""} onValueChange={setProvaSeleccionada}>
                <SelectTrigger className="w-full sm:w-52 rounded-xl">
                  <SelectValue placeholder="Selecciona prova" />
                </SelectTrigger>
                <SelectContent>
                  {provesAmbDades.map(grup => (
                    <SelectGroup key={grup.tipus}>
                      <SelectLabel>{grup.etiqueta}</SelectLabel>
                      {grup.proves.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {TIPUS_EMOJI[p.tipus] || "🏅"} {p.nom}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-5 space-y-4">
              {evolucioData.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-center">
                    <p className="text-xs text-amber-600 font-semibold mb-1">🥇 Millor</p>
                    <p className="text-xl font-black text-amber-700">{millorMarca?.marcaText}</p>
                    <p className="text-xs text-amber-500 truncate mt-0.5">{millorMarca?.event}</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-center">
                    <p className="text-xs text-blue-600 font-semibold mb-1">⏱ Última</p>
                    <p className="text-xl font-black text-blue-700">{ultimaMarca?.marcaText}</p>
                    <p className="text-xs text-blue-500 truncate mt-0.5">{ultimaMarca?.label}</p>
                  </div>
                  <div className={`rounded-xl border px-4 py-3 text-center ${
                    tendencia === "up" ? "bg-green-50 border-green-100"
                    : tendencia === "down" ? "bg-red-50 border-red-100"
                    : "bg-slate-50 border-slate-100"
                  }`}>
                    <p className={`text-xs font-semibold mb-1 ${
                      tendencia === "up" ? "text-green-600"
                      : tendencia === "down" ? "text-red-600"
                      : "text-slate-500"
                    }`}>Tendència</p>
                    <div className="flex justify-center">
                      {tendencia === "up" ? <TrendingUp className="h-8 w-8 text-green-500" />
                      : tendencia === "down" ? <TrendingDown className="h-8 w-8 text-red-400" />
                      : <Minus className="h-8 w-8 text-slate-400" />}
                    </div>
                    <p className={`text-xs mt-0.5 ${
                      tendencia === "up" ? "text-green-600"
                      : tendencia === "down" ? "text-red-500"
                      : "text-slate-400"
                    }`}>
                      {tendencia === "up" ? "Millorant!" : tendencia === "down" ? "A treballar" : "Estable"}
                    </p>
                  </div>
                </div>
              )}

              {evolucioData.length >= 2 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={evolucioData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                      tickFormatter={v => formatMarca(v, tipusPrimitiu)}
                      width={55}
                      domain={["auto", "auto"]}
                      reversed={tipusPrimitiu === "temps"}
                    />
                    <Tooltip content={<CustomTooltip tipusPrimitiu={tipusPrimitiu} />} />
                    <Line
                      type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5}
                      dot={{ r: 4, fill: "#6366f1", strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: "#6366f1" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-24 text-muted-foreground">
                  <p className="text-sm">Cal mínim 2 registres per veure l'evolució.</p>
                </div>
              )}
            </div>
          </div>

          {/* ===== MILLORS MARQUES PER PROVA (TAULA) ===== */}
          {millorPerProva.length > 0 && (
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/30">
                <Star className="h-5 w-5 text-amber-500" />
                <h3 className="font-bold">Millors marques per prova</h3>
                <span className="ml-auto text-xs text-muted-foreground">{millorPerProva.length} proves</span>
              </div>
              <div className="divide-y">
                {millorPerProva.map((p, i) => {
                  const tp = isTempsProva(p.tipus, p.marcaRef) ? "temps" : "distancia"
                  const emoji = TIPUS_EMOJI[p.tipus] || "🏅"
                  return (
                    <div key={p.nom} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                      <div className="w-6 text-center flex-shrink-0">
                        {i === 0 ? <span className="text-lg">🥇</span>
                        : i === 1 ? <span className="text-lg">🥈</span>
                        : i === 2 ? <span className="text-lg">🥉</span>
                        : <span className="text-sm text-muted-foreground font-medium">{i + 1}</span>}
                      </div>
                      <span className="text-base">{emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{p.nom}</p>
                        <p className="text-xs text-muted-foreground capitalize">{p.tipus}</p>
                      </div>
                      <p className="font-black text-primary text-lg flex-shrink-0">
                        {formatMarca(p.value, tp)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ===== ACTIVITAT MENSUAL ===== */}
          {activitatMensual.length > 1 && (
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/30">
                <Activity className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold">Activitat competitiva</h3>
                <span className="ml-auto text-xs text-muted-foreground">marques per mes</span>
              </div>
              <div className="p-5">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={activitatMensual} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={25} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="rounded-xl border bg-card shadow-lg px-3 py-2 text-sm">
                            <p className="text-muted-foreground text-xs">{label}</p>
                            <p className="font-bold text-primary">{payload[0].value} marques</p>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}