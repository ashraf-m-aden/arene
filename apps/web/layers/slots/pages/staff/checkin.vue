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
  identityChecked: false,
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
    return (
      name.includes(needle) ||
      String(player.bibNumber ?? '').includes(needle) ||
      fileNumber(player).toLowerCase().includes(needle)
    )
  })
})

/**
 * Numéro de dossier : les six derniers caractères de l'identifiant, comme sur
 * le badge. Le dossard, lui, n'existe qu'une fois l'inscription validée.
 */
function fileNumber(player: any) {
  return String(player?._id ?? '').slice(-6).toUpperCase()
}

/** Repli quand le dossier n'a pas de portrait : les initiales du nom. */
function initials(name?: string) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

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
  form.identityChecked = false
  form.bulletinChecked = false
  form.contractSigned = false
  feedback.value = ''
  scanError.value = ''
}

async function confirm() {
  if (!selected.value) return
  const result = await store.checkIn(selected.value, {
    payment: {
      status: form.paymentStatus,
      amount: form.paymentStatus === 'paid' ? edition.value?.fee ?? 0 : 0,
      ...(form.paymentStatus === 'exempt' ? { exemptionReason: form.exemptionReason } : {})
    },
    identityChecked: form.identityChecked,
    bulletinChecked: form.bulletinChecked,
    contractSigned: form.contractSigned
  })

  if (!result.ok) return
  feedback.value = result.offline
    ? t('checkin.queued')
    : t('checkin.confirmed', { bib: result.bibNumber })
  selected.value = null
}

/*
 * Jetons déjà présentés à l'API : sans cette mémoire, un badge inconnu resté
 * dans le champ de la caméra relancerait une identification toutes les 400 ms.
 */
const tried = new Set<string>()
let resolving = false

/**
 * Badge scanné. La fiche qui s'ouvre porte le portrait, le nom et le numéro de
 * dossier : le QR, lui, ne contient qu'un jeton non devinable, et aucune
 * donnée personnelle ne circule sur le papier.
 */
async function handleToken(token: string) {
  if (resolving || tried.has(token)) return
  tried.add(token)
  resolving = true
  try {
    const { player, elsewhere } = await store.identify(token)
    if (player) {
      select(player)
      stopScan()
      return
    }
    // Convoqué d'un autre créneau : on le nomme plutôt que de crier au faux badge.
    if (elsewhere) {
      scanError.value = t('checkin.otherSlot', {
        name: elsewhere.player?.name || '—',
        slot: elsewhere.slotId?.label || t('checkin.noSlotYet')
      })
      return
    }
    scanError.value = t('checkin.notFound')
  } finally {
    resolving = false
  }
}

/** Scan du QR par la caméra du téléphone, quand le navigateur sait le faire. */
async function startScan() {
  scanError.value = ''
  tried.clear()
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
        await handleToken(codes[0].rawValue)
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
      <!-- Portraits en mémoire : ce qui rend le contrôle d'identité possible
           sans réseau, au même titre que la liste elle-même. -->
      <div class="stat">
        <span class="stat__value numeric">{{ store.photoCount }}</span>
        <span class="stat__label">{{ $t('checkin.photosReady') }}</span>
      </div>
      <button class="btn btn--ghost btn--sm" @click="closeSlot">{{ $t('checkin.closeSlot') }}</button>
    </div>

    <AreneNotice v-if="scanError" tone="danger">{{ scanError }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>
    <AreneNotice v-if="store.error" tone="danger">{{ store.error }}</AreneNotice>

    <div v-if="scanning" class="scanner">
      <video ref="videoEl" muted playsinline />
      <p class="muted">{{ $t('checkin.scanHint') }}</p>
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
        <span class="roster__who">
          <img
            v-if="store.photoFor(player._id)"
            :src="store.photoFor(player._id)"
            :alt="$t('checkin.photoAlt', { name: player.player?.name })"
            class="avatar"
          >
          <span v-else class="avatar avatar--empty" aria-hidden="true">
            {{ initials(player.player?.name) }}
          </span>
          <span class="roster__name">
            <strong>{{ player.player?.name }}</strong>
            <span class="muted">
              {{ $t(`role.${player.role}`) }}
              <template v-if="player.schoolId"> · {{ text(player.schoolId.name) }}</template>
            </span>
            <span class="muted numeric">{{ $t('checkin.fileNumber') }} {{ fileNumber(player) }}</span>
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
        <h2 class="card__title">{{ $t('checkin.identity') }}</h2>
        <button class="btn btn--quiet btn--sm" @click="selected = null">{{ $t('common.close') }}</button>
      </div>

      <!-- Ce que le scan révèle : le visage, le nom, le numéro de dossier. Le
           dossard n'apparaît qu'après validation, c'est lui qu'on remet. -->
      <div class="identity">
        <img
          v-if="store.photoFor(selected._id)"
          :src="store.photoFor(selected._id)"
          :alt="$t('checkin.photoAlt', { name: selected.player?.name })"
          class="identity__photo"
        >
        <div v-else class="identity__photo identity__photo--empty">
          <span aria-hidden="true">{{ initials(selected.player?.name) }}</span>
          <small class="muted">{{ $t('checkin.photoMissing') }}</small>
        </div>

        <div class="identity__text">
          <strong class="identity__name">{{ selected.player?.name }}</strong>
          <p class="identity__number numeric">
            {{ $t('checkin.fileNumber') }} {{ fileNumber(selected) }}
          </p>
          <p v-if="selected.bibNumber" class="identity__bib numeric">
            {{ $t('checkin.bib') }} #{{ selected.bibNumber }}
          </p>
          <div class="cluster">
            <span class="badge">{{ $t(`role.${selected.role}`) }}</span>
            <span class="badge">{{ $t(`category.${selected.ageCategory}`) }}</span>
            <span v-if="selected.schoolId" class="badge">{{ text(selected.schoolId.name) }}</span>
          </div>
        </div>
      </div>

      <AreneNotice v-if="selected.status === 'checked_in'" tone="info">
        {{ $t('checkin.alreadyCheckedIn') }}
      </AreneNotice>
      <AreneNotice v-if="selected.randomCheck" tone="danger">{{ $t('checkin.randomCheck') }}</AreneNotice>
      <AreneNotice v-if="edition?.rules?.requiresOriginalBulletin" tone="info">
        {{ $t('checkin.bulletinRequired') }}
      </AreneNotice>

      <label class="check" :class="{ 'check--checked': form.identityChecked }">
        <input v-model="form.identityChecked" type="checkbox">
        <span>{{ $t('checkin.identityCheck') }}</span>
      </label>

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

      <AreneNotice v-if="!form.identityChecked" tone="info">
        {{ $t('checkin.identityRequired') }}
      </AreneNotice>
      <AreneNotice v-else-if="!form.contractSigned" tone="info">
        {{ $t('checkin.contractRequired') }}
      </AreneNotice>

      <button
        class="btn btn--primary btn--block btn--lg"
        :disabled="
          selected.status === 'checked_in' ||
            !form.identityChecked ||
            !form.contractSigned ||
            store.pending
        "
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

.roster__who {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-inline-size: 0;
}

.roster__name {
  display: grid;
  gap: 2px;
  font-size: var(--text-sm);
}

/** Vignette de la liste : assez grande pour reconnaître un visage au passage. */
.avatar {
  flex: none;
  display: grid;
  place-items: center;
  inline-size: 3rem;
  block-size: 3rem;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-line);
}

.avatar--empty {
  background: var(--color-surface-2);
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-sm);
}

.sheet {
  position: sticky;
  inset-block-end: var(--space-4);
  border-color: var(--color-gold);
  box-shadow: var(--shadow-lg);
}

/** Fiche d'identité : le portrait d'abord, il porte le contrôle. */
.identity {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}

.identity__photo {
  flex: none;
  inline-size: 7.5rem;
  block-size: 7.5rem;
  object-fit: cover;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-line);
}

.identity__photo--empty {
  display: grid;
  place-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  text-align: center;
  background: var(--color-surface-2);

  span {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    color: var(--color-muted);
  }
}

.identity__text {
  display: grid;
  gap: var(--space-2);
  min-inline-size: 0;
}

.identity__name {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  line-height: 1.1;
}

.identity__number,
.identity__bib {
  margin: 0;
}

.identity__bib {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-pitch);
}
</style>
