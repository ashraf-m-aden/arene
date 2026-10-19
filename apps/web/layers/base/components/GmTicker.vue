<script setup lang="ts">
/**
 * Bandeau LED de bord de terrain : les chiffres clés de l'édition défilent.
 * Le second groupe est un doublon purement visuel, masqué aux lecteurs d'écran,
 * qui rend la boucle continue.
 */
const props = defineProps<{ items: (string | number)[] }>()

const entries = computed(() =>
  props.items.map((item) => String(item).trim()).filter(Boolean)
)
</script>

<template>
  <div v-if="entries.length" class="ticker">
    <div class="ticker__track">
      <ul class="ticker__group">
        <li v-for="(item, index) in entries" :key="`a-${index}`" class="ticker__item">
          {{ item }}
        </li>
      </ul>
      <ul class="ticker__group" aria-hidden="true">
        <li v-for="(item, index) in entries" :key="`b-${index}`" class="ticker__item">
          {{ item }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ticker {
  position: relative;
  overflow: hidden;
  background: var(--color-ink-deep);
  border-block: 1px solid rgb(231 178 62 / 22%);
  color: var(--color-gold-bright);

  // Les extrémités s'éteignent pour que le texte entre et sorte en douceur.
  &::before,
  &::after {
    content: '';
    position: absolute;
    inset-block: 0;
    inline-size: 3rem;
    z-index: 1;
    pointer-events: none;
  }

  &::before {
    inset-inline-start: 0;
    background: linear-gradient(90deg, var(--color-ink-deep), transparent);
  }

  &::after {
    inset-inline-end: 0;
    background: linear-gradient(270deg, var(--color-ink-deep), transparent);
  }

  &:hover .ticker__track {
    animation-play-state: paused;
  }
}

.ticker__track {
  display: flex;
  inline-size: max-content;
  animation: slide 42s linear infinite;
}

.ticker__group {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ticker__item {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding-inline-end: var(--space-5);
  padding-block: var(--space-3);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  white-space: nowrap;

  // Le point de séparation, comme les ampoules d'un panneau publicitaire.
  &::after {
    content: '';
    inline-size: 5px;
    block-size: 5px;
    border-radius: 50%;
    background: currentcolor;
    opacity: 0.55;
  }
}

@keyframes slide {
  to {
    transform: translateX(-50%);
  }
}

[dir='rtl'] .ticker__track {
  animation-name: slide-rtl;
}

@keyframes slide-rtl {
  to {
    transform: translateX(50%);
  }
}
</style>
