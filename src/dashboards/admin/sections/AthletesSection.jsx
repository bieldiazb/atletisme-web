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
} from "lucide-react"
import { format } from "date-fns"
import { ca } from "date-fns/locale"

const DEFAULT_BIRTH_DATE = new Date(2017, 0, 1)
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
  const { esAdmin, filtraCat, categories: catUsuari } = useUser()

  const [athletes, setAthletes] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

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
    codiPublic: "",
    sexe: "M",
    naixement: DEFAULT_BIRTH_DATE,
    actiu: true,
    categoria: catUsuari[0] ?? "",
  })

  const [displayMonth, setDisplayMonth] = useState(DEFAULT_BIRTH_DATE)

  const years = Array.from({ length: 20 }, (_, i) => 2010 + i)
  const months = [
    "Gener","Febrer","Març","Abril","Maig","Juny",
    "Juliol","Agost","Setembre","Octubre","Novembre","Desembre",
  ]

  const load = async () => {
    try {
      const snap = await getDocs(collection(db, "athletes"))
      setAthletes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      toast({
        variant: "destructive",
        title: "Error carregant atletes",
        description: "No s'han pogut carregar les dades",
      })
    }
  }

  useEffect(() => { load() }, [])

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

  const openCreate = () => {
    setEditing(null)
    setForm({
      nom: "",
      codiPublic: "",
      sexe: "M",
      naixement: DEFAULT_BIRTH_DATE,
      actiu: true,
      categoria: catUsuari[0] ?? "",
    })
    setDisplayMonth(DEFAULT_BIRTH_DATE)
    setOpen(true)
  }

  const openEdit = (athlete) => {
    const date = athlete.naixement?.toDate?.() ?? DEFAULT_BIRTH_DATE
    setEditing(athlete)
    setForm({
      nom: athlete.nom,
      codiPublic: athlete.codiPublic,
      sexe: athlete.sexe,
      naixement: date,
      actiu: athlete.actiu,
      categoria: athlete.categoria ?? "",
    })
    setDisplayMonth(date)
    setOpen(true)
  }

  const save = async () => {
    if (!form.nom || !form.codiPublic) {
      toast({ variant: "destructive", title: "Dades incompletes", description: "Nom i codi públic son obligatoris" })
      return
    }
    try {
      const payload = { ...form, naixement: Timestamp.fromDate(form.naixement) }
      if (editing) {
        await updateDoc(doc(db, "athletes", editing.id), payload)
        toast({ title: "Atleta actualitzat", description: "Els canvis s'han desat correctament" })
      } else {
        await addDoc(collection(db, "athletes"), payload)
        toast({ title: "Atleta creat", description: "L'atleta s'ha creat correctament" })
      }
      setOpen(false)
      load()
    } catch {
      toast({ variant: "destructive", title: "Error desant atleta", description: "Torna-ho a provar" })
    }
  }

  const confirmDelete = async () => {
    try {
      await deleteDoc(doc(db, "athletes", deleteId))
      toast({ title: "Atleta eliminat", description: "L'atleta s'ha eliminat correctament" })
      setDeleteId(null)
      load()
    } catch {
      toast({ variant: "destructive", title: "Error eliminant atleta", description: "No s'ha pogut eliminar" })
    }
  }

  const columns = [
    { accessorKey: "nom", header: "Nom" },
    { accessorKey: "codiPublic", header: "Codi public" },
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
          {!esAdmin && catUsuari.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({catUsuari.join(", ")})
            </span>
          )}
        </h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nou atleta
        </Button>
        {/* <Button variant="outline" onClick={importarAtletes}>
          🚀 Importar atletes
        </Button> */}
      </div>

      {/* FILTRES */}
      <div className="mb-4 rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Search className="h-4 w-4" />
            Filtres
            {hasActiveFilters && (
              <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {filteredAthletes.length} / {atletesDeRol.length}
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
              categoriesDisponibles={categoriesDisponibles}
            />
            <Button className="w-full" onClick={save}>Guardar</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* DELETE CONFIRM */}
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
    </>
  )
}

function AthleteForm({ form, setForm, save, displayMonth, setDisplayMonth, years, months, categoriesDisponibles }) {
  const birthDate = form.naixement
  const selectedYear = birthDate.getFullYear()
  const selectedMonth = birthDate.getMonth()

  return (
    <div className="space-y-4 py-4">
      <Input
        placeholder="Nom complet"
        value={form.nom}
        onChange={e => setForm({ ...form, nom: e.target.value })}
      />
      <Input
        placeholder="Codi public (ex: CLARA2017)"
        value={form.codiPublic}
        onChange={e => setForm({ ...form, codiPublic: e.target.value })}
      />
      <Select value={form.sexe} onValueChange={v => setForm({ ...form, sexe: v })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="M">Masculi</SelectItem>
          <SelectItem value="F">Femeni</SelectItem>
        </SelectContent>
      </Select>

      {/* Selector categoria */}
      {categoriesDisponibles.length > 0 && (
        <Select value={form.categoria ?? ""} onValueChange={v => setForm({ ...form, categoria: v })}>
          <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            {categoriesDisponibles.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

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