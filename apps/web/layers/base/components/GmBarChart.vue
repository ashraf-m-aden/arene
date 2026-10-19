<script setup lang="ts">
/** Diagramme en barres horizontales : funnel de candidatures, encaissements, etc. */
const props = defineProps<{
  items: { label: string; value: number; tone?: 'gold' | 'pitch' | 'danger' | 'warning' }[]
  formatValue?: (value: number) => string
}>()

const max = computed(() => Math.max(1, ...props.items.map((item) => item.value)))
const format = (value: number) => (props.formatValue ? props.formatValue(value) : String(value))
</script>

<template>
  <div class="chart">
    <div v-for="item in items" :key="item.label" class="chart__row">
      <span class="chart__label">{{ item.label }}</span>
      <div class="chart__track">
        <div
          class="chart__fill"
          :class="item.tone ? `chart__fill--${item.tone}` : ''"
          :style="{ inlineSize: `${Math.round((item.value / max) * 100)}%` }"
        />
      </div>
      <span class="chart__value numeric">{{ format(item.value) }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chart {
  display: grid;
  gap: var(--space-3);
}

.chart__row {
  display: grid;
  grid-template-columns: minmax(6rem, 10rem) 1fr auto;
  align-items: center;
  gap: var(--space-3);
}

.chart__label {
  font-size: var(--text-sm);
  color: var(--color-muted);
}

.chart__track {
  block-size: 0.6rem;
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  border: 1px solid var(--color-line);
  overflow: hidden;
}

.chart__fill {
  block-size: 100%;
  background: var(--color-gold);
  border-radius: var(--radius-pill);
  transition: inline-size var(--transition);

  &--pitch {
    background: var(--color-pitch);
  }

  &--danger {
    background: var(--color-danger);
  }

  &--warning {
    background: var(--color-warning);
  }
}

.chart__value {
  font-size: var(--text-sm);
  font-weight: 600;
  min-inline-size: 3ch;
  text-align: end;
}
</style>
