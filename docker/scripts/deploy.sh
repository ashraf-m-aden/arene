#!/bin/sh
# Déploie l'image <sha court> d'Arène sur l'EC2, avec retour arrière automatique.
# Usage (en tant que ubuntu) : deploy.sh <sha court>
# Appelé par le Jenkinsfile ; utilisable aussi à la main pour revenir à un SHA.
set -eu
SHA=$1
case "$SHA" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) echo "SHA court attendu (7 caractères hexadécimaux) : $SHA"; exit 2 ;;
esac

ENV_FILE=/home/ubuntu/arene/.env.ec2
COMPOSE=/home/ubuntu/arene/repo/docker/docker-compose.ec2.yml
dc() { docker compose -f "$COMPOSE" --env-file "$ENV_FILE" "$@"; }

set_tag() { sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" "$ENV_FILE"; }

# Attend que les conteneurs à healthcheck soient « healthy » (2 min max).
wait_healthy() {
  for _ in $(seq 1 24); do
    ok=1
    for c in arene-api arene-web arene-worker; do
      [ "$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null)" = healthy ] || ok=0
    done
    [ "$ok" = 1 ] && return 0
    sleep 5
  done
  return 1
}

PREV=$(sed -n 's/^IMAGE_TAG=//p' "$ENV_FILE")
echo "Actuel : $PREV, cible : $SHA"

set_tag "$SHA"
if dc pull -q api worker web && dc up -d --remove-orphans && wait_healthy &&
   curl -fs -o /dev/null -m 15 https://dj-arene.com/; then
  echo "Déployé : $SHA"
  # Garde l'image courante et la précédente (retour arrière), supprime les autres.
  docker images --format '{{.Repository}}:{{.Tag}}' |
    grep -E '^nejishow/arene-(api|web):[0-9a-f]{7}$' |
    grep -vE ":($SHA|$PREV)$" | xargs -r docker rmi -f >/dev/null 2>&1 || true
  exit 0
fi

echo "Échec du déploiement de $SHA : retour à $PREV"
dc logs --tail 30 api web worker || true
set_tag "$PREV"
dc up -d --remove-orphans
wait_healthy && echo "Retour à $PREV OK" || echo "ATTENTION : $PREV n'est pas healthy non plus"
exit 1
