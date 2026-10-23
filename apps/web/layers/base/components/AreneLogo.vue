<script setup lang="ts">
/**
 * L'anneau fendu : l'arène vue du dessus, dont le mur s'interrompt en haut et
 * en bas pour laisser place à la ligne du duel. L'enceinte partagée en deux
 * camps — vrai quelle que soit la discipline de l'édition, sportive comme
 * intellectuelle. Deux formes seulement : reste net jusqu'à 16 px.
 *
 * L'anneau suit `currentColor` ; la ligne garde l'or de la marque.
 */
</script>

<template>
  <svg viewBox="0 0 48 48" role="img" aria-label="L'Arène" fill="none">
    <!--
      Les deux ouvertures sont obtenues au trait plutôt qu'en découpant la
      forme : un tracé unique reste exact à toutes les tailles.
      Circonférence 2π×18 = 113,097 — deux arcs de 47,549 séparés par 9,
      décalés de 23,774 pour placer les ouvertures à midi et à six heures.
    -->
    <circle
      cx="24"
      cy="24"
      r="18"
      stroke="currentColor"
      stroke-width="3.2"
      stroke-dasharray="47.549 9"
      stroke-dashoffset="23.774"
    />
    <path d="M24 6V42" stroke="#e7b23e" stroke-width="3.2" stroke-linecap="round" />
  </svg>
</template>
