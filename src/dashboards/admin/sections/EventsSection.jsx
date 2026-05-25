import { useEffect, useState } from "react"
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/ui/data-table"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import {
  ArrowDown01,
  ArrowUp01,
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowDownUp,
  CalendarIcon,
  Plus,
  Search,
  X,
} from "lucide-react"
import { format } from "date-fns"
import { ca } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]

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
    Icon = field === "title"
      ? sort.dir === "asc" ? ArrowDownAZ : ArrowUpAZ
      : sort.dir === "asc" ? ArrowDown01 : ArrowUp01
  }
  return (
    <Button variant={isActive ? "secondary" : "outline"} size="sm" onClick={() => onToggle(field)} className="h-8 gap-1.5 px-3 text-xs">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}

export default function EventsSection() {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const { esAdmin, teAccesCat, categories: catUsuari } = useUser()

  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const categoriesDisponibles = esAdmin ? TOTES_CATEGORIES : catUsuari

  const [filters, setFilters] = useState({
    nom: "",
    lloc: "",
    categoria: "tots",
    dataDes: null,
    dataFins: null,
  })

  const [sort, setSort] = useState({ field: "date", dir: "desc" })
  const toggleSort = (field) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: field === "date" ? "desc" : "asc" }
    )
  }

  // Form: categories és un array de categories assignades a l'event
  const [form, setForm] = useState({
    title: "",
    lloc: "",
    link: "",
    date: undefined,
    categories: [],
  })

  const load = async () => {
    const snap = await getDocs(collection(db, "events"))
    setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  // Events filtrats per rol: un entrenador veu els events que inclouen almenys una de les seves categories
  // (o events sense categories assignades, que es consideren generals)
  const eventsDeRol = esAdmin
    ? events
    : events.filter(e => {
        const cats = e.categories ?? []
        if (cats.length === 0) return true // event general, visible per tothom
        return cats.some(c => catUsuari.includes(c))
      })

  const filteredEvents = eventsDeRol
    .filter((e) => {
      if (filters.nom && !e.title?.toLowerCase().includes(filters.nom.toLowerCase())) return false
      if (filters.lloc && !e.lloc?.toLowerCase().includes(filters.lloc.toLowerCase())) return false
      if (filters.categoria !== "tots") {
        const cats = e.categories ?? []
        if (!cats.includes(filters.categoria)) return false
      }
      const d = e.date?.toDate?.()
      if (d) {
        if (filters.dataDes && d < filters.dataDes) return false
        if (filters.dataFins && d > filters.dataFins) return false
      }
      return true
    })
    .sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1
      if (sort.field === "title") return dir * (a.title ?? "").localeCompare(b.title ?? "", "ca")
      if (sort.field === "date") {
        const da = a.date?.toDate?.()?.getTime() ?? 0
        const db2 = b.date?.toDate?.()?.getTime() ?? 0
        return dir * (da - db2)
      }
      return 0
    })

  const hasActiveFilters =
    filters.nom !== "" || filters.lloc !== "" || filters.categoria !== "tots" ||
    filters.dataDes !== null || filters.dataFins !== null

  const resetFilters = () =>
    setFilters({ nom: "", lloc: "", categoria: "tots", dataDes: null, dataFins: null })

  const toggleCategoria = (cat) =>
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }))

  const openCreate = () => {
    setEditing(null)
    setForm({ title: "", lloc: "", date: undefined, categories: [], link: "" })
    setOpen(true)
  }

  const openEdit = (event) => {
    setEditing(event)
    setForm({
      title: event.title,
      lloc: event.lloc ?? "",
      date: event.date?.toDate ? event.date.toDate() : undefined,
      categories: event.categories ?? [],
      link: event.link ?? "",
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.title || !form.date) {
      toast({ variant: "destructive", title: "Error", description: "Nom i data son obligatoris" })
      return
    }
    const payload = {
      title: form.title,
      lloc: form.lloc,
      date: Timestamp.fromDate(form.date),
      categories: form.categories,
      link: form.link,
    }
    if (editing) {
      await updateDoc(doc(db, "events", editing.id), payload)
      toast({ title: "Event editat", description: "Els canvis s'han desat correctament" })
    } else {
      await addDoc(collection(db, "events"), payload)
      toast({ title: "Event creat", description: "L'event s'ha creat correctament" })
    }
    setOpen(false)
    load()
  }

  const confirmDelete = async () => {
    await deleteDoc(doc(db, "events", deleteId))
    setDeleteId(null)
    load()
    toast({ title: "Event eliminat", description: "L'event s'ha eliminat correctament" })
  }

  const columns = [
    { accessorKey: "title", header: "Nom" },
    { accessorKey: "lloc", header: "Lloc" },
    { accessorKey: "link", header: "Enllaç" },
    {
      accessorKey: "categories",
      header: "Categories",
      cell: ({ row }) => {
        const cats = row.original.categories ?? []
        if (cats.length === 0) return <span className="text-xs text-muted-foreground">General</span>
        return (
          <div className="flex flex-wrap gap-1">
            {cats.map(c => (
              <span key={c} className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">{c}</span>
            ))}
          </div>
        )
      },
    },
    {
      accessorKey: "date",
      header: "Data",
      cell: ({ row }) =>
        row.original.date?.toDate
          ? row.original.date.toDate().toLocaleDateString()
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
          Events
          {!esAdmin && catUsuari.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({catUsuari.join(", ")})
            </span>
          )}
        </h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nou event
        </Button>
      </div>

      {/* FILTRES */}
      <div className="mb-4 rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Search className="h-4 w-4" />
            Filtres
            {hasActiveFilters && (
              <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {filteredEvents.length} / {eventsDeRol.length}
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 px-2 text-xs">
              <X className="mr-1 h-3 w-3" />Netejar
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cercar per nom..." value={filters.nom}
              onChange={(e) => setFilters({ ...filters, nom: e.target.value })} className="pl-8" />
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cercar per lloc..." value={filters.lloc}
              onChange={(e) => setFilters({ ...filters, lloc: e.target.value })} className="pl-8" />
          </div>

          {/* Filtre categoria — admin o >1 cat */}
          {(esAdmin || catUsuari.length > 1) && (
            <Select value={filters.categoria} onValueChange={(v) => setFilters({ ...filters, categoria: v })}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tots">Totes les categories</SelectItem>
                <SelectItem value="general">Generals (sense categoria)</SelectItem>
                {categoriesDisponibles.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={`flex-1 justify-start text-left font-normal ${!filters.dataDes ? "text-muted-foreground" : ""}`}>
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
                <Button variant="outline" className={`flex-1 justify-start text-left font-normal ${!filters.dataFins ? "text-muted-foreground" : ""}`}>
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
      </div>

      {/* ORDENACIÓ */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Ordenar per:</span>
        <SortButton label="Data" field="date" sort={sort} onToggle={toggleSort} />
        <SortButton label="Nom" field="title" sort={sort} onToggle={toggleSort} />
      </div>

      <div className="overflow-x-auto">
        <DataTable columns={columns} data={filteredEvents} />
      </div>

      {/* SHEET crear/editar */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[80vh] rounded-t-xl overflow-y-auto" : "w-[420px] overflow-y-auto"}
        >
          <SheetHeader>
            <SheetTitle>{editing ? "Editar event" : "Nou event"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <Input
              placeholder="Nom de l'event"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
            />
            <Input
              placeholder="Lloc"
              value={form.lloc}
              onChange={e => setForm({ ...form, lloc: e.target.value })}
            />

            <Input
              placeholder="Enllaç (opcional)"
              value={form.link}
              onChange={e => setForm({ ...form, link: e.target.value })}
            />

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.date ? format(form.date, "dd/MM/yyyy") : "Selecciona data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={form.date} onSelect={(date) => setForm({ ...form, date })} initialFocus />
              </PopoverContent>
            </Popover>

            {/* Selector de categories de l'event */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Categories <span className="font-normal">(deixa buit per a event general)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {TOTES_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleCategoria(cat)}
                    className={`rounded-full border-2 px-3 py-1 text-xs font-semibold transition-all ${
                      form.categories.includes(cat)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {form.categories.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  ℹ️ Event general — visible per totes les categories
                </p>
              )}
            </div>

            <Button className="w-full" onClick={save}>Guardar</Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar event?</AlertDialogTitle>
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
    </>
  )
}