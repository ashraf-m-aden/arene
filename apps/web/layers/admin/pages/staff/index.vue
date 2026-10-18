<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'staff' })

const { t } = useI18n()
const localePath = useLocalePath()
const editions = useEditionsStore()
const { text, money, date } = useFormat()

useNoIndex(t('admin.dashboardTitle'))

const stats = ref<any>(null)
const pending = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const edition = await editions.fetchCurrent(true)
    if (edition?._id) stats.value = await editions.fetchStats(edition._id)
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
})

const edition = computed(() => editions.current)
const statuses = computed(() => Object.entries(stats.value?.byStatus ?? {}))
const seats = computed(() => Object.entries(stats.value?.seats ?? {}))
const payments = computed(() => Object.entries(stats.value?.payments ?? {}))
</script>

<template>
  <div class="stack">
    <div class="spread">
      <div>
        <h1>{{ $t('admin.dashboardTitle') }}</h1>
        <p class="muted">{{ $t('admin.dashboardLead') }}</p>
      </div>
      <div v-if="edition" class="cluster">
        <span class="badge badge--gold">{{ $t(`editionStatus.${edition.status}`) }}</span>
        <span class="badge">{{ text(edition.title) }}</span>
      </div>
    </div>

    <GmNotice v-if="error" tone="danger">{{ error }}</GmNotice>
    <GmSpinner v-if="pending" />
    <GmEmpty v-else-if="!edition" :title="$t('admin.noEdition')" />

    <template v-else-if="stats">
      <section class="stack">
        <h2>{{ $t('admin.byStatus') }}</h2>
        <div class="grid grid--4">
          <div v-for="[status, count] in statuses" :key="status" class="stat">
            <span class="stat__value numeric">{{ count }}</span>
            <span class="stat__label">{{ $t(`status.${status}`) }}</span>
          </div>
        </div>
      </section>

      <section class="stack">
        <h2>{{ $t('admin.seats') }}</h2>
        <div class="grid grid--2">
          <article v-for="[category, roles] in seats" :key="category" class="card">
            <h3 class="card__title">{{ $t(`category.${category}`) }}</h3>
            <GmMeter
              v-for="(seat, role) in roles"
              :key="role"
              :label="$t(`role.${role}`)"
              :used="seat.used"
              :capacity="seat.capacity"
            />
          </article>
        </div>
      </section>

      <section v-if="payments.length" class="stack">
        <h2>{{ $t('admin.payments') }}</h2>
        <div class="grid grid--3">
          <div v-for="[status, row] in payments" :key="status" class="stat">
            <span class="stat__value numeric">{{ money(row.amount) }}</span>
            <span class="stat__label">{{ status }} · {{ row.count }}</span>
          </div>
        </div>
      </section>

      <section v-if="stats.topSchools?.length" class="stack">
        <h2>{{ $t('admin.topSchools') }}</h2>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ $t('results.school') }}</th>
                <th class="numeric">{{ $t('schools.players') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.topSchools" :key="row.schoolId">
                <td>
                  <NuxtLink v-if="row.slug" :to="localePath(`/ecoles/${row.slug}`)">
                    {{ text(row.name) }}
                  </NuxtLink>
                  <span v-else>—</span>
                </td>
                <td class="numeric">{{ row.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p class="muted numeric">
        {{ $t('editions.registrationWindow') }} :
        {{ date(edition.registrationOpensAt) }} → {{ date(edition.registrationClosesAt) }}
      </p>
    </template>
  </div>
</template>
