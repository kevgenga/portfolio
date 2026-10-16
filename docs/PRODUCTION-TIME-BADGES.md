# Personnaliser les badges de temps de travail

Les badges lisent les durées existantes : aucun catalogue, dessin, groupe ou
Admin n’est modifié. La couleur exprime uniquement une quantité de temps,
jamais la qualité, la performance ou un retard.

## Seuils, couleurs activées et emplacement

Fichier : `src/content/productionTimeBadgeSettings.js`.

Valeurs par défaut :

```js
colorMode: "tiered",
placement: "metadata",
thresholds: Object.freeze({ medium: 120, long: 240 }),
```

- Vert : minutes < `medium` (moins de 2 h).
- Ambre : `medium` inclus à `long` exclu (2 h à moins de 4 h).
- Bordeaux : `long` inclus et au-delà (4 h et plus).

Pour des limites à 3 h et 6 h, remplacer uniquement les deux nombres par
`medium: 180, long: 360`. Ils doivent être des entiers positifs et `long` doit
être supérieur à `medium`. Des seuils incohérents donnent un badge neutre, sans
faire disparaître ni modifier la durée.

`colorMode: "neutral"` désactive les couleurs par niveau. Aucun bouton public
n’est ajouté. Revenir à `"tiered"` pour réactiver la palette.

`placement` accepte :

- `"top-right"` : en haut à droite de l’image ;
- `"bottom-right"` : en bas à droite de l’image ;
- `"metadata"` : **valeur par défaut**, sous la date centrée, hors de l’image,
  avec le même composant, dans les deux vues Illustration.

Les positions superposées n’ajoutent aucune hauteur à la carte ni à l’image.
La position `metadata` ajoute seulement la hauteur du badge et un petit espacement
lorsqu’une durée existe ; sans durée, aucune ligne vide n’est créée.
Les dimensions et le recadrage de l’image restent inchangés en vue Grandes cartes.
Dans cette vue, le badge est centré et suspendu sur la bordure basse. Il reste
dans le flux avec une marge négative ; une marge extérieure équivalente réserve
son dépassement dans la grille, même si le texte occupe plusieurs lignes.
La Liste compacte garde le badge à l’intérieur, sans dépassement décoratif.
Une position invalide revient à
`top-right`. Le badge n’intercepte ni clic, ni geste, ni focus.

## Palette et dimensions

Fichier : `src/components/ProductionTimeBadge.css`.

Le bloc `:root` contient les valeurs du thème clair ; `.dark` surcharge
uniquement les trois palettes du thème sombre. Exemple pour le vert clair :

```css
--work-badge-short-bg: #e5efe5;
--work-badge-short-text: #1f4b33;
--work-badge-short-border: #73927a;
```

Les mêmes paramètres existent pour `medium`, `long` et `neutral`. Pour changer
une couleur dans les deux thèmes, modifier aussi son override `.dark` s’il
existe. Le mode neutre réutilise les couleurs du portfolio.

Variables de dimensions réellement utilisées :

| Variable | Défaut | Effet |
| --- | --- | --- |
| `--work-badge-padding-block` | `.3rem` | Espacement vertical interne |
| `--work-badge-padding-inline` | `.45rem` | Espacement horizontal interne |
| `--work-badge-max-width` | `10rem` | Largeur maximale, aussi limitée par la carte |
| `--work-badge-font-size` | `.8125rem` | Police latine (13 px) |
| `--work-badge-font-size-ja` | `.875rem` | Police japonaise (14 px) |
| `--work-badge-line-height` | `1.35` | Interligne du badge |
| `--work-badge-icon-size` | `.85rem` | Horloge |
| `--work-badge-radius` | `0px` | Arrondi |
| `--work-badge-border-width` | `1px` | Épaisseur de bordure |
| `--work-badge-edge-gap` | `.45rem` | Distance aux bords de l’image |
| `--work-badge-bg-opacity` | `1` | Opacité du fond uniquement, de 0 à 1 |

Exemple : `--work-badge-edge-gap: .6rem` éloigne le badge du bord ;
`--work-badge-padding-inline: .6rem` augmente son espacement interne.
Les petits cadres peuvent faire revenir le libellé ou la durée à la ligne,
sans couper le texte ni imposer des polices minuscules.
À 375 px et moins, le padding utilise 75 % de ces valeurs. Le libellé latin
est légèrement compacté (minimum 12,5 px), mais la durée reste à 13 px et les
textes japonais à 14 px par défaut. Cette règle ciblée est commentée en fin
de CSS ; elle n’affecte ni les images ni les autres emplacements.

### Étiquette Illustration centrée

Les ajustements locaux sont dans `src/components/gallery/IllustrationViews.css` :

- Dépassement sous les grandes cartes : `--illustration-badge-overhang: 1.5rem`
  (environ 22 px visibles après la bordure). Cette valeur réserve aussi
  l’espace nécessaire avant la rangée suivante ; aucune hauteur de badge fixe.
- Largeur : `width: max-content`, avec `--work-badge-max-width: 100%` limité
  par les métadonnées et leur padding. Ce n’est pas une largeur fixe : un libellé
  court produit un badge étroit, un libellé long s’élargit puis revient à la ligne.
- Centrage : `.work-badge__copy` et `.work-badge__duration` dans ce même fichier ;
  les autres emplacements et les badges Manga restent inchangés.

Le padding reste réglé par `--work-badge-padding-block` / `--work-badge-padding-inline`
dans `ProductionTimeBadge.css`. L’espace libellé–durée est le `margin-top: .15rem`
de `.work-badge__duration`, l’espace horloge–durée son `gap: .3rem`.
Les tailles de police restent `--work-badge-font-size` / `--work-badge-font-size-ja`.

Conserver l’opacité `1` est recommandé : le contraste ne dépend alors pas
du dessin sous le badge. Une opacité réduite exige de revérifier le contraste
sur des images noires, blanches et colorées (au moins 4,5:1).

## Textes et autres emplacements

Les textes courts sont dans `productionTime.compact`, dans :

- `src/content/ui.js` (English) ;
- `src/i18n/translations/fr.js` (Français) ;
- `src/i18n/translations/ja.js` (日本語).

Mesuré : **Time spent / Temps de travail / 制作時間**.
Estimé : **Estimated time / Temps estimé / 推定制作時間**, avec
`approx.`, `≈` ou `約`. Les libellés complets pour lecteurs d’écran restent
localisés, sans répétition de la copie visuelle.

Les cartes Manga réutilisent le badge neutre existant, désormais accompagné
d’un libellé **Total time / Temps total / 総制作時間**. Les seuils Illustration
ne leur sont jamais appliqués. Le Reader reste neutre avec un libellé explicite
par page. La lightbox conserve sa présentation textuelle détaillée et ses
groupes secondaires ; les groupes ne deviennent jamais des durées individuelles.

## Évolution et retour aux valeurs initiales

Un quatrième niveau n’est pas un réglage actuellement exposé. Pour en ajouter
un plus tard : ajouter une limite à la configuration, étendre la comparaison
dans `getProductionTimeBadgeAppearance` (`src/utils/publicProductionTime.js`),
ajouter sa variante et ses trois couleurs dans le CSS, puis tester les limites
exactes. Il n’est pas nécessaire de créer un autre composant ou de modifier les
catalogues.

Pour retrouver le rendu par défaut, rétablir la configuration ci-dessus et les
valeurs commentées du CSS. Après chaque personnalisation, vérifier les trois
langues, les deux thèmes et notamment 320/375/390 px, puis lancer :

```text
npm run production-time:public-test
npm run production-time:public-browser-test
npm run lint
npm run build
git diff --check
```

Les fixtures navigateur sont injectées en mémoire. Aucun catalogue réel n’est
modifié. Une vérification sur téléphone Android physique reste recommandée.
La mise à jour de GitHub Pages nécessite votre publication normale ultérieure.
