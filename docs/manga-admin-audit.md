# Audit Manga Admin — 7 octobre 2026

## Périmètre et méthode

Projet : `D:\v2\mon-portfolio`. Audit du module existant, sans refonte, nouvelle dépendance ni nouvelle fonctionnalité.

Inspection de l’interface, des handlers, des routes, du service, du catalogue, des transactions, du registre de langues et des consommateurs publics. Reproductions et mutations exclusivement dans des catalogues/dossiers temporaires. Le catalogue réel a uniquement été lu et validé ; tous les médias réels ont été hachés avant/après.

Abréviations dans l’inventaire :

- **UI** : `tools/artwork-admin/public/modules/mangas/manga-admin.js` et `public/mangas.html`.
- **API** : `tools/artwork-admin/manga/routes.mjs` ; racine `/api/mangas`.
- **Service** : `tools/artwork-admin/manga/service.mjs`.
- **Catalogue** : `manga/catalog.mjs`, qui lit/sérialise `src/content/mangas.js`.
- **Transaction** : helper existant `tools/artwork-admin/file-transaction.mjs`.
- **Audit médias** : `public/media-audit-ui.js` et service partagé Media Audit (inchangés).

« OK » signifie contrôlé dans les limites précisées à la fin, pas une garantie contre toute panne matérielle.

## Inventaire des 45 fonctions

| # | Fonction et chaîne d’implémentation | Persistance / comportement | Diagnostic |
| --- | --- | --- | --- |
| 1 | UI `#add-pages` → POST `/:id/languages/:code/pages` → `addPages` | Immédiate ; tri numérique des imports, fichiers uniques, insertion par splice | Fragile → corrigé : dirty, position, décodage, liens physiques, erreurs |
| 2 | `replacePageImage` → PUT `/:id/languages/:code/pages/:index` → `replacePage` | Immédiate après confirmation ; nouveau fichier, même index, ancien fichier archivé après validation | Déjà robuste ; archivage non partagé factorisé |
| 3 | `openDuplicatePage` / `submitDuplicatePage` → POST `…/:index/duplicate` → `duplicatePage` | Immédiate après confirmation de position ; copie binaire physique exclusive | Déjà robuste, tests conservés |
| 4 | `pageAction(delete)` → DELETE `…/:index` → `deletePage` | Immédiate après confirmation ; retrait logique, corbeille uniquement si non partagé | Corrigé : couverture partagée, source devenue obsolète, dirty |
| 5 | `pageAction(up)` → `movePage` | Brouillon ; Enregistrer persiste | OK ; même splice partagé, borne désactivée |
| 6 | `pageAction(down)` → `movePage` | Brouillon ; Enregistrer persiste | OK ; même splice partagé, borne désactivée |
| 7 | `pageAction(first)` → `movePage` | Brouillon ; Enregistrer persiste | OK ; pas de renommage physique |
| 8 | `pageAction(last)` → `movePage` | Brouillon ; Enregistrer persiste | OK ; pas de renommage physique |
| 9 | `pageAction(position)` → `movePage` | Brouillon ; entier dans 1…N | OK ; tests dont 24→23, intermédiaire et bornes |
| 10 | `reveal` → POST `/:id/reveal` ; images via GET `/api/manga-image/:path` | Lecture seule ; Explorer sélectionne un fichier du catalogue enregistré | Corrigé : identité conservée après réordre local, vérification physique ; lancement Explorer simulé dans les tests |
| 11 | Sélecteur → POST `/:id/languages` → `addLanguage` | Immédiate ; code canonique, langue vide, existantes exclues | OK ; ajout conserve maintenant la sélection et respecte dirty |
| 12 | `#delete-language` → DELETE `/:id/languages/:code` → `deleteLanguage` | Immédiate après confirmation ; défaut/seule langue refusés | Corrigé : fichiers partagés conservés, noms identiques en corbeille, dirty |
| 13 | `#default-language` → PUT `/:id` → `update` | Immédiate ; clé existante exigée | Corrigé : pas de perte du brouillon, erreurs visibles |
| 14 | `form.onsubmit` → PUT `/:id` → `update` + `applyPageOrder` | Informations et ordre enregistrés ensemble ; fermeture seulement après succès | Corrigé : ancien double appel partiellement persistant remplacé par une transaction sur la route existante |
| 15 | `requestClose`, Annuler / croix / Escape | Abandon confirmé si dirty ; aucune requête | OK ; liste locale restaurée, fermeture bloquée pendant mutation |
| 16 | `#delete-manga` → DELETE `/:id` → `removeManga` | Immédiate ; saisie exacte slug/titre, dossier entier en corbeille | Déjà protections Windows et transaction ; liens refusés, catalogue vérifié avant déplacement, legacy sûr accepté |
| 17 | `#create-form` → POST racine → `create` | Immédiate après confirmation ; pages et image obligatoires | Corrigé : collision catalogue/dossier et concurrente, validation réelle, erreurs de préparation visibles, double soumission bloquée |
| 18 | `previewUrl`, lien Prévisualiser → Vite + route publique | Lecture seule ; Storyboards utilisent `adminPreview=1` | OK par inspection ; dépend de Vite sur 127.0.0.1:5173, amélioration recommandée |
| 19 | Champs généraux → FormData → PUT `/:id` → `update` | Brouillon jusqu’à Enregistrer ; section peut déplacer le dossier transactionnellement | Corrigé : champs invalides et métadonnées/ordre incohérents refusés ensemble |
| 20 | `reviewReplacementMedia` → PUT `/:id/media/primary` → `replacePrimaryMedia` | Immédiate après revue ; bannière canonique, fallback cover conservé | Corrigé : dirty, erreurs, liens, image invalide, archivage non partagé |
| 21 | Garde `requireSavedEditor`, `requestClose`, `beforeunload` | Changement de langue et action immédiate demandent Enregistrer/Annuler si dirty | Corrigé : évite l’effacement silencieux des modifications |
| 22 | `setDirty`, input métadonnées, `movePage` | État du brouillon ; reset succès/annulation | Corrigé : choix de fichiers d’import ne marque plus les métadonnées dirty |
| 23 | `api`, `immediateMutation`, try/catch de création/save/replace/duplicate | Échec HTTP/réseau affiché ; verrou libéré en finally | Corrigé : handlers immédiats sans catch ; préparation création incluse dans try |
| 24 | `resolvePageFile`, `ensureAssetDirectory`, Transaction | Écritures exclusives, fichiers source préservés, corbeille | Renforcé : jonctions/symlinks refusés ; tests binaires et rollbacks |
| 25 | `readCatalog`, `validateMangaCatalog`, `writeAtomic` | Sauvegarde avant mutation ; source JS validée et remplacée atomiquement | Corrigé : catalogue incohérent refusé avant manipulation physique |
| 26 | `assetFile`, `projectPrefix`, `pageStorageFolder`, `resolvePageFile` | Dossier manga/langue déterminé depuis les données existantes | Renforcé : traversal explicite et liens d’ancêtres refusés ; aucun chemin réel migré |
| 27 | `decodeImage`, extensions / format réel | JPG/JPEG/PNG/WEBP/AVIF/GIF ; décodage de contrôle, octets originaux enregistrés | Corrigé : contrôle réel pour création/ajout/image de carte aussi ; aucune recompression |
| 28 | `uniqueDestination`, écriture exclusive, réservation slug | Suffixe -2, -3… ; copie `nom-copy.ext` puis suffixe ; sauvegarde UUID | Corrigé : collisions physiques/concurrentes de création et backups de même instant |
| 29 | `mutate`, `performMutation`, Transaction + callbacks après sauvegarde | Queue par processus ; rollback catalogue et fichiers sur erreur | Corrigé P1 : commit trop tôt et nettoyage dangereux si restauration impossible ; limites crash/plusieurs processus ci-dessous |
| 30 | Sérialisation `mangas`, `pageCount`, Reader consommant `languages[code].pages` | Ordre exact des tableaux ; counts dérivés ; assets base Vite | OK : sortie publique testée, Reader inchangé |
| 31 | Registre `languageLabels.js` + code natif/legacy | 15 codes demandés conservés ; labels natifs, aide française Admin | OK ; arabe isolé via bdi/dir, sans changer readingDirection |
| 32 | `movePage`, `applyPageOrder` | Position = index+1, indépendante du basename | OK ; aucune image renommée/déplacée pour le seul réordre |
| 33 | Actions page / onglets / confirmations | Boutons natifs, labels, focus existant | P3 corrigé : aria-label sur actions iconographiques ; bornes up/down/first/last désactivées |
| 34 | Confirmations natives / petite dialog duplication | Page/langue/manga/création/remplacement explicités | P3 corrigé : distinction retrait logique / corbeille / fichier partagé ; prompts natifs conservés |
| 35 | `message`, erreur duplication inline, erreurs serveur Windows | Notification lisible ; aucune erreur remplacée par succès | Corrigé : catch commun actions immédiates ; erreurs techniques encore perfectibles, recommandé |
| 36 | `closeLanguagePicker`, type création, `inert`, finally | Champ requis fermé désactivé ; mutation bloque les interactions | Corrigé : langue initiale masquée désactivée, locks et suppression défaut/seule désactivée |
| 37 | Forms HTML + `reportValidity` import | Native validation avant submit ; import indépendant du Save global | Corrigé : position d’import ne bloque plus Enregistrer ; test Chrome headless réel |
| 38 | `validateInput`, service, validation catalogue/fichiers | États/types/positions/langues/membership contrôlés serveur | Renforcé ; valeurs de métadonnées historiques vides compatibles |
| 39 | `resolvePageFile`, `validateFiles`, rapport | Erreur ; pas de catalogue enregistré vers une référence manquante | OK ; un fichier manquant ailleurs bloque les mutations tant qu’il n’est pas corrigé |
| 40 | `decodeImage` + décodeur Sharp partagé | Refus image vide, mauvais contenu/extension, image tronquée | OK ; tests JPG/JPEG/PNG/WEBP/AVIF/GIF et faux formats |
| 41 | `assetFile`, chemins réels, validation catalogue | Refus hors racine/projet, traversal, dossier lié | Renforcé ; tests jonction Windows temporaires |
| 42 | Prefix legacy, aliases `english`, `french`, `original`, dossiers existants | Pas de migration automatique | Corrigé suppression de dossier legacy sûr ; mix de racines exceptionnel à examiner manuellement |
| 43 | Catalogue validé avant et après mutation | ID/slug/route/path doublons et défaut absent refusés | Renforcé ; catalogue incohérent laisse les fichiers intacts |
| 44 | Audit médias + rollbacks | Inventaire sans suppression automatique ; dossier supprimé archivé avec fichiers non référencés | OK pour pannes testées ; récupération exceptionnelle et inventaire réel ci-dessous |
| 45 | `report().missing`, `validateFiles`, erreurs API | Signalement des références absentes, mutation refusée | OK ; aucun fichier manquant dans le catalogue réel audité |

## Ce qui était déjà robuste

- Un seul `movePage` pour drag & drop, monter/descendre, début/fin et position précise.
- Duplication byte-for-byte, nouvelle référence indépendante, écriture exclusive et rollback.
- Remplacement avec identité source, position constante, extension réelle, nouveau chemin et rafraîchissement d’image sans cache hack.
- Registre centralisé de langues et compatibilité des clés/dossiers historiques.
- Helper transactionnel partagé, sauvegarde source, fichier temporaire + rename atomique, queue dans le processus.
- Suppression du dossier manga entier en corbeille, confirmation slug/titre et traduction des erreurs Windows.
- Admin limité à localhost avec vérification Host/Origin ; pas d’API d’écriture dans le site public.

Ces mécanismes n’ont pas été remplacés par une architecture parallèle.

## Défauts corrigés

### P1 — intégrité des données

1. **Commit avant invalidation du cache** : un callback échouant pouvait restaurer le catalogue sans restaurer les fichiers déjà déplacés. Le commit est maintenant la dernière étape ; le test force une erreur après archivage.
2. **Rollback catalogue impossible** : le nettoyage pouvait retirer une copie encore référencée sur disque. Si la restauration échoue, les fichiers préparés et la sauvegarde restent disponibles ; l’opération signale un rollback incomplet. Ce n’est pas un succès ni une restauration automatique garantie.
3. **Dossiers liés / jonctions** : certaines écritures/déplacements se fiaient au chemin lexical. Les ancêtres existants et fichiers sont vérifiés ; aucun lien vers un autre emplacement n’est suivi pour ces opérations.
4. **Sauvegardes de même timestamp** : risque d’écraser une sauvegarde d’état différent. Nom UUID et copie exclusive.

### P2 — cohérence et validation

- Page/langue dont une image sert aussi de couverture : conserver le média partagé, archiver seulement les médias devenus inutilisés.
- Deux anciennes pages de dossiers différents avec même basename : noms uniques en corbeille.
- Réparation du stockage d’une page également utilisée en cover : copier plutôt que déplacer le fichier partagé.
- Enregistrer métadonnées + réordre : une seule transaction, y compris changement de section ; ancien ordre attendu contrôlé pour refuser une requête obsolète.
- Actions immédiates et changement de langue : refus tant qu’un brouillon attend Enregistrer/Annuler ; sélection de langue conservée après refresh.
- Erreurs et requêtes concurrentes UI : catch/finally et verrou pendant mutation ; création protège aussi la préparation des fichiers.
- Explorer après réordre non enregistré : retrouve l’index sauvegardé du chemin cliqué, plutôt que le nouveau numéro visuel.
- Création : collision de slug calculée dans la queue, vérification du dossier même non référencé, pas de fusion avec son contenu.
- Champs cachés et import : langue initiale disabled si masquée ; position d’import rattachée à un formulaire séparé pour ne pas bloquer Save.
- Fichiers importés/créés et bannière : décodage de contrôle et correspondance extension/format sans transformation.
- Champs serveur : types et valeurs d’état contrôlés ; insertion entière positive (la compatibilité existante >N = ajout à la fin est conservée côté API).
- Catalogue incohérent refusé avant de manipuler les fichiers. Suppression d’un dossier legacy exact acceptée sans migration.

### P3 — petites clarifications

- Libellés accessibles pour toutes les actions page iconographiques ; bornes de déplacement désactivées.
- Confirmations distinguent retrait, corbeille et fichiers partagés.
- Une note précise quelles actions sont immédiates et lesquelles attendent Enregistrer.

## Recommandations non appliquées

| Priorité | Limite / amélioration utile | Pourquoi non appliquée |
| --- | --- | --- |
| P1 potentiel | Journal de récupération persistant pour coupure électrique/arrêt brutal pendant déplacement ou save | La transaction actuelle est en mémoire ; garantir une reprise après crash nécessite une évolution explicite et des tests de reprise. Le rename du catalogue est atomique, pas toute la transaction multi-fichiers. |
| P2 | Verrou inter-processus / contrôle de version du catalogue pour plusieurs serveurs Admin ou édition VS Code simultanée | Queue uniquement dans un processus ; expectedPages protège le réordre, pas toutes les métadonnées. Changement d’architecture à valider séparément. Utiliser un seul serveur et éviter les modifications externes pendant une action. |
| P2 | Procédure assistée de récupération après permissions Windows empêchant aussi le rollback | Une double panne système reste possible ; conserver fichiers + backup et signaler l’erreur ne remplace pas une reprise assistée. |
| P2 | Politique explicite de rétention des backups Manga et nettoyage des dossiers temporaires vides | Ne pas effacer automatiquement des sauvegardes sans politique choisie. Les tests vérifient l’absence de nouveaux médias orphelins après rollback normal, pas l’absence de dossiers vides. |
| P2 | Examiner les 45 images non référencées par le catalogue manga | Non référencé ne signifie pas inutile : possible couverture alternative, ancien import ou référence ailleurs. Aucune suppression/intégration automatique. |
| P2 | Confirmer l’intention éditoriale EN20/FR20/JA24 de Legend of Animiste | Différence détectée, pas corrigée : aucune preuve que les 24 JA sont incorrectes. |
| P3 | Détecter le serveur Vite/port pour Prévisualiser | Le lien actuel suppose port 5173 et base `/portfolio/`. Fonctionnement conservé, pas de nouvelle orchestration. |
| P3 | Brouillon de création et import non validé : avertir avant fermeture ; préserver des brouillons par langue | Le dirty actuel protège métadonnées et réordre de l’éditeur. Préserver tous les formulaires/fichiers temporaires demanderait un état de brouillon plus large. |
| P3 | Remplacer progressivement confirm/prompt par dialogues accessibles homogènes et détailler certaines erreurs techniques | Pas nécessaire pour les correctifs d’intégrité ; éviter une refonte UI pendant cet audit. |

## Tests et résultats

Nouvelle suite `manga-audit.test.mjs` : **26 tests**. Elle couvre médias partagés, collisions de noms/dossiers/slugs, création concurrente, backups simultanés, panne de restauration, mutations et rollback à trois points, import partiellement invalide, métadonnées invalides, sources manquantes/obsolètes, jonctions, suppression legacy, catalogue incohérent, réparation partagée, dirty, erreurs UI, double action, changement de langue et required caché.

Suites adaptées :

- `manga-reorder-page.test.mjs` : nouvelle sauvegarde unique, échec conservant le brouillon ; test natif Chrome où une position d’import invalide ne bloque pas Save.
- `manga-language-ui.test.mjs` : ajout canonique via la garde immédiate existante.

Validations exécutées :

| Commande | Résultat |
| --- | --- |
| `npm run manga-admin:test` | Intégration serveur réussie + **92/92 tests**, aucun skip : audit26, duplication12, remplacement26, réordre21, UI langues2, registre5 |
| `npm run artwork-admin:test` | Intégration réussie |
| `npm run media-audit:test` | **9/9 tests** réussis |
| `npm run lint` | Réussi |
| `npm run build` | Réussi, 496 modules ; aucun dossier Admin dans dist |
| `git diff --check` | Réussi ; avertissements Git habituels LF→CRLF, aucune erreur whitespace |

Les suites ne nécessitent aucun manga réel de test. Explorer est simulé, les erreurs Windows sont injectées dans les fixtures. La validation HTML native utilise Chrome headless. Les handlers UI sont aussi exécutés avec adaptateurs DOM/VM et APIs temporaires. Ce n’est pas une session manuelle exhaustive sur chaque navigateur/mobile ; swipe/fullscreen et apparence du Reader ne sont pas retestés par gestes réels pendant cet audit.

## Vérification des données réelles

- **14 mangas**, **518 pages référencées**, aucune référence manga vers un fichier manquant ; catalogue validé.
- Legend of Animiste : **en20 / fr20 / ja24**, ordre et octets conservés.
- Stubborn Love : en14 / fr14. Ahès : original31. Clés historiques `english`, `french`, `original` conservées partout où présentes.
- Rapport existant : différence de nombres de pages de Legend ; clé historique `original` d’Ahès. Ce sont des observations, pas une autorisation de migration.
- **45 images** sous `public/assets/mangaka` non référencées dans le catalogue manga : 41 dans Ancient Animiste God/french, 2 dans Legend, 2 dans Stubborn Love. Elles restent intactes ; ce comptage ne recherche pas les références dans tous les autres composants.
- Empreinte agrégée SHA-256 identique pour les **958 fichiers de public/assets** avant/après.
- SHA-256 identiques avant/après pour `mangas.js`, `artworks.js`, `animations.js`, `mangaPresentation.js` et `MangaReader.jsx`.
- Reader public inchangé ; non-régression de ses labels et ordre des données vérifiée par tests et build. Aucun code/dossier/langue/page réelle renommé ou déplacé.
- Positions logiques toujours dérivées du tableau, indépendantes des noms physiques.

## Fichiers de cette intervention

Modifiés (certains avaient déjà des changements avant l’audit, conservés) :

- `package.json` : ajoute la suite d’audit à la commande Manga Admin.
- `tools/artwork-admin/manga/service.mjs` : correctifs sécurité, validation, archive partagée, sauvegarde/transaction et save combiné.
- `tools/artwork-admin/manga/routes.mjs` : identité source lors du retrait de page, compatibilité DELETE sans body.
- `tools/artwork-admin/public/modules/mangas/manga-admin.js` : dirty/locks/erreurs, refresh de langue, save unique, Explorer, création et labels.
- `tools/artwork-admin/public/mangas.html` : séparation validation import, note de persistance, extensions image de carte.
- `tools/artwork-admin/tests/manga-reorder-page.test.mjs` et `manga-language-ui.test.mjs` : adaptations et contrôles.

Créés : `tools/artwork-admin/tests/manga-audit.test.mjs`, ce rapport.

Les autres modifications déjà présentes dans le worktree ne proviennent pas de cet audit. Aucun commit, push ou déploiement effectué.

## Prochaines étapes utiles

1. Valider une stratégie de récupération après crash et de restauration backup + corbeille.
2. Si plusieurs sessions/serveurs ou éditions externes sont nécessaires, ajouter un verrou/version inter-processus.
3. Examiner manuellement l’écart des éditions et l’inventaire non référencé, puis définir une politique de rétention.
4. Ensuite seulement, améliorer l’avertissement des brouillons de création et le lien de prévisualisation.
