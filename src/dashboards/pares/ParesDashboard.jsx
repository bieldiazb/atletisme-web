import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore"
import { db } from "../../../firebaseClient"

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/ui/sidebar/AppSidebar"
import { paresMenu } from "@/components/ui/sidebar/pares.menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Users, CalendarRange, MessageCircle } from "lucide-react"

import CalendariSection     from "@/dashboards/pares/sections/CalendariSection"
import ResultatsSection     from "@/dashboards/pares/sections/ResultatsSection"
import PerfilSection        from "@/dashboards/pares/sections/PerfilSection"
import EstadistiquesSection from "./sections/EstadistiquesSection"

const VIEW_META = {
  perfil:        { title: (nom) => `Perfil de ${nom}`,        subtitle: "Resum esportiu i evolució de l'atleta" },
  resultats:     { title: (nom) => `Resultats de ${nom}`,     subtitle: "Marques i competicions del teu fill/a" },
  estadistiques: { title: (nom) => `Estadístiques de ${nom}`, subtitle: "Evolució i millors marques" },
  calendari:     { title: ()    => "Calendari",               subtitle: "Properes competicions i esdeveniments" },
  categoria:     { title: (_, cat) => cat ?? "Categoria",     subtitle: "Tots els atletes de la mateixa categoria" },
}

// Temporades seleccionables al selector dels pares: any actual i els 3 anteriors.
// La temporada és l'any natural (gener–desembre) de la data de l'event/marca.
const ANY_ACTUAL = new Date().getFullYear()
const TEMPORADES = Array.from({ length: 4 }, (_, i) => ANY_ACTUAL - i)

export default function ParesDashboard() {
  const [view, setView]         = useState("perfil")
  // Tots els atletes que el codi introduït dona accés (normalment 1, més d'1 si hi ha germans)
  const [siblings, setSiblings] = useState([])
  const [athleteId, setAthleteId] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Temporada seleccionada — només afecta Perfil i Estadístiques (Calendari sempre
  // mostra les properes competicions i Resultats l'històric complet).
  const [temporada, setTemporada] = useState(() => {
    const desada = Number(localStorage.getItem("paresTemporada"))
    return TEMPORADES.includes(desada) ? desada : ANY_ACTUAL
  })
  const canviarTemporada = (v) => {
    const any = Number(v)
    setTemporada(any)
    localStorage.setItem("paresTemporada", String(any))
  }

  // Enllaç del grup de WhatsApp per categoria (config/whatsapp), gestionat des de l'admin.
  const [whatsappLinks, setWhatsappLinks] = useState({})
  useEffect(() => {
    getDoc(doc(db, "config", "whatsapp"))
      .then((snap) => setWhatsappLinks(snap.exists() ? snap.data() : {}))
      .catch(() => setWhatsappLinks({}))
  }, [])

  const navigate = useNavigate()
  const code = localStorage.getItem("athleteCode")

  useEffect(() => {
    if (!code) { navigate("/"); return }

    const loadAthletes = async () => {
      setLoading(true)
      const normalitzat = code.trim().toUpperCase()

      try {
        // Dues consultes: la nova (codisAcces, array amb un o més codis, compartible
        // entre germans) i la vella (codiPublic, un únic codi) per als atletes que
        // encara no s'han tornat a desar des que vam afegir el camp nou.
        const [snapNous, snapLlegat] = await Promise.all([
          getDocs(query(collection(db, "athletes"), where("codisAcces", "array-contains", normalitzat))),
          getDocs(query(collection(db, "athletes"), where("codiPublic", "==", normalitzat))),
        ])

        const trobats = new Map()
        snapNous.docs.forEach((d) => trobats.set(d.id, { id: d.id, ...d.data() }))
        snapLlegat.docs.forEach((d) => trobats.set(d.id, { id: d.id, ...d.data() }))

        const atletes = Array.from(trobats.values())

        if (atletes.length === 0) {
          localStorage.removeItem("athleteCode")
          setError("Codi incorrecte. Torna a l'inici i prova de nou.")
          setLoading(false)
          return
        }

        atletes.sort((a, b) => (a.nom ?? "").localeCompare(b.nom ?? "", "ca"))
        setSiblings(atletes)

        // Si abans ja havies triat un fill concret amb aquest mateix codi, hi tornem.
        const previId = localStorage.getItem("athleteSelectedId")
        const inicial = atletes.find((a) => a.id === previId) ?? atletes[0]
        setAthleteId(inicial.id)
        setLoading(false)
      } catch {
        setError("No s'han pogut carregar les dades. Torna-ho a provar.")
        setLoading(false)
      }
    }

    loadAthletes()
  }, [code, navigate])

  const selected = siblings.find((a) => a.id === athleteId) ?? siblings[0]
  const athleteName = selected?.nom ?? ""
  const atletaCategoria = selected?.categoria ?? null
  const whatsappCategoria = atletaCategoria ? whatsappLinks[atletaCategoria] : null

  // Categories de tots els germans (per mostrar-los junts al calendari combinat).
  const categoriesGermans = [...new Set(siblings.map((a) => a.categoria).filter(Boolean))]

  const canviarFill = (id) => {
    setAthleteId(id)
    localStorage.setItem("athleteSelectedId", id)
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Carregant…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <p className="text-4xl">⚠️</p>
        <p className="font-semibold text-lg">Alguna cosa ha anat malament</p>
        <p className="text-muted-foreground text-sm">{error}</p>
        <button onClick={() => navigate("/")}
          className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
          Tornar a l'inici
        </button>
      </div>
    </div>
  )

  const meta = VIEW_META[view] ?? VIEW_META.perfil

  return (
    <SidebarProvider>
      <AppSidebar
        currentView={view}
        setView={setView}
        menu={paresMenu}
        title="Àrea Pares"
        subtitle={athleteName}
      />

      <SidebarInset className="flex h-screen flex-col">
        <div className="flex items-center gap-3 border-b p-4 lg:hidden">
          <SidebarTrigger className="h-8 w-8 rounded-md border" />
          <span className="font-semibold truncate">{athleteName}</span>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6">

            <div className="border-b pb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black">
                  {meta.title(athleteName, atletaCategoria)}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">{meta.subtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Enllaç al grup de WhatsApp de la categoria del fill/a seleccionat/da */}
                {whatsappCategoria && (
                  <Button asChild size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                    <a href={whatsappCategoria} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4" />
                      Grup de WhatsApp
                    </a>
                  </Button>
                )}

                {/* Selector de temporada — només té efecte a Perfil i Estadístiques */}
                {(view === "perfil" || view === "estadistiques") && (
                  <div className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select value={String(temporada)} onValueChange={canviarTemporada}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPORADES.map((any) => (
                          <SelectItem key={any} value={String(any)}>Temporada {any}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Selector de fill — només si el codi dona accés a més d'un atleta (germans) */}
                {siblings.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select value={athleteId ?? ""} onValueChange={canviarFill}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {siblings.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nom}{a.categoria ? ` · ${a.categoria}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {view === "perfil"        && <PerfilSection    athleteId={athleteId} temporada={temporada} />}
            {view === "resultats"     && <ResultatsSection athleteId={athleteId} />}
            {view === "estadistiques" && <EstadistiquesSection athleteId={athleteId} temporada={temporada} />}
            {view === "calendari"     && <CalendariSection categories={categoriesGermans} siblings={siblings} />}

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}