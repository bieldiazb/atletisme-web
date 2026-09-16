import { Fragment, useEffect, useMemo, useState } from "react"
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  writeBatch,
} from "firebase/firestore"
import { db } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { adminMenu } from "@/components/ui/sidebar/admin.menu"
import { logAudit } from "@/lib/auditLog"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Eye, EyeOff, Users, ShieldCheck, SlidersHorizontal } from "lucide-react"

// Items del menú que es poden personalitzar per usuari. Es treuen els
// developerOnly (sostre dur, mai personalitzables) i l'item especial
// "permisos-vistes" (la seva visibilitat es calcula a part, no forma part
// de la llista de permisos d'un usuari).
const GRUPS_PERSONALITZABLES = (adminMenu ?? [])
  .map((grup) => ({
    label: grup.label,
    adminOnly: !!grup.adminOnly,
    items: grup.items.filter((it) => !it.developerOnly && !it.nomesGestors),
  }))
  .filter((grup) => grup.items.length > 0)

const ITEMS_PERSONALITZABLES = GRUPS_PERSONALITZABLES.flatMap((grup) =>
  grup.items.map((it) => ({ ...it, grupAdminOnly: grup.adminOnly }))
)

const BATCH_SIZE = 450
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// El comportament "de tota la vida" quan no hi ha res configurat enlloc
// (ni personalitzat de l'usuari, ni valors per defecte de config/permisosDefault).
function defectePerRolBase(rolObjectiu) {
  const esAdminObjectiu = rolObjectiu === "admin"
  return ITEMS_PERSONALITZABLES.filter((item) => (item.grupAdminOnly ? esAdminObjectiu : true)).map(
    (item) => item.key
  )
}

// Reprodueix, per a un usuari QUALSEVOL (no el que ha iniciat sessió), el que
// calcularia UserContext.potVeureItem si encara no té permisos personalitzats
// — és el que es marca com a preseleccionat quan s'obre el diàleg d'edició
// per primer cop. Té en compte els valors per defecte de config/permisosDefault
// si ja n'hi ha (plantillesDefecte), i si no, cau al comportament de sempre.
function clausPerDefecte(usuari, plantillesDefecte) {
  if (usuari.isDeveloper === true) return ITEMS_PERSONALITZABLES.map((item) => item.key)
  const rolObjectiu = usuari.rol === "admin" ? "admin" : "entrenador"
  const plantilla = plantillesDefecte?.[rolObjectiu]
  return Array.isArray(plantilla) ? plantilla : defectePerRolBase(rolObjectiu)
}

export default function PermisosVistesSection() {
  const { esAdmin, esDeveloper, potGestionar, userData } = useUser()
  const uidActual = userData?.id

  const [usuaris, setUsuaris] = useState([])
  const [carregant, setCarregant] = useState(true)

  const [obertPermisos, setObertPermisos] = useState(null) // usuari
  const [seleccioPermisos, setSeleccioPermisos] = useState([])
  const [guardantPermisos, setGuardantPermisos] = useState(false)

  const [obertGestio, setObertGestio] = useState(null) // admin
  const [seleccioGestio, setSeleccioGestio] = useState([])
  const [guardantGestio, setGuardantGestio] = useState(false)

  // Valors per defecte editables (config/permisosDefault) — només rellevants
  // per al developer, que és qui els pot editar i aplicar.
  const [plantillaEntrenador, setPlantillaEntrenador] = useState(() => defectePerRolBase("entrenador"))
  const [plantillaAdmin, setPlantillaAdmin] = useState(() => defectePerRolBase("admin"))
  const [carregantDefectes, setCarregantDefectes] = useState(true)
  const [guardantDefecte, setGuardantDefecte] = useState(null) // "entrenador" | "admin" | null
  const [aplicant, setAplicant] = useState(null) // "entrenador" | "admin" | null

  const load = async () => {
    setCarregant(true)
    const snap = await getDocs(collection(db, "admins"))
    setUsuaris(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    setCarregant(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!esDeveloper) return
    const carregarDefectes = async () => {
      setCarregantDefectes(true)
      try {
        const snap = await getDoc(doc(db, "config", "permisosDefault"))
        const data = snap.exists() ? snap.data() : {}
        setPlantillaEntrenador(Array.isArray(data.entrenador) ? data.entrenador : defectePerRolBase("entrenador"))
        setPlantillaAdmin(Array.isArray(data.admin) ? data.admin : defectePerRolBase("admin"))
      } catch (err) {
        console.error(err)
      } finally {
        setCarregantDefectes(false)
      }
    }
    carregarDefectes()
  }, [esDeveloper])

  const plantillesDefecte = { entrenador: plantillaEntrenador, admin: plantillaAdmin }

  const potGestionarPermisos = esDeveloper || (esAdmin && potGestionar.length > 0)

  // Developer: pot editar tothom (menys ell mateix). Admin amb gestió
  // delegada: només els entrenadors que li ha assignat el developer.
  const usuarisGestionables = useMemo(() => {
    if (esDeveloper) return usuaris.filter((u) => u.id !== uidActual)
    return usuaris.filter((u) => u.rol === "entrenador" && potGestionar.includes(u.id))
  }, [usuaris, esDeveloper, potGestionar, uidActual])

  // Només per al developer: llistat d'admins (no ell mateix) per assignar-los
  // quins entrenadors poden gestionar.
  const adminsPerGestio = useMemo(
    () => usuaris.filter((u) => u.rol === "admin" && u.id !== uidActual),
    [usuaris, uidActual]
  )
  const entrenadorsDisponibles = useMemo(
    () => usuaris.filter((u) => u.rol === "entrenador"),
    [usuaris]
  )

  // ── Diàleg de permisos de visualització ─────────────────────────────
  const obrirPermisos = (usuari) => {
    setObertPermisos(usuari)
    setSeleccioPermisos(
      Array.isArray(usuari.permisosVistes) ? usuari.permisosVistes : clausPerDefecte(usuari, plantillesDefecte)
    )
  }

  const toggleItem = (key) =>
    setSeleccioPermisos((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )

  const esPersonalitzat = Array.isArray(obertPermisos?.permisosVistes)

  const guardarPermisos = async () => {
    if (!obertPermisos) return
    setGuardantPermisos(true)
    try {
      await updateDoc(doc(db, "admins", obertPermisos.id), { permisosVistes: seleccioPermisos })
      await logAudit(userData, "permisos.setVistes", {
        target: obertPermisos.id,
        extra: { permisosVistes: seleccioPermisos },
      })
      setObertPermisos(null)
      load()
    } catch (err) {
      console.error(err)
      alert("Error guardant els permisos: " + err.message)
    } finally {
      setGuardantPermisos(false)
    }
  }

  const restablirPermisos = async () => {
    if (!obertPermisos) return
    setGuardantPermisos(true)
    try {
      await updateDoc(doc(db, "admins", obertPermisos.id), { permisosVistes: deleteField() })
      await logAudit(userData, "permisos.resetVistes", { target: obertPermisos.id })
      setObertPermisos(null)
      load()
    } catch (err) {
      console.error(err)
      alert("Error restablint els permisos: " + err.message)
    } finally {
      setGuardantPermisos(false)
    }
  }

  // ── Valors per defecte (només developer) ────────────────────────────
  const toggleDefecte = (rolObjectiu, key) => {
    const setter = rolObjectiu === "admin" ? setPlantillaAdmin : setPlantillaEntrenador
    setter((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const guardarDefecte = async (rolObjectiu) => {
    setGuardantDefecte(rolObjectiu)
    try {
      const plantilla = rolObjectiu === "admin" ? plantillaAdmin : plantillaEntrenador
      await setDoc(doc(db, "config", "permisosDefault"), { [rolObjectiu]: plantilla }, { merge: true })
      await logAudit(userData, "permisos.setDefecte", { extra: { rol: rolObjectiu, permisosVistes: plantilla } })
    } catch (err) {
      console.error(err)
      alert("Error desant els valors per defecte: " + err.message)
    } finally {
      setGuardantDefecte(null)
    }
  }

  // Desa la plantilla i, a més, sobreescriu permisosVistes de TOTS els
  // usuaris existents amb aquell rol (inclosos els que ja tenien un
  // personalitzat propi — per això es demana confirmació).
  const aplicarATots = async (rolObjectiu) => {
    const plantilla = rolObjectiu === "admin" ? plantillaAdmin : plantillaEntrenador
    const objectius = usuaris.filter((u) => u.rol === rolObjectiu)
    if (objectius.length === 0) {
      alert(`No hi ha cap usuari amb rol "${rolObjectiu === "admin" ? "admin" : "entrenador"}".`)
      return
    }
    if (
      !confirm(
        `Desar aquests valors per defecte i aplicar-los als ${objectius.length} usuari(s) amb rol "${
          rolObjectiu === "admin" ? "admin" : "entrenador"
        }"? Se'ls sobreescriurà qualsevol personalització que tinguessin.`
      )
    )
      return
    setAplicant(rolObjectiu)
    try {
      await setDoc(doc(db, "config", "permisosDefault"), { [rolObjectiu]: plantilla }, { merge: true })
      for (const bloc of chunk(objectius, BATCH_SIZE)) {
        const batch = writeBatch(db)
        bloc.forEach((u) => batch.update(doc(db, "admins", u.id), { permisosVistes: plantilla }))
        await batch.commit()
      }
      await logAudit(userData, "permisos.aplicarDefecte", {
        extra: { rol: rolObjectiu, permisosVistes: plantilla, afectats: objectius.length },
      })
      load()
    } catch (err) {
      console.error(err)
      alert("Error aplicant els valors per defecte: " + err.message)
    } finally {
      setAplicant(null)
    }
  }

  // ── Diàleg de gestió delegada (només developer) ─────────────────────
  const obrirGestio = (admin) => {
    setObertGestio(admin)
    setSeleccioGestio(admin.potGestionar ?? [])
  }

  const toggleEntrenador = (uid) =>
    setSeleccioGestio((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    )

  const guardarGestio = async () => {
    if (!obertGestio) return
    setGuardantGestio(true)
    try {
      await updateDoc(doc(db, "admins", obertGestio.id), { potGestionar: seleccioGestio })
      await logAudit(userData, "permisos.setGestio", {
        target: obertGestio.id,
        extra: { potGestionar: seleccioGestio },
      })
      setObertGestio(null)
      load()
    } catch (err) {
      console.error(err)
      alert("Error guardant la gestió delegada: " + err.message)
    } finally {
      setGuardantGestio(false)
    }
  }

  const rolLabel = (u) => (u.rol === "entrenador" ? "Entrenador" : "Admin")

  if (!potGestionarPermisos) {
    return (
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Permisos de visualització</h1>
        <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <EyeOff className="h-4 w-4" />
          Encara no tens cap gestió delegada. Demana a un developer que t'assigni entrenadors a gestionar.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Permisos de visualització</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {esDeveloper
            ? "Tria què veu cada usuari al menú. Si no personalitzes ningú, es manté el comportament de sempre segons el rol."
            : "Pots personalitzar què veuen els entrenadors que et té assignats el developer."}
        </p>
      </div>

      {/* ── Valors per defecte per rol: només developer ─────────────────── */}
      {esDeveloper && (
        <div className="mb-10">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <SlidersHorizontal className="h-4.5 w-4.5" /> Valors per defecte
          </h2>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            El que veu, per defecte, tothom amb aquest rol que no tingui permisos personalitzats propis.
            "Aplicar a tots" també sobreescriu qui ja en tenia un de personalitzat.
          </p>

          {carregantDefectes ? (
            <p className="text-sm text-muted-foreground">Carregant...</p>
          ) : (
            <>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Secció</TableHead>
                      <TableHead className="text-center w-28">Entrenador</TableHead>
                      <TableHead className="text-center w-28">Admin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {GRUPS_PERSONALITZABLES.map((grup) => (
                      <Fragment key={grup.label}>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={3} className="text-xs font-semibold text-muted-foreground py-1.5">
                            {grup.label}
                          </TableCell>
                        </TableRow>
                        {grup.items.map((item) => (
                          <TableRow key={item.key}>
                            <TableCell className="text-sm">{item.label}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={plantillaEntrenador.includes(item.key)}
                                  onCheckedChange={() => toggleDefecte("entrenador", item.key)}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={plantillaAdmin.includes(item.key)}
                                  onCheckedChange={() => toggleDefecte("admin", item.key)}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  size="sm" variant="outline"
                  disabled={guardantDefecte === "entrenador"}
                  onClick={() => guardarDefecte("entrenador")}
                >
                  Guardar per defecte (Entrenador)
                </Button>
                <Button
                  size="sm" variant="outline"
                  disabled={guardantDefecte === "admin"}
                  onClick={() => guardarDefecte("admin")}
                >
                  Guardar per defecte (Admin)
                </Button>
                <Button
                  size="sm"
                  disabled={aplicant === "entrenador"}
                  onClick={() => aplicarATots("entrenador")}
                >
                  {aplicant === "entrenador" ? "Aplicant..." : "Aplicar a tots els entrenadors"}
                </Button>
                <Button
                  size="sm"
                  disabled={aplicant === "admin"}
                  onClick={() => aplicarATots("admin")}
                >
                  {aplicant === "admin" ? "Aplicant..." : "Aplicar a tots els admins"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Permisos</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!carregant && usuarisGestionables.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                No hi ha ningú per gestionar aquí.
              </TableCell>
            </TableRow>
          )}
          {usuarisGestionables.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.nom ?? u.email?.split("@")[0]}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
              <TableCell>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                  {rolLabel(u)}
                </span>
              </TableCell>
              <TableCell>
                {Array.isArray(u.permisosVistes) ? (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 font-semibold w-fit">
                    <Eye className="h-3 w-3" /> Personalitzat ({u.permisosVistes.length})
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Per defecte ({rolLabel(u)})</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="secondary" onClick={() => obrirPermisos(u)}>
                  Editar permisos
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ── Gestió delegada: només developer ──────────────────────────── */}
      {esDeveloper && (
        <div className="mt-10">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5" /> Gestió delegada
          </h2>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Tria a quins entrenadors pot editar els permisos cada admin. Sense assignar-n'hi cap, aquell admin no veurà aquesta secció.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Entrenadors que pot gestionar</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminsPerGestio.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.nom ?? a.email?.split("@")[0]}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                  <TableCell>
                    {a.potGestionar?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {a.potGestionar.map((uid) => {
                          const t = usuaris.find((u) => u.id === uid)
                          return (
                            <span key={uid} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                              {t?.nom ?? t?.email?.split("@")[0] ?? uid}
                            </span>
                          )
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Cap</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => obrirGestio(a)}>
                      <Users className="mr-2 h-3.5 w-3.5" /> Configurar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Diàleg: editar permisos de visualització ──────────────────── */}
      <Dialog open={!!obertPermisos} onOpenChange={(o) => { if (!o) setObertPermisos(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permisos de {obertPermisos?.nom ?? obertPermisos?.email}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              {esPersonalitzat ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 font-semibold">
                  <Eye className="h-3 w-3" /> Personalitzat
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Per defecte segons el rol ({obertPermisos ? rolLabel(obertPermisos) : ""})
                </span>
              )}
            </div>

            {GRUPS_PERSONALITZABLES.map((grup) => (
              <div key={grup.label}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{grup.label}</p>
                <div className="space-y-2">
                  {grup.items.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={seleccioPermisos.includes(item.key)}
                        onCheckedChange={() => toggleItem(item.key)}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              {esPersonalitzat && (
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={guardantPermisos}
                  onClick={restablirPermisos}
                >
                  Restablir per defecte
                </Button>
              )}
              <Button className="flex-1" disabled={guardantPermisos} onClick={guardarPermisos}>
                {guardantPermisos ? "Guardant..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Diàleg: configurar gestió delegada (developer) ────────────── */}
      <Dialog open={!!obertGestio} onOpenChange={(o) => { if (!o) setObertGestio(null) }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Entrenadors gestionables per {obertGestio?.nom ?? obertGestio?.email}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {entrenadorsDisponibles.length === 0 && (
              <p className="text-sm text-muted-foreground">Encara no hi ha cap entrenador donat d'alta.</p>
            )}
            <div className="space-y-2">
              {entrenadorsDisponibles.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={seleccioGestio.includes(t.id)}
                    onCheckedChange={() => toggleEntrenador(t.id)}
                  />
                  {t.nom ?? t.email?.split("@")[0]}
                  {t.categories?.length > 0 && (
                    <span className="text-xs text-muted-foreground">({t.categories.join(", ")})</span>
                  )}
                </label>
              ))}
            </div>

            <Button className="w-full" disabled={guardantGestio} onClick={guardarGestio}>
              {guardantGestio ? "Guardant..." : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
