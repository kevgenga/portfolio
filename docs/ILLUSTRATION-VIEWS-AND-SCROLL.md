# Galerie Illustration et retour en haut

## Deux vues, un seul catalogue

`src/pages/Illustration.jsx` conserve une seule liste filtrée/triée, un seul
chargement progressif (24 œuvres par lot), les mêmes `ArtworkCard` et une seule
Lightbox contenant toute la sélection. Basculer de vue ne réinitialise rien.

- **Grandes cartes** : vue par défaut ; dimensions et recadrage des images inchangés.
- **Liste compacte** : cartes horizontales, miniature à gauche et date centrée
  avec éventuel badge à droite. Les mêmes sources et miniatures sont chargées
  en différé ; aucune image n'est créée.

Les boutons réutilisent les styles des filtres et les icônes déjà installées.
Leur nom accessible, leur infobulle et `aria-pressed` suivent EN/FR/JA.
La préférence locale `portfolio-illustration-view` (`cards` / `compact`) est
lue/écrite par `src/utils/illustrationView.js`, sans toucher à l'URL.
Un stockage bloqué ne bloque pas le changement de vue.

## Réglages visuels

Fichier : `src/components/gallery/IllustrationViews.css`.

- Colonnes compactes : `repeat(auto-fill, minmax(min(100%, 18rem), 1fr))`.
  Avec les marges et espacements actuels : 1 colonne à 320–430 px,
  2 à 768 px, 3 à 1024 px, 4 à 1366/1440 px, 5 à 1920 px.
  Le calcul dépend de la largeur réellement disponible, scrollbar comprise.
- Miniature compacte : colonne `clamp(5rem, 8vw, 6rem)` (80–96 px),
  carte d'au moins 120 px de haut ; `object-fit: contain`, sans déformation.
- Espacement des cartes : `gapClassName` de `PortfolioGrid` dans `Illustration.jsx`
  (8 / 12 / 16 px suivant les breakpoints).
- Métadonnées : colonne compacte sous la date ; aucune ligne vide sans durée.
  Les cartes ne s'étirent pas pour remplir les rangées de la grille.
- Badge existant : position par défaut `metadata` dans
  `src/content/productionTimeBadgeSettings.js`. Palette, typographie et contenu
  restent dans `ProductionTimeBadge.css` / `.jsx` ; voir
  [PRODUCTION-TIME-BADGES.md](PRODUCTION-TIME-BADGES.md).

## Un seul bouton Retour en haut

`App.jsx` monte `BackToTopButton` à côté du Footer, hors des grilles animées,
sur les routes publiques ordinaires. La condition `!isMangaReader` exclut
entièrement `/mangas/:id` : aucun contrôle ni listener ajouté au Reader.

- Seuil : `VISIBILITY_THRESHOLD = 400` dans `BackToTopButton.jsx`, pour rester
  accessible au Footer des pages Manga/Contact plus courtes sur desktop.
- Scroll passif limité à une mise à jour par frame ; nettoyage à la navigation
  et au démontage. Ni changement de route, ni modification de hash/paramètre.
- Retour fluide, ou immédiat avec `prefers-reduced-motion: reduce`.
- Position et safe areas : `BackToTopButton.css`, à 16 px puis 24 px des bords.
  Z-index 40, identique à l'ancien bouton, pas de surenchère.
- Un marqueur permanent réserve dans l'intérieur du Footer un étroit couloir
  droit (44 px + marge de bord + 16 px), même avant l'apparition du bouton :
  pas de décalage lors de son apparition, ni lien/copyright derrière lui.
  Le composant et le contenu du Footer restent inchangés.
- Un `MutationObserver` observe uniquement les ajouts/retraits et attributs
  d'ouverture des interfaces immersives (Fancybox, dialogue, `aria-modal`, menu
  mobile), avec `fullscreenchange` pour le plein écran natif. Aucun calcul sur
  les cartes pendant le scroll. Le bouton est **retiré du DOM**, donc du focus,
  pendant ces interfaces ; il revient à leur fermeture si le seuil est atteint.

## Vérification

```text
node --test src/utils/illustrationView.test.mjs
npm run production-time:public-test
npm run production-time:public-browser-test
npm run lint
npm run build
git diff --check
```

La suite Chrome existante intègre `tests/illustration-views-and-scroll.mjs` :
deux vues, catalogue complet, filtres/tri/chargement, liens profonds et Lightbox,
EN/FR/JA, clair/sombre, 320 à 1920 px, scroll au Footer sans collision,
clavier/tactile, menu mobile/dialogue/fullscreen et exclusion du Reader.
Les durées et groupes de test sont injectés en mémoire dans Vite, jamais écrits
dans les catalogues réels. `PUBLIC_PRODUCTION_CAPTURE_DIR` permet de conserver
les captures. Compléter par un essai sur un téléphone physique (barres mobiles
et safe areas réelles) avant la prochaine publication.
