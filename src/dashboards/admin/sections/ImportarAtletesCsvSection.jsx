import { useMemo, useRef, useState } from "react"
import { collection, doc, getDocs, Timestamp, writeBatch } from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { categoriaPerNaixement } from "@/lib/categoria"
import { logAudit } from "@/lib/auditLog"
import { codisDe, generarCodi } from "@/lib/codisAcces"
import { parseCsv } from "@/lib/csv"

import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  UploadCloud,
  FileDown,
  CheckCircle2,
  XCircle,
  Loader2,
  Users,
  RotateCcw,
} from "lucide-react"

// Firestore writeBatch admet un màxim de 500 operacions.
const BATCH_SIZE = 450
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function parseSexe(text) {
  const t = (text ?? "").trim().toUpperCase()
  if (["M", "MASCULI", "MASCULÍ", "HOME", "H"].includes(t)) return "M"
  if (["F", "FEMENI", "FEMENÍ", "DONA", "D"].includes(t)) return "F"
  return null
}

function parseNaixement(text) {
  const t = (text ?? "").trim()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) // YYYY-MM-DD
  if (m) {
    const [, y, mo, d] = m
    const date = new Date(+y, +mo - 1, +d)
    return isNaN(date.getTime()) ? null : date
  }
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/) // DD/MM/YYYY o DD-MM-YYYY
  if (m) {
    const [, d, mo, y] = m
    const date = new Date(+y, +mo - 1, +d)
    return isNaN(date.getTime()) ? null : date
  }
  return null
}

function parseActiu(text) {
  const t = (text ?? "").trim().toUpperCase()
  if (t === "" ) return true
  return !["NO", "FALSE", "0"].includes(t)
}

const PLANTILLA_CSV =
  "nom,sexe,naixement,codi\n" +
  "Exemple Atleta,M,15/03/2016,\n" +
  '"Cognom, Nom",F,2015-11-02,\n'

// Alta massiva d'atletes des d'un CSV, amb previsualització i validació
// abans de confirmar res a Firestore. Només visible per developers (vegeu
// admin.menu.js) — és una eina d'alt impacte (crea molts documents de cop),
// no un flux pensat per a l'ús diari dels entrenadors.
export default function ImportarAtletesCsvSection() {
  const { toast } = useToast()
  const { userData } = useUser()
  const fileInputRef = useRef(null)

  const [nomFitxer, setNomFitxer] = useState(null)
  const [files, setFiles] = useState(null) // { headers, records } bruts del CSV
  const [errorFormat, setErrorFormat] = useState(null)
  const [existingCodes, setExistingCodes] = useState(null) // Set carregat de Firestore, o null mentre carrega
  const [important, setImportant] = useState(false)
  const [resultat, setResultat] = useState(null) // { creats, errors } després d'importar

  const descarregarPlantilla = () => {
    const blob = new Blob([PLANTILLA_CSV], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "plantilla-atletes.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const carregarCodisExistents = async () => {
    const snap = await getDocs(collection(db, "athletes"))
    const codis = new Set(snap.docs.flatMap((d) => codisDe(d.data())))
    setExistingCodes(codis)
    return codis
  }

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResultat(null)
    setErrorFormat(null)
    setNomFitxer(file.name)

    try {
      const text = await file.text()
      const { headers, records } = parseCsv(text)

      if (!headers.includes("nom") || !headers.includes("sexe") || !headers.includes("naixement")) {
        setErrorFormat("El CSV ha de tenir com a mínim les columnes: nom, sexe, naixement (codi és opcional).")
        setFiles(null)
        return
      }
      if (records.length === 0) {
        setErrorFormat("El fitxer no té cap fila de dades.")
        setFiles(null)
        return
      }

      await carregarCodisExistents()
      setFiles(records)
    } catch {
      setErrorFormat("No s'ha pogut llegir el fitxer. Assegura't que és un CSV vàlid.")
      setFiles(null)
    } finally {
      // Permet tornar a seleccionar el mateix fitxer si cal repetir
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // --- Validació de cada fila (recalculada quan canvien les dades o els codis existents) ---
  const filesValidades = useMemo(() => {
    if (!files || !existingCodes) return []

    const codisVistosAlFitxer = new Set()

    return files.map((r, idx) => {
      const linia = idx + 2 // +1 per l'índex 0-based, +1 per la capçalera
      const errors = []

      const nom = (r.nom ?? "").trim()
      if (!nom) errors.push("falta el nom")

      const sexe = parseSexe(r.sexe)
      if (!sexe) errors.push(`sexe no vàlid ("${r.sexe}")`)

      const naixement = parseNaixement(r.naixement)
      if (!naixement) errors.push(`data de naixement no vàlida ("${r.naixement}")`)

      let codi = (r.codi ?? "").trim().toUpperCase().replace(/\s+/g, "")
      if (codi) {
        if (existingCodes.has(codi)) errors.push(`el codi "${codi}" ja el fa servir un altre atleta`)
        if (codisVistosAlFitxer.has(codi)) errors.push(`el codi "${codi}" surt repetit al fitxer`)
        codisVistosAlFitxer.add(codi)
      } else {
        codi = null // es generarà en confirmar
      }

      const categoria = naixement ? categoriaPerNaixement(naixement) : null
      const actiu = parseActiu(r.actiu)

      return { linia, nom, sexe, naixement, categoria, codi, actiu, errors, valid: errors.length === 0 }
    })
  }, [files, existingCodes])

  const valides = filesValidades.filter((r) => r.valid)
  const invalides = filesValidades.filter((r) => !r.valid)

  const resetTot = () => {
    setFiles(null)
    setNomFitxer(null)
    setErrorFormat(null)
    setResultat(null)
  }

  const confirmarImportacio = async () => {
    if (valides.length === 0) return
    setImportant(true)
    try {
      // Recarreguem els codis just abans d'escriure per si algú n'ha creat
      // de nous mentre es revisava la previsualització.
      const usats = new Set(await carregarCodisExistents())
      const aCrear = valides.map((r) => {
        const codi = r.codi ?? generarCodi(usats)
        usats.add(codi)
        return {
          nom: r.nom,
          sexe: r.sexe,
          naixement: Timestamp.fromDate(r.naixement),
          categoria: r.categoria,
          actiu: r.actiu,
          codisAcces: [codi],
          codiPublic: codi,
        }
      })

      for (const group of chunk(aCrear, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach((payload) => batch.set(doc(collection(db, "athletes")), payload))
        await batch.commit()
      }

      toast({
        title: "Importació completada",
        description: `${aCrear.length} atleta${aCrear.length > 1 ? "s" : ""} creat${aCrear.length > 1 ? "s" : ""} correctament`,
      })
      logAudit(userData, "athletes.bulkImport", {
        extra: { fitxer: nomFitxer, quantitat: aCrear.length, ambErrors: invalides.length },
      })
      setResultat({ creats: aCrear.length, errors: invalides.length })
      setFiles(null)
    } catch {
      toast({ variant: "destructive", title: "Error important", description: "No s'ha completat la importació. Torna-ho a provar." })
    } finally {
      setImportant(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UploadCloud className="h-6 w-6" />
          Importar atletes (CSV)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alta massiva d'atletes des d'un fitxer CSV, amb previsualització abans de confirmar res.
        </p>
      </div>

      {/* FORMAT ESPERAT */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-medium">Format del CSV</p>
        <p className="text-xs text-muted-foreground">
          Columnes: <code className="font-mono">nom</code>, <code className="font-mono">sexe</code> (M/F),{" "}
          <code className="font-mono">naixement</code> (DD/MM/AAAA o AAAA-MM-DD). Opcionals:{" "}
          <code className="font-mono">codi</code> (si es deixa buit es genera sol) i{" "}
          <code className="font-mono">actiu</code> (per defecte sí). La categoria es calcula sola a partir de la data de naixement.
        </p>
        <Button variant="outline" size="sm" onClick={descarregarPlantilla}>
          <FileDown className="mr-1.5 h-3.5 w-3.5" />
          Descarregar plantilla CSV
        </Button>
      </div>

      {/* RESULTAT D'UNA IMPORTACIÓ ANTERIOR */}
      {resultat && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-green-800">
              {resultat.creats} atleta{resultat.creats > 1 ? "s" : ""} importat{resultat.creats > 1 ? "s" : ""} correctament
            </p>
            {resultat.errors > 0 && (
              <p className="text-xs text-green-700">
                {resultat.errors} fila{resultat.errors > 1 ? "es" : ""} del fitxer s'ha{resultat.errors > 1 ? "n" : ""} ignorat per errors.
              </p>
            )}
            <p className="text-xs text-green-700">
              Per repartir els codis d'accés als pares (enllaç/QR), vés a la secció "Atletes".
            </p>
          </div>
        </div>
      )}

      {/* SELECCIÓ DE FITXER */}
      {!files && (
        <div className="rounded-lg border-2 border-dashed p-8 text-center space-y-3">
          <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Selecciona un fitxer CSV</p>
            {nomFitxer && !errorFormat && (
              <p className="text-xs text-muted-foreground mt-1">Últim seleccionat: {nomFitxer}</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className="hidden"
            id="csv-atletes-input"
          />
          <Button onClick={() => fileInputRef.current?.click()}>
            Triar fitxer
          </Button>
          {errorFormat && (
            <p className="text-xs text-destructive flex items-center justify-center gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              {errorFormat}
            </p>
          )}
        </div>
      )}

      {/* PREVISUALITZACIÓ */}
      {files && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                {valides.length} vàlides
              </span>
              {invalides.length > 0 && (
                <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                  <XCircle className="h-4 w-4" />
                  {invalides.length} amb errors (no s'importaran)
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={resetTot} disabled={important}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Triar un altre fitxer
            </Button>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Línia</th>
                  <th className="px-3 py-2 text-left">Nom</th>
                  <th className="px-3 py-2 text-left">Sexe</th>
                  <th className="px-3 py-2 text-left">Naixement</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-left">Codi</th>
                  <th className="px-3 py-2 text-left">Estat</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filesValidades.map((r) => (
                  <tr key={r.linia} className={r.valid ? "" : "bg-destructive/5"}>
                    <td className="px-3 py-2 text-muted-foreground">{r.linia}</td>
                    <td className="px-3 py-2">{r.nom || "—"}</td>
                    <td className="px-3 py-2">{r.sexe ?? "—"}</td>
                    <td className="px-3 py-2">{r.naixement ? r.naixement.toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2">{r.categoria ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.codi ?? "es generarà"}</td>
                    <td className="px-3 py-2">
                      {r.valid ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Vàlida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium" title={r.errors.join("; ")}>
                          <XCircle className="h-3.5 w-3.5" /> {r.errors.join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            className="w-full"
            disabled={valides.length === 0 || important}
            onClick={confirmarImportacio}
          >
            {important ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Important...</>
            ) : (
              <><Users className="mr-2 h-4 w-4" /> Confirmar importació ({valides.length} atleta{valides.length !== 1 ? "s" : ""})</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
