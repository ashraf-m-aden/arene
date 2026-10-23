<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const { text } = useFormat()

const slug = computed(() => String(route.params.slug))

const { data: edition } = await useAsyncData(`rules-${slug.value}`, () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any }>(`/editions/${slug.value}`).then((r) => r.data)
})

useSeoPage({
  title: `${t('editions.rulesTitle')} — ${text(edition.value?.title)}`,
  description: t('editions.rulesLead')
})
</script>

<template>
  <div v-if="edition">
    <section class="section section--ink">
      <div class="container stack">
        <p class="eyebrow">{{ text(edition.title) }}</p>
        <h1>{{ $t('editions.rulesTitle') }}</h1>
      </div>
    </section>

    <div class="container">
      <AreneEditionTabs :slug="edition.slug" />
    </div>

    <section class="section">
      <div class="container container--narrow">
        <AreneEditionRules :edition="edition" />
      </div>
    </section>
  </div>
</template>
