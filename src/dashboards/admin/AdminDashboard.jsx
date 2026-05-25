import { useState } from "react"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"

import { AppSidebar } from "@/components/ui/sidebar/AppSidebar"
import { adminMenu } from "@/components/ui/sidebar/admin.menu"

import AthletesSection       from "./sections/AthletesSection"
import EventsSection         from "./sections/EventsSection"
import MarquesSection        from "./sections/MarquesSection"
import ProvesSection         from "./sections/ProvesSections"
import AdminsSection         from "./sections/AdminsSection"
import AdminEstadistiquesSection from "./sections/AdminEstadistiquesSection "
import EquipOptimSection     from "./sections/EquipOptimSection"
import ImportarResultatsPDF  from "./sections/ImportarResultatsPDF"

import { UserProvider, useUser } from "../../../UserContext"

// ─── Contingut intern (ja dins del UserProvider) ─────────────────────────────

function DashboardContent() {
  const { esAdmin, categories, rol, nom, userData } = useUser()
  const [view, setView] = useState("athletes")
  const dashboardTitle = nom || "Admin Panel"

  // Filtrem el menú: "create-admin" només visible per admins
  const menuFiltrat = (adminMenu ?? []).filter(item => {
    if (item.id === "create-admin" && !esAdmin) return false
    return true
  })
  console.log("USERDATA COMPLET:", userData)

  return (
    <SidebarProvider>
      <AppSidebar
        currentView={view}
        setView={setView}
        menu={menuFiltrat}
        title={dashboardTitle}
        subtitle={rol === "admin" ? "Administrador" : `Entrenador ${categories.join(", ")}`}
        footer={
          !esAdmin && categories.length > 0 ? (
            <div className="px-4 py-3 border-t space-y-1">
              <p className="text-xs text-muted-foreground font-semibold capitalize">{rol}</p>
              <div className="flex flex-wrap gap-1">
                {categories.map(c => (
                  <span key={c} className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ) : null
        }
      />

      <SidebarInset className="flex h-screen flex-col">
        <div className="flex items-center gap-3 border-b p-4 lg:hidden">
          <SidebarTrigger className="h-8 w-8 rounded-md border" />
          <span className="font-semibold">{dashboardTitle}</span>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {view === "athletes"      && <AthletesSection />}
          {view === "calendar"      && <EventsSection />}
          {view === "marques"       && <MarquesSection />}
          {view === "proves"        && <ProvesSection />}
          {view === "estadistiques" && <AdminEstadistiquesSection />}
          {view === "equip"         && <EquipOptimSection />}
          {view === "importar"          && <ImportarResultatsPDF />}
          {view === "import-results"    && <ImportarResultatsPDF />}
          {view === "importar-resultats" && <ImportarResultatsPDF />}
          {view === "create-admin"  && <AdminsSection />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

// ─── Component arrel: rep adminId i munta el UserProvider ────────────────────

export default function AdminDashboard() {
  return (
    <UserProvider>
      <DashboardContent />
    </UserProvider>
  )
}