import { useEffect, useState } from "react"
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/ui/data-table"
import { Checkbox } from "@/components/ui/checkbox"

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

import { Plus, X, UsersRound, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]
const TOTS_TIPUS = ["velocitat", "fons", "salt", "llançament", "marxa", "altres"]

// Restricció de pista per categoria — la mateixa prova pot fer-se a coberta
// per a una categoria i a l'aire lliure per a una altra.
const PISTA_OPCIONS = [
  { value: "totes", label: "Totes dues pistes" },
  { value: "coberta", label: "Només coberta" },
  { value: "aire_lliure", label: "Només aire lliure" },
]

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

export default function ProvesSection() {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const { esAdmin, teAccesCat, categories: catUsuari } = useUser()

  const [proves, setProves] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)

  const [form, setForm] = useState({ nom: "", tipus: "", categories: [], pistaPerCategoria: {}, esRelleu: false })

  // --- Filtres ---
  const [filtreText, setFiltreText] = useState("")
  const [filtreTipus, setFiltreTipus] = useState("tots")
  const [filtreCategoria, setFiltreCategoria] = useState("totes")
  const [filtreRelleu, setFiltreRelleu] = useState("totes")

  const hiHaFiltresActius =
    filtreText.trim() !== "" || filtreTipus !== "tots" || filtreCategoria !== "totes" || filtreRelleu !== "totes"

  const netejarFiltres = () => {
    setFiltreText("")
    setFiltreTipus("tots")
    setFiltreCategoria("totes")
    setFiltreRelleu("totes")
  }

  const load = async () => {
    const snap = await getDocs(collection(db, "proves"))
    setProves(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  // Neteja la selecció d'ids que ja no existeixen
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(proves.map((p) => p.id))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [proves])

  // Entrenadors veuen proves de les seves categories + proves generals (sense categories)
  const provesDeRol = esAdmin
    ? proves
    : proves.filter(p => {
        const cats = p.categories ?? []
        if (cats.length === 0) return true
        return cats.some(c => catUsuari.includes(c))
      })

  // Filtres addicionals sobre les proves visibles per al rol
  const provesFiltrades = provesDeRol.filter(p => {
    if (filtreText.trim() !== "" && !p.nom?.toLowerCase().includes(filtreText.trim().toLowerCase())) return false
    if (filtreTipus !== "tots" && p.tipus !== filtreTipus) return false
    if (filtreCategoria !== "totes") {
      const cats = p.categories ?? []
      if (!(cats.length === 0 || cats.includes(filtreCategoria))) return false
    }
    if (filtreRelleu === "relleu" && !p.esRelleu) return false
    if (filtreRelleu === "no_relleu" && p.esRelleu) return false
    return true
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ nom: "", tipus: "", categories: [], pistaPerCategoria: {}, esRelleu: false })
    setOpen(true)
  }

  const openEdit = (prova) => {
    setEditing(prova)
    setForm({
      nom: prova.nom,
      tipus: prova.tipus,
      categories: prova.categories ?? [],
      pistaPerCategoria: prova.pistaPerCategoria ?? {},
      esRelleu: prova.esRelleu ?? false,
    })
    setOpen(true)
  }

  const toggleCategoria = (cat) =>
    setForm(prev => {
      const treureLa = prev.categories.includes(cat)
      const categories = treureLa
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
      const pistaPerCategoria = { ...prev.pistaPerCategoria }
      if (treureLa) delete pistaPerCategoria[cat]
      return { ...prev, categories, pistaPerCategoria }
    })

  const setPistaCategoria = (cat, valor) =>
    setForm(prev => {
      const pistaPerCategoria = { ...prev.pistaPerCategoria }
      if (valor === "totes") delete pistaPerCategoria[cat]
      else pistaPerCategoria[cat] = valor
      return { ...prev, pistaPerCategoria }
    })

  // --- Selecció en massa (sobre les proves visibles després de filtrar) ---
  const provesIds = provesFiltrades.map((p) => p.id)
  const allSelected = provesIds.length > 0 && provesIds.every((id) => selectedIds.has(id))
  const someSelected = provesIds.some((id) => selectedIds.has(id))
  const selectAllCheckboxState = allSelected ? true : someSelected ? "indeterminate" : false

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) provesIds.forEach((id) => next.delete(id))
      else provesIds.forEach((id) => next.add(id))
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

  const bulkSetTipus = async (value) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkLoading(true)
    try {
      for (const group of chunk(ids, BATCH_SIZE)) {
        const batch = writeBatch(db)
        group.forEach((id) => batch.update(doc(db, "proves", id), { tipus: value }))
        await batch.commit()
      }
      toast({ title: "Proves actualitzades", description: `${ids.length} prova${ids.length > 1 ? "s" : ""} marcada${ids.length > 1 ? "s" : ""} com a ${value}` })
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
        group.forEach((id) => batch.delete(doc(db, "proves", id)))
        await batch.commit()
      }
      toast({ title: "Proves eliminades", description: `${ids.length} prova${ids.length > 1 ? "s" : ""} eliminada${ids.length > 1 ? "s" : ""} correctament` })
      setBulkDeleteConfirm(false)
      clearSelection()
      load()
    } catch {
      toast({ variant: "destructive", title: "Error eliminant en massa", description: "No s'han pogut eliminar" })
    } finally {
      setBulkLoading(false)
    }
  }

  const save = async () => {
    if (!form.nom || !form.tipus) {
      toast({ variant: "destructive", title: "Error", description: "Nom i tipus són obligatoris" })
      return
    }
    const payload = {
      nom: form.nom,
      tipus: form.tipus,
      categories: form.categories,
      pistaPerCategoria: form.pistaPerCategoria,
      esRelleu: form.esRelleu,
    }
    if (editing) {
      await updateDoc(doc(db, "proves", editing.id), payload)
      toast({ title: "Prova editada", description: "Els canvis s'han desat correctament" })
    } else {
      await addDoc(collection(db, "proves"), payload)
      toast({ title: "Prova creada", description: "La prova s'ha creat correctament" })
    }
    setOpen(false)
    load()
  }

  const confirmDelete = async () => {
    await deleteDoc(doc(db, "proves", deleteId))
    setDeleteId(null)
    load()
    toast({ title: "Prova eliminada", description: "La prova s'ha eliminat correctament" })
  }

  const columns = [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={selectAllCheckboxState}
          onCheckedChange={toggleSelectAll}
          aria-label="Seleccionar totes les proves"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => toggleSelectOne(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Seleccionar prova"
        />
      ),
    },
    { accessorKey: "nom", header: "Prova" },
    { accessorKey: "tipus", header: "Tipus" },
    {
      id: "relleu",
      header: "Relleu",
      cell: ({ row }) =>
        row.original.esRelleu ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 text-xs px-2 py-0.5 font-medium">
            <UsersRound className="h-3 w-3" />
            Relleu
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "pista",
      header: "Restricció pista",
      cell: ({ row }) => {
        const mapa = row.original.pistaPerCategoria ?? {}
        const entrades = Object.entries(mapa)
        if (entrades.length === 0) {
          return row.original.noEsFaCoberta ? (
            <span className="rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 font-medium">
              Només aire lliure
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )
        }
        return (
          <div className="flex flex-wrap gap-1">
            {entrades.map(([cat, pista]) => (
              <span key={cat} className="rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 font-medium">
                {cat}: {pista === "coberta" ? "coberta" : "aire lliure"}
              </span>
            ))}
          </div>
        )
      },
    },
    {
      accessorKey: "categories",
      header: "Categories",
      cell: ({ row }) => {
        const cats = row.original.categories ?? []
        if (cats.length === 0) return <span className="text-xs text-muted-foreground">Totes</span>
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
          Proves
          {!esAdmin && catUsuari.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({catUsuari.join(", ")})
            </span>
          )}
        </h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova prova
        </Button>
      </div>

      {/* BARRA DE SELECCIÓ EN MASSA */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} prova{selectedIds.size > 1 ? "es" : ""} seleccionada{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Select onValueChange={bulkSetTipus} disabled={bulkLoading}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Marcar tipus..." /></SelectTrigger>
              <SelectContent>
                {TOTS_TIPUS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {/* BARRA DE FILTRES */}
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cercar per nom..."
            value={filtreText}
            onChange={(e) => setFiltreText(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select value={filtreTipus} onValueChange={setFiltreTipus}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Tipus" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tots">Tots els tipus</SelectItem>
            {TOTS_TIPUS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtreCategoria} onValueChange={setFiltreCategoria}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="totes">Totes les categories</SelectItem>
            {TOTES_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtreRelleu} onValueChange={setFiltreRelleu}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Relleu" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="totes">Individuals i relleus</SelectItem>
            <SelectItem value="relleu">Només relleus</SelectItem>
            <SelectItem value="no_relleu">Només individuals</SelectItem>
          </SelectContent>
        </Select>

        {hiHaFiltresActius && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={netejarFiltres}>
            <X className="mr-1 h-3 w-3" />
            Netejar filtres
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {provesFiltrades.length} de {provesDeRol.length} prova{provesDeRol.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <DataTable columns={columns} data={provesFiltrades} />
      </div>

      {/* SHEET */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[80vh] rounded-t-xl overflow-y-auto" : "w-[420px] overflow-y-auto"}
        >
          <SheetHeader>
            <SheetTitle>{editing ? "Editar prova" : "Nova prova"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <Input
              placeholder="Nom de la prova (ex: 60 mll)"
              value={form.nom}
              onChange={e => setForm({ ...form, nom: e.target.value })}
            />

            <Select value={form.tipus} onValueChange={(v) => setForm({ ...form, tipus: v })}>
              <SelectTrigger><SelectValue placeholder="Tipus de prova" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="velocitat">Velocitat</SelectItem>
                <SelectItem value="fons">Fons</SelectItem>
                <SelectItem value="salt">Salt</SelectItem>
                <SelectItem value="llançament">Llançament</SelectItem>
                <SelectItem value="marxa">Marxa</SelectItem>
                <SelectItem value="altres">Altres</SelectItem>
              </SelectContent>
            </Select>

            {/* Marca de relleu */}
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer">
              <Checkbox
                checked={form.esRelleu}
                onCheckedChange={(v) => setForm({ ...form, esRelleu: !!v })}
              />
              <span className="text-sm font-medium">És una prova de relleu</span>
            </label>

            {/* Selector categories de la prova */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Categories <span className="font-normal">(deixa buit si és per a totes)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {TOTES_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
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
              <p className="text-xs text-muted-foreground mt-1.5">
                {form.categories.length === 0
                  ? "ℹ️ Prova general — visible per totes les categories"
                  : `✓ Assignada a: ${form.categories.join(", ")}`}
              </p>
            </div>

            {/* Restricció de pista, independent per a cada categoria assignada */}
            {form.categories.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  Restricció de pista <span className="font-normal">(opcional, per categoria)</span>
                </p>
                <div className="space-y-1.5">
                  {form.categories.map(cat => (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-xs font-medium">{cat}</span>
                      <Select
                        value={form.pistaPerCategoria?.[cat] ?? "totes"}
                        onValueChange={(v) => setPistaCategoria(cat, v)}
                      >
                        <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PISTA_OPCIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full" onClick={save}>Guardar</Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar prova?</AlertDialogTitle>
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
            <AlertDialogTitle>Eliminar {selectedIds.size} prova{selectedIds.size > 1 ? "es" : ""}?</AlertDialogTitle>
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