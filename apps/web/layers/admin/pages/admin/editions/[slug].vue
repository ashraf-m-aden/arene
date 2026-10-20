<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'admin' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const editions = useEditionsStore()
const { text, date, money, number } = useFormat()

const slug = computed(() => String(route.params.slug))
useNoIndex(t('admin.editionDetailTitle'))

const edition = ref<any>(null)
const stats = ref<any>(null)
const slots = ref<any[]>([])
const pending = ref(true)
const error = ref('')
const feedback = ref('')
const nextStatus = ref('')

const info = reactive({
  titleFr: '',
  titleAr: '',
  descriptionFr: '',
  descriptionAr: '',
  season: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
  fee: 0,
  gradeThreshold: 12,
  venueName: '',
  venueCity: ''
})

const quotas = reactive({
  lycee: { striker: 0, defender: 0 },
  universite: { striker: 0, defender: 0 }
})

const slotForm = reactive({
  label: '',
  startsAt: '',
  endsAt: '',
  ageCategory: 'lycee' as 'lycee' | 'universite',
  pitches: 2,
  striker: 50,
  defender: 50
})

/** Transitions autorisées depuis le statut courant, côté API comme côté écran. */
const TRANSITIONS: Record<string, string[]> = {
  draft: ['announced'],
  announced: ['registration_open', 'draft'],
  registration_open: ['registration_closed'],
  registration_closed: ['qualifiers', 'registration_open'],
  qualifiers: ['finals'],
  finals: ['completed'],
  completed: ['archived'],
  archived: []
}

const allowedTransitions = computed(() => TRANSITIONS[edition.value?.status ?? ''] ?? [])

/** Ordre du tunnel de candidatures, du dépôt du dossier au podium. */
const FUNNEL_ORDER = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
  'scheduled',
  'checked_in',
  'no_show',
  'disqualified',
  'eliminated',
  'qualified',
  'finalist'
]

const NEGATIVE_STATUSES = ['rejected', 'disqualified', 'no_show']
const POSITIVE_STATUSES = ['approved', 'checked_in', 'qualified', 'finalist']

function toneFor(status: string) {
  if (NEGATIVE_STATUSES.includes(status)) return 'danger'
  if (POSITIVE_STATUSES.includes(status)) return 'pitch'
  return 'gold'
}

const funnelItems = computed(() => {
  if (!stats.value?.byStatus) return []
  return FUNNEL_ORDER.filter((status) => stats.value.byStatus[status])
    .map((status) => ({ label: t(`status.${status}`), value: stats.value.byStatus[status], tone: toneFor(status) }))
})

const seatsEntries = computed(() => Object.entries(stats.value?.seats ?? {}))

const paymentItems = computed(() => {
  if (!stats.value?.payments) return []
  return Object.entries(stats.value.payments).map(([key, row]: [string, any]) => ({
    label: `${key} · ${row.count}`,
    value: row.amount,
    tone: key === 'paid' ? 'pitch' : key === 'exempt' ? 'gold' : 'warning'
  }))
})

const totalCandidatures = computed(() =>
  Object.values(stats.value?.byStatus ?? {}).reduce((sum: number, n: any) => sum + n, 0)
)

function fillForms() {
  if (!edition.value) return
  info.titleFr = edition.value.title?.fr || ''
  info.titleAr = edition.value.title?.ar || ''
  info.descriptionFr = edition.value.description?.fr || ''
  info.descriptionAr = edition.value.description?.ar || ''
  info.season = edition.value.season || ''
  info.registrationOpensAt = toLocalInput(edition.value.registrationOpensAt)
  info.registrationClosesAt = toLocalInput(edition.value.registrationClosesAt)
  info.fee = edition.value.fee ?? 0
  info.gradeThreshold = edition.value.rules?.gradeThreshold ?? 12
  info.venueName = edition.value.venue?.name || ''
  info.venueCity = edition.value.venue?.city || ''
  quotas.lycee.striker = edition.value.capacity?.lycee?.striker ?? 0
  quotas.lycee.defender = edition.value.capacity?.lycee?.defender ?? 0
  quotas.universite.striker = edition.value.capacity?.universite?.striker ?? 0
  quotas.universite.defender = edition.value.capacity?.universite?.defender ?? 0
}

function toLocalInput(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    edition.value = await editions.fetchBySlug(slug.value, true)
    fillForms()
    if (edition.value?._id) {
      stats.value = await editions.fetchStats(edition.value._id)
      slots.value = await editions.fetchSlots(edition.value._id).catch(() => [])
    }
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

onMounted(load)

async function saveInfo() {
  if (!edition.value?._id) return
  pending.value = true
  error.value = ''
  try {
    await editions.updateEdition(edition.value._id, {
      title: { fr: info.titleFr, ar: info.titleAr },
      description: { fr: info.descriptionFr, ar: info.descriptionAr },
      season: info.season || undefined,
      registrationOpensAt: info.registrationOpensAt,
      registrationClosesAt: info.registrationClosesAt,
      fee: info.fee,
      rules: { gradeThreshold: info.gradeThreshold },
      venue: { name: info.venueName, city: info.venueCity }
    })
    feedback.value = t('admin.editionSaved')
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function saveQuotas() {
  if (!edition.value?._id) return
  pending.value = true
  error.value = ''
  try {
    await editions.updateEdition(edition.value._id, { capacity: quotas })
    feedback.value = t('admin.quotasSaved')
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function changeStatus() {
  if (!edition.value?._id || !nextStatus.value) return
  const { $api } = useNuxtApp()
  pending.value = true
  error.value = ''
  try {
    await $api.post(`/editions/${edition.value._id}/transition`, { status: nextStatus.value })
    feedback.value = t('admin.statusChanged')
    nextStatus.value = ''
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function createSlot() {
  if (!edition.value?._id) return
  const { $api } = useNuxtApp()
  pending.value = true
  error.value = ''
  try {
    await $api.post('/slots', {
      editionId: edition.value._id,
      label: slotForm.label,
      startsAt: slotForm.startsAt,
      endsAt: slotForm.endsAt,
      ageCategory: slotForm.ageCategory,
      pitches: slotForm.pitches,
      capacity: { striker: slotForm.striker, defender: slotForm.defender },
      venue: edition.value.venue?.name
    })
    feedback.value = t('admin.slotCreated')
    slotForm.label = ''
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="stack">
    <div class="spread">
      <div>
        <NuxtLink :to="localePath('/admin/editions')" class="muted back-link">
          ← {{ $t('admin.editionsTitle') }}
        </NuxtLink>
        <h1>{{ edition ? text(edition.title) : '' }}</h1>
      </div>
      <div v-if="edition" class="cluster">
        <span class="badge badge--gold">{{ $t(`editionStatus.${edition.status}`) }}</span>
        <span class="badge numeric">{{ edition.slug }}</span>
      </div>
    </div>

    <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>
    <AreneSpinner v-if="pending && !edition" />
    <AreneEmpty v-else-if="!edition && !pending" :title="$t('admin.noEdition')" />

    <template v-if="edition">
      <!-- Statut -->
      <section class="card stack">
        <h2 class="card__title">{{ $t('admin.changeStatus') }}</h2>
        <div class="cluster">
          <select v-model="nextStatus" class="select" :disabled="!allowedTransitions.length">
            <option value="">—</option>
            <option v-for="status in allowedTransitions" :key="status" :value="status">
              {{ $t(`editionStatus.${status}`) }}
            </option>
          </select>
          <button class="btn btn--ink" :disabled="!nextStatus || pending" @click="changeStatus">
            {{ $t('common.save') }}
          </button>
        </div>
      </section>

      <!-- Description -->
      <section class="stack">
        <h2>{{ $t('admin.editionInfo') }}</h2>
        <form class="card stack" @submit.prevent="saveInfo">
          <div class="two">
            <AreneField :label="$t('editions.titleFr')" for="iTitleFr" required>
              <input id="iTitleFr" v-model="info.titleFr" class="input" required>
            </AreneField>
            <AreneField :label="$t('editions.titleAr')" for="iTitleAr">
              <input id="iTitleAr" v-model="info.titleAr" class="input" dir="rtl">
            </AreneField>
          </div>

          <div class="two">
            <AreneField :label="$t('editions.descriptionFr')" for="iDescFr">
              <textarea id="iDescFr" v-model="info.descriptionFr" class="textarea" rows="4" />
            </AreneField>
            <AreneField :label="$t('editions.descriptionAr')" for="iDescAr">
              <textarea id="iDescAr" v-model="info.descriptionAr" class="textarea" rows="4" dir="rtl" />
            </AreneField>
          </div>

          <div class="two">
            <AreneField :label="$t('admin.startsAt')" for="iOpens" required>
              <input id="iOpens" v-model="info.registrationOpensAt" class="input numeric" type="datetime-local" required>
            </AreneField>
            <AreneField :label="$t('admin.endsAt')" for="iCloses" required>
              <input id="iCloses" v-model="info.registrationClosesAt" class="input numeric" type="datetime-local" required>
            </AreneField>
          </div>

          <div class="two">
            <AreneField :label="$t('editions.season')" for="iSeason">
              <input id="iSeason" v-model="info.season" class="input">
            </AreneField>
            <AreneField :label="$t('editions.fee')" for="iFee" required>
              <input id="iFee" v-model.number="info.fee" class="input numeric" type="number" min="0">
            </AreneField>
          </div>

          <div class="two">
            <AreneField :label="$t('admin.venueName')" for="iVenueName" required>
              <input id="iVenueName" v-model="info.venueName" class="input" required>
            </AreneField>
            <AreneField :label="$t('admin.venueCity')" for="iVenueCity">
              <input id="iVenueCity" v-model="info.venueCity" class="input">
            </AreneField>
          </div>

          <AreneField :label="$t('admin.gradeThreshold')" for="iThreshold">
            <input id="iThreshold" v-model.number="info.gradeThreshold" class="input numeric" type="number" min="0" max="20" step="0.5">
          </AreneField>

          <button class="btn btn--primary" type="submit" :disabled="pending">
            {{ $t('common.save') }}
          </button>
        </form>
      </section>

      <!-- Quotas -->
      <section class="stack">
        <h2>{{ $t('editions.capacity') }}</h2>
        <div class="grid grid--2">
          <article class="card stack">
            <h3 class="card__title">{{ $t('category.lycee') }}</h3>
            <AreneMeter
              :label="$t('role.striker')"
              :used="stats?.seats?.lycee?.striker?.used ?? 0"
              :capacity="quotas.lycee.striker"
            />
            <AreneMeter
              :label="$t('role.defender')"
              :used="stats?.seats?.lycee?.defender?.used ?? 0"
              :capacity="quotas.lycee.defender"
            />
            <div class="two">
              <AreneField :label="$t('role.striker')" for="qLs">
                <input id="qLs" v-model.number="quotas.lycee.striker" class="input numeric" type="number" min="0">
              </AreneField>
              <AreneField :label="$t('role.defender')" for="qLd">
                <input id="qLd" v-model.number="quotas.lycee.defender" class="input numeric" type="number" min="0">
              </AreneField>
            </div>
          </article>

          <article class="card stack">
            <h3 class="card__title">{{ $t('category.universite') }}</h3>
            <AreneMeter
              :label="$t('role.striker')"
              :used="stats?.seats?.universite?.striker?.used ?? 0"
              :capacity="quotas.universite.striker"
            />
            <AreneMeter
              :label="$t('role.defender')"
              :used="stats?.seats?.universite?.defender?.used ?? 0"
              :capacity="quotas.universite.defender"
            />
            <div class="two">
              <AreneField :label="$t('role.striker')" for="qUs">
                <input id="qUs" v-model.number="quotas.universite.striker" class="input numeric" type="number" min="0">
              </AreneField>
              <AreneField :label="$t('role.defender')" for="qUd">
                <input id="qUd" v-model.number="quotas.universite.defender" class="input numeric" type="number" min="0">
              </AreneField>
            </div>
          </article>
        </div>
        <div>
          <button class="btn btn--ink" :disabled="pending" @click="saveQuotas">
            {{ $t('admin.saveQuotas') }}
          </button>
        </div>
      </section>

      <!-- Candidatures -->
      <section v-if="stats" class="stack">
        <div class="spread">
          <h2>{{ $t('admin.candidatures') }}</h2>
          <NuxtLink
            :to="localePath(`/staff/dossiers?editionId=${edition._id}`)"
            class="btn btn--ghost btn--sm"
          >
            {{ $t('admin.viewCandidatures') }}
          </NuxtLink>
        </div>
        <p class="muted numeric">{{ $t('admin.totalCandidatures', { count: number(totalCandidatures) }) }}</p>
        <div class="card">
          <AreneBarChart :items="funnelItems" />
        </div>
      </section>

      <!-- Paiements -->
      <section v-if="paymentItems.length" class="stack">
        <h2>{{ $t('admin.payments') }}</h2>
        <div class="card">
          <AreneBarChart :items="paymentItems" :format-value="money" />
        </div>
      </section>

      <!-- Écoles les plus représentées -->
      <section v-if="stats?.topSchools?.length" class="stack">
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

      <!-- Créneaux -->
      <section class="stack">
        <h2>{{ $t('admin.slots') }}</h2>

        <div v-if="slots.length" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ $t('admin.slotLabel') }}</th>
                <th>{{ $t('admin.startsAt') }}</th>
                <th>{{ $t('admin.ageCategory') }}</th>
                <th class="numeric">{{ $t('admin.pitches') }}</th>
                <th class="numeric">{{ $t('editions.capacity') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="slot in slots" :key="slot._id">
                <td><strong>{{ slot.label }}</strong></td>
                <td class="numeric">{{ date(slot.startsAt, true) }}</td>
                <td>{{ $t(`category.${slot.ageCategory}`) }}</td>
                <td class="numeric">{{ slot.pitches }}</td>
                <td class="numeric">{{ slot.capacity?.striker }} / {{ slot.capacity?.defender }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <form class="card card--flat slot-form" @submit.prevent="createSlot">
          <AreneField :label="$t('admin.slotLabel')" for="label" required>
            <input id="label" v-model="slotForm.label" class="input" required>
          </AreneField>
          <AreneField :label="$t('admin.startsAt')" for="startsAt" required>
            <input id="startsAt" v-model="slotForm.startsAt" class="input numeric" type="datetime-local" required>
          </AreneField>
          <AreneField :label="$t('admin.endsAt')" for="endsAt" required>
            <input id="endsAt" v-model="slotForm.endsAt" class="input numeric" type="datetime-local" required>
          </AreneField>
          <AreneField :label="$t('admin.ageCategory')" for="ageCategory">
            <select id="ageCategory" v-model="slotForm.ageCategory" class="select">
              <option value="lycee">{{ $t('category.lycee') }}</option>
              <option value="universite">{{ $t('category.universite') }}</option>
            </select>
          </AreneField>
          <AreneField :label="$t('admin.capacityStriker')" for="striker">
            <input id="striker" v-model.number="slotForm.striker" class="input numeric" type="number" min="1">
          </AreneField>
          <AreneField :label="$t('admin.capacityDefender')" for="defender">
            <input id="defender" v-model.number="slotForm.defender" class="input numeric" type="number" min="1">
          </AreneField>
          <AreneField :label="$t('admin.pitches')" for="pitches">
            <input id="pitches" v-model.number="slotForm.pitches" class="input numeric" type="number" min="1">
          </AreneField>
          <button class="btn btn--primary" type="submit" :disabled="pending">
            {{ $t('admin.newSlot') }}
          </button>
        </form>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.back-link {
  display: inline-block;
  margin-block-end: var(--space-2);
  font-size: var(--text-sm);
  text-decoration: none;
}

.two {
  display: grid;
  gap: var(--space-3);

  @include from(sm) {
    grid-template-columns: 1fr 1fr;
  }
}

.slot-form {
  display: grid;
  gap: var(--space-3);
  align-items: end;

  @include from(md) {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
