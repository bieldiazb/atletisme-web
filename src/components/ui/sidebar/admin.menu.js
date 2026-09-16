import {
  Users,
  Calendar,
  TextAlignJustify,
  Dumbbell,
  UserStar,
  Timer,
  ListChecks,
  ChartArea,
  ClipboardCheck,
  ClipboardList,
  UsersRound,
  ScrollText,
  Settings,
  UploadCloud,
  Eye,
  Award,
} from "lucide-react"

// Menú agrupat per blocs temàtics (no un sol calaix "Gestió") perquè d'un
// cop d'ull es vegi de seguida on és cada cosa. Dins de cada bloc, l'ordre
// segueix el flux de treball real.
//
// Visibilitat: es calcula per item (no per grup) a UserContext.potVeureItem.
// - developerOnly: sostre dur, només developers, mai personalitzable.
// - nomesGestors: item especial (permisos de visualització), visible per
//   developers i per admins amb gestió delegada (potGestionar no buit).
// - la resta: per defecte segons rol (com sempre), però el developer pot
//   personalitzar-ho per usuari des de la secció "Permisos de visualització".
export const adminMenu = [
  {
    label: "Atletes i proves",
    items: [
      { key: "athletes", label: "Atletes", icon: Users },
      { key: "proves", label: "Proves", icon: ListChecks },
      { key: "calendar", label: "Calendari", icon: Calendar },
    ],
  },
  {
    label: "Entrenaments",
    items: [
      { key: "assistencia", label: "Passar llista", icon: ClipboardCheck },
      { key: "registre-assistencia", label: "Registre assistència", icon: ClipboardList },
    ],
  },
  {
    label: "Resultats",
    items: [
      { key: "marques", label: "Marques", icon: Timer },
      { key: "marques-relleu", label: "Marques Relleus", icon: UsersRound },
      { key: "import-results", label: "Importar Resultats", icon: TextAlignJustify },
      { key: "diplomes", label: "Diplomes", icon: Award },
    ],
  },
  {
    label: "Anàlisi",
    items: [
      { key: "estadistiques", label: "Estadístiques", icon: ChartArea },
      { key: "equip", label: "Equip", icon: Dumbbell },
    ],
  },
  {
    label: "Admin",
    // Grup sencer amagat als entrenadors (no admins) — vegeu el filtre a
    // AdminDashboard.jsx, que mira aquest flag i no el label.
    adminOnly: true,
    items: [
      { key: "create-admin", label: "Usuaris", icon: UserStar },
      { key: "configuracio", label: "Configuració", icon: Settings },
      { key: "importar-atletes-csv", label: "Importar atletes (CSV)", icon: UploadCloud, developerOnly: true },
      { key: "permisos-vistes", label: "Permisos de visualització", icon: Eye, nomesGestors: true },
      { key: "audit-log", label: "Registre d'auditoria", icon: ScrollText, developerOnly: true },
    ],
  },
]

// Barra de navegació inferior (només mòbil): els 4 accessos que fa servir
// més sovint cada rol en el dia a dia — un entrenador porta l'entrenament
// (passar llista, marques), la coordinadora porta el club (usuaris,
// diplomes). Atletes i Calendari són comuns als dos. La resta de seccions
// sempre són a un toc de "Més" (el menú complet de sempre).
//
// Només claus: l'icona i l'etiqueta es resolen contra `adminMenu` filtrat
// per potVeureItem (a AdminDashboard.jsx), així mai es desincronitzen ni
// salten els permisos personalitzats de cada usuari. Per canviar quins
// accessos surten aquí, només cal editar aquestes dues llistes.
export const BOTTOM_NAV_ENTRENADOR_KEYS = ["athletes", "assistencia", "marques", "calendar"]
export const BOTTOM_NAV_ADMIN_KEYS = ["athletes", "calendar", "diplomes", "create-admin"]
