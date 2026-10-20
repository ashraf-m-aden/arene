<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { text, date, money, number, daysUntil } = useFormat()
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
const isLive = computed(() =>
  ['qualifiers', 'finals', 'completed'].includes(edition.value?.status)
)
const closesIn = computed(() => daysUntil(edition.value?.registrationClosesAt))

/**
 * Pendant et après les journées de tournoi, l'accueil affiche les vrais
 * classements : c'est là que la compétition devient concrète.
 */
const { data: live } = await useAsyncData(
  'home-live',
  () => {
    const { $api } = useNuxtApp()
    if (!edition.value?._id || !isLive.value) return Promise.resolve(null)
    const id = edition.value._id
    return Promise.all([
      $api
        .get<{ data: any }>(`/editions/${id}/rankings/players`)
        .then((r) => r.data)
        .catch(() => null),
      $api
        .get<{ data: any }>(`/editions/${id}/rankings/schools`)
        .then((r) => r.data)
        .catch(() => null)
    ]).then(([players, schools]) => ({ players, schools }))
  },
  { watch: [edition] }
)

const topStriker = computed(() => live.value?.players?.strikers?.[0] ?? null)
const topDefender = computed(() => live.value?.players?.defenders?.[0] ?? null)

/** Podium des écoles : la catégorie qui a déjà joué, lycée en priorité. */
const podiumCategory = computed<'lycee' | 'universite' | null>(() => {
  const schools = live.value?.schools
  if (schools?.lycee?.length) return 'lycee'
  if (schools?.universite?.length) return 'universite'
  return null
})

const podium = computed(() => {
  if (!podiumCategory.value) return []
  return (live.value?.schools?.[podiumCategory.value] ?? []).slice(0, 3)
})

const hasLive = computed(() =>
  Boolean(topStriker.value || topDefender.value || podium.value.length)
)

/** Places restantes par rôle, toutes catégories confondues : c'est l'enjeu du héros. */
const seatsByRole = computed(() => {
  const roles: Record<string, { capacity: number; used: number; left: number }> = {
    striker: { capacity: 0, used: 0, left: 0 },
    defender: { capacity: 0, used: 0, left: 0 }
  }
  for (const byRole of Object.values(edition.value?.seats || {}) as any[]) {
    for (const [role, seat] of Object.entries(byRole || {}) as any[]) {
      if (!roles[role]) roles[role] = { capacity: 0, used: 0, left: 0 }
      roles[role].capacity += seat?.capacity ?? 0
      roles[role].used += seat?.used ?? 0
      roles[role].left += seat?.left ?? Math.max(0, (seat?.capacity ?? 0) - (seat?.used ?? 0))
    }
  }
  return roles
})

const sides = computed(() => [
  { role: 'striker' as const, ...seatsByRole.value.striker },
  { role: 'defender' as const, ...seatsByRole.value.defender }
])

const totalSeatsLeft = computed(() =>
  sides.value.reduce((total, side) => total + side.left, 0)
)

const filled = (side: { capacity: number; used: number }) =>
  side.capacity > 0 ? Math.min(100, Math.round((side.used / side.capacity) * 100)) : 0

/** Bandeau LED : les chiffres qui donnent envie de s'inscrire. */
const tickerItems = computed(() => {
  const items: string[] = [
    t('home.ruleMerit'),
    t('home.ruleAttempts'),
    t('home.ruleOpponents'),
    t('home.ruleFinalists')
  ]
  if (!edition.value) return items
  items.unshift(t(`editionStatus.${edition.value.status}`))
  if (edition.value.fee) items.push(money(edition.value.fee))
  if (edition.value.venue?.name) items.push(edition.value.venue.name)
  if (totalSeatsLeft.value) {
    items.push(`${number(totalSeatsLeft.value)} ${t('common.seatsLeft')}`)
  }
  return items
})

/**
 * Les cinq tentatives d'une rencontre, en exemple : trois buts, deux arrêts.
 * `x`/`y` placent le ballon dans la cage du schéma décoratif.
 */
const shots = [
  { n: 1, outcome: 'goal', x: '11%', y: '22%' },
  { n: 2, outcome: 'save', x: '37%', y: '37%' },
  { n: 3, outcome: 'goal', x: '66%', y: '15%' },
  { n: 4, outcome: 'goal', x: '88%', y: '46%' },
  { n: 5, outcome: 'save', x: '66%', y: '44%' }
] as const

const steps = [1, 2, 3, 4]
const road = [1, 2, 3, 4]

const siteUrl = String(config.public.siteUrl).replace(/\/$/, '')

useSeoPage({
  title: edition.value
    ? `${text(edition.value.title)} — L'Arène`
    : "L'Arène — tournoi de foot jeunes Djibouti",
  description: edition.value
    ? text(edition.value.description).slice(0, 155)
    : t('home.heroLead'),
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: "L'Arène",
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
            organizer: { '@type': 'Organization', name: "L'Arène", url: siteUrl },
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
</script>

<template>
  <div>
    <!-- ───────── L'arène : affiche du duel, places restantes, compte à rebours ───────── -->
    <section class="arena">
      <div class="arena__decor" aria-hidden="true">
        <span class="arena__beam arena__beam--left" />
        <span class="arena__beam arena__beam--right" />
        <svg class="arena__pitch" viewBox="0 0 1200 400" preserveAspectRatio="none" fill="none">
          <circle cx="600" cy="400" r="190" />
          <circle cx="600" cy="400" r="58" />
          <rect x="400" y="316" width="400" height="84" rx="2" />
          <rect x="512" y="358" width="176" height="42" rx="2" />
          <path d="M0 398h1200" />
        </svg>
      </div>

      <div class="container arena__inner">
        <div class="arena__text">
          <p class="arena__kicker">
            <span class="arena__pulse" aria-hidden="true" />
            {{ edition ? $t(`editionStatus.${edition.status}`) : $t('home.heroEyebrow') }}
          </p>

          <h1 class="arena__title">
            <span class="arena__line">{{ $t('home.heroLine1') }}</span>
            <span class="arena__flash">{{ $t('home.heroLine2') }}</span>
          </h1>

          <p class="arena__lead">{{ $t('home.heroLead') }}</p>

          <div class="arena__cta">
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

          <ul v-if="edition" class="arena__chips">
            <li class="badge badge--gold">{{ text(edition.title) }}</li>
            <li v-if="edition.venue?.name" class="badge">{{ edition.venue.name }}</li>
            <li class="badge">
              {{ date(edition.registrationOpensAt) }} → {{ date(edition.registrationClosesAt) }}
            </li>
          </ul>
        </div>

        <aside v-if="edition" class="scoreboard">
          <p class="scoreboard__title">{{ $t('home.faceoffTitle') }}</p>

          <div class="faceoff">
            <article
              v-for="side in sides"
              :key="side.role"
              class="camp"
              :class="`camp--${side.role}`"
            >
              <svg
                v-if="side.role === 'striker'"
                class="camp__icon"
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="19" cy="13" r="8.2" stroke="currentColor" stroke-width="2" />
                <path
                  d="M19 7.3l4.6 3.4-1.8 5.5h-5.6l-1.8-5.5L19 7.3z"
                  fill="currentColor"
                  opacity=".55"
                />
                <path
                  d="M3 26h9M5 21.5h6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  opacity=".6"
                />
              </svg>
              <svg
                v-else
                class="camp__icon"
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 27V9h22v18"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <path d="M11 9v18M17 9v18M23 9v18M5 15h22M5 21h22" stroke="currentColor" opacity=".35" />
                <circle cx="16" cy="18" r="4.4" fill="currentColor" />
              </svg>

              <p class="camp__role">{{ $t(`role.${side.role}`) }}</p>
              <p class="camp__value numeric">{{ number(side.left) }}</p>
              <p class="camp__unit">{{ $t('home.seatsOpenLabel') }}</p>

              <div
                class="gauge"
                role="meter"
                :aria-valuenow="side.used"
                :aria-valuemin="0"
                :aria-valuemax="side.capacity"
                :aria-label="$t('role.' + side.role)"
              >
                <span class="gauge__fill" :style="{ inlineSize: `${filled(side)}%` }" />
              </div>
              <p class="camp__gauge-text numeric">{{ side.used }} / {{ side.capacity }}</p>
            </article>

            <p class="faceoff__vs" aria-hidden="true">{{ $t('home.vs') }}</p>
          </div>

          <ClientOnly v-if="isOpen && edition.registrationClosesAt">
            <AreneCountdown
              :target="edition.registrationClosesAt"
              :label="$t('home.countdownTitle')"
            />
            <template #fallback>
              <p class="scoreboard__note numeric">
                {{ $t('editions.closesIn', { days: closesIn }) }}
              </p>
            </template>
          </ClientOnly>
          <p v-else class="scoreboard__note">{{ $t(`editionStatus.${edition.status}`) }}</p>

          <dl class="scoreboard__facts">
            <div>
              <dt>{{ $t('editions.fee') }}</dt>
              <dd class="numeric">{{ money(edition.fee) }}</dd>
            </div>
            <div>
              <dt>{{ $t('editions.threshold') }}</dt>
              <dd class="numeric">{{ edition.rules?.gradeThreshold }}/20</dd>
            </div>
          </dl>

          <NuxtLink
            :to="localePath(`/editions/${edition.slug}`)"
            class="btn btn--ghost btn--block btn--sm"
          >
            {{ $t('editions.seeEdition') }}
          </NuxtLink>
        </aside>

        <AreneEmpty v-else :title="$t('home.noEdition')" :hint="$t('home.noEditionHint')" />
      </div>
    </section>

    <AreneTicker :items="tickerItems" />

    <!-- ───────── Le duel : cinq tentatives, un score ───────── -->
    <section class="section duel">
      <div class="container">
        <AreneSectionHead
          :eyebrow="$t('home.duelEyebrow')"
          :title="$t('home.duelTitle')"
          :lead="$t('home.duelLead')"
          align="center"
        />

        <div class="duel__board">
          <div class="goal" aria-hidden="true">
            <svg class="keeper" viewBox="0 0 120 100" fill="none" aria-hidden="true">
              <path
                class="keeper__limb"
                d="M60 48 34 24M60 48l29-19M60 38v42M60 78l-11 22M60 78l12 22"
                stroke-width="9"
              />
              <path class="keeper__trunk" d="M60 40v40" stroke-width="20" />
              <circle class="keeper__head" cx="60" cy="26" r="9" />
              <circle class="keeper__glove" cx="32" cy="22" r="7" />
              <circle class="keeper__glove" cx="91" cy="27" r="7" />
            </svg>
            <span
              v-for="(shot, index) in shots"
              :key="shot.n"
              class="goal__ball"
              :class="`goal__ball--${shot.outcome}`"
              :style="{ '--x': shot.x, '--y': shot.y, '--i': index }"
            >
              <span class="goal__ball-num numeric">{{ shot.n }}</span>
            </span>
          </div>

          <ol class="shots">
            <li
              v-for="shot in shots"
              :key="shot.n"
              class="shot"
              :class="`shot--${shot.outcome}`"
            >
              <span class="shot__n numeric">{{ shot.n }}</span>
              <span class="shot__label">
                <span class="sr-only">{{ $t('home.attemptLabel', { n: shot.n }) }} — </span>
                {{ shot.outcome === 'goal' ? $t('home.goalLabel') : $t('home.saveLabel') }}
              </span>
            </li>
          </ol>

          <p class="scoreline">
            <span class="scoreline__side">{{ $t('role.striker') }}</span>
            <span class="scoreline__digits numeric">
              <strong>3</strong>
              <em aria-hidden="true">—</em>
              <strong>2</strong>
            </span>
            <span class="scoreline__side">{{ $t('role.defender') }}</span>
          </p>
          <p class="duel__hint muted">{{ $t('home.duelExample') }}</p>
        </div>

        <div class="grid grid--3 figures">
          <article v-for="key in ['ruleOpponents', 'ruleFinalists', 'ruleMerit']" :key="key" class="figure">
            <h3 class="figure__title">{{ $t(`home.${key}`) }}</h3>
            <p class="muted">{{ $t(`home.${key}Text`) }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ───────── La route vers le titre ───────── -->
    <section class="section section--sand road">
      <div class="container">
        <AreneSectionHead
          :eyebrow="$t('home.roadEyebrow')"
          :title="$t('home.roadTitle')"
          :lead="$t('home.roadLead')"
        />

        <ol class="road__track">
          <li v-for="stage in road" :key="stage" class="stage" :class="{ 'stage--last': stage === 4 }">
            <p class="stage__figure">
              <span class="numeric">{{ $t(`home.road${stage}Figure`) }}</span>
              <small>{{ $t(`home.road${stage}Unit`) }}</small>
            </p>
            <h3 class="stage__title">{{ $t(`home.road${stage}`) }}</h3>
            <p class="muted">{{ $t(`home.road${stage}Text`) }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- ───────── Le parcours du candidat ───────── -->
    <section class="section section--ink steps">
      <div class="container">
        <AreneSectionHead :eyebrow="$t('home.howTitle')" :title="$t('home.howLead')" />

        <ol class="steps__grid">
          <li v-for="step in steps" :key="step" class="ticket">
            <span class="ticket__num numeric">{{ step }}</span>
            <h3 class="ticket__title">{{ $t(`home.step${step}`) }}</h3>
            <p class="ticket__text">{{ $t(`home.step${step}Text`) }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- ───────── Le direct : vrais classements, seulement quand il y a des résultats ───────── -->
    <section v-if="hasLive" class="section live">
      <div class="container">
        <AreneSectionHead
          :eyebrow="$t('home.liveEyebrow')"
          :title="$t('home.liveTitle')"
          :lead="$t('home.liveLead')"
        />

        <div class="grid grid--2">
          <article v-if="topStriker" class="leader leader--striker">
            <p class="leader__label">{{ $t('home.topStriker') }}</p>
            <p class="leader__name">{{ topStriker.name }}</p>
            <p v-if="topStriker.school" class="leader__school muted">
              {{ text(topStriker.school.name) }}
            </p>
            <p class="leader__score">
              <span class="numeric">{{ topStriker.goals }}</span>
              <small>{{ $t('results.goals') }}</small>
            </p>
          </article>

          <article v-if="topDefender" class="leader leader--defender">
            <p class="leader__label">{{ $t('home.topDefender') }}</p>
            <p class="leader__name">{{ topDefender.name }}</p>
            <p v-if="topDefender.school" class="leader__school muted">
              {{ text(topDefender.school.name) }}
            </p>
            <p class="leader__score">
              <span class="numeric">{{ topDefender.stops }}</span>
              <small>{{ $t('results.stops') }}</small>
            </p>
          </article>
        </div>

        <div v-if="podium.length" class="podium">
          <h3 class="podium__title">
            {{ $t('home.podiumTitle') }}
            <span v-if="podiumCategory" class="badge badge--pitch">
              {{ $t(`category.${podiumCategory}`) }}
            </span>
          </h3>
          <ol class="podium__steps">
            <li
              v-for="school in podium"
              :key="school.schoolId"
              class="pedestal"
              :class="`pedestal--${school.rank}`"
            >
              <span class="pedestal__rank numeric">{{ school.rank }}</span>
              <NuxtLink :to="localePath(`/ecoles/${school.slug}`)" class="pedestal__name">
                {{ text(school.name) }}
              </NuxtLink>
              <span class="pedestal__points numeric">
                {{ number(school.points) }} {{ $t('home.pointsShort') }}
              </span>
            </li>
          </ol>
        </div>

        <NuxtLink
          :to="localePath(`/editions/${edition.slug}/classements`)"
          class="btn btn--ink btn--sm live__cta"
        >
          {{ $t('home.liveCta') }}
          <span class="icon-directional" aria-hidden="true">→</span>
        </NuxtLink>
      </div>
    </section>

    <!-- ───────── Écoles et images ───────── -->
    <section class="section section--sand closing">
      <div class="container grid grid--2">
        <article class="panel panel--schools">
          <p class="panel__eyebrow">{{ $t('nav.schools') }}</p>
          <h2 class="panel__title">{{ $t('home.schoolsTitle') }}</h2>
          <p class="panel__text">{{ $t('home.schoolsLead') }}</p>
          <ul class="chart" aria-hidden="true">
            <li v-for="bar in [42, 68, 54, 88, 61]" :key="bar" :style="{ '--h': `${bar}%` }" />
          </ul>
          <NuxtLink
            :to="localePath(edition ? `/editions/${edition.slug}/classements` : '/ecoles')"
            class="btn btn--pitch btn--sm"
          >
            {{ $t('home.schoolsCta') }}
            <span class="icon-directional" aria-hidden="true">→</span>
          </NuxtLink>
        </article>

        <article class="panel">
          <p class="panel__eyebrow">{{ $t('nav.galleries') }}</p>
          <h2 class="panel__title">{{ $t('home.galleriesTitle') }}</h2>
          <ul v-if="galleries?.length" class="strip">
            <li v-for="gallery in galleries" :key="gallery._id" class="strip__item">
              <NuxtLink :to="localePath(`/galeries/${gallery.slug}`)" class="strip__link">
                <img
                  v-if="gallery.coverUrl || gallery.items?.[0]?.thumbUrl"
                  :src="gallery.coverUrl || gallery.items[0].thumbUrl"
                  :alt="text(gallery.title)"
                  loading="lazy"
                  width="320"
                  height="220"
                >
                <span v-else class="strip__placeholder" aria-hidden="true" />
                <span class="strip__caption">{{ text(gallery.title) }}</span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="panel__text muted">{{ $t('galleries.empty') }}</p>
          <NuxtLink :to="localePath('/galeries')" class="btn btn--ghost btn--sm">
            {{ $t('home.galleriesCta') }}
          </NuxtLink>
        </article>
      </div>
    </section>

    <!-- ───────── Appel final ───────── -->
    <section class="callout">
      <div class="container callout__inner">
        <div class="callout__text">
          <p class="callout__eyebrow">{{ $t('home.ctaEyebrow') }}</p>
          <h2 class="callout__title">{{ $t('home.ctaTitle') }}</h2>
          <p>{{ $t('home.ctaLead') }}</p>
        </div>
        <NuxtLink
          :to="localePath(isOpen ? '/inscription' : '/editions')"
          class="btn btn--ink btn--lg"
        >
          {{ isOpen ? $t('home.ctaRegister') : $t('editions.title') }}
          <span class="icon-directional" aria-hidden="true">→</span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.sr-only {
  @include visually-hidden;
}

/* ============================= L'arène ============================= */

.arena {
  position: relative;
  overflow: hidden;
  padding-block: var(--space-8) var(--space-9);
  background: var(--color-ink-deep);
  color: var(--color-on-ink);

  a {
    color: var(--color-gold-bright);
  }
}

.arena__decor {
  position: absolute;
  inset: 0;
  pointer-events: none;

  // Trame du filet, très discrète, sur toute la largeur.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      repeating-linear-gradient(60deg, rgb(255 255 255 / 4%) 0 1px, transparent 1px 16px),
      repeating-linear-gradient(-60deg, rgb(255 255 255 / 4%) 0 1px, transparent 1px 16px);
    mask-image: linear-gradient(180deg, rgb(0 0 0 / 70%), transparent 70%);
  }
}

/** Deux projecteurs de stade, braqués sur le centre du terrain. */
.arena__beam {
  position: absolute;
  inset-block-start: -45%;
  inline-size: 36rem;
  block-size: 36rem;
  border-radius: 50%;
  filter: blur(6px);
}

.arena__beam--left {
  inset-inline-start: -14%;
  background: radial-gradient(circle, rgb(31 157 107 / 20%), transparent 62%);
}

.arena__beam--right {
  inset-inline-end: -12%;
  background: radial-gradient(circle, rgb(231 178 62 / 26%), transparent 64%);
}

.arena__pitch {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  block-size: 62%;
  stroke: rgb(255 255 255 / 11%);
  stroke-width: 2;
}

.arena__inner {
  position: relative;
  z-index: 1;
  display: grid;
  gap: var(--space-7);
  align-items: center;

  @include from(md) {
    grid-template-columns: minmax(0, 1.3fr) minmax(21rem, 0.9fr);
    gap: var(--space-8);
  }
}

.arena__text {
  display: grid;
  gap: var(--space-4);
  justify-items: start;
}

.arena__kicker {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-4) var(--space-1) var(--space-3);
  border: 1px solid rgb(231 178 62 / 40%);
  border-radius: var(--radius-pill);
  background: rgb(231 178 62 / 10%);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
}

/** Le point qui respire : le tournoi est vivant. */
.arena__pulse {
  inline-size: 0.5rem;
  block-size: 0.5rem;
  border-radius: 50%;
  background: var(--color-gold-bright);
  box-shadow: 0 0 0 0 rgb(231 178 62 / 70%);
  animation: pulse 2.4s ease-out infinite;
}

@keyframes pulse {
  70% {
    box-shadow: 0 0 0 0.6rem rgb(231 178 62 / 0%);
  }

  100% {
    box-shadow: 0 0 0 0 rgb(231 178 62 / 0%);
  }
}

.arena__title {
  display: grid;
  gap: var(--space-2);
  justify-items: start;
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: 800;
  line-height: 0.94;
  letter-spacing: -0.035em;
}

.arena__line {
  text-wrap: balance;
}

/** Le bandeau doré, posé de travers comme un autocollant de vestiaire. */
.arena__flash {
  padding: 0.04em 0.34em 0.1em;
  background: linear-gradient(100deg, var(--color-gold-bright), var(--color-gold));
  border-radius: 6px;
  color: var(--color-ink-deep);
  text-transform: uppercase;
  letter-spacing: -0.02em;
  transform: rotate(-1.4deg);
  box-shadow: 0 10px 30px -14px rgb(231 178 62 / 70%);
}

[dir='rtl'] .arena__flash {
  transform: rotate(1.4deg);
}

.arena__lead {
  font-size: var(--text-lg);
  max-inline-size: 48ch;
  opacity: 0.86;
}

.arena__cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-block-start: var(--space-2);
}

.arena__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

/** Pas d'édition ouverte : le bloc vide doit rester lisible sur fond sombre. */
.arena :deep(.empty) {
  border-color: rgb(255 255 255 / 20%);
  color: rgb(243 239 230 / 80%);

  .muted {
    color: rgb(243 239 230 / 62%);
  }
}

/* ─── Le tableau d'affichage ─── */

.scoreboard {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  background: linear-gradient(170deg, rgb(255 255 255 / 9%), rgb(255 255 255 / 4%));
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(8px);
}

.scoreboard__title {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  text-align: center;
  opacity: 0.7;
}

.scoreboard__note {
  font-size: var(--text-sm);
  color: var(--color-gold-bright);
}

.scoreboard__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding-block-start: var(--space-3);
  border-block-start: 1px solid rgb(255 255 255 / 12%);

  dt {
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: 700;
  }
}

/**
 * Les deux camps, face à face, avec le médaillon VS au milieu : empilés sur
 * téléphone, côte à côte dès les petites tablettes.
 */
.faceoff {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: minmax(0, 1fr);
  justify-items: center;
  align-items: center;

  @include from(lg) {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: stretch;
  }
}

.faceoff__vs {
  position: relative;
  grid-area: 2 / 1;
  display: grid;
  place-items: center;
  align-self: center;
  inline-size: 2.9rem;
  block-size: 2.9rem;
  margin: 0;
  border-radius: 50%;
  background: var(--color-ink-deep);
  border: 2px solid var(--color-gold);
  color: var(--color-gold-bright);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 800;
  letter-spacing: 0.04em;

  @include from(lg) {
    grid-area: 1 / 2;
  }

  // L'anneau pointillé qui tourne : le compte à rebours du coup d'envoi.
  &::before {
    content: '';
    position: absolute;
    inset: -5px;
    border: 1px dashed rgb(231 178 62 / 45%);
    border-radius: 50%;
    animation: spin 14s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(1turn);
  }
}

.camp {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: var(--space-1);
  align-content: start;
  inline-size: 100%;
  padding: var(--space-4);
  background: rgb(6 17 28 / 55%);
  border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
  border-radius: var(--radius-lg);
  transition: transform var(--transition), border-color var(--transition);

  // Halo de la couleur du camp, dans le coin.
  &::before {
    content: '';
    position: absolute;
    inset-block-start: -45%;
    inset-inline-end: -30%;
    inline-size: 10rem;
    block-size: 10rem;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--accent) 26%, transparent), transparent 68%);
  }

  &:hover {
    border-color: var(--accent);
    transform: translateY(-3px);
  }
}

.camp--striker {
  --accent: var(--color-gold-bright);

  grid-area: 1 / 1;
}

.camp--defender {
  --accent: var(--color-pitch);

  grid-area: 3 / 1;

  @include from(lg) {
    grid-area: 1 / 3;
  }
}

.camp__icon {
  inline-size: 2rem;
  block-size: 2rem;
  color: var(--accent);
}

.camp__role {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}

.camp__value {
  font-family: var(--font-display);
  font-size: clamp(2rem, 1.4rem + 2vw, 2.9rem);
  font-weight: 800;
  line-height: 1;
}

.camp__unit {
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.66;
}

.camp__gauge-text {
  font-size: 0.68rem;
  opacity: 0.6;
}

.gauge {
  block-size: 0.4rem;
  margin-block-start: var(--space-2);
  background: rgb(255 255 255 / 14%);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.gauge__fill {
  display: block;
  block-size: 100%;
  background: var(--accent);
  border-radius: inherit;
}

/* ============================= Le duel ============================= */

.duel__board {
  display: grid;
  gap: var(--space-5);
  justify-items: center;
  margin-block-end: var(--space-8);
}

/** La cage, dessinée en CSS : poteaux, barre et filet. */
.goal {
  position: relative;
  inline-size: 100%;
  max-inline-size: 38rem;
  aspect-ratio: 5 / 2;
  border: 5px solid var(--color-text);
  border-block-end: 0;
  border-start-start-radius: 4px;
  border-start-end-radius: 4px;
  background-image:
    repeating-linear-gradient(45deg, var(--color-line) 0 1px, transparent 1px 14px),
    repeating-linear-gradient(-45deg, var(--color-line) 0 1px, transparent 1px 14px);
  background-color: color-mix(in srgb, var(--color-surface-2) 70%, transparent);

  // La ligne de but déborde des poteaux, comme sur le terrain.
  &::after {
    content: '';
    position: absolute;
    inset-inline: -8%;
    inset-block-end: -3px;
    block-size: 3px;
    background: var(--color-text);
    opacity: 0.85;
  }
}

/** Le gardien, réduit à sa silhouette : bras levés et gants sortis. */
.keeper {
  position: absolute;
  inset-block-end: 0;
  inset-inline-start: 50%;
  block-size: 74%;
  transform: translateX(-50%);
}

.keeper__limb,
.keeper__trunk {
  stroke: var(--color-pitch);
  stroke-linecap: round;
}

.keeper__trunk {
  stroke: var(--color-pitch-deep);
}

.keeper__head {
  fill: var(--color-pitch-deep);
}

.keeper__glove {
  fill: var(--color-gold);
  stroke: var(--color-gold-bright);
  stroke-width: 3;
}

.goal__ball {
  position: absolute;
  inset-inline-start: var(--x);
  inset-block-start: var(--y);
  display: grid;
  place-items: center;
  inline-size: 2.1rem;
  block-size: 2.1rem;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 28%, #fff, #ddd8cc);
  border: 2px solid var(--color-text);
  box-shadow: var(--shadow-sm);
  transform: translate(-50%, -50%);
  animation: bob 3.4s ease-in-out infinite;
  animation-delay: calc(var(--i) * 0.42s);
}

.goal__ball--goal {
  box-shadow: 0 0 0 5px rgb(231 178 62 / 28%);
}

.goal__ball--save {
  box-shadow: 0 0 0 5px rgb(194 69 47 / 22%);
  opacity: 0.86;
}

.goal__ball-num {
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--color-text);
}

@keyframes bob {
  50% {
    transform: translate(-50%, calc(-50% - 7px));
  }
}

/** La légende des cinq tentatives : but ou arrêt. */
.shots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.shot {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-paper);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.shot__n {
  display: grid;
  place-items: center;
  inline-size: 1.5rem;
  block-size: 1.5rem;
  border-radius: 50%;
  background: var(--color-surface-2);
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 800;
}

.shot--goal {
  border-color: color-mix(in srgb, var(--color-gold) 55%, transparent);

  .shot__n {
    background: var(--color-gold);
    color: var(--color-ink);
  }

  .shot__label {
    color: var(--color-warning);
  }
}

.shot--save {
  border-color: color-mix(in srgb, var(--color-pitch) 45%, transparent);

  .shot__n {
    background: var(--color-pitch);
    color: #fff;
  }

  .shot__label {
    color: var(--color-pitch-deep);
  }
}

/** Le score final, en gros, comme sur un panneau d'arbitre. */
.scoreline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  margin: 0;
}

.scoreline__side {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-muted);
}

.scoreline__digits {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  background: var(--color-ink);
  border-radius: var(--radius-md);
  color: var(--color-gold-bright);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  line-height: 1;

  em {
    font-style: normal;
    opacity: 0.5;
  }
}

.duel__hint {
  font-size: var(--text-sm);
}

.figure {
  padding-block-start: var(--space-4);
  border-block-start: 3px solid var(--color-gold);

  p {
    font-size: var(--text-sm);
  }
}

.figure__title {
  margin-block-end: var(--space-2);
  font-size: var(--text-lg);
}

/* ====================== La route vers le titre ====================== */

.road__track {
  display: grid;
  gap: var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;

  @include from(sm) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @include from(lg) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.stage {
  position: relative;
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding: var(--space-5);
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  transition: transform var(--transition), box-shadow var(--transition);

  &:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
  }

  // Le chevron qui relie une manche à la suivante.
  &:not(:last-child)::after {
    content: '';
    position: absolute;
    inset-inline-end: -0.62rem;
    inset-block-start: 50%;
    inline-size: 0.7rem;
    block-size: 0.7rem;
    border-block-start: 2px solid var(--color-gold);
    border-inline-end: 2px solid var(--color-gold);
    background: var(--color-surface-2);
    transform: translateY(-50%) rotate(45deg);

    @include until(lg) {
      display: none;
    }
  }

  p {
    font-size: var(--text-sm);
  }
}

[dir='rtl'] .stage:not(:last-child)::after {
  transform: translateY(-50%) rotate(225deg);
}

.stage--last {
  background: var(--color-ink);
  color: var(--color-on-ink);
  border-color: var(--color-gold);

  .muted {
    color: rgb(243 239 230 / 78%);
  }
}

.stage__figure {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);

  span {
    font-family: var(--font-display);
    font-size: 2.6rem;
    font-weight: 800;
    line-height: 1;
    color: var(--color-gold);
  }

  small {
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
}

.stage--last .stage__figure {
  span {
    color: var(--color-gold-bright);
  }

  small {
    color: rgb(243 239 230 / 70%);
  }
}

.stage__title {
  font-size: var(--text-lg);
}

/* ======================= Le parcours du candidat ======================= */

.steps__grid {
  position: relative;
  display: grid;
  gap: var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;

  @include from(sm) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @include from(lg) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.ticket {
  position: relative;
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding: var(--space-5);
  background: rgb(255 255 255 / 5%);
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: var(--radius-lg);

  // Encoches de ticket, en haut et en bas du bord intérieur.
  &::before,
  &::after {
    content: '';
    position: absolute;
    inset-inline-start: -0.45rem;
    inline-size: 0.9rem;
    block-size: 0.9rem;
    border-radius: 50%;
    background: var(--color-ink);
  }

  &::before {
    inset-block-start: 38%;
  }

  &::after {
    inset-block-start: 52%;
  }
}

.ticket__num {
  display: grid;
  place-items: center;
  inline-size: 2.6rem;
  block-size: 2.6rem;
  border-radius: 50%;
  background: var(--color-gold);
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 800;
  box-shadow: 0 0 0 5px rgb(201 153 42 / 18%);
}

.ticket__title {
  font-size: var(--text-lg);
}

.ticket__text {
  font-size: var(--text-sm);
  opacity: 0.82;
}

/* ============================= Le direct ============================= */

.leader {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: var(--space-1);
  padding: var(--space-5);
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  border-block-start: 4px solid var(--accent);
}

.leader--striker {
  --accent: var(--color-gold);
}

.leader--defender {
  --accent: var(--color-pitch);
}

.leader__label {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}

.leader__name {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 800;
}

.leader__school {
  font-size: var(--text-sm);
}

.leader__score {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin-block-start: var(--space-2);

  span {
    font-family: var(--font-display);
    font-size: 2.8rem;
    font-weight: 800;
    line-height: 1;
  }

  small {
    font-size: var(--text-xs);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
}

.podium {
  margin-block-start: var(--space-7);
}

.podium__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  margin-block-end: var(--space-5);
  font-size: var(--text-lg);
}

/** Podium 2 – 1 – 3 : le vainqueur au centre, sur la marche la plus haute. */
.podium__steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  align-items: end;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pedestal {
  display: grid;
  gap: var(--space-1);
  justify-items: center;
  padding: var(--space-4) var(--space-2);
  text-align: center;
  background: var(--color-surface-2);
  border: 1px solid var(--color-line);
  border-block-end: 0;
  border-start-start-radius: var(--radius-md);
  border-start-end-radius: var(--radius-md);
}

.pedestal--1 {
  order: 2;
  min-block-size: 10.5rem;
  background: linear-gradient(180deg, rgb(231 178 62 / 22%), transparent);
  border-color: var(--color-gold);
}

.pedestal--2 {
  order: 1;
  min-block-size: 8.5rem;
}

.pedestal--3 {
  order: 3;
  min-block-size: 7rem;
}

.pedestal__rank {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  line-height: 1;
  color: var(--color-gold);
}

.pedestal__name {
  font-weight: 600;
  font-size: var(--text-sm);
  color: inherit;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.pedestal__points {
  font-size: var(--text-xs);
  color: var(--color-muted);
}

.live__cta {
  margin-block-start: var(--space-6);
}

/* ======================== Écoles et images ======================== */

.panel {
  position: relative;
  display: grid;
  gap: var(--space-3);
  align-content: start;
  justify-items: start;
  padding: var(--space-6);
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-xl);
}

.panel__eyebrow {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-gold);
}

.panel__title {
  font-size: var(--text-xl);
}

.panel__text {
  font-size: var(--text-sm);
}

/** Petit graphique décoratif : les points gagnés par les écoles. */
.chart {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  inline-size: 100%;
  block-size: 5rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    flex: 1;
    block-size: var(--h);
    border-start-start-radius: var(--radius-sm);
    border-start-end-radius: var(--radius-sm);
    background: linear-gradient(180deg, var(--color-pitch), rgb(31 157 107 / 25%));
  }
}

/** Pellicule photo : les vignettes se chevauchent légèrement. */
.strip {
  display: flex;
  gap: var(--space-2);
  inline-size: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  @include scroll-x;
}

.strip__item {
  flex: 0 0 9.5rem;
}

.strip__link {
  display: grid;
  gap: var(--space-2);
  color: inherit;
  text-decoration: none;

  img,
  .strip__placeholder {
    display: block;
    inline-size: 100%;
    block-size: 6.5rem;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-line);
    transform: rotate(-1deg);
    transition: transform var(--transition);
  }

  .strip__placeholder {
    background: linear-gradient(135deg, var(--color-ink-soft), var(--color-ink));
  }

  &:hover img,
  &:hover .strip__placeholder {
    transform: rotate(0deg) scale(1.02);
  }
}

.strip__caption {
  font-size: var(--text-xs);
  font-weight: 600;
  @include clamp-lines(2);
}

/* ============================ Appel final ============================ */

.callout {
  position: relative;
  overflow: hidden;
  padding-block: var(--space-7);
  background: linear-gradient(100deg, var(--color-gold), var(--color-gold-bright));
  color: var(--color-ink-deep);

  // Rayures de maillot, en filigrane.
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
      135deg,
      rgb(6 17 28 / 7%) 0 10px,
      transparent 10px 22px
    );
    pointer-events: none;
  }
}

.callout__inner {
  position: relative;
  z-index: 1;
  display: grid;
  gap: var(--space-5);
  align-items: center;

  @include from(md) {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}

.callout__text {
  display: grid;
  gap: var(--space-2);

  p:last-child {
    font-size: var(--text-base);
    max-inline-size: 52ch;
  }
}

.callout__eyebrow {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  opacity: 0.72;
}

.callout__title {
  font-size: var(--text-2xl);
}
</style>
