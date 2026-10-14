# Audit ciblé de lisibilité — 14 octobre 2026

Projet : `D:\v2\mon-portfolio`. Aucun redesign, ajout de dépendance, téléchargement de police, commit, push ou déploiement.

## Constats et corrections

Les neuf captures évoquées dans la demande n'étaient pas accessibles. Les constats ci-dessous proviennent des styles existants, des mesures dans Chromium et de nos propres captures, pas de ces images.

**Contact.** Le titre utilisait `clamp(4rem, 9vw, 8.5rem)` : sa taille dépendait du viewport, pas de sa colonne. `overflow: hidden` masquait les débordements. L'interligne latin de `0.8` produisait des rectangles de texte superposés. En japonais, la même taille géante transformait la phrase en une colonne de caractères.

Correction : conteneur CSS `inline-size`, taille en `cqi`, mots latins complets sur des lignes séparées, interligne latin `1.25`. FR utilise `14cqi`, EN `18cqi`. JA utilise `clamp(1.75rem, 10cqi, 3.4rem)`, interligne `1.45`, règles japonaises et une coupure sémantique entre « 一緒に作品を » et « つくりましょう。 ». Le texte n'est pas reformulé. Seule la décoration est clippée, jamais le titre. La grille, les champs et toute la logique d'envoi sont conservés.

Mesures à 1024px, thème clair, Chromium Windows :

| Titre | Avant | Après |
| --- | --- | --- |
| EN | 92,16px ; interligne 0,8 ; débordement | ≈42,90px ; interligne 1,25 ; 3 lignes entières |
| FR | 92,16px ; « TRAVAILLONS » hors colonne | ≈33,37px ; 2 mots entiers sur 2 lignes |
| JA | 92,16px ; titre ≈742px de haut / 7 lignes | 28px ; 2 lignes ; ≈81px de haut |

En JA, le titre reste sur deux lignes desktop ; trois lignes au plus à 320px. À 1920px : ≈45,84px, contre 136px avant. La hauteur de la colonne ne dépend plus d'un titre excessivement long.

**Textes japonais.** Les petites valeurs latines en `rem` étaient reprises sans adaptation à la densité des glyphes. Corrections limitées aux textes informatifs concernés :

| Texte | Avant | Après |
| --- | --- | --- |
| Descriptions des cartes Hero | 10,08px | EN/FR 13px ; JA 13,5px / interligne 1,6 |
| Titres des cartes Hero | 11,52–11,84px | EN/FR 13px ; JA 14px |
| Résumé du profil JA | 12,8px | 16px / interligne 1,8 |
| Descriptions manga JA | 14px | 16px / interligne 1,8 |
| Métadonnées, éditions et nombre de pages manga | 9,92–10,4px | 13px |
| Filtres / compteurs Illustration | 10,56 / 9,92px | 14 / 13px |
| Navigation, disponibilité, CTA, labels Contact JA | souvent 10–12px | 14px, espacement adapté |
| Footer JA : badges, navigation, période, copyright | principalement 12px | 14px / interligne 1,65 |
| Reader JA : commandes, tutoriel et compteur | 10–12px | 14px ; libellé du menu 13px |
| Petites légendes de récompenses JA | 9,92px | 13px ; titre japonais du seal 20px / interligne 1,3 |

Les descriptions courantes et les paragraphes JA concernés passent à 16px. Les titres officiels latins et les noms propres ne sont pas remplacés. Aucun changement dans les données artistiques.

**Compromis Hero.** Pour conserver les cadres, leurs hauteurs totales, l'angle, les largeurs et l'expansion, seules les légendes passent de 112px desktop/tablette et 104px mobile à 124px, ou 132px en JA. La partie image cède donc un peu de hauteur. Les descriptions restent limitées à deux lignes au repos ; elles peuvent défiler dans leur zone au focus/survol si la colonne est étroite. Les originaux, cadrages, liens, opacités et animations restent identiques.

**Wrapping.** Le badge de pagination des cartes manga peut passer à la ligne au lieu de comprimer le titre. Les mots des titres ne sont plus découpés par `overflow-wrap: anywhere`. Le grand titre Illustration latin sur mobile est adapté à la largeur réelle de son bloc avec `cqi`, plutôt que coupé au milieu du mot. Les polices d'affichage latines restent utilisées.

## Polices et contrastes

La pile JA privilégie **Noto Sans JP / Noto Sans CJK JP déjà installées**, puis Yu Gothic, Hiragino, Meiryo et sans-serif. Chromium a confirmé via `CSS.getPlatformFontsForNode` **Noto Sans JP**, `isCustomFont: false`, pour les glyphes japonais du titre Contact ; **Impact** pour EN/FR. Aucun fichier de police réseau n'a été ajouté. Les fallbacks des autres systèmes restent à vérifier sur ces systèmes réels.

Les couleurs sont lues dans le navigateur et compositées avec leurs opacités et fonds. Critères : texte normal 4,5:1, réellement grand 3:1, conformément au [critère WCAG de contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Le défaut confirmé était surtout l'opacité `0.6` des compteurs de filtres inactifs. Elle est retirée ; le compteur reste discret par sa taille légèrement inférieure, sans badge supplémentaire.

| Compteur inactif | Avant | Après |
| --- | --- | --- |
| Clair : gris sur crème | ≈2,51:1 | ≈5,65:1 |
| Sombre : gris clair sur presque noir | ≈4,00:1 | ≈9,28:1 |

Les compteurs actifs atteignent environ 16,7–17:1. Les gris existants des descriptions manga passent déjà les seuils mesurés : ils ne sont pas remplacés arbitrairement par du noir. Pas de modification des couleurs jaune/noir/bleu des récompenses. Ce contrôle des textes sélectionnés n'est pas une certification d'accessibilité de tout le site ou des images.

## Internationalisation

Audit des dictionnaires EN/FR/JA, des composants publics, des traductions de contenu, de la navigation, du formulaire et des contrôles Fancybox/Reader.

Corrections réelles :

- Reader : les deux régions accessibles « `<titre> vertical reader` » / « `<titre> horizontal reader` » étaient en anglais ; elles utilisent maintenant les nouvelles fonctions i18n `verticalReader` / `horizontalReader`.
- Lightbox : « Toggle zoom level » restait en anglais malgré les autres boutons traduits. Ajout des clés réellement utilisées par Panzoom (`TOGGLEZOOM`, `TOGGLE1TO1`, `ITERATEZOOM`) : FR « Activer ou désactiver le zoom », JA « 拡大・縮小 ».
- Miniatures : « Go to slide #N » devient FR « Afficher l’image N », JA « N枚目の画像を表示 », via `GOTO`. Les options sont transmises aux sous-composants sans changer leur comportement.
- Contact JA : uniquement un saut de ligne sémantique dans la même formulation ; aucun autre texte éditorial japonais n'est réécrit.

L'adresse `contact.successEmail` est volontairement héritée du dictionnaire partagé, pas une traduction manquante. Les titres officiels, logiciels, marques, noms natifs des langues des pages et métadonnées artistiques libres restent inchangés. Les alt artistiques existants peuvent encore contenir des noms internes ou du texte non traduit : les réécrire exigerait un travail éditorial séparé sur le catalogue, exclu ici. Les labels des honeypots anglais sont invisibles et `aria-hidden`, conservés avec la protection anti-spam. Elfsight reste un service tiers : son contenu interne n'est pas traduit par notre code.

## Validation et limites

Matrice Chromium du build sous `/portfolio/` : **216 cas**, soit 3 langues × 2 thèmes × 9 largeurs × 4 routes (Home, Manga, Illustration, Contact), avec le Footer partagé. Largeurs : 320, 375, 390, 430, 768, 1024, 1280, 1440, 1920px. Le rapport inclut le viewport demandé et la largeur utile après la barre de défilement.

Contrôles : rectangles des textes avec `Range`, limites internes des colonnes, ancêtres qui clippent, chevauchement des lignes Contact, mots latins coupés, tailles calculées, familles, contrastes et débordement horizontal. Les descriptions volontairement tronquées sont distinguées des titres. Plus de **13 800 échantillons de texte mesurés**, y compris les textes locaux de présentation/chargement Instagram. Résultat : aucun défaut détecté sur ces contrôles et cibles dans la matrice finale ; titres Contact sur trois lignes au plus. Les animations d'entrée sont amenées à leur état final **dans le test uniquement** pour éviter de confondre une opacité d'entrée nulle et un mauvais contraste permanent.

Passage supplémentaire en temps réel : captures Contact EN/FR/JA, Home, Manga, Illustration, Footer, menus mobiles, lightbox et Reader ; une seule lightbox, libellés de zoom/miniatures traduits, bascule des deux modes Reader. Contrôles existants Hero, changement de langue sans rechargement, navigation/liens/retour et Footer conservés. Captures et observations : `C:\Users\kev\AppData\Local\Temp\kevgenga-readability-20261014\`. Certaines vues isolent les sections uniquement pour la capture de test.

Tests techniques : `npm run lint`, `npm run build`, `git diff --check`, `npm run contact-form:test` (21 tests), tests i18n/Footer/Hero/filtres/gestes Reader/typographie (33 tests), plus le script navigateur existant et sa matrice typographique. La suite navigateur existante passe aussi : **66 cas Home, 120 expansions au focus, 285 contrôles du Footer**, navigation et langues. Quatre nouveaux tests de non-régression couvrent le titre Contact, les règles typographiques, les labels accessibles et la conservation des options lightbox.

Le formulaire n'a envoyé aucun message réel. Les sources artistiques et les services Contact sont restés inchangés par rapport à l'état du dossier au début de l'audit. Le Reader ne change que deux attributs ARIA dans son JSX ; sa logique est identique. Aucun code d'administration n'est modifié (uniquement des fichiers de tests hébergés dans son répertoire).

Limites : tests Chromium Windows, pas de téléphone tactile physique, Safari/iOS/macOS/Android ni Firefox. Zoom natif 125/150/200% non testé : les tests de largeur ne sont pas présentés comme un équivalent. Services externes bloqués pendant la QA : état réel d'Elfsight et effets de son chargement à contrôler séparément. Les captures sont représentatives, pas une inspection visuelle individuelle de chaque combinaison de la matrice. Vérification finale conseillée sur vos appareils, avec zoom réel et widgets chargés.

## Fichiers concernés par cette intervention

Sources publiques :

- `src/index.css` : règles ciblées de tailles, interlignes, fonts, wrapping et Contact.
- `src/components/about/HeroArtworkCards.css` : textes et réserve des légendes seulement.
- `src/pages/ContactPage.jsx` : affichage du titre latin par mots ; aucune modification des handlers.
- `src/components/gallery/FilterBar.jsx` : classe dédiée au compteur, sans opacité faible.
- `src/components/gallery/Lightbox.jsx` : traductions des contrôles internes.
- `src/components/manga/MangaReader.jsx` : deux attributs ARIA localisés, rien d'autre.
- `src/content/ui.js` : deux fonctions de libellés Reader EN.
- `src/i18n/translations/fr.js` et `ja.js` : libellés Reader/lightbox et saut de ligne Contact JA.

Tests et documentation :

- Nouveau `src/utils/publicTypography.test.mjs`.
- Nouveau `tools/artwork-admin/tests/typography-harness.html`.
- `tools/artwork-admin/tests/public-home-browser.mjs` : extension de la QA existante, polices réellement rendues et captures.
- `docs/HOME-HERO-CARDS.md` : valeurs des légendes mises à jour.
- Nouveau présent rapport.

Aucun fichier supprimé. Les autres modifications déjà présentes dans le dossier sont conservées et ne sont pas attribuées à cet audit.
