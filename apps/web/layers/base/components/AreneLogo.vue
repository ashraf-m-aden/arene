<script setup lang="ts">
/**
 * La marque : l'arène vue du dessus — l'enceinte en or, ouverte en haut sous
 * l'étoile du drapeau de Djibouti — et, en son centre, les deux camps qui se
 * font face. Deux chevrons tête-bêche, blanc contre or : le duel, vrai quelle
 * que soit la discipline de l'édition, sportive comme intellectuelle.
 *
 * Tracé dans l'espace du fichier d'origine (1024 × 1024, centre 512) : chaque
 * coordonnée se relit directement sur `arene-icone.png`, et les couleurs sont
 * celles de la marque, pas celles du thème — un logo ne change pas de teinte
 * avec la page. Le fond sombre fait partie du dessin : sans lui, le chevron
 * blanc disparaîtrait sur un en-tête clair.
 *
 * Sous 24 px, l'anneau fin (8/1024, soit moins d'un pixel) ne se lit plus et
 * passe en halo : c'est pourquoi `favicon.svg` en porte une version épaissie.
 */
</script>

<template>
  <svg viewBox="0 0 1024 1024" role="img" aria-label="L'Arène">
    <rect width="1024" height="1024" fill="#0d1117" />

    <!--
      Les deux anneaux s'interrompent à midi pour laisser passer l'étoile. Le
      vide est obtenu au trait plutôt qu'en découpant la forme : un tracé unique
      reste exact à toutes les tailles.

      Anneau or r=359 : circonférence 2π×359 = 2255,75 ; ouverture de 22,25°
      (139,4), donc un arc de 2116,35, décalé de 2255,75/4 − 139,4/2 = 494,24
      pour centrer l'ouverture en haut.
    -->
    <circle
      cx="512"
      cy="512"
      r="359"
      fill="none"
      stroke="#f2b33d"
      stroke-width="29"
      stroke-dasharray="2116.35 139.4"
      stroke-dashoffset="494.24"
    />

    <!-- Anneau fin r=401,5 : circonférence 2522,65 ; ouverture de 16° (112,12),
         arc de 2410,53, décalage 630,66 − 56,06 = 574,6. -->
    <circle
      cx="512"
      cy="512"
      r="401.5"
      fill="none"
      stroke="#8b6a2c"
      stroke-width="8"
      stroke-dasharray="2410.53 112.12"
      stroke-dashoffset="574.6"
    />

    <!-- Étoile à cinq branches, pointe en haut : centre (512, 145,5), rayons
         41,5 et 15,86 (sin18°/sin54°). -->
    <path
      d="M512 104 L521.32 132.67 L551.47 132.68 L527.08 150.4 L536.39 179.07
         L512 161.36 L487.61 179.07 L496.92 150.4 L472.53 132.68 L502.68 132.67 Z"
      fill="#d7141a"
    />

    <!--
      Les deux camps. Chaque chevron est une bande à 45° de 93 d'épaisseur, la
      pointe sur l'axe vertical (494 et 530, soit 18 de part et d'autre du
      centre) et les bras coupés à l'horizontale en 342 et 682. Le second est le
      miroir du premier autour de x=512.
    -->
    <path d="M324 342 L494 512 L324 682 L232 682 L402 512 L232 342 Z" fill="#f5f2ea" />
    <path d="M700 342 L530 512 L700 682 L792 682 L622 512 L792 342 Z" fill="#f2b33d" />
  </svg>
</template>
