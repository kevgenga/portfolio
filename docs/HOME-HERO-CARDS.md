# Cartes du hero KEVGENGA

Cette configuration concerne uniquement l’accueil. Aucun catalogue ni média original n’est modifié. La sélection Manga reste immédiatement sous le hero.

## Images, liens et ordre

Fichier : `src/content/sitePresentation.js`, tableau `heroCards`.

| Carte / filtre `category` | `artworkId` actuel | Fichier du catalogue |
| --- | --- | --- |
| `illustrations` | `illustration27` | `Illustration27.jpg` |
| `sketches` | `penup-25-10-2019` | `penup_25-10-2019.jpg` |
| `paintings` | `doc270522-63-pdf-1` | `DOC270522 (63).pdf_1.jpg` |
| `character-design` | `img20190426-16344279` | `img20190426_16344279.jpg` |
| `backgrounds` | `fish-eye-perspective-ruler-et-quelque-test-background-3d` | `Fish-eye-perspective-ruler-et-quelque-test-background-3d.jpg` |

Pour remplacer une image, recopier l’`id` d’une œuvre existante dans `src/content/artworks.js` dans `artworkId`. Choisir une œuvre publique appartenant à la catégorie correspondante. Les règles de visibilité existantes restent respectées ; une sélection masquée ne s’affiche pas sur l’accueil.

Exemple : conserver `category: "backgrounds"`, changer seulement `artworkId` et, si nécessaire, `objectPosition: "60% center"`. `objectFit: "cover"` remplit le cadre avec recadrage ; `"contain"` montre l’image entière. Les proportions sont préservées dans les deux cas.

Les cinq cartes utilisent maintenant `cover` : aucune bande de fond créée par `contain`. `contain` reste disponible si vous préférez montrer une œuvre entière, mais il laisse volontairement des bandes lorsque les ratios diffèrent. Il ne faut jamais utiliser `fill` pour étirer un dessin. `objectPosition: "70% center"` décale le cadrage vers la droite ; `"70% 30%"` permet également de choisir la position verticale. Le réglage s’applique au repos et pendant l’expansion.

### Image Photoshop dédiée au hero (facultative)

Déposer votre fichier dans **`public/assets/hero-cards/`**, par exemple **`character-design-hero.jpg`**. Ce dossier est prêt, sans duplication des œuvres existantes. Dans l’objet `character-design` de `src/content/sitePresentation.js`, remplacer seulement :

```js
heroImage: "assets/hero-cards/character-design-hero.jpg",
objectFit: "cover",
objectPosition: "center center",
```

Ne pas inclure `public/`, `/portfolio/` ou une URL localhost : `assetPath()` ajoute automatiquement `import.meta.env.BASE_URL`. **`heroImage: null`** (ou champ absent) rétablit la miniature du catalogue si disponible, sinon son image originale. `artworkId`, la catégorie, les règles de visibilité et le lien restent inchangés. L’original de la galerie Illustration n’est jamais remplacé.

Pour Character Design, la planche actuelle **1267 × 900 px** est paysage. `cover` remplit le cadre, mais ne peut pas montrer tous les personnages dans une colonne étroite. Le cadrage actuel à **85% horizontal** privilégie le personnage de droite. Une nouvelle composition verticale est recommandée si vous voulez présenter plusieurs vues à la fois.

Format Photoshop conseillé : **1000 × 1800 px**, ratio **5:9** (largeur/hauteur ≈ 0,56). Garder les visages et silhouettes essentiels dans les **60% centraux** de la largeur, avec un peu de marge en haut et en bas. Les bords sont davantage recadrés par les cadres diagonaux et le format mobile, plus horizontal. Aucun ratio unique ne peut éviter tous les recadrages à toutes les tailles ; contrôler l’aperçu desktop et mobile avant de valider. Exporter vous-même en JPG/PNG/WebP, puis renseigner `heroImage` : l’application ne transforme pas le fichier.

`category` construit automatiquement le lien `/illustration?category=backgrounds`, préfixé `/portfolio/` par le routeur. Ne pas mettre de chemin absolu dans ce champ. `order` définit l’ordre de présentation ; `titleKey` sélectionne le libellé traduit de la catégorie.

## Réglages visuels

### Hauteur immersive de l’accueil

Dans `src/index.css`, le bloc `.manga-home-hero` définit :

- `--home-hero-desktop-min-height` : hauteur disponible sous la Navbar,
  calculée depuis `100svh` (repli `100vh`) et sa hauteur réellement mesurée ;
- `--home-hero-max-desktop-height: 84rem` : limite sur les écrans très hauts,
  pour éviter une immense zone vide ;
- `--home-hero-space-block` : respiration verticale autour des cartes ;
- `--home-hero-align: center` : alignement vertical des colonnes.

La Navbar est fixe et superposée au début de la page : la hauteur totale du
Hero inclut son emplacement. Home la mesure avec un `ResizeObserver`, sans
modifier la navigation ni recopier ses dimensions. À 1440 × 900, le Hero
mesure 900 px au total, dont 829 px sous la Navbar actuelle (71 px).
À 1366 × 768 : 768 px au total, dont 697 px sous la Navbar.

`.manga-home-hero .hero-art-cards` ajuste `--hero-height` à cet espace et porte
`--hero-max-height` à `52rem`. Le calcul existant de `--hero-slant` et des
réserves latérales suit la nouvelle hauteur automatiquement. L’inclinaison
reste de 8°, sans modifier les interactions ni les cadrages configurés.
Sous 1280 px, le Hero reprend sa hauteur naturelle et les grilles existantes.

Test dédié : `node tests/home-final-design-browser.mjs`, après `npm run build`.
Captures facultatives : variable `HOME_FINISH_CAPTURE_DIR`. Les zooms
100/125/140/200 % sont testés par leurs viewports CSS équivalents et le DPR,
pas par un zoom/pinch CSS dans le site. Vérifier aussi votre Firefox habituel.

Le titre social utilise un espacement local de `2rem` (`#sketchbook-title`),
comme la zone de titre Manga ; aucune police ni traduction n’est changée.

Fichier : `src/components/about/HeroArtworkCards.css`, bloc **HERO CARD DESIGN SETTINGS** en tête du fichier. Toutes les variables suivantes contrôlent réellement le rendu.

| Réglage | Variable et valeur par défaut / exemple |
| --- | --- |
| Inclinaison | `--hero-angle: 8deg` ; `0deg` désactive la diagonale |
| Hauteur desktop | `--hero-height: clamp(29rem, 40vw, 39rem)` |
| Espacement desktop | `--hero-gap: 1px` |
| Bordure | `--hero-border-width: 3px` |
| Couleur de bordure | `--hero-border-color: color-mix(in srgb, var(--color-paper) 70%, var(--color-ink))` |
| Bordure active | `--hero-hover-border: var(--color-paper)` |
| Largeur supplémentaire demandée - quand la carte > Agrandissement| `--hero-expand: 5px` ; `0px` supprime toute redistribution |
| Largeur minimale des autres cartes | `--hero-min-card-width: 112px` |
| Vitesse | `--hero-duration: 320ms` ; par exemple `450ms` pour ralentir |
| Courbe | `--hero-easing: cubic-bezier(0.22, 1, 0.36, 1)` |
| Images atténuées / normales | `--hero-inactive-opacity: 0.58` (uniquement pendant une interaction) / `--hero-active-opacity: 1` (repos et carte active) |
| Fond des cartes / images | `--hero-card-bg: var(--color-ink)` / `--hero-image-bg: #000000` |
| Titres / numéros / description | `--hero-title-color: var(--color-paper)`, `--hero-label-color: var(--color-primary)`, `--hero-description-color: var(--color-paper)` |
| Taille du titre | `--hero-title-size: 0.8125rem` (13px) ; japonais : 14px |
| Hauteur de légende | `--hero-caption-height: 124px` ; japonais : 132px |
| Description au repos | `--hero-description-lines: 2` ; le texte complet reste dans le DOM et accessible via `aria-describedby` |
| Hauteurs tablette / mobile | `--hero-tablet-card-height: 19rem` / `--hero-mobile-card-height: 12rem` |

Les couleurs réutilisent les tokens du portfolio. Pour les textes : `src/content/ui.js` (EN), `src/i18n/translations/ja.js` et `src/i18n/translations/fr.js` (JA/FR). Les clés sont `home.heroSummary`, `home.heroCategories`, `home.openCategory`, `home.workDescriptions` et `illustration.categories` pour les titres.

## Largeurs, sécurité et responsive

`src/utils/heroArtworkCards.js` redistribue la largeur **à l’intérieur du groupe** : la carte active gagne au maximum `--hero-expand`, les autres cèdent chacune un quart de ce gain. La largeur minimale limite automatiquement le gain. L’espacement et la largeur totale ne changent pas. Pas de `scale()` sur les cartes.

Le cadre utilise `skewX` ; une transformation inverse maintient images et textes droits. L’angle est borné à 0–12°, la hauteur desktop à 24–42rem, le gap à 0–16px et la bordure à 0–6px. Une réserve latérale calculée protège les extrémités inclinées. Garder les unités indiquées : pixels pour expansion et largeur minimale, degrés pour l’angle.

Dans `src/index.css`, `.manga-home-hero` répartit le desktop en environ 27/73 avant le gap. À partir de **1280px**, cinq cartes diagonales sont côte à côte. Sous **1280px**, présentation au-dessus, grille de trois colonnes sans inclinaison ni expansion. Sous **768px**, grille de deux colonnes et dernière carte sur toute la largeur. Aucun rail horizontal. La carte est directement navigable au premier toucher.

Sur desktop, souris et focus clavier déclenchent la mise en avant. Le focus reste visible. `prefers-reduced-motion` supprime les transitions, pas la navigation.

Au repos, aucune carte n’est active par défaut : les cinq images sont à 100 %. Pendant un survol/focus réel, seule la carte ciblée reste à 100 %, les quatre autres utilisent `--hero-inactive-opacity`. À la fin de l’interaction, les cinq redeviennent normales.

Les cinq descriptions sont toujours visibles, dans toutes les langues et à toutes les largeurs. Le texte provient exclusivement de `home.workDescriptions` dans les trois fichiers de traduction cités plus haut. Le CSS limite l’état normal à deux lignes avec ellipse, sans troncature JavaScript. Survol/focus : le clamp est retiré. La légende conserve sa hauteur pendant l’interaction, sans changer la taille des cadres ; elle réserve 124px (132px en japonais) à toutes les largeurs. Les descriptions sont maintenant à 13px, ou 13,5px/interligne 1,6 en japonais : compromis ciblé de lisibilité pour ces cartes compactes. Une description longue, ou une colonne particulièrement étroite, peut nécessiter un défilement vertical dans sa zone active plutôt que déborder ou recouvrir le titre. Garder de préférence une phrase courte. L’angle, la largeur, l’expansion, les hauteurs totales et le responsive des cadres restent inchangés ; seule la répartition image/légende évolue légèrement.

Les deux boutons du hero sont des liens React Router : « Voir les mangas » ouvre `/mangaka`, « Voir les travaux » ouvre `/illustration`, sans paramètre de filtre. Le préfixe `/portfolio/` est ajouté automatiquement par le routeur.

Pour retrouver le rendu par défaut, remettre les valeurs du tableau et les cinq références ci-dessus. Pour un rendu neutre, modifier seulement `--hero-angle: 0deg` et `--hero-expand: 0px`.

## Validation et poids des sources

`node --test src/utils/heroArtworkCards.test.mjs src/utils/illustrationFilters.test.mjs` teste sélection, catégories et redistribution. Après `npm run build`, `node tools/artwork-admin/tests/public-home-browser.mjs` vérifie le rendu dans un Chromium isolé : 11 largeurs × 3 langues × 2 thèmes, focus, liens, rechargement et Retour. Les captures optionnelles utilisent `HOME_QA_CAPTURE_DIR` et figent les animations d’entrée uniquement pour la prise de vue.

Pour tester également les transitions en temps réel (desktop 1440px), depuis PowerShell : `$env:HOME_QA_FULL_MOTION="1"`, puis la même commande navigateur. Retirer ensuite cette variable avec `Remove-Item Env:HOME_QA_FULL_MOTION`. Ce test utilise un profil Chromium temporaire séparé de votre navigateur. Les événements souris sont simulés ; la sensation tactile sur un appareil physique et le zoom réel du navigateur restent à contrôler manuellement.

Les cinq sources actuellement choisies représentent environ **3,21 Mo**, dont **1,35 Mo** pour `DOC270522 (63).pdf_1.jpg`. La première image est prioritaire, les quatre autres utilisent le chargement natif différé ; un navigateur peut néanmoins charger les cinq si elles sont visibles. Les originaux n’ont été ni convertis ni compressés. Une optimisation ultérieure doit faire l’objet d’une étape distincte validée.
