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
  name: '',
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
    staffForm.name = ''
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

/* ── Comptes : recherche tous rôles, et suppression définitive ────────── */

/*
 * `/auth/staff` ne montre que l'organisation. Supprimer le compte d'un candidat
 * suppose de pouvoir le retrouver, et aucun ecran ne les listait : d'ou cette
 * recherche, qui porte sur le nom, l'email et le telephone.
 */
const search = reactive({ q: '', role: '' })
const found = ref<any[]>([])
const searched = ref(false)
const deletion = ref<any>(null)

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function runSearch() {
  if (!search.q.trim() && !search.role) {
    found.value = []
    searched.value = false
    return
  }
  error.value = ''
  try {
    const query = new URLSearchParams()
    if (search.q.trim()) query.set('q', search.q.trim())
    if (search.role) query.set('role', search.role)
    const { data } = await $api.get<{ data: any[] }>(`/auth/users?${query}`)
    found.value = data
    searched.value = true
  } catch (err: any) {
    error.value = err.message
  }
}

watch(
  () => [search.q, search.role],
  () => {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(runSearch, 350)
  }
)

async function openDeletion(user: any) {
  pending.value = true
  error.value = ''
  try {
    const { data } = await $api.get<{ data: any }>(`/auth/users/${user._id}/deletion-impact`)
    deletion.value = data
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

/** Les blocages arrivent en codes ; `apiError.*` en porte déjà les phrases. */
function blockerLabel(blocker: { code: string }) {
  return t(`apiError.${blocker.code}`)
}

const deletionItems = computed(() => {
  const impact = deletion.value?.impact
  if (!impact) return []
  return [
    { label: t('danger.impactRegistrations'), value: impact.registrations },
    { label: t('danger.impactMessages'), value: impact.messages },
    { label: t('danger.impactFiles'), value: impact.files },
    { label: t('danger.impactStaffActs'), value: impact.staffActs }
  ]
})

async function confirmDeletion(payload: { reason: string; confirm: string; force: boolean }) {
  if (!deletion.value) return
  pending.value = true
  error.value = ''
  try {
    await $api.delete(`/auth/users/${deletion.value.user.id}`, payload)
    feedback.value = t('danger.deleted')
    deletion.value = null
    await Promise.all([load(), runSearch()])
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
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

    <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>

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
              <th>{{ $t('auth.name') }}</th>
              <th>{{ $t('auth.email') }}</th>
              <th>{{ $t('admin.status') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in team" :key="member._id">
              <td>
                <strong>{{ member.name }}</strong>
                <span class="badge">{{ member.role }}</span>
              </td>
              <td>{{ member.email }}</td>
              <td>
                <span class="badge" :class="member.isActive ? 'badge--pitch' : 'badge--danger'">
                  {{ member.isActive ? $t('common.yes') : $t('common.no') }}
                </span>
              </td>
              <td>
                <div class="cluster">
                  <button class="btn btn--quiet btn--sm" @click="toggleStaff(member)">
                    {{ member.isActive ? $t('admin.deactivate') : $t('admin.activate') }}
                  </button>
                  <button class="btn btn--quiet btn--sm danger-link" @click="openDeletion(member)">
                    {{ $t('danger.delete') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- La désactivation n'est pas un demi-effacement : c'est l'outil normal. -->
      <AreneNotice tone="info">{{ $t('admin.deactivateFirst') }}</AreneNotice>

      <form class="card card--flat staff-form" @submit.prevent="createStaff">
        <AreneField :label="$t('auth.name')" for="sName" required>
          <input id="sName" v-model="staffForm.name" class="input" required>
        </AreneField>
        <AreneField :label="$t('auth.email')" for="sEmail" required>
          <input id="sEmail" v-model="staffForm.email" class="input" type="email" required>
        </AreneField>
        <AreneField :label="$t('auth.phone')" for="sPhone">
          <input id="sPhone" v-model="staffForm.phone" class="input numeric" type="tel">
        </AreneField>
        <AreneField :label="$t('auth.password')" for="sPassword" required>
          <input id="sPassword" v-model="staffForm.password" class="input" type="password" minlength="8" required>
        </AreneField>
        <AreneField :label="$t('admin.status')" for="sRole">
          <select id="sRole" v-model="staffForm.role" class="select">
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
        </AreneField>
        <button class="btn btn--primary" type="submit" :disabled="pending">
          {{ $t('admin.newStaff') }}
        </button>
      </form>
    </section>

    <!-- Recherche de comptes, tous rôles : le seul chemin vers un candidat. -->
    <section class="stack">
      <h2>{{ $t('admin.accountsTitle') }}</h2>
      <p class="muted">{{ $t('admin.accountsLead') }}</p>

      <div class="two">
        <AreneField :label="$t('admin.accountsSearch')" for="uq">
          <input id="uq" v-model="search.q" class="input" type="search">
        </AreneField>
        <AreneField :label="$t('admin.accountsRole')" for="urole">
          <select id="urole" v-model="search.role" class="select">
            <option value="">{{ $t('common.all') }}</option>
            <option value="candidate">candidate</option>
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
        </AreneField>
      </div>

      <div v-if="found.length" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t('auth.name') }}</th>
              <th>{{ $t('auth.email') }}</th>
              <th>{{ $t('auth.phone') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in found" :key="user._id">
              <td>
                <strong>{{ user.name }}</strong>
                <span class="badge">{{ user.role }}</span>
              </td>
              <td>{{ user.email || '—' }}</td>
              <td class="numeric">{{ user.phone || '—' }}</td>
              <td>
                <button class="btn btn--quiet btn--sm danger-link" @click="openDeletion(user)">
                  {{ $t('danger.delete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <AreneEmpty v-else-if="searched" :title="$t('admin.accountsEmpty')" />
    </section>

    <!-- Suppression définitive d'un compte : impact, avertissements, confirmation. -->
    <AreneDangerPanel
      v-if="deletion"
      :title="`${$t('danger.delete')} — ${deletion.user.name}`"
      :items="deletionItems"
      :blockers="deletion.blockers.map((b: any) => ({ code: b.code, label: blockerLabel(b) }))"
      :hard="deletion.hard.map((b: any) => ({ code: b.code, label: blockerLabel(b) }))"
      :confirm-expected="deletion.confirm"
      :pending="pending"
      @confirm="confirmDeletion"
      @cancel="deletion = null"
    />
  </div>
</template>

<style scoped lang="scss">
.two {
  display: grid;
  gap: var(--space-3);

  @include from(sm) {
    grid-template-columns: 1fr 1fr;
  }
}

/** Discret dans la grille, mais sans jamais se faire passer pour une action neutre. */
.danger-link {
  color: var(--color-danger);
}

.staff-form {
  display: grid;
  gap: var(--space-3);
  align-items: end;

  @include from(md) {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
