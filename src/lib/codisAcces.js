// Codis d'accés dels pares — compartit entre AthletesSection.jsx (gestió
// individual) i ImportarAtletesCsvSection.jsx (alta massiva), perquè les
// dues vies generin codis amb les mateixes regles i no es dupliquin.

// Un atleta pot tenir els codis nous a `codisAcces` (array) o, si encara no
// s'ha editat des que vam afegir aquest camp, només el `codiPublic` antic.
export function codisDe(athlete) {
  if (athlete.codisAcces?.length) return athlete.codisAcces
  if (athlete.codiPublic) return [athlete.codiPublic]
  return []
}

// Codi d'accés dels pares: no fem servir el DNI (el club no el té ni el
// necessita), sinó caràcters a l'atzar, sense res que es pugui endevinar
// (ni el nom, ni la data de naixement, ni un número seqüencial). Traiem els
// caràcters que es confonen fàcilment (0/O, 1/I/L) perquè es puguin llegir
// i teclejar bé si mai cal fer-ho a mà.
const ALFABET_CODI = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export function generarCodi(existents = new Set(), longitud = 6) {
  let codi
  do {
    const atzar = crypto.getRandomValues(new Uint32Array(longitud))
    codi = Array.from(atzar, (n) => ALFABET_CODI[n % ALFABET_CODI.length]).join("")
  } while (existents.has(codi))
  return codi
}
