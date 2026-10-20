# CLAUDE.md — L'Arène

Contexte projet pour Claude Code. Complète le `README.md` (pile technique, démarrage, routes) :
ce fichier documente les règles métier qui ne se lisent pas facilement dans le code, en
particulier le parcours de candidature et l'écran admin de pilotage des éditions.

## Parcours de candidature (de bout en bout)

1. **Pré-inscription en ligne** (`inscription/formulaire.vue`, module `registrations`) : le
   candidat crée son propre compte et remplit son dossier en 4 étapes (joueur, notes,
   autorisations, récapitulatif), et dépose les pièces **en photo** (bulletin scolaire, photo
   d'identité) — jamais de version papier à ce stade. Statut `draft` puis `submitted`.
   - **Aucune signature numérique.** Les autorisations (`consents`) sont de simples cases à
     cocher (participation, droit à l'image, vidéos monétisées, authenticité du bulletin). Il
     n'y a pas de champ « nom du signataire » : le contrat se signe plus tard, sur place, sur
     papier. C'est un choix produit délibéré — voir « Écarts assumés » plus bas.
2. **Vérification staff** (`staff/dossiers.vue`, `registrations.service.review`) : le staff
   passe le dossier à `under_review`, puis `approved`, `rejected` ou `changes_requested`. Un
   dossier hors critères (âge, moyenne, rôle complet, doublon) n'est jamais rejeté
   automatiquement : il part au staff avec ses signalements (`flags`), qui tranche.
3. **Convocation sur place** : un dossier `approved` reçoit un créneau (`slotId`, assignation
   automatique ou manuelle). Le candidat est invité à se présenter à cette occasion.
4. **Signature du contrat + paiement sur place** (`staff/checkin.vue`,
   `registrations.service.checkIn`) : le jour de la convocation, le staff scanne le badge QR,
   contrôle l'identité, fait signer le **contrat papier** et encaisse les frais **en espèces**.
   Le contrat signé est une condition bloquante (`contractSigned`, au même titre que
   `identityChecked`) : sans elle, l'inscription ne peut pas être validée.
5. **Validation → statut inscrit** : une fois le contrat signé et les frais encaissés, le staff
   valide l'inscription. Le dossier reçoit un numéro de dossard (`bibNumber`) et passe au
   statut affiché **« Inscrit »**. Note d'implémentation : ce libellé correspond en base au
   statut `checked_in` (voir « Écarts assumés »).
6. **Compétition** : `checked_in` → `qualified`/`eliminated` → éventuellement `finalist`, ou
   `disqualified`/`no_show` selon le déroulé.

### Champs clés du modèle `Registration`

- `consents` : cases cochées en ligne, horodatées (`submittedAt`), sans identité de signataire.
- `contract.signed` / `contract.signedAt` / `contract.signedBy` : preuve de la signature papier
  sur place, posée par `registrations.service.checkIn`.
- `payment.status/amount/receivedBy/receivedAt` : encaissement sur place, au même moment que la
  signature du contrat.
- `flags` : signalements des contrôles automatiques (âge, moyenne, rôle complet, doublon) —
  jamais un refus automatique, toujours une alerte pour le staff.

## Écran admin — Éditions, quotas, candidatures

Accessible aux comptes `admin` via `/admin/editions` (lien dans la nav back-office).

- **Liste des éditions** (`admin/pages/admin/editions/index.vue`) : toutes les éditions, y
  compris les brouillons (l'admin voit tout, contrairement au public). Table avec statut,
  saison, fenêtre d'inscription, total des places. Formulaire de création d'une nouvelle
  édition (titre fr/ar, slug, description, dates, frais, lieu, quotas par catégorie/rôle,
  moyenne minimale).
- **Détail d'une édition** (`admin/pages/admin/editions/[slug].vue`), par slug (réutilise
  `GET /editions/:slug`, qui renvoie le détail complet aux rôles `staff`/`admin`) :
  - Présentation : titre, description (fr/ar), saison, fenêtre d'inscription, lieu, frais,
    moyenne minimale — édition en place via `PATCH /editions/:id`.
  - Quotas : capacité par catégorie (lycée/université) et par rôle (buteur/défenseur), avec
    une jauge (`AreneMeter`) comparant places utilisées / places ouvertes
    (`GET /editions/:id/stats` → `seats`), et un formulaire pour ajuster les quotas.
  - Candidatures : tunnel de statuts (`AreneBarChart`, voir plus bas) du dépôt au podium, total de
    dossiers, lien direct vers `/staff/dossiers?editionId=<id>` pour la liste détaillée des
    dossiers de **cette** édition précisément (le filtre `editionId` de query string prime sur
    l'édition courante).
  - Paiements : répartition payé/exonéré/dû, montants.
  - Écoles les plus représentées, créneaux de l'édition (table + création).
  - Transition de statut d'édition (mêmes règles que `EDITION_TRANSITIONS`).
- **Configuration** (`admin/pages/admin/index.vue`) : ne gère plus que ce qui est transverse
  aux éditions — comptes de l'organisation (staff/admin) et import du référentiel des écoles.
  La gestion par édition (statut, créneaux, quotas, candidatures) vit désormais dans
  `/admin/editions/*`.
- **`AreneBarChart`** (`base/components/AreneBarChart.vue`) : diagramme en barres horizontales
  générique (label, valeur, teinte), utilisé pour le tunnel de candidatures et la répartition
  des paiements. Pas de dépendance externe — SVG/CSS maison, cohérent avec `AreneMeter`.

## Écarts assumés par rapport à la description initiale

- **« Statut inscrit »** : la description métier demande un statut affiché « inscrit » après
  signature du contrat et paiement sur place. Plutôt que d'ajouter une valeur d'énumération
  (`checked_in` est profondément câblé dans `results.service`, `slots.service`,
  `SEAT_HOLDING_STATUSES`, les classements et les notifications), le libellé affiché a été
  renommé « Inscrit » (`status.checked_in` dans les locales) ; la valeur interne reste
  `checked_in`. Fonctionnellement, c'est le même évènement : présentation sur place, contrôle
  d'identité, signature du contrat, encaissement, numéro de dossard.
- **Contrat vs créneau** : le créneau (`Slot`) reste à la fois le rendez-vous administratif
  (signature, paiement) et le moment de la compétition elle-même (les rencontres sont générées
  par créneau). Séparer les deux en évènements distincts n'a pas été demandé et aurait un impact
  large sur `results` et `slots` ; à réévaluer si un besoin réel de les distinguer apparaît
  (par exemple, un rendez-vous administratif plusieurs jours avant la compétition).
- **Inscription par le candidat lui-même** : il n'y a plus de notion de parent/tuteur qui créerait
  un compte pour un enfant mineur. Le candidat (lycéen ou étudiant) crée son propre compte et
  remplit lui-même son dossier. Le champ `Registration.candidateId` (ex-`parentId`) et le rôle
  `User.role: 'candidate'` (ex-`'parent'`) en gardent la trace dans le code ; c'est pourquoi le
  champ ne s'appelle pas `parentId`.

## Pour aller plus loin

- `registrations.service.checkIn` est le point d'entrée unique de la validation sur place
  (contrat + paiement + dossard) : toute évolution du parcours passe par là, pas par une
  nouvelle route.
- Les quotas affichés dans `/admin/editions/[slug]` viennent de `editions.service.seatsLeft`,
  qui compte les dossiers aux statuts de `SEAT_HOLDING_STATUSES` — un dossier `rejected` ou
  `draft` ne consomme jamais de place.
- Le CSV d'export (`registrations.service.exportRows`) inclut désormais une colonne
  « Contrat signé » (oui/non).
