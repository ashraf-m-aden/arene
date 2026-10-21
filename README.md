# L'Arène

Plateforme d'organisation de compétitions pour les jeunes de Djibouti qui tiennent leurs
résultats scolaires. Tout se joue par **éditions** : selon l'édition, la compétition est
**sportive ou intellectuelle**. La plateforme pilote chaque édition de bout en bout —
inscriptions, vérification des dossiers, créneaux et convocations, check-in le jour J (y compris
hors ligne), résultats, classements des participants et des écoles, galeries, notifications
email + WhatsApp.

Le candidat s'inscrit lui-même et **garde son compte d'une édition à l'autre** : d'une édition à
la suivante, il ne remet à jour que ses résultats scolaires. Le parcours complet
(pré-inscription, pièces en photo, confirmation à distance puis confirmation en présentiel) est
documenté dans `CLAUDE.md`.

**La première édition est le tournoi de duels de football 1v1**, et c'est elle qui est
implémentée aujourd'hui : la mécanique de compétition — rôles buteur/défenseur, cinq tentatives,
barème des écoles — est encore écrite en dur pour ce format, et le front public assume ce parti
pris football. Rendre la discipline configurable par édition est le prochain chantier
structurant ; il est décrit dans `CLAUDE.md`, section « Écarts à combler ».

Implémentation de la *Documentation technique – Plateforme Tournoi de Duels 1v1* (v1).

## Pile technique

| Élément | Choix |
| --- | --- |
| Front | Nuxt 3 en rendu serveur, un layer par module, Pinia, SCSS modulaire |
| Back | API REST Express, Node LTS, modules métier indépendants |
| Base de données | MongoDB avec Mongoose (9 collections) |
| File d'attente | BullMQ sur Redis, repli en mémoire sans Redis |
| Fichiers | Stockage objet S3 (bulletins en bucket privé) ou disque local en développement |
| Langues | Français par défaut, arabe avec lecture droite-gauche |
| Validation | Schémas Zod partagés entre l'API et les formulaires |

## Structure du dépôt

```
arene/
├── apps/
│   ├── api/                  # API Express
│   │   └── src/
│   │       ├── core/         # config, Mongo, logger, erreurs, file, stockage, middlewares
│   │       └── modules/      # auth, editions, registrations, schools, slots,
│   │                         # results, galleries, notifications, files
│   └── web/                  # Nuxt 3
│       └── layers/           # base, editions, registrations, schools, slots,
│                             # results, galleries, admin
├── packages/shared/          # schémas Zod, constantes, règles métier
├── docker/                   # images API et web, Caddyfile
└── docker-compose.yml
```

Chaque module de l'API expose `model`, `service`, `controller`, `routes` et parfois `events`.
Les règles entre modules sont respectées : un module ne touche jamais le modèle d'un autre
(il passe par son `service`), les effets de bord transversaux passent par le bus d'événements
(`core/events.js`), et les validations sont écrites une seule fois dans `packages/shared`.

## Démarrage en local

Prérequis : Node 22, MongoDB joignable (local ou Atlas). Redis est facultatif : sans
`REDIS_URL`, l'API traite elle-même la file en mémoire. Créez un `.env` à la racine avec au
minimum `MONGO_URI`, `JWT_SECRET` et `JWT_REFRESH_SECRET` (liste complète plus bas).

```bash
npm install --legacy-peer-deps  # npm bute sinon sur la résolution des peers de Nuxt
npm run seed                    # jeu de démonstration (édition ouverte, créneaux, écoles)
npm run dev                     # API sur :4000, front sur :3000
```

Comptes créés par le seed (mot de passe `Merite2026!`, modifiable via `SEED_PASSWORD`) :

| Rôle | Identifiant |
| --- | --- |
| Administrateur | `admin@dj-arene.com` |
| Staff | `staff@dj-arene.com` |
| Candidat | `candidate@example.dj` |

Autres commandes : `npm test` (Vitest), `npm run lint`, `npm run lint:style`,
`npm run dev:worker` (worker séparé), `npm run build` (build Nuxt).

## Déploiement

`docker compose up -d --build` monte six services : `web` (Nuxt), `api`, `worker` (même image
que l'API), `mongo`, `redis` et `proxy` (Caddy, HTTPS automatique, `/api` vers l'API). Les trois
environnements — local, préproduction, production — partagent cette composition ; seules les
variables changent. L'intégration continue (GitHub Actions) enchaîne lint → tests → build des
images, déploie la préproduction à chaque fusion sur `main` et la production sur un tag `v*`.

Variables principales : `MONGO_URI`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `SES_REGION`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
`PUBLIC_SITE_URL`, `DEFAULT_LOCALE`.

## API

Toutes les routes sont préfixées par `/api/v1`. Extrait :

| Module | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`, `GET /auth/me` |
| Éditions | `GET /editions`, `/editions/current`, `/editions/:slug` · `POST /editions`, `PATCH /editions/:id`, `POST /editions/:id/transition`, `GET /editions/:id/stats` |
| Inscriptions | `POST /registrations`, `PATCH /registrations/:id`, `POST /registrations/:id/submit`, `GET /registrations/mine`, `GET /registrations`, `POST /registrations/:id/review`, `GET /registrations/:id/badge`, `GET /registrations/export` |
| Écoles | `GET /schools`, `GET /schools/:slug`, `POST /schools`, `PATCH /schools/:id`, `POST /schools/:id/merge`, `POST /schools/import` |
| Créneaux et check-in | `GET /editions/:id/slots`, `POST /slots`, `PATCH /slots/:id`, `POST /slots/:id/assign`, `GET /slots/:id/roster`, `POST /checkin/scan`, `POST /checkin/:registrationId`, `POST /checkin/sync`, `GET /slots/:id/cash-report` |
| Résultats | `POST /slots/:id/matches/generate`, `GET /slots/:id/matches`, `PUT /matches/:id/result`, `GET /editions/:id/rankings/players`, `GET /editions/:id/rankings/schools`, `POST /editions/:id/finals/select` |
| Galeries | `GET /editions/:id/galleries`, `GET /galleries/:slug`, `POST /galleries`, `PATCH /galleries/:id`, `POST /galleries/:id/items`, `PATCH /galleries/:id/items/order`, `DELETE /galleries/:id/items/:itemId`, `POST /galleries/:id/publish` |
| Notifications | `GET /notifications`, `POST /notifications/broadcast`, `POST /notifications/:id/retry`, `GET|PUT /notification-templates`, `POST /notifications/webhooks/:provider` |

## Règles métier implémentées

### Communes à toutes les éditions

- **Compte permanent** : le candidat s'inscrit lui-même ; son `User` survit aux éditions, une
  `Registration` est créée par édition (`editionId` + `candidateId`).
- **Catégories** : Lycée (15–18 ans) et Université (18–23 ans). La catégorie suit le niveau
  d'études déclaré, l'âge sert de contrôle — ce qui tranche le cas des 18 ans.
- **Seuil scolaire** : moyenne d'au moins 12/20 (`rules.gradeThreshold`, par édition).
- **Pièces en photo ou en scan** : bulletin et photo d'identité sont déposés en ligne, jamais
  attendus en version papier au dépôt du dossier.
- **Aucun refus automatique** : un dossier hors critères part au staff avec ses signalements
  (âge, moyenne, rôle complet, doublon).
- **Double confirmation** : une première vérification des pièces à distance, puis une
  confirmation en présentiel qui atteste que le candidat existe réellement — contrôle
  d'identité, contrat papier signé, frais encaissés, dossard remis.
- **Plafond de places** par catégorie, avec fermeture automatique quand le quota est atteint.
- **Créneau automatique** à l'acceptation du dossier, convocation + rappel la veille.
- **Check-in hors ligne** : la liste du créneau est chargée en IndexedDB, les opérations portent
  une clé d'idempotence et sont rejouées au retour du réseau sans double encaissement.
- **Droit à l'image** : un participant n'est identifiable dans une galerie que si son dossier
  porte le consentement ; le service refuse l'identification sinon.

### Propres à la première édition (duels 1v1)

Ces règles sont aujourd'hui écrites en dur dans `packages/shared/src/constants.js` et
`results.service`, pas rattachées à une discipline d'édition.

- **Rôles** : buteur et défenseur (`PLAYER_ROLES`), le plafond de places se décline par rôle en
  plus de la catégorie.
- **Rencontres** : 5 tentatives, 3 adversaires par buteur en qualification, 2 finalistes par rôle
  et par catégorie, finale croisée (4 rencontres par catégorie).
- **Classement des écoles** : présence 1, victoire 2, finaliste 5, podium 15/10/6, champion +25 ;
  deux vues, points totaux et points par joueur inscrit.

## Sécurité et données des mineurs

Bulletins et photos d'identité vivent dans un stockage privé, servis uniquement par des liens
signés de courte durée ; les métadonnées EXIF (dont la position GPS) sont supprimées à l'envoi.
Les accès staff aux dossiers sont tracés (`AuditLog`). Les pages publiques n'affichent que le
prénom, l'initiale du nom et l'école. Le candidat peut télécharger ou supprimer ses propres
données depuis son espace ; la suppression retire aussi l'identification dans les galeries. À la
clôture d'une édition, `registrations.anonymizeEdition` et `files.purgeEdition` effacent
l'identité et les documents, en gardant les résultats.

Côté applicatif : validation Zod de chaque entrée, `helmet` avec CSP stricte, CORS limité au
domaine du site, limitation de débit sur l'auth, l'inscription et l'envoi de fichiers, contrôle du
type réel des fichiers (signature, pas l'extension), mots de passe hachés en argon2, protection
contre l'injection d'opérateurs Mongo (`sanitizeFilter`).

## SEO

Rendu serveur de toutes les pages publiques, `useSeoPage()` pour les métadonnées et les données
structurées (`SportsEvent`, `Organization`, `ImageGallery`, `VideoObject`, `FAQPage`,
`BreadcrumbList`), `sitemap.xml` alimenté par l'API avec une entrée par langue et ses
alternatives `hreflang`, `robots.txt` excluant `/compte`, `/staff`, `/admin` et `/api`, pages
publiques mises en cache (`routeRules` en `swr`), images en WebP/AVIF avec dimensions fixées.

## Écarts assumés par rapport à la documentation

- `sitemap.xml` et `robots.txt` sont des routes Nitro écrites à la main plutôt que le module
  `@nuxtjs/seo`, pour éviter une dépendance supplémentaire ; le module peut les remplacer tel quel.
- Les polices sont chargées depuis Google Fonts avec `display=swap` ; passer à `@nuxt/fonts` les
  auto-hébergerait sans autre changement.
- `sharp` et le SDK AWS sont des dépendances optionnelles chargées à la demande : sans elles, les
  images sont stockées telles quelles et le stockage retombe sur le disque local.
- L'export des inscriptions est produit en CSV (séparateur `;`, BOM pour Excel), pas en `.xlsx`.
- Le scan du QR utilise l'API `BarcodeDetector` du navigateur quand elle est disponible, avec
  recherche par nom ou dossard en secours.

Les écarts qui portent sur le **produit** plutôt que sur la technique — discipline configurable
par édition, numéro de téléphone du parent dans le formulaire, réinscription allégée d'un
candidat déjà vérifié — sont listés dans `CLAUDE.md`, section « Écarts à combler ».
