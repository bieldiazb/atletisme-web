import { Routes, Route } from "react-router-dom"
import Landing from "./pages/Landing"
import Admin from "./pages/Admin"
import Pares from "./pages/Pares"
import AccesPerCodi from "./pages/AccesPerCodi"
import AdminRoute from "./routes/AdminRoute"
import { Toaster } from "@/components/ui/toaster"
import { GlobalDialog } from "@/components/GlobalDialog"

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />

        <Route path="/pares" element={<Pares />} />

        {/* Accés directe per enllaç/QR (WhatsApp, carnet imprès...) — mateix codi que el login manual */}
        <Route path="/acces/:codi" element={<AccesPerCodi />} />
      </Routes>

      {/* 🔥 SEMPRE FORA DE <Routes> */}
      <Toaster />
      <GlobalDialog />
    </>
  )
}
