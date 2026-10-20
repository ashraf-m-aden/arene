<script setup lang="ts">
defineProps<{ label?: string }>()
</script>

<template>
  <p class="loading" role="status" aria-live="polite">
    <span class="loading__dot" aria-hidden="true" />
    {{ label || $t('common.loading') }}
  </p>
</template>

<style scoped lang="scss">
.loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5);
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.loading__dot {
  inline-size: 0.75rem;
  block-size: 0.75rem;
  border-radius: 50%;
  background: var(--color-gold);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
