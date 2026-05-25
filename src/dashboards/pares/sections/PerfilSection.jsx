import { useEffect, useState } from "react"
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Trophy, Activity, Calendar, Medal, Star, Zap, Target, TrendingUp } from "lucide-react"

/* ================= HELPERS ================= */

function calcularEdat(date) {
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const m = today.getMonth() - date.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--
  return age
}

function categoriaPerAny(any) {
  if (any >= 2019) return "Sub-8"
  if (any >= 2017) return "Sub-10"
  if (any >= 2015) return "Sub-12"
  if (any >= 2013) return "Sub-14"
  if (any >= 2011) return "Sub-16"
  if (any >= 2009) return "Sub-18"
  return "Absolut"
}

function parseMarca(marca) {
  if (!marca) return null
  if (marca.includes(":")) {
    const [m, s] = marca.split(":")
    return Number(m) * 60 + Number(s)
  }
  return parseFloat(marca.replace(",", "."))
}

function esMillorMarca(a, b, tipus) {
  const va = parseMarca(a.marca)
  const vb = parseMarca(b.marca)
  if (va == null || vb == null) return false
  if (["velocitat", "fons", "marxa"].includes(tipus)) return va < vb
  if (["salt", "llancament"].includes(tipus)) return va > vb
  return false
}

function getInitials(nom) {
  return nom
    ?.split(" ")
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase() || "?"
}

function getCategoryColor(cat) {
  const map = {
    "Sub-8":  { bg: "from-pink-400 to-rose-500",    light: "bg-rose-50 text-rose-700 border-rose-200" },
    "Sub-10": { bg: "from-orange-400 to-amber-500",  light: "bg-amber-50 text-amber-700 border-amber-200" },
    "Sub-12": { bg: "from-green-400 to-emerald-500", light: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    "Sub-14": { bg: "from-blue-400 to-cyan-500",     light: "bg-cyan-50 text-cyan-700 border-cyan-200" },
    "Sub-16": { bg: "from-violet-400 to-purple-500", light: "bg-violet-50 text-violet-700 border-violet-200" },
    "Sub-18": { bg: "from-slate-500 to-slate-700",   light: "bg-slate-50 text-slate-700 border-slate-200" },
    "Absolut":{ bg: "from-yellow-400 to-orange-500", light: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  }
  return map[cat] || map["Absolut"]
}

/* ================= COMPONENT ================= */

export default function PerfilSection({ athleteId }) {
  const [athlete, setAthlete] = useState(null)
  const [stats, setStats] = useState(null)
  const [bestMarks, setBestMarks] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!athleteId) return
    const load = async () => {
      setLoading(true)
      const athleteSnap = await getDoc(doc(db, "athletes", athleteId))
      if (!athleteSnap.exists()) return

      const athleteData = athleteSnap.data()
      const birthDate = athleteData.naixement.toDate()
      const anyNaixement = birthDate.getFullYear()
      const edat = calcularEdat(birthDate)

      const q = query(collection(db, "marques"), where("atletaId", "==", athleteId))
      const marquesSnap = await getDocs(q)
      const marques = marquesSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      const provesSnap = await getDocs(collection(db, "proves"))
      const eventsSnap = await getDocs(collection(db, "events"))

      const provesMap = {}
      provesSnap.docs.forEach(d => (provesMap[d.id] = d.data()))
      const eventsMap = {}
      eventsSnap.docs.forEach(d => (eventsMap[d.id] = d.data()))

      const enriched = marques.map(m => ({
        ...m,
        prova: provesMap[m.provaId],
        event: eventsMap[m.eventId],
      }))

      const historySorted = enriched
        .filter(m => m.data)
        .sort((a, b) => b.data.toDate() - a.data.toDate())

      const byProva = {}
      enriched.forEach(m => {
        if (!byProva[m.provaId]) byProva[m.provaId] = []
        byProva[m.provaId].push(m)
      })

      const best = Object.values(byProva).map(list => {
        let millor = list[0]
        list.forEach(m => {
          if (esMillorMarca(m, millor, m.prova?.tipus)) millor = m
        })
        return millor
      })

      const tipusCount = {}
      enriched.forEach(m => {
        const t = m.prova?.tipus
        if (!t) return
        tipusCount[t] = (tipusCount[t] || 0) + 1
      })

      const especialitat =
        Object.entries(tipusCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"

      setAthlete({
        ...athleteData,
        edat,
        anyNaixement,
        categoria: categoriaPerAny(anyNaixement),
        birthDate,
      })
      setStats({
        totalCompeticions: new Set(marques.map(m => m.eventId)).size,
        totalMarques: marques.length,
        totalProves: new Set(marques.map(m => m.provaId)).size,
        especialitat,
      })
      setBestMarks(best)
      setHistory(historySorted)
      setLoading(false)
    }
    load()
  }, [athleteId])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Carregant perfil…</p>
      </div>
    </div>
  )
  if (!athlete) return <p className="text-muted-foreground text-center py-12">Atleta no disponible</p>

  const colors = getCategoryColor(athlete.categoria)
  const initials = getInitials(athlete.nom)

  return (
    <div className="space-y-6 w-full">

      {/* ===== HERO CARD ===== */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${colors.bg} p-6 text-white shadow-xl`}>
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute top-1/2 right-24 h-16 w-16 rounded-full bg-white/5" />

        <div className="relative flex items-center gap-5">
          {/* Avatar */}
          <div className="flex-shrink-0 h-20 w-20 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center shadow-lg">
            <span className="text-3xl font-black tracking-tight">{initials}</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black truncate leading-tight">{athlete.nom}</h1>
            <p className="text-white/75 text-sm mt-0.5">{athlete.codiPublic}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-3 py-1 text-xs font-semibold backdrop-blur">
                <Star className="h-3 w-3" /> {athlete.categoria}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-3 py-1 text-xs font-semibold backdrop-blur">
                <Calendar className="h-3 w-3" /> Nasc. {athlete.anyNaixement}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-3 py-1 text-xs font-semibold backdrop-blur">
                {athlete.sexe === "M" ? "♂" : "♀"} {athlete.edat} anys
              </span>
              {!athlete.actiu && (
                <span className="inline-flex items-center rounded-full bg-black/30 px-3 py-1 text-xs font-semibold">
                  Inactiu
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== STATS ROW ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Trophy, value: stats.totalCompeticions, label: "Competicions", color: "text-amber-500" },
          { icon: Activity, value: stats.totalMarques, label: "Marques registrades", color: "text-blue-500" },
          { icon: Target, value: stats.totalProves, label: "Proves diferents", color: "text-green-500" },
          { icon: Zap, value: stats.especialitat, label: "Especialitat", color: "text-violet-500" },
        ].map(({ icon: Icon, value, label, color }) => (
          <div key={label} className="rounded-2xl border bg-card p-4 flex flex-col items-center text-center gap-1 shadow-sm hover:shadow-md transition-shadow">
            <div className={`rounded-xl p-2 ${color} bg-current/10`} style={{ background: "color-mix(in srgb, currentColor 10%, transparent)" }}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-xl font-black mt-1 leading-none">{value}</p>
            <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* ===== MILLORS MARQUES ===== */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/30">
          <Medal className="h-5 w-5 text-amber-500" />
          <h2 className="font-bold text-base">Millors marques</h2>
          <span className="ml-auto text-xs text-muted-foreground">{bestMarks.length} proves</span>
        </div>

        {bestMarks.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Sense marques registrades</p>
        ) : (
          <div className="divide-y">
            {bestMarks.map((m, i) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                <div className="w-6 text-center">
                  {i === 0 ? <span className="text-lg">🥇</span>
                  : i === 1 ? <span className="text-lg">🥈</span>
                  : i === 2 ? <span className="text-lg">🥉</span>
                  : <span className="text-sm text-muted-foreground font-medium">{i + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{m.prova?.nom}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.event?.title}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-primary text-lg leading-none">{m.marca}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m.data?.toDate().toLocaleDateString("ca-ES", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== HISTORIAL ===== */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/30">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          <h2 className="font-bold text-base">Historial de competicions</h2>
          <span className="ml-auto text-xs text-muted-foreground">{history.length} registres</span>
        </div>

        {history.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Sense historial</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left font-medium px-5 py-2.5">Data</th>
                  <th className="text-left font-medium px-3 py-2.5">Competicio</th>
                  <th className="text-left font-medium px-3 py-2.5">Prova</th>
                  <th className="text-right font-medium px-5 py-2.5">Marca</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((m, i) => (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {m.data?.toDate().toLocaleDateString("ca-ES", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3 py-3 font-medium max-w-[160px] truncate">{m.event?.title}</td>
                    <td className="px-3 py-3 text-muted-foreground">{m.prova?.nom}</td>
                    <td className="px-5 py-3 text-right font-black text-primary">{m.marca}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}