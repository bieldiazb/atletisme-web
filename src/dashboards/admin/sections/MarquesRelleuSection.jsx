import { useEffect, useState } from "react"
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  writeBatch,
  Timestamp,
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
import { Check, ChevronsUpDown, Plus, Minus, X, UsersRound } from "lucide-react"
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

import { useToast } from "@/hooks/use-toast"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]
const NUM_ATLETES_DEFECTE = 4

// Firestore writeBatch admet un màxim de 500 operacions.
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

const getCognom = (nom) => nom?.split(" ").slice(1).join(" ").toUpperCase() ?? ""

export default function MarquesRelleuSection() {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const { esAdmin, categories: catUsuari, userData } = useUser()

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

  const [form, setForm] = useState({ provaId: "", eventId: "", marca: "", atletaIds: Array(NUM_ATLETES_DEFECTE).fill("") })
  const [pickerObert, setPickerObert] = useState(null) // índex de l'slot amb el combobox obert

  const load = async () => {
    const [m, a, e, p] = await Promise.all([
      getDocs(collection(db, "marques_relleu")),
      getDocs(collection(db, "athletes")),
      getDocs(query(collection(db, "events"), orderBy("date", "desc"))),
      getDocs(collection(db, "proves")),
    ])

    const athletesMap = {}
    a.docs.forEach(d => (athletesMap[d.id] = { nom: d.data().nom, categoria: d.data().categoria }))
    const eventsMap = {}
    e.docs.forEach(d => (eventsMap[d.id] = { title: d.data().title, date: d.data().date }))
    const provesMap = {}
    p.docs.forEach(d => (provesMap[d.id] = d.data()))

    setAthletes(a.docs.map(d => ({ id: d.id, ...d.data() })))
    setEvents(e.docs.map(d => ({ id: d.id, ...d.data() })))
    setProves(p.docs.map(d => ({ id: d.id, ...d.data() })))

    setMarques(
      m.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          provaNom: provesMap[data.provaId]?.nom,
          provaCategories: provesMap[data.provaId]?.categories ?? [],
          eventNom: eventsMap[data.eventId]?.title,
          eventData: eventsMap[data.eventId]?.date,
          atletaNoms: (data.atletaIds ?? []).map(id => athletesMap[id]?.nom).filter(Boolean),
        }
      })
    )
  }

  useEffect(() => { load() }, [])

  const sortedAthletes = [...athletes].sort((a, b) =>
    getCognom(a.nom).localeCompare(getCognom(b.nom), "ca")
  )

  // Només proves marcades com a relleu
  const provesRelleu = esAdmin
    ? proves.filter(p => p.esRelleu)
    : proves.filter(p => {
        if (!p.esRelleu) return false
        const cats = p.categories ?? []
        return cats.length === 0 || cats.some(c => catUsuari.includes(c))
      })

  const marquesDeRol = esAdmin
    ? marques
    : marques.filter(m => {
        const cats = m.provaCategories ?? []
        return cats.length === 0 || cats.some(c => catUsuari.includes(c))
      })

  const sortedMarques = [...marquesDeRol].sort((a, b) => {
    const da = a.eventData?.toDate?.()?.getTime() ?? 0
    const db2 = b.eventData?.toDate?.()?.getTime() ?? 0
    return db2 - da
  })

  // Neteja la selecció d'ids que ja no existeixen
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(marques.map((m) => m.id))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [marques])

  // --- Selecció en massa ---
  const marquesIds = sortedMarques.map((m) => m.id)
  const allSelected = marquesIds.length > 0 && marquesIds.every((id) => selectedIds.has(id))
  const someSelected = marquesIds.some((id) => selectedIds.has(id))
  const selectAllCheckboxState = allSelected ? true : someSelected ? "indeterminate" : false

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) marquesIds.forEach((id) => next.delete(id))
      else marquesIds.forEach((id) => next.add(id))
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
      for (const group of chunk(ids, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach((id) => batch.delete(doc(db, "marques_relleu", id)))
        await batch.commit()
      }
      toast({ title: "Marques eliminades", description: `${ids.length} marca${ids.length > 1 ? "s" : ""} de relleu eliminada${ids.length > 1 ? "s" : ""} correctament` })
      logAudit(userData, "marques_relleu.bulkDelete", { extra: { quantitat: ids.length } })
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
    setForm({ provaId: "", eventId: "", marca: "", atletaIds: Array(NUM_ATLETES_DEFECTE).fill("") })
    setOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    const ids = row.atletaIds ?? []
    setForm({
      provaId: row.provaId,
      eventId: row.eventId || "",
      marca: row.marca,
      atletaIds: ids.length >= 2 ? ids : Array(NUM_ATLETES_DEFECTE).fill(""),
    })
    setOpen(true)
  }

  const setAtletaSlot = (index, atletaId) => {
    setForm(prev => {
      const next = [...prev.atletaIds]
      next[index] = atletaId
      return { ...prev, atletaIds: next }
    })
    setPickerObert(null)
  }

  const afegirSlot = () => setForm(prev => ({ ...prev, atletaIds: [...prev.atletaIds, ""] }))
  const treureSlot = (index) =>
    setForm(prev => ({ ...prev, atletaIds: prev.atletaIds.filter((_, i) => i !== index) }))

  const save = async () => {
    const idsOmplerts = form.atletaIds.filter(Boolean)
    if (!form.provaId || !form.eventId || !form.marca) {
      toast({ variant: "destructive", title: "Error", description: "Prova, event i marca són obligatoris" })
      return
    }
    if (idsOmplerts.length < 2) {
      toast({ variant: "destructive", title: "Error", description: "Cal seleccionar com a mínim 2 atletes per al relleu" })
      return
    }
    if (new Set(idsOmplerts).size !== idsOmplerts.length) {
      toast({ variant: "destructive", title: "Error", description: "Hi ha un atleta repetit al mateix relleu" })
      return
    }

    const eventSnap = await getDoc(doc(db, "events", form.eventId))
    if (!eventSnap.exists()) {
      toast({ variant: "destructive", title: "Error", description: "L'event seleccionat no existeix" })
      return
    }
    const eventDate = eventSnap.data().date

    const payload = {
      provaId: form.provaId,
      eventId: form.eventId,
      marca: form.marca,
      atletaIds: idsOmplerts,
      data: eventDate instanceof Timestamp ? eventDate : Timestamp.fromDate(eventDate.toDate()),
    }
    const provaNom = proves.find((p) => p.id === form.provaId)?.nom
    const atletaNoms = idsOmplerts.map((id) => sortedAthletes.find((a) => a.id === id)?.nom).filter(Boolean)
    if (editing) {
      await updateDoc(doc(db, "marques_relleu", editing.id), payload)
      toast({ title: "Marca de relleu editada", description: "Els canvis s'han desat correctament" })
      logAudit(userData, "marques_relleu.update", { target: editing.id, extra: { prova: provaNom, marca: form.marca, atletes: atletaNoms.join(", ") } })
    } else {
      const ref = await addDoc(collection(db, "marques_relleu"), payload)
      toast({ title: "Marca de relleu creada", description: "La marca s'ha creat correctament" })
      logAudit(userData, "marques_relleu.create", { target: ref.id, extra: { prova: provaNom, marca: form.marca, atletes: atletaNoms.join(", ") } })
    }
    setOpen(false)
    load()
  }

  const confirmDelete = async () => {
    const m = marques.find((row) => row.id === deleteId)
    await deleteDoc(doc(db, "marques_relleu", deleteId))
    setDeleteId(null)
    load()
    toast({ title: "Marca eliminada", description: "La marca s'ha eliminat correctament" })
    logAudit(userData, "marques_relleu.delete", { target: deleteId, extra: { prova: m?.provaNom, marca: m?.marca, atletes: (m?.atletaNoms ?? []).join(", ") } })
  }

  const columns = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={selectAllCheckboxState}
          onCheckedChange={toggleSelectAll}
          aria-label="Seleccionar totes les marques de relleu"
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
    { accessorKey: "provaNom", header: "Prova" },
    {
      id: "atletes",
      header: "Atletes",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.atletaNoms ?? []).map((nom, i) => (
            <span key={i} className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">
              {nom}
            </span>
          ))}
        </div>
      ),
    },
    { accessorKey: "marca", header: "Marca" },
    { accessorKey: "eventNom", header: "Event" },
    {
      accessorKey: "eventData",
      header: "Data",
      cell: ({ row }) =>
        row.original.eventData?.toDate
          ? row.original.eventData.toDate().toLocaleDateString()
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
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-muted-foreground" />
          Marques de relleu
          {!esAdmin && catUsuari.length > 0 && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({catUsuari.join(", ")})
            </span>
          )}
        </h1>
        <Button onClick={openCreate} disabled={provesRelleu.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Nova marca de relleu
        </Button>
      </div>

      {provesRelleu.length === 0 && (
        <p className="mb-4 text-sm text-muted-foreground rounded-lg border bg-muted/30 px-4 py-3">
          Encara no tens cap prova marcada com a "relleu". Ves a <strong>Proves</strong> i marca-ho al crear-la o editar-la
          per poder-hi registrar marques aquí.
        </p>
      )}

      {/* BARRA DE SELECCIÓ EN MASSA */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} marca{selectedIds.size > 1 ? "s" : ""} seleccionada{selectedIds.size > 1 ? "s" : ""}
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

      <div className="overflow-x-auto">
        <DataTable columns={columns} data={sortedMarques} />
      </div>

      {/* SHEET */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[85vh] rounded-t-xl overflow-y-auto" : "w-[420px] overflow-y-auto"}
        >
          <SheetHeader>
            <SheetTitle>{editing ? "Editar marca de relleu" : "Nova marca de relleu"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <Select value={form.provaId} onValueChange={v => setForm({ ...form, provaId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecciona prova de relleu" /></SelectTrigger>
              <SelectContent>
                {provesRelleu.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={form.eventId} onValueChange={v => setForm({ ...form, eventId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecciona event" /></SelectTrigger>
              <SelectContent>
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

            <Input
              placeholder="Marca del relleu (ex: 58.32, 4:12.05)"
              value={form.marca}
              onChange={e => setForm({ ...form, marca: e.target.value })}
            />

            {/* Atletes del relleu */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Atletes del relleu <span className="font-normal">(per ordre de cursa)</span>
              </p>

              {form.atletaIds.map((atletaId, index) => {
                const atleta = sortedAthletes.find(a => a.id === atletaId)
                return (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-xs font-bold text-muted-foreground">{index + 1}.</span>
                    <div className="flex-1 relative">
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                        onClick={() => setPickerObert(pickerObert === index ? null : index)}
                      >
                        {atleta ? atleta.nom : "Selecciona atleta"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                      {pickerObert === index && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                          <Command>
                            <CommandInput placeholder="Buscar atleta..." />
                            <CommandEmpty>No s'ha trobat cap atleta</CommandEmpty>
                            <CommandGroup className="max-h-52 overflow-y-auto">
                              {sortedAthletes.map(a => (
                                <CommandItem key={a.id} value={a.nom} onSelect={() => setAtletaSlot(index, a.id)}>
                                  <Check className={cn("mr-2 h-4 w-4", atletaId === a.id ? "opacity-100" : "opacity-0")} />
                                  {a.nom}
                                  {a.categoria && <span className="ml-1 text-xs text-muted-foreground">· {a.categoria}</span>}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </div>
                      )}
                    </div>
                    {form.atletaIds.length > 2 && (
                      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => treureSlot(index)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )
              })}

              <Button type="button" size="sm" variant="outline" onClick={afegirSlot}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Afegir atleta
              </Button>
            </div>

            <Button className="w-full" onClick={save}>Guardar</Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar marca de relleu?</AlertDialogTitle>
            <AlertDialogDescription>Aquesta acció no es pot desfer.</AlertDialogDescription>
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
