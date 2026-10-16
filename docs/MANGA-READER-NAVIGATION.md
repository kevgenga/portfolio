# Navigation du Manga Reader

## Slider horizontal

`ReaderPageSlider.jsx` est un véritable `input type="range"` : minimum 0,
maximum égal au nombre de **panneaux réels moins 1**, pas au nombre d’images.
Il n’est
**pas monté** en mode vertical. Les libellés EN/FR/JA viennent de `mangaReader.goToPage`.

- Souris/tactile : aperçu local pendant le déplacement, une seule navigation
  au relâchement. Annulation du pointeur ou perte du focus : aperçu abandonné.
- Clavier : flèches natives, Home et End ; le focus dans le slider ne commande
  jamais le rail en parallèle. Échap conserve le comportement du Reader.
- RTL : page 1 à droite, progression vers la gauche. LTR : page 1 à gauche.
  L’ordre physique des pages et les gestes existants ne sont jamais inversés.
- La source de vérité est `getHorizontalReadingPanels` dans `readerPagination.js`.
  Le rail, ses voisins, les flèches et le slider consomment cette même liste.
  Les paires horizontales explicites de la langue active ont priorité sur le
  regroupement automatique ; `getVisiblePageNumbers` reste une entrée compatible
  qui consulte ce constructeur. Aucune liste de pairs n’est codée
  dans le slider. `getReadingPanelIndex` retrouve le panneau contenant la page.
- Chaque cran désigne **un panneau**, le compteur garde **sa première page**.
  Sur desktop : couverture seule, puis 2–3, 4–5, etc. Avec 24 pages, les crans
  0, 1, 2… correspondent à 1, 2, 4… ; la dernière page 24 reste seule et accessible.
  Avec 31 pages, End ouvre 30–31 et indique 30 / 31. Sur petit écran, chaque
  panneau contient une page, sauf les paires explicitement forcées pour l’horizontal.
  Par exemple une paire 03–04 donne `01 → 02 → 03–04 → 05–06…` sur desktop,
  et `01 → 02 → 03–04 → 05 → 06…` sur mobile. Sans configuration, rien ne change.
  Voir [MANGA-SPREADS-CONFIGURATION.md](MANGA-SPREADS-CONFIGURATION.md).
- Pendant le glissement, **le compteur existant sous le slider** indique la
  première page du panneau ciblé : par exemple 10 / 24 → 12 / 24 → 24 / 24.
  La bulle flottante a été supprimée ; le slider conserve sa destination
  accessible traduite, notamment pour les doubles pages. L’image et ses durées
  restent sur le panneau réellement ouvert jusqu’au relâchement. Celui-ci
  navigue directement à la destination, sans retour temporaire de l’ancien
  compteur. Le même état local d’aperçu alimente le curseur et le compteur,
  sans deuxième état de pagination ni modification du rail.
  Une annulation, perte de focus/capture, navigation extérieure ou changement
  de contexte abandonne l’aperçu et rétablit le compteur réel. En dehors d’un
  glissement, le compteur suit uniquement le panneau affiché.
  Pour un manga d’une seule page, le slider est désactivé, sans division par zéro.
  Changer de langue ou de regroupement responsive annule l’ancien aperçu et
  reconstruit les positions à partir des panneaux de la version active.
- Le saut utilise `goToPage` et les panneaux/préchargements existants : seules
  la destination et ses voisines sont préparées, pas les pages intermédiaires.
  Un éventuel snap en cours est annulé par l’adaptateur, sans modifier le moteur.
- En horizontal, les deux bandeaux se superposent au panneau : le rail utilise
  toute la hauteur du viewport, sans réserver celle du bandeau inférieur.
  Le centrage existant et `object-contain` gardent les proportions et l’intégralité
  des planches. Si la largeur limite l’agrandissement, l’image reste contenue.
  Masquer l’interface permet de voir les parties sous les commandes, sans
  redimensionner les pages ; les commandes deviennent masquées et `inert`.

Réglages dans `src/components/manga/ReaderNavigation.css` :

| Variable | Valeur initiale |
| --- | --- |
| `--reader-slider-max-width` | `70rem` (1120 px, dont 32 px de marges intérieures usuelles ; piste de 1088 px maximum) |
| `--reader-counter-font-size` | `clamp(.875rem, 1.25vw, 1rem)` : 14 à 16 px |
| `--reader-counter-gap` | `2px` de padding supérieur sur la ligne du compteur |
| `--reader-slider-track` | `#555` |
| `--reader-slider-fill` | `#ffd500` |
| `--reader-slider-thumb` | `#fff` |
| `--reader-slider-track-height` | `6px` |
| `--reader-slider-thumb-size` | `22px` |

La zone de manipulation conserve 44 px de haut. Les règles WebKit et Firefox
personnalisent uniquement l’apparence du contrôle natif. Le padding de 6 px,
le focus et les dimensions du bandeau restent inchangés après suppression de
la bulle : aucun déplacement du compteur ni de l’image pendant le glissement.

Les trois premiers réglages sont regroupés en tête de `ReaderNavigation.css`
et limités au mode horizontal. Le slider utilise `width: 100%`, un `max-width`
et des marges automatiques : centré et raccourci sur desktop, presque pleine
largeur sur smartphone. Le compteur est en graisse 700 ; son padding inférieur
de 18 px minimum (avec prise en compte de la safe area) le remonte légèrement
sans le coller au bord de l’écran. La piste de 6 px et le curseur de 22 px sont
inchangés. Aucune règle de pagination ou de gestes n’est concernée.

En tête du même fichier, `--reader-header-bg-opacity` et
`--reader-footer-bg-opacity` valent `0.90` : remplacer par `0.80` ou `1`
pour ne changer que les fonds noirs, jamais l’opacité des enfants. Les bandeaux
partagés utilisent ces fonds aussi en vertical, sans changer sa géométrie ni
son suivi. `--reader-horizontal-height: 100dvh` règle la hauteur immersive ; le
mode vertical n’utilise pas cette variable. Le regroupement, les images,
le swipe et le préchargement restent inchangés.

## Suivi vertical passif

`useVerticalPageTracking.js` détecte le vrai conteneur de scroll : document en
lecture normale, élément Reader en plein écran natif (`overflow-y: auto`).
Il ne dépend pas d’un tableau de références vidé après le montage.

La page active contient le **centre du viewport**, borné à la zone non masquée
par le header et le bandeau inférieur. Cette référence ne se déplace pas quand
le texte d’une durée modifie légèrement la hauteur du compteur. Dans l’espace
entre deux pages, la page adjacente
déjà active est conservée : stabilité dans les deux sens. En fin de défilement,
la dernière page devient active même si elle est trop courte pour atteindre
la ligne centrale. La règle pure est dans `verticalPageTracking.js`.

Les positions sont mises en cache après montage, chargement d’image,
redimensionnement et transition des commandes. Un unique listener `load` en
capture et un `ResizeObserver` partagé suffisent ; aucun listener par image.
Le scroll passif est limité à une frame et une recherche binaire dans ce cache,
sans mesurer toutes les pages à chaque pixel. React n’est mis à jour que si le
numéro change. Le hook ne fait **jamais** `scrollTo`, `scrollIntoView` ou `goToPage`.
Seules les commandes volontaires continuent à utiliser `goToPage`.

Changer de langue, de mode ou de fullscreen nettoie puis recrée le suivi avec
les nouveaux éléments. Le compteur décrit la page réellement visible ; si deux
versions ont des hauteurs différentes, il suit leur géométrie réelle, sans
repositionnement forcé ni nouvelle association linguistique.

## Vérification locale

```text
node --test src/components/manga/*.test.mjs
node tests/public-production-time-browser.mjs --reader-navigation-only
npm run production-time:public-browser-test
npm run lint
npm run build
git diff --check
```

Le harness Chrome existant utilise un profil temporaire et des fixtures Vite en
mémoire, sans modifier de catalogue ou de média. Pour garder les captures,
définir `PUBLIC_PRODUCTION_CAPTURE_DIR`. Compléter par un essai sur Android
physique et Firefox : les gestes CDP ne remplacent pas tous les comportements
matériels d’un téléphone ou d’un pavé tactile. Le déplacement du curseur de
scroll natif Windows doit aussi être vérifié manuellement : son changement de
position est testé via `scrollTop`, mais son chrome natif n’est pas pilotable
fiablement par le harness headless.
