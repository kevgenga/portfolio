# Phase 4 — Temps de réalisation sur le portfolio public

## Où les informations apparaissent

- **Illustration** : badge de temps de travail en haut à droite de l’image,
  avec un libellé visible et la durée. La date reste sous l’image. Aucun
  changement des fichiers, proportions ou miniatures.
- **Lightbox Illustration** : date conservée, durée individuelle et indication
  mesurée/estimée. Les temps collectifs pertinents sont consultables dans un
  volet « Temps totaux des ensembles », replié par défaut.
- **Manga et sélection Manga de la Home** : seul le temps global saisi dans
  `productionTime.total` est affiché dans les métadonnées de la carte partagée.
- **Manga Reader** : la zone de pagination existante montre la durée facultative
  et le numéro de chaque page affichée. En double page, les deux informations
  restent distinctes ; aucune somme n’est créée. Masquer l’interface masque
  aussi ces métadonnées. Les images conservent leur taille et leur cadrage.

Les cinq cartes diagonales du Hero représentent des catégories : elles ne
reçoivent aucun badge. Animation n’est pas concernée.

## Formats et langue

La langue de l’interface détermine les libellés et unités, indépendamment de la
langue des pages Manga :

| Durée | English | Français | 日本語 |
| --- | --- | --- | --- |
| 45 minutes | 45 min | 45 min | 45分 |
| 1 heure | 1 hr | 1 h | 1時間 |
| 2 heures 30 | 2 hr 30 min | 2 h 30 | 2時間30分 |
| 250 heures | 250 hr | 250 h | 250時間 |

`actual` signifie **mesuré / Measured / 実測**. `estimated` signifie **estimé**,
avec une indication visible `approx.`, `≈` ou `約` et un libellé accessible
explicite. Les heures ne deviennent pas des journées, sans arrondi des minutes.

Une durée absente, nulle, négative, fractionnaire, numériquement non sûre ou
mal formée ne produit aucun indicateur. Aucun zéro, « inconnu » ou estimation
automatique n’est ajouté. La validation stricte des Admin reste inchangée.

## Dessins multilingues et groupes

Le lecteur retrouve la durée par `productionTime.bindings` → identifiant logique
→ `productionTime.pages[].time`. Un nom, numéro, index ou dimension identique
n’est jamais une preuve de correspondance. Les chemins relatifs historiques et
ceux préfixés par la base Vite sont reconnus ; une référence ambiguë est ignorée.

Les groupes Artwork viennent directement de l’export facultatif
`artworkProductionGroups`. La lightbox indique **temps TOTAL de l’ensemble**,
nombre de membres et type. Un groupe contenant des références inconnues,
ambiguës ou des œuvres non publiques n’est pas affiché. Les noms administratifs
des groupes ne sont pas publiés automatiquement. Deux groupes qui se chevauchent
restent deux informations séparées, jamais additionnées.

Les groupes Manga restent complémentaires dans l’Admin et ne sont pas affichés
dans le lecteur ni sur les cartes : ils ne remplacent ni une durée de page ni
le total manuel. Aucun total public n’est calculé à partir des pages, traductions
ou groupes. Effacer une durée individuelle peut donc laisser une information
collective dans la lightbox, explicitement présentée comme collective.

## Mettre à jour une durée

1. Lancer `npm run artwork-admin` et modifier les durées dans les interfaces
   déjà validées des Phases 1–3.
2. Enregistrer. En développement Vite, le catalogue actualisé est rechargé selon
   le mécanisme existant ; rafraîchir le navigateur si nécessaire.
3. Vérifier l’affichage local, puis lancer `npm run lint` et `npm run build`.
4. Publier ultérieurement par votre workflow GitHub Pages normal, lorsque vous
   l’avez décidé. Le site distant ne change **pas instantanément** après une
   modification dans l’Admin local : il faut un nouveau build et déploiement.

Cette phase n’a réalisé aucun commit, push ou déploiement. Le site public ne
fait aucun appel à une API Admin locale et n’écrit aucune métadonnée.

## Présentation et maintenance

`ProductionTimeBadge.jsx` et son CSS partagent l’affichage compact/détaillé.
Le réglage des badges Illustration (palette, seuils, mode neutre et placement)
est expliqué dans [PRODUCTION-TIME-BADGES.md](PRODUCTION-TIME-BADGES.md).
`publicProductionTime.js` assure la lecture défensive, les formats et la
recherche des dessins ; `productionTimeCaption.js` crée les légendes Fancybox
avec des nœuds texte, sans HTML injecté. Les traductions résident dans `ui.js`,
`fr.js` et `ja.js`.

Pour adapter tailles, espacements ou couleurs, modifier uniquement les classes
`.production-time…` dans `src/components/ProductionTimeBadge.css`, en vérifiant
les trois langues et les deux thèmes. Pour désactiver un emplacement, retirer
son appel au composant de présentation (ou l’option `showProductionTime` de la
galerie) et, pour la lightbox, conserver uniquement la date dans la construction
de ses légendes. Ne pas toucher aux catalogues pour un changement visuel.

## Vérifications

`npm run production-time:public-test` couvre formats, absence/invalidité,
traductions, composants, groupes, identités et absence de double comptage.
`npm run production-time:public-browser-test` lance Vite et Chrome isolés avec
des métadonnées de test injectées **en mémoire**, jamais dans les catalogues.
Chemin Chrome personnalisable : `PRODUCTION_TIME_TEST_CHROME`. Captures
facultatives : `PUBLIC_PRODUCTION_CAPTURE_DIR`.

Les vérifications navigateur couvrent Home, Illustration, Manga, lightbox et
lecteur en EN/FR/JA, clair/sombre, de 320 à 1920 px. Le test sans durées vérifie
qu’aucun indicateur n’apparaît. Tester également sur votre téléphone et votre
navigateur habituel avant publication : l’émulation tactile ne remplace pas
une vérification physique.
