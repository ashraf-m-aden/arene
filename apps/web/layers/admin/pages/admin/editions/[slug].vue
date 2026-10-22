<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'admin' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
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

/**
 * Onglets de la page. L'onglet actif vit dans l'URL (`?tab=quotas`) : un rechargement,
 * un signet ou un lien partagé retombent au même endroit. Les états de formulaire
 * (`info`, `quotas`, `slotForm`) sont déclarés hors des panneaux, donc changer
 * d'onglet ne perd pas une saisie en cours.
 */
const TABS = ['presentation', 'rules', 'quotas', 'slots', 'messages', 'tracking'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  presentation: 'admin.tabPresentation',
  rules: 'admin.tabRules',
  quotas: 'admin.tabQuotas',
  slots: 'admin.tabSlots',
  messages: 'admin.tabMessages',
  tracking: 'admin.tabTracking'
}

const tab = computed<Tab>({
  get: () => {
    const asked = String(route.query.tab || '')
    return (TABS as readonly string[]).includes(asked) ? (asked as Tab) : 'presentation'
  },
  set: (value) => {
    router.replace({
      query: { ...route.query, tab: value === 'presentation' ? undefined : value }
    })
  }
})

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
  tournamentStartsAt: '',
  tournamentEndsAt: '',
  rulesFr: '',
  rulesAr: '',
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
  /** Vide = rendez-vous ouvert a toutes les categories. */
  ageCategory: '' as '' | 'lycee' | 'universite',
  pitches: 2,
  total: 20
})

/**
 * Conditions de la repartition automatique. On saisit une periode plutot qu'une
 * liste de jours : c'est ce qu'on a en tete quand on planifie des convocations.
 */
const dist = reactive({
  from: '',
  to: '',
  startTime: '08:00',
  endTime: '16:00',
  durationMinutes: 60,
  perSlot: 20,
  ageCategory: '' as '' | 'lycee' | 'universite'
})

const preview = ref<any>(null)
const selectedSlot = ref<any>(null)

/**
 * Envoi groupe par edition. On designe les destinataires un par un plutot que par
 * critere : une annonce part a des personnes, et l'organisation doit pouvoir
 * relire la liste avant d'appuyer. Les identifiants choisis l'emportent sur tout
 * filtre cote API.
 */
const candidates = ref<any[]>([])
const candidatesLoaded = ref(false)
const selection = ref<Set<string>>(new Set())
const statusFilter = ref('')

const message = reactive({
  channels: ['email'] as string[],
  subjectFr: '',
  subjectAr: '',
  bodyFr: '',
  bodyAr: ''
})

const visibleCandidates = computed(() =>
  statusFilter.value
    ? candidates.value.filter((row) => row.status === statusFilter.value)
    : candidates.value
)

const allVisibleSelected = computed(
  () =>
    visibleCandidates.value.length > 0 &&
    visibleCandidates.value.every((row) => selection.value.has(String(row._id)))
)

function toggleCandidate(id: string) {
  const next = new Set(selection.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selection.value = next
}

/** Tout cocher ne vise que les lignes visibles : un filtre actif reste respecte. */
function toggleAllVisible() {
  const next = new Set(selection.value)
  const shouldClear = allVisibleSelected.value
  for (const row of visibleCandidates.value) {
    if (shouldClear) next.delete(String(row._id))
    else next.add(String(row._id))
  }
  selection.value = next
}

function toggleChannel(channel: string) {
  const index = message.channels.indexOf(channel)
  if (index >= 0) message.channels.splice(index, 1)
  else message.channels.push(channel)
}

/** Chargement a l'ouverture de l'onglet : inutile de le payer sur chaque visite. */
async function loadCandidates() {
  if (!edition.value?._id || candidatesLoaded.value) return
  const { $api } = useNuxtApp()
  pending.value = true
  try {
    const { data } = await $api.get<{ data: any[] }>(
      `/registrations?editionId=${edition.value._id}&limit=200`
    )
    candidates.value = data
    candidatesLoaded.value = true
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

watch(
  () => tab.value,
  (value) => {
    if (value === 'messages') loadCandidates()
  },
  { immediate: true }
)

async function sendMessages() {
  if (!edition.value?._id || !selection.value.size) return
  const { $api } = useNuxtApp()
  pending.value = true
  error.value = ''
  try {
    const { data } = await $api.post<{ data: any }>('/notifications/broadcast', {
      editionId: edition.value._id,
      channels: message.channels,
      template: 'broadcast',
      registrationIds: [...selection.value],
      payload: {
        subject: { fr: message.subjectFr, ar: message.subjectAr || message.subjectFr },
        body: { fr: message.bodyFr, ar: message.bodyAr || message.bodyFr }
      }
    })
    feedback.value = t('admin.broadcastSent', { queued: data.queued })
    selection.value = new Set()
    message.subjectFr = ''
    message.subjectAr = ''
    message.bodyFr = ''
    message.bodyAr = ''
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

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

/**
 * Les inscriptions sont ouvertes si DEUX conditions tiennent : le statut vaut
 * `registration_open` ET la date du jour tombe dans la fenêtre. Le statut seul ne
 * suffit pas (`Edition.isRegistrationOpen` côté API applique la même règle), et
 * c'est la source de confusion la plus fréquente : on passe le statut, rien ne
 * s'ouvre, parce que la fenêtre commence dans deux mois. L'écran dit donc ce qui
 * bloque, et pas seulement où on en est.
 */
const registrationState = computed(() => {
  const value = edition.value
  if (!value) return null

  const opensAt = value.registrationOpensAt ? new Date(value.registrationOpensAt) : null
  const closesAt = value.registrationClosesAt ? new Date(value.registrationClosesAt) : null
  const now = new Date()

  if (value.status !== 'registration_open') {
    return { open: false, key: 'admin.regNeedStatus', params: {} }
  }
  if (opensAt && now < opensAt) {
    return { open: false, key: 'admin.regBeforeWindow', params: { date: date(opensAt) } }
  }
  if (closesAt && now > closesAt) {
    return { open: false, key: 'admin.regAfterWindow', params: { date: date(closesAt) } }
  }
  return { open: true, key: 'admin.regOpen', params: { date: closesAt ? date(closesAt) : '—' } }
})

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

/** Le règlement est-il rédigé ? Sert de repère visuel sur l'onglet. */
const hasRules = computed(() => Boolean(info.rulesFr.trim() || info.rulesAr.trim()))

/** Compteur affiché sur un onglet, pour voir l'essentiel sans l'ouvrir. */
function tabCount(name: Tab): number | null {
  if (name === 'slots') return slots.value.length || null
  if (name === 'messages') return selection.value.size || null
  if (name === 'tracking') return totalCandidatures.value || null
  return null
}

function fillForms() {
  if (!edition.value) return
  info.titleFr = edition.value.title?.fr || ''
  info.titleAr = edition.value.title?.ar || ''
  info.descriptionFr = edition.value.description?.fr || ''
  info.descriptionAr = edition.value.description?.ar || ''
  info.season = edition.value.season || ''
  info.registrationOpensAt = toLocalInput(edition.value.registrationOpensAt)
  info.registrationClosesAt = toLocalInput(edition.value.registrationClosesAt)
  info.tournamentStartsAt = toLocalInput(edition.value.startsAt)
  info.tournamentEndsAt = toLocalInput(edition.value.endsAt)
  info.fee = edition.value.fee ?? 0
  info.gradeThreshold = edition.value.rules?.gradeThreshold ?? 12
  info.rulesFr = edition.value.rules?.text?.fr || ''
  info.rulesAr = edition.value.rules?.text?.ar || ''
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
      startsAt: info.tournamentStartsAt || undefined,
      endsAt: info.tournamentEndsAt || undefined,
      fee: info.fee,
      rules: {
        gradeThreshold: info.gradeThreshold,
        text: { fr: info.rulesFr.trim(), ar: info.rulesAr.trim() }
      },
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

/** Clic sur une case libre : on pre-remplit le formulaire de creation. */
function prefillSlot(startsAt: Date) {
  const end = new Date(startsAt.getTime() + dist.durationMinutes * 60000)
  slotForm.startsAt = toLocalInput(startsAt.toISOString())
  slotForm.endsAt = toLocalInput(end.toISOString())
  selectedSlot.value = null
}

/** Clic sur un rendez-vous existant : on affiche ce qu'il contient. */
function focusSlot(slot: any) {
  selectedSlot.value = slot
}

/** Les jours de la periode demandee, bornes incluses. */
function daysInRange(from: string, to: string) {
  if (!from || !to) return []
  const days: string[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const last = new Date(`${to}T00:00:00`)
  while (cursor <= last && days.length < 60) {
    days.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    )
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/**
 * Repartition automatique. `dryRun` interroge sans rien ecrire : on montre
 * d'abord combien de rendez-vous seraient crees et combien de candidats placés,
 * parce qu'une convocation mal repartie se paie en appels telephoniques.
 */
async function runDistribute(dryRun: boolean) {
  if (!edition.value?._id) return
  const days = daysInRange(dist.from, dist.to)
  if (!days.length) {
    error.value = t('admin.distributeNoDays')
    return
  }

  const { $api } = useNuxtApp()
  pending.value = true
  error.value = ''
  try {
    const { data } = await $api.post<{ data: any }>(
      `/editions/${edition.value._id}/slots/distribute`,
      {
        days,
        startTime: dist.startTime,
        endTime: dist.endTime,
        durationMinutes: dist.durationMinutes,
        perSlot: dist.perSlot,
        ageCategory: dist.ageCategory || undefined,
        // Le serveur ne devine pas le fuseau du navigateur : on le lui donne.
        offsetMinutes: -new Date().getTimezoneOffset(),
        venue: edition.value.venue?.name,
        dryRun
      }
    )
    preview.value = data
    if (!dryRun) {
      feedback.value = t('admin.distributeDone', { slots: data.slotsUsed, placed: data.placed })
      preview.value = null
      await load()
    }
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
      pitches: slotForm.pitches,
      capacity: { total: slotForm.total },
      ageCategory: slotForm.ageCategory || undefined,
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
    <!-- En-tête : identité de l'édition et changement de statut, visibles depuis tout onglet. -->
    <header class="edition-head">
      <div>
        <NuxtLink :to="localePath('/admin/editions')" class="muted back-link">
          ← {{ $t('admin.editionsTitle') }}
        </NuxtLink>
        <h1>{{ edition ? text(edition.title) : '' }}</h1>
        <div v-if="edition" class="cluster">
          <span class="badge badge--gold">{{ $t(`editionStatus.${edition.status}`) }}</span>
          <span class="badge numeric">{{ edition.slug }}</span>
          <span v-if="edition.season" class="badge numeric">{{ edition.season }}</span>
        </div>
      </div>

      <div v-if="edition && allowedTransitions.length" class="status-change">
        <AreneField
          :label="$t('admin.changeStatus')"
          :hint="$t('admin.changeStatusHint')"
          for="nextStatus"
        >
          <div class="cluster">
            <select id="nextStatus" v-model="nextStatus" class="select">
              <option value="">—</option>
              <option v-for="status in allowedTransitions" :key="status" :value="status">
                {{ $t(`editionStatus.${status}`) }}
              </option>
            </select>
            <button
              class="btn btn--ink"
              type="button"
              :disabled="!nextStatus || pending"
              @click="changeStatus"
            >
              {{ $t('common.save') }}
            </button>
          </div>
        </AreneField>
      </div>
    </header>

    <!-- État réel des inscriptions, et ce qui les bloque le cas échéant. -->
    <AreneNotice v-if="registrationState" :tone="registrationState.open ? 'success' : 'warning'">
      <strong>{{ $t('admin.regLabel') }} :</strong>
      {{ $t(registrationState.key, registrationState.params) }}
    </AreneNotice>

    <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>
    <AreneSpinner v-if="pending && !edition" />
    <AreneEmpty v-else-if="!edition && !pending" :title="$t('admin.noEdition')" />

    <template v-if="edition">
      <nav class="tabs" role="tablist" :aria-label="$t('admin.editionDetailTitle')">
        <button
          v-for="name in TABS"
          :id="`tab-${name}`"
          :key="name"
          type="button"
          role="tab"
          class="tabs__link tab-button"
          :class="{ 'tabs__link--active': tab === name }"
          :aria-selected="tab === name"
          :aria-controls="`panel-${name}`"
          @click="tab = name"
        >
          {{ $t(TAB_LABELS[name]) }}
          <span v-if="tabCount(name)" class="tab-button__count numeric">{{ tabCount(name) }}</span>
          <span
            v-else-if="name === 'rules' && !hasRules"
            class="tab-button__dot"
            :title="$t('editions.rulesEmpty')"
            aria-hidden="true"
          />
        </button>
      </nav>

      <!-- Présentation -->
      <section
        v-if="tab === 'presentation'"
        id="panel-presentation"
        role="tabpanel"
        aria-labelledby="tab-presentation"
        class="stack"
      >
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
            <AreneField
              :label="$t('admin.regOpensAt')"
              :hint="$t('admin.regWindowHint')"
              for="iOpens"
              required
            >
              <input id="iOpens" v-model="info.registrationOpensAt" class="input numeric" type="datetime-local" required>
            </AreneField>
            <AreneField :label="$t('admin.regClosesAt')" for="iCloses" required>
              <input id="iCloses" v-model="info.registrationClosesAt" class="input numeric" type="datetime-local" required>
            </AreneField>
          </div>

          <div class="two">
            <AreneField
              :label="$t('admin.tournamentStartsAt')"
              :hint="$t('admin.tournamentDatesHint')"
              for="iTourStart"
            >
              <input id="iTourStart" v-model="info.tournamentStartsAt" class="input numeric" type="datetime-local">
            </AreneField>
            <AreneField :label="$t('admin.tournamentEndsAt')" for="iTourEnd">
              <input id="iTourEnd" v-model="info.tournamentEndsAt" class="input numeric" type="datetime-local">
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

      <!-- Règlement -->
      <section
        v-else-if="tab === 'rules'"
        id="panel-rules"
        role="tabpanel"
        aria-labelledby="tab-rules"
        class="stack"
      >
        <form class="card stack" @submit.prevent="saveInfo">
          <p class="muted">{{ $t('editions.rulesTextHint') }}</p>

          <div class="two">
            <AreneField :label="$t('editions.rulesTextFr')" for="iRulesFr">
              <textarea id="iRulesFr" v-model="info.rulesFr" class="textarea" rows="22" />
            </AreneField>
            <AreneField :label="$t('editions.rulesTextAr')" for="iRulesAr">
              <textarea id="iRulesAr" v-model="info.rulesAr" class="textarea" rows="22" dir="rtl" />
            </AreneField>
          </div>

          <div class="cluster">
            <button class="btn btn--primary" type="submit" :disabled="pending">
              {{ $t('common.save') }}
            </button>
            <NuxtLink
              :to="localePath(`/editions/${edition.slug}/reglement`)"
              class="btn btn--ghost btn--sm"
              target="_blank"
            >
              {{ $t('admin.previewRules') }}
            </NuxtLink>
          </div>
        </form>
      </section>

      <!-- Quotas -->
      <section
        v-else-if="tab === 'quotas'"
        id="panel-quotas"
        role="tabpanel"
        aria-labelledby="tab-quotas"
        class="stack"
      >
        <div class="grid grid--2">
          <article class="card stack">
            <h2 class="card__title">{{ $t('category.lycee') }}</h2>
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
            <h2 class="card__title">{{ $t('category.universite') }}</h2>
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
          <button class="btn btn--ink" type="button" :disabled="pending" @click="saveQuotas">
            {{ $t('admin.saveQuotas') }}
          </button>
        </div>
      </section>

      <!-- Créneaux : calendrier, répartition automatique, création manuelle -->
      <section
        v-else-if="tab === 'slots'"
        id="panel-slots"
        role="tabpanel"
        aria-labelledby="tab-slots"
        class="stack"
      >
        <AreneSlotCalendar :slots="slots" @create="prefillSlot" @select="focusSlot" />

        <AreneNotice v-if="selectedSlot" tone="info">
          <strong>{{ selectedSlot.label }}</strong> ·
          <span class="numeric">{{ date(selectedSlot.startsAt, true) }}</span> ·
          <span class="numeric">
            {{ selectedSlot.occupancy?.total?.used ?? 0 }} /
            {{ selectedSlot.occupancy?.total?.capacity ?? selectedSlot.capacity?.total ?? 0 }}
            {{ $t('admin.participants') }}
          </span>
        </AreneNotice>

        <!-- Répartition automatique -->
        <form class="card stack" @submit.prevent="runDistribute(false)">
          <h2 class="card__title">{{ $t('admin.distributeTitle') }}</h2>
          <p class="muted">{{ $t('admin.distributeLead') }}</p>

          <div class="two">
            <AreneField :label="$t('admin.distributeFrom')" for="dFrom" required>
              <input id="dFrom" v-model="dist.from" class="input numeric" type="date" required>
            </AreneField>
            <AreneField :label="$t('admin.distributeTo')" for="dTo" required>
              <input id="dTo" v-model="dist.to" class="input numeric" type="date" required>
            </AreneField>
          </div>

          <div class="two">
            <AreneField :label="$t('admin.distributeStart')" for="dStart" required>
              <input id="dStart" v-model="dist.startTime" class="input numeric" type="time" required>
            </AreneField>
            <AreneField :label="$t('admin.distributeEnd')" for="dEnd" required>
              <input id="dEnd" v-model="dist.endTime" class="input numeric" type="time" required>
            </AreneField>
          </div>

          <div class="two">
            <AreneField
              :label="$t('admin.distributeDuration')"
              :hint="$t('admin.distributeDurationHint')"
              for="dDur"
              required
            >
              <input id="dDur" v-model.number="dist.durationMinutes" class="input numeric" type="number" min="5" max="600" step="5" required>
            </AreneField>
            <AreneField :label="$t('admin.distributePerSlot')" for="dPer" required>
              <input id="dPer" v-model.number="dist.perSlot" class="input numeric" type="number" min="1" max="500" required>
            </AreneField>
          </div>

          <AreneField :label="$t('admin.ageCategory')" for="dCat">
            <select id="dCat" v-model="dist.ageCategory" class="select">
              <option value="">{{ $t('common.all') }}</option>
              <option value="lycee">{{ $t('category.lycee') }}</option>
              <option value="universite">{{ $t('category.universite') }}</option>
            </select>
          </AreneField>

          <AreneNotice v-if="preview" :tone="preview.leftOver ? 'warning' : 'info'">
            {{ $t('admin.distributePreviewResult', {
              slots: preview.slotsUsed,
              placed: preview.placed,
              waiting: preview.waiting
            }) }}
            <template v-if="preview.leftOver">
              — {{ $t('admin.distributeLeftOver', { count: preview.leftOver }) }}
            </template>
          </AreneNotice>

          <div class="cluster">
            <button class="btn btn--ghost" type="button" :disabled="pending" @click="runDistribute(true)">
              {{ $t('admin.distributePreview') }}
            </button>
            <button class="btn btn--primary" type="submit" :disabled="pending">
              {{ $t('admin.distributeRun') }}
            </button>
          </div>
        </form>

        <!-- Création manuelle, pré-remplie par un clic dans le calendrier -->
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
              <option value="">{{ $t('common.all') }}</option>
              <option value="lycee">{{ $t('category.lycee') }}</option>
              <option value="universite">{{ $t('category.universite') }}</option>
            </select>
          </AreneField>
          <AreneField :label="$t('admin.participants')" for="slotTotal" required>
            <input id="slotTotal" v-model.number="slotForm.total" class="input numeric" type="number" min="1" max="1000" required>
          </AreneField>
          <AreneField :label="$t('admin.pitches')" for="pitches">
            <input id="pitches" v-model.number="slotForm.pitches" class="input numeric" type="number" min="1">
          </AreneField>
          <button class="btn btn--primary" type="submit" :disabled="pending">
            {{ $t('admin.newSlot') }}
          </button>
        </form>
      </section>

      <!-- Messages : on choisit les destinataires, puis on envoie -->
      <section
        v-else-if="tab === 'messages'"
        id="panel-messages"
        role="tabpanel"
        aria-labelledby="tab-messages"
        class="stack"
      >
        <div class="spread">
          <h2>{{ $t('admin.recipients') }}</h2>
          <span class="badge numeric">
            {{ $t('admin.selectedCount', { count: selection.size }) }}
          </span>
        </div>

        <div class="cluster">
          <AreneField :label="$t('admin.filterStatus')" for="mStatus">
            <select id="mStatus" v-model="statusFilter" class="select">
              <option value="">{{ $t('common.all') }}</option>
              <option value="submitted">{{ $t('status.submitted') }}</option>
              <option value="under_review">{{ $t('status.under_review') }}</option>
              <option value="approved">{{ $t('status.approved') }}</option>
              <option value="scheduled">{{ $t('status.scheduled') }}</option>
              <option value="checked_in">{{ $t('status.checked_in') }}</option>
              <option value="changes_requested">{{ $t('status.changes_requested') }}</option>
            </select>
          </AreneField>
          <button class="btn btn--ghost btn--sm" type="button" @click="toggleAllVisible">
            {{ allVisibleSelected ? $t('admin.unselectAll') : $t('admin.selectAll') }}
          </button>
        </div>

        <div v-if="visibleCandidates.length" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th />
                <th>{{ $t('admin.candidate') }}</th>
                <th>{{ $t('admin.status') }}</th>
                <th>{{ $t('admin.ageCategory') }}</th>
                <th>{{ $t('registrations.account.slot') }}</th>
                <th>{{ $t('admin.channels') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleCandidates" :key="row._id">
                <td>
                  <input
                    type="checkbox"
                    :checked="selection.has(String(row._id))"
                    :aria-label="row.player?.firstName"
                    @change="toggleCandidate(String(row._id))"
                  >
                </td>
                <td>
                  <strong>{{ row.player?.firstName }} {{ row.player?.lastName }}</strong>
                </td>
                <td>{{ $t(`status.${row.status}`) }}</td>
                <td>{{ row.ageCategory ? $t(`category.${row.ageCategory}`) : '—' }}</td>
                <td class="numeric">
                  {{ row.slotId?.startsAt ? date(row.slotId.startsAt, true) : '—' }}
                </td>
                <td class="muted">
                  <span v-if="row.candidateId?.email">@</span>
                  <span v-if="row.candidateId?.phone" class="numeric">☎</span>
                  <span v-if="!row.candidateId?.email && !row.candidateId?.phone">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <AreneEmpty v-else :title="$t('admin.noCandidates')" />

        <form class="card stack" @submit.prevent="sendMessages">
          <h2 class="card__title">{{ $t('admin.composeMessage') }}</h2>

          <div class="cluster">
            <label v-for="channel in ['email', 'whatsapp']" :key="channel" class="check">
              <input
                type="checkbox"
                :checked="message.channels.includes(channel)"
                @change="toggleChannel(channel)"
              >
              {{ $t(`admin.channel_${channel}`) }}
            </label>
          </div>

          <div class="two">
            <AreneField :label="$t('admin.subjectFr')" for="mSubFr" required>
              <input id="mSubFr" v-model="message.subjectFr" class="input" required>
            </AreneField>
            <AreneField :label="$t('admin.subjectAr')" for="mSubAr">
              <input id="mSubAr" v-model="message.subjectAr" class="input" dir="rtl">
            </AreneField>
          </div>

          <div class="two">
            <AreneField :label="$t('admin.bodyFr')" for="mBodyFr" required>
              <textarea id="mBodyFr" v-model="message.bodyFr" class="textarea" rows="8" required />
            </AreneField>
            <AreneField :label="$t('admin.bodyAr')" for="mBodyAr">
              <textarea id="mBodyAr" v-model="message.bodyAr" class="textarea" rows="8" dir="rtl" />
            </AreneField>
          </div>

          <AreneNotice v-if="!selection.size" tone="warning">
            {{ $t('admin.selectBeforeSend') }}
          </AreneNotice>
          <AreneNotice v-else-if="!message.channels.length" tone="warning">
            {{ $t('admin.pickChannel') }}
          </AreneNotice>

          <div>
            <button
              class="btn btn--primary"
              type="submit"
              :disabled="pending || !selection.size || !message.channels.length"
            >
              {{ $t('admin.sendToSelection', { count: selection.size }) }}
            </button>
          </div>
        </form>
      </section>

      <!-- Suivi : candidatures, encaissements, écoles -->
      <section
        v-else-if="tab === 'tracking'"
        id="panel-tracking"
        role="tabpanel"
        aria-labelledby="tab-tracking"
        class="stack"
      >
        <template v-if="stats">
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
        </template>

        <template v-if="paymentItems.length">
          <h2>{{ $t('admin.payments') }}</h2>
          <div class="card">
            <AreneBarChart :items="paymentItems" :format-value="money" />
          </div>
        </template>

        <template v-if="stats?.topSchools?.length">
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
        </template>

        <AreneEmpty v-if="!stats" :title="$t('admin.candidatures')" />
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.edition-head {
  display: grid;
  gap: var(--space-4);
  align-items: end;

  @include from(md) {
    grid-template-columns: 1fr auto;
  }
}

.back-link {
  display: inline-block;
  margin-block-end: var(--space-2);
  font-size: var(--text-sm);
  text-decoration: none;
}

.status-change {
  min-inline-size: 16rem;
}

/** Les onglets réutilisent `.tabs__link` ; un bouton doit perdre son habillage. */
.tab-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: none;
  border: 0;
  border-block-end: 2px solid transparent;
  cursor: pointer;
  font-family: inherit;
}

.tab-button__count {
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-surface-2);
  border: 1px solid var(--color-line);
  font-size: var(--text-xs);
  line-height: 1.6;
}

/** Point discret : le règlement de cette édition n'est pas encore rédigé. */
.tab-button__dot {
  inline-size: 0.45rem;
  block-size: 0.45rem;
  border-radius: 50%;
  background: var(--color-warning);
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
