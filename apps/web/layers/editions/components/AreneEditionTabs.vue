<script setup lang="ts">
const props = defineProps<{ slug: string }>()
const localePath = useLocalePath()
const route = useRoute()

const tabs = computed(() => [
  { to: `/editions/${props.slug}`, label: 'editions.tabs.overview', exact: true },
  { to: `/editions/${props.slug}/classements`, label: 'editions.tabs.rankings' },
  { to: `/editions/${props.slug}/galeries`, label: 'editions.tabs.galleries' },
  { to: `/editions/${props.slug}/reglement`, label: 'editions.tabs.rules' }
])

const isActive = (tab: { to: string; exact?: boolean }) => {
  const target = localePath(tab.to)
  return tab.exact ? route.path === target : route.path.startsWith(target)
}
</script>

<template>
  <nav class="tabs" :aria-label="$t('nav.editions')">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="localePath(tab.to)"
      class="tabs__link"
      :class="{ 'tabs__link--active': isActive(tab) }"
    >
      {{ $t(tab.label) }}
    </NuxtLink>
  </nav>
</template>
