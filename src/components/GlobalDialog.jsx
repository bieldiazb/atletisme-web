import { useEffect, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Substitut, amb l'estil de la web, dels window.alert()/window.confirm()
// natius del navegador — aquests surten amb l'aspecte genèric de Chrome i
// desentonen amb la resta de l'app. Mateix patró que hooks/use-toast.js: un
// magatzem fora de React amb una llista de listeners, perquè es pugui cridar
// `confirmDialog(...)`/`alertDialog(...)` des de qualsevol funció (no cal ser
// un component ni un hook — moltes de les crides originals eren dins de
// gestors d'esdeveniments normals), i un sol component <GlobalDialog />
// muntat una vegada a App.jsx que renderitza l'estat actual amb el
// <AlertDialog> real de shadcn/ui.
//
// Ús:
//   const ok = await confirmDialog("Eliminar aquest atleta?", { danger: true })
//   if (!ok) return
//   await alertDialog("Error desant els canvis: " + err.message)

let current = null // { tipus: "alert"|"confirm", title, description, confirmLabel, cancelLabel, danger, resolve }
const listeners = []

function setCurrent(next) {
  current = next
  listeners.forEach((fn) => fn(current))
}

export function confirmDialog(description, opts = {}) {
  return new Promise((resolve) => {
    setCurrent({
      tipus: "confirm",
      title: opts.title ?? "Confirmar",
      description,
      confirmLabel: opts.confirmLabel ?? "Confirmar",
      cancelLabel: opts.cancelLabel ?? "Cancel·lar",
      danger: opts.danger ?? false,
      resolve,
    })
  })
}

export function alertDialog(description, opts = {}) {
  return new Promise((resolve) => {
    setCurrent({
      tipus: "alert",
      title: opts.title ?? "Avís",
      description,
      confirmLabel: opts.confirmLabel ?? "D'acord",
      resolve,
    })
  })
}

export function GlobalDialog() {
  const [dialog, setDialog] = useState(current)

  useEffect(() => {
    listeners.push(setDialog)
    return () => {
      const i = listeners.indexOf(setDialog)
      if (i > -1) listeners.splice(i, 1)
    }
  }, [])

  const tancar = (resultat) => {
    dialog?.resolve?.(resultat)
    setCurrent(null)
  }

  return (
    <AlertDialog
      open={!!dialog}
      onOpenChange={(open) => {
        if (!open && dialog) tancar(dialog.tipus === "confirm" ? false : undefined)
      }}
    >
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{dialog?.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {dialog?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {dialog?.tipus === "confirm" && (
            <AlertDialogCancel className="w-full sm:w-auto" onClick={() => tancar(false)}>
              {dialog.cancelLabel}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            className={`w-full sm:w-auto ${dialog?.danger ? "bg-red-600 hover:bg-red-700" : ""}`}
            onClick={() => tancar(dialog?.tipus === "confirm" ? true : undefined)}
          >
            {dialog?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
