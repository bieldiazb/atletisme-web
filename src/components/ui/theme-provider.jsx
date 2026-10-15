import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

const MQ = "(prefers-color-scheme: dark)";

function llegeix(storageKey, defaultTheme) {
  try {
    const t = localStorage.getItem(storageKey);
    return t === "light" || t === "dark" || t === "system" ? t : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export function ThemeProvider({ children, defaultTheme = "system", storageKey = "vite-ui-theme" }) {
  const [theme, setThemeState] = useState(() => llegeix(storageKey, defaultTheme));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(MQ).matches);

  // Segueix el tema del sistema mentre l'usuari no n'hagi triat un de fix.
  useEffect(() => {
    const mq = window.matchMedia(MQ);
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Tema realment aplicat ("light" | "dark"), també quan és "system".
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (t) => {
      try {
        localStorage.setItem(storageKey, t);
      } catch {
        /* sense emmagatzematge: el tema només dura la sessió */
      }
      setThemeState(t);
    },
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
