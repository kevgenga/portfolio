# Animation Admin

Animation Admin est le module local de **KEVGENGA Portfolio Admin** consacré à `src/content/animations.js`. Il utilise le même serveur Node local que Artwork Admin et Manga Admin. Aucun code d’administration n’est importé par le portfolio Vite.

## Lancement

```bash
npm run artwork-admin
```

Ouvrir ensuite `http://127.0.0.1:4174/animations.html`.

Tests isolés :

```bash
npm run animation-admin:test
```

Les tests créent un projet temporaire et ne modifient ni le catalogue ni les médias réels.

## Structure du catalogue

Le module conserve la structure réellement utilisée :

- `id` : identifiant unique ;
- `title` : titre interne ;
- `video` : chemin du média principal sous `assets/animation/` ;
- `poster` : chemin facultatif sous `assets/animation/miniature/` ;
- `category` : catégorie publique unique ;
- `duration` : durée existante, actuellement `null` ;
- `date` : date interne normalisée en `YYYY-MM-DD` ;
- `year` : calculé depuis la date ;
- `alt` : texte alternatif ;
- `featured` : sélection éditoriale ;
- `type` : `video` pour MP4/WebM, `image` pour les images et GIF.

L’ordre du tableau est l’ordre du catalogue. La première animation fournit actuellement `animations[0].poster` à la carte Animation de la page d’accueil. L’Admin refuse donc toute opération qui laisserait cette première entrée sans poster.

## Catégories

- `court-métrage` — Short Film dans l’interface publique ;
- `animation 2d` — 2D Animation ;
- `animation 3d` — 3D Animation.

Le module refuse les catégories inconnues.

## Formats

Médias acceptés : MP4, WebM, GIF, JPEG, PNG, WebP et AVIF. Les signatures binaires sont contrôlées afin de refuser les faux fichiers renommés.

Posters acceptés : JPEG, PNG, WebP et AVIF. Une vidéo doit avoir un poster. Pour une image ou un GIF, le média peut être utilisé directement sans copie physique supplémentaire.

Les vidéos et GIF sont conservés sans recompression. Animation Admin n’intègre pas FFmpeg et ne crée pas automatiquement de capture vidéo. La durée et les dimensions vidéo sont lues par le lecteur HTML5 dans l’interface lorsqu’elles sont disponibles, mais ne sont pas ajoutées automatiquement au catalogue. Le serveur local diffuse les vidéos avec prise en charge des requêtes HTTP Range afin de permettre la lecture et le déplacement dans les fichiers volumineux.

## Créer une animation

1. Cliquer sur **Ajouter une animation**.
2. Déposer ou sélectionner le média.
3. Ajouter un poster si le média est une vidéo.
4. Saisir le titre, la date et la catégorie. Le texte alternatif reprend le titre par défaut ; cocher **Personnaliser le texte alternatif** uniquement lorsqu’une description différente est utile.
5. Vérifier les aperçus et confirmer.

L’interface demande `DD-MM-YYYY`, comme Artwork Admin. La date est validée comme date calendaire puis convertie à la frontière serveur vers le format canonique `YYYY-MM-DD` déjà utilisé par `animations.js` ; `year` est recalculé. Les données existantes ne sont pas migrées.

La compression facultative concerne uniquement le poster. Elle est désactivée par défaut, n’agrandit pas les images et utilise Sharp.

## Modifier

La fenêtre d’édition contient trois onglets : **Informations**, **Média** et **Poster**. Les métadonnées ne sont enregistrées qu’après validation explicite du formulaire.

Le champ **Ordre interne du catalogue** modifie l’ordre du tableau sans créer de champ `order` inutile. Cet ordre est indépendant du tri public par date ; la position 1 continue de fournir le poster de la carte Animation sur l’accueil.

## Remplacer un média ou un poster

Le remplacement montre l’ancien et le nouveau fichier, leurs aperçus et métadonnées. Trois stratégies de nom sont proposées : conserver le nom actuel, utiliser le nouveau nom ou saisir un nom personnalisé.

Le nouveau fichier passe par le staging, sa signature et son SHA-256 sont contrôlés, puis l’ancien fichier est déplacé dans la corbeille. Le changement d’extension est pris en charge. Le remplacement d’un poster ne modifie jamais le média principal.

## Suppression et restauration manuelle

La suppression exige le titre ou l’ID. Le média et le poster sont déplacés sous :

```text
tools/artwork-admin/trash/animations/
```

Chaque suppression crée un `manifest.json` avec l’ID, le titre, les anciens chemins, la date et l’opération. Pour restaurer manuellement :

1. remettre les fichiers aux chemins indiqués dans le manifeste ;
2. restaurer une sauvegarde correspondante de `animations.js` ;
3. relancer `npm run animation-admin:test` puis `npm run build`.

## Sauvegardes, staging et transactions

```text
tools/artwork-admin/backups/animations/
tools/artwork-admin/staging/animations/
tools/artwork-admin/trash/animations/
```

Chaque opération critique crée une sauvegarde horodatée. Les fichiers sont préparés dans le staging, installés avec une transaction, puis `animations.js` est écrit atomiquement. Une erreur restaure le catalogue et les fichiers dans l’ordre inverse. Le staging Animation est nettoyé au démarrage et après chaque opération.

## Explorateur et prévisualisation

Les boutons **Ouvrir dans l’Explorateur** transmettent uniquement l’ID et le type `media` ou `poster`. Le serveur retrouve et valide le chemin, puis utilise le module `reveal-file.mjs` déjà partagé.

**Prévisualiser le portfolio** ouvre `http://127.0.0.1:5173/portfolio/animation`. Le serveur Vite doit déjà être lancé avec `npm run dev`.
