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
  { edatMax: 15, categoria: "Sub-16" },
  { edatMax: 17, categoria: "Sub-18" },
]

export function categoriaPerAny(anyNaixement, anyReferencia = new Date().getFullYear()) {
  if (!anyNaixement) return null
  const edat = anyReferencia - anyNaixement
  const banda = BANDES.find((b) => edat <= b.edatMax)
  return banda ? banda.categoria : "Absolut"
}

// Accepta un Timestamp de Firestore, un Date de JS, o directament l'any (number).
export function categoriaPerNaixement(naixement, anyReferencia = new Date().getFullYear()) {
  let any = null
  if (naixement?.toDate) any = naixement.toDate().getFullYear()
  else if (naixement instanceof Date) any = naixement.getFullYear()
  else if (typeof naixement === "number") any = naixement
  return categoriaPerAny(any, anyReferencia)
}
