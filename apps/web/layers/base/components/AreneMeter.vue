<script setup lang="ts">
const props = defineProps<{ used: number; capacity: number; label?: string }>()

const ratio = computed(() =>
  props.capacity > 0 ? Math.min(100, Math.round((props.used / props.capacity) * 100)) : 0
)
const tone = computed(() =>
  ratio.value >= 100 ? 'meter__fill--full' : ratio.value >= 80 ? 'meter__fill--warning' : ''
)
</script>

<template>
  <div class="wrap">
    <div class="wrap__head">
      <span>{{ label }}</span>
      <span class="numeric">{{ used }} / {{ capacity }}</span>
    </div>
    <div
      class="meter"
      role="meter"
      :aria-valuenow="used"
      :aria-valuemin="0"
      :aria-valuemax="capacity"
      :aria-label="label"
    >
      <div class="meter__fill" :class="tone" :style="{ inlineSize: `${ratio}%` }" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.wrap {
  display: grid;
  gap: var(--space-2);
}

.wrap__head {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  color: var(--color-muted);
}
</style>
