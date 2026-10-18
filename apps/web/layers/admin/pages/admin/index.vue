<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'admin' })

const { t } = useI18n()
const { $api } = useNuxtApp()
const editions = useEditionsStore()
const { text, date } = useFormat()

useNoIndex(t('admin.configTitle'))

const edition = computed(() => editions.current)
const slots = ref<any[]>([])
const team = ref<any[]>([])
const pending = ref(false)
const error = ref('')
const feedback = ref('')
const nextStatus = ref('')

const slotForm = reactive({
  label: '',
  startsAt: '',
  endsAt: '',
  ageCategory: 'lycee' as 'lycee' | 'universite',
  pitches: 2,
  striker: 50,
  defender: 50
})

const staffForm = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  role: 'staff' as 'staff' | 'admin'
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

const allowed = computed(() => TRANSITIONS[edition.value?.status ?? ''] ?? [])

async function load() {
  pending.value = true
  try {
    const current = await editions.fetchCurrent(true)
    if (current?._id) slots.value = await editions.fetchSlots(current._id).catch(() => [])
    const { data } = await $api.get<{ data: any[] }>('/auth/staff')
    team.value = data
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

onMounted(load)

async function changeStatus() {
  if (!edition.value?._id || !nextStatus.value) return
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

async function createStaff() {
  pending.value = true
  error.value = ''
  try {
    const payload: Record<string, unknown> = { ...staffForm }
    if (!staffForm.phone) delete payload.phone
    await $api.post('/auth/staff', payload)
    feedback.value = t('admin.staffCreated')
    staffForm.firstName = ''
    staffForm.lastName = ''
    staffForm.email = ''
    staffForm.phone = ''
    staffForm.password = ''
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function toggleStaff(member: any) {
  try {
    await $api.patch(`/auth/staff/${member._id}`, { isActive: !member.isActive })
    await load()
  } catch (err: any) {
    error.value = err.message
  }
}

async function importSchools(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  pending.value = true
  error.value = ''
  try {
    const body = new FormData()
    body.append('file', file)
    const { data } = await $api.post<{ data: any }>('/schools/import', body)
    feedback.value = t('admin.importDone', { created: data.created, skipped: data.skipped })
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="stack">
    <div>
      <h1>{{ $t('admin.configTitle') }}</h1>
      <p class="muted">{{ $t('admin.configLead') }}</p>
    </div>

    <GmNotice v-if="error" tone="danger">{{ error }}</GmNotice>
    <GmNotice v-if="feedback" tone="success">{{ feedback }}</GmNotice>
    <GmEmpty v-if="!edition && !pending" :title="$t('admin.noEdition')" />

    <template v-if="edition">
      <section class="card stack">
        <h2 class="card__title">{{ text(edition.title) }}</h2>
        <div class="cluster">
          <span class="badge badge--gold">{{ $t(`editionStatus.${edition.status}`) }}</span>
          <span class="badge numeric">{{ edition.slug }}</span>
        </div>

        <div class="cluster">
          <GmField :label="$t('admin.changeStatus')" for="status">
            <select id="status" v-model="nextStatus" class="select" :disabled="!allowed.length">
              <option value="">—</option>
              <option v-for="status in allowed" :key="status" :value="status">
                {{ $t(`editionStatus.${status}`) }}
              </option>
            </select>
          </GmField>
          <button class="btn btn--ink" :disabled="!nextStatus || pending" @click="changeStatus">
            {{ $t('common.save') }}
          </button>
        </div>
      </section>

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
          <GmField :label="$t('admin.slotLabel')" for="label" required>
            <input id="label" v-model="slotForm.label" class="input" required>
          </GmField>
          <GmField :label="$t('admin.startsAt')" for="startsAt" required>
            <input id="startsAt" v-model="slotForm.startsAt" class="input numeric" type="datetime-local" required>
          </GmField>
          <GmField :label="$t('admin.endsAt')" for="endsAt" required>
            <input id="endsAt" v-model="slotForm.endsAt" class="input numeric" type="datetime-local" required>
          </GmField>
          <GmField :label="$t('admin.ageCategory')" for="ageCategory">
            <select id="ageCategory" v-model="slotForm.ageCategory" class="select">
              <option value="lycee">{{ $t('category.lycee') }}</option>
              <option value="universite">{{ $t('category.universite') }}</option>
            </select>
          </GmField>
          <GmField :label="$t('admin.capacityStriker')" for="striker">
            <input id="striker" v-model.number="slotForm.striker" class="input numeric" type="number" min="1">
          </GmField>
          <GmField :label="$t('admin.capacityDefender')" for="defender">
            <input id="defender" v-model.number="slotForm.defender" class="input numeric" type="number" min="1">
          </GmField>
          <GmField :label="$t('admin.pitches')" for="pitches">
            <input id="pitches" v-model.number="slotForm.pitches" class="input numeric" type="number" min="1">
          </GmField>
          <button class="btn btn--primary" type="submit" :disabled="pending">
            {{ $t('admin.newSlot') }}
          </button>
        </form>
      </section>

      <section class="stack">
        <h2>{{ $t('admin.importSchools') }}</h2>
        <label class="dropzone">
          <input type="file" accept=".csv,text/csv" hidden @change="importSchools">
          <strong>{{ $t('admin.importSchools') }}</strong>
          <span class="muted">nom;nom_ar;type;ville</span>
        </label>
      </section>

      <section class="stack">
        <h2>{{ $t('admin.team') }}</h2>

        <div v-if="team.length" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ $t('auth.firstName') }}</th>
                <th>{{ $t('auth.email') }}</th>
                <th>{{ $t('admin.status') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in team" :key="member._id">
                <td>
                  <strong>{{ member.firstName }} {{ member.lastName }}</strong>
                  <span class="badge">{{ member.role }}</span>
                </td>
                <td>{{ member.email }}</td>
                <td>
                  <span class="badge" :class="member.isActive ? 'badge--pitch' : 'badge--danger'">
                    {{ member.isActive ? $t('common.yes') : $t('common.no') }}
                  </span>
                </td>
                <td>
                  <button class="btn btn--quiet btn--sm" @click="toggleStaff(member)">
                    {{ member.isActive ? $t('admin.deactivate') : $t('admin.activate') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <form class="card card--flat staff-form" @submit.prevent="createStaff">
          <GmField :label="$t('auth.firstName')" for="sFirst" required>
            <input id="sFirst" v-model="staffForm.firstName" class="input" required>
          </GmField>
          <GmField :label="$t('auth.lastName')" for="sLast" required>
            <input id="sLast" v-model="staffForm.lastName" class="input" required>
          </GmField>
          <GmField :label="$t('auth.email')" for="sEmail" required>
            <input id="sEmail" v-model="staffForm.email" class="input" type="email" required>
          </GmField>
          <GmField :label="$t('auth.phone')" for="sPhone">
            <input id="sPhone" v-model="staffForm.phone" class="input numeric" type="tel">
          </GmField>
          <GmField :label="$t('auth.password')" for="sPassword" required>
            <input id="sPassword" v-model="staffForm.password" class="input" type="password" minlength="8" required>
          </GmField>
          <GmField :label="$t('admin.status')" for="sRole">
            <select id="sRole" v-model="staffForm.role" class="select">
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
          </GmField>
          <button class="btn btn--primary" type="submit" :disabled="pending">
            {{ $t('admin.newStaff') }}
          </button>
        </form>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.slot-form,
.staff-form {
  display: grid;
  gap: var(--space-3);
  align-items: end;

  @include from(md) {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
