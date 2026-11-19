# DPRINTING

Plateforme de Print on Demand avec studio de personnalisation et visualisation 3D autonomes.

- Architecture et plan : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- `packages/core` : moteur partagé (document de design, rendu 2D, catalogue, modèle 3D du T-shirt)
- `apps/web` : interface (éditeur + 3D), `apps/server` : API et exports

```
npm install
npm test            # tests du moteur
npx tsx tools/preview.ts   # image de contrôle du modèle 3D -> tools/out/tshirt.png
```
