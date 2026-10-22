<script setup lang="ts">
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { text, statusLabel, statusTone, roleLabel, categoryLabel } = useFormat()

const slug = computed(() => String(route.params.slug))

const { data } = await useAsyncData(`school-${slug.value}`, () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any }>(`/schools/${slug.value}`).then((r) => r.data)
})

if (!data.value?.school) {
  throw createError({ statusCode: 404, statusMessage: 'École introuvable', fatal: true })
}

const school = computed(() => data.value.school)
const players = computed(() => data.value?.players ?? [])
const ranking = computed(() => data.value?.ranking)
const edition = computed(() => data.value?.edition)

useSeoPage({
  title: `${text(school.value.name)} — L'Arène`,
  description: `${text(school.value.name)} au tournoi de duels 1v1 L'Arène : joueurs engagés, points et classement.`,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': school.value.type === 'universite' ? 'CollegeOrUniversity' : 'HighSchool',
      name: text(school.value.name),
      address: { '@type': 'PostalAddress', addressLocality: school.value.city, addressCountry: 'DJ' }
    },
    breadcrumbLd([
      { name: "L'Arène", path: '/' },
      { name: t('schools.title'), path: '/ecoles' },
      { name: text(school.value.name), path: `/ecoles/${slug.value}` }
    ])
  ]
})
</script>

<template>
  <div v-if="school">
    <section class="section section--ink">
      <div class="container stack">
        <p class="eyebrow">{{ $t(`category.${school.type}`) }} · {{ school.city }}</p>
        <h1>{{ text(school.name) }}</h1>
        <div v-if="ranking" class="cluster">
          <span class="badge badge--gold numeric">
            {{ $t('schools.rank') }} {{ ranking.rank }}
          </span>
          <span class="badge numeric">{{ ranking.points }} {{ $t('schools.points') }}</span>
          <span class="badge numeric">{{ ranking.players }} {{ $t('schools.players') }}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="spread">
          <h2>{{ $t('schools.qualified') }}</h2>
          <NuxtLink
            v-if="edition"
            :to="localePath(`/editions/${edition.slug}/classements`)"
            class="btn btn--ghost btn--sm"
          >
            {{ $t('schools.seeRanking') }}
          </NuxtLink>
        </div>

        <div v-if="players.length" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ $t('registrations.player.name') }}</th>
                <th>{{ $t('registrations.staff.filterRole') }}</th>
                <th>{{ $t('registrations.staff.filterCategory') }}</th>
                <th>{{ $t('registrations.staff.filterStatus') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="player in players" :key="player.id">
                <td><strong>{{ player.name }}</strong></td>
                <td>{{ roleLabel(player.role) }}</td>
                <td>{{ categoryLabel(player.ageCategory) }}</td>
                <td>
                  <span class="badge" :class="statusTone(player.status)">
                    {{ statusLabel(player.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <AreneEmpty v-else :title="$t('schools.noPlayers')" />
      </div>
    </section>
  </div>
</template>
