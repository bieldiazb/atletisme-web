import { useEffect, useMemo, useRef, useState } from "react"
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore"
import QRCode from "qrcode"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { categoriaPerNaixement } from "@/lib/categoria"
import { logAudit } from "@/lib/auditLog"
import { urlAcces } from "@/lib/accesPares"
import { codisDe, generarCodi } from "@/lib/codisAcces"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/ui/data-table"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { importarAtletes } from "./importarAtletes"

import {
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowDown01,
  ArrowUp01,
  ArrowDownUp,
  CalendarIcon,
  Plus,
  Search,
  X,
  StickyNote,
  Sparkles,
  QrCode,
  Copy,
  Download,
} from "lucide-react"
import { format } from "date-fns"
import { ca } from "date-fns/locale"

const DEFAULT_BIRTH_DATE = new Date(new Date().getFullYear() - 8, 0, 1)
const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]

// Firestore writeBatch admet un màxim de 500 operacions. Trossegem per anar bé
// encara que algú seleccioni tot el club de cop.
const BATCH_SIZE = 450
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    window.matchMedia("(max-width: 640px)").matches
  )
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)")
    const listener = () => setIsMobile(media.matches)
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [])
  return isMobile
}

function SortButton({ label, field, sort, onToggle }) {
  const isActive = sort.field === field
  let Icon = ArrowDownUp
  if (isActive) {
    if (field === "nom") {
      Icon = sort.dir === "asc" ? ArrowDownAZ : ArrowUpAZ
    } else {
      Icon = sort.dir === "asc" ? ArrowDown01 : ArrowUp01
    }
  }
  return (
    <Button
      variant={isActive ? "secondary" : "outline"}
      size="sm"
      onClick={() => onToggle(field)}
      className="h-8 gap-1.5 px-3 text-xs"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}

export default function AthletesSection() {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const { esAdmin, filtraCat, categories: catUsuari, userData } = useUser()

  const [athletes, setAthletes] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  // --- Fitxa de l'atleta (dades + observacions), només visible des del panell admin/entrenador ---
  // Les observacions (al·lèrgies, notes...) es guarden en una col·lecció a part
  // ("athlete_notes", 1 document per atleta) i NO al document de l'atleta: el
  // login de pares fa una consulta oberta (sense autenticar) a "athletes" per
  // buscar el codi d'accés, així que aquesta col·lecció és de facto pública —
  // mai hi hem de posar dades sensibles com al·lèrgies.
  const [athleteNotes, setAthleteNotes] = useState({})
  const [viewingAthlete, setViewingAthlete] = useState(null)
  const [obsText, setObsText] = useState("")
  const [savingObs, setSavingObs] = useState(false)

  // --- Accés per enllaç/QR (mateix codi que el login manual, sense teclejar-lo) ---
  const [accessAthlete, setAccessAthlete] = useState(null)
  const [accessCodiSel, setAccessCodiSel] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [qrLoading, setQrLoading] = useState(false)

  const openAccess = (athlete) => {
    setAccessAthlete(athlete)
    setAccessCodiSel(codisDe(athlete)[0] ?? null)
  }

  useEffect(() => {
    if (!accessCodiSel) { setQrDataUrl(null); return }
    let cancelled = false
    setQrLoading(true)
    QRCode.toDataURL(urlAcces(accessCodiSel), { width: 320, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl(null) })
      .finally(() => { if (!cancelled) setQrLoading(false) })
    return () => { cancelled = true }
  }, [accessCodiSel])

  const copiarEnllac = async (codi) => {
    if (!codi) return
    try {
      await navigator.clipboard.writeText(urlAcces(codi))
      toast({ title: "Enllaç copiat" })
    } catch {
      toast({ variant: "destructive", title: "No s'ha pogut copiar", description: urlAcces(codi) })
    }
  }

  const descarregarQR = (nom) => {
    if (!qrDataUrl) return
    const a = document.createElement("a")
    a.href = qrDataUrl
    a.download = `qr-acces-${(nom || "atleta").toLowerCase().replace(/\s+/g, "-")}.png`
    a.click()
  }

  // --- Selecció en massa ---
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  // --- Generació de codis d'accés (mentre no tenim els DNIs dels pares) ---
  const [generantCodis, setGenerantCodis] = useState(false)
  const totsElsCodis = useMemo(() => new Set(athletes.flatMap(codisDe)), [athletes])
  const atletesSenseCodi = useMemo(() => athletes.filter((a) => codisDe(a).length === 0), [athletes])

  const [filters, setFilters] = useState({
    nom: "",
    sexe: "tots",
    actiu: "tots",
    categoria: "tots",
    naixementDes: null,
    naixementFins: null,
  })

  const [sort, setSort] = useState({ field: "nom", dir: "asc" })

  const toggleSort = (field) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    )
  }

  const [form, setForm] = useState({
    nom: "",
    codis: [""],
    sexe: "M",
    naixement: DEFAULT_BIRTH_DATE,
    actiu: true,
  })

  const [displayMonth, setDisplayMonth] = useState(DEFAULT_BIRTH_DATE)

  const years = Array.from({ length: 25 }, (_, i) => new Date().getFullYear() - 20 + i)
  const months = [
    "Gener","Febrer","Març","Abril","Maig","Juny",
    "Juliol","Agost","Setembre","Octubre","Novembre","Desembre",
  ]

  const load = async () => {
    try {
      const [snap, notesSnap] = await Promise.all([
        getDocs(collection(db, "athletes")),
        getDocs(collection(db, "athlete_notes")),
      ])
      setAthletes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      const notesMap = {}
      notesSnap.docs.forEach(d => { notesMap[d.id] = d.data().text ?? "" })
      setAthleteNotes(notesMap)
    } catch {
      toast({
        variant: "destructive",
        title: "Error carregant atletes",
        description: "No s'han pogut carregar les dades",
      })
    }
  }

  useEffect(() => { load() }, [])

  // Neteja la selecció d'ids que ja no existeixen (esborrats en un altre lloc, etc.)
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(athletes.map((a) => a.id))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [athletes])

  // Recategoritza sol: cada cop que un admin obre aquesta secció, compara la
  // categoria desada de cada atleta amb la que li toca per any de naixement
  // i corregeix les que hagin quedat desactualitzades (p. ex. en passar
  // d'any). Així ningú ha d'anar a canviar categories una per una.
  const recategoritzant = useRef(false)
  useEffect(() => {
    if (!esAdmin || athletes.length === 0 || recategoritzant.current) return

    const desajustats = athletes
      .map((a) => ({ id: a.id, actual: a.categoria, correcta: categoriaPerNaixement(a.naixement) }))
      .filter(({ actual, correcta }) => correcta && correcta !== actual)

    if (desajustats.length === 0) return

    recategoritzant.current = true
    const fix = async () => {
      try {
        for (const group of chunk(desajustats, BATCH_SIZE)) {
          const batch = writeBatch(db)
          group.forEach(({ id, correcta }) => batch.update(doc(db, "athletes", id), { categoria: correcta }))
          await batch.commit()
        }
        setAthletes((prev) =>
          prev.map((a) => {
            const fixat = desajustats.find((d) => d.id === a.id)
            return fixat ? { ...a, categoria: fixat.correcta } : a
          })
        )
        toast({
          title: "Categories actualitzades",
          description: `${desajustats.length} atleta${desajustats.length > 1 ? "s" : ""} recategoritzat${desajustats.length > 1 ? "s" : ""} automàticament`,
        })
      } finally {
        recategoritzant.current = false
      }
    }
    fix()
  }, [athletes, esAdmin])

  // Aplica el filtre de categoria del rol de l'usuari
  const atletesDeRol = filtraCat(athletes, "categoria")

  // Categories disponibles per al filtre (les de l'usuari o totes si admin)
  const categoriesDisponibles = esAdmin ? TOTES_CATEGORIES : catUsuari

  const filteredAthletes = atletesDeRol
    .filter((a) => {
      if (filters.nom && !a.nom?.toLowerCase().includes(filters.nom.toLowerCase())) return false
      if (filters.sexe !== "tots" && a.sexe !== filters.sexe) return false
      if (filters.actiu === "si" && !a.actiu) return false
      if (filters.actiu === "no" && a.actiu) return false
      if (filters.categoria !== "tots" && a.categoria !== filters.categoria) return false
      const birthDate = a.naixement?.toDate?.()
      if (birthDate) {
        if (filters.naixementDes && birthDate < filters.naixementDes) return false
        if (filters.naixementFins && birthDate > filters.naixementFins) return false
      }
      return true
    })
    .sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1
      if (sort.field === "nom") {
        return dir * (a.nom ?? "").localeCompare(b.nom ?? "", "ca")
      }
      if (sort.field === "naixement") {
        const da = a.naixement?.toDate?.()?.getTime() ?? 0
        const db2 = b.naixement?.toDate?.()?.getTime() ?? 0
        return dir * (da - db2)
      }
      return 0
    })

  const hasActiveFilters =
    filters.nom !== "" ||
    filters.sexe !== "tots" ||
    filters.actiu !== "tots" ||
    filters.categoria !== "tots" ||
    filters.naixementDes !== null ||
    filters.naixementFins !== null

  const resetFilters = () =>
    setFilters({ nom: "", sexe: "tots", actiu: "tots", categoria: "tots", naixementDes: null, naixementFins: null })

  // --- Lògica de selecció (només sobre les files que compleixen els filtres actuals) ---
  const filteredIds = filteredAthletes.map((a) => a.id)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id))
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id))
  const selectAllCheckboxState = allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id))
      } else {
        filteredIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const bulkSetActiu = async (value) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkLoading(true)
    try {
      for (const group of chunk(ids, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach((id) => batch.update(doc(db, "athletes", id), { actiu: value }))
        await batch.commit()
      }
      toast({
        title: value ? "Atletes marcats com actius" : "Atletes marcats com inactius",
        description: `${ids.length} atleta${ids.length > 1 ? "s" : ""} actualitzat${ids.length > 1 ? "s" : ""}`,
      })
      logAudit(userData, "athletes.bulkUpdate", { extra: { actiu: value, quantitat: ids.length } })
      clearSelection()
      load()
    } catch {
      toast({ variant: "destructive", title: "Error actualitzant en massa", description: "Torna-ho a provar" })
    } finally {
      setBulkLoading(false)
    }
  }

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkLoading(true)
    try {
      for (const group of chunk(ids, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach((id) => batch.delete(doc(db, "athletes", id)))
        await batch.commit()
      }
      toast({ title: "Atletes eliminats", description: `${ids.length} atleta${ids.length > 1 ? "s" : ""} eliminat${ids.length > 1 ? "s" : ""} correctament` })
      logAudit(userData, "athletes.bulkDelete", { extra: { quantitat: ids.length } })
      setBulkDeleteConfirm(false)
      clearSelection()
      load()
    } catch {
      toast({ variant: "destructive", title: "Error eliminant en massa", description: "No s'han pogut eliminar" })
    } finally {
      setBulkLoading(false)
    }
  }

  const generarCodisPendents = async () => {
    if (atletesSenseCodi.length === 0) return
    setGenerantCodis(true)
    try {
      const usats = new Set(totsElsCodis)
      const assignacions = atletesSenseCodi.map((a) => {
        const codi = generarCodi(usats)
        usats.add(codi)
        return { id: a.id, codi }
      })
      for (const group of chunk(assignacions, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach(({ id, codi }) =>
          batch.update(doc(db, "athletes", id), { codisAcces: [codi], codiPublic: codi })
        )
        await batch.commit()
      }
      toast({
        title: "Codis generats",
        description: `${assignacions.length} atleta${assignacions.length > 1 ? "s" : ""} amb codi d'accés nou`,
      })
      logAudit(userData, "athletes.bulkUpdate", {
        extra: { accio: "generarCodisPendents", quantitat: assignacions.length },
      })
      load()
    } catch {
      toast({ variant: "destructive", title: "Error generant codis", description: "Torna-ho a provar" })
    } finally {
      setGenerantCodis(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      nom: "",
      // Codi generat d'entrada: no fem servir el DNI, així que un atleta nou
      // ja neix amb un codi d'accés vàlid sense que l'admin hagi de fer res.
      codis: [generarCodi(totsElsCodis)],
      sexe: "M",
      naixement: DEFAULT_BIRTH_DATE,
      actiu: true,
    })
    setDisplayMonth(DEFAULT_BIRTH_DATE)
    setOpen(true)
  }

  const openEdit = (athlete) => {
    const date = athlete.naixement?.toDate?.() ?? DEFAULT_BIRTH_DATE
    const codisExistents = codisDe(athlete)
    setEditing(athlete)
    setForm({
      nom: athlete.nom,
      codis: codisExistents.length ? codisExistents : [""],
      sexe: athlete.sexe,
      naixement: date,
      actiu: athlete.actiu,
    })
    setDisplayMonth(date)
    setOpen(true)
  }

  const save = async () => {
    const codisNetejats = Array.from(
      new Set(form.codis.map((c) => c.trim().toUpperCase()).filter(Boolean))
    )
    if (!form.nom || codisNetejats.length === 0) {
      toast({ variant: "destructive", title: "Dades incompletes", description: "Nom i almenys un codi d'accés son obligatoris" })
      return
    }
    try {
      const { codis, ...restForm } = form
      const payload = {
        ...restForm,
        naixement: Timestamp.fromDate(form.naixement),
        categoria: categoriaPerNaixement(form.naixement),
        codisAcces: codisNetejats,
        // Es manté per compatibilitat amb qualsevol lloc que encara llegeixi el camp antic.
        codiPublic: codisNetejats[0],
      }
      if (editing) {
        await updateDoc(doc(db, "athletes", editing.id), payload)
        toast({ title: "Atleta actualitzat", description: "Els canvis s'han desat correctament" })
        logAudit(userData, "athletes.update", { target: editing.id, extra: { nom: form.nom } })
      } else {
        const ref = await addDoc(collection(db, "athletes"), payload)
        toast({ title: "Atleta creat", description: "L'atleta s'ha creat correctament" })
        logAudit(userData, "athletes.create", { target: ref.id, extra: { nom: form.nom } })
      }
      setOpen(false)
      load()
    } catch {
      toast({ variant: "destructive", title: "Error desant atleta", description: "Torna-ho a provar" })
    }
  }

  const confirmDelete = async () => {
    try {
      const nom = athletes.find((a) => a.id === deleteId)?.nom
      await deleteDoc(doc(db, "athletes", deleteId))
      toast({ title: "Atleta eliminat", description: "L'atleta s'ha eliminat correctament" })
      logAudit(userData, "athletes.delete", { target: deleteId, extra: { nom } })
      setDeleteId(null)
      load()
    } catch {
      toast({ variant: "destructive", title: "Error eliminant atleta", description: "No s'ha pogut eliminar" })
    }
  }

  // --- Fitxa de l'atleta ---
  const openView = (athlete) => {
    setViewingAthlete(athlete)
    setObsText(athleteNotes[athlete.id] ?? "")
  }

  const guardarObservacions = async () => {
    if (!viewingAthlete) return
    setSavingObs(true)
    try {
      // Col·lecció a part de "athletes" (vegeu comentari a l'estat athleteNotes).
      await setDoc(
        doc(db, "athlete_notes", viewingAthlete.id),
        { text: obsText, updatedAt: Timestamp.now() },
        { merge: true }
      )
      setAthleteNotes((prev) => ({ ...prev, [viewingAthlete.id]: obsText }))
      toast({ title: "Observacions desades" })
    } catch {
      toast({ variant: "destructive", title: "Error desant observacions", description: "Torna-ho a provar" })
    } finally {
      setSavingObs(false)
    }
  }

  const columns = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={selectAllCheckboxState}
          onCheckedChange={toggleSelectAllFiltered}
          aria-label="Seleccionar tots els atletes filtrats"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => toggleSelectOne(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Seleccionar atleta"
        />
      ),
    },
    {
      accessorKey: "nom",
      header: "Nom",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => openView(row.original)}
          className="flex items-center gap-1.5 font-medium hover:text-primary hover:underline text-left"
          title="Veure fitxa i observacions"
        >
          {row.original.nom}
          {athleteNotes[row.original.id]?.trim() && (
            <StickyNote className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          )}
        </button>
      ),
    },
    {
      id: "codis",
      header: "Codis d'accés",
      cell: ({ row }) => {
        const codis = codisDe(row.original)
        if (codis.length === 0) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {codis.map((c) => (
              <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                {c}
              </span>
            ))}
          </div>
        )
      },
    },
    { accessorKey: "sexe", header: "Sexe" },
    {
      accessorKey: "categoria",
      header: "Categoria",
      cell: ({ row }) => row.original.categoria
        ? <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">{row.original.categoria}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      accessorKey: "naixement",
      header: "Naixement",
      cell: ({ row }) =>
        row.original.naixement?.toDate
          ? row.original.naixement.toDate().toLocaleDateString()
          : "—",
    },
    {
      accessorKey: "actiu",
      header: "Actiu",
      cell: ({ row }) => (row.original.actiu ? "Si" : "No"),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={codisDe(row.original).length === 0}
            title="Enllaç / QR d'accés"
            onClick={() => openAccess(row.original)}
          >
            <QrCode className="mr-1.5 h-3.5 w-3.5" />
            QR
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openEdit(row.original)}>
            Editar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteId(row.original.id)}>
            Eliminar
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      {/* HEADER */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Atletes
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({atletesDeRol.length} en total{!esAdmin && catUsuari.length > 0 ? ` · ${catUsuari.join(", ")}` : ""})
          </span>
        </h1>
        <div className="flex gap-2">
          {atletesSenseCodi.length > 0 && (
            <Button variant="outline" disabled={generantCodis} onClick={generarCodisPendents}>
              <Sparkles className="mr-2 h-4 w-4" />
              {generantCodis
                ? "Generant..."
                : `Generar codis pendents (${atletesSenseCodi.length})`}
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nou atleta
          </Button>
        </div>
        {/* <Button variant="outline" onClick={importarAtletes}>
          🚀 Importar atletes
        </Button> */}
      </div>

      {/* BARRA DE SELECCIÓ EN MASSA */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} atlet{selectedIds.size > 1 ? "es" : "a"} seleccionat{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={bulkLoading} onClick={() => bulkSetActiu(true)}>
              Marcar actius
            </Button>
            <Button size="sm" variant="outline" disabled={bulkLoading} onClick={() => bulkSetActiu(false)}>
              Marcar inactius
            </Button>
            <Button size="sm" variant="destructive" disabled={bulkLoading} onClick={() => setBulkDeleteConfirm(true)}>
              Eliminar seleccionats
            </Button>
            <Button size="sm" variant="ghost" disabled={bulkLoading} onClick={clearSelection}>
              <X className="mr-1 h-3 w-3" />
              Netejar selecció
            </Button>
          </div>
        </div>
      )}

      {/* FILTRES */}
      <div className="mb-4 rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Search className="h-4 w-4" />
            Filtres
            <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {hasActiveFilters ? `${filteredAthletes.length} / ${atletesDeRol.length}` : `${atletesDeRol.length} atletes`}
            </span>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 px-2 text-xs">
              <X className="mr-1 h-3 w-3" />
              Netejar
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cercar per nom..."
              value={filters.nom}
              onChange={(e) => setFilters({ ...filters, nom: e.target.value })}
              className="pl-8"
            />
          </div>

          <Select value={filters.sexe} onValueChange={(v) => setFilters({ ...filters, sexe: v })}>
            <SelectTrigger><SelectValue placeholder="Sexe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tots">Tots els sexes</SelectItem>
              <SelectItem value="M">Masculi</SelectItem>
              <SelectItem value="F">Femeni</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.actiu} onValueChange={(v) => setFilters({ ...filters, actiu: v })}>
            <SelectTrigger><SelectValue placeholder="Estat" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tots">Tots els estats</SelectItem>
              <SelectItem value="si">Actius</SelectItem>
              <SelectItem value="no">Inactius</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtre categoria — només visible si admin o té >1 categoria */}
          {(esAdmin || catUsuari.length > 1) && (
            <Select value={filters.categoria} onValueChange={(v) => setFilters({ ...filters, categoria: v })}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tots">Totes les categories</SelectItem>
                {categoriesDisponibles.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`w-full justify-start text-left font-normal ${!filters.naixementDes ? "text-muted-foreground" : ""}`}
              >
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">
                  {filters.naixementDes ? format(filters.naixementDes, "dd/MM/yyyy") : "Nascut des de..."}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={filters.naixementDes}
                onSelect={(d) => setFilters({ ...filters, naixementDes: d ?? null })}
                weekStartsOn={1}
                locale={ca}
              />
              {filters.naixementDes && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs"
                    onClick={() => setFilters({ ...filters, naixementDes: null })}>
                    <X className="mr-1 h-3 w-3" /> Treure filtre
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`w-full justify-start text-left font-normal ${!filters.naixementFins ? "text-muted-foreground" : ""}`}
              >
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">
                  {filters.naixementFins ? format(filters.naixementFins, "dd/MM/yyyy") : "Nascut fins a..."}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={filters.naixementFins}
                onSelect={(d) => setFilters({ ...filters, naixementFins: d ?? null })}
                weekStartsOn={1}
                locale={ca}
              />
              {filters.naixementFins && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs"
                    onClick={() => setFilters({ ...filters, naixementFins: null })}>
                    <X className="mr-1 h-3 w-3" /> Treure filtre
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ORDENACIÓ */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Ordenar per:</span>
        <SortButton label="Nom" field="nom" sort={sort} onToggle={toggleSort} />
        <SortButton label="Naixement" field="naixement" sort={sort} onToggle={toggleSort} />
      </div>

      <DataTable columns={columns} data={filteredAthletes} />

      {/* SHEET */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[80vh] rounded-t-xl overflow-y-auto" : "w-[420px] overflow-y-auto"}
        >
          <SheetHeader>
            <SheetTitle>{editing ? "Editar atleta" : "Nou atleta"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <AthleteForm
              form={form}
              setForm={setForm}
              save={save}
              displayMonth={displayMonth}
              setDisplayMonth={setDisplayMonth}
              years={years}
              months={months}
              existingCodes={totsElsCodis}
            />
            <Button className="w-full" onClick={save}>Guardar</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* DELETE CONFIRM (individual) */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar atleta?</AlertDialogTitle>
            <AlertDialogDescription>Aquesta accio no es pot desfer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE CONFIRM (massa) */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(v) => !bulkLoading && setBulkDeleteConfirm(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar {selectedIds.size} atleta{selectedIds.size > 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>Aquesta acció no es pot desfer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={bulkLoading}
              onClick={confirmBulkDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* FITXA DE L'ATLETA — dades + observacions (només visible aquí, al panell admin/entrenador) */}
      <Dialog open={!!viewingAthlete} onOpenChange={(o) => { if (!o) setViewingAthlete(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewingAthlete?.nom}</DialogTitle>
          </DialogHeader>
          {viewingAthlete && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm rounded-lg bg-muted/40 p-3">
                <span className="text-muted-foreground">Sexe</span>
                <span className="font-medium">{viewingAthlete.sexe === "F" ? "Femení" : "Masculí"}</span>
                <span className="text-muted-foreground">Categoria</span>
                <span className="font-medium">{viewingAthlete.categoria ?? "—"}</span>
                <span className="text-muted-foreground">Naixement</span>
                <span className="font-medium">
                  {viewingAthlete.naixement?.toDate ? viewingAthlete.naixement.toDate().toLocaleDateString() : "—"}
                </span>
                <span className="text-muted-foreground">Estat</span>
                <span className="font-medium">{viewingAthlete.actiu ? "Actiu" : "Inactiu"}</span>
                <span className="text-muted-foreground">Codis d'accés</span>
                <span className="font-medium font-mono">{codisDe(viewingAthlete).join(", ") || "—"}</span>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" />
                  Observacions (al·lèrgies, notes de l'entrenador...)
                </p>
                <Textarea
                  placeholder="Ex: al·lèrgia als fruits secs, s'ha de vigilar el genoll dret..."
                  value={obsText}
                  onChange={(e) => setObsText(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Només visible des del panell d'admin/entrenador — els pares no ho veuen.
                </p>
              </div>

              <Button className="w-full" disabled={savingObs} onClick={guardarObservacions}>
                {savingObs ? "Desant..." : "Desar observacions"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ACCÉS PER ENLLAÇ/QR — mateix codi que el login manual, per compartir per WhatsApp o imprimir */}
      <Dialog
        open={!!accessAthlete}
        onOpenChange={(o) => { if (!o) { setAccessAthlete(null); setAccessCodiSel(null) } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Accés de {accessAthlete?.nom}</DialogTitle>
          </DialogHeader>
          {accessAthlete && (
            <div className="space-y-4 pt-2">
              {codisDe(accessAthlete).length > 1 && (
                <Select value={accessCodiSel ?? ""} onValueChange={setAccessCodiSel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {codisDe(accessAthlete).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex items-center gap-2">
                <Input readOnly value={accessCodiSel ? urlAcces(accessCodiSel) : ""} className="font-mono text-xs" />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  title="Copiar enllaç"
                  onClick={() => copiarEnllac(accessCodiSel)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-4">
                {qrLoading ? (
                  <div className="flex h-48 w-48 items-center justify-center">
                    <span className="text-xs text-muted-foreground">Generant QR...</span>
                  </div>
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt={`QR d'accés de ${accessAthlete.nom}`} className="h-48 w-48" />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center">
                    <span className="text-xs text-muted-foreground">No s'ha pogut generar el QR</span>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!qrDataUrl}
                  onClick={() => descarregarQR(accessAthlete.nom)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Descarregar QR
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Envia aquest enllaç (o el QR) al pare/mare/tutor per WhatsApp: en obrir-lo entren directament,
                sense escriure cap codi. El formulari manual amb el codi ({accessCodiSel}) segueix funcionant igual.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AthleteForm({ form, setForm, save, displayMonth, setDisplayMonth, years, months, existingCodes = new Set() }) {
  const birthDate = form.naixement
  const selectedYear = birthDate.getFullYear()
  const selectedMonth = birthDate.getMonth()

  const updateCodi = (index, value) => {
    const next = [...form.codis]
    next[index] = value
    setForm({ ...form, codis: next })
  }

  const removeCodi = (index) => {
    setForm({ ...form, codis: form.codis.filter((_, i) => i !== index) })
  }

  const addCodi = () => {
    setForm({ ...form, codis: [...form.codis, ""] })
  }

  // No fem servir el DNI dels pares: el codi d'accés és sempre generat a
  // l'atzar (no relacionat amb l'atleta, no endevinable). Aquest botó permet
  // regenerar-lo si cal (p. ex. si un pare l'ha perdut o s'ha de renovar).
  const generarCodiSlot = (index) => {
    const usats = new Set([...existingCodes, ...form.codis.map((c) => c.trim().toUpperCase())])
    updateCodi(index, generarCodi(usats))
  }

  return (
    <div className="space-y-4 py-4">
      <Input
        placeholder="Nom complet"
        value={form.nom}
        onChange={e => setForm({ ...form, nom: e.target.value })}
      />

      {/* Codis d'accés — generats a l'atzar, un per pare/mare/tutor, es poden compartir entre germans */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Codis d'accés</p>
        <p className="text-xs text-muted-foreground">
          Codi que farà servir el pare/mare/tutor per entrar al panell de pares — generat a l'atzar, no cal el DNI.
          Si dos germans comparteixen un pare/mare, copia el mateix codi als dos atletes: el pare veurà un selector per canviar de fill sense tornar a entrar.
        </p>
        {form.codis.map((codi, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="Codi generat"
              value={codi}
              onChange={(e) => updateCodi(i, e.target.value)}
              className="font-mono"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              title="Generar un altre codi a l'atzar"
              onClick={() => generarCodiSlot(i)}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            {form.codis.length > 1 && (
              <Button type="button" size="icon" variant="ghost" onClick={() => removeCodi(i)}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addCodi}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Afegir un altre codi (un altre pare/tutor)
        </Button>
      </div>

      <Select value={form.sexe} onValueChange={v => setForm({ ...form, sexe: v })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="M">Masculi</SelectItem>
          <SelectItem value="F">Femeni</SelectItem>
        </SelectContent>
      </Select>

      {/* La categoria ja no es tria a mà: es calcula sola a partir de la data de naixement */}
      <p className="text-sm text-muted-foreground">
        Categoria: <span className="font-semibold text-foreground">{categoriaPerNaixement(birthDate) ?? "—"}</span>
      </p>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(birthDate, "dd/MM/yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-3 space-y-2">
          <div className="flex gap-2">
            <Select
              value={String(selectedYear)}
              onValueChange={(y) => {
                const d = new Date(+y, selectedMonth, birthDate.getDate())
                setForm({ ...form, naixement: d })
                setDisplayMonth(d)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={String(selectedMonth)}
              onValueChange={(m) => {
                const d = new Date(selectedYear, +m, birthDate.getDate())
                setForm({ ...form, naixement: d })
                setDisplayMonth(d)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Calendar
            mode="single"
            selected={birthDate}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            onSelect={(d) => {
              if (!d) return
              setForm({ ...form, naixement: d })
              setDisplayMonth(d)
            }}
            weekStartsOn={1}
            locale={ca}
          />
        </PopoverContent>
      </Popover>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={form.actiu}
          onCheckedChange={(v) => setForm({ ...form, actiu: !!v })}
        />
        <span>Atleta actiu</span>
      </div>
    </div>
  )
}