<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'staff' })

const { t } = useI18n()
const { $api } = useNuxtApp()
const auth = useAuthStore()
const editions = useEditionsStore()
const { date } = useFormat()

useNoIndex(t('results.staff.title'))

/**
 * Trois phases, deux façons de lister les rencontres.
 *
 * La qualification se joue par session de jeu — chaque session a ses joueurs,
 * ses terrains et ses rencontres, générées à partir d'elle. Le barrage et la
 * finale n'ont pas de session : leurs rencontres sont composées à l'échelle de
 * l'édition, à partir du classement, et se jouent sur un terrain unique. L'écran
 * les lit donc par phase.
 */
type Phase = 'qualification' | 'barrage' | 'finale'

const PHASES: Phase[] = ['qualification', 'barrage', 'finale']

const sessions = ref<any[]>([])
const phase = ref<Phase>('qualification')
const slotId = ref('')
const matches = ref<any[]>([])
const selected = ref<any>(null)
const attempts = ref<Array<'goal' | 'stop'>>(['stop', 'stop', 'stop', 'stop', 'stop'])
const note = ref('')
const pending = ref(false)
const error = ref('')
const feedback = ref('')

const edition = computed(() => editions.current)
const bySession = computed(() => phase.value === 'qualification')
const ready = computed(() => (bySession.value ? Boolean(slotId.value) : Boolean(edition.value?._id)))

onMounted(async () => {
  const current = await editions.fetchCurrent()
  if (!current?._id) return
  // Sessions de jeu seules : les rendez-vous administratifs se sont tenus une
  // semaine plus tôt et ne portent aucune rencontre.
  sessions.value = await editions.fetchSlots(current._id, 'competition').catch(() => [])
})

watch([slotId, phase], async () => {
  selected.value = null
  matches.value = []
  feedback.value = ''
  if (ready.value) await loadMatches()
})

async function loadMatches() {
  pending.value = true
  error.value = ''
  try {
    const { data } = bySession.value
      ? await $api.get<{ data: any[] }>(`/slots/${slotId.value}/matches`)
      : await $api.get<{ data: any[] }>(`/editions/${edition.value._id}/matches`, {
          params: { phase: phase.value }
        })
    matches.value = data
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function generate() {
  pending.value = true
  error.value = ''
  try {
    const { data } = await $api.post<{ data: any }>(`/slots/${slotId.value}/matches/generate`, {
      phase: 'qualification',
      opponents: 3
    })
    feedback.value = t('results.staff.generated', { count: data.generated })
    await loadMatches()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

/**
 * Composition du barrage : les meilleurs de chaque rôle sortis de la
 * qualification se retrouvent dans un tableau fermé. C'est ce tour, et non la
 * qualification, qui désigne ensuite les finalistes.
 */
async function composeBarrage() {
  if (!edition.value?._id) return
  pending.value = true
  error.value = ''
  try {
    const { data } = await $api.post<{ data: any }>(
      `/editions/${edition.value._id}/barrage/select`,
      { dryRun: false }
    )
    const count = (data.selection ?? []).reduce((sum: number, row: any) => sum + (row.matches ?? 0), 0)
    feedback.value = t('results.staff.barrageComposed', { count })
    phase.value = 'barrage'
    await loadMatches()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

function select(match: any) {
  selected.value = match
  attempts.value = match.attempts?.length === 5 ? [...match.attempts] : ['stop', 'stop', 'stop', 'stop', 'stop']
  note.value = ''
}

const strikerScore = computed(() => attempts.value.filter((a) => a === 'goal').length)

async function save() {
  if (!selected.value) return
  pending.value = true
  error.value = ''
  try {
    await $api.put(`/matches/${selected.value._id}/result`, {
      attempts: attempts.value,
      ...(note.value ? { note: note.value } : {})
    })
    feedback.value = t('results.staff.saved')
    selected.value = null
    await loadMatches()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function selectFinalists() {
  if (!edition.value?._id) return
  pending.value = true
  error.value = ''
  try {
    await $api.post(`/editions/${edition.value._id}/finals/select`, { dryRun: false })
    feedback.value = t('results.staff.finalistsSelected')
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

const playerName = (registration: any) =>
  registration
    ? String(registration.player?.name ?? '').trim()
    : '—'
</script>

<template>
  <div class="stack">
    <div class="spread">
      <div>
        <h1>{{ $t('results.staff.title') }}</h1>
        <p class="muted">{{ $t('results.staff.lead') }}</p>
      </div>
      <div v-if="auth.isAdmin" class="actions">
        <button class="btn btn--ghost btn--sm" :disabled="pending" @click="composeBarrage">
          {{ $t('results.staff.composeBarrage') }}
        </button>
        <button class="btn btn--ghost btn--sm" :disabled="pending" @click="selectFinalists">
          {{ $t('results.staff.selectFinalists') }}
        </button>
      </div>
    </div>

    <div class="card card--flat controls">
      <AreneField :label="$t('results.staff.phase')" for="phase">
        <select id="phase" v-model="phase" class="select">
          <option v-for="value in PHASES" :key="value" :value="value">
            {{ $t(`results.phase.${value}`) }}
          </option>
        </select>
      </AreneField>

      <!-- La qualification se joue par session ; barrage et finale sont à l'échelle de l'édition. -->
      <AreneField v-if="bySession" :label="$t('results.staff.session')" for="slot">
        <select id="slot" v-model="slotId" class="select">
          <option value="">—</option>
          <option v-for="slot in sessions" :key="slot._id" :value="slot._id">
            {{ slot.label }} — {{ date(slot.startsAt) }}
          </option>
        </select>
      </AreneField>

      <button v-if="bySession" class="btn btn--ink" :disabled="!slotId || pending" @click="generate">
        {{ $t('results.staff.generate') }}
      </button>
    </div>

    <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>
    <AreneSpinner v-if="pending && !matches.length" />

    <AreneEmpty v-if="bySession && !sessions.length" :title="$t('results.staff.noSessions')" />
    <AreneEmpty v-else-if="bySession && !slotId" :title="$t('results.staff.selectSession')" />

    <div v-else-if="matches.length" class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th class="numeric">{{ $t('results.staff.order') }}</th>
            <th class="numeric">{{ $t('results.staff.pitch') }}</th>
            <!-- Barrage et finale mélangent les catégories : il faut la colonne. -->
            <th v-if="!bySession">{{ $t('results.staff.category') }}</th>
            <th>{{ $t('results.staff.striker') }}</th>
            <th>{{ $t('results.staff.defender') }}</th>
            <th class="numeric">{{ $t('results.staff.score') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="match in matches" :key="match._id">
            <td class="numeric">{{ match.order }}</td>
            <td class="numeric">{{ match.pitch }}</td>
            <td v-if="!bySession">
              {{ match.ageCategory ? $t(`category.${match.ageCategory}`) : '—' }}
            </td>
            <td>
              {{ playerName(match.strikerRegId) }}
              <span v-if="match.strikerRegId?.bibNumber" class="badge numeric">
                #{{ match.strikerRegId.bibNumber }}
              </span>
            </td>
            <td>
              {{ playerName(match.defenderRegId) }}
              <span v-if="match.defenderRegId?.bibNumber" class="badge numeric">
                #{{ match.defenderRegId.bibNumber }}
              </span>
            </td>
            <td class="numeric">
              <strong v-if="match.isRecorded">{{ match.strikerScore }} — {{ match.defenderScore }}</strong>
              <span v-else class="badge badge--warning">{{ $t('results.staff.pending') }}</span>
            </td>
            <td>
              <button class="btn btn--quiet btn--sm" @click="select(match)">
                {{ match.isRecorded ? $t('results.staff.correction') : $t('results.staff.save') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AreneEmpty v-else-if="!pending" :title="$t('results.staff.noMatches')" />

    <!-- Saisie des cinq tentatives, pensée pour le pouce -->
    <aside v-if="selected" class="scoring card">
      <div class="spread">
        <h2 class="card__title">
          {{ playerName(selected.strikerRegId) }} — {{ playerName(selected.defenderRegId) }}
        </h2>
        <button class="btn btn--quiet btn--sm" @click="selected = null">{{ $t('common.close') }}</button>
      </div>

      <ol class="attempts">
        <li v-for="(attempt, index) in attempts" :key="index">
          <span class="attempts__label numeric">{{ index + 1 }}</span>
          <div class="attempts__toggle">
            <button
              type="button"
              class="btn btn--sm"
              :class="attempt === 'goal' ? 'btn--pitch' : 'btn--ghost'"
              @click="attempts[index] = 'goal'"
            >
              {{ $t('results.staff.goal') }}
            </button>
            <button
              type="button"
              class="btn btn--sm"
              :class="attempt === 'stop' ? 'btn--ink' : 'btn--ghost'"
              @click="attempts[index] = 'stop'"
            >
              {{ $t('results.staff.stop') }}
            </button>
          </div>
        </li>
      </ol>

      <p class="score numeric">
        {{ strikerScore }} — {{ 5 - strikerScore }}
      </p>

      <AreneField
        v-if="selected.isRecorded"
        :label="$t('results.staff.correctionReason')"
        for="note"
        required
      >
        <input id="note" v-model="note" class="input" required>
      </AreneField>

      <button class="btn btn--primary btn--block" :disabled="pending" @click="save">
        {{ $t('results.staff.save') }}
      </button>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.controls {
  display: grid;
  gap: var(--space-3);
  align-items: end;

  @include from(sm) {
    grid-template-columns: auto 1fr auto;
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.scoring {
  position: sticky;
  inset-block-end: var(--space-4);
  border-color: var(--color-gold);
  box-shadow: var(--shadow-lg);
}

.attempts {
  display: grid;
  gap: var(--space-2);
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
}

.attempts__label {
  inline-size: 1.5rem;
  font-weight: 700;
  color: var(--color-muted);
}

.attempts__toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  flex: 1;
}

.score {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  text-align: center;
}
</style>
