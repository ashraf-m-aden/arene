<script setup lang="ts">
const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const options = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map((item) => ({
    code: item.code,
    name: item.name,
    to: switchLocalePath(item.code)
  }))
)
</script>

<template>
  <div class="locale" role="group" :aria-label="$t('nav.language')">
    <NuxtLink
      v-for="option in options"
      :key="option.code"
      :to="option.to"
      class="locale__item"
      :class="{ 'locale__item--active': option.code === locale }"
      :lang="option.code"
      :hreflang="option.code"
    >
      {{ option.code === 'ar' ? 'ع' : 'FR' }}
      <span class="sr-only">{{ option.name }}</span>
    </NuxtLink>
  </div>
</template>

<style scoped lang="scss">
.locale {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid currentcolor;
  border-radius: var(--radius-pill);
  opacity: 0.85;
}

.locale__item {
  min-inline-size: 2rem;
  padding: 0.15rem var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 700;
  text-align: center;
  color: inherit;
  text-decoration: none;
}

.locale__item--active {
  background: var(--color-gold);
  color: var(--color-ink);
}

.sr-only {
  @include visually-hidden;
}
</style>
