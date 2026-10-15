import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ui/theme-provider";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function SimpleThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggle = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <SidebarMenuButton onClick={toggle}>
      {resolvedTheme === "dark" ? (
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
