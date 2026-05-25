# 🏃 CAM Sub-10 · Athletics Club Management Platform

> A full-stack web application for managing athletes, competition results, and club administration — built for **Club Atletisme** and hosted at [camsub10.site](https://camsub10.site).

---

## 📋 Overview

CAM Sub-10 is a role-based athlete management platform designed for athletics clubs. It provides separate dashboards for administrators, coaches, and parents/athletes, enabling streamlined management of athlete records, competition results, and event calendars.

---

## ✨ Features

### 👤 Athlete Management
- Full athlete registry with name, birth date, gender, category, and public code
- Smart category assignment based on birth year (Sub-10, Sub-12, Sub-14, etc.)
- Bulk athlete import via scripted Firestore batch operations
- Public athlete profile codes auto-generated (e.g. `ROCAL` for *Roc Alonso*)

### 🏅 Competition Results
- PDF result importer compatible with **Conersys Sports Solutions** format
- Supports both Catalan and Spanish PDF layouts
- Detects track events (*pista*) and field events (*camp/concursos*) automatically
- Preview matched athletes before saving, with per-result toggles
- Marks stored in a dedicated `marques` Firestore collection

### 📊 Statistics & Analytics
- Personal performance evolution charts (line graphs per event)
- Season bests and all-time personal records
- Monthly activity tracking with bar charts
- Distance vs. time event type auto-detection

### 🗓️ Event Calendar
- Create, edit, and manage competition events
- Associate results directly with calendar entries

### 🔐 Role-Based Access Control
| Feature | Admin | Coach | Parent |
|---|:---:|:---:|:---:|
| Manage athletes | ✅ | ✅ | ❌ |
| Import PDF results | ✅ | ✅ | ❌ |
| Create events | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| View own athlete stats | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ❌ |

### 🏆 Team Optimizer
- Automatic team selection based on athlete scores (FCA points system)
- Relay team assignment with manual override
- Save optimized team to Firestore for sharing

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS](https://tailwindcss.com/) |
| Charts | [Recharts](https://recharts.org/) |
| Backend / Database | [Firebase Firestore](https://firebase.google.com/docs/firestore) |
| Authentication | [Firebase Auth](https://firebase.google.com/docs/auth) |
| PDF Parsing | [pdfjs-dist](https://mozilla.github.io/pdf.js/) |
| Icons | [Lucide React](https://lucide.dev/) |
| Hosting | Custom server at [camsub10.site](https://camsub10.site) |

---

## 🗂️ Project Structure

```
src/
├── components/
│   └── ui/
│       ├── sidebar/          # App sidebar + menus
│       └── ...               # shadcn/ui components
├── dashboards/
│   ├── admin/
│   │   └── sections/         # AthletesSection, EventsSection, MarquesSection...
│   ├── entrenador/           # Coach dashboard
│   └── pares/                # Parent/athlete dashboard
│       └── sections/         # EstadistiquesSection, EquipOptimSection...
├── firebaseClient.js         # Firebase config & db export
└── main.jsx
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 18
- A Firebase project with Firestore and Authentication enabled

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/atletisme-web.git
cd atletisme-web

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# → Fill in your Firebase config values

# Start the dev server
npm run dev
```

### Environment Variables

Create a `.env` file at the project root:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Build & Deploy

```bash
npm run build
```

> ⚠️ **Important for SPA routing:** The app uses React Router. Your server must redirect all routes to `index.html`. See the relevant config for your hosting provider:
>
> **Apache** — add a `.htaccess` in the `dist/` folder:
> ```apache
> RewriteEngine On
> RewriteRule ^index\.html$ - [L]
> RewriteCond %{REQUEST_FILENAME} !-f
> RewriteCond %{REQUEST_FILENAME} !-d
> RewriteRule . /index.html [L]
> ```
>
> **Nginx** — add to your server block:
> ```nginx
> location / { try_files $uri $uri/ /index.html; }
> ```

---

## 🗄️ Firestore Data Model

```
athletes/          { nom, sexe, naixement, categoria, actiu, codiPublic }
marques/           { atletaId, provaId, eventId, marca, data }
events/            { nom, data, lloc, tipus }
proves/            { nom, tipus }          ← "pista" | "camp"
users/             { email, rol, atletaId }
equipOptim/        { homesEquip, donesEquip, ... }
```

---

## 📄 License

This project is private software developed for **Club Atletisme**. All rights reserved.

---

## 🙌 Contributing

This is an internal club tool. For bug reports or feature requests, please contact the development team directly or open an issue in the private repository.
