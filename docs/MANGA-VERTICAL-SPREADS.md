# Lecture verticale et doubles pages explicites

## Utilisation

Redémarrer `npm run artwork-admin` après une mise à jour du serveur.
Dans Manga → Modifier → Langues & pages :

1. Choisir la langue de l’œuvre ; enregistrer ou annuler les modifications en attente.
2. Effacer une éventuelle sélection conservée dans une autre langue.
3. Cocher exactement deux pages consécutives, par exemple les positions 03 et 04.
4. Cliquer sur **Configurer une double page**.
5. Cocher **Lecture verticale**, laisser **Lecture horizontale** décochée pour
   conserver une paire verticale uniquement, puis vérifier l’aperçu et confirmer.

L’association est enregistrée immédiatement, avec sauvegarde et contrôle de révision.
Les deux cartes indiquent les numéros associés. Pour annuler, utiliser **Configurer**
sur l’une des cartes et décocher la lecture verticale, puis confirmer. Les fichiers restent distincts et
ne sont ni fusionnés, ni modifiés, ni supprimés.

Aucune association n’est créée automatiquement dans les catalogues réels.

La configuration unifiée et les associations horizontales indépendantes sont
documentées dans [MANGA-SPREADS-CONFIGURATION.md](MANGA-SPREADS-CONFIGURATION.md).

## Largeur personnalisable

Dans `src/components/manga/ReaderNavigation.css`, règle `[data-reader-mode="vertical"]` :

```css
--reader-vertical-page-max-width: 720px;
--reader-vertical-spread-max-width: 1440px;
```

Les largeurs sont plafonnées à l’espace disponible. Le groupe reste côte à côte sur
mobile. Les images gardent une hauteur automatique et leur rapport natif ; il n’y a
plus de maximum de hauteur égal au viewport en mode vertical.

Avant cette modification, la section était plafonnée par `max-w-7xl` (1280 px), avec
16 px de padding latéral dès `sm`, et les images utilisaient `w-auto` et
`max-h-[100dvh]`. Leur largeur effective dépendait donc surtout de la hauteur de
l’écran : pour une source 800 × 1131, environ 637 px sur un viewport haut de 900 px,
ou 648 px pour 916 px de hauteur. Il n’existait pas de largeur individuelle fixe.

Les 72 pages actuelles de Legend of Animiste (24 EN, 24 FR, 24 JA) mesurent toutes
800 × 1131 px. Les couvertures examinées de Stubborn Love mesurent 800 × 1127 px,
celle d’Ahès 1299 × 1949 px. 720 px est raisonnable pour les sources de 800 px sur
écran de densité ×1 ; rester vers 720–800 px évite de les agrandir au-delà de leur
résolution native. La netteté dépend aussi de la compression d’origine. Sur écran
×2, prévoir au moins 1440 px de large par page pour 720 px CSS (2160 px à ×3).
Une double page à 1440 px CSS demande la même résolution **par fichier**, pas une
conversion des fichiers existants. Aucun média n’a été rééchantillonné.

## Stockage et intégrité

Champ facultatif par langue, distinct de `productionTime` :

```js
verticalSpreads: [[/* chemin exact page A */, /* chemin exact page B */]]
```

Les références sont les chemins uniques déjà utilisés pour identifier les pages,
jamais leurs positions ou leurs noms seuls. Elles sont sérialisées avec `assetPath`
comme les pages, donc compatibles avec `/portfolio/`. Les positions sont recalculées
dans l’ordre actuel. Le remplacement explicite d’une page, la réparation de son
dossier et le déplacement de section mettent à jour sa référence dans les paires.
Une copie reçoit un nouveau chemin et n’hérite d’aucune association.

Déplacer une paire entière ou insérer avant/après est permis. Inverser/séparer ses
membres, insérer entre eux ou supprimer un membre est bloqué avec une consigne de
dissociation préalable. Le serveur annule la transaction et retire les fichiers
préparés si nécessaire. Un réordre local incompatible ne peut pas être enregistré.
Supprimer une langue retire ses propres associations avec elle, pas celles des
autres langues. Les conflits utilisent la révision du catalogue et les sauvegardes
existantes ; les associations reviennent avec le catalogue restauré.

Le Reader suit le groupe visuel une seule fois, avec son premier numéro logique
(par exemple 3 / 24). Les durées des deux dessins restent séparées. Les panneaux
horizontaux n’utilisent jamais `verticalSpreads`.

## Tests reproductibles

- `npm run manga-admin:test` : fixtures temporaires, associations, validation,
  indépendance des langues, réordre/import/copie/suppression/remplacement,
  déplacement de section, conflits, sauvegardes et rollback.
- `npm run manga-production:browser-test` : parcours Admin réel sur fixture,
  sélection invalide, aperçu RTL, annulation, confirmation, rechargement,
  dissociation, conservation des durées et fonctions existantes.
- `node tests/public-production-time-browser.mjs --reader-navigation-only` :
  non-régression du Reader horizontal et vertical, puis 54 vérifications de paires
  (9 largeurs × 3 langues d’interface × RTL/LTR), compteur au scroll sans saut,
  durées distinctes, langues indépendantes, interface masquée et vrai fullscreen.
- `node tests/manga-vertical-spreads-firefox.mjs` : Firefox installé localement,
  18 vérifications (9 largeurs × RTL/LTR), interfaces EN/FR/JA, thèmes clair/sombre,
  géométrie, compteur et regroupement horizontal indépendant.

Les tests navigateur sont automatisés/headless, pas une certification sur chaque
appareil Android/iOS physique. Tous les catalogues de test sont temporaires ou
injectés uniquement en mémoire ; aucun manga réel n’est modifié.
