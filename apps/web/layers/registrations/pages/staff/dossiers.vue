<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'staff' })

const { t } = useI18n()
const { $api } = useNuxtApp()
const auth = useAuthStore()
const config = useRuntimeConfig()
const route = useRoute()
const editions = useEditionsStore()
const { text, date, statusLabel, statusTone, roleLabel, categoryLabel } = useFormat()

/** Venu depuis une fiche d'édition : on reste sur ce dossier, sans retomber sur l'édition courante. */
const editionIdParam = computed(() => (route.query.editionId as string | undefined) || '')

useNoIndex(t('registrations.staff.queueTitle'))

const filters = reactive({
  status: 'submitted',
  role: '',
  ageCategory: '',
  q: ''
})

const items = ref<any[]>([])
const meta = ref<any>(null)
const pending = ref(false)
const error = ref('')
const feedback = ref('')
const selected = ref<any>(null)
const decision = reactive({ decision: 'approve', reason: '', randomCheck: false })

async function load() {
  pending.value = true
  error.value = ''
  try {
    const editionId = editionIdParam.value || (await editions.fetchCurrent())?._id
    const query = new URLSearchParams()
    if (editionId) query.set('editionId', editionId)
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, String(value))
    const response = await $api.get<{ data: any[]; meta: any }>(`/registrations?${query}`)
    items.value = response.data
    meta.value = response.meta
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

onMounted(load)
watch(() => [filters.status, filters.role, filters.ageCategory], load)

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => filters.q,
  () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(load, 350)
  }
)

/** Les pièces sont servies par un lien signé de courte durée, jamais en direct. */
async function openPiece(fileId?: string | null) {
  if (!fileId) return
  try {
    const { data } = await $api.get<{ data: any }>(`/files/${fileId}/url`)
    const url = data.url.startsWith('http')
      ? data.url
      : `${String(config.public.apiBase).replace(/\/api\/v1$/, '')}${data.url}`
    window.open(url, '_blank', 'noopener')
  } catch (err: any) {
    error.value = err.message
  }
}

function select(file: any) {
  selected.value = file
  decision.decision = 'approve'
  decision.reason = ''
  decision.randomCheck = false
}

async function submitDecision() {
  if (!selected.value) return
  if (decision.decision !== 'approve' && decision.reason.trim().length < 5) {
    error.value = t('registrations.staff.reasonRequired')
    return
  }
  pending.value = true
  error.value = ''
  try {
    await $api.post(`/registrations/${selected.value._id}/review`, { ...decision })
    feedback.value = t('registrations.staff.decisionSaved')
    selected.value = null
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function exportCsv() {
  const editionId = editionIdParam.value || (await editions.fetchCurrent())?._id
  if (!editionId) return
  const response = await fetch(
    `${config.public.apiBase}/registrations/export?editionId=${editionId}`,
    { headers: { Authorization: `Bearer ${auth.accessToken}` }, credentials: 'include' }
  )
  if (!response.ok) return
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = 'inscriptions.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

const statuses = [
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
  'scheduled',
  'checked_in'
]
</script>

<template>
  <div class="stack">
    <div class="spread">
      <div>
        <h1>{{ $t('registrations.staff.queueTitle') }}</h1>
        <p class="muted">{{ $t('registrations.staff.queueLead') }}</p>
      </div>
      <button v-if="auth.isAdmin" class="btn btn--ghost btn--sm" @click="exportCsv">
        {{ $t('registrations.staff.export') }}
      </button>
    </div>

    <div class="filters card card--flat">
      <AreneField :label="$t('registrations.staff.filterStatus')" for="status">
        <select id="status" v-model="filters.status" class="select">
          <option value="">{{ $t('common.all') }}</option>
          <option v-for="status in statuses" :key="status" :value="status">
            {{ $t(`status.${status}`) }}
          </option>
        </select>
      </AreneField>

      <AreneField :label="$t('registrations.staff.filterRole')" for="role">
        <select id="role" v-model="filters.role" class="select">
          <option value="">{{ $t('common.all') }}</option>
          <option value="striker">{{ $t('role.striker') }}</option>
          <option value="defender">{{ $t('role.defender') }}</option>
        </select>
      </AreneField>

      <AreneField :label="$t('registrations.staff.filterCategory')" for="category">
        <select id="category" v-model="filters.ageCategory" class="select">
          <option value="">{{ $t('common.all') }}</option>
          <option value="lycee">{{ $t('category.lycee') }}</option>
          <option value="universite">{{ $t('category.universite') }}</option>
        </select>
      </AreneField>

      <AreneField :label="$t('registrations.staff.search')" for="q">
        <input id="q" v-model="filters.q" class="input" type="search">
      </AreneField>
    </div>

    <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>
    <AreneSpinner v-if="pending && !items.length" />

    <p v-if="meta" class="muted numeric">{{ meta.total }}</p>

    <div v-if="items.length" class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('registrations.player.name') }}</th>
            <th>{{ $t('registrations.player.school') }}</th>
            <th>{{ $t('registrations.staff.filterRole') }}</th>
            <th class="numeric">{{ $t('registrations.staff.declaredAverage') }}</th>
            <th>{{ $t('registrations.staff.filterStatus') }}</th>
            <th>{{ $t('registrations.account.slot') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in items" :key="file._id">
            <td>
              <strong>{{ file.player?.name }}</strong>
              <span v-if="file.flags?.length" class="badge badge--warning">{{ file.flags.length }}</span>
            </td>
            <td>{{ file.schoolId ? text(file.schoolId.name) : '—' }}</td>
            <td>
              {{ roleLabel(file.role) }}
              <span class="muted">· {{ categoryLabel(file.ageCategory) }}</span>
            </td>
            <td class="numeric">{{ file.grades?.average ?? '—' }}</td>
            <td><span class="badge" :class="statusTone(file.status)">{{ statusLabel(file.status) }}</span></td>
            <td>{{ file.slotId ? file.slotId.label : '—' }}</td>
            <td>
              <div class="cluster">
                <button
                  class="btn btn--quiet btn--sm"
                  :disabled="!file.grades?.bulletinFileId"
                  @click="openPiece(file.grades?.bulletinFileId)"
                >
                  {{ $t('registrations.staff.openBulletin') }}
                </button>
                <button
                  class="btn btn--quiet btn--sm"
                  :disabled="!file.player?.photoFileId"
                  @click="openPiece(file.player?.photoFileId)"
                >
                  {{ $t('registrations.staff.openPhoto') }}
                </button>
                <button
                  v-if="['submitted', 'under_review'].includes(file.status)"
                  class="btn btn--ink btn--sm"
                  @click="select(file)"
                >
                  {{ $t('common.continue') }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AreneEmpty v-else-if="!pending" :title="$t('registrations.staff.empty')" />

    <!-- Panneau de décision -->
    <aside v-if="selected" class="decision card">
      <div class="spread">
        <h2 class="card__title">
          {{ selected.player?.name }}
        </h2>
        <button class="btn btn--quiet btn--sm" @click="selected = null">
          {{ $t('common.close') }}
        </button>
      </div>

      <dl class="decision__facts">
        <div>
          <dt>{{ $t('registrations.staff.declaredAverage') }}</dt>
          <dd class="numeric">{{ selected.grades?.average }}/20</dd>
        </div>
        <div>
          <dt>{{ $t('registrations.player.birthDate') }}</dt>
          <dd class="numeric">{{ date(selected.player?.birthDate) }}</dd>
        </div>
        <div>
          <dt>{{ $t('registrations.player.school') }}</dt>
          <dd>{{ selected.schoolId ? text(selected.schoolId.name) : '—' }}</dd>
        </div>
      </dl>

      <ul v-if="selected.flags?.length" class="cluster">
        <li v-for="flag in selected.flags" :key="flag.code" class="badge badge--warning">
          {{ flag.code }}
        </li>
      </ul>

      <AreneField :label="$t('registrations.staff.filterStatus')" for="decision">
        <div class="choice-grid">
          <button
            v-for="option in ['approve', 'request_changes', 'reject']"
            :key="option"
            type="button"
            class="choice"
            :class="{ 'choice--active': decision.decision === option }"
            @click="decision.decision = option"
          >
            <strong>
              {{
                option === 'approve'
                  ? $t('registrations.staff.approve')
                  : option === 'reject'
                    ? $t('registrations.staff.reject')
                    : $t('registrations.staff.requestChanges')
              }}
            </strong>
          </button>
        </div>
      </AreneField>

      <AreneField
        v-if="decision.decision !== 'approve'"
        :label="$t('registrations.staff.reason')"
        for="reason"
        required
      >
        <textarea id="reason" v-model="decision.reason" class="textarea" required />
      </AreneField>

      <label class="check" :class="{ 'check--checked': decision.randomCheck }">
        <input v-model="decision.randomCheck" type="checkbox">
        <span>{{ $t('registrations.staff.randomCheck') }}</span>
      </label>

      <div class="cluster">
        <button
          class="btn btn--quiet btn--sm"
          :disabled="!selected.grades?.bulletinFileId"
          @click="openPiece(selected.grades?.bulletinFileId)"
        >
          {{ $t('registrations.staff.openBulletin') }}
        </button>
        <button
          class="btn btn--quiet btn--sm"
          :disabled="!selected.player?.photoFileId"
          @click="openPiece(selected.player?.photoFileId)"
        >
          {{ $t('registrations.staff.openPhoto') }}
        </button>
        <button class="btn btn--primary" :disabled="pending" @click="submitDecision">
          {{ $t('common.save') }}
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.filters {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
}

.decision {
  position: sticky;
  inset-block-end: var(--space-4);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-gold);
}

.decision__facts {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));

  dt {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-muted);
  }

  dd {
    margin: 0;
    font-weight: 600;
  }
}
</style>
