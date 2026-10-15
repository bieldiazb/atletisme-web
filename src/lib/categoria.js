// Categoria d'un atleta segons l'any de naixement, calculada relativa a
// l'any actual (no a anys fixos). Així la categoria de cada atleta avança
// sola quan passa l'any, sense haver de tocar cap número a mà ni editar
// atletes un per un.
//
// "edat esportiva" = anyReferencia - anyNaixement: és el criteri habitual
// de les federacions (l'edat que es fa aquell any, no la data exacta
// d'aniversari).
const BANDES = [
  { edatMax: 7, categoria: "Sub-8" },
  { edatMax: 9, categoria: "Sub-10" },
  { edatMax: 11, categoria: "Sub-12" },
  { edatMax: 13, categoria: "Sub-14" },
]

// L'app només gestiona de Sub-8 a Sub-14. Qualsevol atleta fora d'aquest rang
// (Sub-16, Sub-18, absoluts...) no té categoria i queda fora de tota la web.
export const CATEGORIES = BANDES.map((b) => b.categoria)
export const esCategoriaVigent = (categoria) => CATEGORIES.includes(categoria)

export function categoriaPerAny(anyNaixement, anyReferencia = new Date().getFullYear()) {
  if (!anyNaixement) return null
  const edat = anyReferencia - anyNaixement
  const banda = BANDES.find((b) => edat <= b.edatMax)
  return banda ? banda.categoria : null // fora del rang Sub-8 – Sub-14
}

// Accepta un Timestamp de Firestore, un Date de JS, o directament l'any (number).
export function categoriaPerNaixement(naixement, anyReferencia = new Date().getFullYear()) {
  let any = null
  if (naixement?.toDate) any = naixement.toDate().getFullYear()
  else if (naixement instanceof Date) any = naixement.getFullYear()
  else if (typeof naixement === "number") any = naixement
  return categoriaPerAny(any, anyReferencia)
}

// Un atleta és de l'app si, per any de naixement, és Sub-8 – Sub-14. Si encara
// no té data de naixement, es fa servir la categoria desada.
export function esAtletaVigent(atleta) {
  const cat = atleta?.naixement ? categoriaPerNaixement(atleta.naixement) : atleta?.categoria
  return esCategoriaVigent(cat)
}
