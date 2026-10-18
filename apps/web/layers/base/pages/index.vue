<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { text, date, money, daysUntil } = useFormat()
const config = useRuntimeConfig()

/** Chargement côté serveur : le contenu est dans le HTML initial, indispensable au SEO. */
const { data: edition } = await useAsyncData('home-edition', () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any }>('/editions/current').then((r) => r.data).catch(() => null)
})

const { data: galleries } = await useAsyncData(
  'home-galleries',
  () => {
    const { $api } = useNuxtApp()
    if (!edition.value?._id) return Promise.resolve([])
    return $api
      .get<{ data: any[] }>(`/editions/${edition.value._id}/galleries`)
      .then((r) => r.data.slice(0, 3))
      .catch(() => [])
  },
  { watch: [edition] }
)

const isOpen = computed(() => edition.value?.status === 'registration_open')
const closesIn = computed(() => daysUntil(edition.value?.registrationClosesAt))

const totalSeatsLeft = computed(() => {
  const seats = edition.value?.seats
  if (!seats) return 0
  return Object.values(seats).reduce(
    (total: number, byRole: any) =>
      total + Object.values(byRole).reduce((sum: number, row: any) => sum + row.left, 0),
    0
  )
})

const siteUrl = String(config.public.siteUrl).replace(/\/$/, '')

useSeoPage({
  title: edition.value
    ? `${text(edition.value.title)} — Génération Mérite`
    : 'Génération Mérite — tournoi de foot jeunes Djibouti',
  description: edition.value
    ? text(edition.value.description).slice(0, 155)
    : t('home.heroLead'),
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Génération Mérite',
      url: siteUrl,
      sameAs: [config.public.youtubeChannel].filter(Boolean),
      areaServed: 'DJ'
    },
    ...(edition.value
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'SportsEvent',
            name: text(edition.value.title),
            startDate: edition.value.registrationOpensAt,
            endDate: edition.value.registrationClosesAt,
            eventStatus: 'https://schema.org/EventScheduled',
            sport: 'Football',
            location: {
              '@type': 'Place',
              name: edition.value.venue?.name,
              address: edition.value.venue?.address || 'Djibouti'
            },
            organizer: { '@type': 'Organization', name: 'Génération Mérite', url: siteUrl },
            offers: {
              '@type': 'Offer',
              price: edition.value.fee,
              priceCurrency: 'DJF',
              availability: isOpen.value
                ? 'https://schema.org/InStock'
                : 'https://schema.org/SoldOut',
              url: `${siteUrl}${locale.value === 'ar' ? '/ar' : ''}/inscription`
            }
          }
        ]
      : [])
  ]
})

const steps = [1, 2, 3, 4]
const duelRules = [
  { key: 'ruleAttempts', figure: '5' },
  { key: 'ruleOpponents', figure: '3' },
  { key: 'ruleFinalists', figure: '8' },
  { key: 'ruleMerit', figure: '12' }
]
</script>

<template>
  <div>
    <section class="hero">
      <div class="container hero__inner">
        <div class="hero__text">
          <p v-if="edition" class="eyebrow">{{ $t('home.heroEyebrow') }}</p>
          <h1 class="display">{{ $t('home.heroTitle') }}</h1>
          <p class="hero__lead">{{ $t('home.heroLead') }}</p>

          <div v-if="edition" class="hero__meta">
            <span class="badge badge--gold">{{ $t(`editionStatus.${edition.status}`) }}</span>
            <span class="badge badge--ink">{{ text(edition.title) }}</span>
            <span v-if="edition.venue?.name" class="badge">{{ edition.venue.name }}</span>
          </div>

          <div class="hero__cta">
            <NuxtLink
              v-if="isOpen"
              :to="localePath('/inscription')"
              class="btn btn--primary btn--lg"
            >
              {{ $t('home.ctaRegister') }}
              <span class="icon-directional" aria-hidden="true">→</span>
            </NuxtLink>
            <NuxtLink :to="localePath('/reglement')" class="btn btn--ghost btn--lg">
              {{ $t('home.ctaRules') }}
            </NuxtLink>
          </div>

          <p v-if="isOpen && closesIn" class="hero__countdown numeric">
            {{ $t('editions.closesIn', { days: closesIn }) }}
          </p>
        </div>

        <aside v-if="edition" class="hero__card">
          <h2 class="hero__card-title">{{ text(edition.title) }}</h2>
          <dl class="hero__facts">
            <div>
              <dt>{{ $t('editions.registrationWindow') }}</dt>
              <dd>{{ date(edition.registrationOpensAt) }} → {{ date(edition.registrationClosesAt) }}</dd>
            </div>
            <div>
              <dt>{{ $t('editions.fee') }}</dt>
              <dd class="numeric">{{ money(edition.fee) }}</dd>
            </div>
            <div>
              <dt>{{ $t('editions.threshold') }}</dt>
              <dd class="numeric">{{ edition.rules?.gradeThreshold }}/20</dd>
            </div>
            <div v-if="totalSeatsLeft">
              <dt>{{ $t('common.seatsLeft') }}</dt>
              <dd class="numeric">{{ totalSeatsLeft }}</dd>
            </div>
          </dl>
          <NuxtLink :to="localePath(`/editions/${edition.slug}`)" class="btn btn--ink btn--block btn--sm">
            {{ $t('editions.seeEdition') }}
          </NuxtLink>
        </aside>

        <GmEmpty v-else :title="$t('home.noEdition')" :hint="$t('home.noEditionHint')" />
      </div>
    </section>

    <section class="section">
      <div class="container">
        <GmSectionHead :eyebrow="$t('home.howTitle')" :title="$t('home.howLead')" />
        <ol class="steps-grid">
          <li v-for="step in steps" :key="step" class="step">
            <span class="step__num numeric">{{ step }}</span>
            <h3>{{ $t(`home.step${step}`) }}</h3>
            <p class="muted">{{ $t(`home.step${step}Text`) }}</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="section section--ink">
      <div class="container">
        <GmSectionHead :title="$t('home.rulesTitle')" align="center" />
        <div class="grid grid--4">
          <div v-for="rule in duelRules" :key="rule.key" class="rule">
            <span class="rule__figure numeric">{{ rule.figure }}</span>
            <h3>{{ $t(`home.${rule.key}`) }}</h3>
            <p>{{ $t(`home.${rule.key}Text`) }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container grid grid--2">
        <article class="card card--flat">
          <h2 class="card__title">{{ $t('home.schoolsTitle') }}</h2>
          <p class="muted">{{ $t('home.schoolsLead') }}</p>
          <NuxtLink
            :to="localePath(edition ? `/editions/${edition.slug}/classements` : '/ecoles')"
            class="btn btn--pitch btn--sm"
          >
            {{ $t('home.schoolsCta') }}
          </NuxtLink>
        </article>

        <article class="card card--flat">
          <h2 class="card__title">{{ $t('home.galleriesTitle') }}</h2>
          <ul v-if="galleries?.length" class="gallery-list">
            <li v-for="gallery in galleries" :key="gallery._id">
              <NuxtLink :to="localePath(`/galeries/${gallery.slug}`)">
                {{ text(gallery.title) }}
              </NuxtLink>
            </li>
          </ul>
          <NuxtLink :to="localePath('/galeries')" class="btn btn--ghost btn--sm">
            {{ $t('home.galleriesCta') }}
          </NuxtLink>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.hero {
  @include on-ink;

  position: relative;
  padding-block: var(--space-8) var(--space-9);
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset-block-start: -30%;
    inset-inline-end: -10%;
    inline-size: 32rem;
    block-size: 32rem;
    background: radial-gradient(circle, rgb(231 178 62 / 22%), transparent 65%);
    pointer-events: none;
  }
}

.hero__inner {
  position: relative;
  z-index: 1;
  display: grid;
  gap: var(--space-7);
  align-items: start;

  @include from(md) {
    grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 1fr);
    gap: var(--space-8);
  }
}

.hero__text {
  display: grid;
  gap: var(--space-4);
}

.hero__lead {
  font-size: var(--text-lg);
  max-inline-size: 52ch;
  opacity: 0.88;
}

.hero__meta,
.hero__cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

.hero__cta {
  margin-block-start: var(--space-2);
}

.hero__countdown {
  font-size: var(--text-sm);
  color: var(--color-gold-bright);
}

.hero__card {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  background: rgb(255 255 255 / 6%);
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--radius-xl);
  backdrop-filter: blur(6px);
}

.hero__card-title {
  font-size: var(--text-xl);
}

.hero__facts {
  display: grid;
  gap: var(--space-3);

  dt {
    font-size: var(--text-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-gold-bright);
  }

  dd {
    margin: 0;
    font-size: var(--text-sm);
  }
}

.steps-grid {
  display: grid;
  gap: var(--space-5);
  padding: 0;
  list-style: none;
  counter-reset: none;

  @include from(sm) {
    grid-template-columns: repeat(2, 1fr);
  }

  @include from(lg) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.step {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding-block-start: var(--space-4);
  border-block-start: 2px solid var(--color-line);

  h3 {
    font-size: var(--text-lg);
  }
}

.step__num {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--color-gold);
  line-height: 1;
}

.rule {
  display: grid;
  gap: var(--space-2);
  align-content: start;

  h3 {
    font-size: var(--text-lg);
  }

  p {
    font-size: var(--text-sm);
    opacity: 0.82;
  }
}

.rule__figure {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 800;
  line-height: 1;
  color: var(--color-gold-bright);
}

.gallery-list {
  display: grid;
  gap: var(--space-2);
  font-size: var(--text-sm);
}
</style>
