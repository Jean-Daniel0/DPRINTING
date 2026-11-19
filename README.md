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
| Studio web (éditeur + 3D + aperçus + commande) | 🚧 en cours |
| Déploiement Render + Supabase | ⏳ en attente des accès |

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

## Structure

- `packages/core` : source de vérité (document en millimètres, rendu, tarification, validation, maillage 3D)
- `apps/server` : API Express, PostgreSQL/Supabase, authentification, inspection binaire des fichiers
- `apps/web` : studio React/Three.js, commande, suivi, administration
- `tools/preview.ts` : rendu CPU du maillage pour contrôler le modèle sans navigateur

Architecture détaillée : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
