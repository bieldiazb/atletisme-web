import { useEffect, useState } from "react"
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore"

import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { logAudit } from "@/lib/auditLog"

import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/ui/data-table"
import { Checkbox } from "@/components/ui/checkbox"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"

import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown, ArrowDown01, ArrowUp01, Home, Sun, TreePine, Route, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

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

import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { CalendarIcon, Plus } from "lucide-react"
import { format } from "date-fns"
import { ca } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]

// Ha d'anar en línia amb el mateix llistat a EventsSection.jsx — es guarda a
// l'event i aquí només el llegim per mostrar-lo a cada marca.
const TIPUS_PISTA = [
  { value: "coberta", label: "Coberta", icon: Home },
  { value: "aire_lliure", label: "Aire lliure", icon: Sun },
  { value: "cross", label: "Cross", icon: TreePine },
  { value: "marxa_ruta", label: "Marxa en ruta", icon: Route },
]
function pistaInfo(value) {
  return TIPUS_PISTA.find((p) => p.value === value) ?? null
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

const getCognom = (nom) => nom?.split(" ").slice(1).join(" ").toUpperCase() ?? ""

export default function MarquesSection() {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const { esAdmin, filtraCat, categories: catUsuari, userData } = useUser()

  const [marques, setMarques] = useState([])
  const [athletes, setAthletes] = useState([])
  const [events, setEvents] = useState([])
  const [proves, setProves] = useState([])

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  const categoriesDisponibles = esAdmin ? TOTES_CATEGORIES : catUsuari

  const [filters, setFilters] = useState({
    atletaId: "tots",
    provaId: "tots",
    eventId: "tots",
    categoria: "tots",
    tipusPista: "tots",
    dataDes: null,
    dataFins: null,
  })

  const [sortDir, setSortDir] = useState("desc")
  const toggleSort = () => setSortDir(d => d === "asc" ? "desc" : "asc")

  const [form, setForm] = useState({
    atletaId: "",
    provaId: "",
    eventId: "",
    marca: "",
  })

  const load = async () => {
    const [m, a, e, p] = await Promise.all([
      getDocs(collection(db, "marques")),
      getDocs(collection(db, "athletes")),
      getDocs(query(collection(db, "events"), orderBy("date", "desc"))),
      getDocs(collection(db, "proves")),
    ])

    const athletesMap = {}
    a.docs.forEach(d => (athletesMap[d.id] = { nom: d.data().nom, categoria: d.data().categoria }))
    const eventsMap = {}
    e.docs.forEach(d => (eventsMap[d.id] = { title: d.data().title, tipusPista: d.data().tipusPista, lloc: d.data().lloc }))
    const provesMap = {}
    p.docs.forEach(d => (provesMap[d.id] = d.data().nom))

    setAthletes(a.docs.map(d => ({ id: d.id, ...d.data() })))
    setEvents(e.docs.map(d => ({ id: d.id, ...d.data() })))
    setProves(p.docs.map(d => ({ id: d.id, ...d.data() })))

    setMarques(
      m.docs.map(d => ({
        id: d.id,
        ...d.data(),
        atletaNom: athletesMap[d.data().atletaId]?.nom,
        atletaCategoria: athletesMap[d.data().atletaId]?.categoria,
        eventNom: eventsMap[d.data().eventId]?.title,
        eventLloc: eventsMap[d.data().eventId]?.lloc,
        tipusPista: eventsMap[d.data().eventId]?.tipusPista,
        provaNom: provesMap[d.data().provaId],
      }))
    )
  }

  useEffect(() => { load() }, [])

  // Atletes filtrats per rol
  const atletesDeRol = filtraCat(athletes, "categoria")
  const sortedAthletes = [...atletesDeRol].sort((a, b) =>
    getCognom(a.nom).localeCompare(getCognom(b.nom), "ca")
  )

  // Marques filtrades per rol (via categoria de l'atleta)
  const marquesDeRol = esAdmin
    ? marques
    : marques.filter(m => catUsuari.includes(m.atletaCategoria))

  const filteredMarques = marquesDeRol
    .filter((m) => {
      if (filters.atletaId !== "tots" && m.atletaId !== filters.atletaId) return false
      if (filters.provaId !== "tots" && m.provaId !== filters.provaId) return false
      if (filters.eventId !== "tots" && m.eventId !== filters.eventId) return false
      if (filters.categoria !== "tots" && m.atletaCategoria !== filters.categoria) return false
      if (filters.tipusPista !== "tots" && m.tipusPista !== filters.tipusPista) return false
      const d = m.data?.toDate?.()
      if (d) {
        if (filters.dataDes && d < filters.dataDes) return false
        if (filters.dataFins && d > filters.dataFins) return false
      }
      return true
    })
    .sort((a, b) => {
      const da = a.data?.toDate?.()?.getTime() ?? 0
      const db2 = b.data?.toDate?.()?.getTime() ?? 0
      return sortDir === "asc" ? da - db2 : db2 - da
    })

  const hasActiveFilters =
    filters.atletaId !== "tots" ||
    filters.provaId !== "tots" ||
    filters.eventId !== "tots" ||
    filters.categoria !== "tots" ||
    filters.tipusPista !== "tots" ||
    filters.dataDes !== null ||
    filters.dataFins !== null

  const resetFilters = () =>
    setFilters({ atletaId: "tots", provaId: "tots", eventId: "tots", categoria: "tots", tipusPista: "tots", dataDes: null, dataFins: null })

  // Neteja la selecció d'ids que ja no existeixen
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(marques.map((m) => m.id))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [marques])

  // --- Selecció en massa (només sobre les files que compleixen els filtres actuals) ---
  const filteredIds = filteredMarques.map((m) => m.id)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id))
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id))
  const selectAllCheckboxState = allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id))
      else filteredIds.forEach((id) => next.add(id))
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

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkLoading(true)
    try {
      const BATCH_SIZE = 450
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        ids.slice(i, i + BATCH_SIZE).forEach((id) => batch.delete(doc(db, "marques", id)))
        await batch.commit()
      }
      toast({ title: "Marques eliminades", description: `${ids.length} marca${ids.length > 1 ? "s" : ""} eliminada${ids.length > 1 ? "s" : ""} correctament` })
      logAudit(userData, "marques.bulkDelete", { extra: { quantitat: ids.length } })
      setBulkDeleteConfirm(false)
      clearSelection()
      load()
    } catch {
      toast({ variant: "destructive", title: "Error eliminant en massa", description: "No s'han pogut eliminar" })
    } finally {
      setBulkLoading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ atletaId: "", provaId: "", eventId: "", marca: "" })
    setOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      atletaId: row.atletaId,
      provaId: row.provaId,
      eventId: row.eventId || "",
      marca: row.marca,
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.atletaId || !form.provaId || !form.eventId || !form.marca) {
      toast({ variant: "destructive", title: "Error", description: "Atleta, prova, event i marca son obligatoris" })
      return
    }
    const eventSnap = await getDoc(doc(db, "events", form.eventId))
    if (!eventSnap.exists()) {
      toast({ variant: "destructive", title: "Error", description: "L'event seleccionat no existeix" })
      return
    }
    const eventDate = eventSnap.data().date
    const payload = {
      atletaId: form.atletaId,
      provaId: form.provaId,
      eventId: form.eventId,
      marca: form.marca,
      data: eventDate instanceof Timestamp ? eventDate : Timestamp.fromDate(eventDate.toDate()),
    }
    const atletaNom = sortedAthletes.find((a) => a.id === form.atletaId)?.nom
    const provaNom = proves.find((p) => p.id === form.provaId)?.nom
    if (editing) {
      await updateDoc(doc(db, "marques", editing.id), payload)
      toast({ title: "Marca editada", description: "Els canvis s'han desat correctament" })
      logAudit(userData, "marques.update", { target: editing.id, extra: { atleta: atletaNom, prova: provaNom, marca: form.marca } })
    } else {
      const ref = await addDoc(collection(db, "marques"), payload)
      toast({ title: "Marca creada", description: "La marca s'ha creat correctament" })
      logAudit(userData, "marques.create", { target: ref.id, extra: { atleta: atletaNom, prova: provaNom, marca: form.marca } })
    }
    setOpen(false)
    load()
  }

  const confirmDelete = async () => {
    const m = marques.find((row) => row.id === deleteId)
    await deleteDoc(doc(db, "marques", deleteId))
    setDeleteId(null)
    load()
    toast({ title: "Marca eliminada", description: "La marca s'ha eliminat correctament" })
    logAudit(userData, "marques.delete", { target: deleteId, extra: { atleta: m?.atletaNom, prova: m?.provaNom, marca: m?.marca } })
  }

  const columns = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={selectAllCheckboxState}
          onCheckedChange={toggleSelectAllFiltered}
          aria-label="Seleccionar totes les marques filtrades"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => toggleSelectOne(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Seleccionar marca"
        />
      ),
    },
    { accessorKey: "atletaNom", header: "Atleta" },
    {
      accessorKey: "atletaCategoria",
      header: "Categoria",
      cell: ({ row }) => row.original.atletaCategoria
        ? <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">{row.original.atletaCategoria}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    { accessorKey: "provaNom", header: "Prova" },
    { accessorKey: "marca", header: "Marca" },
    {
      id: "tipusPista",
      header: "Pista",
      cell: ({ row }) => {
        const info = pistaInfo(row.original.tipusPista)
        if (!info) return <span className="text-xs text-muted-foreground">—</span>
        const Icon = info.icon
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">
            <Icon className="h-3 w-3" />
            {info.label}
          </span>
        )
      },
    },
    { accessorKey: "eventNom", header: "Event" },
    {
      accessorKey: "eventLloc",
      header: "Localitat",
      cell: ({ row }) => row.original.eventLloc || <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      accessorKey: "data",
      header: "Data",
      cell: ({ row }) =>
        row.original.data?.toDate
          ? row.original.data.toDate().toLocaleDateString()
          : "—",
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEdit(row.original)}>Editar</Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteId(row.original.id)}>Eliminar</Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Marques
          {!esAdmin && catUsuari.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({catUsuari.join(", ")})
            </span>
          )}
        </h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova marca
        </Button>
      </div>

      {/* BARRA DE SELECCIÓ EN MASSA */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} marca{selectedIds.size > 1 ? "es" : ""} seleccionada{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" disabled={bulkLoading} onClick={() => setBulkDeleteConfirm(true)}>
              Eliminar seleccionades
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
            {hasActiveFilters && (
              <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {filteredMarques.length} / {marquesDeRol.length}
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 px-2 text-xs">
              <X className="mr-1 h-3 w-3" />
              Netejar
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Filtre atleta */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                <span className="truncate">
                  {filters.atletaId !== "tots"
                    ? sortedAthletes.find(a => a.id === filters.atletaId)?.nom
                    : "Tots els atletes"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0">
              <Command>
                <CommandInput placeholder="Buscar atleta..." />
                <CommandEmpty>No s'ha trobat cap atleta</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="tots" onSelect={() => setFilters({ ...filters, atletaId: "tots" })}>
                    <Check className={cn("mr-2 h-4 w-4", filters.atletaId === "tots" ? "opacity-100" : "opacity-0")} />
                    Tots els atletes
                  </CommandItem>
                  {sortedAthletes.map(a => (
                    <CommandItem key={a.id} value={a.nom} onSelect={() => setFilters({ ...filters, atletaId: a.id })}>
                      <Check className={cn("mr-2 h-4 w-4", filters.atletaId === a.id ? "opacity-100" : "opacity-0")} />
                      {a.nom}
                      {a.categoria && <span className="ml-1 text-xs text-muted-foreground">· {a.categoria}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Filtre prova */}
          <Select value={filters.provaId} onValueChange={(v) => setFilters({ ...filters, provaId: v })}>
            <SelectTrigger><SelectValue placeholder="Prova" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tots">Totes les proves</SelectItem>
              {proves.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtre event */}
          <Select value={filters.eventId} onValueChange={(v) => setFilters({ ...filters, eventId: v })}>
            <SelectTrigger><SelectValue placeholder="Event" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tots">Tots els events</SelectItem>
              {events.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  {e.title}
                  {e.date?.toDate && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      · {e.date.toDate().toLocaleDateString()}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtre tipus de pista */}
          <Select value={filters.tipusPista} onValueChange={(v) => setFilters({ ...filters, tipusPista: v })}>
            <SelectTrigger><SelectValue placeholder="Pista" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tots">Tots els tipus</SelectItem>
              {TIPUS_PISTA.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtre categoria — només admin o entrenador amb >1 cat */}
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

        {/* Filtre dates */}
        <div className="grid grid-cols-2 gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={`justify-start text-left font-normal ${!filters.dataDes ? "text-muted-foreground" : ""}`}>
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{filters.dataDes ? format(filters.dataDes, "dd/MM/yyyy") : "Des de..."}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={filters.dataDes} onSelect={(d) => setFilters({ ...filters, dataDes: d ?? null })} weekStartsOn={1} locale={ca} />
              {filters.dataDes && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setFilters({ ...filters, dataDes: null })}>
                    <X className="mr-1 h-3 w-3" /> Treure filtre
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={`justify-start text-left font-normal ${!filters.dataFins ? "text-muted-foreground" : ""}`}>
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{filters.dataFins ? format(filters.dataFins, "dd/MM/yyyy") : "Fins a..."}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={filters.dataFins} onSelect={(d) => setFilters({ ...filters, dataFins: d ?? null })} weekStartsOn={1} locale={ca} />
              {filters.dataFins && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setFilters({ ...filters, dataFins: null })}>
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
        <Button variant="secondary" size="sm" onClick={toggleSort} className="h-8 gap-1.5 px-3 text-xs">
          {sortDir === "asc" ? <ArrowDown01 className="h-3.5 w-3.5" /> : <ArrowUp01 className="h-3.5 w-3.5" />}
          Data {sortDir === "asc" ? "↑ Antiga primer" : "↓ Recent primer"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <DataTable columns={columns} data={filteredMarques} />
      </div>

      {/* SHEET */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[80vh] rounded-t-xl overflow-y-auto" : "w-[420px] overflow-y-auto"}
        >
          <SheetHeader>
            <SheetTitle>{editing ? "Editar marca" : "Nova marca"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {form.atletaId ? sortedAthletes.find(a => a.id === form.atletaId)?.nom : "Selecciona atleta"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar atleta..." />
                  <CommandEmpty>No s'ha trobat cap atleta</CommandEmpty>
                  <CommandGroup>
                    {sortedAthletes.map(a => (
                      <CommandItem key={a.id} value={a.nom} onSelect={() => setForm({ ...form, atletaId: a.id })}>
                        <Check className={cn("mr-2 h-4 w-4", form.atletaId === a.id ? "opacity-100" : "opacity-0")} />
                        {a.nom}
                        {a.categoria && <span className="ml-1 text-xs text-muted-foreground">· {a.categoria}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>

            <Select value={form.provaId} onValueChange={v => setForm({ ...form, provaId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecciona prova" /></SelectTrigger>
              <SelectContent>
                {proves.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={form.eventId} onValueChange={v => setForm({ ...form, eventId: v })}>
              <SelectTrigger><SelectValue placeholder="Event (opcional)" /></SelectTrigger>
              <SelectContent>
                {events.map(e => {
                  const info = pistaInfo(e.tipusPista)
                  return (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title}
                      {info && <span className="ml-2 text-muted-foreground text-xs">· {info.label}</span>}
                      {e.date?.toDate && (
                        <span className="ml-2 text-muted-foreground text-xs">
                          · {e.date.toDate().toLocaleDateString()}
                        </span>
                      )}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            <Input
              placeholder="Marca (ex: 3.84m, 8.12)"
              value={form.marca}
              onChange={e => setForm({ ...form, marca: e.target.value })}
            />

            <Button className="w-full" onClick={save}>Guardar</Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar marca?</AlertDialogTitle>
            <AlertDialogDescription>Aquesta accio no es pot desfer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel·lar</AlertDialogCancel>
            <AlertDialogAction className="w-full sm:w-auto bg-red-600 hover:bg-red-700" onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(v) => !bulkLoading && setBulkDeleteConfirm(v)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {selectedIds.size} marca{selectedIds.size > 1 ? "es" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>Aquesta acció no es pot desfer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={bulkLoading} className="w-full sm:w-auto">Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkLoading}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700"
              onClick={confirmBulkDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}