import { useEffect, useState, useMemo } from "react"
import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  Users, Trophy, Zap, RefreshCw, Sparkles,
  UserCheck, Save, CheckCircle2,
} from "lucide-react"

// ─── IMPORTACIÓ FCA ────────────────────────────────────────────────────────
// Ajusta el path segons on guardis fcaPuntuacio.js al teu projecte
import { getPuntsFCA } from "@/lib/Fcapuntuacio"

/* ─────────────────────────────────────────────
   CONFIGURACIÓ DE CATEGORIES
   ───────────────────────────────────────────── */

function categoriaAtleta(anyNaix) {
  if (!anyNaix) return null
  if (anyNaix >= 2019) return "Sub-8"
  if (anyNaix >= 2017) return "Sub-10"
  if (anyNaix >= 2015) return "Sub-12"
  if (anyNaix >= 2013) return "Sub-14"
  if (anyNaix >= 2011) return "Sub-16"
  if (anyNaix >= 2009) return "Sub-18"
  return "Absolut"
}

const PROVES_SUB10 = [
  { slot: "60mll",    clau: "60 mll",   label: "60 mll",       relleu: false },
  { slot: "400",      clau: "400 mll",  label: "400 mll",      relleu: false },
  { slot: "1000",     clau: "1000 mll", label: "1.000 mll",    relleu: false },
  { slot: "1000m",    clau: "1000 mm",  label: "1.000m marxa", relleu: false },
  { slot: "llargada", clau: "llargada", label: "Llargada",     relleu: false },
  { slot: "pes",      clau: "pes",      label: "Pes",          relleu: false },
  { slot: "vortex",   clau: "vortex",   label: "Vortex",       relleu: false },
  { slot: "alcada",   clau: "alçada",   label: "Alçada",       relleu: false },
  { slot: "4x60",     clau: "60 mll",   label: "4×60m",        relleu: true, numAtletes: 4 },
]

const PROVES_SUB12 = [
  { slot: "60m",      clau: "60 mll",   label: "60 mll",       relleu: false },
  { slot: "60mt",     clau: "60 mt",    label: "60m tanques",  relleu: false },
  { slot: "600",      clau: "600 mll",  label: "600 mll",      relleu: false },
  { slot: "2000",     clau: "2000 mll", label: "2.000 mll",    relleu: false },
  { slot: "2000m",    clau: "2000 mm",  label: "2.000m marxa", relleu: false },
  { slot: "javelina", clau: "javelina", label: "Javelina",     relleu: false },
  { slot: "pes",      clau: "pes",      label: "Pes",          relleu: false },
  { slot: "alcada",   clau: "alçada",   label: "Alçada",       relleu: false },
  { slot: "llargada", clau: "llargada", label: "Llargada",     relleu: false },
  { slot: "120",      clau: "120 mll",  label: "120 mll",      relleu: false },
  { slot: "disc",     clau: "disc",     label: "Disc",         relleu: false },
  { slot: "perxa",    clau: "perxa",    label: "Perxa",        relleu: false },
  { slot: "4x60",     clau: "60 mll",   label: "4×60m",        relleu: true, numAtletes: 4 },
  { slot: "4x200",    clau: "200 mll",  label: "4×200m",       relleu: true, numAtletes: 4 },
]

const CATEGORIES = [
  { key: "Sub-10", label: "Sub-10", proves: PROVES_SUB10 },
  { key: "Sub-12", label: "Sub-12", proves: PROVES_SUB12 },
]

const COLOR_CAT = {
  "Sub-8":   "bg-rose-100 text-rose-700 border-rose-200",
  "Sub-10":  "bg-amber-100 text-amber-700 border-amber-200",
  "Sub-12":  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Sub-14":  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "Sub-16":  "bg-violet-100 text-violet-700 border-violet-200",
  "Sub-18":  "bg-slate-100 text-slate-600 border-slate-200",
  "Absolut": "bg-yellow-100 text-yellow-700 border-yellow-200",
}

// Colors del badge de punts FCA segons el rang
function colorPunts(punts) {
  if (punts == null) return "bg-gray-100 text-gray-400 border-gray-200"
  if (punts >= 800)  return "bg-yellow-100 text-yellow-700 border-yellow-300"
  if (punts >= 600)  return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (punts >= 400)  return "bg-blue-100 text-blue-700 border-blue-200"
  if (punts >= 200)  return "bg-orange-100 text-orange-700 border-orange-200"
  return "bg-gray-100 text-gray-500 border-gray-200"
}

const TIPUS_EMOJI = {
  velocitat: "⚡", fons: "🏃", salt: "🦘",
  llancament: "🎯", marxa: "🚶",
}

/* ─────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────── */

function parseMarca(marca) {
  if (!marca) return null
  if (typeof marca === "string" && marca.includes(":")) {
    const [m, s] = marca.split(":")
    return Number(m) * 60 + Number(s)
  }
  return parseFloat(String(marca).replace(",", "."))
}

function isTemps(tipus) {
  return ["velocitat", "fons", "marxa"].includes(tipus)
}

function esMillor(val, best, tipus) {
  if (val == null || best == null) return false
  return isTemps(tipus) ? val < best : val > best
}

function trobarProvaDB(clau, provesDB) {
  const c = clau.toLowerCase()
  return provesDB.find(p => p.nom?.toLowerCase().includes(c)) ?? null
}

/* ─────────────────────────────────────────────
   BADGE DE PUNTS FCA
   Mostra els punts FCA calculats per a una marca i prova.
   Si la prova o marca no té correspondència a la taula FCA,
   no mostra res (retorna null silenciosament).
   ───────────────────────────────────────────── */

function BadgePuntsFCA({ marca, nomProva, sexe, className = "" }) {
  const punts = useMemo(() => {
    if (!marca || !nomProva || !sexe) return null
    return getPuntsFCA(String(marca), nomProva, sexe)
  }, [marca, nomProva, sexe])

  if (punts == null) return null

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs font-bold ${colorPunts(punts)} ${className}`}
      title={`Puntuació FCA: ${punts} pts`}
    >
      <Trophy className="h-2.5 w-2.5" />
      {punts}
    </span>
  )
}

/* ─────────────────────────────────────────────
   CÀLCUL AUTO
   ───────────────────────────────────────────── */

function calcularAutoEquip(athletes, slotsProves, provesDB, millorMarcaMap) {
  const assignats = new Set()
  const equip = {}
  const releus = {}

  for (const slot of slotsProves.filter(s => !s.relleu)) {
    const provaDB = trobarProvaDB(slot.clau, provesDB)
    if (!provaDB) { equip[slot.slot] = { atletaId: null, marca: null, provaDBId: null }; continue }
    const candidats = athletes
      .map(a => {
        const entry = millorMarcaMap[`${a.id}_${provaDB.id}`]
        return entry ? { atletaId: a.id, valor: entry.valor, marca: entry.marca } : null
      })
      .filter(Boolean)
      .sort((a, b) => isTemps(provaDB.tipus) ? a.valor - b.valor : b.valor - a.valor)
    const sel = candidats.find(c => !assignats.has(c.atletaId))
    if (sel) {
      assignats.add(sel.atletaId)
      equip[slot.slot] = { atletaId: sel.atletaId, marca: sel.marca, provaDBId: provaDB.id }
    } else {
      equip[slot.slot] = { atletaId: null, marca: null, provaDBId: provaDB.id }
    }
  }

  for (const slot of slotsProves.filter(s => s.relleu)) {
    const provaDB = trobarProvaDB(slot.clau, provesDB)
    if (!provaDB) { releus[slot.slot] = Array(slot.numAtletes).fill(null); continue }
    const millors = athletes
      .map(a => {
        const entry = millorMarcaMap[`${a.id}_${provaDB.id}`]
        return entry ? { atletaId: a.id, valor: entry.valor } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.valor - b.valor)
      .slice(0, slot.numAtletes)
      .map(r => r.atletaId)
    while (millors.length < slot.numAtletes) millors.push(null)
    releus[slot.slot] = millors
  }

  return { equip, releus }
}

/* ─────────────────────────────────────────────
   SUBCOMPONENT: FILA PROVA INDIVIDUAL
   ───────────────────────────────────────────── */

function ProvaRow({ slotDef, provaDB, assignacio, athletes, millorMarcaMap, onCanvi, atletesOcupats }) {
  const atletaActual = athletes.find(a => a.id === assignacio?.atletaId)
  const anyNaix = atletaActual?.naixement?.toDate?.()?.getFullYear()
  const cat = anyNaix ? categoriaAtleta(anyNaix) : null
  const sexeAtleta = atletaActual?.sexe ?? null
  const initials = atletaActual?.nom?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
  const esManual = assignacio && !assignacio.auto

  const candidats = useMemo(() => {
    if (!provaDB) return []
    return athletes
      .map(a => {
        const entry = millorMarcaMap[`${a.id}_${provaDB.id}`]
        return entry ? { atleta: a, valor: entry.valor, marca: entry.marca } : null
      })
      .filter(Boolean)
      .sort((a, b) => isTemps(provaDB?.tipus) ? a.valor - b.valor : b.valor - a.valor)
  }, [athletes, provaDB, millorMarcaMap])

  return (
    <div className={`rounded-xl border px-4 py-3 space-y-2 transition-colors ${
      esManual ? "border-primary/30 bg-primary/5" : "border-border bg-card"
    }`}>
      <div className="flex items-center gap-2">
        <span>{TIPUS_EMOJI[provaDB?.tipus] || "🏅"}</span>
        <p className="font-semibold text-sm flex-1">{slotDef.label}</p>
        {!provaDB && <span className="text-xs text-red-500 font-semibold">⚠ No trobada a BD</span>}
        {esManual && (
          <span className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
            <UserCheck className="h-3 w-3" /> Manual
          </span>
        )}
        {!esManual && assignacio?.atletaId && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            <Sparkles className="h-3 w-3" /> Auto
          </span>
        )}
      </div>

      <Select
        value={assignacio?.atletaId ?? "buit"}
        onValueChange={val => onCanvi(slotDef.slot, val === "buit" ? null : val)}
      >
        <SelectTrigger className="rounded-xl h-auto py-2">
          {atletaActual ? (
            <div className="flex items-center gap-2.5 text-left w-full">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs font-black flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-none truncate">{atletaActual.nom}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {cat && (
                    <span className={`rounded-full border px-1.5 py-0.5 text-xs font-semibold ${COLOR_CAT[cat]}`}>
                      {cat}
                    </span>
                  )}
                  {atletesOcupats?.has(atletaActual.id) && (
                    <span className="rounded-full bg-amber-100 border border-amber-200 text-amber-700 px-1.5 py-0.5 text-xs font-semibold">
                      + relleu
                    </span>
                  )}
                  {/* ── BADGE PUNTS FCA ── */}
                  <BadgePuntsFCA
                    marca={assignacio?.marca}
                    nomProva={provaDB?.nom}
                    sexe={sexeAtleta}
                  />
                </div>
              </div>
              <p className="font-black text-primary text-base flex-shrink-0">{assignacio?.marca}</p>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">Sense assignar</span>
          )}
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="buit">
            <span className="text-muted-foreground">— Sense assignar</span>
          </SelectItem>
          {candidats.map(({ atleta, marca }, i) => {
            const anyA = atleta.naixement?.toDate?.()?.getFullYear()
            const catA = anyA ? categoriaAtleta(anyA) : ""
            const ocupat = atletesOcupats?.has(atleta.id) && atleta.id !== assignacio?.atletaId
            // Punts FCA per a cada candidat al desplegable
            const puntsCandidatFCA = getPuntsFCA(String(marca), provaDB?.nom ?? "", atleta.sexe ?? "M")
            return (
              <SelectItem key={atleta.id} value={atleta.id}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <span className="font-medium">{atleta.nom}</span>
                  <span className="text-xs text-muted-foreground">· {catA}</span>
                  <span className="ml-auto font-bold text-primary pl-3">{marca}</span>
                  {/* ── PUNTS FCA al desplegable ── */}
                  {puntsCandidatFCA != null && (
                    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs font-bold ${colorPunts(puntsCandidatFCA)}`}>
                      <Trophy className="h-2.5 w-2.5" />
                      {puntsCandidatFCA}
                    </span>
                  )}
                  {ocupat && <span className="text-xs text-amber-600">⚠️</span>}
                </div>
              </SelectItem>
            )
          })}
          {candidats.length === 0 && (
            <SelectItem value="__no__" disabled>Sense marques</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}

/* ─────────────────────────────────────────────
   SUBCOMPONENT: FILA RELLEU
   ───────────────────────────────────────────── */

function ReleuRow({ posicio, atletaId, athletes, provaDB, millorMarcaMap, onCanvi }) {
  const atletaActual = athletes.find(a => a.id === atletaId)
  const anyNaix = atletaActual?.naixement?.toDate?.()?.getFullYear()
  const cat = anyNaix ? categoriaAtleta(anyNaix) : null
  const initials = atletaActual?.nom?.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
  const marcaActual = provaDB ? millorMarcaMap[`${atletaId}_${provaDB.id}`]?.marca : null

  const candidats = useMemo(() => {
    if (!provaDB) return []
    return athletes
      .map(a => {
        const entry = millorMarcaMap[`${a.id}_${provaDB.id}`]
        return entry ? { atleta: a, valor: entry.valor, marca: entry.marca } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.valor - b.valor)
  }, [athletes, provaDB, millorMarcaMap])

  return (
    <div className="flex items-center gap-3">
      <div className="w-6 text-center text-xs font-bold text-muted-foreground flex-shrink-0">{posicio}</div>
      <div className="flex-1">
        <Select
          value={atletaId ?? "buit"}
          onValueChange={val => onCanvi(posicio - 1, val === "buit" ? null : val)}
        >
          <SelectTrigger className="rounded-xl h-auto py-2">
            {atletaActual ? (
              <div className="flex items-center gap-2.5 text-left w-full">
                <div className="h-7 w-7 rounded-md bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-black flex-shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-none truncate">{atletaActual.nom}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {cat && (
                      <span className={`rounded-full border px-1.5 py-0.5 text-xs font-semibold inline-block ${COLOR_CAT[cat]}`}>
                        {cat}
                      </span>
                    )}
                    {/* ── BADGE PUNTS FCA per relleu ── */}
                    {marcaActual && (
                      <BadgePuntsFCA
                        marca={marcaActual}
                        nomProva={provaDB?.nom}
                        sexe={atletaActual?.sexe}
                      />
                    )}
                  </div>
                </div>
                {marcaActual && (
                  <p className="font-black text-amber-600 text-base flex-shrink-0">{marcaActual}</p>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">Posició {posicio} — sense assignar</span>
            )}
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="buit">— Sense assignar</SelectItem>
            {candidats.map(({ atleta, marca }, i) => {
              const anyA = atleta.naixement?.toDate?.()?.getFullYear()
              const catA = anyA ? categoriaAtleta(anyA) : ""
              const puntsFCA = getPuntsFCA(String(marca), provaDB?.nom ?? "", atleta.sexe ?? "M")
              return (
                <SelectItem key={atleta.id} value={atleta.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span className="font-medium">{atleta.nom}</span>
                    <span className="text-xs text-muted-foreground">· {catA}</span>
                    <span className="ml-auto font-bold text-amber-600 pl-3">{marca}</span>
                    {puntsFCA != null && (
                      <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs font-bold ${colorPunts(puntsFCA)}`}>
                        <Trophy className="h-2.5 w-2.5" />
                        {puntsFCA}
                      </span>
                    )}
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   SUBCOMPONENT: RESUM PUNTS FCA DEL BLOC
   Suma total de punts FCA de les proves individuals assignades.
   ───────────────────────────────────────────── */

function ResumPuntsFCA({ assignacions, slotsIndividuals, athletes, provesDB }) {
  const { total, cobertes } = useMemo(() => {
    let sum = 0
    let count = 0
    for (const slot of slotsIndividuals) {
      const assig = assignacions[slot.slot]
      if (!assig?.atletaId || !assig?.marca) continue
      const atleta = athletes.find(a => a.id === assig.atletaId)
      const provaDB = provesDB.find(p => p.id === assig.provaDBId)
      if (!atleta || !provaDB) continue
      const punts = getPuntsFCA(String(assig.marca), provaDB.nom, atleta.sexe)
      if (punts != null) {
        sum += punts
        count++
      }
    }
    return { total: sum, cobertes: count }
  }, [assignacions, slotsIndividuals, athletes, provesDB])

  if (cobertes === 0) return null

  return (
    <div className="rounded-xl bg-muted/40 border px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Trophy className="h-4 w-4" />
        <span>Punts FCA totals</span>
        <span className="text-xs">({cobertes} proves)</span>
      </div>
      <span className={`rounded-full border px-2.5 py-0.5 text-sm font-black ${colorPunts(Math.round(total / cobertes))}`}>
        {total} pts
      </span>
    </div>
  )
}

/* ─────────────────────────────────────────────
   SUBCOMPONENT: BLOC SEXE + CATEGORIA
   ───────────────────────────────────────────── */

function BlocEquip({ catDef, sexeKey, sexeLabel, athletes, provesDB, millorMarcaMap, onEquipChange }) {
  const atletsCat = useMemo(() => athletes.filter(a => {
    const any = a.naixement?.toDate?.()?.getFullYear()
    return a.sexe === sexeKey && categoriaAtleta(any) === catDef.key
  }), [athletes, sexeKey, catDef.key])

  const provaDBPerSlot = useMemo(() => {
    const map = {}
    for (const slot of catDef.proves) map[slot.slot] = trobarProvaDB(slot.clau, provesDB)
    return map
  }, [catDef.proves, provesDB])

  const auto = useMemo(() =>
    calcularAutoEquip(atletsCat, catDef.proves, provesDB, millorMarcaMap),
    [atletsCat, catDef.proves, provesDB, millorMarcaMap]
  )

  const [assignacions, setAssignacions] = useState({})
  const [releus, setReleus] = useState({})

  useEffect(() => {
    setAssignacions(auto.equip)
    setReleus(auto.releus)
  }, [auto])

  const handleCanviProva = (slot, atletaId) => {
    const provaDB = provaDBPerSlot[slot]
    const marca = atletaId && provaDB
      ? millorMarcaMap[`${atletaId}_${provaDB.id}`]?.marca ?? null
      : null
    setAssignacions(prev => ({
      ...prev,
      [slot]: { atletaId, marca, provaDBId: provaDB?.id ?? null, auto: false },
    }))
  }

  const handleCanviReleu = (slot, index, atletaId) => {
    setReleus(prev => {
      const nou = [...(prev[slot] ?? [])]
      nou[index] = atletaId
      return { ...prev, [slot]: nou }
    })
  }

  const handleReset = () => {
    setAssignacions(auto.equip)
    setReleus(auto.releus)
  }

  useEffect(() => {
    if (!onEquipChange) return
    onEquipChange(`${catDef.key}_${sexeKey}`, { assignacions, releus })
  }, [assignacions, releus])

  const atletesOcupats = useMemo(() => {
    const individuals = new Set(
      Object.values(assignacions).map(a => a?.atletaId).filter(Boolean)
    )
    return new Set(
      Object.values(releus).flat().filter(id => id && individuals.has(id))
    )
  }, [assignacions, releus])

  const slotsIndividuals = catDef.proves.filter(s => !s.relleu)
  const slotsRelleu = catDef.proves.filter(s => s.relleu)
  const cobertes = slotsIndividuals.filter(s => assignacions[s.slot]?.atletaId).length

  const headerBg = sexeKey === "M" ? "bg-blue-50 border-blue-100"  : "bg-rose-50 border-rose-100"
  const iconBg   = sexeKey === "M" ? "bg-blue-100 text-blue-700"   : "bg-rose-100 text-rose-700"

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Capçalera */}
      <div className={`px-5 py-4 border-b flex items-center gap-3 ${headerBg}`}>
        <div className={`rounded-xl p-2 ${iconBg}`}>
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-black text-lg">{sexeLabel} · {catDef.key}</h3>
          <p className="text-xs text-muted-foreground">
            {cobertes}/{slotsIndividuals.length} proves cobertes · {atletsCat.length} atletes
          </p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 rounded-xl border bg-white/70 px-2.5 py-1.5 text-xs font-semibold hover:bg-white transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" /> Auto
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Proves individuals */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            Proves individuals
          </p>
          {slotsIndividuals.map(slotDef => (
            <ProvaRow
              key={slotDef.slot}
              slotDef={slotDef}
              provaDB={provaDBPerSlot[slotDef.slot]}
              assignacio={assignacions[slotDef.slot]}
              athletes={atletsCat}
              millorMarcaMap={millorMarcaMap}
              onCanvi={handleCanviProva}
              atletesOcupats={atletesOcupats}
            />
          ))}
        </div>

        {/* ── RESUM PUNTS FCA ── */}
        <ResumPuntsFCA
          assignacions={assignacions}
          slotsIndividuals={slotsIndividuals}
          athletes={atletsCat}
          provesDB={provesDB}
        />

        {/* Relleus */}
        {slotsRelleu.map(slotDef => (
          <div key={slotDef.slot} className="space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {slotDef.label}
                {provaDBPerSlot[slotDef.slot]
                  ? ` · basat en ${provaDBPerSlot[slotDef.slot].nom}`
                  : " · prova no trobada a BD"}
              </p>
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: slotDef.numAtletes }, (_, i) => (
                <ReleuRow
                  key={i}
                  posicio={i + 1}
                  atletaId={releus[slotDef.slot]?.[i] ?? null}
                  athletes={atletsCat}
                  provaDB={provaDBPerSlot[slotDef.slot]}
                  millorMarcaMap={millorMarcaMap}
                  onCanvi={(index, id) => handleCanviReleu(slotDef.slot, index, id)}
                />
              ))}
            </div>
          </div>
        ))}

        {atletesOcupats.size > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
            ⚡ Alguns atletes participen en individual <strong>i</strong> en relleu.
          </div>
        )}

        {atletsCat.length === 0 && (
          <div className="rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            Cap atleta {catDef.key} donat d'alta.
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   COMPONENT PRINCIPAL
   ───────────────────────────────────────────── */

export default function EquipOptimSection() {
  const { filtraCat, esAdmin, categories: categoriesUsuari } = useUser()

  const [athletes, setAthletes]             = useState([])
  const [provesDB, setProvesDB]             = useState([])
  const [millorMarcaMap, setMillorMarcaMap] = useState({})
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [saved, setSaved]                   = useState(false)
  const [savedAt, setSavedAt]               = useState(null)

  const tabsDisponibles = useMemo(() => {
    if (esAdmin) return CATEGORIES
    return CATEGORIES.filter(cat =>
      categoriesUsuari?.some(c => c.toLowerCase().includes(cat.key.toLowerCase()))
    )
  }, [esAdmin, categoriesUsuari])

  const [tabActiu, setTabActiu] = useState(null)

  useEffect(() => {
    if (tabsDisponibles.length > 0 && !tabActiu)
      setTabActiu(tabsDisponibles[0].key)
  }, [tabsDisponibles])

  const equipData = useMemo(() => ({}), [])
  const handleEquipChange = (key, data) => { equipData[key] = data }

  const load = async () => {
    setLoading(true)
    setSaved(false)

    const [athletesSnap, provesSnap, marquesSnap, equipSnap] = await Promise.all([
      getDocs(collection(db, "athletes")),
      getDocs(collection(db, "proves")),
      getDocs(collection(db, "marques")),
      getDoc(doc(db, "equip_optim", "actual")),
    ])

    const atletesData = athletesSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.actiu !== false)

    const provesData = provesSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    const marcaMap = {}
    marquesSnap.docs.forEach(d => {
      const m = d.data()
      const key = `${m.atletaId}_${m.provaId}`
      const prova = provesData.find(p => p.id === m.provaId)
      if (!prova) return
      const valor = parseMarca(m.marca)
      if (valor == null) return
      if (!marcaMap[key] || esMillor(valor, marcaMap[key].valor, prova.tipus))
        marcaMap[key] = { valor, marca: m.marca }
    })

    setAthletes(atletesData)
    setProvesDB(provesData)
    setMillorMarcaMap(marcaMap)

    if (equipSnap.exists()) {
      const d = equipSnap.data().guardatEl?.toDate?.()
      if (d) setSavedAt(d)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (tabActiu) load()
  }, [tabActiu])

  const handleGuardar = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, "equip_optim", "actual"), {
        ...equipData,
        guardatEl: new Date(),
      })
      setSaved(true)
      setSavedAt(new Date())
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error("Error guardant equip:", e)
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Calculant equip òptim…</p>
      </div>
    </div>
  )

  if (tabsDisponibles.length === 0) return (
    <div className="flex items-center justify-center py-24">
      <p className="text-sm text-muted-foreground">No tens cap categoria assignada.</p>
    </div>
  )

  const catActiu = CATEGORIES.find(c => c.key === tabActiu)
  const mostraSelectorTabs = esAdmin || tabsDisponibles.length > 1

  return (
    <div className="space-y-6">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black">Equip òptim</h2>
            <p className="text-sm text-muted-foreground">
              {savedAt
                ? `Darrer guardat: ${savedAt.toLocaleDateString("ca-ES", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}`
                : "Encara no s'ha guardat cap equip"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Recarregar
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              saved
                ? "bg-green-500 text-white border border-green-500"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {saving
              ? <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Guardant…</>
              : saved
              ? <><CheckCircle2 className="h-4 w-4" /> Guardat!</>
              : <><Save className="h-4 w-4" /> Guardar equip</>}
          </button>
        </div>
      </div>

      {/* ── SELECTOR DE CATEGORIA ──────────────────────────────────────────── */}
      {mostraSelectorTabs ? (
        <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
          {tabsDisponibles.map(cat => (
            <button
              key={cat.key}
              onClick={() => setTabActiu(cat.key)}
              className={`rounded-lg px-5 py-2 text-sm font-bold transition-all ${
                tabActiu === cat.key
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${
            tabActiu === "Sub-10"
              ? "bg-amber-100 text-amber-700 border-amber-200"
              : "bg-emerald-100 text-emerald-700 border-emerald-200"
          }`}>
            {tabActiu}
          </span>
          <span className="text-sm text-muted-foreground">— Vista de la teva categoria</span>
        </div>
      )}

      {/* ── DESCRIPCIÓ ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-muted/40 border px-4 py-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Com funciona:</strong>{" "}
        Assignació automàtica de l'atleta {catActiu?.key} amb millor marca per cada prova.
        Pots canviar manualment amb els selectors — els canvis es marquen en blau.
        Els{" "}
        <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-700 border-yellow-300">
          <Trophy className="h-2.5 w-2.5" />
          punts
        </span>{" "}
        corresponen a la taula FCA (Abril 1992).
        Prem <strong>Auto</strong> per tornar al suggeriment · <strong>Guardar equip</strong> per desar.
      </div>

      {/* ── GRID NOIS / NOIES ──────────────────────────────────────────────── */}
      {catActiu && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { sexeKey: "M", sexeLabel: "♂ Nois" },
            { sexeKey: "F", sexeLabel: "♀ Noies" },
          ].map(({ sexeKey, sexeLabel }) => (
            <BlocEquip
              key={`${catActiu.key}_${sexeKey}`}
              catDef={catActiu}
              sexeKey={sexeKey}
              sexeLabel={sexeLabel}
              athletes={filtraCat(athletes, "categoria")}
              provesDB={provesDB}
              millorMarcaMap={millorMarcaMap}
              onEquipChange={handleEquipChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}