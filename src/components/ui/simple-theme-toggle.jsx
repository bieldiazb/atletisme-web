import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ui/theme-provider";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function SimpleThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <SidebarMenuButton onClick={toggle}>
      {theme === "dark" ? (
        <>
          <Sun className="size-4" />
          Light mode
        </>
      ) : (
        <>
          <Moon className="size-4" />
          Dark mode
        </>
      )}
    </SidebarMenuButton>
  );
}
