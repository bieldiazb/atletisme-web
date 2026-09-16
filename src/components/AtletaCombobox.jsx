import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Treu accents/diacrítics per poder cercar "nunez" i trobar "Núñez" (o
// "alex" i trobar "Àlex"), sense dependre que l'usuari els escrigui bé.
function normalitza(text) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/**
 * Selector d'atleta: cerca pel nom + filtres de sexe i categoria, amb els
 * resultats agrupats per categoria (ordre segons `categoriesOrdre`, i
 * alfabèticament pel nom dins de cada grup). Es tanca sol en triar un
 * atleta i reinicia cerca/filtres cada cop que s'obre — no cal netejar-los
 * a mà abans de la propera vegada.
 *
 * `athletes` ha d'arribar ja filtrat pel rol de qui l'utilitza (com sempre
 * a l'app) — aquest component només s'ocupa de cercar/agrupar el que rep.
 */
export function AtletaCombobox({ athletes, value, onChange, categoriesOrdre, placeholder = "Selecciona atleta" }) {
  const [open, setOpen] = useState(false)
  const [cerca, setCerca] = useState("")
  const [sexeFiltre, setSexeFiltre] = useState("tots")
  const [categoriaFiltre, setCategoriaFiltre] = useState("tots")

  const seleccionat = athletes.find((a) => a.id === value)

  const handleOpenChange = (obert) => {
    setOpen(obert)
    if (!obert) {
      setCerca("")
      setSexeFiltre("tots")
      setCategoriaFiltre("tots")
    }
  }

  const filtrats = athletes.filter((a) => {
    if (sexeFiltre !== "tots" && a.sexe !== sexeFiltre) return false
    if (categoriaFiltre !== "tots" && a.categoria !== categoriaFiltre) return false
    if (cerca && !normalitza(a.nom).includes(normalitza(cerca))) return false
    return true
  })

  // Només les categories que realment tenen atletes disponibles (respecta
  // el filtre de rol de qui crida el component) — tant per agrupar els
  // resultats com per no oferir categories buides al desplegable.
  const categoriesDisponibles = categoriesOrdre.filter((cat) => athletes.some((a) => a.categoria === cat))
  const senseCategoria = filtrats.filter((a) => !categoriesOrdre.includes(a.categoria))

  const grups = [
    ...categoriesDisponibles
      .filter((cat) => filtrats.some((a) => a.categoria === cat))
      .map((cat) => ({
        etiqueta: cat,
        atletes: filtrats.filter((a) => a.categoria === cat).sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? "", "ca")),
      })),
    ...(senseCategoria.length > 0
      ? [{ etiqueta: "Sense categoria", atletes: [...senseCategoria].sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? "", "ca")) }]
      : []),
  ]

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">
            {seleccionat
              ? `${seleccionat.nom}${seleccionat.categoria ? ` · ${seleccionat.categoria}` : ""}`
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar pel nom..." value={cerca} onValueChange={setCerca} />

          <div className="flex gap-2 border-b p-2">
            <Select value={sexeFiltre} onValueChange={setSexeFiltre}>
              <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tots">Nens i nenes</SelectItem>
                <SelectItem value="M">Nens</SelectItem>
                <SelectItem value="F">Nenes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoriaFiltre} onValueChange={setCategoriaFiltre}>
              <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tots">Totes les categories</SelectItem>
                {categoriesDisponibles.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CommandList>
            <CommandEmpty>Cap atleta amb aquests filtres</CommandEmpty>
            {grups.map((grup) => (
              <CommandGroup key={grup.etiqueta} heading={grup.etiqueta}>
                {grup.atletes.map((a) => (
                  <CommandItem key={a.id} value={a.id} onSelect={() => { onChange(a.id); handleOpenChange(false) }}>
                    <Check className={cn("h-4 w-4", value === a.id ? "opacity-100" : "opacity-0")} />
                    {a.nom}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
