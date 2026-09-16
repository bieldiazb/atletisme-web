import { useEffect, useMemo, useState } from "react"
import { collection, doc, getDocs, updateDoc, writeBatch } from "firebase/firestore"
import JSZip from "jszip"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { logAudit } from "@/lib/auditLog"
import { alertDialog, confirmDialog } from "@/components/GlobalDialog"
import {
  carregarLogoCam,
  carregarProves,
  dibuixarDiploma,
  millorsMarquesDe,
  nomFitxerSegur,
} from "@/lib/diploma"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Award, Eye, EyeOff, FileDown, Loader2 } from "lucide-react"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]
const ANY_ACTUAL = new Date().getFullYear()
const ANYS_DISPONIBLES = [ANY_ACTUAL, ANY_ACTUAL - 1, ANY_ACTUAL - 2, ANY_ACTUAL - 3]

// Bulk writes trossejades (mateix conveni que a la resta de l'app: 450 per
// tanda, per no passar-se del límit de Firestore per batch).
const BATCH_SIZE = 450
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Per defecte (camp encara no fixat) el diploma es mostra als pares — només
// deixa de veure's si un admin/entrenador el desactiva explícitament.
function diplomaVisible(athlete) {
  return athlete?.mostrarDiploma !== false
}

export default function DiplomesSection() {
  const { filtraCat, categories, esAdmin, userData } = useUser()

  const [athletes, setAthletes] = useState([])
  const [proves, setProves] = useState({})
  const [loading, setLoading] = useState(true)
  const [categoriaFiltre, setCategoriaFiltre] = useState("totes")
  const [any, setAny] = useState(ANY_ACTUAL)
  const [generantId, setGenerantId] = useState(null)
  const [generantTot, setGenerantTot] = useState(false)
  const [logoImg, setLogoImg] = useState(null)
  const [logoLlest, setLogoLlest] = useState(false)
  const [canviantVisibilitat, setCanviantVisibilitat] = useState(null)
  const [aplicantVisibilitat, setAplicantVisibilitat] = useState(false)

  // Precarreguem el logo del club una sola vegada (cal com a HTMLImageElement
  // perquè jsPDF el pugui incrustar amb doc.addImage). Si falla, es continua
  // igualment: dibuixarDiploma té un fallback de text.
  useEffect(() => {
    carregarLogoCam().then((img) => {
      setLogoImg(img)
      setLogoLlest(true)
    })
  }, [])

  useEffect(() => {
    const carregar = async () => {
      setLoading(true)
      try {
        const [athletesSnap, provesMap] = await Promise.all([
          getDocs(collection(db, "athletes")),
          carregarProves(),
        ])
        setProves(provesMap)
        setAthletes(filtraCat(athletesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [filtraCat])

  const categoriesDisponibles = esAdmin ? TOTES_CATEGORIES : categories

  const athletesFiltrats = useMemo(() => {
    let llista = athletes.filter((a) => a.actiu !== false)
    if (categoriaFiltre !== "totes") llista = llista.filter((a) => a.categoria === categoriaFiltre)
    return llista.sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? ""))
  }, [athletes, categoriaFiltre])

  const generar = async (athlete) => {
    setGenerantId(athlete.id)
    try {
      const millors = await millorsMarquesDe(athlete.id, any, proves)
      const doc = dibuixarDiploma(athlete, millors, any, logoImg)
      doc.save(`Diploma ${nomFitxerSegur(athlete.nom)} ${any}.pdf`)
    } catch (err) {
      console.error(err)
      await alertDialog("Error generant el diploma: " + err.message)
    } finally {
      setGenerantId(null)
    }
  }

  const generarTots = async () => {
    if (athletesFiltrats.length === 0) return
    const ok = await confirmDialog(
      `Generar ${athletesFiltrats.length} diplomes (temporada ${any}) i baixar-los en un sol fitxer ZIP?`
    )
    if (!ok) return
    setGenerantTot(true)
    try {
      const zip = new JSZip()
      for (const athlete of athletesFiltrats) {
        const millors = await millorsMarquesDe(athlete.id, any, proves)
        const doc = dibuixarDiploma(athlete, millors, any, logoImg)
        const blob = doc.output("blob")
        zip.file(`${nomFitxerSegur(athlete.nom)} - ${any}.pdf`, blob)
      }
      const contingut = await zip.generateAsync({ type: "blob" })
      const url = URL.createObjectURL(contingut)
      const a = document.createElement("a")
      a.href = url
      a.download = `Diplomes ${categoriaFiltre === "totes" ? "tots" : categoriaFiltre} ${any}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      await alertDialog("Error generant els diplomes: " + err.message)
    } finally {
      setGenerantTot(false)
    }
  }

  // Visibilitat de la secció "Diploma" al panell dels pares, per atleta
  // (camp athletes/{id}.mostrarDiploma). No té res a veure amb els permisos
  // de visualització del panell d'admin (PermisosVistesSection) — això és
  // de cara als pares, atleta per atleta.
  const canviarVisibilitat = async (athlete, nouValor) => {
    setCanviantVisibilitat(athlete.id)
    try {
      await updateDoc(doc(db, "athletes", athlete.id), { mostrarDiploma: nouValor })
      setAthletes((prev) => prev.map((a) => (a.id === athlete.id ? { ...a, mostrarDiploma: nouValor } : a)))
      logAudit(userData, "athletes.setDiplomaVisible", { target: athlete.id, extra: { nom: athlete.nom, valor: nouValor } })
    } catch (err) {
      console.error(err)
      await alertDialog("Error canviant la visibilitat: " + err.message)
    } finally {
      setCanviantVisibilitat(null)
    }
  }

  const aplicarVisibilitatATots = async (nouValor) => {
    if (athletesFiltrats.length === 0) return
    const etiquetaCategoria = categoriaFiltre === "totes" ? "tots els atletes" : `tots els atletes de ${categoriaFiltre}`
    const ok = await confirmDialog(
      `${nouValor ? "Activar" : "Desactivar"} el diploma al panell dels pares per a ${etiquetaCategoria} (${athletesFiltrats.length})?`,
      { danger: !nouValor }
    )
    if (!ok) return
    setAplicantVisibilitat(true)
    try {
      for (const grup of chunk(athletesFiltrats, BATCH_SIZE)) {
        const batch = writeBatch(db)
        grup.forEach((a) => batch.update(doc(db, "athletes", a.id), { mostrarDiploma: nouValor }))
        await batch.commit()
      }
      const idsAfectats = new Set(athletesFiltrats.map((a) => a.id))
      setAthletes((prev) => prev.map((a) => (idsAfectats.has(a.id) ? { ...a, mostrarDiploma: nouValor } : a)))
      logAudit(userData, "athletes.bulkSetDiplomaVisible", {
        extra: { categoria: categoriaFiltre, valor: nouValor, count: athletesFiltrats.length },
      })
    } catch (err) {
      console.error(err)
      await alertDialog("Error aplicant el canvi: " + err.message)
    } finally {
      setAplicantVisibilitat(false)
    }
  }

  if (loading || !logoLlest) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6" />
            Diplomes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Genera un diploma en PDF per a cada atleta amb les seves millors marques de la temporada, i tria a qui
            se li mostra la secció "Diploma" al seu panell de pares.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Categoria</p>
          <Select value={categoriaFiltre} onValueChange={setCategoriaFiltre}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="totes">Totes</SelectItem>
              {categoriesDisponibles.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Temporada</p>
          <Select value={String(any)} onValueChange={(v) => setAny(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANYS_DISPONIBLES.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline" size="sm"
            disabled={aplicantVisibilitat || athletesFiltrats.length === 0}
            onClick={() => aplicarVisibilitatATots(true)}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Activar diploma per a tots
          </Button>
          <Button
            variant="outline" size="sm"
            disabled={aplicantVisibilitat || athletesFiltrats.length === 0}
            onClick={() => aplicarVisibilitatATots(false)}
          >
            <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Desactivar diploma per a tots
          </Button>
          <Button disabled={generantTot || athletesFiltrats.length === 0} onClick={generarTots}>
            {generantTot ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generant...</>
            ) : (
              <><FileDown className="mr-2 h-4 w-4" /> Generar tots (ZIP)</>
            )}
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-center">Visible als pares</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {athletesFiltrats.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                No hi ha atletes actius per aquesta categoria.
              </TableCell>
            </TableRow>
          )}
          {athletesFiltrats.map((a) => (
            <TableRow key={a.id}>
              <TableCell>{a.nom}</TableCell>
              <TableCell>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{a.categoria}</span>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex justify-center">
                  <Checkbox
                    checked={diplomaVisible(a)}
                    disabled={canviantVisibilitat === a.id}
                    onCheckedChange={(checked) => canviarVisibilitat(a, checked === true)}
                  />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm" variant="secondary"
                  disabled={generantId === a.id || generantTot}
                  onClick={() => generar(a)}
                >
                  {generantId === a.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <><FileDown className="mr-1.5 h-3.5 w-3.5" /> Diploma</>
                  )}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
