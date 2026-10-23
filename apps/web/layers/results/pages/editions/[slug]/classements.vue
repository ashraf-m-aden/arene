<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const { text, date } = useFormat()

const slug = computed(() => String(route.params.slug))
const category = ref<'lycee' | 'universite'>('lycee')
const schoolView = ref<'total' | 'perPlayer'>('total')

const { data, refresh } = await useAsyncData(
  `rankings-${slug.value}`,
  async () => {
    const { $api } = useNuxtApp()
    const edition = await $api.get<{ data: any }>(`/editions/${slug.value}`).then((r) => r.data)
    const query = new URLSearchParams({ limit: '50', ageCategory: category.value })
    const [players, schools] = await Promise.all([
      $api
        .get<{ data: any }>(`/editions/${edition._id}/rankings/players?${query}`)
        .then((r) => r.data)
        .catch(() => ({ strikers: [], defenders: [] })),
      $api
        .get<{ data: any; meta?: any }>(`/editions/${edition._id}/rankings/schools`)
        .then((r) => ({ data: r.data, meta: r.meta }))
        .catch(() => ({ data: null, meta: null }))
    ])
    return { edition, players, schools: schools.data, meta: schools.meta }
  },
  { watch: [category] }
)

const edition = computed(() => data.value?.edition)
const strikers = computed(() => data.value?.players?.strikers ?? [])
const defenders = computed(() => data.value?.players?.defenders ?? [])

const schoolRows = computed(() => {
  const schools = data.value?.schools
  if (!schools) return []
  return schoolView.value === 'perPlayer'
    ? schools.perPlayer?.[category.value] ?? []
    : schools[category.value] ?? []
})

/** En journée de tournoi, la page se remet à jour toute seule. */
onMounted(() => {
  const live = ['qualifiers', 'finals'].includes(edition.value?.status)
  if (!live) return
  const timer = setInterval(() => refresh(), 60000)
  onBeforeUnmount(() => clearInterval(timer))
})

useSeoPage({
  title: `${t('results.title')} — ${text(edition.value?.title)}`,
  description: t('results.lead'),
  jsonLd: breadcrumbLd([
    { name: "L'Arène", path: '/' },
    { name: t('editions.title'), path: '/editions' },
    { name: text(edition.value?.title), path: `/editions/${slug.value}` },
    { name: t('results.title'), path: `/editions/${slug.value}/classements` }
  ])
})

const ratio = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)} %` : '—'
</script>

<template>
  <div v-if="edition">
    <section class="section section--ink">
      <div class="container stack">
        <p class="eyebrow">{{ text(edition.title) }}</p>
        <h1>{{ $t('results.title') }}</h1>
        <p class="lead">{{ $t('results.lead') }}</p>
        <p v-if="data?.meta?.computedAt" class="muted numeric">
          {{ $t('results.updatedAt') }} {{ date(data.meta.computedAt, true) }}
        </p>
      </div>
    </section>

    <div class="container">
      <AreneEditionTabs :slug="edition.slug" />
    </div>

    <section class="section">
      <div class="container stack">
        <div class="cluster">
          <button
            v-for="option in ['lycee', 'universite']"
            :key="option"
            class="btn btn--sm"
            :class="category === option ? 'btn--ink' : 'btn--ghost'"
            @click="category = option as 'lycee' | 'universite'"
          >
            {{ $t(`category.${option}`) }}
          </button>
        </div>

        <div class="grid grid--2">
          <div>
            <h2>{{ $t('results.strikers') }}</h2>
            <div v-if="strikers.length" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{{ $t('results.player') }}</th>
                    <th>{{ $t('results.school') }}</th>
                    <th class="numeric">{{ $t('results.goals') }}</th>
                    <th class="numeric">{{ $t('results.ratio') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in strikers" :key="row.registrationId">
                    <td class="table__rank numeric" :class="`table__rank--${row.rank}`">
                      {{ row.rank }}
                    </td>
                    <td><strong>{{ row.name }}</strong></td>
                    <td>
                      <span v-if="row.school">{{ text(row.school.name) }}</span>
                      <span v-else>—</span>
                    </td>
                    <td class="numeric"><strong>{{ row.goals }}</strong></td>
                    <td class="numeric">{{ ratio(row.goals, row.attempts) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <AreneEmpty v-else :title="$t('results.empty')" />
          </div>

          <div>
            <h2>{{ $t('results.defenders') }}</h2>
            <div v-if="defenders.length" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{{ $t('results.player') }}</th>
                    <th>{{ $t('results.school') }}</th>
                    <th class="numeric">{{ $t('results.stops') }}</th>
                    <th class="numeric">{{ $t('results.ratio') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in defenders" :key="row.registrationId">
                    <td class="table__rank numeric" :class="`table__rank--${row.rank}`">
                      {{ row.rank }}
                    </td>
                    <td><strong>{{ row.name }}</strong></td>
                    <td>
                      <span v-if="row.school">{{ text(row.school.name) }}</span>
                      <span v-else>—</span>
                    </td>
                    <td class="numeric"><strong>{{ row.stops }}</strong></td>
                    <td class="numeric">{{ ratio(row.stops, row.attempts) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <AreneEmpty v-else :title="$t('results.empty')" />
          </div>
        </div>

        <div class="stack">
          <div class="spread">
            <h2>{{ $t('results.schools') }}</h2>
            <div class="cluster">
              <button
                class="btn btn--sm"
                :class="schoolView === 'total' ? 'btn--ink' : 'btn--ghost'"
                @click="schoolView = 'total'"
              >
                {{ $t('results.viewTotal') }}
              </button>
              <button
                class="btn btn--sm"
                :class="schoolView === 'perPlayer' ? 'btn--ink' : 'btn--ghost'"
                @click="schoolView = 'perPlayer'"
              >
                {{ $t('results.viewPerPlayer') }}
              </button>
            </div>
          </div>

          <div v-if="schoolRows.length" class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{{ $t('results.school') }}</th>
                  <th class="numeric">{{ $t('schools.players') }}</th>
                  <th class="numeric">{{ $t('results.wins') }}</th>
                  <th class="numeric">{{ $t('results.points') }}</th>
                  <th class="numeric">{{ $t('results.pointsPerPlayer') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in schoolRows" :key="row.schoolId">
                  <td class="table__rank numeric" :class="`table__rank--${row.rank}`">
                    {{ row.rank }}
                  </td>
                  <td>
                    {{ text(row.name) }}
                  </td>
                  <td class="numeric">{{ row.players }}</td>
                  <td class="numeric">{{ row.wins }}</td>
                  <td class="numeric"><strong>{{ row.points }}</strong></td>
                  <td class="numeric">{{ row.pointsPerPlayer }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <AreneEmpty v-else :title="$t('results.empty')" />
        </div>
      </div>
    </section>
  </div>
</template>
