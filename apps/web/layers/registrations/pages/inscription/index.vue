<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const { text, money, date } = useFormat()
const registration = useRegistrationStore()

const { data: edition } = await useAsyncData('inscription-edition', () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any }>('/editions/current').then((r) => r.data).catch(() => null)
})

const { state: windowState, isOpen } = useEditionWindow(edition)

useSeoPage({
  title: `${t('registrations.pitchTitle')} — L'Arène`,
  description: t('registrations.pitchLead'),
  jsonLd: breadcrumbLd([
    { name: "L'Arène", path: '/' },
    { name: t('registrations.pitchTitle'), path: '/inscription' }
  ])
})

/**
 * Ce qu'on propose au candidat depend du dossier que l'API connait, pas du
 * brouillon garde par le navigateur : sur un autre appareil, ou apres un
 * vidage du stockage, `hasDraft` repond faux alors que le dossier existe, et
 * on invitait a « commencer » une candidature deja envoyee.
 */
const myRegistration = ref<any>(null)
const checking = ref(false)

onMounted(async () => {
  if (!auth.isLoggedIn || !edition.value?._id) return
  checking.value = true
  try {
    myRegistration.value = await registration.findForEdition(edition.value._id)
  } catch {
    // Pas de dossier connu : on retombe sur le brouillon local, au pire on
    // propose « commencer » et `createDraft` rendra l'existant de toute facon.
    myRegistration.value = null
  } finally {
    checking.value = false
  }
})

const canEdit = computed(() => registration.isEditableStatus(myRegistration.value?.status))

/** Dossier envoye : le formulaire est clos, on renvoie vers l'espace candidat. */
const isLocked = computed(() => Boolean(myRegistration.value) && !canEdit.value)

const ctaLabel = computed(() => {
  if (isLocked.value) return t('registrations.trackCta')
  if (myRegistration.value || registration.hasDraft) return t('registrations.continueCta')
  return t('registrations.startCta')
})

const ctaTarget = computed(() => (isLocked.value ? '/compte' : '/inscription/formulaire'))

const needs = ['needPhoto', 'needBulletin', 'needAverage', 'needPhone']
</script>

<template>
  <div>
    <section class="section section--ink">
      <div class="container container--narrow stack">
        <p class="eyebrow">{{ edition ? text(edition.title) : $t('nav.register') }}</p>
        <h1>{{ $t('registrations.pitchTitle') }}</h1>
        <p class="lead">{{ $t('registrations.pitchLead') }}</p>

        <div v-if="isOpen" class="cluster">
          <NuxtLink
            v-if="auth.isLoggedIn"
            :to="localePath(ctaTarget)"
            class="btn btn--primary btn--lg"
            :class="{ 'is-busy': checking }"
          >
            {{ ctaLabel }}
          </NuxtLink>
          <template v-else>
            <NuxtLink :to="localePath('/creer-compte')" class="btn btn--primary btn--lg">
              {{ $t('auth.createAccount') }}
            </NuxtLink>
            <NuxtLink :to="localePath('/connexion')" class="btn btn--ghost btn--lg">
              {{ $t('nav.login') }}
            </NuxtLink>
          </template>
        </div>

        <!-- « Pas encore ouvert » et « definitivement ferme » n'appellent pas la
             meme reaction : on ne renvoie pas un candidat qui est juste en avance. -->
        <AreneNotice v-else-if="windowState === 'soon'" tone="warning">
          {{ $t('registrations.notYetOpen') }}
        </AreneNotice>
        <AreneNotice v-else tone="danger">{{ $t('registrations.closed') }}</AreneNotice>
        <p v-if="!auth.isLoggedIn && isOpen" class="muted">{{ $t('registrations.loginFirst') }}</p>
      </div>
    </section>

    <section class="section">
      <div class="container grid grid--sidebar">
        <div class="stack">
          <h2>{{ $t('registrations.need') }}</h2>
          <ul class="needs">
            <li v-for="need in needs" :key="need">
              <span aria-hidden="true">✓</span>
              {{ $t(`registrations.${need}`) }}
            </li>
          </ul>

          <h2>{{ $t('home.howTitle') }}</h2>
          <ol class="stack">
            <li v-for="step in [1, 2, 3, 4]" :key="step">
              <strong>{{ $t(`home.step${step}`) }}</strong>
              <p class="muted">{{ $t(`home.step${step}Text`) }}</p>
            </li>
          </ol>
        </div>

        <aside v-if="edition" class="card card--flat stack">
          <h2 class="card__title">{{ text(edition.title) }}</h2>
          <p class="numeric">
            {{ date(edition.registrationOpensAt) }} → {{ date(edition.registrationClosesAt) }}
          </p>
          <hr class="divider">
          <p>
            <strong class="numeric">{{ money(edition.fee) }}</strong><br>
            <span class="muted">{{ $t('registrations.feeNotice') }}</span>
          </p>
          <p>
            <strong class="numeric">{{ edition.rules?.gradeThreshold }}/20</strong><br>
            <span class="muted">{{ $t('editions.threshold') }}</span>
          </p>
          <NuxtLink :to="localePath(`/editions/${edition.slug}`)" class="btn btn--ghost btn--sm">
            {{ $t('editions.seeEdition') }}
          </NuxtLink>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.needs {
  display: grid;
  gap: var(--space-3);

  li {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-4);
    background: var(--color-paper);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
  }

  span {
    color: var(--color-pitch);
    font-weight: 700;
  }
}

ol.stack li {
  padding-inline-start: var(--space-4);
  border-inline-start: 2px solid var(--color-gold);
}
</style>
