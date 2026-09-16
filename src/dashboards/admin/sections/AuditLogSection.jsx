import { useEffect, useState } from "react"
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore"
import { db } from "../../../../firebaseClient"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ScrollText, RefreshCw, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { ca } from "date-fns/locale"

const ACCIONS = [
  "createAdminUser",
  "deleteAdminUser",
  "setUserDisabled",
  "updateUserEmail",
  "setDeveloperStatus",
  "athletes.create",
  "athletes.update",
  "athletes.delete",
  "athletes.bulkUpdate",
  "athletes.bulkDelete",
  "marques.create",
  "marques.update",
  "marques.delete",
  "marques.bulkDelete",
  "marques_relleu.create",
  "marques_relleu.update",
  "marques_relleu.delete",
  "marques_relleu.bulkDelete",
  "events.create",
  "events.update",
  "events.delete",
  "events.bulkUpdate",
  "events.bulkDelete",
  "config.update",
]

const ACCIO_LABEL = {
  createAdminUser:   "Crear usuari",
  deleteAdminUser:   "Eliminar usuari",
  setUserDisabled:   "Activar/desactivar accés",
  updateUserEmail:   "Canviar email",
  setDeveloperStatus:"Canviar rol developer",
  "athletes.create":     "Crear atleta",
  "athletes.update":     "Editar atleta",
  "athletes.delete":     "Eliminar atleta",
  "athletes.bulkUpdate": "Editar atletes (massa)",
  "athletes.bulkDelete": "Eliminar atletes (massa)",
  "marques.create":      "Crear marca",
  "marques.update":      "Editar marca",
  "marques.delete":      "Eliminar marca",
  "marques.bulkDelete":  "Eliminar marques (massa)",
  "marques_relleu.create":     "Crear marca de relleu",
  "marques_relleu.update":     "Editar marca de relleu",
  "marques_relleu.delete":     "Eliminar marca de relleu",
  "marques_relleu.bulkDelete": "Eliminar marques de relleu (massa)",
  "events.create":     "Crear event",
  "events.update":     "Editar event",
  "events.delete":     "Eliminar event",
  "events.bulkUpdate": "Editar events (massa)",
  "events.bulkDelete": "Eliminar events (massa)",
  "config.update": "Canviar configuració (codis/WhatsApp)",
}

// Registre de dos tipus d'accions ben diferents, totes dues via logAudit():
//  1. Les 5 accions sensibles de Firebase Auth — escrites amb Admin SDK des
//     de les Cloud Functions a functions/index.js, per tant a prova de
//     manipulació. Inclouen els intents denegats.
//  2. El CRUD normal (atletes, marques, marques de relleu, events) — escrit
//     directament des del client (src/lib/auditLog.js) just després de cada
//     acció correcta. És útil per saber qui ha tocat què i quan, però no és
//     a prova de manipulació: algú amb accés directe a Firestore es podria
//     saltar el registre.
export default function AuditLogSection() {
  const [logs, setLogs] = useState([])
  const [admins, setAdmins] = useState({})
  const [loading, setLoading] = useState(true)
  const [filtreAccio, setFiltreAccio] = useState("totes")
  const [filtreResultat, setFiltreResultat] = useState("tots")

  const load = async () => {
    setLoading(true)
    try {
      const [logsSnap, adminsSnap] = await Promise.all([
        getDocs(query(collection(db, "audit_logs"), orderBy("at", "desc"), limit(300))),
        getDocs(collection(db, "admins")),
      ])
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const mapa = {}
      adminsSnap.docs.forEach(d => { mapa[d.id] = d.data() })
      setAdmins(mapa)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const persona = (uid) => {
    if (!uid) return "—"
    const a = admins[uid]
    return a ? (a.nom || a.email || uid) : uid
  }

  const logsFiltrats = logs.filter(l => {
    if (filtreAccio !== "totes" && l.action !== filtreAccio) return false
    if (filtreResultat === "ok" && !l.ok) return false
    if (filtreResultat === "denegat" && l.ok) return false
    return true
  })

  const detallText = (extra) => {
    if (!extra || Object.keys(extra).length === 0) return "—"
    return Object.entries(extra)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ")
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6" />
            Registre d'auditoria
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Accions sensibles de Firebase Auth (crear/eliminar usuaris, desactivar comptes, canviar emails, rol developer — inclou els intents denegats) i el CRUD d'atletes, marques i events.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Recarregar
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={filtreAccio} onValueChange={setFiltreAccio}>
          <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Acció" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="totes">Totes les accions</SelectItem>
            {ACCIONS.map(a => (
              <SelectItem key={a} value={a}>{ACCIO_LABEL[a] ?? a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtreResultat} onValueChange={setFiltreResultat}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Resultat" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tots">Tots els resultats</SelectItem>
            <SelectItem value="ok">Correctes</SelectItem>
            <SelectItem value="denegat">Denegats/errors</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {logsFiltrats.length} de {logs.length} registres (últims 300)
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Acció</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Objectiu</TableHead>
                <TableHead>Resultat</TableHead>
                <TableHead>Detalls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logsFiltrats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                    No hi ha registres
                  </TableCell>
                </TableRow>
              ) : (
                logsFiltrats.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {l.at?.toDate ? format(l.at.toDate(), "d MMM yyyy · HH:mm", { locale: ca }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{ACCIO_LABEL[l.action] ?? l.action}</TableCell>
                    <TableCell className="text-xs">{persona(l.actorUid)}</TableCell>
                    <TableCell className="text-xs">{persona(l.target)}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        l.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}>
                        {l.ok ? "OK" : "Denegat"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={detallText(l.extra)}>
                      {detallText(l.extra)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
