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

# Supprime les conteneurs fantômes d'un déploiement interrompu.
#
# Pour remplacer un conteneur, Compose renomme d'abord l'ancien en
# « <id-court>_<nom> », le temps de démarrer le nouveau. Si la bascule est
# interrompue, ce nom reste pris : tout déploiement suivant échoue sur
# « container name is already in use », puis part en retour arrière — ce qui
# masque la cause. `--remove-orphans` n'y suffit pas, un conteneur renommé garde
# les étiquettes du projet et n'est donc pas orphelin.
#
# Le motif ne vise que ce cas : un service d'Arène préfixé de douze caractères
# hexadécimaux. Les conteneurs normaux (`arene-web`, `arene-mongodb`) et les
# autres piles de l'EC2 n'y correspondent pas.
drop_stale() {
  docker ps -a --format '{{.ID}} {{.Names}}' |
    grep -E ' [0-9a-f]{12}_arene-(api|web|worker)$' |
    while read -r id name; do
      echo "Conteneur fantôme supprimé : $name"
      docker rm -f "$id" >/dev/null 2>&1 || true
    done
  return 0
}

PREV=$(sed -n 's/^IMAGE_TAG=//p' "$ENV_FILE")
echo "Actuel : $PREV, cible : $SHA"

drop_stale
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
# Le retour arrière recrée les mêmes conteneurs : il bute sur le même nom.
drop_stale
dc up -d --remove-orphans
wait_healthy && echo "Retour à $PREV OK" || echo "ATTENTION : $PREV n'est pas healthy non plus"
exit 1
