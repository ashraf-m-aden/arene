<script setup lang="ts">
defineProps<{ title: string; hint?: string }>()
</script>

<template>
  <div class="empty">
    <p><strong>{{ title }}</strong></p>
    <p v-if="hint" class="muted">{{ hint }}</p>
    <slot />
  </div>
</template>
