import { useCallback, useEffect, useMemo, useState } from "react"
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { CATEGORIES, esCategoriaVigent } from "@/lib/categoria"
import { MapPinned, Plus, X, ChevronLeft, ChevronRight, Copy, Loader2, CalendarOff, Dumbbell, Search } from "lucide-react"
import { ordenarProves } from "@/lib/proves"

// Distribució de zones d'entrenament.
//  - zones/{id}               = LLOCS de la pista: { nom, color }      (sorral, recta principal...)
//  - proves/{id}              = el catàleg de proves de la web (NO se'n creen de noves aquí)
//  - zones_setmana/{dilluns}  = { dies: { "AAAA-MM-DD": { "Sub-10": [ { zonaId, nom, color, proves:[{id,nom}] } ] } } }
// Una zona pot tenir diverses proves el mateix dia (sorral: triple + llargada).
// L'admin ho organitza per setmana; l'entrenador només veu avui i les seves categories.

const DIES_ENTRENO = [0, 2, 4] // dilluns, dimecres, divendres (offset des de dilluns)
const NOM_DIA = { 0: "Dilluns", 2: "Dimecres", 4: "Divendres" }

const COLORS = {
  vermell: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/60 dark:text-red-100 dark:border-red-800",
  blau: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-100 dark:border-blue-800",
  lila: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-100 dark:border-purple-800",
  verd: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-100 dark:border-emerald-800",
  taronja: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-800",
  gris: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
}
const PUNTS = {
  vermell: "bg-red-500", blau: "bg-blue-500", lila: "bg-purple-500",
  verd: "bg-emerald-500", taronja: "bg-amber-500", gris: "bg-slate-500",
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const dillunsDe = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const sumaDies = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dataCurta = (d) => d.toLocaleDateString("ca-ES", { day: "numeric", month: "short" })
const ordena = (llista) => llista.sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? "", "ca"))

// Xip de zona (lloc) o de prova.
function XipZona({ nom, color, ...rest }) {
  return (
    <span {...rest} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold uppercase tracking-wide ${COLORS[color] ?? COLORS.gris} ${rest.draggable ? "cursor-grab active:cursor-grabbing" : ""}`}>
      <MapPinned className="h-3 w-3 shrink-0" /> {nom}
    </span>
  )
}
function XipProva({ nom, onRemove, ...rest }) {
  return (
    <span {...rest} className={`inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs font-medium ${rest.draggable ? "cursor-grab active:cursor-grabbing" : ""}`}>
      {nom}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Treure ${nom}`} className="rounded text-muted-foreground hover:text-destructive">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

// Bloc d'una zona dins una cel·la: zona + proves que s'hi fan.
function BlocZona({ item, color, nom, editable, onTreu, onAfegeixProva, onTreuProva, provesLib }) {
  const [sobre, setSobre] = useState(false)
  return (
    <div
      className={`rounded-md border p-2 space-y-1.5 ${COLORS[color] ?? COLORS.gris} ${sobre ? "ring-2 ring-ring" : ""}`}
      onDragOver={(e) => { if (editable) { e.preventDefault(); e.stopPropagation(); setSobre(true) } }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        setSobre(false)
        const id = e.dataTransfer.getData("text/prova")
        if (editable && id) { e.preventDefault(); e.stopPropagation(); onAfegeixProva(id) }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"><MapPinned className="h-3 w-3" /> {nom}</span>
        {editable && (
          <button type="button" onClick={onTreu} aria-label={`Treure zona ${nom}`} className="rounded opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {item.proves.length === 0 && <span className="text-xs italic opacity-80">{editable ? "Arrossega-hi proves" : "sense prova"}</span>}
        {item.proves.map((p) => (
          <XipProva key={p.id} nom={p.nom} onRemove={editable ? () => onTreuProva(p.id) : undefined} />
        ))}
        {editable && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Afegir prova" className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed bg-background/60 hover:bg-background">
                <Plus className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 space-y-1 max-h-64 overflow-auto">
              {provesLib.length === 0 && <p className="text-xs text-muted-foreground p-1">Crea primer alguna prova.</p>}
              {provesLib.map((p) => (
                <button key={p.id} type="button" onClick={() => onAfegeixProva(p.id)} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted">{p.nom}</button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}

export default function ZonesSection() {
  const { esAdmin, potEditarItem } = useUser()
  const { toast } = useToast()
  const potEditar = esAdmin && potEditarItem({ key: "zones" }, false)

  const [zones, setZones] = useState([])
  const [provesLib, setProvesLib] = useState([])
  const [lluns, setLluns] = useState(() => dillunsDe(new Date()))
  const [setmana, setSetmana] = useState({})
  const [carregant, setCarregant] = useState(true)
  const [desant, setDesant] = useState(false)
  const [novaZona, setNovaZona] = useState({ nom: "", color: "vermell" })
  const [cercaProva, setCercaProva] = useState("")

  const clauSetmana = iso(lluns)

  const carregaLlibreria = useCallback(async () => {
    const [z, p] = await Promise.all([getDocs(collection(db, "zones")), getDocs(collection(db, "proves"))])
    setZones(ordena(z.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.nom)))
    setProvesLib(ordenarProves(p.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.nom)))
  }, [])
  useEffect(() => { carregaLlibreria().catch(() => {}) }, [carregaLlibreria])

  useEffect(() => {
    let viu = true
    setCarregant(true)
    getDoc(doc(db, "zones_setmana", clauSetmana))
      .then((s) => { if (viu) setSetmana(s.exists() ? s.data().dies ?? {} : {}) })
      .catch(() => { if (viu) setSetmana({}) })
      .finally(() => { if (viu) setCarregant(false) })
    return () => { viu = false }
  }, [clauSetmana])

  const zonaPerId = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z])), [zones])
  const provaPerId = useMemo(() => Object.fromEntries(provesLib.map((p) => [p.id, p])), [provesLib])

  const desaSetmana = async (nou) => {
    setSetmana(nou)
    setDesant(true)
    try {
      await setDoc(doc(db, "zones_setmana", clauSetmana), { dies: nou, actualitzat: serverTimestamp() })
    } catch {
      toast({ variant: "destructive", title: "No s'ha pogut desar", description: "Torna-ho a provar" })
    } finally {
      setDesant(false)
    }
  }

  const items = (diaISO, cat) => setmana[diaISO]?.[cat] ?? []
  const posa = (diaISO, cat, llista) => desaSetmana({ ...setmana, [diaISO]: { ...(setmana[diaISO] ?? {}), [cat]: llista } })

  const afegeixZona = (diaISO, cat, zona) => {
    if (items(diaISO, cat).some((x) => x.zonaId === zona.id)) return
    posa(diaISO, cat, [...items(diaISO, cat), { zonaId: zona.id, nom: zona.nom, color: zona.color, proves: [] }])
  }
  const treuZona = (diaISO, cat, idx) => posa(diaISO, cat, items(diaISO, cat).filter((_, i) => i !== idx))
  const afegeixProva = (diaISO, cat, idx, provaId) => {
    const p = provaPerId[provaId]
    if (!p) return
    posa(diaISO, cat, items(diaISO, cat).map((it, i) =>
      i !== idx || it.proves.some((x) => x.id === p.id) ? it : { ...it, proves: [...it.proves, { id: p.id, nom: p.nom }] }))
  }
  const treuProva = (diaISO, cat, idx, provaId) =>
    posa(diaISO, cat, items(diaISO, cat).map((it, i) => (i !== idx ? it : { ...it, proves: it.proves.filter((x) => x.id !== provaId) })))

  const copiaAnterior = async () => {
    const s = await getDoc(doc(db, "zones_setmana", iso(sumaDies(lluns, -7))))
    if (!s.exists()) {
      toast({ variant: "destructive", title: "Setmana anterior buida", description: "No hi ha res per copiar" })
      return
    }
    const dies = s.data().dies ?? {}
    const nou = {}
    DIES_ENTRENO.forEach((off) => {
      const origen = dies[iso(sumaDies(sumaDies(lluns, -7), off))]
      if (origen) nou[iso(sumaDies(lluns, off))] = origen
    })
    await desaSetmana(nou)
    toast({ title: "Setmana copiada" })
  }

  const crea = async (colleccio, dades, reset) => {
    try {
      await addDoc(collection(db, colleccio), { ...dades, creat: serverTimestamp() })
      reset()
      carregaLlibreria()
    } catch {
      toast({ variant: "destructive", title: "No s'ha pogut crear" })
    }
  }
  const elimina = async (colleccio, id) => {
    try {
      await deleteDoc(doc(db, colleccio, id))
      carregaLlibreria()
    } catch {
      toast({ variant: "destructive", title: "No s'ha pogut eliminar" })
    }
  }

  if (!esAdmin) return <VistaEntrenador />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2"><MapPinned className="h-6 w-6" /> Zones d'entrenament</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {potEditar ? "Arrossega una zona a un dia i, a dins, les proves que s'hi fan." : "Distribució de la setmana (només lectura)."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setLluns(sumaDies(lluns, -7))} aria-label="Setmana anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="text-sm font-semibold text-center min-w-[150px]">{dataCurta(lluns)} – {dataCurta(sumaDies(lluns, 4))}</div>
          <Button size="icon" variant="outline" onClick={() => setLluns(sumaDies(lluns, 7))} aria-label="Setmana següent"><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setLluns(dillunsDe(new Date()))}>Avui</Button>
        </div>
      </div>

      {potEditar && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* ZONES */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><MapPinned className="h-4 w-4" /> Zones <span className="font-normal text-muted-foreground">(on)</span></p>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {zones.length === 0 && <p className="text-xs text-muted-foreground">Cap zona encara. Ex.: sorral, recta principal, contrarecta, herba…</p>}
              {zones.map((z) => (
                <span key={z.id} className="inline-flex items-center gap-1">
                  <XipZona nom={z.nom} color={z.color} draggable onDragStart={(e) => e.dataTransfer.setData("text/zona", z.id)} />
                  <button type="button" onClick={() => elimina("zones", z.id)} aria-label={`Eliminar ${z.nom}`} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-9 w-44" placeholder="Nova zona (sorral)" value={novaZona.nom}
                onChange={(e) => setNovaZona({ ...novaZona, nom: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && novaZona.nom.trim() && crea("zones", { nom: novaZona.nom.trim(), color: novaZona.color }, () => setNovaZona({ ...novaZona, nom: "" }))} />
              <div className="flex items-center gap-1.5">
                {Object.keys(COLORS).map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => setNovaZona({ ...novaZona, color: c })}
                    className={`h-5 w-5 rounded-full ${PUNTS[c]} ${novaZona.color === c ? "ring-2 ring-offset-2 ring-foreground ring-offset-background" : ""}`} />
                ))}
              </div>
              <Button size="sm" disabled={!novaZona.nom.trim()} onClick={() => crea("zones", { nom: novaZona.nom.trim(), color: novaZona.color }, () => setNovaZona({ ...novaZona, nom: "" }))}>
                <Plus className="h-4 w-4 mr-1" /> Crear
              </Button>
            </div>
          </div>

          {/* PROVES (catàleg de la secció Proves) */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Dumbbell className="h-4 w-4" /> Proves <span className="font-normal text-muted-foreground">(les de la secció Proves)</span></p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="h-9 pl-8" placeholder="Cerca una prova…" value={cercaProva} onChange={(e) => setCercaProva(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
              {provesLib.length === 0 && <p className="text-xs text-muted-foreground">No hi ha proves al catàleg.</p>}
              {provesLib
                .filter((p) => p.nom.toLowerCase().includes(cercaProva.trim().toLowerCase()))
                .map((p) => (
                  <XipProva key={p.id} nom={p.nom} draggable onDragStart={(e) => e.dataTransfer.setData("text/prova", p.id)} />
                ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Setmana</p>
        <div className="flex items-center gap-2">
          {(desant || carregant) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {potEditar && <Button size="sm" variant="outline" onClick={copiaAnterior}><Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar setmana anterior</Button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="w-24 p-2 text-left font-semibold">Categoria</th>
              {DIES_ENTRENO.map((off) => (
                <th key={off} className="p-2 text-left font-semibold">
                  {NOM_DIA[off]} <span className="font-normal text-muted-foreground">{dataCurta(sumaDies(lluns, off))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat} className="border-t align-top">
                <td className="p-2 font-bold">{cat}</td>
                {DIES_ENTRENO.map((off) => {
                  const diaISO = iso(sumaDies(lluns, off))
                  return (
                    <td
                      key={off}
                      className="p-2 border-l min-w-[220px]"
                      onDragOver={(e) => potEditar && e.preventDefault()}
                      onDrop={(e) => {
                        const id = e.dataTransfer.getData("text/zona")
                        if (potEditar && id && zonaPerId[id]) { e.preventDefault(); afegeixZona(diaISO, cat, zonaPerId[id]) }
                      }}
                    >
                      <div className="space-y-1.5 min-h-[2.25rem]">
                        {items(diaISO, cat).map((it, i) => {
                          const z = zonaPerId[it.zonaId]
                          return (
                            <BlocZona
                              key={it.zonaId}
                              item={it}
                              nom={z?.nom ?? it.nom}
                              color={z?.color ?? it.color}
                              editable={potEditar}
                              provesLib={provesLib.filter((p) => !(p.categories ?? []).length || p.categories.includes(cat))}
                              onTreu={() => treuZona(diaISO, cat, i)}
                              onAfegeixProva={(pid) => afegeixProva(diaISO, cat, i, pid)}
                              onTreuProva={(pid) => treuProva(diaISO, cat, i, pid)}
                            />
                          )
                        })}
                        {potEditar && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button type="button" aria-label="Afegir zona" className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed px-2 text-xs text-muted-foreground hover:bg-muted">
                                <Plus className="h-3.5 w-3.5" /> Zona
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-2 space-y-1 max-h-64 overflow-auto">
                              {zones.length === 0 && <p className="text-xs text-muted-foreground p-1">Crea primer alguna zona.</p>}
                              {zones.map((z) => (
                                <button key={z.id} type="button" onClick={() => afegeixZona(diaISO, cat, z)} className="block w-full text-left"><XipZona nom={z.nom} color={z.color} /></button>
                              ))}
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ───────────────────────── Entrenador: només avui i les seves categories ─────────────────────────
function VistaEntrenador() {
  const { categories } = useUser()
  const mevesCats = (categories ?? []).filter(esCategoriaVigent)
  const avui = new Date()
  const diaISO = iso(avui)
  const [dia, setDia] = useState(null) // null = carregant
  const [zones, setZones] = useState({})

  useEffect(() => {
    Promise.all([getDoc(doc(db, "zones_setmana", iso(dillunsDe(avui)))), getDocs(collection(db, "zones"))])
      .then(([s, zs]) => {
        setDia((s.exists() ? s.data().dies ?? {} : {})[diaISO] ?? {})
        setZones(Object.fromEntries(zs.docs.map((d) => [d.id, d.data()])))
      })
      .catch(() => setDia({}))
  }, [diaISO])

  const esEntreno = DIES_ENTRENO.includes((avui.getDay() + 6) % 7)
  const textDia = avui.toLocaleDateString("ca-ES", { weekday: "long", day: "numeric", month: "long" })

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-black flex items-center gap-2"><MapPinned className="h-6 w-6" /> Zones d'avui</h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">{textDia}</p>
      </div>

      {mevesCats.length === 0 && <p className="text-sm text-muted-foreground">No tens cap categoria assignada.</p>}

      {mevesCats.map((cat) => {
        const llista = dia?.[cat] ?? []
        return (
          <div key={cat} className="rounded-lg border p-4 space-y-3">
            <p className="font-bold">{cat}</p>
            {dia === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : llista.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {llista.map((it) => (
                  <BlocZona key={it.zonaId} item={it} nom={zones[it.zonaId]?.nom ?? it.nom} color={zones[it.zonaId]?.color ?? it.color} editable={false} provesLib={[]} />
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarOff className="h-4 w-4" />
                {esEntreno ? `Avui encara no hi ha zones assignades per a ${cat}.` : "Avui no hi ha entrenament (dilluns, dimecres i divendres)."}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
