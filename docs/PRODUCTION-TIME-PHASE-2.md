# Temps de réalisation Manga — Phase 2

Lancer `npm run artwork-admin`, puis ouvrir **Mangas → Modifier**. Rien n’est affiché publiquement ; aucune durée ni correspondance n’est créée automatiquement.

## Projet et pages

- Dans **Informations**, saisir le **Temps de réalisation du projet** : heures entières ≥ 0, minutes de 0 à 59, mesuré ou estimé. Cliquer **Enregistrer le temps**. Le total est manuel, commun à toutes les langues et indépendant des durées de pages : aucune addition automatique.
- Dans **Langues & pages**, cliquer **Temps / correspondances** sur une carte. Le panneau s’ouvre dans la même fenêtre. Saisir/modifier la durée, puis enregistrer. Le type peut changer sans ressaisir les chiffres.
- **Mesuré** = effectivement mesuré ; **estimé** = estimation personnelle. Les durées peuvent dépasser 24 heures.
- Une saisie entièrement vide conserve une durée existante. Une saisie partielle, invalide ou égale à zéro est refusée. **Effacer le temps global** ou **Effacer le temps de la page** demande confirmation et ne touche pas aux médias. Effacer une durée de dessin partagé la retire pour toutes ses versions associées.
- Les temps se sauvegardent immédiatement, indépendamment des champs généraux : leurs brouillons restent en place et ne sont pas enregistrés par cette action. Avant le bouton général « Enregistrer », enregistrer les temps en cours avec leur propre bouton. Les actions de pages/langues restent protégées lorsqu’un brouillon est en attente. Les durées non renseignées sont signalées sans valeur fictive.

## Correspondances entre langues

Choisir une page d’une autre langue dans le panneau de la page, puis **Confirmer l’association**. Vérifier vous-même les dessins : même position, nom, dimensions ou nombre de pages ne prouvent jamais une correspondance.

Les fichiers restent distincts mais partagent un identifiant logique `drawing-…` et une durée de dessin. Une modification depuis l’une des versions est visible depuis les autres. L’association peut rester partielle.

Si deux durées diffèrent, choisir explicitement celle de la page source ou cible avant confirmation. La valeur non retenue reste dans l’historique. Associer des groupes qui contiennent déjà deux pages différentes d’une même langue est refusé : corriger/désassocier d’abord.

Pour corriger une erreur, utiliser **Retirer cette association** : choisir de conserver la durée sur la page séparée (copie explicitement confirmée de la métadonnée) ou de la laisser sans durée. Les autres versions ne changent pas. Corriger ensuite manuellement les durées si nécessaire.

## Conservation pendant les opérations

Les tableaux `languages[code].pages` restent inchangés dans leur format. Le numéro de position n’est pas une identité : réordre, insertion et permutation ne déplacent pas les durées vers un autre dessin.

- **Remplacer** une page suivie demande `keep` (même dessin, export corrigé : conserver identité/durée et correspondances) ou `new` (nouveau dessin : nouvelle identité sans durée ; les autres langues et l’ancienne durée restent conservées). Aucun choix supplémentaire pour une page sans identité de production.
- **Dupliquer** garde la copie physique existante, mais ne copie jamais la durée ni les associations. Si la source est suivie, sa copie reçoit un ID distinct sans durée ; sinon l’identité sera créée lors d’une première saisie/association.
- Le déplacement de section et la réparation du dossier linguistique mettent à jour les valeurs `path` des correspondances en conservant les IDs.
- Un renommage manuel hors de l’Admin exige de mettre à jour aussi la valeur `path` correspondante. Une association devenue introuvable ou ambiguë bloque la sauvegarde : aucun index n’est utilisé pour deviner le bon dessin.
- Supprimer une page/langue retire ses correspondances, pas les durées encore utilisées ailleurs. Les dessins chronométrés sans fichier associé restent consultables dans **Informations → durées historiques**. Cet historique est en lecture seule dans cette phase ; une sauvegarde permet sa récupération manuelle. Aucun total n’en est déduit.

## Données, sauvegardes et conflits

Le champ facultatif `productionTime` de chaque manga contient `total` (facultatif), `pages` (dessins `{ id, time? }`) et `bindings` (`{ path, pageId }`). Aucun stockage parallèle ; les codes historiques et IDs des mangas sont conservés.

Les sauvegardes existantes dans `tools/artwork-admin/backups/mangas/`, la file d’attente et le rollback sont réutilisés. Le catalogue généré est validé avant remplacement atomique. Les saisies de production n’appellent ni Sharp ni un déplacement/renommage de média.

Les mises à jour du panneau transmettent une empreinte SHA-256 du catalogue. Une modification extérieure/stale est refusée, avec brouillon conservé ; le serveur revérifie l’empreinte juste avant remplacement. Ce contrôle n’est pas un verrou sur VS Code : la petite course entre vérification et remplacement reste possible. En cas de modification extérieure pendant un rollback, le serveur refuse d’écraser le nouveau catalogue et conserve les fichiers/sauvegardes pour récupération manuelle. Les appels historiques de l’API sans empreinte restent compatibles, mais les nouveaux endpoints de production l’exigent.

Une ancienne sauvegarde sans durée reste lisible et représente son état historique. Pour restaurer : arrêter l’Admin, conserver une copie de l’état actuel, remettre la sauvegarde choisie dans `src/content/mangas.js`, puis redémarrer. Restaurer un catalogue ne remet pas automatiquement des fichiers déplacés dans la corbeille.

Tests isolés : `npm run manga-production:test`, `npm run manga-production:browser-test` (Chrome ; chemin personnalisable avec `PRODUCTION_TIME_TEST_CHROME`). Les tests n’écrivent jamais dans les mangas réels.

Phase 3 : édition multiple et groupes de production. Phase 4 : affichage public. Ces fonctionnalités ne sont pas développées ici.
