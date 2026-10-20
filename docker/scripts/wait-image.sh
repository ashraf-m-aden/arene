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
REPO=ashraf-m-aden/arene

has_tag() {
  curl -fs -o /dev/null "https://hub.docker.com/v2/repositories/nejishow/$1/tags/$SHORT"
}

# Conclusion du workflow CI pour ce commit : vide tant qu'il tourne.
ci_conclusion() {
  curl -fs "https://api.github.com/repos/$REPO/actions/runs?head_sha=$SHA&event=push" |
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
