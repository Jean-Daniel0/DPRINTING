# DPRINTING : architecture (Phase 1)

## Principe directeur
Un **seul document de design**, en millimètres, est la source de vérité. L'éditeur le modifie ; la 3D, les quatre aperçus et les fichiers de
production le lisent. Un **seul rendu 2D** (`packages/core/src/render2d.ts`) dessine ce document : il sert à l'affichage de l'éditeur, à la
texture 3D et à l'export de production. Il ne peut donc pas y avoir de décalage entre ce que voit le client et ce qui est imprimé.

## Choix techniques
| Besoin | Choix | Raison |
|---|---|---|
| Interface | React + TypeScript + Vite (PWA) | Même stack que Vendza, mobile et tactile |
| 3D | Three.js (bibliothèque libre, dans le navigateur) | Aucun service externe, WebGL sur mobile |
| Éditeur 2D | Canvas 2D maison (calques, poignées, guides) | Même rendu que la 3D et l'export |
| Modèles 3D | Générés par code (`models/tshirt.ts`), GLB admin possible plus tard | Autonome, léger, coordonnées en mm sur le tissu |
| Serveur | Node + Express + TypeScript sur Render | Prix calculés côté serveur, export de production |
| Données et fichiers | Supabase (Postgres avec RLS, Storage privé) | Demandé |

## Modules (packages/core, sans dépendance au navigateur ni à React)
- `units.ts` : mm, DPI, résolution effective d'une image, qualité d'impression.
- `document.ts` : calques image / texte / forme, opérations immuables.
- `geometry2d.ts` : rotation, sélection, redimensionnement par poignée, limites de la zone imprimable.
- `snap.ts` : guides d'alignement (bords, centre, autres calques).
- `history.ts` : annuler / rétablir.
- `render2d.ts` : rendu 2D unique, mise en page du texte identique à toutes les échelles.
- `catalog.ts` : produits, zones, couleurs, méthodes d'impression et leur compatibilité.
- `models/tshirt.ts` : maillage du T-shirt. Chaque sommet porte ses coordonnées « à plat » (u, v) en mm sur le tissu :
  1 mm dans l'éditeur = 1 mm de tissu en 3D (test automatique).

## Synchronisation éditeur / 3D
Le panneau avant (resp. arrière) du T-shirt a une texture dont chaque pixel correspond à une position en mm sur le tissu. La zone
d'impression y est placée à `offsetTopMm` sous le col. L'éditeur dessine dans le même repère : déplacer un logo met à jour la texture, donc la 3D.
Le design est dessiné dans une texture **transparente** superposée au tissu : changer la couleur du produit ne redessine rien.

## Aperçus et fichiers de production
- 4 aperçus (face, dos, gauche, droite) : caméras fixes, rendu hors écran haute résolution, fond propre. Aucun autre angle n'est exportable.
- Production : générée côté serveur depuis le document (pas depuis la 3D) : PNG transparent par zone, DPI et dimensions physiques,
  fichiers originaux conservés. Broderie : étape de conversion dédiée (phase 5).

## Risques identifiés
1. Réalisme du tissu sur mobile : budget de ~17 000 triangles pour le T-shirt, plis géométriques légers + normal map procédurale.
2. Texte : les polices doivent être embarquées (identiques dans le navigateur et sur le serveur d'export).
3. Broderie : conversion en points = chantier spécialisé.
4. Je ne peux pas voir l'écran : le rendu visuel final doit être validé sur téléphone ; la géométrie, les calculs et le mappage sont testés.
5. Supabase : limite de projets gratuits actifs atteinte sur le compte (voir l'état du projet).

## Plan
- Phase 2 (en cours) : T-shirt, éditeur, import d'images, synchronisation, couleur, quatre aperçus.
- Phase 3 : hoodies, mugs, autres produits.  Phase 4 : prix, variantes, panier, commandes.  Phase 5 : exports de production.  Phase 6 : tests et optimisation.

## État de la Phase 2
Fait et testé : moteur de design, catalogue, modèle 3D du T-shirt (contrôlé par rendu logiciel).
À faire : interface web (éditeur + visionneuse Three.js), génération des quatre aperçus, serveur et déploiement Render.
