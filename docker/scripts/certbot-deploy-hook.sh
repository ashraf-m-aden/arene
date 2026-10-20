#!/bin/sh
# À installer dans /etc/letsencrypt/renewal-hooks/deploy/ (chmod +x).
# Arène : recharge hms-nginx (seul point d’entrée 80/443) après chaque renouvellement réussi, sans coupure.
docker kill --signal=HUP hms-nginx
