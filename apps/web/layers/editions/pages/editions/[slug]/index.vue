<script setup lang="ts">
const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { text, date, money, daysUntil } = useFormat()
const config = useRuntimeConfig()

const slug = computed(() => String(route.params.slug))

const { data: edition } = await useAsyncData(`edition-${slug.value}`, async () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any }>(`/editions/${slug.value}`).then((r) => r.data)
})

if (!edition.value) {
  throw createError({ statusCode: 404, statusMessage: 'Édition introuvable', fatal: true })
}

const isOpen = computed(() => edition.value?.status === 'registration_open')
const siteUrl = String(config.public.siteUrl).replace(/\/$/, '')

const categories = computed(() => Object.entries(edition.value?.seats || {}))

useSeoPage({
  title: `${text(edition.value.title)} — L'Arène`,
  description: text(edition.value.description).slice(0, 155),
  type: 'article',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: text(edition.value.title),
      description: text(edition.value.description),
      startDate: edition.value.registrationOpensAt,
      endDate: edition.value.registrationClosesAt,
      sport: 'Football',
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: edition.value.venue?.name,
        address: edition.value.venue?.address || 'Djibouti'
      },
      organizer: { '@type': 'Organization', name: "L'Arène", url: siteUrl },
      offers: {
        '@type': 'Offer',
        price: edition.value.fee,
        priceCurrency: 'DJF',
        url: `${siteUrl}${locale.value === 'ar' ? '/ar' : ''}/inscription`,
        availability: isOpen.value ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut'
      }
    },
    breadcrumbLd([
      { name: "L'Arène", path: '/' },
      { name: t('editions.title'), path: '/editions' },
      { name: text(edition.value.title), path: `/editions/${slug.value}` }
    ])
  ]
})
</script>

<template>
  <div v-if="edition">
    <section class="edition-hero">
      <div class="container stack">
        <p class="eyebrow">{{ $t(`editionStatus.${edition.status}`) }}</p>
        <h1>{{ text(edition.title) }}</h1>
        <p class="lead">{{ text(edition.description) }}</p>

        <div class="cluster">
          <NuxtLink v-if="isOpen" :to="localePath('/inscription')" class="btn btn--primary">
            {{ $t('editions.registerCta') }}
          </NuxtLink>
          <span v-else class="badge badge--warning">
            {{ edition.status === 'announced' ? $t('editions.soonNotice') : $t('editions.closedNotice') }}
          </span>
          <span v-if="isOpen" class="numeric muted">
            {{ $t('editions.closesIn', { days: daysUntil(edition.registrationClosesAt) }) }}
          </span>
        </div>
      </div>
    </section>

    <div class="container">
      <AreneEditionTabs :slug="edition.slug" />
    </div>

    <section class="section">
      <div class="container grid grid--sidebar">
        <div class="stack">
          <h2>{{ $t('editions.seatsByRole') }}</h2>
          <div class="grid grid--2">
            <article v-for="[category, roles] in categories" :key="category" class="card">
              <h3 class="card__title">{{ $t(`category.${category}`) }}</h3>
              <AreneMeter
                v-for="(seat, role) in roles"
                :key="role"
                :label="$t(`role.${role}`)"
                :used="seat.used"
                :capacity="seat.capacity"
              />
            </article>
          </div>

          <h2>{{ $t('editions.tabs.rules') }}</h2>
          <ul class="facts">
            <li>
              <strong class="numeric">{{ edition.rules?.gradeThreshold }}/20</strong>
              <span>{{ $t('editions.threshold') }}</span>
            </li>
            <li>
              <strong class="numeric">{{ money(edition.fee) }}</strong>
              <span>{{ $t('editions.fee') }}</span>
            </li>
            <li>
              <strong>{{ edition.rules?.requiresOriginalBulletin ? $t('common.yes') : $t('common.no') }}</strong>
              <span>{{ $t('registrations.originalBulletin') }}</span>
            </li>
          </ul>
          <NuxtLink :to="localePath(`/editions/${edition.slug}/reglement`)" class="btn btn--ghost btn--sm">
            {{ $t('home.ctaRules') }}
          </NuxtLink>
        </div>

        <aside class="card card--flat stack">
          <h2 class="card__title">{{ $t('editions.venue') }}</h2>
          <p>
            <strong>{{ edition.venue?.name }}</strong><br>
            <span class="muted">{{ edition.venue?.address }} — {{ edition.venue?.city }}</span>
          </p>
          <a
            v-if="edition.venue?.mapUrl"
            :href="edition.venue.mapUrl"
            class="btn btn--ghost btn--sm"
            rel="noopener"
            target="_blank"
          >
            {{ $t('editions.venue') }}
          </a>

          <hr class="divider">

          <h2 class="card__title">{{ $t('editions.registrationWindow') }}</h2>
          <p class="numeric">
            {{ date(edition.registrationOpensAt) }}<br>
            → {{ date(edition.registrationClosesAt) }}
          </p>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.edition-hero {
  @include on-ink;

  padding-block: var(--space-8) var(--space-7);
}

.facts {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));

  li {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-4);
    background: var(--color-paper);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
  }

  strong {
    font-family: var(--font-display);
    font-size: var(--text-xl);
  }

  span {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-muted);
  }
}
</style>
