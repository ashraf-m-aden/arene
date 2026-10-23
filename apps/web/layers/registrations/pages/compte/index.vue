<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const store = useRegistrationStore()
const config = useRuntimeConfig()
const { text, date, statusLabel, statusTone, roleLabel, categoryLabel } = useFormat()

useNoIndex(t('registrations.account.title'))

const pending = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    await store.fetchMine()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
})

/** Le badge est un PDF servi par l'API : on l'ouvre avec le jeton courant. */
async function openBadge(id: string) {
  const response = await fetch(`${config.public.apiBase}/registrations/${id}/badge`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    credentials: 'include'
  })
  if (!response.ok) {
    error.value = t('common.error')
    return
  }
  const url = URL.createObjectURL(await response.blob())
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

async function downloadData(id: string) {
  const response = await fetch(`${config.public.apiBase}/registrations/${id}/data`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    credentials: 'include'
  })
  if (!response.ok) return
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `dossier-${id.slice(-6)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

</script>

<template>
  <section class="section">
    <div class="container">
      <div class="spread">
        <AreneSectionHead
          :eyebrow="auth.user?.name"
          :title="$t('registrations.account.title')"
          :lead="$t('registrations.account.lead')"
        />
        <div class="cluster">
          <button class="btn btn--ghost btn--sm" @click="auth.logout()">
            {{ $t('nav.logout') }}
          </button>
        </div>
      </div>

      <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
      <AreneSpinner v-if="pending" />

      <div v-else-if="store.mine.length" class="grid grid--2">
        <article v-for="file in store.mine" :key="file._id" class="card">
          <div class="cluster">
            <span class="badge" :class="statusTone(file.status)">{{ statusLabel(file.status) }}</span>
            <span v-if="file.role" class="badge">{{ roleLabel(file.role) }}</span>
            <span v-if="file.ageCategory" class="badge">{{ categoryLabel(file.ageCategory) }}</span>
          </div>

          <h2 class="card__title">
            {{ file.player?.name }}
          </h2>
          <p class="muted numeric">
            {{ $t('registrations.account.fileNumber') }}
            {{ String(file._id).slice(-6).toUpperCase() }}
          </p>

          <p v-if="file.schoolId" class="muted">{{ text(file.schoolId.name) }}</p>

          <!-- Le candidat ne connaît que la date et l'heure de son rendez-vous :
               ni le libellé du créneau, ni l'organisation interne qui le sous-tend. -->
          <div v-if="file.slotId" class="slot">
            <strong>{{ $t('registrations.account.slot') }}</strong>
            <span class="numeric">{{ date(file.slotId.startsAt, true) }}</span>
          </div>
          <p v-else-if="file.status === 'approved'" class="muted">
            {{ $t('registrations.account.noSlot') }}
          </p>

          <p v-if="file.bibNumber" class="numeric">
            {{ $t('registrations.account.bib') }} <strong>#{{ file.bibNumber }}</strong>
          </p>

          <AreneNotice v-if="file.reviewNotes" tone="info" :title="$t('registrations.account.reviewNotes')">
            {{ file.reviewNotes }}
          </AreneNotice>

          <ul v-if="file.flags?.length" class="flags">
            <li v-for="flag in file.flags" :key="flag.code" class="badge badge--warning">
              {{ flag.code }}
            </li>
          </ul>

          <div class="cluster card__actions">
            <button
              v-if="['approved', 'scheduled', 'checked_in'].includes(file.status)"
              class="btn btn--pitch btn--sm"
              @click="openBadge(file._id)"
            >
              {{ $t('registrations.account.badge') }}
            </button>
            <NuxtLink
              v-if="store.isEditableStatus(file.status)"
              :to="localePath('/inscription/formulaire')"
              class="btn btn--primary btn--sm"
            >
              {{
                store.statusReopens(file.status)
                  ? $t('registrations.fixCta')
                  : $t('registrations.continueCta')
              }}
            </NuxtLink>
            <button class="btn btn--quiet btn--sm" @click="downloadData(file._id)">
              {{ $t('registrations.account.download') }}
            </button>
          </div>
        </article>
      </div>

      <AreneEmpty v-else :title="$t('registrations.account.noFiles')">
        <NuxtLink :to="localePath('/inscription')" class="btn btn--primary btn--sm">
          {{ $t('registrations.startCta') }}
        </NuxtLink>
      </AreneEmpty>
    </div>
  </section>
</template>

<style scoped lang="scss">
.slot {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--color-surface-2);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.flags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.card__actions {
  margin-block-start: auto;
  padding-block-start: var(--space-3);
  border-block-start: 1px solid var(--color-line);
}
</style>
