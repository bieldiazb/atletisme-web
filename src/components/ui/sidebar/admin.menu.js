import {
  Users,
  Calendar,
  TextAlignJustify,
  MessageSquare,
  PlusCircle,
  Dumbbell,
  UserStar,
  Timer,
  ListChecks,
  ChartArea
} from "lucide-react"

export const adminMenu = [
  {
    label: "Gestió",
    items: [
      { key: "athletes", label: "Atletes", icon: Users },
      { key: "calendar", label: "Calendari", icon: Calendar },
      { key: "marques", label: "Marques", icon: Timer },
      { key: "proves", label: "Proves", icon: ListChecks },
      { key: "estadistiques", label: "Estadístiques", icon: ChartArea },
      { key: "equip", label: "Equip", icon: Dumbbell },
      { key: "import-results", label: "Importar Resultats", icon: TextAlignJustify },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "create-admin", label: "Crear Admin", icon: UserStar },
    ],
  },
]
