import { collection, addDoc, Timestamp } from "firebase/firestore"
import { db } from "../../../../firebaseClient"

const atletes = [
  { nom: "ROC ALONSO SOLE", naixement: new Date(2016, 8, 21), sexe: "M" },
  { nom: "OVIDI BARAUT COTS", naixement: new Date(2016, 3, 29), sexe: "M" },
  { nom: "GISELA BASANY FRUCTUOSO", naixement: new Date(2016, 0, 14), sexe: "F" },
  { nom: "PAU BERNADES ROJO", naixement: new Date(2015, 7, 9), sexe: "M" },
  { nom: "BIEL BOSCH PUJOL", naixement: new Date(2016, 5, 7), sexe: "M" },
  { nom: "MARTI GARRIGA BELLART", naixement: new Date(2015, 4, 23), sexe: "M" },
  { nom: "JULIA GARRIGO BALLESTEROS", naixement: new Date(2016, 3, 7), sexe: "F" },
  { nom: "CORA GONZALEZ LOPEZ", naixement: new Date(2015, 1, 5), sexe: "F" },
  { nom: "NIL GRAMNES RODRIGUEZ", naixement: new Date(2016, 3, 5), sexe: "M" },
  { nom: "CLARA IZQUIERDO KWOFIE", naixement: new Date(2016, 0, 22), sexe: "F" },
  { nom: "AINET JUBELLS GARCIA", naixement: new Date(2015, 2, 30), sexe: "F" },
  { nom: "QUERALT LEONARTE RAMONET", naixement: new Date(2015, 6, 8), sexe: "F" },
  { nom: "NOE MARTIN GREEACRE", naixement: new Date(2015, 7, 24), sexe: "M" },
  { nom: "PAULA OVIEDO CORT", naixement: new Date(2016, 7, 16), sexe: "F" },
  { nom: "JULIA PARERA MORAGREGA", naixement: new Date(2016, 7, 1), sexe: "F" },
  { nom: "BRUNA PESOA SERRA", naixement: new Date(2016, 0, 6), sexe: "F" },
  { nom: "GERARD PLA GALVEZ", naixement: new Date(2015, 11, 27), sexe: "M" },
  { nom: "IVET PLA PUIG", naixement: new Date(2015, 1, 12), sexe: "F" },
  { nom: "MERITXELL PONTI BARRABES", naixement: new Date(2016, 6, 13), sexe: "F" },
  { nom: "ANDREU REYES LLOBET", naixement: new Date(2016, 2, 8), sexe: "M" },
  { nom: "ALEX RODRIGUEZ SALVADOR", naixement: new Date(2016, 2, 13), sexe: "M" },
  { nom: "ARNAU SANCHEZ PAÑOS", naixement: new Date(2016, 5, 16), sexe: "M" },
  { nom: "JANA SIERRA PUIGMARTI", naixement: new Date(2015, 1, 26), sexe: "F" },
  { nom: "MIREIA VALLS PONS", naixement: new Date(2016, 8, 26), sexe: "F" },
  { nom: "ROURE VILALTA BELART", naixement: new Date(2015, 1, 27), sexe: "M" },
  { nom: "ELIA VILLAR LLENAS", naixement: new Date(2015, 7, 19), sexe: "F" },
  { nom: "IVET GARCIA VIZCAINO", naixement: new Date(2016, 0, 1), sexe: "F" },
  { nom: "AINA PIQUE", naixement: new Date(2015, 0, 1), sexe: "F" },
  { nom: "DANIEL CERNUDA", naixement: new Date(2016, 0, 1), sexe: "M" },
  { nom: "ANDREU ROVIRA", naixement: new Date(2016, 0, 1), sexe: "M" },
  { nom: "MATEU ROMERO RIVAS", naixement: new Date(2015, 0, 1), sexe: "M" },
  { nom: "QUERALT LLOBET", naixement: new Date(2016, 0, 1), sexe: "F" },
]

function getCategoria(any) {
  if (any === 2015 || any === 2016) return "Sub-12"
  if (any === 2013 || any === 2014) return "Sub-14"
  if (any === 2011 || any === 2012) return "Sub-16"
  if (any === 2017 || any === 2018) return "Sub-10"
  return "Sub-8"
}

export async function importarAtletes() {
  for (const a of atletes) {
    const any = a.naixement.getFullYear()
    const parts = a.nom.split(" ")
    const nomCurt = parts[0]
    const cg1Curt = parts[1]?.slice(0, 2) ?? ""
    const codiPublic = (nomCurt + cg1Curt).toUpperCase()

    await addDoc(collection(db, "athletes"), {
      nom: a.nom,
      sexe: a.sexe,
      naixement: Timestamp.fromDate(a.naixement),
      categoria: getCategoria(any),
      actiu: true,
      codiPublic,
    })
    console.log("✅", a.nom, "→", codiPublic)
  }
  console.log("🎉 Importació completada! Total:", atletes.length)
}