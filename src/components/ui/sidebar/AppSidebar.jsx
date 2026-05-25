import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar"

import { Activity, LogOut } from "lucide-react"
import { SimpleThemeToggle } from "@/components/ui/simple-theme-toggle"
import { signOut } from "firebase/auth"
import { auth } from "../../../../firebaseClient"

export function AppSidebar({ currentView, setView, menu, title, subtitle }) {
  const { isMobile, setOpenMobile } = useSidebar()

  const handleLogout = async () => {
    await signOut(auth)
    window.location.href = "/"
  }

  const handleNavigate = (key) => {
    setView(key)

    // 👉 TANCA LA SIDEBAR NOMÉS EN MÒBIL
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar variant="inset">
      {/* HEADER */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-lg">
                  <Activity className="size-4" />
                </div>
                <div className="grid text-left text-sm leading-tight">
                  <span className="font-medium">{title}</span>
                  <span className="text-xs">{subtitle}</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* CONTINGUT */}
      <SidebarContent>
        {menu.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-xs font-semibold px-2 text-muted-foreground mb-1">
              {group.label}
            </SidebarGroupLabel>

            <SidebarMenu className="px-2">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={currentView === item.key}
                    onClick={() => handleNavigate(item.key)}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* FOOTER */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SimpleThemeToggle />
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-red-600 hover:bg-red-100 dark:hover:bg-red-900"
              onClick={handleLogout}
            >
              <LogOut className="size-4" />
              Logout
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
