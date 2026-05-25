import { Routes, Route } from "react-router-dom"
import Landing from "./pages/Landing"
import Admin from "./pages/Admin"
import Pares from "./pages/Pares"
import AdminRoute from "./routes/AdminRoute"
import { Toaster } from "@/components/ui/toaster"

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
      </Routes>

      {/* 🔥 SEMPRE FORA DE <Routes> */}
      <Toaster />
    </>
  )
}
