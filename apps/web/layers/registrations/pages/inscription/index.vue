<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const { text, money, date } = useFormat()
const registration = useRegistrationStore()

const { data: edition } = await useAsyncData('inscription-edition', () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any }>('/editions/current').then((r) => r.data).catch(() => null)
})

const isOpen = computed(() => edition.value?.status === 'registration_open')

useSeoPage({
  title: `${t('registrations.pitchTitle')} — Génération Mérite`,
  description: t('registrations.pitchLead'),
  jsonLd: breadcrumbLd([
    { name: 'Génération Mérite', path: '/' },
    { name: t('registrations.pitchTitle'), path: '/inscription' }
  ])
})

const needs = ['needPhoto', 'needBulletin', 'needAverage', 'needPhone']
</script>

<template>
  <div>
    <section class="section section--ink">
      <div class="container container--narrow stack">
        <p class="eyebrow">{{ edition ? text(edition.title) : $t('nav.register') }}</p>
        <h1>{{ $t('registrations.pitchTitle') }}</h1>
        <p class="lead">{{ $t('registrations.pitchLead') }}</p>

        <div v-if="isOpen" class="cluster">
          <NuxtLink
            v-if="auth.isLoggedIn"
            :to="localePath('/inscription/formulaire')"
            class="btn btn--primary btn--lg"
          >
            {{ registration.hasDraft ? $t('registrations.continueCta') : $t('registrations.startCta') }}
          </NuxtLink>
          <template v-else>
            <NuxtLink :to="localePath('/creer-compte')" class="btn btn--primary btn--lg">
              {{ $t('auth.createAccount') }}
            </NuxtLink>
            <NuxtLink :to="localePath('/connexion')" class="btn btn--ghost btn--lg">
              {{ $t('nav.login') }}
            </NuxtLink>
          </template>
        </div>

        <GmNotice v-else tone="danger">{{ $t('registrations.closed') }}</GmNotice>
        <p v-if="!auth.isLoggedIn && isOpen" class="muted">{{ $t('registrations.loginFirst') }}</p>
      </div>
    </section>

    <section class="section">
      <div class="container grid grid--sidebar">
        <div class="stack">
          <h2>{{ $t('registrations.need') }}</h2>
          <ul class="needs">
            <li v-for="need in needs" :key="need">
              <span aria-hidden="true">✓</span>
              {{ $t(`registrations.${need}`) }}
            </li>
          </ul>

          <h2>{{ $t('home.howTitle') }}</h2>
          <ol class="stack">
            <li v-for="step in [1, 2, 3, 4]" :key="step">
              <strong>{{ $t(`home.step${step}`) }}</strong>
              <p class="muted">{{ $t(`home.step${step}Text`) }}</p>
            </li>
          </ol>
        </div>

        <aside v-if="edition" class="card card--flat stack">
          <h2 class="card__title">{{ text(edition.title) }}</h2>
          <p class="numeric">
            {{ date(edition.registrationOpensAt) }} → {{ date(edition.registrationClosesAt) }}
          </p>
          <hr class="divider">
          <p>
            <strong class="numeric">{{ money(edition.fee) }}</strong><br>
            <span class="muted">{{ $t('registrations.feeNotice') }}</span>
          </p>
          <p>
            <strong class="numeric">{{ edition.rules?.gradeThreshold }}/20</strong><br>
            <span class="muted">{{ $t('editions.threshold') }}</span>
          </p>
          <NuxtLink :to="localePath(`/editions/${edition.slug}`)" class="btn btn--ghost btn--sm">
            {{ $t('editions.seeEdition') }}
          </NuxtLink>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.needs {
  display: grid;
  gap: var(--space-3);

  li {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-4);
    background: var(--color-paper);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
  }

  span {
    color: var(--color-pitch);
    font-weight: 700;
  }
}

ol.stack li {
  padding-inline-start: var(--space-4);
  border-inline-start: 2px solid var(--color-gold);
}
</style>
