import { useEffect, useState } from "react"
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore"
import { db } from "../../../../firebaseClient"

import { CalendarDays, MapPin, Clock, Trophy, Link, Home, Sun, TreePine, Route, Check, X, Loader2, Lock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { enllacosMapa } from "@/lib/mapes"
import { provesIdsDe, maxProvesDe, provaDeId, esIdDistancia } from "@/lib/provesEvent"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ordenarProves } from "@/lib/proves"
import {
  inscripcionsActives,
  inscripcionsObertes,
  tancamentDe,
  formatDiaLimit,
  carregarInscripcionsPares,
  desarInscripcioPares,
} from "@/lib/inscripcions"

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
export default function CalendariSection({ categories = [], siblings = [], codi = null }) {
  const { toast } = useToast()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Catàleg de proves (id → prova), per mostrar els noms de les proves de cada event.
  const [provesMap, setProvesMap] = useState({})
  useEffect(() => {
    getDocs(collection(db, "proves"))
      .then((snap) => {
        const m = {}
        snap.docs.forEach((d) => { m[d.id] = { id: d.id, ...d.data() } })
        setProvesMap(m)
      })
      .catch(() => {})
  }, [])

  // Proves que fa un fill/a concret en un event (segons categoria i sexe).
  const provesDe = (event, fill) =>
    ordenarProves(
      provesIdsDe(event, fill.categoria, fill.sexe)
        .map((id) => provaDeId(id, provesMap))
        // Per si l'event es va configurar abans: només proves de la seva categoria (secció Proves).
        // (Les distàncies de cros no tenen categories: ja són específiques de la categoria.)
        .filter((p) => p && ((p.categories ?? []).length === 0 || p.categories.includes(fill.categoria)))
    )

  // Inscripcions: { [`${eventId}_${athleteId}`]: true | false } (sense clau = no ha respost)
  const [inscripcions, setInscripcions] = useState({})
  // Proves triades pels pares quan n'hi ha més que el màxim: { [clau]: [provaId] }
  const [triades, setTriades] = useState({})
  const [desant, setDesant] = useState(null) // clau que s'està desant

  useEffect(() => {
    if (!codi) return
    carregarInscripcionsPares(codi)
      .then((llista) => {
        const map = {}
        const tri = {}
        llista.forEach((x) => {
          map[`${x.eventId}_${x.athleteId}`] = x.va
          tri[`${x.eventId}_${x.athleteId}`] = x.proves ?? []
        })
        setInscripcions(map)
        setTriades(tri)
      })
      .catch(() => {})
  }, [codi])

  const marcar = async (event, atleta, va, provesNoves = null) => {
    const clau = `${event.id}_${atleta.id}`
    const nomesProves = provesNoves !== null
    if (!nomesProves && inscripcions[clau] === va) return
    const abans = inscripcions[clau]
    const triadesAbans = triades[clau] ?? []
    const proves = va ? (provesNoves ?? triadesAbans) : []
    setDesant(clau)
    setInscripcions((prev) => ({ ...prev, [clau]: va }))
    setTriades((prev) => ({ ...prev, [clau]: proves }))
    try {
      await desarInscripcioPares({ codi, eventId: event.id, athleteId: atleta.id, va, proves })
      if (nomesProves) {
        toast({ title: "Inscripció desada", description: `${atleta.nom} va a ${event.title}` })
      } else {
        toast({
          title: va ? "Inscripció desada" : "Resposta desada",
          description: va ? `${atleta.nom} va a ${event.title}` : `${atleta.nom} no va a ${event.title}`,
        })
      }
    } catch (err) {
      setInscripcions((prev) => {
        const next = { ...prev }
        if (abans === undefined) delete next[clau]
        else next[clau] = abans
        return next
      })
      setTriades((prev) => ({ ...prev, [clau]: triadesAbans }))
      toast({ variant: "destructive", title: "No s'ha pogut desar", description: err?.message ?? "Torna-ho a provar" })
    } finally {
      setDesant(null)
    }
  }

  // Diàleg per triar proves en apuntar-se: { event, fill, sel: [provaId] }
  const [dialeg, setDialeg] = useState(null)

  // "Hi va": si la competició té proves per a la seva categoria/sexe, primer
  // s'obre el diàleg per triar-les; si no, es desa directament.
  const clicHiVa = (event, fill) => {
    const clau = `${event.id}_${fill.id}`
    if (provesDe(event, fill).length === 0) {
      toast({ variant: "destructive", title: "Encara no hi ha proves", description: "L'entrenador encara no ha posat les proves d'aquesta competició" })
      return
    }
    // Cros: una única distància, no hi ha res a triar → s'apunta directament.
    const proves = provesDe(event, fill)
    if (proves.length === 1 && esIdDistancia(proves[0].id)) {
      marcar(event, fill, true, [proves[0].id])
      return
    }
    setDialeg({ event, fill, sel: inscripcions[clau] === true ? (triades[clau] ?? []) : [] })
  }

  const toggleDialeg = (provaId) => {
    setDialeg((d) => {
      if (!d) return d
      const max = maxProvesDe(d.event, d.fill.categoria)
      if (d.sel.includes(provaId)) return { ...d, sel: d.sel.filter((x) => x !== provaId) }
      if (max && d.sel.length >= max) {
        // Amb màxim 1, tocar-ne una altra la canvia directament.
        if (max === 1) return { ...d, sel: [provaId] }
        return d
      }
      return { ...d, sel: [...d.sel, provaId] }
    })
  }

  const confirmarDialeg = async () => {
    const { event, fill, sel } = dialeg
    setDialeg(null)
    await marcar(event, fill, true, sel)
  }

  // Fills que poden anar a un event (event general → tots).
  const fillsPerEvent = (event) => {
    const cats = event.categories ?? []
    return siblings.filter((s) => cats.length === 0 || cats.includes(s.categoria))
  }

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
                      const mapa = enllacosMapa(event.ubicacio)
                      if (!mapa) return null
                      const cls = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                      const props = { target: "_blank", rel: "noopener noreferrer" }
                      return mapa.directe ? (
                        <a href={mapa.directe} {...props} className={cls}><MapPin className="h-3 w-3" /> Com arribar-hi</a>
                      ) : (
                        <>
                          <a href={mapa.google} {...props} className={cls}><MapPin className="h-3 w-3" /> Google Maps</a>
                          <a href={mapa.apple} {...props} className={cls}><MapPin className="h-3 w-3" /> Apple Maps</a>
                        </>
                      )
                    })()}
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

              {/* PROVES (només informatives quan l'event no té inscripcions) */}
              {!(codi && inscripcionsActives(event)) && (() => {
                const ambProves = fillsPerEvent(event)
                  .map((fill) => ({ fill, proves: provesDe(event, fill) }))
                  .filter((x) => x.proves.length > 0)
                if (ambProves.length === 0) return null
                return (
                  <div className="border-t pl-5 pr-4 py-3 space-y-2">
                    {ambProves.map(({ fill, proves }) => (
                      <div key={fill.id} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-muted-foreground mr-1">
                          {siblings.length > 1 ? `Proves de ${fill.nom}:` : "Proves:"}
                        </span>
                        {proves.map((p) => (
                          <span key={p.id} className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">{p.nom}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* INSCRIPCIÓ */}
              {codi && inscripcionsActives(event) && fillsPerEvent(event).length > 0 && (() => {
                const oberta = inscripcionsObertes(event)
                const tancament = tancamentDe(event)
                return (
                  <div className="border-t bg-muted/30 pl-5 pr-4 py-3 space-y-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {oberta ? (
                        <>
                          <Clock className="h-3.5 w-3.5" />
                          Digues si hi anirà abans del <span className="font-semibold text-foreground">{formatDiaLimit(tancament)}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5" />
                          Inscripcions tancades
                        </>
                      )}
                    </p>

                    {fillsPerEvent(event).map((fill) => {
                      const clau = `${event.id}_${fill.id}`
                      const estat = inscripcions[clau]
                      const ocupat = desant === clau
                      const provesFill = provesDe(event, fill)
                      const sel = triades[clau] ?? []
                      const provesTriades = provesFill.filter((p) => sel.includes(p.id))
                      return (
                        <div key={fill.id} className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {siblings.length > 1 && (
                              <span className="text-sm font-medium min-w-[90px] truncate">{fill.nom}</span>
                            )}
                            {oberta ? (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={ocupat || provesFill.length === 0}
                                  title={provesFill.length === 0 ? "Encara no hi ha proves per a aquesta competició" : undefined}
                                  onClick={() => clicHiVa(event, fill)}
                                  className={`inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-xs font-semibold transition-all ${
                                    estat === true
                                      ? "border-emerald-600 bg-emerald-600 text-white"
                                      : "border-muted-foreground/30 text-muted-foreground hover:border-emerald-500"
                                  }`}
                                >
                                  {ocupat && estat === true ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  Hi va
                                </button>
                                <button
                                  type="button"
                                  disabled={ocupat}
                                  onClick={() => marcar(event, fill, false)}
                                  className={`inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-xs font-semibold transition-all ${
                                    estat === false
                                      ? "border-slate-500 bg-slate-500 text-white"
                                      : "border-muted-foreground/30 text-muted-foreground hover:border-slate-400"
                                  }`}
                                >
                                  {ocupat && estat === false ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                  No hi va
                                </button>
                              </div>
                            ) : (
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                estat === true ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                              }`}>
                                {estat === true ? "Inscrit/a" : "No inscrit/a"}
                              </span>
                            )}
                          </div>

                          {oberta && provesFill.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">Encara no hi ha proves: podràs apuntar-lo quan l'entrenador les posi.</p>
                          )}

                          {/* Proves triades */}
                          {estat === true && provesFill.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-muted-foreground mr-1">Proves:</span>
                              {provesTriades.length > 0 ? provesTriades.map((p) => (
                                <span key={p.id} className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">{p.nom}</span>
                              )) : (
                                <span className="text-xs text-amber-600">cap triada</span>
                              )}
                              {oberta && (
                                <button
                                  type="button"
                                  onClick={() => clicHiVa(event, fill)}
                                  className="text-xs text-primary hover:underline ml-1"
                                >
                                  Canviar
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* DIÀLEG: triar proves en apuntar-se */}
      <Dialog open={!!dialeg} onOpenChange={(v) => { if (!v) setDialeg(null) }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl">
          {dialeg && (() => {
            const proves = provesDe(dialeg.event, dialeg.fill)
            const max = maxProvesDe(dialeg.event, dialeg.fill.categoria)
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{dialeg.fill.nom} a {dialeg.event.title}</DialogTitle>
                  <DialogDescription>
                    {max
                      ? `Tria ${max === 1 ? "la prova" : `fins a ${max} proves`} que farà.`
                      : "Tria les proves que farà."}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-2">
                  {proves.map((p) => {
                    const triada = dialeg.sel.includes(p.id)
                    const bloquejada = !triada && max && max > 1 && dialeg.sel.length >= max
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={bloquejada}
                        onClick={() => toggleDialeg(p.id)}
                        className={`flex w-full items-center justify-between rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                          triada
                            ? "border-primary bg-primary/10"
                            : bloquejada
                              ? "border-muted opacity-40"
                              : "border-muted hover:border-primary/50"
                        }`}
                      >
                        {p.nom}
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                          triada ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                        }`}>
                          {triada && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {max && (
                  <p className="text-xs text-muted-foreground">{dialeg.sel.length} de {max} triades</p>
                )}

                <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button variant="outline" onClick={() => setDialeg(null)}>Cancel·lar</Button>
                  <Button disabled={dialeg.sel.length === 0} onClick={confirmarDialeg}>
                    <Check className="mr-1.5 h-4 w-4" />
                    Confirmar inscripció
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
