import {
  Calendar,
  TextAlignJustify,
  Users,
  ChartArea,
  Award,
} from "lucide-react"

export const paresMenu = [
  {
    label: "Accions",
    items: [
      { key: "resultats", label: "Resultats", icon: TextAlignJustify },
      { key: "calendari", label: "Calendari", icon: Calendar },
      { key: "perfil", label: "Perfil nen/a", icon: Users },
      { key: "estadistiques", label: "Estadístiques", icon: ChartArea },
      { key: "diploma", label: "Diploma", icon: Award },
    ],
  },
]
