// Ordre de disciplines que ha de seguir tot selector de proves de l'app,
// perquè es vegin agrupades per disciplina (velocitat, fons, salts,
// llançaments, marxa...) en comptes de l'ordre arbitrari amb què arriben de
// Firestore. Mateixos valors de "tipus" que es defineixen a
// ProvesSections.jsx (on es crea/edita cada prova).
export const ORDRE_TIPUS_PROVA = ["velocitat", "fons", "salt", "llançament", "marxa", "altres"]

function posicioTipus(tipus) {
  const i = ORDRE_TIPUS_PROVA.indexOf(tipus)
  return i === -1 ? ORDRE_TIPUS_PROVA.length : i // tipus desconegut → al final
}

// Ordena una llista de proves (objectes amb `tipus` i `nom`, com els docs de
// la col·lecció "proves") per disciplina i, dins de cada disciplina,
// alfabèticament pel nom. No muta l'array original — es pot fer servir
// directament dins d'un .map() de render.
export function ordenarProves(proves) {
  return [...(proves ?? [])].sort((a, b) => {
    const diff = posicioTipus(a?.tipus) - posicioTipus(b?.tipus)
    if (diff !== 0) return diff
    return (a?.nom ?? "").localeCompare(b?.nom ?? "", "ca")
  })
}

// Mateix criteri, per a selectors que filtren per disciplina (valors `tipus`
// com a strings soltes) en comptes de per prova concreta.
export function ordenarTipus(tipusList) {
  return [...(tipusList ?? [])].sort((a, b) => posicioTipus(a) - posicioTipus(b))
}

// Etiqueta llegible per a cada tipus, pensada per fer de títol de secció dins
// d'un selector agrupat (ex: "Salts" per englobar "Llargada", "Alçada"...).
export const ETIQUETA_TIPUS = {
  velocitat: "Velocitat",
  fons: "Fons",
  salt: "Salts",
  llançament: "Llançaments",
  marxa: "Marxa",
  altres: "Altres",
}

function etiquetaTipus(tipus) {
  return ETIQUETA_TIPUS[tipus] ?? "Altres"
}

// Agrupa una llista de proves per disciplina, ja ordenades (grups en l'ordre
// de ORDRE_TIPUS_PROVA, i les proves de cada grup ordenades pel nom). Pensat
// per renderitzar-se directament com a <SelectGroup>+<SelectLabel> dins d'un
// <Select> de shadcn: [{ tipus, etiqueta, proves: [...] }, ...]. Els grups
// sense cap prova no surten.
export function agruparProvesPerTipus(proves) {
  const ordenades = ordenarProves(proves)
  const grups = new Map()
  for (const p of ordenades) {
    const tipus = ORDRE_TIPUS_PROVA.includes(p?.tipus) ? p.tipus : "altres"
    if (!grups.has(tipus)) grups.set(tipus, [])
    grups.get(tipus).push(p)
  }
  return ORDRE_TIPUS_PROVA
    .filter((tipus) => grups.has(tipus))
    .map((tipus) => ({ tipus, etiqueta: etiquetaTipus(tipus), proves: grups.get(tipus) }))
}
