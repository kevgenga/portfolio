# Refonte ciblée manga — 13 octobre 2026

Projet : `D:\v2\mon-portfolio`. React/Vite et GitHub Pages conservés. Aucun commit, push ou déploiement.

## Nouvelle hiérarchie

1. Hero : KEVGENGA, Mangaka / Manga Artist / Manga Assistant, expérience et localisation existantes, recherche de missions manga au Japon et à l’international, disponibilité, CTA vers les mangas et travaux.
2. Selected Manga : Legend of Animiste, Stubborn love, Ahès. Titres, images, résumés, nombre de pages et routes proviennent du catalogue existant. Les titres officiels ne sont pas réécrits.
3. Selected Work : grandes cartes Character Design, Backgrounds et Illustrations, avec texte court, numérotation et interaction existante.
4. Recognition, expérience/compétences, outils, Instagram : conservés et renumérotés. La compétence Animation reste complémentaire et dépend du toggle public.

Le bandeau bleu, le noir/blanc/jaune, les fontes, les bordures et les thèmes existants sont conservés. Le CSS nouveau est limité aux classes de la Home ; les cartes de `/mangaka` conservent leur présentation.

## Sources de vérité et images

`sitePresentation.js` stocke seulement des références éditoriales déterministes (slugs et IDs), ainsi que le booléen de visibilité Animation. Les champs artistiques restent dans `mangas.js` et `artworks.js`.

| Usage | ID du catalogue | Fichier existant | Choix |
| --- | --- | --- | --- |
| Hero + Character Design | `chara-design-forgeron-v2` | `assets/illustration/character-design/chara-design_forgeron-v2.jpg` | Fiche montrant silhouette, poses, expressions et couleur |
| Hero + Backgrounds | `bg-2` | `assets/illustration/backgrounds/bg-2.jpeg` | Décor encré, profondeur et perspective |
| Illustrations | `illustration44-2` | `assets/illustration/illustrations/Illustration44-2.jpg` | Action dynamique, énergie et composition manga |

Les images ont été inspectées avant sélection. Aucune sélection aléatoire ni nouvelle œuvre featured. Si une œuvre représentative ou sa catégorie est masquée dans Artwork Admin, sa carte Home n’expose pas cette œuvre.

Les mangas utilisent le même `MangaCard` que la page Manga, avec le helper existant `getMangaCardImage` : banner canonique, cover en fallback. Les projets privés sont exclus. Les descriptions traduites déjà présentes sont réutilisées.

### Navigation de catégories

Les cartes et visuels du hero utilisent les liens React Router suivants, préfixés automatiquement par le basename :

- `/illustration?category=character-design`
- `/illustration?category=backgrounds`
- `/illustration?category=illustrations`

La galerie utilise son même filtrage, tri, compteur, pagination progressive et lightbox. Le paramètre URL devient la source du filtre ; les changements de filtre conservent les autres paramètres, dont `lang`. Une valeur inconnue, featured indisponible ou catégorie masquée revient à Illustrations, ou All si Illustrations est masquée. Aucun chemin public existant supprimé.

## Toggle Animation

Emplacement : Animation Admin, au-dessus de l’audit médias et de la galerie.

- Source : `sitePresentation.showAnimationSection`, initialisée à **false** pour cette version orientée manga.
- API locale : GET / PUT `/api/animation-presentation-settings`.
- Une confirmation précède l’écriture. Le bouton affiche l’état réel lu sur disque, pas une valeur fictive.
- Backup horodaté unique de `sitePresentation.js` dans le runtime Admin, sous `backups/animations`, puis écriture atomique et relecture.
- Le helper `presentation-settings.mjs` reprend et centralise le mécanisme existant des Storyboards. Manga Admin utilise ce même helper pour sa configuration existante : aucune migration de son fichier, aucune modification CRUD.
- OFF : retrait des liens Navbar desktop/mobile, Footer, du groupe complémentaire 2D/Motion de la Home et de la mention Animation parmi les services Contact. `/animation` redirige vers `/`.
- ON : liens, compétences complémentaires et galerie Animation reviennent automatiquement. Le hero reste volontairement orienté manga.
- Prévisualisation locale : `?adminPreview=1` fonctionne seulement avec Vite en développement, suivant la philosophie Storyboards ; ce paramètre ne contourne pas le masquage dans le build publié.
- Les animations, MP4, GIF, posters, catégories et données ne sont ni supprimés ni modifiés.
- Le site publié reste statique : le toggle prend effet sur GitHub Pages au prochain build/déploiement effectué par le propriétaire. Rien n’a été publié ici.

## Internationalisation

EN reste dans `src/content/ui.js`, JA et FR dans leurs fichiers de traduction existants. Le système i18n et les langues des pages manga ne sont pas modifiés.

Nouvelles clés dans `home` :

- `viewManga`, `viewWorks`
- `selectedMangaLabel`, `selectedMangaNote`, `selectedMangaTitle`, `allManga`
- `workAlt(category)`
- `workDescriptions.character-design`, `workDescriptions.backgrounds`, `workDescriptions.illustrations`

Clés existantes adaptées : `home.artworkLabel/artworkNote/artworkTitle`, `footer.role`, les rôles, le résumé et la disponibilité du profil. Les métadonnées HTML et le titre anglais de l’accueil reprennent l’orientation manga.

JA utilise notamment « 漫画家 / マンガ制作 / 漫画アシスタント », « オリジナルマンガ », « マンガ制作を支える技術 ». Pas d’import de police externe ; stack japonaise existante conservée. Les récompenses, résumés et traductions du Reader restent inchangés.

## Performance et responsive

- Une seule image prioritaire/eager dans le hero ; seconde image et cartes lazy. `decoding="async"` conservé.
- Les deux visuels du hero sont réutilisés dans Selected Work : mêmes URL, cache navigateur partagé.
- Environ **0,79 Mo** pour les deux images du hero, contre **1,73 Mo** pour l’ancien grand visuel.
- Six images uniques de présentation Home : environ **4,08 Mo**, contre **4,15 Mo** pour les quatre anciennes images. Ce sont les tailles des fichiers, pas une mesure Lighthouse ni une garantie de téléchargement différé identique sur tous les navigateurs.
- Aucun nouveau lecteur vidéo, aucune conversion/compression d’original, aucune dépendance ajoutée.
- Cartes manga : trois colonnes sur tablette/desktop, une liste image/texte sur mobile. Le badge de pages se place sous le titre sur la Home pour éviter les titres fragmentés sur tablette.
- Cartes catégories : trois colonnes desktop/tablette, une colonne mobile.
- Le hero conserve les CTA accessibles et un bandeau bleu plus compact. Les caractères japonais restent pris en charge par les fontes existantes.

## Tests exécutés

| Validation | Résultat |
| --- | --- |
| `npm run lint` | Réussi, aucune erreur |
| `npm run build` | Réussi, 497 modules, aucun warning Vite important |
| `git diff --check` | Réussi ; uniquement notifications Git habituelles LF→CRLF |
| `npm run manga-admin:test` | Intégration + 92 tests réussis |
| `npm run animation-admin:test` | Intégration + 6 nouveaux tests de présentation réussis |
| `npm run artwork-admin:test` | Intégration réussie |
| `npm run media-audit:test` | 9 tests réussis |
| `npm run contact-form:test` | 21 tests réussis, aucun envoi réel |
| `node --test src/i18n/locale.test.mjs src/utils/illustrationFilters.test.mjs` | 6 i18n + 3 filtre/visibilité réussis |
| `node --test src/components/manga/readerGestures.test.mjs` | 13 tests réussis ; aucun changement Reader |
| `node tools/artwork-admin/tests/public-home-browser.mjs` après build | 36 combinaisons de rendu réussies + routes et filtres |

Le test Chromium isolé vérifie **EN / JA / FR × light / dark × 375 / 390 / 768 / 1366 / 1440 / 1920 px** : largeur réelle des iframes, absence de débordement horizontal, 3 mangas, 3 cartes catégories, images du hero chargées, absence de liens Animation et menu mobile. Il exerce aussi Backgrounds → All et la redirection Animation masquée, même avec `adminPreview=1` sur le build de production.

Les tests React des liens vérifient OFF et ON pour Navbar desktop/mobile et Footer dans les trois langues. Le toggle Admin est testé avec confirmation, relecture après redémarrage, refus de valeurs invalides, sauvegardes, concurrence et échec d’écriture.

Les captures facultatives du test (`HOME_QA_CAPTURE_DIR`) servent à inspecter le layout : animations figées et sections isolées si nécessaire, sans modifier le code public. Elles ne constituent pas un test des animations en temps réel. Aucun navigateur utilisateur connecté n’a été manipulé ; les profils Chromium et les mutations Admin de test sont temporaires.

### Intégrité vérifiée

Empreintes SHA-256 identiques avant/après pour les **968 fichiers de `public/assets`**, `mangas.js`, `artworks.js`, `animations.js`, `mangaPresentation.js` et `MangaReader.jsx`. Aucun média réel déplacé, renommé, supprimé ou transformé. Aucune langue manga ni position de page modifiée.

## Fichiers modifiés

### Présentation publique

- `index.html` : métadonnées orientées manga.
- `src/App.jsx` : titre d’accueil et garde simple Animation.
- `src/Footer.jsx`, `src/components/Navbar.jsx` : visibilité du lien Animation sans modifier le menu responsive.
- `src/components/about/ArtworkStrip.jsx` : variante cartes catégories et descriptions.
- `src/content/profile.js` : positionnement professionnel manga.
- `src/content/sitePresentation.js` : sélection par références stables et toggle ; anciennes références hero/showcase remplacées, médias conservés.
- `src/content/ui.js`, `src/i18n/translations/fr.js`, `src/i18n/translations/ja.js` : nouveaux textes et positionnement traduit.
- `src/index.css` : styles Home scopés et responsive.
- `src/pages/ContactPage.jsx` : visibilité de la seule mention de service Animation ; formulaire inchangé.
- `src/pages/HomePage.jsx` : nouvelle hiérarchie, sélection et CTA.
- `src/pages/Illustration.jsx` : filtre URL réutilisant le système actuel.
- `src/pages/Mangaka.jsx` : utilise le composant carte extrait, rendu conservé.

### Admin / tests

- `package.json` : ajoute les tests de visibilité à `animation-admin:test`.
- `tools/artwork-admin/animation/routes.mjs`, `animation/service.mjs` : expose le toggle local.
- `tools/artwork-admin/manga/service.mjs` : utilise le helper de configuration commun ; CRUD inchangé.
- `tools/artwork-admin/public/animations.html`, `public/modules/animations/animation-admin.js` : panneau de visibilité et aperçu local ; correction des anciennes indications Home devenues obsolètes.
- `tools/artwork-admin/tests/animation-integration.mjs`, `manga-integration.mjs` : assertions adaptées aux cartes partagées et à la nouvelle Home. Les tests CRUD ne sont pas supprimés.

## Fichiers créés

- `src/components/manga/MangaCard.jsx`
- `src/utils/illustrationFilters.js`
- `src/utils/illustrationFilters.test.mjs`
- `tools/artwork-admin/presentation-settings.mjs`
- `tools/artwork-admin/tests/presentation-settings.test.mjs`
- `tools/artwork-admin/tests/public-home-browser.mjs`
- Ce compte rendu.

## Examen local recommandé

1. Redémarrer `npm run artwork-admin`, ouvrir Animation Admin et vérifier le nouveau toggle.
2. Lancer `npm run dev`, ouvrir `/portfolio/`, examiner la sélection éditoriale dans les trois langues.
3. Réactiver/désactiver Animation : vérifier liens et route ; l’aperçu Admin utilise la dérogation locale de développement.
4. Examiner Instagram réellement chargé : les scripts externes sont neutralisés dans le test de rendu pour éviter télémétrie/réseau tiers. Le widget n’a pas été modifié.
5. Vérifier les animations au défilement et les téléchargements sur une connexion lente / un vrai mobile. Le Reader est inchangé et ses tests passent, mais ses gestes/fullscreen n’ont pas été retestés manuellement sur appareil physique pendant cette refonte.

Pour changer plus tard la sélection, modifier seulement les IDs/slugs de `sitePresentation.js`. La visibilité Animation reste indépendante de cette sélection.
