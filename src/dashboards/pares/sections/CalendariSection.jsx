import { useEffect, useState } from "react"
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore"
import { db } from "../../../../firebaseClient"

import { CalendarDays, MapPin, Clock, Trophy, Link, Home, Sun, TreePine, Route } from "lucide-react"

function getDaysUntil(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date - today) / (1000 * 60 * 60 * 24))
  return diff
}

function getUrgencyStyle(days) {
  if (days === 0) return {
    pill: "bg-red-100 text-red-700 border border-red-200",
    accent: "from-red-400 to-rose-500",
    label: "Avui! 🔥",
  }
  if (days <= 7) return {
    pill: "bg-orange-100 text-orange-700 border border-orange-200",
    accent: "from-orange-400 to-amber-500",
    label: `En ${days} dies`,
  }
  if (days <= 30) return {
    pill: "bg-blue-100 text-blue-700 border border-blue-200",
    accent: "from-blue-400 to-cyan-500",
    label: `En ${days} dies`,
  }
  return {
    pill: "bg-slate-100 text-slate-600 border border-slate-200",
    accent: "from-slate-400 to-slate-600",
    label: `En ${days} dies`,
  }
}

const MONTHS_CA = ["GEN","FEB","MAR","ABR","MAI","JUN","JUL","AGO","SET","OCT","NOV","DES"]

// Ha d'anar en línia amb el mateix llistat a EventsSection.jsx.
const TIPUS_PISTA = [
  { value: "coberta", label: "Coberta", icon: Home },
  { value: "aire_lliure", label: "Aire lliure", icon: Sun },
  { value: "cross", label: "Cross", icon: TreePine },
  { value: "marxa_ruta", label: "Marxa en ruta", icon: Route },
]
function pistaInfo(value) {
  return TIPUS_PISTA.find((p) => p.value === value) ?? null
}

// categories: totes les categories dels germans amb accés amb aquest codi
// (així es veu un sol calendari combinat, encara que cada fill sigui d'una
// categoria diferent). siblings: per etiquetar cada event amb a quin
// fill/a afecta quan n'hi ha més d'un. Sense filtre de temporada — sempre
// mostra les properes competicions, independentment de la temporada
// seleccionada a Perfil/Estadístiques.
export default function CalendariSection({ categories = [], siblings = [] }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(false)
      try {
        const today = Timestamp.now()
        const q = query(collection(db, "events"), where("date", ">=", today))
        const snap = await getDocs(q)
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          // Un event és visible si és general (sense categories assignades)
          // o si inclou la categoria d'algun dels germans amb accés.
          .filter(e => {
            const cats = e.categories ?? []
            return cats.length === 0 || cats.some(c => categories.includes(c))
          })
          .sort((a, b) => a.date.toDate() - b.date.toDate())
        setEvents(data)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [categories.join(",")])

  // Per a cada event amb categories específiques, quins germans l'afecten
  // (només té sentit mostrar-ho si hi ha més d'un fill amb accés).
  const germansDe = (event) => {
    if (siblings.length < 2) return []
    const cats = event.categories ?? []
    if (cats.length === 0) return []
    return siblings.filter(s => cats.includes(s.categoria))
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Carregant competicions…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
      <CalendarDays className="h-12 w-12 opacity-30" />
      <p className="text-sm">No s'han pogut carregar les competicions. Torna-ho a provar.</p>
    </div>
  )

  if (events.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
      <CalendarDays className="h-12 w-12 opacity-30" />
      <p className="text-sm">No hi ha competicions futures programades.</p>
    </div>
  )

  return (
    <div className="space-y-6 w-full">

      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary/10 p-3">
          <Trophy className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-black">Competicions</h2>
          <p className="text-sm text-muted-foreground">{events.length} properes competicions</p>
        </div>
      </div>

      {/* EVENT LIST */}
      <div className="space-y-3">
        {events.map((event, i) => {
          const date = event.date.toDate()
          const days = getDaysUntil(date)
          const style = getUrgencyStyle(days)
          const germans = germansDe(event)

          return (
            <div
              key={event.id}
              className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm hover:shadow-md transition-all duration-200"
            >
              {/* Left accent bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${style.accent}`} />

              <div className="flex items-center gap-4 pl-5 pr-4 py-4">

                {/* Date bubble */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-muted text-center">
                  <span className="text-xl font-black leading-none">{date.getDate()}</span>
                  <span className="text-xs font-semibold text-muted-foreground mt-0.5">
                    {MONTHS_CA[date.getMonth()]}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base truncate leading-snug">{event.title}</p>
                  {event.link && (
                    <a
                      href={event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      <Link className="h-3.5 w-3.5" />
                      Més informació
                    </a>
                  )}

                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {date.toLocaleDateString("ca-ES", { weekday: "long", day: "numeric", month: "long" })}
                    </span>
                    {event.lloc && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.lloc}
                      </span>
                    )}
                    {(() => {
                      const pista = pistaInfo(event.tipusPista)
                      if (!pista) return null
                      const PistaIcon = pista.icon
                      return (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">
                          <PistaIcon className="h-3 w-3" />
                          {pista.label}
                        </span>
                      )
                    })()}
                  </div>

                  {/* Quins germans afecta aquest event (només si n'hi ha més d'un i l'event és d'una categoria concreta) */}
                  {germans.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {germans.map(g => (
                        <span key={g.id} className="rounded-full bg-violet-100 text-violet-700 text-xs px-2 py-0.5 font-medium">
                          {g.nom}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Urgency pill */}
                <div className="flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${style.pill}`}>
                    <Clock className="h-3 w-3" />
                    {style.label}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}