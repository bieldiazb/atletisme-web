// Proves de cada competició per categoria i sexe.
// Es desa a l'event com:
//   provesPerCategoria: { "Sub-10": { M: [provaId, ...], F: [provaId, ...], max: 2 }, ... }
// max (opcional): màxim de proves per atleta. Els pares trien les proves en
// apuntar-se (inscripcions/{id}.proves), fins a aquest màxim.
// Els pares només veuen les de la categoria i el sexe del seu fill/a.

// Ids de les proves d'un atleta (categoria + sexe) en un event.
export function provesIdsDe(event, categoria, sexe) {
  if (!categoria || !sexe) return []
  return event?.provesPerCategoria?.[categoria]?.[sexe] ?? []
}

// Màxim de proves per atleta d'una categoria (null = sense límit).
export function maxProvesDe(event, categoria) {
  const m = Number(event?.provesPerCategoria?.[categoria]?.max)
  return Number.isFinite(m) && m > 0 ? m : null
}

// Cal que els pares triïn? Sempre que la competició tingui proves per a
// la seva categoria i sexe (les trien al diàleg en apuntar-se).
export function calTriarProves(event, categoria, sexe) {
  return provesIdsDe(event, categoria, sexe).length > 0
}

// Proves que farà realment un atleta: les que han triat (si calia triar) o
// totes les de la seva categoria i sexe.
export function provesEfectives(event, categoria, sexe, triades) {
  const totes = provesIdsDe(event, categoria, sexe)
  if (!calTriarProves(event, categoria, sexe)) return totes
  // Una sola opció (p. ex. la distància d'un cros): no hi ha res a triar.
  if (totes.length === 1) return totes
  return (triades ?? []).filter((id) => totes.includes(id))
}

// ── Cros: proves com a distància ────────────────────────────────────────────
// En un cros no hi ha "proves" del catàleg sinó una distància per categoria
// (Sub-10 1000 m, Sub-12 1200 m...) que l'entrenador escriu a mà perquè canvia
// a cada cros. Es desa igual que una prova (dins M/F), amb un id sintètic
// "dist:<metres>" — així inscripcions, pares i correu funcionen sense canvis.
export const PREFIX_DISTANCIA = "dist:"

// Tipus de competició que es munten per distància (no per proves del catàleg).
export const esTipusDistancia = (tipusPista) => tipusPista === "cross" || tipusPista === "marxa_ruta"

export const esIdDistancia = (id) => typeof id === "string" && id.startsWith(PREFIX_DISTANCIA)

export const idDistancia = (metres) => `${PREFIX_DISTANCIA}${Math.round(Number(metres))}`

export function metresDeId(id) {
  if (!esIdDistancia(id)) return null
  const n = Number(id.slice(PREFIX_DISTANCIA.length))
  return Number.isFinite(n) && n > 0 ? n : null
}

// Nom que es mostra: "1000 m".
export const nomDistancia = (id) => {
  const m = metresDeId(id)
  return m ? `${m} m` : ""
}

// Distància (metres) d'una categoria i sexe en un cros, o null.
export function distanciaDe(event, categoria, sexe) {
  const id = provesIdsDe(event, categoria, sexe).find(esIdDistancia)
  return id ? metresDeId(id) : null
}

// Resol un id de prova a un objecte {id, nom, tipus}: del catàleg o, si és
// una distància de cros, una prova sintètica.
export function provaDeId(id, provesMap) {
  if (esIdDistancia(id)) {
    const nom = nomDistancia(id)
    return nom ? { id, nom, tipus: "fons", categories: [], distancia: true } : null
  }
  return provesMap?.[id] ?? null
}

// Neteja el mapa abans de desar: treu categories que ja no són de l'event i
// llistes buides. Si es passa `tipusPista`, en un cros només es conserven les
// distàncies i, en qualsevol altre tipus, només les proves del catàleg (així
// canviar el tipus de pista no deixa restes de l'altre mode).
export function netejaProvesPerCategoria(mapa, categoriesEvent, tipusPista) {
  const out = {}
  const filtra = (ids) =>
    tipusPista === undefined ? ids : ids.filter((id) => esTipusDistancia(tipusPista) === esIdDistancia(id))
  for (const [cat, perSexe] of Object.entries(mapa ?? {})) {
    if (categoriesEvent.length > 0 && !categoriesEvent.includes(cat)) continue
    const M = filtra(perSexe?.M ?? [])
    const F = filtra(perSexe?.F ?? [])
    const max = Number(perSexe?.max)
    const ambMax = !esTipusDistancia(tipusPista) && Number.isFinite(max) && max > 0
    if (M.length || F.length) out[cat] = { M, F, ...(ambMax ? { max } : {}) }
  }
  return out
}
