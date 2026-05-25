import { useEffect, useState } from "react"
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
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

import { Plus } from "lucide-react"
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

export default function ProvesSection() {
  const { toast } = useToast()
  const isMobile = useIsMobile()
  const { esAdmin, teAccesCat, categories: catUsuari } = useUser()

  const [proves, setProves] = useState([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const [form, setForm] = useState({ nom: "", tipus: "", categories: [] })

  const load = async () => {
    const snap = await getDocs(collection(db, "proves"))
    setProves(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  // Entrenadors veuen proves de les seves categories + proves generals (sense categories)
  const provesDeRol = esAdmin
    ? proves
    : proves.filter(p => {
        const cats = p.categories ?? []
        if (cats.length === 0) return true
        return cats.some(c => catUsuari.includes(c))
      })

  const openCreate = () => {
    setEditing(null)
    setForm({ nom: "", tipus: "", categories: [] })
    setOpen(true)
  }

  const openEdit = (prova) => {
    setEditing(prova)
    setForm({
      nom: prova.nom,
      tipus: prova.tipus,
      categories: prova.categories ?? [],
    })
    setOpen(true)
  }

  const toggleCategoria = (cat) =>
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }))

  const save = async () => {
    if (!form.nom || !form.tipus) {
      toast({ variant: "destructive", title: "Error", description: "Nom i tipus són obligatoris" })
      return
    }
    const payload = {
      nom: form.nom,
      tipus: form.tipus,
      categories: form.categories,
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
    { accessorKey: "nom", header: "Prova" },
    { accessorKey: "tipus", header: "Tipus" },
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

      <div className="overflow-x-auto">
        <DataTable columns={columns} data={provesDeRol} />
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
    </>
  )
}