# Artwork Admin V2.1

Outil local de gestion de `src/content/artworks.js`. Il n’est ni importé par React ni copié dans `dist`.

## Lancement

```bash
npm run artwork-admin
```

Le serveur écoute uniquement sur `http://127.0.0.1:4174` et ouvre cette adresse dans le navigateur. Pour utiliser **Preview portfolio**, lancez `npm run dev` dans un second terminal.

## Importer plusieurs œuvres

1. Ouvrir l’onglet **Importer**.
2. Déposer jusqu’à 100 images dans la zone d’import, ou cliquer dessus pour utiliser le sélecteur Windows.
3. Appliquer une ou plusieurs catégories, une date et les options de compression à toutes les images ou seulement aux cartes cochées.
4. Ajuster au besoin le nom, la catégorie, la date, l’alt ou la compression de chaque carte.
5. Utiliser **Analyser la compression** pour obtenir les dimensions et le poids estimés.
6. Cliquer sur **Enregistrer les œuvres**, vérifier le résumé puis confirmer.

Les fichiers sont d’abord placés dans `tools/artwork-admin/staging/`. Ils ne rejoignent les dossiers du portfolio qu’après confirmation. Le serveur traite le lot séquentiellement, crée une seule sauvegarde, copie les images puis écrit `artworks.js` une seule fois. En cas d’erreur, toutes les images déjà copiées sont retirées et le catalogue reste inchangé.

## Compression

La compression est désactivée par défaut et utilise Sharp lorsqu’elle est activée. Elle permet :

- de conserver la taille ou de limiter le plus grand côté ;
- de choisir une qualité de 60 à 100 ;
- de conserver le format ou de produire du WebP, JPEG ou PNG ;
- de conserver facultativement les métadonnées.

Une image plus petite que la cible n’est jamais agrandie. La rotation visuelle issue des métadonnées est appliquée avant la sortie. Un GIF animé est conservé intact pour ne pas perdre son animation.

## Catégories principales et secondaires

La galerie permet une édition rapide de la date, de l’alt et des catégories. Une sauvegarde explicite est toujours nécessaire. Le panneau avancé reste disponible pour renommer, remplacer l’image ou supprimer une œuvre.

Une œuvre possède au moins une catégorie. La première catégorie sélectionnée est la catégorie principale et détermine l’unique dossier physique de l’image. Les catégories suivantes servent aux filtres sans dupliquer le média. Changer uniquement une catégorie secondaire ne déplace pas le fichier. Changer la principale déplace le fichier vers le dossier correspondant. Les doublons de catégories sont éliminés en conservant l’ordre choisi.

Le rapport de galerie indique les œuvres à une ou plusieurs catégories, les catégories absentes ou inconnues, et les éventuels écarts entre la catégorie principale et le dossier physique. Aucune migration automatique n’est effectuée.

## Remplacer une image

Dans **Modification avancée**, cliquez sur l’aperçu actuel ou déposez une nouvelle image dans la zone prévue. L’ancienne et la nouvelle image sont comparées avant enregistrement.

Trois stratégies de nommage sont disponibles :

- conserver le nom actuel en adaptant son extension au format final ;
- utiliser le nom du nouveau fichier ;
- saisir un nom personnalisé.

Un conflit produit toujours un nom suffixé unique : aucun fichier existant n’est écrasé. La compression utilise les mêmes réglages Sharp que le multi-ajout. Une image identique à l’actuelle ou à une autre œuvre est refusée.

Le remplacement forme une transaction unique avec les changements de catégories, date et alt. L’ID, la position dans le catalogue, `featured`, `orientation` et les autres champs non édités sont préservés.

## Sauvegarde, corbeille et restauration

- Les sauvegardes horodatées sont placées dans `tools/artwork-admin/backups/`, avec une limite de 20.
- Une suppression déplace l’image dans `tools/artwork-admin/trash/`.
- Un remplacement déplace aussi l’ancienne image dans un sous-dossier horodaté de la corbeille et ajoute un manifeste `replacement.json` avec l’ID et les anciens/nouveaux chemins.
- Pour restaurer, arrêter l’outil, recopier une sauvegarde vers `src/content/artworks.js`, puis remettre si nécessaire l’image depuis la corbeille dans son dossier d’origine.

## Tests

Les tests utilisent exclusivement un portfolio temporaire :

```bash
npm run artwork-admin:test
```

Ils vérifient notamment les catégories multiples, un lot de plusieurs dizaines d’images, les doublons SHA-256, les collisions de noms, le remplacement, la compression, la sortie WebP, les GIF animés, l’édition rapide, la corbeille et cinq points de rollback simulés.

Les dossiers `backups`, `staging` et `trash` sont exclus de Git, sauf leurs fichiers `.gitkeep`.
