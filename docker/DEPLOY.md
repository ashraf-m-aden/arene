# Déploiement sur l'EC2 partagé (aux côtés de Totalis)

Contexte : l'EC2 héberge déjà `totalis.clinic` derrière un `hms-nginx` conteneurisé
(réseau Docker `hms-network`), avec un MongoDB déjà en place. L'Arène
s'ajoute sur la **même machine**, sous un **second nom de domaine**, sans toucher
à la config existante de Totalis.

Les images sont publiées automatiquement par `.github/workflows/build-and-push.yml`
vers DockerHub (`nejishow/arene-api`, `nejishow/arene-web`) à
chaque push sur `main`. Le déploiement sur l'EC2 ne fait que les récupérer — pas de
build sur le serveur.

## 1. Acheter le domaine et le pointer sur l'EC2

Chez n'importe quel registrar (Namecheap, OVH, Route 53…), achetez le domaine puis
créez un enregistrement DNS :

```
Type  A
Nom   @ (et éventuellement www)
Valeur <IP publique de l'EC2>   # la même IP que totalis.clinic
TTL   automatique
```

Un second domaine sur la même IP ne pose aucun problème : nginx choisit le bon
site via le `server_name` (SNI), exactement comme il le fait déjà pour chaque
tenant `*.totalis.clinic`. Attendez la propagation DNS (`dig VOTRE-DOMAINE.tld`)
avant l'étape certbot.

## 2. Certificat Let's Encrypt du nouveau domaine

Indépendant de celui de `totalis.clinic` — Let's Encrypt gère sans problème
plusieurs domaines sur la même machine, un dossier par domaine sous
`/etc/letsencrypt/live/`. Avec certbot déjà installé sur l'hôte (webroot ou
standalone selon ce que vous utilisez pour totalis.clinic) :

```bash
sudo certbot certonly --nginx -d VOTRE-DOMAINE.tld -d www.VOTRE-DOMAINE.tld
```

Si certbot tourne lui-même en conteneur chez vous, adaptez la commande à ce
conteneur plutôt qu'à `--nginx`. Le résultat attendu dans tous les cas :
`/etc/letsencrypt/live/VOTRE-DOMAINE.tld/{fullchain,privkey}.pem` présents sur
l'hôte, dans le même volume que celui déjà monté dans `hms-nginx`.

## 3. Secrets et buckets S3

- Générez les secrets JWT : `openssl rand -hex 32` (deux fois, un par secret).
- Créez les deux buckets S3 (public pour les médias publics, privé pour les
  bulletins et photos d'identité) et attachez à l'instance EC2 un **rôle IAM**
  autorisant `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sur ces deux
  buckets — ainsi l'API s'authentifie sans clé statique dans le conteneur.
- Repérez le nom du conteneur Mongo existant : `docker ps | grep mongo`.

## 4. Fichier d'environnement

```bash
cd ~/hms-monorepo   # ou l'emplacement de ce dépôt sur l'EC2
cp docker/.env.ec2.example .env.ec2
# éditez .env.ec2 : domaine, MONGO_URI (nom du conteneur repéré à l'étape 3),
# REDIS_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, buckets S3
```

## 5. Lancer les conteneurs

```bash
docker compose -f docker/docker-compose.ec2.yml --env-file .env.ec2 pull
docker compose -f docker/docker-compose.ec2.yml --env-file .env.ec2 up -d
docker compose -f docker/docker-compose.ec2.yml ps
```

Ces conteneurs rejoignent le réseau `hms-network` existant (déclaré `external`
dans le compose) : pas de port publié sur l'hôte, `hms-nginx` les atteint
directement par nom de conteneur (`arene-web`, `arene-api`),
comme il le fait déjà pour `frontend-1`/`backend-1`.

## 6. Brancher nginx sur le nouveau domaine

```bash
cp docker/nginx/arene.conf.example \
   /chemin/vers/deployments/nginx/conf.d/arene.conf
# remplacez VOTRE-DOMAINE.tld par le vrai domaine dans ce fichier
docker kill --signal=HUP hms-nginx   # recharge nginx sans coupure
```

C'est le même mécanisme que celui qu'utilise `hms-provisioning` pour chaque
tenant (`nginx.service.js` → écrit un `.conf` dans `conf.d`, puis `HUP` sur
`hms-nginx`).

## 7. Vérifier

```bash
curl -I https://VOTRE-DOMAINE.tld
curl -I https://VOTRE-DOMAINE.tld/api/v1/editions/current
```

Et que `totalis.clinic` répond toujours normalement — le rechargement nginx
(`HUP`) ne coupe aucune connexion existante et ne touche aucun autre vhost.

## Mises à jour ultérieures

```bash
docker compose -f docker/docker-compose.ec2.yml --env-file .env.ec2 pull
docker compose -f docker/docker-compose.ec2.yml --env-file .env.ec2 up -d
```

Pour figer une version précise plutôt que `latest`, mettez `IMAGE_TAG` dans
`.env.ec2` au sha court voulu (tag poussé par la CI à chaque commit sur `main`).

## Première mise en données

```bash
docker exec -it arene-api node apps/api/src/seed.js
```

(à adapter si vous préférez partir sans jeu de démonstration en production —
dans ce cas, créez simplement le premier compte admin via les routes `auth`.)
