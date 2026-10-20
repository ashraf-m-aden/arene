#!/bin/sh
# Arène : sauvegarde quotidienne de arene-mongodb vers S3, indépendante de celle de Totalis.
# Cron : 30 3 * * * /home/ubuntu/arene/scripts/backup-mongo.sh >> /home/ubuntu/arene/backups/backup.log 2>&1
#
# Identifiants : utilisateur IAM arene-backup (s3:PutObject seul sur le préfixe mongo/),
# dans ~/arene/secrets/aws-backup.ini (chmod 600), profil [arene-backup].
# Pas de droit de suppression : l'expiration est gérée par la règle de cycle de vie du bucket.
set -eu
BUCKET=dj-arene-backups
DEST=/home/ubuntu/arene/backups
LOCAL_RETENTION_DAYS=7
FILE="arene-$(date +%F-%H%M).archive.gz"

export AWS_SHARED_CREDENTIALS_FILE=/home/ubuntu/arene/secrets/aws-backup.ini
export AWS_CONFIG_FILE=/dev/null

mkdir -p "$DEST"
docker exec arene-mongodb sh -c 'mongodump --quiet --archive --gzip \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' \
  > "$DEST/$FILE.part"
gzip -t "$DEST/$FILE.part"
mv "$DEST/$FILE.part" "$DEST/$FILE"

aws s3 cp "$DEST/$FILE" "s3://$BUCKET/mongo/$FILE" \
  --profile arene-backup --region us-east-1 --sse AES256 --only-show-errors

find "$DEST" -name 'arene-*.archive.gz' -mtime +"$LOCAL_RETENTION_DAYS" -delete
echo "$(date -Is) OK $FILE"
