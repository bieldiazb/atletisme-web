import { useEffect, useState } from "react"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import {
  carregarLogoCam,
  carregarProves,
  dibuixarDiploma,
  millorsMarquesDe,
  formatMarca,
  nomFitxerSegur,
} from "@/lib/diploma"
import { alertDialog } from "@/components/GlobalDialog"

import { Button } from "@/components/ui/button"
import { Award, FileDown, Loader2, Sparkles } from "lucide-react"

/* Panell dels pares: perquè puguin baixar-se directament el diploma en PDF
   del seu fill/a per la temporada triada, sense haver de demanar-lo a
   l'entrenador/a — mateix disseny i mateixa lògica que a l'admin
   (DiplomesSection.jsx), reutilitzats via src/lib/diploma.js. */
export default function DiplomaSection({ athleteId, temporada }) {
  const [athlete, setAthlete] = useState(null)
  const [proves, setProves] = useState({})
  const [millors, setMillors] = useState([])
  const [logoImg, setLogoImg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generant, setGenerant] = useState(false)

  useEffect(() => {
    if (!athleteId) return
    let actiu = true
    const carregar = async () => {
      setLoading(true)
      try {
        const [athleteSnap, provesMap, logo] = await Promise.all([
          getDoc(doc(db, "athletes", athleteId)),
          carregarProves(),
          carregarLogoCam(),
        ])
        if (!actiu) return
        const athleteData = athleteSnap.exists() ? { id: athleteSnap.id, ...athleteSnap.data() } : null
        setAthlete(athleteData)
        setProves(provesMap)
        setLogoImg(logo)
        if (athleteData) {
          const m = await millorsMarquesDe(athleteId, temporada, provesMap)
          if (actiu) setMillors(m)
        }
      } finally {
        if (actiu) setLoading(false)
      }
    }
    carregar()
    return () => { actiu = false }
  }, [athleteId, temporada])

  const generar = async () => {
    if (!athlete) return
    setGenerant(true)
    try {
      const pdf = dibuixarDiploma(athlete, millors, temporada, logoImg)
      pdf.save(`Diploma ${nomFitxerSegur(athlete.nom)} ${temporada}.pdf`)
    } catch (err) {
      console.error(err)
      await alertDialog("Hi ha hagut un error generant el diploma: " + err.message)
    } finally {
      setGenerant(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!athlete) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        No s'ha pogut trobar l'atleta.
      </p>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-3xl border-2 border-dashed border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-8 text-center space-y-5 shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
          <Award className="h-8 w-8" />
        </div>

        <div>
          <h2 className="text-xl font-black text-orange-900">
            El diploma de {athlete.nom.split(" ")[0]}!
          </h2>
          <p className="text-sm text-orange-800/70 mt-1">
            Un detallet per la temporada {temporada} de l'equip {athlete.categoria ?? ""}.
          </p>
        </div>

        {millors.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {millors.map((m) => (
              <span
                key={m.nom}
                className="inline-flex items-center gap-1 rounded-full bg-white/70 border border-amber-200 px-3 py-1 text-xs font-semibold text-orange-900"
              >
                <Sparkles className="h-3 w-3 text-amber-500" />
                {m.nom}: {formatMarca(m.val, m.isTem)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-orange-800/60 italic">
            Encara no té marques registrades aquesta temporada — el diploma surt igualment, per l'esforç i les ganes!
          </p>
        )}

        <Button
          size="lg"
          disabled={generant}
          onClick={generar}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md"
        >
          {generant ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generant...</>
          ) : (
            <><FileDown className="mr-2 h-4 w-4" /> Descarregar el diploma</>
          )}
        </Button>
      </div>
    </div>
  )
}
