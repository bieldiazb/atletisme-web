import { useEffect, useState, useMemo } from "react"
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"

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
  UsersRound,
  Home,
  Sun,
  TreePine,
  Route,
} from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
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

// Valors menors = millors (temps) → tendència positiva si baixa
function calcTendencia(data, tipusPrimitiu) {
  if (data.length < 2) return "neutral"
  const first = data[0].value
  const last = data[data.length - 1].value
  if (first == null || last == null) return "neutral"
  const millora = tipusPrimitiu === "temps" ? first > last : last > first
  return millora ? "up" : "down"
}



const TIPUS_EMOJI = {
  velocitat:  "⚡",
  fons:       "🏃",
  salt:       "🦘",
  llancament: "🎯",
  marxa:      "🚶",
  relleus:    "🤝",
}

// Ha d'anar en línia amb el mateix llistat a EventsSection.jsx / CalendariSection.jsx.
const TIPUS_PISTA = [
  { value: "coberta", label: "Coberta", icon: Home },
  { value: "aire_lliure", label: "Aire lliure", icon: Sun },
  { value: "cross", label: "Cross", icon: TreePine },
  { value: "marxa_ruta", label: "Marxa en ruta", icon: Route },
]

/* ================= CUSTOM TOOLTIP ================= */

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

export default function EstadistiquesSection({ athleteId, temporada }) {
  const [marques, setMarques] = useState([])
  const [proves, setProves] = useState({})
  const [events, setEvents] = useState({})
  const [loading, setLoading] = useState(true)
  const [provaSeleccionada, setProvaSeleccionada] = useState(null)
  const [pistaFilter, setPistaFilter] = useState("totes")

  useEffect(() => {
    if (!athleteId) return
    const load = async () => {
      setLoading(true)
      const [snapInd, snapRelleu, provesSnap, eventsSnap] = await Promise.all([
        getDocs(query(collection(db, "marques"), where("atletaId", "==", athleteId))),
        getDocs(query(collection(db, "marques_relleu"), where("atletaIds", "array-contains", athleteId))),
        getDocs(collection(db, "proves")),
        getDocs(collection(db, "events")),
      ])

      const provesMap = {}
      provesSnap.docs.forEach(d => (provesMap[d.id] = d.data()))
      const eventsMap = {}
      eventsSnap.docs.forEach(d => (eventsMap[d.id] = d.data()))

      // Unim marques individuals i de relleu (mateixa forma: provaId, marca, data,
      // eventId) perquè les estadístiques les tractin totes juntes. Només la
      // temporada seleccionada, i hi afegim el tipus de pista de l'event perquè
      // el filtre de pista hi pugui filtrar.
      const individuals = snapInd.docs.map(d => ({ id: d.id, ...d.data(), esRelleu: false }))
      const relleus = snapRelleu.docs.map(d => ({ id: d.id, ...d.data(), esRelleu: true }))

      const data = [...individuals, ...relleus]
        .filter(m => m.data)
        .filter(m => m.data.toDate().getFullYear() === temporada)
        .map(m => ({ ...m, tipusPista: eventsMap[m.eventId]?.tipusPista ?? null }))
        .sort((a, b) => a.data.toDate() - b.data.toDate())

      setMarques(data)
      setProves(provesMap)
      setEvents(eventsMap)

      // seleccionar la prova amb més registres per defecte
      const count = {}
      data.forEach(m => { count[m.provaId] = (count[m.provaId] || 0) + 1 })
      const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0]
      setProvaSeleccionada(best ?? null)

      setLoading(false)
    }
    load()
  }, [athleteId, temporada])

  /* ===== DADES DERIVADES ===== */

  // Marques (individuals + relleu) filtrades pel tipus de pista seleccionat.
  const marquesFiltrades = useMemo(() => {
    if (pistaFilter === "totes") return marques
    return marques.filter(m => m.tipusPista === pistaFilter)
  }, [marques, pistaFilter])

  // Llista de proves úniques amb registres
  const provesAmbDades = useMemo(() => {
    const ids = [...new Set(marquesFiltrades.map(m => m.provaId))]
    return ids
      .map(id => ({ id, ...proves[id] }))
      .filter(p => p.nom)
  }, [marquesFiltrades, proves])

  // Evolució temporal de la prova seleccionada
  const evolucioData = useMemo(() => {
    if (!provaSeleccionada) return []
    return marquesFiltrades
      .filter(m => m.provaId === provaSeleccionada)
      .map(m => ({
        label: m.data.toDate().toLocaleDateString("ca-ES", { day: "2-digit", month: "short" }),
        event: events[m.eventId]?.title ?? "—",
        value: parseMarca(m.marca),
        marcaText: m.marca,
        esRelleu: m.esRelleu,
      }))
  }, [marquesFiltrades, provaSeleccionada, events])

  // Millors marques per prova (bar chart)
  const millorPerProva = useMemo(() => {
    const byProva = {}
    marquesFiltrades.forEach(m => {
      const val = parseMarca(m.marca)
      if (val == null) return
      const tipus = proves[m.provaId]?.tipus
      const nom = proves[m.provaId]?.nom
      if (!nom) return
      if (!byProva[m.provaId]) {
        byProva[m.provaId] = { nom, tipus, value: val, marcaRef: m.marca, esRelleu: m.esRelleu }
      } else {
        const isTem = isTempsProva(tipus, m.marca)
        if (isTem ? val < byProva[m.provaId].value : val > byProva[m.provaId].value) {
          byProva[m.provaId].value = val
          byProva[m.provaId].esRelleu = m.esRelleu
        }
      }
    })
    return Object.values(byProva)
  }, [marquesFiltrades, proves])

  // Activitat per mes (quantes marques)
  const activitatMensual = useMemo(() => {
    const byMonth = {}
    marquesFiltrades.forEach(m => {
      const d = m.data.toDate()
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = d.toLocaleDateString("ca-ES", { month: "short", year: "2-digit" })
      if (!byMonth[key]) byMonth[key] = { label, count: 0 }
      byMonth[key].count++
    })
    return Object.values(byMonth)
  }, [marquesFiltrades])

  const provaActual = proves[provaSeleccionada]
  const primeraMaraProva = evolucioData[0]?.marcaText ?? null
  const tipusPrimitiu = isTempsProva(provaActual?.tipus, primeraMaraProva) ? "temps" : "distancia"
  const tendencia = calcTendencia(evolucioData, tipusPrimitiu)

  /* ===== MILLOR I ÚLTIMA MARCA ===== */
  const millorMarca = useMemo(() => {
    if (!evolucioData.length) return null
    return evolucioData.reduce((best, cur) => {
      if (best == null) return cur
      const isTem = tipusPrimitiu === "temps"
      return (isTem ? cur.value < best.value : cur.value > best.value) ? cur : best
    }, null)
  }, [evolucioData, tipusPrimitiu])

  const ultimaMarca = evolucioData[evolucioData.length - 1]

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Carregant estadístiques…</p>
      </div>
    </div>
  )

  if (marques.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
      <BarChart2 className="h-12 w-12 opacity-30" />
      <p className="text-sm">Sense dades per mostrar estadístiques de la temporada {temporada}.</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3">
            <BarChart2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black">Estadístiques</h2>
            <p className="text-sm text-muted-foreground">Evolució i millors marques{marques.some(m => m.esRelleu) ? " (individuals i relleus)" : ""}</p>
          </div>
        </div>

        {/* Filtre per tipus de pista */}
        <Select value={pistaFilter} onValueChange={setPistaFilter}>
          <SelectTrigger className="w-full sm:w-44 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="totes">Totes les pistes</SelectItem>
            {TIPUS_PISTA.map(p => (
              <SelectItem key={p.value} value={p.value}>
                <span className="inline-flex items-center gap-1.5">
                  <p.icon className="h-3.5 w-3.5" />
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {marquesFiltrades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <BarChart2 className="h-12 w-12 opacity-30" />
          <p className="text-sm">Cap marca amb aquest tipus de pista.</p>
        </div>
      ) : (
      <>

      {/* ===== EVOLUCIÓ PER PROVA ===== */}
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
              {provesAmbDades.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {TIPUS_EMOJI[p.tipus] || "🏅"} {p.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="p-5 space-y-4">
          {/* Mini stats */}
          {evolucioData.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {/* Millor marca */}
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-center">
                <p className="text-xs text-amber-600 font-semibold mb-1">🥇 Millor</p>
                <p className="text-xl font-black text-amber-700">{millorMarca?.marcaText}</p>
                <p className="text-xs text-amber-500 truncate mt-0.5">
                  {millorMarca?.esRelleu ? "🤝 " : ""}{millorMarca?.event}
                </p>
              </div>
              {/* Última marca */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-center">
                <p className="text-xs text-blue-600 font-semibold mb-1">⏱ Última</p>
                <p className="text-xl font-black text-blue-700">{ultimaMarca?.marcaText}</p>
                <p className="text-xs text-blue-500 truncate mt-0.5">
                  {ultimaMarca?.esRelleu ? "🤝 " : ""}{ultimaMarca?.label}
                </p>
              </div>
              {/* Tendència */}
              <div className={`rounded-xl border px-4 py-3 text-center ${
                tendencia === "up"
                  ? "bg-green-50 border-green-100"
                  : tendencia === "down"
                  ? "bg-red-50 border-red-100"
                  : "bg-slate-50 border-slate-100"
              }`}>
                <p className={`text-xs font-semibold mb-1 ${
                  tendencia === "up" ? "text-green-600"
                  : tendencia === "down" ? "text-red-600"
                  : "text-slate-500"
                }`}>Tendència</p>
                <div className="flex justify-center">
                  {tendencia === "up"
                    ? <TrendingUp className="h-8 w-8 text-green-500" />
                    : tendencia === "down"
                    ? <TrendingDown className="h-8 w-8 text-red-400" />
                    : <Minus className="h-8 w-8 text-slate-400" />
                  }
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

          {/* Line chart */}
          {evolucioData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={evolucioData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => formatMarca(v, tipusPrimitiu)}
                  width={55}
                  domain={["auto", "auto"]}
                  reversed={tipusPrimitiu === "temps"}
                />
                <Tooltip content={<CustomTooltip tipusPrimitiu={tipusPrimitiu} />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#6366f1", strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: "#6366f1" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-28 text-muted-foreground gap-2">
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
                    <p className="font-semibold text-sm flex items-center gap-1.5">
                      {p.nom}
                      {p.esRelleu && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium px-1.5 py-0.5">
                          <UsersRound className="h-2.5 w-2.5" />
                          relleu
                        </span>
                      )}
                    </p>
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
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={25}
                />
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