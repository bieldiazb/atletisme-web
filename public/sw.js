// Service worker mínim perquè el navegador ofereixi "Instal·lar l'app" i
// l'app carregui ràpid. NO desa mai dades de Firebase (només fitxers
// estàtics del propi lloc), així que els pares sempre veuen dades fresques.
const CACHE = "cam-shell-v1"

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Firebase, Google, FCA... mai

  // Pàgines: xarxa primer; sense connexió, l'última còpia de l'app.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put("/", copia))
          return res
        })
        .catch(() => caches.match("/"))
    )
    return
  }

  // Fitxers estàtics (JS/CSS/imatges amb hash): cache primer, i s'actualitza al fons.
  if (url.pathname.startsWith("/assets/") || /\.(png|jpg|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cachejat) => {
        const xarxa = fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()))
          return res
        }).catch(() => cachejat)
        return cachejat || xarxa
      })
    )
  }
})
