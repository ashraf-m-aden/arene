#!/bin/sh
# Attend que le CI de ce commit soit vert ET que nejishow/arene-api et
# nejishow/arene-web:<sha court> soient sur Docker Hub.
# Usage : wait-image.sh <sha complet> [délai max en secondes, 1800 par défaut]
#
# Le CI est exigé en plus des images : une image publiée ne prouve pas que les
# tests sont passés. Si le CI échoue, on s'arrête tout de suite.
set -eu
SHA=$1
MAX=${2:-1800}
SHORT=$(echo "$SHA" | cut -c1-7)

# Le dépôt GitHub est déduit du remote du checkout : un renommage du dépôt n'a
# rien à casser ici. Hors checkout (essai à la main), on retombe sur le nom
# courant ; ARENE_GITHUB_REPO force la valeur.
github_repo() {
  url=$(git config --get remote.origin.url 2>/dev/null || true)
  case "$url" in
    *github.com[:/]*) ;;
    *) return 1 ;;
  esac
  url=${url##*github.com} # https://…/owner/repo.git ou git@github.com:owner/repo.git
  url=${url#:}
  url=${url#/}
  echo "${url%.git}"
}

REPO=${ARENE_GITHUB_REPO:-$(github_repo || echo 'ashraf-m-aden/arene')}

# Un dépôt injoignable (nom erroné, quota API atteint, réseau) ferait tourner la
# boucle jusqu'au délai max sans rien dire : on le vérifie tout de suite.
if ! curl -fsL -o /dev/null "https://api.github.com/repos/$REPO"; then
  echo "API GitHub : $REPO injoignable (nom du dépôt ? quota ? réseau ?)"
  exit 1
fi
echo "Dépôt suivi : $REPO"

has_tag() {
  curl -fs -o /dev/null "https://hub.docker.com/v2/repositories/nejishow/$1/tags/$SHORT"
}

# Conclusion du workflow CI pour ce commit : vide tant qu'il tourne.
# -L suit la redirection que GitHub sert tant que l'ancien nom d'un dépôt
# renommé est utilisé.
ci_conclusion() {
  curl -fsL "https://api.github.com/repos/$REPO/actions/runs?head_sha=$SHA&event=push" |
    python3 -c "import sys, json
runs = [r for r in json.load(sys.stdin)['workflow_runs'] if r['name'] == 'CI']
print(runs[0]['conclusion'] or '' if runs else '')" 2>/dev/null || true
}

ci=''
elapsed=0
while [ "$elapsed" -lt "$MAX" ]; do
  # L'API GitHub sans jeton est limitée à 60 appels/heure : une fois par 2 min.
  if [ "$ci" != success ] && [ $((elapsed % 120)) -eq 0 ]; then
    ci=$(ci_conclusion)
    case "$ci" in
      '') ;;
      success) echo "CI de $SHORT vert" ;;
      *) echo "CI de $SHORT : $ci, rien à déployer"; exit 1 ;;
    esac
  fi
  if [ "$ci" = success ] && has_tag arene-api && has_tag arene-web; then
    echo "Images $SHORT publiées"
    exit 0
  fi
  sleep 30
  elapsed=$((elapsed + 30))
done
echo "CI ($ci) ou images $SHORT toujours en attente après ${MAX}s"
exit 1
