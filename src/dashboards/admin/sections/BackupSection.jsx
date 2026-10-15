import { useState } from "react"
import { collection, getDocs, Timestamp } from "firebase/firestore"
import JSZip from "jszip"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { logAudit } from "@/lib/auditLog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatabaseBackup, Download, Loader2, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react"

// Col·leccions que fa servir l'app (les úniques que les regles deixen llegir).
const COLLECCIONS = [
  "athletes", "athlete_notes", "proves", "events", "marques", "marques_relleu",
  "inscripcions", "assistencies", "equip_optim", "config", "config_privada", "admins", "audit_logs",
]

// Firestore → JSON: els Timestamps es desen com {"__timestamp": "ISO"} perquè
// es puguin restaurar sense perdre el tipus.
function aJson(valor) {
  if (valor instanceof Timestamp) return { __timestamp: valor.toDate().toISOString() }
  if (Array.isArray(valor)) return valor.map(aJson)
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, aJson(v)]))
  }
  return valor
}

// Només developer: còpia de seguretat manual (ZIP amb un JSON per col·lecció)
// i guia per a les còpies automàtiques i la neteja de col·leccions antigues.
export default function BackupSection() {
  const { userData } = useUser()
  const [carregant, setCarregant] = useState(false)
  const [resultat, setResultat] = useState(null) // [{ nom, docs, error }]

  const descarrega = async () => {
    setCarregant(true)
    setResultat(null)
    const zip = new JSZip()
    const resum = []
    for (const nom of COLLECCIONS) {
      try {
        const snap = await getDocs(collection(db, nom))
        const dades = snap.docs.map((d) => ({ id: d.id, ...aJson(d.data()) }))
        zip.file(`${nom}.json`, JSON.stringify(dades, null, 2))
        resum.push({ nom, docs: dades.length })
      } catch {
        resum.push({ nom, docs: 0, error: true })
      }
    }
    setResultat(resum)

    const blob = await zip.generateAsync({ type: "blob" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `copia-camsub10-${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    URL.revokeObjectURL(url)
    logAudit(userData, "backup.export", { extra: { colleccions: resum.filter((r) => !r.error).length } })
    setCarregant(false)
  }

  const Codi = ({ children }) => (
    <code className="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">{children}</code>
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <DatabaseBackup className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Còpies de seguretat</h2>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Còpia manual</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Descarrega un ZIP amb totes les dades (atletes, marques, events, inscripcions, usuaris...).
            Conté dades personals i correus: guarda'l en un lloc privat.
          </p>
          <Button onClick={descarrega} disabled={carregant}>
            {carregant ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Descarregar còpia (ZIP)
          </Button>
          {resultat && (
            <ul className="grid gap-1 sm:grid-cols-2">
              {resultat.map((r) => (
                <li key={r.nom} className="flex items-center gap-1.5 text-xs">
                  {r.error
                    ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  <span className="font-mono">{r.nom}</span>
                  <span className="text-muted-foreground">{r.error ? "sense accés" : `${r.docs} docs`}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Còpies automàtiques (recomanat)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Firestore pot fer còpies sol, cada dia, sense tocar el codi (cal el pla Blaze, que ja tens).
            Un cop, des d'un terminal amb <span className="font-mono">gcloud</span> iniciat:
          </p>
          <Codi>gcloud firestore backups schedules create --database="(default)" --recurrence=daily --retention=14d --project=sub10-ecc96</Codi>
          <p className="text-muted-foreground">
            Guarda les còpies 14 dies. Per veure-les: <span className="font-mono">gcloud firestore backups list --project=sub10-ecc96</span>.
            Un cop activat, es pot restaurar a una base nova des de la consola de Firebase (Firestore → Còpies de seguretat).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4" /> Col·leccions antigues duplicades
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            L'app només fa servir <span className="font-mono">athletes</span> i <span className="font-mono">marques</span>.
            Si a Firestore encara existeixen <span className="font-mono">atletes</span> i <span className="font-mono">marca</span>,
            són restes: el codi no les llegeix ni les escriu i les regles les tenen tancades, per això no es poden veure ni esborrar des d'aquí.
          </p>
          <p>
            Per netejar-les: descarrega primer la còpia, obre la consola de Firebase → Firestore, revisa què hi ha
            a cada una i, si són restes, fes-hi clic als tres punts → <em>Eliminar col·lecció</em>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
