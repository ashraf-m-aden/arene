<script setup lang="ts">
defineProps<{ tone?: 'info' | 'danger' | 'success'; title?: string }>()
</script>

<template>
  <div class="notice" :class="tone && tone !== 'info' ? `notice--${tone}` : ''" role="status">
    <div>
      <strong v-if="title">{{ title }}</strong>
      <slot />
    </div>
  </div>
</template>
