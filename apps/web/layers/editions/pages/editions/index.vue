<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { text, date, money } = useFormat()

const { data: editions } = await useAsyncData('editions-list', () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any[] }>('/editions').then((r) => r.data).catch(() => [])
})

useSeoPage({
  title: `${t('editions.title')} — Génération Mérite`,
  description: t('editions.lead'),
  jsonLd: breadcrumbLd([
    { name: 'Génération Mérite', path: '/' },
    { name: t('editions.title'), path: '/editions' }
  ])
})
</script>

<template>
  <section class="section">
    <div class="container">
      <GmSectionHead :eyebrow="$t('nav.editions')" :title="$t('editions.title')" :lead="$t('editions.lead')" />

      <div v-if="editions?.length" class="grid grid--2">
        <NuxtLink
          v-for="edition in editions"
          :key="edition._id"
          :to="localePath(`/editions/${edition.slug}`)"
          class="card card--link"
        >
          <div class="cluster">
            <span class="badge badge--gold">{{ $t(`editionStatus.${edition.status}`) }}</span>
            <span v-if="edition.season" class="badge numeric">{{ edition.season }}</span>
          </div>
          <h2 class="card__title">{{ text(edition.title) }}</h2>
          <p class="muted">{{ text(edition.description).slice(0, 160) }}</p>
          <dl class="card__meta">
            <div>
              <dt class="muted">{{ $t('editions.registrationWindow') }}</dt>
              <dd>{{ date(edition.registrationOpensAt) }} → {{ date(edition.registrationClosesAt) }}</dd>
            </div>
            <div>
              <dt class="muted">{{ $t('editions.fee') }}</dt>
              <dd class="numeric">{{ money(edition.fee) }}</dd>
            </div>
          </dl>
        </NuxtLink>
      </div>

      <GmEmpty v-else :title="$t('editions.empty')" :hint="$t('home.noEditionHint')" />
    </div>
  </section>
</template>

<style scoped lang="scss">
dl.card__meta {
  display: grid;
  gap: var(--space-3);

  dd {
    margin: 0;
    font-weight: 600;
    color: var(--color-text);
  }

  dt {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
}
</style>
