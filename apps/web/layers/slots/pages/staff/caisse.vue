<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'staff' })

const { t } = useI18n()
const { $api } = useNuxtApp()
const editions = useEditionsStore()
const { date, money } = useFormat()

useNoIndex(t('cash.title'))

const slots = ref<any[]>([])
const slotId = ref('')
const report = ref<any>(null)
const pending = ref(false)
const error = ref('')

onMounted(async () => {
  const current = await editions.fetchCurrent()
  // On encaisse au rendez-vous administratif, pas sur le terrain : une session
  // de jeu n'a pas de caisse, et l'API refuse d'en produire le récapitulatif.
  if (current?._id) {
    slots.value = await editions.fetchSlots(current._id, 'checkin').catch(() => [])
  }
})

watch(slotId, async (value) => {
  report.value = null
  if (!value) return
  pending.value = true
  error.value = ''
  try {
    const { data } = await $api.get<{ data: any }>(`/slots/${value}/cash-report`)
    report.value = data
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
})
</script>

<template>
  <div class="stack">
    <div>
      <h1>{{ $t('cash.title') }}</h1>
      <p class="muted">{{ $t('cash.lead') }}</p>
    </div>

    <div class="card card--flat">
      <AreneField :label="$t('checkin.slot')" for="slot">
        <select id="slot" v-model="slotId" class="select">
          <option value="">—</option>
          <option v-for="slot in slots" :key="slot._id" :value="slot._id">
            {{ slot.label }} — {{ date(slot.startsAt) }}
          </option>
        </select>
      </AreneField>
    </div>

    <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
    <AreneSpinner v-if="pending" />

    <template v-if="report">
      <div class="grid grid--3">
        <div class="stat">
          <span class="stat__value numeric">{{ report.totals.paid }}</span>
          <span class="stat__label">{{ $t('cash.paidCount') }}</span>
        </div>
        <div class="stat">
          <span class="stat__value numeric">{{ report.totals.exempt }}</span>
          <span class="stat__label">{{ $t('cash.exemptCount') }}</span>
        </div>
        <div class="stat">
          <span class="stat__value numeric">{{ money(report.totals.expected) }}</span>
          <span class="stat__label">{{ $t('cash.expected') }}</span>
        </div>
      </div>

      <div v-if="report.byStaff?.length" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t('cash.staffMember') }}</th>
              <th class="numeric">{{ $t('cash.paidCount') }}</th>
              <th class="numeric">{{ $t('cash.exemptCount') }}</th>
              <th class="numeric">{{ $t('cash.expected') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in report.byStaff" :key="row.staffId">
              <td class="numeric">{{ String(row.staffId).slice(-6) }}</td>
              <td class="numeric">{{ row.paid }}</td>
              <td class="numeric">{{ row.exempt }}</td>
              <td class="numeric"><strong>{{ money(row.amount) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <AreneEmpty v-else :title="$t('cash.empty')" />
    </template>
  </div>
</template>
