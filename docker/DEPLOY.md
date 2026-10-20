# Déploiement de L'Arène sur l'EC2 partagé (dj-arene.com)

L'EC2 (t3.large, 50.19.46.247) héberge aussi Totalis. L'Arène en est **isolée** :

| Ressource     | L'Arène                                              | Partagé avec Totalis ? |
| ------------- | ---------------------------------------------------- | ---------------------- |
| Dossier       | `~/arene` (dépôt cloné dans `~/arene/repo`)          | Non                    |
| Réseau Docker | `arene-network`                                      | Non                    |
| MongoDB       | `arene-mongodb`, base `arene`, `~/arene/data/mongo`  | Non                    |
| Redis         | `arene-redis`, `~/arene/data/redis`                  | Non                    |
| S3            | utilisateur IAM `arene-s3` (clés dans `.env.ec2`)    | Non                    |
| Sauvegardes   | `docker/scripts/backup-mongo.sh` → `s3://dj-arene-backups` | Non              |
| Entrée 80/443 | `hms-nginx`, fichier `conf.d/arene.conf`             | **Oui (une seule IP)** |

Les images sont publiées par `.github/workflows/build-and-push.yml`
(`nejishow/arene-api`, `nejishow/arene-web`) ; rien n'est construit sur le serveur.
Ports internes : API 4000, web 3000. Aucun port publié sur l'hôte.

Procédure détaillée, risques et rollback : document « Arène — Déploiement isolé
sur l'EC2 partagé ». Résumé ci-dessous, à exécuter **hors heure de pointe**.

## 1. Préparation (sans impact sur Totalis)

```bash
# DNS : A @ et A www → 50.19.46.247 ; attendre `dig +short dj-arene.com`
mkdir -p ~/arene/data/mongo ~/arene/data/redis ~/arene/backups ~/arene/secrets
cp ~/arene/repo/docker/.env.ec2.example ~/arene/.env.ec2 && chmod 600 ~/arene/.env.ec2
# renseigner les secrets (openssl rand -hex 32) et les clés arene-s3

docker network create arene-network
docker network connect arene-network hms-nginx      # sans redémarrage
```

## 2. Base de données

```bash
cd ~/arene/repo
docker compose -f docker/docker-compose.ec2.yml --env-file ~/arene/.env.ec2 up -d mongodb
docker exec -it arene-mongodb sh -c 'mongosh -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin'
#   use arene
#   db.createUser({ user: "arene_app", pwd: passwordPrompt(),
#     roles: [{ role: "readWrite", db: "arene" }] })
```

## 3. Certificat (webroot, sans coupure)

`certbot --nginx` est impossible (nginx en conteneur) ; on passe par un webroot
sous `/etc/letsencrypt`, déjà monté dans `hms-nginx`.

```bash
sudo mkdir -p /etc/letsencrypt/webroot-arene
sudo install -m 755 docker/scripts/certbot-deploy-hook.sh \
  /etc/letsencrypt/renewal-hooks/deploy/arene-reload-nginx.sh
echo 'deployments/nginx/conf.d/arene.conf' >> ~/hms-monorepo/.git/info/exclude

cp docker/nginx/arene.phase1-http.conf.example ~/hms-monorepo/deployments/nginx/conf.d/arene.conf
docker exec hms-nginx nginx -t && docker kill --signal=HUP hms-nginx
sudo certbot certonly --webroot -w /etc/letsencrypt/webroot-arene \
  -d dj-arene.com -d www.dj-arene.com
```

Si `nginx -t` échoue : supprimer `conf.d/arene.conf` immédiatement, sans `HUP`.

## 4. Application et HTTPS

```bash
docker compose -f docker/docker-compose.ec2.yml --env-file ~/arene/.env.ec2 pull
docker compose -f docker/docker-compose.ec2.yml --env-file ~/arene/.env.ec2 up -d

cp docker/nginx/arene.conf.example ~/hms-monorepo/deployments/nginx/conf.d/arene.conf
docker exec hms-nginx nginx -t && docker kill --signal=HUP hms-nginx
```

## 5. Sauvegardes

```bash
install -m 755 docker/scripts/backup-mongo.sh ~/arene/scripts/backup-mongo.sh
# ~/arene/secrets/aws-backup.ini (chmod 600), profil [arene-backup]
~/arene/scripts/backup-mongo.sh        # test manuel : doit finir par « OK »
(crontab -l; echo '30 3 * * * /home/ubuntu/arene/scripts/backup-mongo.sh >> /home/ubuntu/arene/backups/backup.log 2>&1') | crontab -
```

## 6. Vérification

```bash
curl -I http://dj-arene.com                            # 301 vers https
curl -I https://www.dj-arene.com                       # 301 vers l'apex
curl -I https://dj-arene.com/api/v1/editions/current   # 200
docker exec arene-api getent hosts hms-mongodb         # ne doit rien renvoyer
curl -I https://totalis.clinic                         # inchangé
```

## Mises à jour et rollback

```bash
# mise à jour : IMAGE_TAG=<sha court> dans ~/arene/.env.ec2, puis pull + up -d
# rollback complet, sans effet sur Totalis :
rm ~/hms-monorepo/deployments/nginx/conf.d/arene.conf
docker exec hms-nginx nginx -t && docker kill --signal=HUP hms-nginx
docker compose -f docker/docker-compose.ec2.yml --env-file ~/arene/.env.ec2 down
docker network disconnect arene-network hms-nginx
```
