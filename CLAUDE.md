# CLAUDE.md — L'Arène

Contexte projet pour Claude Code. Complète le `README.md` (pile technique, démarrage, routes) :
ce fichier documente les règles métier qui ne se lisent pas facilement dans le code — ce qu'est
le produit, le parcours de candidature, l'écran admin de pilotage des éditions — et surtout
l'écart entre la cible produit et ce qui est réellement implémenté aujourd'hui.

## Ce qu'est L'Arène

Une plateforme d'**organisation de compétitions pour les jeunes**, organisée par **éditions**.
Selon l'édition, la compétition peut être **sportive** ou **intellectuelle** : la plateforme
(inscriptions, vérification des dossiers, créneaux, convocations, check-in, résultats,
classements, galeries, notifications) est la même, seule la discipline change.

La **première édition est le tournoi de duels de football 1v1** — c'est elle qui est
implémentée aujourd'hui, et c'est pourquoi une bonne partie du code est encore écrite en dur
pour ce format (voir « Écarts à combler »).

## Le compte candidat est permanent

Le candidat **s'inscrit lui-même** : il n'y a pas de parent ou de tuteur qui crée un compte à sa
place. Son compte (`User`, rôle `candidate`) est **conservé d'une édition à l'autre**.

- Un **nouveau candidat** fait le parcours complet : dossier, pièces, confirmation à distance,
  puis confirmation en présentiel qui atteste que la personne existe réellement.
- Un **candidat qui revient** pour une édition suivante ne refait pas cette vérification
  d'identité : son existence est déjà établie. **On ne reconfirme que ses résultats scolaires**
  (bulletin de l'année en cours, nouvelle moyenne).

Le **numéro de téléphone d'un parent** est demandé dans le formulaire. Ce n'est pas un compte ni
une autorisation parentale : c'est un **contact de secours** pour que l'organisation puisse
joindre la famille. Le candidat reste l'interlocuteur et le titulaire du dossier.

Modélisation : le `User` porte le compte permanent, la `Registration` porte la candidature **à
une édition donnée** (`editionId` + `candidateId`). Le champ s'appelle `candidateId` et non
`parentId` pour cette raison.

### Le nom est saisi une seule fois

Le candidat saisit son **nom complet en un seul champ**, à la création de son compte. Pas de
prénom/nom séparés : les noms djiboutiens s'écrivent en chaîne (nom propre, nom du père, nom du
grand-père) et ne se découpent pas en deux cases.

Ce nom **n'est plus jamais modifié** et vaut pour toutes les éditions. Le formulaire de
candidature ne le redemande pas : il l'affiche en lecture seule. `Registration.player.name` en
garde une copie, posée par l'API à la création du brouillon, que le candidat ne peut pas changer
— le dossier conserve ainsi le nom tel qu'il était au moment de la candidature.

Le reste du dossier (école, notes, bulletin, photo, rôle) change librement d'une édition à
l'autre. Affichage public : premier nom + initiales des suivants
(`registrationSchema.virtual('publicName')`), jamais le nom complet d'un mineur.

### Un seul dossier par édition, et pas de suppression

- `registrations.service.createDraft` rend le dossier existant si le candidat en a déjà un pour
  cette édition, **quel que soit son statut**. Sans ce contrôle, un candidat dont le dossier
  était déjà envoyé repartait sur un dossier vierge et se retrouvait avec deux candidatures
  concurrentes dans la même édition.
- La règle est **garantie en base** par un index unique `{ editionId, candidateId }`. Le
  contrôle applicatif seul lit puis écrit : deux requêtes simultanées (double clic, réessai sur
  réseau lent, deux onglets) passent toutes les deux le `findOne` et créent chacune leur
  dossier. `createDraft` rattrape l'erreur `11000` et rend le dossier gagnant, pour que la
  course se solde par un dossier correct plutôt que par un conflit à l'écran.
  En production, `autoIndex` est désactivé (`core/db.js`) : l'index vient de la migration
  `2026-10-dossier-unique-par-edition.js`, qui retire d'abord les brouillons surnuméraires et
  refuse d'aller plus loin si un candidat porte deux dossiers déjà engagés — ce cas relève du
  staff, pas d'un script.
- **Le candidat ne peut pas supprimer son dossier.** Un dossier engage l'organisation (place
  réservée, rendez-vous, vérification déjà faite) : son retrait passe par le staff. Il n'existe
  ni route `DELETE /registrations/:id` ni bouton dans l'espace candidat.

## Parcours de candidature (de bout en bout)

1. **Pré-inscription en ligne** (`inscription/formulaire.vue`, module `registrations`) : le
   candidat crée son compte et remplit son dossier en 4 étapes (joueur, notes, autorisations,
   récapitulatif). Tant qu'il n'a pas envoyé, le dossier est un brouillon (`draft`), sauvegardé
   à chaque étape. À l'envoi il passe `submitted` : c'est l'état **« préinscrit, non
   confirmé »**.
   - **Deux pièces, en photo ou en scan uniquement.** Le **bulletin scolaire**
     (`grades.bulletinFileId`) et le **portrait du candidat** — la photo de son visage
     (`player.photoFileId`), prise de face. Aucune pièce papier n'est attendue à ce stade.
   - **Le portrait est obligatoire à l'envoi**, pas pendant le brouillon : `submit` le réclame
     (`registrations.service.submit`) mais `playerStepSchema` le laisse optionnel, pour qu'une
     étape s'enregistre avant que le fichier soit déposé. C'est la pièce que le staff compare au
     visage présenté au rendez-vous : sans elle, le contrôle d'identité n'a rien à comparer.
   - **Aucune signature numérique.** Les autorisations (`consents`) sont de simples cases à
     cocher (participation, droit à l'image, vidéos monétisées, authenticité du bulletin). Il
     n'y a pas de champ « nom du signataire » : le contrat se signe plus tard, sur place, sur
     papier. Choix produit délibéré — voir « Écarts assumés ».
2. **Première confirmation, à distance** (`staff/dossiers.vue`,
   `registrations.service.review`) : l'organisation examine les pièces. Le dossier passe
   `under_review`, puis `approved`, `rejected` ou `changes_requested`. Un dossier hors critères
   (âge, moyenne, rôle complet, doublon) n'est **jamais rejeté automatiquement** : il part au
   staff avec ses signalements (`flags`), qui tranche.
3. **Convocation au rendez-vous administratif** : un dossier `approved` reçoit un créneau
   (`slotId`, pointant un `Slot` de nature `checkin`) et passe `scheduled`. Ce rendez-vous se
   tient **dans la semaine qui précède le tournoi**, pas le jour du jeu.
4. **Deuxième confirmation, en présentiel** (`staff/checkin.vue`,
   `registrations.service.checkIn`) : c'est l'étape qui **scelle la candidature** et qui atteste
   que **la personne existe vraiment**. Le staff scanne le badge QR, contrôle l'identité
   (`identityChecked`), fait signer le **contrat papier** (`contractSigned`, condition
   bloquante) et encaisse les frais **en espèces**.
5. **Validation → statut « Inscrit »** : contrat signé et frais encaissés, le staff valide. Le
   dossier reçoit un numéro de dossard (`bibNumber`) et affiche **« Inscrit »**. Note
   d'implémentation : ce libellé correspond en base au statut `checked_in` (voir « Écarts
   assumés »).
6. **Affectation à une session de jeu** : l'inscrit reçoit un `sessionId` (un `Slot` de nature
   `competition`), posé par `registrations.service.attachSession` — en masse via
   `slots.service.distribute` avec `kind: 'competition'`, ou au cas par cas via
   `slots.service.assign`. **Aucun statut ne change** : le candidat est déjà « Inscrit »,
   recevoir son horaire de jeu ne l'inscrit pas une seconde fois.
7. **Compétition** : `checked_in` → `qualified`/`eliminated` → éventuellement `finalist`, ou
   `disqualified`/`no_show` selon le déroulé.

### Les deux rendez-vous sont séparés d'une semaine

**Les validations, signatures et encaissements se terminent une semaine avant le premier duel.**
Le jour J, tout le monde est déjà inscrit, dossard en main : il ne reste qu'à jouer. C'est la
raison d'être de `Slot.kind` :

| | `kind: 'checkin'` | `kind: 'competition'` |
| --- | --- | --- |
| Quand | la semaine précédant le tournoi | pendant le tournoi |
| Porté par | `Registration.slotId` | `Registration.sessionId` |
| On y fait | identité, contrat papier, encaissement, dossard | les duels |
| Statut consommé | `scheduled` | `checked_in` |
| Plafond qui fait foi | `capacity.total` (le rôle est sans importance) | `capacity.striker` / `capacity.defender` |
| Clôture → absents | `scheduled` → `no_show` (`markNoShows`) | `checked_in` sans rencontre jouée → `no_show` (`markCompetitionNoShows`) |
| Caisse | `slots.service.cashReport` | aucune |

Ce qui en découle, et qui se lit mal dans le code :

- **`checkIn` refuse après le coup d'envoi** (`edition.startsAt`), avec la clé `checkinClosed` —
  encaisser et faire signer un contrat de participation alors que les duels sont en cours n'a pas
  de sens, et le dossier échapperait aux rencontres déjà générées. La comparaison se fait sur
  `occurredAt`, pas sur l'heure courante : l'écran de check-in travaille hors ligne et
  `syncCheckins` rejoue ses opérations plus tard — un pointage fait à temps ne doit pas être
  refusé parce que la synchronisation, elle, arrive en retard.
- **`Edition.checkinDeadline`** (virtuelle, `startsAt - CHECKIN_LEAD_TIME_DAYS`) est la cible que
  l'organisation se donne. Elle est **indicative** : elle guide la répartition, elle ne bloque pas
  un retardataire. Ce qui est réellement refusé, c'est un créneau du mauvais côté du coup d'envoi
  (`checkinAfterStart`, `sessionBeforeStart`).
- **`checked_in` → `no_show` est désormais une transition légale.** Un joueur peut avoir signé et
  payé une semaine plus tôt puis ne pas venir jouer. Tant que les deux moments étaient confondus,
  le cas n'existait pas.
- **Les rencontres se génèrent sur `sessionId`, jamais sur `slotId`** — les groupes du pointage
  ont été constitués par ordre d'arrivée des dossiers, une semaine plus tôt, et mélangent les
  rôles sans contrainte d'équilibre. `results.service.generateForSession` refuse un créneau
  `checkin` (`notACompetitionSlot`).
- **Deux jeux de notifications** : `slot_assigned`/`slot_reminder` annoncent le rendez-vous
  administratif et réclament les frais en espèces ; `session_assigned`/`session_reminder` ne
  parlent que d'horaire et de dossard. Le choix se fait sur le `kind` porté par l'évènement
  `slot.assigned`.

### Les trois phases de la compétition

`MATCH_PHASES = ['qualification', 'barrage', 'finale']`.

1. **Qualification**, par session de jeu : chaque buteur affronte `OPPONENTS_PER_STRIKER` (3)
   défenseurs de sa session, 5 tentatives par duel.
2. **Barrage** (`results.service.selectBarrage`), à l'échelle de l'édition : les
   `BARRAGE_PER_ROLE` (8) meilleurs de chaque rôle et de chaque catégorie se rencontrent dans un
   tableau fermé de `BARRAGE_OPPONENTS` (4) duels chacun.
3. **Finale** (`selectFinalists`) : les `FINALISTS_PER_ROLE` (2) meilleurs de chaque rôle,
   croisement 2×2 → 4 rencontres par catégorie, et **4 vainqueurs** (un buteur et un défenseur
   dans chacune des deux catégories).

**Pourquoi le barrage existe.** En qualification, un buteur n'affronte que 3 défenseurs tirés
dans un effectif de plusieurs dizaines : le maximum (15 points) est atteint par plusieurs
joueurs et les lots d'adversaires sont très inégaux. Désigner les finalistes directement sur ce
classement revenait à trancher au tirage au sort. Le barrage place les prétendants face à la
même opposition, et c'est **lui** que `selectFinalists` lit dès qu'il a été joué — repli sur la
qualification pour une édition trop petite pour justifier un tour intermédiaire.

Barrage et finale **n'ont pas de créneau** : leurs rencontres se composent depuis le classement,
à l'échelle de l'édition, et se lisent par phase (`listForPhase`, `GET /editions/:id/matches?phase=`).
`pendingBeforeFinals` compte la qualification **et** le barrage : passer en `finals` avec des
résultats de barrage manquants désignerait les finalistes sur un classement incomplet.

**Le départage ne tombe jamais sur l'heure de passage.** `rankStrikers`/`rankDefenders`
enchaînent : points → duels gagnés → ratio → **force de l'opposition** → dernière rencontre
jouée. L'opposition (somme des arrêts des défenseurs affrontés, et symétriquement) est calculée
par `playerRankings`, qui collecte les adversaires dans l'agrégation ; elle n'est pas exposée
dans la réponse sous forme de liste d'identifiants, seulement en total.

### Correspondance vocabulaire métier ↔ statuts en base

| Ce qu'on dit | `Registration.status` |
| --- | --- |
| Brouillon | `draft` |
| Préinscrit, non confirmé | `submitted`, puis `under_review` |
| Dossier confirmé à distance | `approved` |
| Convoqué | `scheduled` |
| Inscrit (confirmé en présentiel) | `checked_in` |

### Champs clés du modèle `Registration`

- `consents` : cases cochées en ligne, horodatées (`submittedAt`), sans identité de signataire.
- `contract.signed` / `signedAt` / `signedBy` : preuve de la signature papier sur place, posée
  par `registrations.service.checkIn`.
- `payment.status/amount/receivedBy/receivedAt` : encaissement sur place, au même moment que la
  signature du contrat.
- `flags` : signalements des contrôles automatiques (âge, moyenne, rôle complet, doublon) —
  jamais un refus automatique, toujours une alerte pour le staff.
- `dedupeKey` : même nom + même date de naissance + même école **dans une édition** = doublon.

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
  - Candidatures : tunnel de statuts (`AreneBarChart`) du dépôt au podium, total de dossiers,
    lien direct vers `/staff/dossiers?editionId=<id>` pour la liste détaillée des dossiers de
    **cette** édition précisément (le filtre `editionId` de query string prime sur l'édition
    courante).
  - Paiements : répartition payé/exonéré/dû, montants.
  - Écoles les plus représentées, créneaux de l'édition (table + création).
  - Transition de statut d'édition (mêmes règles que `EDITION_TRANSITIONS`).
- **Configuration** (`admin/pages/admin/index.vue`) : ne gère plus que ce qui est transverse aux
  éditions — comptes de l'organisation (staff/admin) et import du référentiel des écoles. La
  gestion par édition (statut, créneaux, quotas, candidatures) vit dans `/admin/editions/*`.
- **`AreneBarChart`** (`base/components/AreneBarChart.vue`) : diagramme en barres horizontales
  générique (label, valeur, teinte), utilisé pour le tunnel de candidatures et la répartition
  des paiements. Pas de dépendance externe — SVG/CSS maison, cohérent avec `AreneMeter`.

## Écarts assumés (décisions d'implémentation)

- **« Statut inscrit »** : plutôt que d'ajouter une valeur d'énumération (`checked_in` est
  profondément câblé dans `results.service`, `slots.service`, `SEAT_HOLDING_STATUSES`, les
  classements et les notifications), le libellé affiché a été renommé « Inscrit »
  (`status.checked_in` dans les locales) ; la valeur interne reste `checked_in`.
  Fonctionnellement c'est le même évènement : présentation sur place, contrôle d'identité,
  signature du contrat, encaissement, dossard.
- **Contrat et créneau sont séparés** — c'était un écart assumé, ce n'est plus le cas. Le `Slot`
  porte désormais un `kind` (`checkin` / `competition`) et la `Registration` deux références
  distinctes (`slotId` / `sessionId`). Voir « Les deux rendez-vous sont séparés d'une semaine ».
  La migration `2026-10-creneaux-checkin-et-competition.js` étiquette les créneaux existants en
  `checkin` et **ne recopie volontairement pas** `slotId` dans `sessionId` : les groupes du
  pointage ne sont pas des groupes de jeu.
- **Un `Slot` sert les deux natures, plutôt que deux modèles** : capacité, occupation, agenda,
  attribution, clôture et QR sont identiques de part et d'autre — seule la liste visée change
  (`slotId` ou `sessionId`). Un modèle `Session` séparé aurait dupliqué tout le CRUD des créneaux
  et l'écran d'agenda pour une différence qui tient dans un champ.
- **Pas de rôle parent** : le candidat est titulaire de son dossier. Le parent n'existe que
  comme numéro de contact.

## Écarts à combler (cible produit non encore implémentée)

Ces points font partie de la définition du produit ci-dessus mais **n'existent pas encore dans
le code**. Ne pas les décrire comme faits.

1. **Numéro de téléphone du parent** — aucun champ nulle part : ni dans `Registration` (le
   modèle n'a pas de bloc contact), ni dans `playerStepSchema`
   (`packages/shared/src/schemas/registration.js`), ni dans le formulaire. À noter :
   `candidateContactSchema` existe dans ce même fichier mais **n'est utilisé par aucune route**.
   Un ajout propre touche : le schéma Zod partagé, `registrations.model.js`, l'étape 1 de
   `inscription/formulaire.vue`, les locales fr/ar, et `exportRows` (colonne CSV).
2. **Discipline de l'édition (sportive / intellectuelle)** — `Edition` n'a ni `type` ni
   `discipline`. Toute la mécanique de compétition est écrite pour le 1v1 football :
   `PLAYER_ROLES = ['striker','defender']`, `capacity.{lycee,universite}.{striker,defender}`,
   `ATTEMPTS_PER_MATCH`, `OPPONENTS_PER_STRIKER`, `MATCH_PHASES`, `ATTEMPT_OUTCOMES`,
   `SCHOOL_POINTS` (tous dans `packages/shared/src/constants.js`), plus `results.service`. Une
   édition intellectuelle demandera au minimum un `Edition.discipline` et de rendre les rôles,
   le barème et le format de rencontre dépendants de l'édition plutôt que globaux.
3. **Réinscription allégée d'un candidat connu** — partiellement fait. Le **nom** est désormais
   repris du compte et n'est plus redemandé (voir « Le nom est saisi une seule fois »). Le reste
   ne l'est pas : `registrations.service.createDraft` ouvre un dossier qui ne reprend ni l'école,
   ni la photo, ni la date de naissance des candidatures passées. La cible est de **les
   pré-remplir depuis la dernière candidature** et de ne demander que les notes et le nouveau
   bulletin, en sautant la revérification d'identité en présentiel.
4. **`anonymizeEdition` travaille contre la réutilisation** — à la clôture d'une édition,
   `registrations.service.anonymizeEdition` efface `player.name`, `player.birthDate`,
   `player.photoFileId` et `grades.bulletinFileId` sur les dossiers de l'édition. Le compte
   `User` survit, mais plus aucune donnée de dossier n'est récupérable pour pré-remplir une
   candidature suivante. Si le point 3 est implémenté, il faudra décider où vit le profil
   durable du candidat (probablement sur le `User`, qui n'est pas anonymisé) plutôt que de
   dépendre d'une `Registration` archivée.
5. **Distinguer « jamais vérifié en présentiel » de « déjà vérifié »** — rien ne marque
   aujourd'hui qu'un candidat a été authentifié physiquement lors d'une édition passée. Cette
   information conditionne tout le point 3 ; sa place naturelle est le `User` (par exemple un
   `identityVerifiedAt` / `identityVerifiedBy`), pas la `Registration`.

## Pour aller plus loin

- `registrations.service.checkIn` est le point d'entrée unique de la confirmation en présentiel
  (identité + contrat + paiement + dossard) : toute évolution du parcours passe par là, pas par
  une nouvelle route.
- Les quotas affichés dans `/admin/editions/[slug]` viennent de `editions.service.seatsLeft`,
  qui compte les dossiers aux statuts de `SEAT_HOLDING_STATUSES` — un dossier `rejected` ou
  `draft` ne consomme jamais de place.
- Le CSV d'export (`registrations.service.exportRows`) inclut une colonne « Contrat signé »
  (oui/non), et deux colonnes distinctes « Rendez-vous » (administratif) et « Session de jeu ».
- Les écrans staff filtrent la grille sur la nature du créneau : `staff/checkin.vue` et
  `staff/caisse.vue` ne listent que les `checkin`, `staff/resultats.vue` que les `competition`
  (`editions.fetchSlots(editionId, kind)` → `GET /editions/:id/slots?kind=`). Sans ce filtre, le
  staff choisissait dans une liste mélangée.
