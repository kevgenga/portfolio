# Manga Admin

Lancer l’outil local avec `npm run artwork-admin`, puis ouvrir `http://127.0.0.1:4174/mangas.html`.

Le catalogue reste `src/content/mangas.js`. Les médias restent sous `public/assets/mangaka/`. Les écritures sont explicites, sauvegardées et atomiques. Les anciennes images et les mangas supprimés sont déplacés sous `tools/artwork-admin/trash/mangas/`.

## Image de la carte Manga

Le champ canonique est `banner`. Le site public et Manga Admin résolvent tous deux cette image avec l’utilitaire partagé `getMangaCardMedia` : `banner` est prioritaire et `cover` reste un fallback compatible pour les anciens mangas. Elle est affichée dans les cartes de `/portfolio/mangaka` avec un cadre CSS vertical `3:4`, `object-fit: cover` et une position centrée. `thumbnail` et `presentation` n’ont aucun consommateur public manga : ils sont dépréciés et masqués dans Manga Admin, sans être supprimés des anciennes entrées.

Politique Photoshop, au ratio vertical **3:4** :

- taille idéale : **900 × 1200 px** ;
- haute qualité : **1200 × 1600 px** ou davantage ;
- qualité correcte : **750 × 1000 px** ou davantage ;
- minimum acceptable : **600 × 800 px**.

Le ratio est conforme jusqu’à 2 % d’écart, déclenche un avertissement de recadrage entre plus de 2 % et 8 %, puis devient incorrect au-delà de 8 %. La résolution et le ratio sont toujours évalués séparément.

Gardez les visages, textes et éléments importants dans la zone centrale : `object-fit: cover` avec une position centrale peut rogner les bords. Le chemin conseillé est `public/assets/mangaka/<slug>/`.

Exemple — Legend of Animiste : sa `banner` actuelle de 800 × 1131 px reste conservée. Manga Admin indique séparément la résolution et le léger écart avec le ratio 3:4, sans modifier le média.

Le remplacement crée une sauvegarde de `mangas.js`, installe la nouvelle `banner`, déplace l’ancienne bannière dans la corbeille si elle n’est pas partagée, met à jour le chemin et restaure l’ensemble en cas d’erreur. Les anciennes valeurs `cover`, `thumbnail` et `presentation` ne sont pas migrées automatiquement ; leur suppression éventuelle devra faire l’objet d’une migration séparée.

Les sauvegardes manga sont créées sous `tools/artwork-admin/backups/mangas/` avant chaque mutation. Pour une restauration manuelle, arrêter le serveur, recopier la sauvegarde choisie vers `src/content/mangas.js`, puis restaurer les fichiers correspondants depuis la corbeille en respectant les chemins du manifeste ou du catalogue sauvegardé.

`orig` représente une version originale, y compris un manga silencieux. La clé historique `original` reste lisible et n’est pas migrée automatiquement.

Le réordre modifie uniquement le tableau `pages`. Il ne renomme jamais les fichiers. La renumérotation physique et la duplication avancée sont volontairement reportées jusqu’à une version transactionnelle dédiée. La prévisualisation ouvre le lecteur Vite enregistré ; les modifications non sauvegardées ne sont pas injectées dans le lecteur.

Tests : `npm run manga-admin:test`.
