# DPRINTING

Plateforme de print on demand avec studio de personnalisation 2D, visualisation 3D et fabrication, sans service externe de mockup.

## État d'avancement

| Bloc | État |
|---|---|
| Moteur de design (mm, calques, historique, rendu 2D unique) | ✅ terminé, 14 tests |
| Tarification serveur (palier, suppléments, mise en route) | ✅ terminé, 10 tests |
| Validation de design et calcul des zones imprimées | ✅ terminé, 10 tests |
| Modèle 3D du T-shirt généré par code | ✅ terminé |
| API : catalogue, devis, designs, fichiers, commandes, admin | ✅ terminé, 17 tests d'intégration |
| Stockage Supabase / local et base PostgreSQL / PGlite | ✅ terminé |
| Studio web (éditeur + 3D + aperçus + commande) | ✅ terminé |
| Déploiement Render + Supabase | ✅ en ligne (health 200, base et stockage Supabase) |

Rien n'est simulé : les méthodes d'impression dont le fichier de production n'est pas encore développé (sérigraphie, vinyle, broderie)
sont refusées par l'API avec une explication explicite. Aucun prix envoyé par le client n'est accepté : le serveur recalcule tout.

## Démarrage

```bash
npm install
npm test                 # moteur + API (vraie base PostgreSQL en mémoire, vrais PNG)
npm run typecheck
npm run dev:server       # API sur http://localhost:3000
npm run dev:web          # interface sur http://localhost:5173
```

En développement, l'administration est accessible avec `admin@dprinting.local` / `dprinting-dev`.
Aucun mot de passe par défaut n'existe en production : `SESSION_SECRET`, `ADMIN_EMAIL` et `ADMIN_PASSWORD_HASH`
sont obligatoires (voir `apps/server/src/config.ts`).

Générer un hash de mot de passe administrateur :

```bash
npm run admin:hash -- "un-mot-de-passe-de-12-caracteres-minimum"
```

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | PostgreSQL (Supabase, pooler). Absente : PGlite local. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | stockage des fichiers (obligatoire en production) |
| `STORAGE_DRIVER` | `supabase` en production, `local` en développement |
| `SESSION_SECRET` | signature des sessions administrateur |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | compte administrateur |
| `PUBLIC_URL` | URL publique (cookies sécurisés, liens signés) |
| `DATA_DIR`, `PGLITE_DIR` | développement local uniquement |

## Déploiement Render

Le fichier `render.yaml` décrit le service. **Seules deux variables sont obligatoires** dans le dashboard
Render (`sync: false`) :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Toutes les autres (`NODE_ENV`, `PUBLIC_URL`, `STORAGE_DRIVER`, `SUPABASE_BUCKET`, `SESSION_SECRET`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `DATABASE_URL`) ont une valeur par défaut dans `render.yaml`
ou dans le code.

Point important : `NODE_ENV=production` fait ignorer les `devDependencies` par `npm install`, or Vite en
fait partie. La commande de build doit donc être :

```bash
npm install --include=dev && npm run build
```

## Garder le service éveillé (plan gratuit)

Le plan gratuit Render endort le service après ~15 minutes sans trafic. **Aucun code interne ne peut
l'empêcher** : une fois endormi, le processus n'existe plus. La seule solution est un ping externe.

- Endpoint dédié, sans accès base de données : `GET /api/ping`
- **Méthode active** : tâche `pg_cron` + `pg_net` dans Supabase, toutes les 10 minutes.
  Installation idempotente :

  ```bash
  npm run keepalive:setup -w @dprinting/server
  # vérifier les dernières exécutions et codes HTTP :
  npm run keepalive:setup -w @dprinting/server -- --status
  ```

  Le script lit `DATABASE_URL` et `KEEPALIVE_URL` (défaut : `https://dprinting.onrender.com/api/ping`).
  Prérequis : extensions `pg_cron` et `pg_net` activées dans Supabase (Database → Extensions).
  Vérifié en production : exécution `succeeded`, réponse HTTP `200`.
- **Alternative** : `.github/workflows/keep-awake.yml` est fourni comme exemple dans
  `docs/keep-awake.workflow.yml.example`. Pour l'activer, copiez-le dans `.github/workflows/` et
  poussez avec un jeton disposant du scope `workflow` (GitHub refuse ce fichier sans ce scope).

Limites honnêtes : maintenir le service éveillé 24/7 consomme le quota mensuel d'heures Render, et
`pg_cron` ne tourne que si la base Supabase n'est pas mise en pause (projet gratuit inactif 7 jours).
Pour ne pas consommer ce quota, supprimez la tâche :
`select cron.unschedule('dprinting-keepalive');`

## Structure

- `packages/core` : source de vérité (document en millimètres, rendu, tarification, validation, maillage 3D)
- `apps/server` : API Express, PostgreSQL/Supabase, authentification, inspection binaire des fichiers
- `apps/web` : studio React/Three.js, commande, suivi, administration
- `tools/preview.ts` : rendu CPU du maillage pour contrôler le modèle sans navigateur

Architecture détaillée : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
