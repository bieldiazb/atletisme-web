import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "../../../firebaseClient"

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/ui/sidebar/AppSidebar"
import { paresMenu } from "@/components/ui/sidebar/pares.menu"

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

export default function ParesDashboard() {
  const [view, setView]               = useState("perfil")
  const [athleteId, setAthleteId]     = useState(null)
  const [athleteName, setAthleteName] = useState("")
  const [atletaCategoria, setAtletaCategoria] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const navigate = useNavigate()
  const code = localStorage.getItem("athleteCode")

  useEffect(() => {
    if (!code) { navigate("/"); return }

    const loadAthlete = async () => {
      setLoading(true)
      const q = query(collection(db, "athletes"), where("codiPublic", "==", code.trim().toUpperCase()))
      const snap = await getDocs(q)

      if (snap.empty) {
        localStorage.removeItem("athleteCode")
        setError("Codi incorrecte. Torna a l'inici i prova de nou.")
        setLoading(false)
        return
      }

      const d = snap.docs[0].data()
      setAthleteId(snap.docs[0].id)
      setAthleteName(d.nom)
      setAtletaCategoria(d.categoria ?? null)
      setLoading(false)
    }

    loadAthlete()
  }, [code, navigate])

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

            <div className="border-b pb-4">
              <h1 className="text-2xl font-black">
                {meta.title(athleteName, atletaCategoria)}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">{meta.subtitle}</p>
            </div>

            {view === "perfil"        && <PerfilSection    athleteId={athleteId} />}
            {view === "resultats"     && <ResultatsSection athleteId={athleteId} />}
            {view === "estadistiques" && <EstadistiquesSection athleteId={athleteId} />}
            {view === "calendari"     && <CalendariSection />}
            {view === "categoria"     && <CategoriaSection categoria={atletaCategoria} />}

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}