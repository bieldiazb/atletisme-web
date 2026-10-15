import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import "./index.css"

import { ThemeProvider } from "@/components/ui/theme-provider"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// Service worker (només en producció): permet instal·lar l'app al mòbil.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  })
}
