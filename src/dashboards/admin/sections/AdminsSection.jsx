import { useEffect, useState } from "react"
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { sendPasswordResetEmail } from "firebase/auth"
import { db, functions, auth } from "../../../../firebaseClient"
import { useUser } from "../../../../UserContext"
import { alertDialog, confirmDialog } from "@/components/GlobalDialog"

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
import { Input } from "@/components/ui/input"
import { Shield, Lock, KeyRound, Ban, UserCheck, Mail, Wrench } from "lucide-react"

const TOTES_CATEGORIES = ["Sub-8", "Sub-10", "Sub-12", "Sub-14", "Sub-16", "Sub-18"]
const FORM_BUIT = { nom: "", email: "", password: "", rol: "admin", categories: [] }

export default function AdminsSection() {
  const { esAdmin, esDeveloper, userData } = useUser()
  const uidActual = userData?.id

  const [admins, setAdmins]     = useState([])
  const [open, setOpen]         = useState(false)
  const [editant, setEditant]   = useState(null)
  const [form, setForm]         = useState(FORM_BUIT)
  const [guardant, setGuardant] = useState(false)

  // ── Accions Firebase Auth (developer) ──────────────────────────────
  const [busyUid, setBusyUid]           = useState(null)
  const [emailDialogFor, setEmailDialogFor] = useState(null)
  const [novaEmail, setNovaEmail]       = useState("")

  const load = async () => {
    const snap = await getDocs(collection(db, "admins"))
    setAdmins(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  useEffect(() => { load() }, [])

  // ── Regles de seguretat ───────────────────────────────────────────
  // Un entrenador només pot editar el seu propi perfil (categories)
  // Un entrenador no pot crear ni eliminar usuaris
  // Un entrenador no pot canviar el seu propi rol (no es pot auto-promoure)
  // Només un admin pot crear/eliminar usuaris o canviar rols

  const potEditar = (admin) => {
    if (esAdmin) return true
    return admin.id === uidActual // entrenador només el seu
  }

  const potEliminar = (admin) => {
    if (!esAdmin) return false          // entrenadors no poden eliminar ningú
    if (admin.id === uidActual) return false // un admin no es pot auto-eliminar
    return true
  }

  const potCrear = esAdmin

  // ── Crear ─────────────────────────────────────────────────────────
  const openCreate = () => {
    if (!potCrear) return
    setEditant(null)
    setForm(FORM_BUIT)
    setOpen(true)
  }

  const save = async () => {
    if (!form.email || !form.password) {
      await alertDialog("Email i contrasenya obligatoris")
      return
    }
    setGuardant(true)
    try {
      const createAdmin = httpsCallable(functions, "createAdminUser")
      const result = await createAdmin({
        nom:        form.nom,
        email:      form.email,
        password:   form.password,
        rol:        form.rol,
        categories: form.rol === "admin" ? [] : form.categories,
      })
      const uid = result?.data?.uid
      if (uid) {
        await setDoc(doc(db, "admins", uid), {
          nom:        form.nom || form.email.split("@")[0],
          email:      form.email,
          rol:        form.rol,
          categories: form.rol === "admin" ? [] : form.categories,
        }, { merge: true })
      }
      setOpen(false)
      load()
    } catch (err) {
      console.error(err)
      await alertDialog("Error creant usuari: " + err.message)
    } finally {
      setGuardant(false)
    }
  }

  // ── Editar ────────────────────────────────────────────────────────
  const openEditar = (admin) => {
    if (!potEditar(admin)) return
    setEditant(admin)
    setForm({
      nom:        admin.nom ?? "",
      email:      admin.email ?? "",
      password:   "",
      rol:        admin.rol ?? "admin",
      categories: admin.categories ?? [],
    })
    setOpen(true)
  }

  const saveEditar = async () => {
    if (!editant) return

    // Entrenador editant el seu propi perfil: no pot canviar rol
    const nouRol = (!esAdmin || editant.id === uidActual)
      ? editant.rol  // manté el rol actual
      : form.rol

    setGuardant(true)
    try {
      await updateDoc(doc(db, "admins", editant.id), {
        nom:        form.nom || editant.nom || editant.email.split("@")[0],
        rol:        nouRol,
        categories: nouRol === "admin" ? [] : form.categories,
        updatedAt:  Timestamp.now(),
      })
      setOpen(false)
      load()
    } catch (err) {
      console.error(err)
      await alertDialog("Error guardant: " + err.message)
    } finally {
      setGuardant(false)
    }
  }

  const toggleCategoria = (cat) =>
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat],
    }))

  // ── Eliminar (Auth + Firestore, via Cloud Function) ─────────────────
  const remove = async (admin) => {
    if (!potEliminar(admin)) return
    const ok = await confirmDialog(`Eliminar ${admin.email}? Es tancarà del tot l'accés a l'app.`, { danger: true })
    if (!ok) return
    setBusyUid(admin.id)
    try {
      const fn = httpsCallable(functions, "deleteAdminUser")
      await fn({ uid: admin.id })
      load()
    } catch (err) {
      console.error(err)
      await alertDialog("Error eliminant: " + err.message)
    } finally {
      setBusyUid(null)
    }
  }

  // ── Accions reservades a developer ──────────────────────────────────
  const hiHaDeveloper = admins.some(a => a.isDeveloper)

  const enviarResetPassword = async (admin) => {
    if (!admin.email) return
    setBusyUid(admin.id)
    try {
      await sendPasswordResetEmail(auth, admin.email)
      await alertDialog(`Correu de restabliment enviat a ${admin.email}`)
    } catch (err) {
      console.error(err)
      await alertDialog("Error enviant el correu: " + err.message)
    } finally {
      setBusyUid(null)
    }
  }

  const toggleDisabled = async (admin) => {
    if (admin.id === uidActual) return
    const missatge = admin.disabled
      ? `Reactivar l'accés de ${admin.email}?`
      : `Desactivar l'accés de ${admin.email}? No podrà iniciar sessió.`
    const ok = await confirmDialog(missatge, { danger: !admin.disabled })
    if (!ok) return
    setBusyUid(admin.id)
    try {
      const fn = httpsCallable(functions, "setUserDisabled")
      await fn({ uid: admin.id, disabled: !admin.disabled })
      load()
    } catch (err) {
      console.error(err)
      await alertDialog("Error: " + err.message)
    } finally {
      setBusyUid(null)
    }
  }

  const openCanviarEmail = (admin) => {
    setEmailDialogFor(admin)
    setNovaEmail(admin.email ?? "")
  }

  const guardarNovaEmail = async () => {
    if (!emailDialogFor || !novaEmail) return
    setBusyUid(emailDialogFor.id)
    try {
      const fn = httpsCallable(functions, "updateUserEmail")
      await fn({ uid: emailDialogFor.id, newEmail: novaEmail })
      setEmailDialogFor(null)
      load()
    } catch (err) {
      console.error(err)
      await alertDialog("Error canviant l'email: " + err.message)
    } finally {
      setBusyUid(null)
    }
  }

  const toggleDeveloper = async (admin) => {
    if (admin.id === uidActual) return
    const nou = !admin.isDeveloper
    const missatge = nou
      ? `Convertir ${admin.email} en developer?`
      : `Treure el rol de developer a ${admin.email}?`
    const ok = await confirmDialog(missatge)
    if (!ok) return
    setBusyUid(admin.id)
    try {
      const fn = httpsCallable(functions, "setDeveloperStatus")
      await fn({ uid: admin.id, isDeveloper: nou })
      load()
    } catch (err) {
      console.error(err)
      await alertDialog("Error: " + err.message)
    } finally {
      setBusyUid(null)
    }
  }

  const ferMeDeveloper = async () => {
    const ok = await confirmDialog("Vols convertir-te en developer? Només funciona si encara no hi ha cap developer configurat.")
    if (!ok) return
    setBusyUid(uidActual)
    try {
      const fn = httpsCallable(functions, "setDeveloperStatus")
      await fn({ uid: uidActual, isDeveloper: true })
      load()
    } catch (err) {
      console.error(err)
      await alertDialog("Error: " + err.message)
    } finally {
      setBusyUid(null)
    }
  }

  const rolBadge = (rol) =>
    rol === "entrenador"
      ? "bg-blue-100 text-blue-700"
      : "bg-purple-100 text-purple-700"

  // L'entrenador veu tots però només pot editar el seu
  const esPropietari = (id) => id === uidActual

  return (
    <>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Admins i Entrenadors</h1>
          {!esAdmin && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Només pots editar el teu propi perfil
            </p>
          )}
          {esDeveloper && (
            <p className="text-xs text-violet-600 mt-1 flex items-center gap-1 font-medium">
              <Wrench className="h-3 w-3" /> Tens accions de developer disponibles a la taula
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {esAdmin && !esDeveloper && !hiHaDeveloper && (
            <Button variant="outline" disabled={busyUid === uidActual} onClick={ferMeDeveloper}>
              <Wrench className="mr-2 h-4 w-4" />
              Convertir-me en developer
            </Button>
          )}
          {potCrear && (
            <Button onClick={openCreate}>Nou usuari</Button>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead>UID</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {admins.map(a => (
            <TableRow key={a.id} className={esPropietari(a.id) ? "bg-primary/5" : ""}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {a.nom ?? a.email.split("@")[0]}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 flex-wrap">
                  {a.email}
                  {esPropietari(a.id) && (
                    <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-semibold">Tu</span>
                  )}
                  {a.disabled && (
                    <span className="rounded-full bg-red-100 text-red-700 text-xs px-2 py-0.5 font-semibold">Desactivat</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rolBadge(a.rol ?? "admin")}`}>
                    {a.rol === "entrenador" ? "Entrenador" : "Admin"}
                  </span>
                  {a.isDeveloper && (
                    <span className="flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 text-xs px-2 py-0.5 font-semibold">
                      <Wrench className="h-3 w-3" /> Developer
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {a.rol === "entrenador" && a.categories?.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {a.categories.map(c => (
                      <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{c}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Totes</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{a.id}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end flex-wrap gap-1.5">
                  {esDeveloper && (
                    <>
                      <Button
                        size="icon" variant="outline" className="h-8 w-8"
                        title="Enviar correu de restabliment de contrasenya"
                        disabled={busyUid === a.id}
                        onClick={() => enviarResetPassword(a)}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="outline" className="h-8 w-8"
                        title={a.disabled ? "Reactivar accés" : "Desactivar accés"}
                        disabled={busyUid === a.id || a.id === uidActual}
                        onClick={() => toggleDisabled(a)}
                      >
                        {a.disabled ? <UserCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon" variant="outline" className="h-8 w-8"
                        title="Canviar email"
                        disabled={busyUid === a.id}
                        onClick={() => openCanviarEmail(a)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant={a.isDeveloper ? "default" : "outline"} className="h-8 w-8"
                        title={a.isDeveloper ? "Treure rol developer" : "Fer developer"}
                        disabled={busyUid === a.id || a.id === uidActual}
                        onClick={() => toggleDeveloper(a)}
                      >
                        <Wrench className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  {potEditar(a) ? (
                    <Button size="sm" variant="secondary" onClick={() => openEditar(a)}>
                      Editar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled className="opacity-30">
                      <Lock className="h-3 w-3" />
                    </Button>
                  )}
                  {potEliminar(a) ? (
                    <Button size="sm" variant="destructive" disabled={busyUid === a.id} onClick={() => remove(a)}>
                      Eliminar
                    </Button>
                  ) : (
                    // Placeholder invisible per mantenir l'alineació
                    <div className="w-[68px]" />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ── Dialog crear / editar ──────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editant ? "Editar perfil" : "Nou usuari"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">

            {!editant && (
              <>
                <Input
                  placeholder="Nom"
                  value={form.nom}
                  onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                />
                <Input
                  placeholder="Email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                />
                <Input
                  type="password"
                  placeholder="Contrasenya"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                />
              </>
            )}

            {editant && (
              <>
                <Input
                  placeholder="Nom"
                  value={form.nom}
                  onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                />
                <p className="text-sm text-muted-foreground">
                  Editant: <span className="font-semibold text-foreground">{editant.email}</span>
                </p>
              </>
            )}

            {/* Selector de rol — només admins poden canviar el rol, i no el seu propi */}
            {esAdmin && editant?.id !== uidActual && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Rol</p>
                <div className="grid grid-cols-2 gap-2">
                  {["admin", "entrenador"].map(r => (
                    <button
                      key={r}
                      onClick={() => setForm(p => ({ ...p, rol: r }))}
                      className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
                        form.rol === r
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {r === "admin" ? "🛡 Admin" : "🏋 Entrenador"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Si és creació sense editar, mostrar selector de rol */}
            {/* {!editant && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Rol</p>
                <div className="grid grid-cols-2 gap-2">
                  {["admin", "entrenador"].map(r => (
                    <button
                      key={r}
                      onClick={() => setForm(p => ({ ...p, rol: r }))}
                      className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
                        form.rol === r
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {r === "admin" ? "🛡 Admin" : "🏋 Entrenador"}
                    </button>
                  ))}
                </div>
              </div>
            )} */}

            {/* Rol no editable: mostrar info */}
            {editant && (!esAdmin || editant.id === uidActual) && (
              <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Rol: <span className="font-semibold text-foreground capitalize">{editant.rol ?? "admin"}</span>
                  {editant.id === uidActual && " (no pots canviar el teu propi rol)"}
                </span>
              </div>
            )}

            {/* Categories */}
            {(form.rol === "entrenador" || (editant?.rol === "entrenador" && (!esAdmin || editant.id === uidActual))) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  Categories assignades
                </p>
                <div className="flex flex-wrap gap-2">
                  {TOTES_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => toggleCategoria(cat)}
                      className={`rounded-full border-2 px-3 py-1 text-xs font-semibold transition-all ${
                        form.categories.includes(cat)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {form.categories.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Selecciona almenys una categoria
                  </p>
                )}
              </div>
            )}

            <Button
              className="w-full"
              disabled={guardant}
              onClick={editant ? saveEditar : save}
            >
              {guardant ? "Guardant..." : editant ? "Guardar canvis" : "Crear usuari"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog canviar email (developer) ──────────────────────────── */}
      <Dialog open={!!emailDialogFor} onOpenChange={(o) => { if (!o) setEmailDialogFor(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Canviar email d'inici de sessió</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Usuari actual: <span className="font-semibold text-foreground">{emailDialogFor?.email}</span>
            </p>
            <Input
              type="email"
              placeholder="Email nou"
              value={novaEmail}
              onChange={e => setNovaEmail(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={busyUid === emailDialogFor?.id || !novaEmail}
              onClick={guardarNovaEmail}
            >
              {busyUid === emailDialogFor?.id ? "Guardant..." : "Guardar email nou"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}