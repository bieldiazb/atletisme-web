# Desplegament automàtic: GitHub → Cloudflare Pages

Objectiu: fer `git push` i que Cloudflare construeixi i publiqui sol, sense tocar `dist` mai més.

## 0. Punt de partida

El repo ja existeix i té remote configurat:

```
origin  https://github.com/bieldiazb/atletisme-web.git
```

Però hi ha molts canvis sense commitejar (pràcticament tot el projecte). Cal pujar-ho tot primer.

## 1. Pujar els canvis pendents a GitHub

```bash
cd ruta/al/projecte
git add -A
git commit -m "Actualitzacio projecte"
git push origin main
```

Si `git status` diu que hi ha fitxers "untracked" que no haurien de pujar (per exemple `dist/`, `node_modules/`), revisa que estiguin al `.gitignore` (ja ho estan: `node_modules`, `dist`, `*.local`).

## 2. Connectar el repo a Cloudflare Pages

1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → pestanya **Pages** → **Connect to Git**.
2. Autoritza Cloudflare a accedir a GitHub (si no ho havies fet) i selecciona el repo `bieldiazb/atletisme-web`.
3. Configuració de build:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (deixa buit si el projecte és a l'arrel)
4. Variables d'entorn: no en necessites ara — la config de Firebase està escrita directament a `firebaseClient.js` (són claus públiques de client, no calen secrets).
5. **Save and Deploy**.

## 3. Si ja tenies un projecte Pages amb pujada manual (Direct Upload)

Tens dues opcions:

- **Opció A (recomanada)**: al projecte nou connectat a Git, ves a **Custom domains** i afegeix `camsub10.site` (i el `www` si el fas servir). Cloudflare et deixarà moure el domini des del projecte antic. Un cop moguts els dominis, pots eliminar el projecte antic de Direct Upload.
- **Opció B**: elimina el projecte antic abans i crea el nou (des del pas 2) reutilitzant el mateix nom si vols mantenir la URL `*.pages.dev`.

## 4. A partir d'ara

Cada `git push` a `main` dispara build + deploy automàtic. Pots veure el progrés a la pestanya **Deployments** del projecte a Cloudflare. Per provar canvis sense publicar-los a producció, treballa en una altra branca i fes push: Cloudflare crea un **preview deployment** amb URL pròpia sense tocar `main`.

## Resum ràpid

```bash
git add -A
git commit -m "missatge"
git push
```

Prou. Cloudflare fa la resta.
