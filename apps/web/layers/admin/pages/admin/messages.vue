<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'admin' })

const { t } = useI18n()
const { $api } = useNuxtApp()
const editions = useEditionsStore()
const { date } = useFormat()

useNoIndex(t('admin.messagesTitle'))

const templates = ref<any[]>([])
const journal = ref<any[]>([])
const selected = ref<any>(null)
const pending = ref(false)
const error = ref('')
const feedback = ref('')

const broadcast = reactive({
  channels: ['email'] as string[],
  status: '',
  role: '',
  ageCategory: '',
  subjectFr: '',
  subjectAr: '',
  bodyFr: '',
  bodyAr: ''
})

async function load() {
  pending.value = true
  error.value = ''
  try {
    const [templateList, log] = await Promise.all([
      $api.get<{ data: any[] }>('/notification-templates'),
      $api.get<{ data: any[] }>('/notifications?limit=50')
    ])
    templates.value = templateList.data
    journal.value = log.data
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

onMounted(load)

function edit(template: any) {
  const copy = JSON.parse(JSON.stringify(template))
  // Les modèles par défaut n'ont pas toujours d'objet : on complète pour l'édition.
  copy.subject = { fr: '', ar: '', ...(copy.subject ?? {}) }
  copy.body = { fr: '', ar: '', ...(copy.body ?? {}) }
  selected.value = copy
}

async function saveTemplate() {
  if (!selected.value) return
  pending.value = true
  error.value = ''
  try {
    await $api.put(`/notification-templates/${selected.value.key}`, {
      channels: selected.value.channels,
      subject: selected.value.subject ?? { fr: '', ar: '' },
      body: selected.value.body,
      metaTemplateName: selected.value.metaTemplateName || undefined,
      isActive: selected.value.isActive !== false
    })
    feedback.value = t('admin.templateSaved')
    selected.value = null
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function sendBroadcast() {
  const edition = await editions.fetchCurrent()
  if (!edition?._id) return
  pending.value = true
  error.value = ''
  try {
    const segment: Record<string, string> = {}
    if (broadcast.status) segment.status = broadcast.status
    if (broadcast.role) segment.role = broadcast.role
    if (broadcast.ageCategory) segment.ageCategory = broadcast.ageCategory

    const { data } = await $api.post<{ data: any }>('/notifications/broadcast', {
      editionId: edition._id,
      channels: broadcast.channels,
      template: 'broadcast',
      segment,
      payload: {
        subject: { fr: broadcast.subjectFr, ar: broadcast.subjectAr || broadcast.subjectFr },
        body: { fr: broadcast.bodyFr, ar: broadcast.bodyAr || broadcast.bodyFr }
      }
    })
    feedback.value = t('admin.broadcastSent', { queued: data.queued })
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function retry(notification: any) {
  try {
    await $api.post(`/notifications/${notification._id}/retry`)
    await load()
  } catch (err: any) {
    error.value = err.message
  }
}

function toggleChannel(channel: string) {
  const index = broadcast.channels.indexOf(channel)
  if (index >= 0) broadcast.channels.splice(index, 1)
  else broadcast.channels.push(channel)
}
</script>

<template>
  <div class="stack">
    <div>
      <h1>{{ $t('admin.messagesTitle') }}</h1>
      <p class="muted">{{ $t('admin.messagesLead') }}</p>
    </div>

    <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>
    <AreneSpinner v-if="pending && !templates.length" />

    <section class="stack">
      <h2>{{ $t('admin.templates') }}</h2>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t('admin.templateKey') }}</th>
              <th>{{ $t('admin.channels') }}</th>
              <th>{{ $t('admin.metaTemplate') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="template in templates" :key="template.key">
              <td><strong>{{ template.key }}</strong></td>
              <td>
                <span v-for="channel in template.channels" :key="channel" class="badge">
                  {{ channel }}
                </span>
              </td>
              <td class="muted">{{ template.metaTemplateName || '—' }}</td>
              <td>
                <button class="btn btn--quiet btn--sm" @click="edit(template)">
                  {{ $t('common.save') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <aside v-if="selected" class="card editor stack">
      <div class="spread">
        <h2 class="card__title">{{ selected.key }}</h2>
        <button class="btn btn--quiet btn--sm" @click="selected = null">{{ $t('common.close') }}</button>
      </div>

      <AreneField :label="$t('admin.metaTemplate')" for="meta">
        <input id="meta" v-model="selected.metaTemplateName" class="input">
      </AreneField>

      <div class="two">
        <AreneField :label="$t('admin.subjectFr')" for="subjectFr">
          <input id="subjectFr" v-model="selected.subject.fr" class="input">
        </AreneField>
        <AreneField :label="$t('admin.subjectAr')" for="subjectAr">
          <input id="subjectAr" v-model="selected.subject.ar" class="input" dir="rtl">
        </AreneField>
      </div>

      <div class="two">
        <AreneField :label="$t('admin.bodyFr')" for="bodyFr" required>
          <textarea id="bodyFr" v-model="selected.body.fr" class="textarea" required />
        </AreneField>
        <AreneField :label="$t('admin.bodyAr')" for="bodyAr">
          <textarea id="bodyAr" v-model="selected.body.ar" class="textarea" dir="rtl" />
        </AreneField>
      </div>

      <button class="btn btn--primary" :disabled="pending" @click="saveTemplate">
        {{ $t('admin.saveTemplate') }}
      </button>
    </aside>

    <section class="stack">
      <h2>{{ $t('admin.broadcast') }}</h2>
      <form class="card stack" @submit.prevent="sendBroadcast">
        <div class="cluster">
          <button
            v-for="channel in ['email', 'whatsapp']"
            :key="channel"
            type="button"
            class="btn btn--sm"
            :class="broadcast.channels.includes(channel) ? 'btn--ink' : 'btn--ghost'"
            @click="toggleChannel(channel)"
          >
            {{ channel }}
          </button>
        </div>

        <div class="three">
          <AreneField :label="$t('registrations.staff.filterStatus')" for="bStatus">
            <select id="bStatus" v-model="broadcast.status" class="select">
              <option value="">{{ $t('common.all') }}</option>
              <option v-for="status in ['approved', 'scheduled', 'checked_in', 'qualified']" :key="status" :value="status">
                {{ $t(`status.${status}`) }}
              </option>
            </select>
          </AreneField>
          <AreneField :label="$t('registrations.staff.filterRole')" for="bRole">
            <select id="bRole" v-model="broadcast.role" class="select">
              <option value="">{{ $t('common.all') }}</option>
              <option value="striker">{{ $t('role.striker') }}</option>
              <option value="defender">{{ $t('role.defender') }}</option>
            </select>
          </AreneField>
          <AreneField :label="$t('registrations.staff.filterCategory')" for="bCategory">
            <select id="bCategory" v-model="broadcast.ageCategory" class="select">
              <option value="">{{ $t('common.all') }}</option>
              <option value="lycee">{{ $t('category.lycee') }}</option>
              <option value="universite">{{ $t('category.universite') }}</option>
            </select>
          </AreneField>
        </div>

        <div class="two">
          <AreneField :label="$t('admin.subjectFr')" for="bSubjectFr" required>
            <input id="bSubjectFr" v-model="broadcast.subjectFr" class="input" required>
          </AreneField>
          <AreneField :label="$t('admin.subjectAr')" for="bSubjectAr">
            <input id="bSubjectAr" v-model="broadcast.subjectAr" class="input" dir="rtl">
          </AreneField>
        </div>

        <div class="two">
          <AreneField :label="$t('admin.bodyFr')" for="bBodyFr" required>
            <textarea id="bBodyFr" v-model="broadcast.bodyFr" class="textarea" required />
          </AreneField>
          <AreneField :label="$t('admin.bodyAr')" for="bBodyAr">
            <textarea id="bBodyAr" v-model="broadcast.bodyAr" class="textarea" dir="rtl" />
          </AreneField>
        </div>

        <button class="btn btn--primary" type="submit" :disabled="pending || !broadcast.channels.length">
          {{ $t('admin.broadcast') }}
        </button>
      </form>
    </section>

    <section class="stack">
      <h2>{{ $t('admin.journal') }}</h2>
      <div v-if="journal.length" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t('admin.template') }}</th>
              <th>{{ $t('admin.channel') }}</th>
              <th>{{ $t('admin.recipient') }}</th>
              <th>{{ $t('admin.status') }}</th>
              <th>{{ $t('admin.sentAt') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in journal" :key="row._id">
              <td>{{ row.template }}</td>
              <td>{{ row.channel }}</td>
              <td class="numeric">{{ row.to }}</td>
              <td>
                <span
                  class="badge"
                  :class="row.status === 'failed' ? 'badge--danger' : row.status === 'queued' ? 'badge--warning' : 'badge--pitch'"
                >
                  {{ $t(`admin.notificationStatus.${row.status}`) }}
                </span>
              </td>
              <td class="numeric">{{ row.sentAt ? date(row.sentAt, true) : '—' }}</td>
              <td>
                <button v-if="row.status === 'failed'" class="btn btn--quiet btn--sm" @click="retry(row)">
                  {{ $t('admin.retry') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AreneEmpty v-else :title="$t('admin.journal')" />
    </section>
  </div>
</template>

<style scoped lang="scss">
.editor {
  border-color: var(--color-gold);
}

.two {
  display: grid;
  gap: var(--space-3);

  @include from(sm) {
    grid-template-columns: 1fr 1fr;
  }
}

.three {
  display: grid;
  gap: var(--space-3);

  @include from(md) {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
