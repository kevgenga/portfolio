# Phase 3 — Édition multiple et groupes de production

Cette fonctionnalité reste **locale**, dans Artwork Admin et Manga Admin. Aucun
temps n’est affiché dans le portfolio public. Les catalogues et médias réels ne
sont jamais utilisés par les tests.

## Utilisation

Lancer `npm run artwork-admin`. Dans la galerie Artwork ou dans Manga → Modifier
→ Langues & pages, cocher **Sélectionner** sur les cartes concernées. La commande
**Sélectionner les cartes filtrées affichées (N)** ajoute uniquement ces cartes à
la sélection, pas tout le catalogue. **Effacer la sélection** ne modifie rien.

La sélection Artwork est conservée pendant les recherches, filtres, changements
de visibilité et tris. Le compteur signale les éléments sélectionnés hors des
cartes actuellement affichées. Dans Manga, la sélection traverse les langues du
même projet ; changer de projet la réinitialise avec un avertissement.

Cliquer **Temps — modification groupée** :

- **Même durée individuelle pour chaque élément** : 10 dessins × 2 h 30 donnent
  chacun 150 minutes. Aucun groupe n’est créé. Par défaut, seuls les dessins sans
  durée sont renseignés. Choisir explicitement « Remplacer » pour les autres.
- **Durée totale de l’ensemble — groupe** : un groupe de 10 dessins avec 15 h
  reçoit un seul total de 900 minutes. Les temps individuels restent inchangés.
  Il n’y a aucune répartition, somme automatique ou mise à jour du total Manga.
- **Effacer les durées individuelles de la sélection** : seules les durées
  individuelles existantes sont retirées. Par exemple, 5 dessins dont 3 avec
  durée donnent 3 durées effacées et 2 éléments ignorés. Aucun média, groupe,
  membre de groupe, association linguistique ou temps global Manga n’est effacé.

Saisir des heures et des minutes entières (minutes : 0 à 59), ainsi que mesuré ou
estimé. Minutes est prérempli à `0` pour une nouvelle opération : saisir `1` dans
Heures suffit pour une durée d’une heure. Aucune limite
de 24 h ; total strictement positif et entier numériquement sûr. Les deux champs
vides ne suppriment rien ; lors de l’édition d’un groupe ils conservent sa durée.

Le **récapitulatif automatique** affiche fichiers/éléments, dessins distincts,
durée et opération, valeurs existantes, créées, remplacées, conservées, effacées
et ignorées. La saisie incomplète affiche une indication ; pendant le calcul,
« Préparation du récapitulatif… » explique pourquoi la confirmation est
désactivée. Il n’y a aucun clic obligatoire sur « Prévisualiser ».

Le serveur valide toujours le récapitulatif. Les changements de durée, type,
opération, politique de remplacement, sélection ou paramètres/membres du groupe
déclenchent un recalcul après 250 ms de pause. Les réponses anciennes, dans le
désordre ou arrivées après fermeture sont ignorées. Chaque changement pertinent
invalide immédiatement la confirmation précédente. **Actualiser le récapitulatif**
est un bouton facultatif pour réessayer après une erreur.

Les remplacements et recouvrements exigent encore une case de confirmation
supplémentaire. Cliquer ensuite **Confirmer l’opération**. Le calcul n’écrit
jamais de données ; Annuler ou Escape n’enregistre rien.

En mode effacement, heures/minutes/type/politique sont masqués et désactivés.
Le bouton rouge **Effacer les N durées** constitue la confirmation explicite,
sans confirmation redondante. Une sélection sans durée affiche un résultat
normal avec confirmation désactivée : aucune écriture ni sauvegarde inutile.

## Consulter et modifier les groupes

**Groupes de production** affiche nom administratif facultatif, membres, temps
total et type. Déplier « Consulter les membres » pour voir leur liste.

**Modifier le groupe** permet de changer nom, durée et type. Déplier « Modifier
les membres du groupe », cocher/décocher les dessins, ou utiliser la sélection
courante. Vérifier le récapitulatif automatique puis confirmer. Un groupe vide est refusé : utiliser
**Supprimer le groupe** pour le retirer explicitement. Cette suppression ne
supprime ni les œuvres, ni les médias, ni les durées individuelles.

Des membres communs entre groupes sont permis après avertissement et
confirmation, même si les groupes ont exactement les mêmes membres. Aucun total
de ces groupes n’est présenté comme une somme exacte.

## Modèles et compatibilité

Artwork conserve les groupes dans le même fichier `src/content/artworks.js` :

```js
export const artworkProductionGroups = [
  { id: "group-uuid", name: "Études", time: { minutes: 900, kind: "estimated" },
    artworkIds: ["artwork-a", "artwork-b"] }
];
```

Cet export est facultatif. Tous les écrivains du catalogue le préservent ; un
renommage met à jour ses références dans la même écriture atomique. Aucune
initialisation ni migration des œuvres réelles n’est effectuée au démarrage.

Manga conserve les groupes facultatifs dans `productionTime.groups` :

```js
groups: [
  { id: "group-uuid", name: "Scène", time: { minutes: 1080, kind: "estimated" },
    pageIds: ["drawing-a", "drawing-b"] }
]
```

Les groupes référencent les **dessins logiques**, jamais positions ou noms.
Deux fichiers linguistiques explicitement associés à un même `pageId` comptent
pour un dessin : le compteur distingue fichiers et dessins. Même nom/numéro
n’est pas une preuve d’association. Les pages sans identité en reçoivent une
uniquement lors de l’enregistrement confirmé qui en a besoin. Les chemins
ambigus ou références obsolètes sont refusés.

L’effacement compte chaque dessin lié une seule fois : 2 fichiers English/French
avec le même `pageId` donnent 1 durée effacée. Une page sans identité/durée est
ignorée, sans création d’ID. Seul `productionTime` de l’illustration ou `time` du
dessin Manga est retiré. Les identifiants et bindings existants sont conservés,
y compris pour un dessin historique qui ne possède ensuite plus de durée.

## Renommages, suppressions et historique

- Artwork : masquer/réafficher, remplacer et optimiser conservent le groupe.
  Renommer met à jour les IDs référencés. Supprimer un membre est **bloqué** tant
  qu’il n’a pas été retiré explicitement du groupe (ou le groupe supprimé).
  Aucun membre ni total collectif n’est perdu silencieusement.
- Manga : réordonner ou remplacer en mode `keep` conserve l’identité et le
  groupe. Remplacement `new`, duplication ou désassociation crée une identité
  distincte **sans hériter du groupe**. La durée individuelle copiée lors d’une
  désassociation reste le choix explicite de la Phase 2.
- Supprimer une page/langue ou remplacer un dessin conserve les anciens membres
  de groupes comme **dessins historiques sans page**. Ils restent consultables
  et retirables via l’édition du groupe, même sans durée individuelle.
- Associer deux dessins utilisés par des groupes demande une confirmation
  supplémentaire. Les membres sont dédupliqués, les totaux collectifs ne
  changent pas. Cette fusion peut créer des recouvrements ; aucun cumul n’a lieu.

## Sécurité et sauvegardes

Chaque opération valide le lot entier, les durées, IDs et références avant une
seule écriture du catalogue. Elle réutilise les sauvegardes, files d’attente et
écritures atomiques des Admin. Manga réutilise aussi son rollback transactionnel.
Artwork valide le JavaScript généré avant le renommage atomique du fichier
temporaire. En cas d’échec, les nouveaux temps ne sont pas partiellement sauvés.
Les opérations de durée n’utilisent aucun traitement/déplacement de média.

L’empreinte du catalogue doit correspondre à celle de la prévisualisation ; un
jeton lie la confirmation à son contenu exact. Une modification externe refuse
l’écriture, conserve le brouillon dans le dialogue et demande une actualisation.
Ce contrôle ne prétend pas verrouiller VS Code entre deux opérations filesystem.
Enregistrer les autres brouillons avant une opération groupée.

La confirmation exige le récapitulatif serveur correspondant exactement aux
paramètres actuels. Un double clic ne lance pas deux écritures. L’effacement
valide intégralement la sélection avant une seule transaction ; un échec ne
peut pas effacer seulement une partie des durées. Le backup contient l’état
complet précédent, avec temps individuels, groupes et éventuel total Manga.

Les backups historiques sans groupes restent lisibles. Pour restaurer, arrêter
l’Admin, conserver l’état actuel, puis remettre une sauvegarde cohérente du
catalogue. Après une opération avec corbeille/médias, restaurer aussi les fichiers
correspondants et vérifier les chemins. Il n’y a pas de nouveau bouton de
restauration ou de fusion automatique des backups dans cette phase.

## Validation et suite

`npm run production-groups:test` : modèles, API, indépendance, confirmations,
identités, CRUD, conservation, conflits, rollback et backups sur dossiers
temporaires. `npm run production-groups:browser-test` : Chrome isolé installé
localement (chemin personnalisable via `PRODUCTION_TIME_TEST_CHROME`), sélection,
groupes, langues, modes A/B/C, lots mixtes, absence de durée, récapitulatif
automatique, réponses retardées/inversées, erreurs et double soumission,
tactile, clavier et largeurs 375/390/768/1024/1440/1920.
Les tests navigateur des Phases 1 et 2 restent disponibles et inchangés.

Limite préexistante : le test de Phase 1 signale encore un débordement de 4 px
de la navigation entre modules à 375 px. Elle n’a pas été modifiée ici. Les
contrôles et dialogues ajoutés en Phase 3 sont vérifiés séparément sans
débordement. Les tests tactiles sont une émulation Chrome, pas une validation
sur un téléphone physique.

Vérifications manuelles recommandées : sélectionner quelques vrais éléments
sans enregistrer, tester les trois récapitulatifs automatiques puis annuler ; vérifier le
scroll sur votre téléphone et votre navigateur habituel. Tester ensuite une
opération choisie, contrôler son backup et recharger l’Admin.

La Phase 4 concernera l’affichage public EN/JA/FR, ses libellés et la présentation
des temps individuels/collectifs sans double comptage. Aucun badge public,
chronomètre, statistiques, facturation ou temps Animation n’est ajouté ici.
