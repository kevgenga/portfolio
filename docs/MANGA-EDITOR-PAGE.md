# Manga Admin — éditeur local dédié

## Architecture et URL

L’ancienne grande modale utilisait déjà un seul module `manga-admin.js` pour le
catalogue et toutes les opérations. Le formulaire n’est plus un `<dialog>` : il
est maintenant une section d’une véritable page d’édition, sans limite de hauteur.

Le serveur local expose `/manga-edit.html?id=<ID du catalogue>`. Exemple :
`http://127.0.0.1:4174/manga-edit.html?id=legend-of-animiste` si cet ID existe.
Le lien « Modifier » construit toujours l’URL avec l’ID réel, sans supposer que
celui-ci est égal au slug. Les paramètres facultatifs `language` et `tab` décrivent
la langue et l’onglet ouverts. Ils sont actualisés avec `history.replaceState` :
les changements d’onglet ne polluent pas l’historique Retour/Avancer.

`mangas.html` est le **template unique** des deux pages locales. La route serveur
valide les paramètres, cherche l’ID exact dans le catalogue et adapte ce template.
Il n’existe donc pas deux formulaires concurrents à maintenir. Le tableau de bord
masqué n’effectue pas son chargement d’audit dans la page d’édition.

Les identifiants ne servent jamais de chemins de fichiers. Paramètres inconnus,
doublons, langues/onglets invalides et traversées sont refusés (400). Un projet
absent renvoie 404, avec un message explicite et un lien de retour. Aucune création
implicite. Une erreur réelle de lecture n’est pas masquée par des données fictives.

## Utilisation

- Cliquer sur « Modifier » ouvre la page locale dédiée. L’URL est partageable
  entre onglets du même poste et rechargeable directement.
- « ← Retour aux mangas » ramène au tableau de bord ; Retour/Avancer du navigateur
  naviguent entre de vrais documents.
- Les trois onglets et leurs commandes sont conservés. Les onglets restent
  accessibles en haut pendant le défilement. Le bouton Enregistrer est disponible
  en tête et en fin du formulaire ; il utilise le même gestionnaire de sauvegarde.
- Enregistrer conserve la page, l’onglet et la langue courants. Les informations
  et l’ordre restent des brouillons jusqu’à cet enregistrement. Les opérations
  immédiates (ajout, remplacement, duplication, suppression…) restent immédiates.
- « Annuler » abandonne explicitement les brouillons après confirmation et relit
  le catalogue ; il ne ferme plus une grande modale.
- « Vue cartes » / « Vue liste » modifie uniquement la présentation CSS des mêmes
  éléments. La préférence est stockée dans `localStorage`. Ordre, sélection,
  langue et saisies de temps ne sont pas réinitialisés.
- La sélection multiple, les groupes et la configuration des doubles pages sont
  accessibles avant la grille, sans devoir parcourir 150 cartes pour les atteindre.
- Un clic sur la miniature ouvre l’original dans un petit dialogue natif :
  proportions conservées, fermeture par × ou Échap, focus et scroll préservés.
- Les actions existantes sont réutilisées dans les deux vues. Glisser-déposer,
  boutons de déplacement et position numérique agissent sur le véritable ordre.
  Un défilement du document est ajouté près des bords pendant un glissement.

## Miniatures, notifications et brouillons

La nouvelle route de lecture `/api/manga-thumbnail/<chemin encodé>` produit une
miniature WebP de 240 × 320 maximum, dans un cache mémoire borné à 128 entrées.
Les dimensions originales sont conservées dans les informations affichées.
Les miniatures sont chargées paresseusement. Aucun fichier dérivé n’est écrit,
aucun original n’est converti ni renommé. L’original agrandi est demandé au clic.
Le rapport existant continue de lire les métadonnées des pages côté serveur.
Le décodeur reçoit un buffer, pas un chemin, afin de ne pas conserver un handle
image sur le fichier pendant la génération sous Windows.

Les confirmations secondaires (doubles pages, duplication, lots…) restent des
dialogues natifs. Le toast Manga est placé dans le dialogue ouvert, sinon dans
le document, afin de rester au premier plan même dans la top layer du navigateur.
Il reprend les messages et couleurs existants ; aucune erreur n’est supprimée.

Un brouillon par ID est conservé dans `sessionStorage`, donc dans l’onglet courant :
champs généraux, ordre de travail, langue, onglet, sélection et saisies de temps
global/page. Aucun brouillon n’est envoyé automatiquement au serveur.
Lors d’un rechargement, il est restauré seulement si la révision du catalogue est
identique. Sinon, l’éditeur est mis en attente avec un avertissement et permet de
télécharger le brouillon JSON ou de le supprimer. Il ne réapplique jamais un ordre
obsolète sur un catalogue modifié.

Le mécanisme `beforeunload` avertit pour les modifications, requêtes en cours,
fichiers à importer et dialogues secondaires ouverts. Le lien de retour utilise
une confirmation explicite et bloque une requête en cours. Une nouvelle session
de travail n’est jamais sauvegardée dans le catalogue par un simple changement
de vue, de langue ou d’onglet.

### Limites explicites

- Les navigateurs choisissent le texte et les conditions de l’alerte native
  avant fermeture/rechargement ; une interaction préalable est souvent nécessaire.
- La récupération est locale à l’onglet, pas un stockage durable ou une sauvegarde
  de catalogue. Fermer définitivement l’onglet ou effacer son stockage peut la
  supprimer. Si le stockage est indisponible, un avertissement est affiché.
- Les fichiers binaires sélectionnés pour import et les formulaires des petites
  confirmations ne sont pas restaurés après navigation : l’avertissement le
  signale. Ils restent intacts lors d’un simple changement cartes/liste.
- Le glisser-déposer HTML natif dépend du navigateur et du matériel tactile.
  Les commandes de déplacement et de position numérique restent disponibles.
- Pas de virtualisation complexe. Pour des milliers de pages, réévaluer le coût
  du rapport serveur et le nombre d’éléments DOM.

## Sécurité et publication

Le serveur Admin écoute toujours exclusivement sur `127.0.0.1`. Le Host doit être
exactement `127.0.0.1:PORT` ou `localhost:PORT`. Une origine étrangère ou une requête
Fetch Metadata `cross-site` est refusée, y compris avant les routes de lecture.
Les nouveaux chemins image réutilisent les contrôles existants de confinement,
d’existence et de refus des liens de répertoire/fichiers. La page d’édition est
non indexable et interdit son intégration dans une iframe (`X-Frame-Options: DENY`).

Les écritures conservent les contrôles de révision, validations, transactions,
sauvegardes et rollbacks existants. Aucun moteur métier n’a été recréé.

Le build Vite n’importe aucun module Admin. Les outils résident sous
`tools/artwork-admin/`, **hors** du répertoire Vite `public/`. Après build,
`dist/` ne contient ni page Admin, ni script d’édition, ni API d’écriture.
Le workflow `.github/workflows/deploy.yml` publie exclusivement `dist/` ; la
commande `gh-pages` utilise aussi `dist`. Aucun déploiement effectué pendant cette
intervention. Le serveur de développement Vite (`host: true`) n’est pas le serveur
Admin : ne pas exposer un environnement de développement sur Internet.

Aucune configuration Vercel n’est présente dans ce dépôt. Pour une publication
future : framework Vite, build `npm run build`, output `dist` uniquement, aucun
démarrage ni routage vers `tools/artwork-admin/server.mjs`. La configuration réelle
d’un compte Vercel distant n’a pas été vérifiée.

L’API publique GitHub confirme que `kevgenga/portfolio` est un dépôt **public**.
71 fichiers de `tools/artwork-admin` sont déjà suivis par Git dans le checkout.
Leur code peut donc être visible si publié dans le dépôt, sans pour autant rendre
le service local accessible. `.gitignore` ne protège pas ces fichiers suivis.
Aucun fichier suivi n’a été retiré ou ignoré artificiellement. Cette intervention
ne constitue pas un audit des secrets de tout l’historique Git.

## Réglages CSS

`tools/artwork-admin/public/modules/mangas/manga-editor-page.css` :

- Ligne définissant `--manga-page-card-min` : largeur minimum des cartes (160 px).
- `--manga-page-gap` : espacement entre cartes (12 px).
- Breakpoint 480 px : minimum 120 px / espacement 8 px sur petits écrans.
- Sélecteurs `[data-view="list"]` : colonnes et dimensions des miniatures en liste.
- `.manga-editor-form` / `#manga-editor-shell` : padding du formulaire et de la page.
- `.manga-image-dialog` : taille de l’aperçu agrandi.

Les styles existants des confirmations restent dans `manga-admin.css` et
`styles.css`. Aucun style du Manga Reader public n’est modifié.

## Fichiers de cette intervention

Créés :

- `tools/artwork-admin/manga/editor-page.mjs` : route HTML dédiée, validation URL.
- `tools/artwork-admin/public/modules/mangas/editor-session.js` : récupération locale.
- `tools/artwork-admin/public/modules/mangas/manga-editor-page.css` : page et deux vues.
- `tools/artwork-admin/tests/manga-editor-browser.mjs` : test isolé 150 pages/HTTP/UI.
- `docs/MANGA-EDITOR-PAGE.md` : architecture, utilisation, sécurité et limites.

Modifiés :

- `tools/artwork-admin/server.mjs` : raccordement de la page, Host/Fetch Metadata.
- `tools/artwork-admin/manga/routes.mjs` : endpoint de miniature en lecture seule.
- `tools/artwork-admin/manga/service.mjs` : miniatures en mémoire, cache borné.
- `tools/artwork-admin/public/mangas.html` : template unique, section à la place
  du dialogue principal, navigation, sélecteur de vue, aperçu secondaire.
- `tools/artwork-admin/public/modules/mangas/manga-admin.js` : navigation réelle,
  réemploi des handlers, présentation, aperçu, notifications, brouillons, reprise
  explicite d’une intégration depuis l’audit dans la nouvelle page.
- `tools/artwork-admin/public/modules/mangas/manga-admin.css` : retrait de la
  géométrie devenue inutile de l’ancienne modale principale.
- `tools/artwork-admin/public/modules/mangas/production-time-ui.js` : capture et
  restauration du brouillon de durée, sans changement des opérations serveur.
- `tools/artwork-admin/public/production-batch-ui.js` : méthode additive de
  restauration des sélections ; comportement des autres Admin inchangé.
- `tools/artwork-admin/tests/manga-production-fixture.mjs` : effectifs configurables
  de pages fictives, sans changement des fixtures par défaut.
- `tools/artwork-admin/tests/manga-reorder-page.test.mjs` : assertions adaptées au
  maintien de l’éditeur après sauvegarde/annulation ; vérifications métier gardées.
- `tools/artwork-admin/tests/manga-production-browser.mjs` : nouvelle navigation
  et abandon explicite d’un brouillon que l’ancien test supposait perdu.
- `tools/artwork-admin/tests/production-groups-browser.mjs` : navigation entre
  vrais documents, isolation des sélections entre mangas.
- `package.json` : commande supplémentaire `manga-editor:browser-test`.

## Validation

Tests d’écriture exclusivement dans des fixtures temporaires, jamais sur le
catalogue ou les médias réels. Comparaison SHA-256 avant/après sur les fichiers
du projet : aucun changement dans `src/`, `public/assets/mangaka`, les catalogues
ou le Reader public pendant cette intervention.

- `npm run manga-admin:test` : intégration + 123 tests réussis.
- `npm run artwork-admin:test` : intégration et Production Time réussis.
- `npm run animation-admin:test` : intégration et 6 tests réussis.
- `npm run media-audit:test` : 9 tests réussis.
- `npm run production-groups:test` : 24 tests réussis.
- `npm run manga-editor:browser-test` : Chrome headless réel, 150 pages, URL/F5,
  Host/Origin, erreurs 400/404, miniatures, sélection, ordres, brouillons et conflit,
  aperçu/Échap/scroll, DnD/défilement, retour/avancer, deux projets isolés,
  vues cartes/liste et trois onglets à 320/375/390/430/768/1024/1440/1920 px,
  hauteurs 540 et 900 px. Aucun média original de fixture altéré.
- `npm run manga-production:browser-test` : durées, langues, correspondances,
  doubles pages et erreurs/conflits réussis dans le nouvel éditeur.
- `npm run production-groups:browser-test` : Artwork/Manga, groupes, lots,
  touch/clavier/Échap, API et conservation des données réussis.
- `npm run production-time:browser-test` : régression Artwork réussie.
  Il signale toujours un débordement ancien de 4 px dans sa navigation mobile,
  extérieur à cette modification Manga.
- `npm run lint`, `npm run build`, `git diff --check`.

L’interface Admin est sombre uniquement ; aucun thème public n’est impliqué.
Les essais responsive sont des tests de viewport navigateur, pas une validation
sur appareil Android/iOS physique. Firefox tactile n’a pas été testé ici.
