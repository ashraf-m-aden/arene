<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { text } = useFormat()

const query = ref('')
const type = ref('')

const { data: schools, refresh } = await useAsyncData(
  'schools-list',
  () => {
    const { $api } = useNuxtApp()
    const params = new URLSearchParams({ limit: '100' })
    if (query.value) params.set('q', query.value)
    if (type.value) params.set('type', type.value)
    return $api.get<{ data: any[] }>(`/schools?${params}`).then((r) => r.data).catch(() => [])
  },
  { watch: [type] }
)

let timer: ReturnType<typeof setTimeout> | null = null
watch(query, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => refresh(), 350)
})

useSeoPage({
  title: `${t('schools.title')} — Génération Mérite`,
  description: t('schools.lead'),
  jsonLd: breadcrumbLd([
    { name: 'Génération Mérite', path: '/' },
    { name: t('schools.title'), path: '/ecoles' }
  ])
})
</script>

<template>
  <section class="section">
    <div class="container">
      <GmSectionHead :eyebrow="$t('nav.schools')" :title="$t('schools.title')" :lead="$t('schools.lead')" />

      <div class="filters card card--flat">
        <GmField :label="$t('schools.search')" for="q">
          <input id="q" v-model="query" class="input" type="search">
        </GmField>
        <GmField :label="$t('schools.type')" for="type">
          <select id="type" v-model="type" class="select">
            <option value="">{{ $t('common.all') }}</option>
            <option value="lycee">{{ $t('category.lycee') }}</option>
            <option value="universite">{{ $t('category.universite') }}</option>
          </select>
        </GmField>
      </div>

      <ul v-if="schools?.length" class="grid grid--3 school-list">
        <li v-for="school in schools" :key="school._id">
          <NuxtLink :to="localePath(`/ecoles/${school.slug}`)" class="card card--link">
            <span class="badge" :class="school.isVerified ? 'badge--pitch' : 'badge--warning'">
              {{ school.isVerified ? $t('schools.verified') : $t('schools.pending') }}
            </span>
            <h2 class="card__title">{{ text(school.name) }}</h2>
            <p class="muted">
              {{ $t(`category.${school.type}`) }} · {{ school.city }}
            </p>
          </NuxtLink>
        </li>
      </ul>

      <GmEmpty v-else :title="$t('schools.empty')" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.filters {
  display: grid;
  gap: var(--space-3);
  margin-block-end: var(--space-5);

  @include from(sm) {
    grid-template-columns: 2fr 1fr;
  }
}

.school-list {
  padding: 0;
  list-style: none;
}
</style>
