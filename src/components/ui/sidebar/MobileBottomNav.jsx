import { useSidebar } from "@/components/ui/sidebar"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Barra de navegació inferior, només per mòbil (isMobile de @/hooks/use-mobile,
 * el mateix breakpoint de 768px que ja fa servir el Sidebar per decidir si es
 * mostra com a Sheet). Pensada per no haver d'obrir el menú d'hamburguesa
 * per les accions del dia a dia.
 *
 * `items`: array de { key, label, icon } a mostrar directament, repartits a
 * parts iguals. Diferent per rol — vegeu BOTTOM_NAV_ENTRENADOR_KEYS /
 * BOTTOM_NAV_ADMIN_KEYS a admin.menu.js — perquè un entrenador i la
 * coordinadora (admin) fan servir seccions molt diferents cada dia.
 *
 * `showMore`: si és true, afegeix un botó final "Més" que obre el menú
 * complet de sempre (el Sheet lateral, via setOpenMobile) — per a la resta
 * de seccions que no caben aquí. Al panell de pares no cal (totes les
 * seccions ja caben directament als 4-5 accessos).
 */
export function MobileBottomNav({ items, currentView, setView, showMore = false }) {
  const { setOpenMobile } = useSidebar()
  const mesActiu = showMore && !items.some((i) => i.key === currentView)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const actiu = currentView === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setView(item.key)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors active:bg-muted/50",
              actiu ? "text-primary" : "text-muted-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="max-w-full truncate px-1">{item.label}</span>
          </button>
        )
      })}

      {showMore && (
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors active:bg-muted/50",
            mesActiu ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Menu className="h-5 w-5" />
          <span>Més</span>
        </button>
      )}
    </nav>
  )
}
