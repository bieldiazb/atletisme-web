import { useState } from "react"
import { agruparProvesPerTipus } from "@/lib/proves"
import { esIdDistancia, idDistancia, metresDeId } from "@/lib/provesEvent"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronRight, Copy } from "lucide-react"

const SEXES = [
  { value: "M", label: "Nens" },
  { value: "F", label: "Nenes" },
]

// Cros: en lloc de proves del catàleg, una distància (metres) per categoria i
// sexe, escrita a mà perquè cada cros és diferent (Sub-10 1000 m, Sub-12 1200 m...).
const DISTANCIA_SUGGERIDA = { "Sub-8": 600, "Sub-10": 1000, "Sub-12": 1200, "Sub-14": 2000 }

function CrossDistancies({ categories, value, onChange }) {
  const metres = (cat, sexe) => {
    const id = (value?.[cat]?.[sexe] ?? []).find(esIdDistancia)
    return id ? metresDeId(id) : ""
  }

  const posa = (cat, sexe, txt) => {
    const n = parseInt(txt, 10)
    const ids = Number.isFinite(n) && n > 0 ? [idDistancia(n)] : []
    const actual = value?.[cat] ?? {}
    const altre = sexe === "M" ? "F" : "M"
    const next = { M: actual.M ?? [], F: actual.F ?? [], [sexe]: ids }
    // Si l'altre sexe està buit o tenia el mateix valor, el segueix (el normal és la mateixa distància).
    const altreMetres = metres(cat, altre)
    const anterior = metres(cat, sexe)
    if (altreMetres === "" || altreMetres === anterior) next[altre] = ids
    onChange({ ...value, [cat]: next })
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <div key={cat} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2">
          <span className="w-14 text-sm font-semibold">{cat}</span>
          {[["M", "Nens"], ["F", "Nenes"]].map(([sexe, label]) => (
            <label key={sexe} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {label}
              <Input
                type="number"
                min={1}
                step={50}
                inputMode="numeric"
                placeholder={DISTANCIA_SUGGERIDA[cat] ? String(DISTANCIA_SUGGERIDA[cat]) : "m"}
                className="h-8 w-24 text-sm"
                value={metres(cat, sexe)}
                onChange={(e) => posa(cat, sexe, e.target.value)}
              />
              m
            </label>
          ))}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Distància de cada categoria en aquesta competició (en metres). Si poses la dels nens, les nenes la copien; la pots canviar a part.
      </p>
    </div>
  )
}

// Selector de proves d'un event: per a cada categoria, quines proves fan els
// nens i quines les nenes. `value` = provesPerCategoria de l'event.
export default function ProvesPerCategoriaEditor({ categories, proves, value, onChange, cross = false }) {
  const [obertes, setObertes] = useState(() => new Set(categories.slice(0, 1)))

  const toggleOberta = (cat) =>
    setObertes((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  const llista = (cat, sexe) => value?.[cat]?.[sexe] ?? []

  const base = (cat) => ({ M: llista(cat, "M"), F: llista(cat, "F"), ...(value?.[cat]?.max ? { max: value[cat].max } : {}) })

  const setLlista = (cat, sexe, ids) =>
    onChange({ ...value, [cat]: { ...base(cat), [sexe]: ids } })

  const setMax = (cat, txt) => {
    const n = parseInt(txt, 10)
    const next = base(cat)
    if (Number.isFinite(n) && n > 0) next.max = n
    else delete next.max
    onChange({ ...value, [cat]: next })
  }

  const toggleProva = (cat, sexe, id) => {
    const actual = llista(cat, sexe)
    setLlista(cat, sexe, actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id])
  }

  const copiar = (cat, de, a) => onChange({ ...value, [cat]: { ...base(cat), [a]: [...llista(cat, de)] } })

  // Proves de cada categoria (segons la secció Proves: prova.categories;
  // sense categories = prova general, surt a totes).
  const provesDeCategoria = (cat) =>
    proves.filter((p) => {
      const cats = p.categories ?? []
      return cats.length === 0 || cats.includes(cat)
    })

  if (categories.length === 0) return null

  if (cross) return <CrossDistancies categories={categories} value={value} onChange={onChange} />

  return (
    <div className="space-y-2">
      {categories.map((cat) => {
        const disponibles = provesDeCategoria(cat)
        const grups = agruparProvesPerTipus(disponibles)
        const oberta = obertes.has(cat)
        const nM = llista(cat, "M").length
        const nF = llista(cat, "F").length
        return (
          <div key={cat} className="rounded-lg border">
            <button
              type="button"
              onClick={() => toggleOberta(cat)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-semibold"
            >
              <span className="flex items-center gap-1.5">
                {oberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {cat}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                Nens {nM} · Nenes {nF}{value?.[cat]?.max ? ` · màx. ${value[cat].max}/atleta` : ""}
              </span>
            </button>

            {oberta && (
              <div className="space-y-4 border-t px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">Màxim de proves per atleta</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Sense límit"
                    className="h-8 w-28 text-sm"
                    value={value?.[cat]?.max ?? ""}
                    onChange={(e) => setMax(cat, e.target.value)}
                  />
                  <span className="text-[11px] text-muted-foreground">Els pares triaran les proves en apuntar-lo.</span>
                </div>
                {disponibles.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hi ha proves de {cat}. Crea-les o assigna-les a la secció Proves.</p>
                )}
                {disponibles.length > 0 && SEXES.map(({ value: sexe, label }) => {
                  const altre = sexe === "M" ? "F" : "M"
                  const seleccionades = llista(cat, sexe)
                  return (
                    <div key={sexe} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                        <div className="flex gap-1">
                          {llista(cat, altre).length > 0 && (
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => copiar(cat, altre, sexe)}>
                              <Copy className="mr-1 h-3 w-3" />
                              Igual que {altre === "M" ? "nens" : "nenes"}
                            </Button>
                          )}
                          {seleccionades.length > 0 && (
                            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setLlista(cat, sexe, [])}>
                              Treure totes
                            </Button>
                          )}
                        </div>
                      </div>
                      {grups.map((g) => (
                        <div key={g.tipus} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{g.etiqueta}</span>
                          {g.proves.map((p) => {
                            const actiu = seleccionades.includes(p.id)
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => toggleProva(cat, sexe, p.id)}
                                className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold transition-all ${
                                  actiu
                                    ? "border-red-600 bg-red-600 text-white"
                                    : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                                }`}
                              >
                                {p.nom}
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
