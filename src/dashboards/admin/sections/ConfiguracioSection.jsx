import { useEffect, useState } from "react"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { logAudit } from "@/lib/auditLog"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Settings, MessageCircle, Loader2 } from "lucide-react"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]

// Configuració global per categoria, guardada a config/whatsapp (enllaç del
// grup de WhatsApp de cada categoria, que es mostra als pares des del seu
// panell). El codi d'accés dels pares NO es gestiona aquí: cada atleta té
// el seu propi codi (secció Atletes → "Codis d'accés"), que és el que fan
// servir els pares per entrar. Aquesta secció no toca config/codisAcces.
export default function ConfiguracioSection() {
  const { toast } = useToast()
  const { userData } = useUser()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState(
    TOTES_CATEGORIES.map((categoria) => ({ categoria, whatsapp: "" }))
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const whatsappSnap = await getDoc(doc(db, "config", "whatsapp"))
        const whatsapp = whatsappSnap.exists() ? whatsappSnap.data() : {}
        setRows(
          TOTES_CATEGORIES.map((categoria) => ({
            categoria,
            whatsapp: whatsapp[categoria] ?? "",
          }))
        )
      } catch {
        toast({ variant: "destructive", title: "Error carregant la configuració", description: "Torna-ho a provar" })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const updateRow = (categoria, value) =>
    setRows((prev) => prev.map((r) => (r.categoria === categoria ? { ...r, whatsapp: value } : r)))

  const guardar = async () => {
    setSaving(true)
    try {
      const whatsapp = {}
      rows.forEach((r) => {
        if (r.whatsapp.trim()) whatsapp[r.categoria] = r.whatsapp.trim()
      })
      await setDoc(doc(db, "config", "whatsapp"), whatsapp)
      toast({ title: "Configuració desada", description: "Els canvis ja són efectius per a tothom" })
      logAudit(userData, "config.update", {
        extra: { categories: rows.filter((r) => r.whatsapp).map((r) => r.categoria).join(", ") },
      })
    } catch {
      toast({ variant: "destructive", title: "Error desant", description: "Torna-ho a provar" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Configuració
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enllaç del grup de WhatsApp de cada categoria — es mostra als pares des del seu panell.
        </p>
      </div>

      <div className="rounded-lg border divide-y">
        {rows.map((r) => (
          <div key={r.categoria} className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-3 items-end p-4">
            <span className="font-semibold text-sm pb-2">{r.categoria}</span>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5" />
                Enllaç grup de WhatsApp
              </label>
              <Input
                placeholder="https://chat.whatsapp.com/..."
                value={r.whatsapp}
                onChange={(e) => updateRow(r.categoria, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      <Button className="mt-4" disabled={saving} onClick={guardar}>
        {saving ? "Desant..." : "Desar configuració"}
      </Button>
    </>
  )
}
