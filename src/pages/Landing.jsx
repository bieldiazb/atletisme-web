import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { signInWithEmailAndPassword } from "firebase/auth"
import { auth } from "../../firebaseClient"
import { entrarAmbCodi } from "@/lib/accesPares"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { UserX, Loader2 } from "lucide-react"

/**
 * Login de pares — dos fluxos:
 *
 * 1. CODI D'ATLETA (codiPublic) → accés al perfil individual (com abans)
 *
 * 2. CODI DE CATEGORIA → accés a la vista general de la categoria
 *    Guardats a Firestore: config/codisAcces → { Sub-10: "XXXX", Sub-12: "YYYY", ... }
 *    Si el codi coincideix amb un d'aquests, navega a /pares amb la categoria com a estat.
 *
 * Així un pare pot entrar amb el codi del seu fill (perfil individual)
 * o bé un entrenador/coordinador pot entrar amb el codi de la categoria.
 *
 * La validació real viu a src/lib/accesPares.js (entrarAmbCodi), compartida
 * amb l'accés directe per enllaç/QR (AccesPerCodi.jsx) — aquest formulari és
 * només la via manual per si algú prefereix teclejar el codi o ha perdut
 * l'enllaç.
 */

const ERROR_MESSAGES = {
  empty:     { title: "Codi buit",         body: "Introdueix el codi per continuar." },
  not_found: { title: "Codi no trobat",     body: "No hem trobat cap atleta ni categoria amb aquest codi." },
  error:     { title: "Error de connexió",  body: "No s'ha pogut connectar. Torna-ho a provar." },
}

export default function Landing({ className }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  // Admin
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // Pares
  const [code, setCode] = useState("")
  const [paresLoading, setParesLoading] = useState(false)
  const [paresError, setParesError] = useState(null)

  // Si venim d'un enllaç/QR amb codi invàlid (AccesPerCodi.jsx ens ha
  // redirigit amb ?error=...), mostrem el mateix missatge d'error que
  // donaria el formulari manual.
  useEffect(() => {
    const err = searchParams.get("error")
    if (err && ERROR_MESSAGES[err]) {
      setParesError(err)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete("error")
        return next
      }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ================= ADMIN ================= */
  const loginAdmin = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      toast({ variant: "destructive", title: "Dades incompletes", description: "Introdueix email i contrasenya" })
      return
    }
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate("/admin")
    } catch {
      toast({ variant: "destructive", title: "Accés denegat", description: "Credencials incorrectes" })
    }
  }

  /* ================= PARES ================= */
  const loginPares = async () => {
    setParesError(null)
    if (!code.trim()) { setParesError("empty"); return }

    setParesLoading(true)
    const resultat = await entrarAmbCodi(code)
    if (resultat.ok) {
      navigate("/pares")
    } else {
      setParesError(resultat.reason)
      setParesLoading(false)
    }
  }

  const handleCodeChange = (e) => {
    setCode(e.target.value)
    if (paresError) setParesError(null)
  }

  const currentError = paresError ? ERROR_MESSAGES[paresError] : null

  return (
    <div className={cn("flex min-h-screen items-center justify-center px-4", className)}>
      <Card className="w-full max-w-4xl overflow-hidden p-0 shadow-xl">
        <CardContent className="grid p-0 md:grid-cols-2">

          {/* ================= FORM ================= */}
          <div className="p-6 md:p-8">
            <Tabs defaultValue="pares">
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-bold">Plataforma d'Atletisme</h1>
                  <p className="text-muted-foreground text-balance">
                    Consulta marques, competicions i el perfil esportiu
                  </p>
                </div>

                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="pares">Pares</TabsTrigger>
                  <TabsTrigger value="admin">Admin</TabsTrigger>
                </TabsList>

                {/* ===== PARES ===== */}
                <TabsContent value="pares">
                  <Field>
                    <FieldLabel>Codi d'accés</FieldLabel>
                    <Input
                      placeholder="Ex: CLARA2017 o SUB10"
                      value={code}
                      onChange={handleCodeChange}
                      onKeyDown={(e) => e.key === "Enter" && loginPares()}
                      className={cn(paresError && "border-destructive focus-visible:ring-destructive")}
                    />
                    <FieldDescription className="mb-2">
                      Codi individual del nen/a, o codi de la categoria
                    </FieldDescription>
                  </Field>

                  {currentError && (
                    <div className="mb-4 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                      <UserX className="h-5 w-5 flex-shrink-0 text-destructive mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-destructive">{currentError.title}</p>
                        <p className="text-xs text-destructive/80 mt-0.5">{currentError.body}</p>
                      </div>
                    </div>
                  )}

                  <Field>
                    <Button className="w-full" onClick={loginPares} disabled={paresLoading}>
                      {paresLoading
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificant…</>
                        : "Entrar"
                      }
                    </Button>
                  </Field>
                </TabsContent>

                {/* ===== ADMIN ===== */}
                <TabsContent value="admin">
                  <form onSubmit={loginAdmin}>
                    <Field>
                      <FieldLabel>Email</FieldLabel>
                      <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mb-2"
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Contrasenya</FieldLabel>
                      <Input
                        type="password"
                        placeholder="Contrasenya"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mb-2"
                      />
                    </Field>
                    <Field>
                      <Button className="w-full" type="submit">
                        Entrar
                      </Button>
                    </Field>
                  </form>
                </TabsContent>

                <FieldSeparator />

                <FieldDescription className="text-center">
                  Accés privat per famílies i entrenadors
                </FieldDescription>
              </FieldGroup>
            </Tabs>
          </div>

          {/* ================= IMATGE ================= */}
          <div className="relative hidden md:block bg-muted">
            <img
              src="/landing-image.jpg"
              alt="Atletisme"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>

        </CardContent>
      </Card>
    </div>
  )
}