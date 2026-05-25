import { useEffect, useMemo, useState } from "react"
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  orderBy,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Activity, Calendar, Filter, X, Zap, Target } from "lucide-react"

const TIPUS_EMOJI = {
  velocitat: "⚡",
  fons:      "🏃",
  salt:      "🦘",
  llancament:"🎯",
  marxa:     "🚶",
}

const TIPUS_COLOR = {
  velocitat:  "bg-amber-100 text-amber-700 border-amber-200",
  fons:       "bg-blue-100 text-blue-700 border-blue-200",
  salt:       "bg-green-100 text-green-700 border-green-200",
  llancament: "bg-violet-100 text-violet-700 border-violet-200",
  marxa:      "bg-slate-100 text-slate-600 border-slate-200",
}

export default function ResultatsSection({ athleteId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [tipusFilter, setTipusFilter] = useState("tots")
  const [provaFilter, setProvaFilter] = useState("totes")

  useEffect(() => {
    if (!athleteId) return
    const load = async () => {
      setLoading(true)
      const q = query(
        collection(db, "marques"),
        where("atletaId", "==", athleteId),
        orderBy("data", "desc")
      )
      const snap = await getDocs(q)
      const data = await Promise.all(
        snap.docs.map(async d => {
          const m = d.data()
          const provaSnap = await getDoc(doc(db, "proves", m.provaId))
          const eventSnap = await getDoc(doc(db, "events", m.eventId))
          return {
            id: d.id,
            prova: provaSnap.exists() ? provaSnap.data().nom : "—",
            tipus: provaSnap.exists() ? provaSnap.data().tipus : "—",
            marca: m.marca,
            event: eventSnap.exists() ? eventSnap.data().title : "—",
            dataObj: m.data?.toDate ? m.data.toDate() : null,
            data: m.data?.toDate
              ? m.data.toDate().toLocaleDateString("ca-ES", { day: "2-digit", month: "short", year: "numeric" })
              : "—",
          }
        })
      )
      setRows(data)
      setLoading(false)
    }
    load()
  }, [athleteId])

  const provesUniques = useMemo(() => [...new Set(rows.map(r => r.prova))], [rows])
  const tipusUnics = useMemo(() => [...new Set(rows.map(r => r.tipus))], [rows])

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (tipusFilter !== "tots" && r.tipus !== tipusFilter) return false
      if (provaFilter !== "totes" && r.prova !== provaFilter) return false
      return true
    })
  }, [rows, tipusFilter, provaFilter])

  const hasFilters = tipusFilter !== "tots" || provaFilter !== "totes"

  if (!athleteId) return <p className="text-muted-foreground">Preparant dades…</p>

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Carregant marques…</p>
      </div>
    </div>
  )

  if (rows.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
      <Activity className="h-12 w-12 opacity-30" />
      <p className="text-sm">Encara no hi ha marques registrades.</p>
    </div>
  )

  return (
    <div className="space-y-5 w-full">

      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/10 p-3">
          <Activity className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-black">Resultats</h2>
          <p className="text-sm text-muted-foreground">
            {filteredRows.length} {filteredRows.length === 1 ? "marca" : "marques"}
            {hasFilters && ` (de ${rows.length} totals)`}
          </p>
        </div>
      </div>

      {/* FILTRES */}
      <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtres
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
              onClick={() => { setTipusFilter("tots"); setProvaFilter("totes") }}>
              <X className="mr-1 h-3 w-3" /> Netejar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select value={tipusFilter} onValueChange={setTipusFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Tipus de prova" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tots">Tots els tipus</SelectItem>
              {tipusUnics.map(t => (
                <SelectItem key={t} value={t}>
                  {TIPUS_EMOJI[t] || ""} {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={provaFilter} onValueChange={setProvaFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Prova" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="totes">Totes les proves</SelectItem>
              {provesUniques.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* MOBILE: CARDS */}
      <div className="space-y-3 sm:hidden">
        {filteredRows.map((r, i) => {
          const tipusColor = TIPUS_COLOR[r.tipus] || TIPUS_COLOR.marxa
          const emoji = TIPUS_EMOJI[r.tipus] || "🏅"
          return (
            <div key={r.id} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                <span className="text-2xl">{emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{r.prova}</p>
                  <span className={`inline-block mt-1 rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${tipusColor}`}>
                    {r.tipus}
                  </span>
                </div>
                <p className="text-2xl font-black text-primary">{r.marca}</p>
              </div>
              <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/20">
                <p className="text-xs text-muted-foreground truncate max-w-[60%]">{r.event}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {r.data}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* DESKTOP: TAULA */}
      <div className="hidden sm:block rounded-2xl border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left font-semibold text-muted-foreground px-5 py-3">Prova</th>
              <th className="text-left font-semibold text-muted-foreground px-3 py-3">Tipus</th>
              <th className="text-left font-semibold text-muted-foreground px-3 py-3">Marca</th>
              <th className="text-left font-semibold text-muted-foreground px-3 py-3">Event</th>
              <th className="text-right font-semibold text-muted-foreground px-5 py-3">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRows.map(r => {
              const tipusColor = TIPUS_COLOR[r.tipus] || TIPUS_COLOR.marxa
              const emoji = TIPUS_EMOJI[r.tipus] || "🏅"
              return (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span>{emoji}</span>
                      <span className="font-semibold">{r.prova}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${tipusColor}`}>
                      {r.tipus}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-black text-primary text-lg leading-none">{r.marca}</td>
                  <td className="px-3 py-3 text-muted-foreground max-w-[180px] truncate">{r.event}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground whitespace-nowrap">{r.data}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}