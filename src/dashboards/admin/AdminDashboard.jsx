import { useState } from "react"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"

import { AppSidebar } from "@/components/ui/sidebar/AppSidebar"
import { MobileBottomNav } from "@/components/ui/sidebar/MobileBottomNav"
import { adminMenu, BOTTOM_NAV_ENTRENADOR_KEYS, BOTTOM_NAV_ADMIN_KEYS } from "@/components/ui/sidebar/admin.menu"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

import AthletesSection       from "./sections/AthletesSection"
import PassarLlistaSection   from "./sections/PassarLlistaSection"
import RegistreAssistenciaSection from "./sections/RegistreAssistenciaSection"
import EventsSection         from "./sections/EventsSection"
import MarquesSection        from "./sections/MarquesSection"
import MarquesRelleuSection  from "./sections/MarquesRelleuSection"
import ProvesSection         from "./sections/ProvesSections"
import AdminsSection         from "./sections/AdminsSection"
import AuditLogSection       from "./sections/AuditLogSection"
import ConfiguracioSection   from "./sections/ConfiguracioSection"
import ImportarAtletesCsvSection from "./sections/ImportarAtletesCsvSection"
import PermisosVistesSection from "./sections/PermisosVistesSection"
import AdminEstadistiquesSection from "./sections/AdminEstadistiquesSection "
import EquipOptimSection     from "./sections/EquipOptimSection"
import ImportarResultatsPDF  from "./sections/ImportarResultatsPDF"
import DiplomesSection       from "./sections/DiplomesSection"

import { UserProvider, useUser } from "../../../UserContext"

// ─── Contingut intern (ja dins del UserProvider) ─────────────────────────────

function DashboardContent() {
  const { esAdmin, esDeveloper, categories, rol, nom, userData, potVeureItem } = useUser()
  const [view, setView] = useState("athletes")
  const dashboardTitle = nom || "Admin Panel"
  const isMobile = useIsMobile()

  // Filtrem el menú item per item (potVeureItem, a UserContext): per defecte
  // segons el rol (com sempre), però un developer pot personalitzar-ho per
  // usuari des de "Permisos de visualització". Es treuen els grups que es
  // quedin sense cap item visible.
  const menuFiltrat = (adminMenu ?? [])
    .map(grup => ({
      ...grup,
      items: grup.items.filter(item => potVeureItem(item, grup.adminOnly)),
    }))
    .filter(grup => grup.items.length > 0)

  // Accessos ràpids de la barra inferior mòbil: diferents per rol (vegeu
  // BOTTOM_NAV_*_KEYS a admin.menu.js), resolts contra el menú ja filtrat
  // per permisos perquè mai mostrin un item que aquell usuari no pot veure.
  const totsItemsVisibles = menuFiltrat.flatMap(grup => grup.items)
  const bottomNavKeys = esAdmin ? BOTTOM_NAV_ADMIN_KEYS : BOTTOM_NAV_ENTRENADOR_KEYS
  const bottomNavItems = bottomNavKeys
    .map(key => totsItemsVisibles.find(item => item.key === key))
    .filter(Boolean)

  return (
    <SidebarProvider>
      <AppSidebar
        currentView={view}
        setView={setView}
        menu={menuFiltrat}
        title={dashboardTitle}
        subtitle={rol === "developer" ? "Desenvolupador" : rol === "admin" ? "Administrador" : `Entrenador ${categories.join(", ")}`}
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

        <div className={cn("flex-1 overflow-auto p-6", isMobile && "pb-24")}>
          {view === "athletes"      && <AthletesSection />}
          {view === "assistencia"   && <PassarLlistaSection />}
          {view === "registre-assistencia" && <RegistreAssistenciaSection />}
          {view === "calendar"      && <EventsSection />}
          {view === "marques"       && <MarquesSection />}
          {view === "marques-relleu" && <MarquesRelleuSection />}
          {view === "proves"        && <ProvesSection />}
          {view === "estadistiques" && <AdminEstadistiquesSection />}
          {view === "equip"         && <EquipOptimSection />}
          {view === "importar"          && <ImportarResultatsPDF />}
          {view === "import-results"    && <ImportarResultatsPDF />}
          {view === "importar-resultats" && <ImportarResultatsPDF />}
          {view === "diplomes"      && <DiplomesSection />}
          {view === "create-admin"  && <AdminsSection />}
          {view === "configuracio"  && <ConfiguracioSection />}
          {view === "importar-atletes-csv" && <ImportarAtletesCsvSection />}
          {view === "permisos-vistes" && <PermisosVistesSection />}
          {view === "audit-log"     && <AuditLogSection />}
        </div>

        {isMobile && (
          <MobileBottomNav items={bottomNavItems} currentView={view} setView={setView} showMore />
        )}
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