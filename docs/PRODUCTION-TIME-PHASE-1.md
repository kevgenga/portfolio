# Temps de réalisation — Phase 1

Lancer `npm run artwork-admin`, puis ouvrir une œuvre en **Édition rapide** ou **Modifier / renommer / supprimer**. Le même bloc « Temps de réalisation » figure au début des deux formulaires.

- Saisir des heures entières ≥ 0 et des minutes de 0 à 59, sans limite de 24 h. Exemple : 2 h + 30 min = 150 minutes.
- **Temps mesuré** : durée effectivement mesurée. **Temps estimé** : estimation manuelle. Aucun temps n’est déduit des images ou dates.
- Cliquer **Enregistrer le temps** : cette action indépendante ne sauvegarde pas les autres champs en cours de modification et ne traite jamais l’image. Pour sauvegarder également les autres champs, utiliser ensuite le bouton habituel du formulaire.
- Pour modifier, changer les chiffres ou uniquement le type, puis enregistrer. Les deux éditeurs utilisent la même donnée dans `src/content/artworks.js` : `productionTime: { minutes: 150, kind: "actual" }` (`"estimated"` pour une estimation).
- Une saisie entièrement vide conserve le temps existant. Une saisie partielle, invalide ou 0 h 0 min est refusée. Pour supprimer, utiliser **Effacer le temps de réalisation**, puis confirmer : seule cette propriété est retirée.

Le champ reste facultatif. Les anciennes œuvres et les nouveaux imports n’en reçoivent aucun automatiquement. Aucun affichage public n’est ajouté.

## Sauvegardes et sécurité

Avant chaque changement effectif, l’Admin crée une sauvegarde horodatée du catalogue dans `tools/artwork-admin/backups/` (les 20 dernières sont conservées). Le fichier généré est validé, contrôlé par Node et remplacé atomiquement. Un échec avant remplacement laisse le catalogue précédent intact et nettoie le fichier temporaire. Renommage, catégories, visibilité, remplacement et optimisation conservent la durée enregistrée dans l’œuvre, même si son ID change.

Une ancienne sauvegarde reste lisible : sa restauration restitue son état historique, sans inventer les durées absentes. Pour restaurer manuellement, arrêter l’Admin, conserver une copie du catalogue actuel, copier la sauvegarde choisie vers `src/content/artworks.js`, puis redémarrer. Restaurer le catalogue seul ne restaure pas les médias déplacés par d’autres opérations.

Les sauvegardes de durée vérifient une empreinte du catalogue, puis la revérifient juste avant son remplacement. Si le catalogue a changé dans un autre panneau ou VS Code, une erreur demande d’actualiser : le brouillon n’est pas effacé. Cette protection n’est pas un verrou sur VS Code ; une course minuscule entre la dernière vérification et le remplacement reste possible. Les autres opérations conservent leurs protections existantes.

## Tests et suite

`npm run production-time:test` teste le modèle et l’API sur un catalogue et des images synthétiques temporaires. `npm run artwork-admin:test` l’inclut après les tests existants. `npm run production-time:browser-test` utilise un vrai Chrome isolé (chemin personnalisable avec `PRODUCTION_TIME_TEST_CHROME`), jamais le catalogue réel.

Phase 2 : durées Manga et pages, après validation de leur modèle. Les groupes, l’édition collective (Phase 3) et l’affichage public (Phase 4) ne sont pas implémentés ici.
