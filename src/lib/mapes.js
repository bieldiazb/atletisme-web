// Enllaços a mapes a partir del camp "ubicacio" d'un event: pot ser un enllaç
// (Google Maps, Apple Maps...) o una adreça/lloc escrit a mà.
const esUrl = (t) => /^https?:\/\//i.test(t)

export function enllacosMapa(ubicacio) {
  const t = (ubicacio ?? "").trim()
  if (!t) return null
  if (esUrl(t)) return { directe: t }
  const q = encodeURIComponent(t)
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
  }
}
