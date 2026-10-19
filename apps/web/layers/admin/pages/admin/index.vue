<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'admin' })

const { t } = useI18n()
const { $api } = useNuxtApp()
const localePath = useLocalePath()

useNoIndex(t('admin.configTitle'))

const team = ref<any[]>([])
const pending = ref(false)
const error = ref('')
const feedback = ref('')

const staffForm = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  role: 'staff' as 'staff' | 'admin'
})

async function load() {
  pending.value = true
  try {
    const { data } = await $api.get<{ data: any[] }>('/auth/staff')
    team.value = data
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

onMounted(load)

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
    <div class="spread">
      <div>
        <h1>{{ $t('admin.configTitle') }}</h1>
        <p class="muted">{{ $t('admin.configLead') }}</p>
      </div>
      <NuxtLink :to="localePath('/admin/editions')" class="btn btn--ghost btn--sm">
        {{ $t('admin.editionsTitle') }}
      </NuxtLink>
    </div>

    <GmNotice v-if="error" tone="danger">{{ error }}</GmNotice>
    <GmNotice v-if="feedback" tone="success">{{ feedback }}</GmNotice>

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
  </div>
</template>

<style scoped lang="scss">
.staff-form {
  display: grid;
  gap: var(--space-3);
  align-items: end;

  @include from(md) {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
