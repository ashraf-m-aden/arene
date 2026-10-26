<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'staff' })

const { t } = useI18n()
const editions = useEditionsStore()
const store = useCheckinStore()
const { date, money, text } = useFormat()

useNoIndex(t('checkin.title'))

const slots = ref<any[]>([])
const slotId = ref('')
const search = ref('')
const selected = ref<any>(null)
const feedback = ref('')
const scanning = ref(false)
const scanError = ref('')
const videoEl = ref<HTMLVideoElement | null>(null)
let stream: MediaStream | null = null
let scanTimer: ReturnType<typeof setInterval> | null = null

const form = reactive({
  paymentStatus: 'paid' as 'paid' | 'exempt',
  exemptionReason: '',
  bulletinChecked: false,
  contractSigned: false
})

const edition = computed(() => editions.current)
const scanSupported = computed(() => import.meta.client && 'BarcodeDetector' in window)

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return store.roster
  return store.roster.filter((player) => {
    const name = String(player.player?.name ?? '').toLowerCase()
    return name.includes(needle) || String(player.bibNumber ?? '').includes(needle)
  })
})

onMounted(async () => {
  store.watchConnection()
  const current = await editions.fetchCurrent()
  // Rendez-vous administratifs seuls : on ne pointe pas sur une session de jeu,
  // qui se tient une semaine plus tard et ne réunit que des inscrits.
  if (current?._id) {
    slots.value = await editions.fetchSlots(current._id, 'checkin').catch(() => [])
  }
  await store.refreshQueue()
})

watch(slotId, async (value) => {
  if (!value) return
  await store.loadRoster(value)
})

function select(player: any) {
  selected.value = player
  form.paymentStatus = 'paid'
  form.exemptionReason = ''
  form.bulletinChecked = false
  form.contractSigned = false
  feedback.value = ''
}

async function confirm() {
  if (!selected.value) return
  const result = await store.checkIn(selected.value, {
    payment: {
      status: form.paymentStatus,
      amount: form.paymentStatus === 'paid' ? edition.value?.fee ?? 0 : 0,
      ...(form.paymentStatus === 'exempt' ? { exemptionReason: form.exemptionReason } : {})
    },
    bulletinChecked: form.bulletinChecked,
    contractSigned: form.contractSigned
  })

  if (!result.ok) return
  feedback.value = result.offline
    ? t('checkin.queued')
    : t('checkin.confirmed', { bib: result.bibNumber })
  selected.value = null
}

/** Scan du QR par la caméra du téléphone, quand le navigateur sait le faire. */
async function startScan() {
  scanError.value = ''
  if (!scanSupported.value) {
    scanError.value = t('checkin.scanUnsupported')
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    })
    scanning.value = true
    await nextTick()
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
    }

    // @ts-expect-error BarcodeDetector n'est pas encore dans les types DOM
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    scanTimer = setInterval(async () => {
      if (!videoEl.value) return
      try {
        const codes = await detector.detect(videoEl.value)
        if (!codes.length) return
        const token = codes[0].rawValue
        const player = store.findByToken(token)
        if (player) {
          select(player)
          stopScan()
        } else {
          scanError.value = t('checkin.notFound')
        }
      } catch {
        // image non exploitable : on retente au tic suivant
      }
    }, 400)
  } catch {
    scanError.value = t('checkin.cameraError')
    scanning.value = false
  }
}

function stopScan() {
  scanning.value = false
  if (scanTimer) clearInterval(scanTimer)
  scanTimer = null
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
}

onBeforeUnmount(stopScan)

async function closeSlot() {
  if (!window.confirm(t('checkin.closeConfirm'))) return
  const result = await store.closeSlot()
  feedback.value = t('checkin.closed', { count: result.noShows })
}
</script>

<template>
  <div class="stack">
    <div class="spread">
      <div>
        <h1>{{ $t('checkin.title') }}</h1>
        <p class="muted">{{ $t('checkin.lead') }}</p>
      </div>
      <div class="cluster">
        <span class="badge" :class="store.online ? 'badge--pitch' : 'badge--danger'">
          {{ store.online ? $t('common.online') : $t('common.offline') }}
        </span>
        <span v-if="store.pendingCount" class="badge badge--warning numeric">
          {{ $t('checkin.pendingOps', { count: store.pendingCount }) }}
        </span>
        <button
          v-if="store.pendingCount"
          class="btn btn--ink btn--sm"
          :disabled="store.pending"
          @click="store.sync()"
        >
          {{ $t('checkin.sync') }}
        </button>
      </div>
    </div>

    <div class="card card--flat controls">
      <AreneField :label="$t('checkin.slot')" for="slot">
        <select id="slot" v-model="slotId" class="select">
          <option value="">—</option>
          <option v-for="slot in slots" :key="slot._id" :value="slot._id">
            {{ slot.label }} — {{ date(slot.startsAt) }}
          </option>
        </select>
      </AreneField>

      <button class="btn btn--ghost" :disabled="!slotId" @click="store.loadRoster(slotId)">
        {{ $t('checkin.loadRoster') }}
      </button>

      <button
        class="btn btn--primary"
        :disabled="!store.roster.length"
        @click="scanning ? stopScan() : startScan()"
      >
        {{ scanning ? $t('checkin.stopScan') : $t('checkin.scan') }}
      </button>
    </div>

    <div v-if="store.roster.length" class="cluster stats">
      <div class="stat">
        <span class="stat__value numeric">{{ store.checkedInCount }}</span>
        <span class="stat__label">{{ $t('checkin.status.checked_in') }}</span>
      </div>
      <div class="stat">
        <span class="stat__value numeric">{{ store.expectedCount }}</span>
        <span class="stat__label">{{ $t('checkin.rosterLoaded', { count: store.expectedCount }) }}</span>
      </div>
      <button class="btn btn--ghost btn--sm" @click="closeSlot">{{ $t('checkin.closeSlot') }}</button>
    </div>

    <AreneNotice v-if="scanError" tone="danger">{{ scanError }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>
    <AreneNotice v-if="store.error" tone="danger">{{ store.error }}</AreneNotice>

    <div v-if="scanning" class="scanner">
      <video ref="videoEl" muted playsinline />
      <p class="muted">{{ $t('checkin.scan') }}</p>
    </div>

    <AreneField v-if="store.roster.length" :label="$t('checkin.manual')" for="search">
      <input id="search" v-model="search" class="input" type="search">
    </AreneField>

    <div v-if="filtered.length" class="roster">
      <button
        v-for="player in filtered"
        :key="player._id"
        class="roster__row"
        :class="{ 'roster__row--done': player.status === 'checked_in' }"
        @click="select(player)"
      >
        <span class="roster__name">
          <strong>{{ player.player?.name }}</strong>
          <span class="muted">
            {{ $t(`role.${player.role}`) }}
            <template v-if="player.schoolId"> · {{ text(player.schoolId.name) }}</template>
          </span>
        </span>
        <span class="cluster">
          <span v-if="player.randomCheck" class="badge badge--warning">★</span>
          <span v-if="player.bibNumber" class="badge numeric">#{{ player.bibNumber }}</span>
          <span v-if="player.pendingSync" class="badge badge--warning">⇅</span>
          <span class="badge" :class="player.status === 'checked_in' ? 'badge--pitch' : ''">
            {{ $t(`checkin.status.${player.status}`) }}
          </span>
        </span>
      </button>
    </div>

    <AreneEmpty v-else-if="slotId && !store.pending" :title="$t('results.staff.noMatches')" />
    <AreneEmpty v-else-if="!slotId" :title="$t('results.staff.selectSlot')" />

    <!-- Fiche du joueur scanné -->
    <aside v-if="selected" class="sheet card">
      <div class="spread">
        <h2 class="card__title">
          {{ selected.player?.name }}
        </h2>
        <button class="btn btn--quiet btn--sm" @click="selected = null">{{ $t('common.close') }}</button>
      </div>

      <div class="cluster">
        <span class="badge">{{ $t(`role.${selected.role}`) }}</span>
        <span class="badge">{{ $t(`category.${selected.ageCategory}`) }}</span>
        <span v-if="selected.schoolId" class="badge">{{ text(selected.schoolId.name) }}</span>
      </div>

      <AreneNotice v-if="selected.status === 'checked_in'" tone="info">
        {{ $t('checkin.alreadyCheckedIn') }}
      </AreneNotice>
      <AreneNotice v-if="selected.randomCheck" tone="danger">{{ $t('checkin.randomCheck') }}</AreneNotice>
      <AreneNotice v-if="edition?.rules?.requiresOriginalBulletin" tone="info">
        {{ $t('checkin.bulletinRequired') }}
      </AreneNotice>

      <label class="check" :class="{ 'check--checked': form.bulletinChecked }">
        <input v-model="form.bulletinChecked" type="checkbox">
        <span>{{ $t('checkin.bulletinCheck') }}</span>
      </label>

      <label class="check" :class="{ 'check--checked': form.contractSigned }">
        <input v-model="form.contractSigned" type="checkbox">
        <span>{{ $t('checkin.contractCheck') }}</span>
      </label>

      <AreneField :label="$t('checkin.payment')">
        <div class="choice-grid">
          <button
            type="button"
            class="choice"
            :class="{ 'choice--active': form.paymentStatus === 'paid' }"
            @click="form.paymentStatus = 'paid'"
          >
            <strong>{{ $t('checkin.paid') }}</strong>
            <span class="numeric">{{ money(edition?.fee) }}</span>
          </button>
          <button
            type="button"
            class="choice"
            :class="{ 'choice--active': form.paymentStatus === 'exempt' }"
            @click="form.paymentStatus = 'exempt'"
          >
            <strong>{{ $t('checkin.exempt') }}</strong>
            <span>{{ $t('checkin.exemptionReason') }}</span>
          </button>
        </div>
      </AreneField>

      <AreneField
        v-if="form.paymentStatus === 'exempt'"
        :label="$t('checkin.exemptionReason')"
        for="exemption"
        required
      >
        <input id="exemption" v-model="form.exemptionReason" class="input" required>
      </AreneField>

      <AreneNotice v-if="!form.contractSigned" tone="info">
        {{ $t('checkin.contractRequired') }}
      </AreneNotice>

      <button
        class="btn btn--primary btn--block btn--lg"
        :disabled="selected.status === 'checked_in' || !form.contractSigned || store.pending"
        @click="confirm"
      >
        {{ $t('checkin.confirm') }}
      </button>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.controls {
  display: grid;
  gap: var(--space-3);
  align-items: end;

  @include from(md) {
    grid-template-columns: 2fr auto auto;
  }
}

.stats {
  align-items: stretch;
}

.scanner {
  display: grid;
  gap: var(--space-2);
  justify-items: center;

  video {
    inline-size: 100%;
    max-inline-size: 28rem;
    border-radius: var(--radius-lg);
    background: #000;
  }
}

.roster {
  display: grid;
  gap: var(--space-2);
}

.roster__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  text-align: start;
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);

  &:hover {
    border-color: var(--color-gold);
  }
}

.roster__row--done {
  background: rgb(31 157 107 / 7%);
}

.roster__name {
  display: grid;
  gap: 2px;
  font-size: var(--text-sm);
}

.sheet {
  position: sticky;
  inset-block-end: var(--space-4);
  border-color: var(--color-gold);
  box-shadow: var(--shadow-lg);
}
</style>
