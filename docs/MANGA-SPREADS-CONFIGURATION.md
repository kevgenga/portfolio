# Doubles pages : configuration verticale et horizontale

## Depuis Manga Admin

Redémarrer `npm run artwork-admin` après la mise à jour du serveur. Ouvrir
**Manga → Modifier → Langues & pages**, puis choisir la langue de l’œuvre.

1. Enregistrer ou annuler les modifications en attente. Effacer les sélections
   conservées dans une autre langue si nécessaire.
2. Cocher exactement deux pages consécutives, par exemple **03 et 04**.
3. Cliquer sur **Configurer une double page**.
4. Vérifier les numéros et l’aperçu RTL/LTR, puis choisir les modes :

| Verticale | Horizontale | Configuration explicite |
| --- | --- | --- |
| Oui | Non | Verticale uniquement |
| Non | Oui | Horizontale forcée uniquement |
| Oui | Oui | Les deux modes |
| Non | Non | Suppression des associations de cette paire |

5. Cliquer sur **Confirmer la configuration**. Cocher/décocher ne sauvegarde rien.
   Supprimer les deux modes d’une paire existante demande une confirmation
   supplémentaire dans la fenêtre.

Les cartes indiquent les numéros et les modes actifs. Leur bouton **Configurer**
rouvre la même fenêtre avec les cases précochées selon l’état enregistré. Décocher
un seul mode ne supprime pas l’autre. **Annuler** ou Échap n’écrit rien. Une erreur
serveur conserve la fenêtre, les choix et le message d’erreur ; en cas de conflit,
annuler puis recharger le catalogue avant de recommencer.

Une nouvelle paire propose le mode vertical par défaut. Une ancienne paire
verticale reste verticale seulement : aucune activation horizontale automatique.
La couverture peut participer à une paire verticale, mais reste **toujours seule
en horizontal** ; l’option horizontale est donc désactivée pour une paire 01–02.

## Pagination horizontale et slider

Sans configuration horizontale, le comportement est inchangé :

- Écran large : `01 → 02–03 → 04–05 → … → 24`.
- Petit écran : pages individuelles.

Avec une paire **03–04 forcée** :

- Écran large : `01 → 02 → 03–04 → 05–06 → … → 23–24`.
- Petit écran : `01 → 02 → 03–04 → 05 → 06 → … → 24`.

Les paires explicites sont réservées avant le regroupement automatique. Celui-ci
reprend après chaque paire et ne consomme jamais une page réservée. Chaque page
apparaît exactement une fois ; les fichiers ne sont pas réordonnés physiquement.
Les paires forcées restent côte à côte sur mobile, tablette, desktop et fullscreen,
avec leurs proportions, leur centrage et l’ordre visuel RTL/LTR.

**Horizontale décochée ne signifie pas « pages toujours isolées ».** Cela retire
seulement la contrainte explicite ; le regroupement automatique reprend ses droits.
Les associations verticales ne participent jamais au calcul horizontal.

Le rail, ses panneaux voisins, les flèches et le slider consomment la **même liste**
construite par `getHorizontalReadingPanels` dans `readerPagination.js`. Le composant
du slider et ses styles ne sont pas refaits. Chaque cran correspond à un panneau
réel, jamais à la seconde moitié d’une paire. Pendant un glissement, le compteur
prévisualise le premier numéro du panneau ciblé sans changer l’image ni charger les
pages intermédiaires. Au relâchement, une seule navigation va à ce panneau ; une
annulation rétablit la page réellement ouverte. Les gestes du rail restent ceux du
lecteur existant : cette évolution ne remplace pas son moteur de swipe.

## Stockage, sauvegardes et intégrité

Deux champs facultatifs et indépendants dans chaque langue :

```js
verticalSpreads: [[cheminExactPage3, cheminExactPage4]],
horizontalSpreads: [[cheminExactPage3, cheminExactPage4]],
```

Les chemins uniques identifient les pages, pas leurs positions. Le sérialiseur
existant utilise `assetPath` pour ces références comme pour `pages`, compatible
avec `/portfolio/`. Aucun champ nouveau n’est écrit dans un catalogue réel tant
qu’une configuration n’a pas été confirmée dans l’Admin. Aucun nouveau mapping
linguistique ni identifiant de production n’est créé.

Une page ne peut appartenir à deux paires dans le même mode. Des paires différentes
dans les deux modes sont permises, et leurs indications restent distinctes dans
l’Admin. Les langues sont indépendantes, même si les positions ou noms se ressemblent.

- Déplacer une paire entière, insérer avant/après : références conservées.
- Séparer/inverser les membres, insérer entre eux, supprimer un membre : refus
  explicite, dissociation préalable nécessaire. Un brouillon de réordre refusé
  reste disponible dans l’éditeur.
- Déplacer une paire horizontale en position de couverture : refus explicite.
- Remplacer une page : sa référence est mise à jour dans chaque mode concerné.
- Dupliquer : le nouveau fichier distinct n’hérite d’aucune paire.
- Réparer le dossier d’une langue ou déplacer une section : références mises à jour.
- Supprimer une langue : seules ses propres associations disparaissent.
- Restaurer le catalogue depuis une sauvegarde restaure aussi les associations.

Les validations des deux champs s’exécutent avant l’écriture. La nouvelle route
`PUT /api/mangas/:id/languages/:code/spreads` exige la révision du catalogue et deux
booléens explicites. Les sauvegardes, file d’attente, écritures atomiques et rollback
existants sont réutilisés. Les anciennes routes verticales restent compatibles.
Une configuration inchangée n’écrit rien et ne crée pas de sauvegarde superflue.

Le suivi vertical, les largeurs, les durées individuelles et les groupes de
production restent séparés de cette configuration. Les durées ne sont jamais
additionnées du seul fait d’une double page.

## Vérification manuelle sur Legend of Animiste

1. Choisir **日本語**, sélectionner **03 et 04** et ouvrir la configuration.
2. Cocher **Verticale + Horizontale**, vérifier l’aperçu, confirmer et recharger.
3. Dans le Reader japonais, vérifier le bloc vertical 03–04 et son compteur 3 / 24.
4. Passer en horizontal : couverture seule, page 02 seule, puis 03–04 ensemble.
5. Glisser le slider sans le relâcher : seul le compteur prévisualise le panneau.
6. Relâcher : image, compteur et curseur rejoignent la même destination.
7. Sur mobile, 03–04 restent ensemble, les autres pages restent individuelles.
8. Rouvrir la configuration, décocher un seul mode et vérifier l’indépendance.
9. Décocher les deux, confirmer la suppression et vérifier le retour au comportement
   automatique. Les fichiers et durées restent intacts.

## Tests et limites

```text
npm run manga-admin:test
node --test src/components/manga/*.test.mjs src/utils/*.test.mjs
npm run manga-production:browser-test
node tests/public-production-time-browser.mjs --reader-navigation-only
node tests/manga-vertical-spreads-firefox.mjs
npm run artwork-admin:test
npm run animation-admin:test
npm run production-groups:test
npm run lint
npm run build
git diff --check
```

Les fixtures sont temporaires ou injectées en mémoire. Les tests couvrent les
transitions entre les quatre états, conflits, rollback, remplacement, réparation,
réordre, indépendance linguistique et invariants de pagination pour 1/2/3/14/24/31
pages. Les suites Chromium/Firefox vérifient les neuf largeurs demandées, l’ordre
visuel, les proportions, le compteur et les panneaux. Chromium teste aussi le
slider souris/tactile, les annulations, le swipe existant et le fullscreen natif.
Les captures sont inspectables avec `PUBLIC_PRODUCTION_CAPTURE_DIR`.

Ce sont des tests automatisés desktop/headless : ils ne remplacent pas un essai sur
chaque appareil Android/iOS physique. Sur petit écran une paire est volontairement
plus petite ; aucun nouveau zoom n’a été ajouté. Une configuration corrompue est
refusée côté Admin ; le Reader ignore défensivement les paires invalides sans perdre
de pages. La résolution et les limites des sources restent décrites dans
[MANGA-VERTICAL-SPREADS.md](MANGA-VERTICAL-SPREADS.md).

Constats préexistants distingués de cette évolution : le réglage vertical local
est déjà à 800 px (et non à la valeur initiale de 720 px). Les tests lisent donc
le réglage réel et attendent les images lazy après leur mise en vue. À 320 px, le
contenu Admin en arrière-plan peut élargir le viewport de mise en page au-delà de
la zone visible ; seule la nouvelle fenêtre a été ancrée dans cette zone visible,
sans refondre la page Admin sous-jacente.
