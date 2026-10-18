<script setup lang="ts">
defineProps<{
  eyebrow?: string
  title: string
  lead?: string
  align?: 'start' | 'center'
}>()
</script>

<template>
  <div class="head" :class="`head--${align || 'start'}`">
    <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
    <h2>{{ title }}</h2>
    <p v-if="lead" class="lead">{{ lead }}</p>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.head {
  display: grid;
  gap: var(--space-3);
  margin-block-end: var(--space-6);
}

.head--center {
  justify-items: center;
  text-align: center;

  .lead {
    margin-inline: auto;
  }
}
</style>
