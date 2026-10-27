<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const store = useRegistrationStore()
const config = useRuntimeConfig()
const { text, date, statusLabel, statusTone, roleLabel, categoryLabel, flagLabel } = useFormat()

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

          <!-- Le candidat ne connaît que la date et l'heure de ses rendez-vous :
               ni le libellé du créneau, ni l'organisation interne qui le sous-tend. -->
          <div v-if="file.slotId" class="slot">
            <strong>{{ $t('registrations.account.slot') }}</strong>
            <span class="numeric">{{ date(file.slotId.startsAt, true) }}</span>
          </div>
          <p v-else-if="file.status === 'approved'" class="muted">
            {{ $t('registrations.account.noSlot') }}
          </p>

          <!--
            La session de jeu est un second rendez-vous, une semaine après le
            premier : l'inscription s'y joue déjà faite, il n'y a plus ni contrat
            ni frais. L'afficher à part évite de laisser croire qu'il faut
            repasser par la caisse.
          -->
          <div v-if="file.sessionId" class="slot slot--session">
            <strong>{{ $t('registrations.account.session') }}</strong>
            <span class="numeric">{{ date(file.sessionId.startsAt, true) }}</span>
          </div>
          <p v-else-if="file.status === 'checked_in'" class="muted">
            {{ $t('registrations.account.noSession') }}
          </p>

          <p v-if="file.bibNumber" class="numeric">
            {{ $t('registrations.account.bib') }} <strong>#{{ file.bibNumber }}</strong>
          </p>

          <AreneNotice v-if="file.reviewNotes" tone="info" :title="$t('registrations.account.reviewNotes')">
            {{ file.reviewNotes }}
          </AreneNotice>

          <!-- Signalements des contrôles automatiques. Ils s'affichaient par leur
               code technique (« age_out_of_range ») : illisible, et inquiétant
               pour un candidat qui ne sait pas que le staff tranche. -->
          <AreneNotice
            v-if="file.flags?.length"
            tone="warning"
            :title="$t('registrations.account.flags')"
          >
            <ul class="flags">
              <li v-for="flag in file.flags" :key="flag.code">{{ flagLabel(flag) }}</li>
            </ul>
            <p class="muted">{{ $t('registrations.account.flagsNote') }}</p>
          </AreneNotice>

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

/* La session de jeu est le rendez-vous qui compte le jour venu : on la marque. */
.slot--session {
  border-inline-start: 3px solid var(--color-gold);
}

/** Signalements : des phrases, pas des pastilles — elles ne tiennent pas en un mot. */
.flags {
  margin: var(--space-2) 0 0;
  padding-inline-start: var(--space-5);
  /* Le reset efface les puces de tout `ul` porteur d'une classe : on les rend. */
  list-style: disc;
  font-size: var(--text-sm);

  li + li {
    margin-block-start: var(--space-1);
  }
}

.card__actions {
  margin-block-start: auto;
  padding-block-start: var(--space-3);
  border-block-start: 1px solid var(--color-line);
}
</style>
