<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const store = useRegistrationStore()
const auth = useAuthStore()
const { text, money } = useFormat()

useNoIndex(t('registrations.pitchTitle'))

const { data: edition } = await useAsyncData('form-edition', () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any }>('/editions/current').then((r) => r.data).catch(() => null)
})

const step = computed({
  get: () => store.draft.step,
  set: (value) => {
    store.draft.step = value
  }
})

/**
 * Les champs manquants etaient listes par leur cle technique
 * (« consents.imageRights »). Depuis que l'autorisation d'image conditionne
 * la participation, cet avis s'affiche souvent : il doit se lire.
 */
const missingLabels = computed(() =>
  store.missingFields.map((key) => t(`registrations.missing.${key}`)).join(', ')
)

const uploading = ref<'' | 'photo' | 'bulletin'>('')
const uploadError = ref('')
const submitError = ref('')
const submitted = ref(false)

/*
 * Apercu du portrait. Il ne sert pas a decorer : c'est cette image que le staff
 * verra a l'ecran en scannant le badge, et le candidat doit pouvoir constater
 * qu'elle est nette et de face avant d'envoyer son dossier.
 *
 * Deux sources selon le moment. Juste apres le choix du fichier, l'image locale
 * suffit et s'affiche sans reseau. A la reprise d'un dossier, le fichier n'est
 * plus la : on redescend la vignette depuis l'API.
 */
const photoPreview = ref('')

function showPreview(url: string) {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  photoPreview.value = url
}

async function loadPhotoPreview() {
  const fileId = store.draft.player.photoFileId
  if (!import.meta.client || !fileId || photoPreview.value) return
  const { objectUrlFor } = useFiles()
  // Vignette absente ou illisible : on laisse la zone de depot, sans erreur.
  await objectUrlFor(fileId, 'thumb').then(showPreview).catch(() => null)
}

watch(() => store.draft.player.photoFileId, loadPhotoPreview)
onMounted(loadPhotoPreview)
onBeforeUnmount(() => {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
})

onMounted(async () => {
  if (!edition.value?._id) return
  if (!store.draft.registrationId || store.draft.editionId !== edition.value._id) {
    await store.start(edition.value._id, locale.value as 'fr' | 'ar')
  }
})

/* ── Étape 1 : choix de l'établissement ──────────────────────────────── */
const schools = ref<any[]>([])
const schoolOther = ref(false)

/**
 * Le référentiel entier est chargé une fois : il tient en quelques dizaines
 * d'entrées. Une liste déroulante montre d'emblée ce qui existe, là où une
 * recherche libre obligeait à deviner le nom avant de voir la moindre
 * proposition — et poussait à cocher « autre établissement » à tort.
 */
onMounted(async () => {
  const { $api } = useNuxtApp()
  const { data } = await $api
    .get<{ data: any[] }>('/schools?limit=100')
    .catch(() => ({ data: [] as any[] }))
  schools.value = data
})

/**
 * Le dossier ne stocke que l'identifiant de l'établissement ; son nom se lit
 * dans le référentiel. À la reprise d'un dossier existant, il faut donc le
 * retrouver une fois la liste chargée, sinon le récapitulatif reste vide.
 */
watch(
  [schools, () => store.draft.schoolId],
  ([list, schoolId]) => {
    if (!schoolId || store.draft.schoolLabel) return
    const school = list.find((row: any) => String(row._id) === String(schoolId))
    if (school) store.draft.schoolLabel = text(school.name)
  },
  { immediate: true }
)

/** Groupées par type, pour que le candidat trouve sa catégorie d'un coup d'œil. */
const schoolGroups = computed(() => {
  const collator = new Intl.Collator('fr', { sensitivity: 'base' })
  const byType = (type: string) =>
    schools.value
      .filter((school) => school.type === type)
      .sort((a, b) => collator.compare(text(a.name), text(b.name)))
  return [
    { type: 'lycee', items: byType('lycee') },
    { type: 'universite', items: byType('universite') }
  ].filter((group) => group.items.length)
})

/** Le `select` porte l'identifiant ; le reste du brouillon en découle. */
const selectedSchoolId = computed({
  get: () => store.draft.schoolId || '',
  set: (id: string) => {
    const school = schools.value.find((row) => String(row._id) === String(id))
    if (!school) {
      store.draft.schoolId = null
      store.draft.schoolLabel = ''
      return
    }
    store.draft.schoolId = school._id
    store.draft.schoolLabel = text(school.name)
    store.draft.newSchool = null
    // La catégorie d'âge suit l'établissement : lycée ou université.
    store.draft.ageCategory = school.type
  }
})

const otherSchool = reactive({ name: '', type: 'lycee' as 'lycee' | 'universite' })

watch(
  () => [schoolOther.value, otherSchool.name, otherSchool.type],
  () => {
    if (!schoolOther.value || !otherSchool.name) return
    store.draft.schoolId = null
    store.draft.newSchool = {
      name: { fr: otherSchool.name, ar: '' },
      type: otherSchool.type,
      city: 'Djibouti'
    }
    store.draft.ageCategory = otherSchool.type
  }
)

/* ── Étape 2 : fichiers ──────────────────────────────────────────────── */
async function onFile(event: Event, kind: 'bulletin' | 'photo') {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = kind
  uploadError.value = ''
  try {
    await store.uploadFile(file, kind)
    if (kind === 'photo') showPreview(URL.createObjectURL(file))
  } catch (error: any) {
    uploadError.value = error.message
  } finally {
    uploading.value = ''
  }
}

const belowThreshold = computed(
  () =>
    store.draft.grades.average !== null &&
    edition.value?.rules?.gradeThreshold &&
    store.draft.grades.average < edition.value.rules.gradeThreshold
)

/* ── Navigation entre étapes ─────────────────────────────────────────── */
const stepKeys = ['player', 'grades', 'consents', 'review'] as const

const canContinue = computed(() => {
  if (step.value === 1) {
    return Boolean(
      store.draft.player.birthDate &&
        store.draft.player.gender &&
        (store.draft.schoolId || store.draft.newSchool) &&
        store.draft.role &&
        // Le portrait conditionne le controle d'identite sur place.
        store.draft.player.photoFileId
    )
  }
  if (step.value === 2) {
    return store.draft.grades.average !== null && Boolean(store.draft.grades.bulletinFileId)
  }
  if (step.value === 3) {
    return Boolean(store.draft.consents.participation && store.draft.consents.bulletinAuthenticity)
  }
  return true
})

async function next() {
  if (step.value < 4) {
    await store.saveStep(step.value as 1 | 2 | 3)
    return
  }
  submitError.value = ''
  try {
    await store.submit()
    submitted.value = true
  } catch (error: any) {
    submitError.value = error.message
  }
}

function back() {
  if (step.value > 1) step.value = (step.value - 1) as 1 | 2 | 3
}
</script>

<template>
  <section class="section">
    <div class="container container--narrow">
      <template v-if="submitted">
        <AreneNotice tone="success" :title="$t('registrations.review.submitted')" />
        <div class="cluster form-done">
          <NuxtLink :to="localePath('/compte')" class="btn btn--primary">
            {{ $t('registrations.account.title') }}
          </NuxtLink>
        </div>
      </template>

      <template v-else-if="!edition || edition.status !== 'registration_open'">
        <AreneNotice tone="danger">{{ $t('registrations.closed') }}</AreneNotice>
      </template>

      <!-- Dossier deja envoye : l'API refuse toute modification. Sans cette
           garde on affichait un formulaire modifiable qui echouait a
           l'enregistrement, sur « Ce dossier n'est plus modifiable ». -->
      <template v-else-if="store.draft.registrationId && !store.canEdit">
        <AreneNotice tone="warning">{{ $t('registrations.lockedLead') }}</AreneNotice>
        <div class="cluster">
          <NuxtLink :to="localePath('/compte')" class="btn btn--primary">
            {{ $t('registrations.trackCta') }}
          </NuxtLink>
        </div>
      </template>

      <template v-else>
        <AreneSectionHead
          :eyebrow="text(edition.title)"
          :title="$t(`registrations.steps.${stepKeys[step - 1]}`)"
        />

        <!-- Le dossier a deja ete examine : la correction annule cet examen,
             le candidat doit le savoir avant de toucher a quoi que ce soit. -->
        <AreneNotice v-if="store.editReopens" tone="warning">
          {{ $t('registrations.reopenWarning') }}
        </AreneNotice>

        <ol class="steps" :aria-label="$t('registrations.pitchTitle')">
          <li
            v-for="(key, index) in stepKeys"
            :key="key"
            class="steps__item"
            :class="{
              'steps__item--active': step === index + 1,
              'steps__item--done': step > index + 1
            }"
          >
            {{ $t(`registrations.steps.${key}`) }}
          </li>
        </ol>

        <AreneNotice v-if="store.error" tone="danger">{{ store.error }}</AreneNotice>
        <AreneNotice v-if="uploadError" tone="danger">{{ uploadError }}</AreneNotice>

        <form class="card stack form" @submit.prevent="next">
          <!-- Étape 1 : le joueur -->
          <template v-if="step === 1">
            <!-- Le nom vient du compte : saisi une fois a l'inscription, il n'est
                 ni redemande ni modifiable. On le montre pour que le candidat
                 verifie sous quelle identite il postule. -->
            <AreneField :label="$t('registrations.player.name')" :hint="$t('registrations.player.nameLocked')">
              <p class="identity">{{ store.draft.player.name || auth.user?.name }}</p>
            </AreneField>

            <div class="two">
              <AreneField :label="$t('registrations.player.birthDate')" for="birthDate" required>
                <input
                  id="birthDate"
                  v-model="store.draft.player.birthDate"
                  class="input numeric"
                  type="date"
                  required
                >
              </AreneField>
              <AreneField :label="$t('registrations.player.gender')" for="gender" required>
                <select id="gender" v-model="store.draft.player.gender" class="select" required>
                  <option value="" disabled>—</option>
                  <option value="m">{{ $t('registrations.player.male') }}</option>
                  <option value="f">{{ $t('registrations.player.female') }}</option>
                </select>
              </AreneField>
            </div>

            <AreneField
              :label="$t('registrations.player.school')"
              :hint="$t('registrations.player.schoolPick')"
              for="school"
            >
              <select
                id="school"
                v-model="selectedSchoolId"
                class="select"
                :disabled="schoolOther"
              >
                <option value="">{{ $t('registrations.player.schoolChoose') }}</option>
                <optgroup
                  v-for="group in schoolGroups"
                  :key="group.type"
                  :label="$t(`category.${group.type}`)"
                >
                  <option v-for="school in group.items" :key="school._id" :value="school._id">
                    {{ text(school.name) }}
                  </option>
                </optgroup>
              </select>
            </AreneField>

            <label class="check" :class="{ 'check--checked': schoolOther }">
              <input v-model="schoolOther" type="checkbox">
              <span>{{ $t('registrations.player.schoolOther') }}</span>
            </label>

            <template v-if="schoolOther">
              <div class="two">
                <AreneField :label="$t('registrations.player.schoolOtherName')" for="otherName" required>
                  <input id="otherName" v-model="otherSchool.name" class="input" required>
                </AreneField>
                <AreneField :label="$t('registrations.player.schoolOtherType')" for="otherType" required>
                  <select id="otherType" v-model="otherSchool.type" class="select">
                    <option value="lycee">{{ $t('category.lycee') }}</option>
                    <option value="universite">{{ $t('category.universite') }}</option>
                  </select>
                </AreneField>
              </div>
              <p class="field__hint">{{ $t('registrations.player.schoolPending') }}</p>
            </template>

            <AreneField :label="$t('registrations.player.role')" required>
              <div class="choice-grid">
                <button
                  v-for="role in ['striker', 'defender']"
                  :key="role"
                  type="button"
                  class="choice"
                  :class="{ 'choice--active': store.draft.role === role }"
                  @click="store.draft.role = role as 'striker' | 'defender'"
                >
                  <strong>{{ $t(`role.${role}`) }}</strong>
                  <span>{{ $t(`registrations.player.${role}Hint`) }}</span>
                </button>
              </div>
            </AreneField>

            <!-- Photo du visage, distincte du bulletin scanné : c'est elle qui
                 s'affiche à l'écran du staff au scan du badge. `capture="user"`
                 ouvre directement la caméra frontale sur un téléphone. -->
            <AreneField
              :label="$t('registrations.player.photo')"
              :hint="$t('registrations.player.photoHint')"
              for="photo"
              required
            >
              <label
                class="dropzone portrait"
                :class="{ 'dropzone--filled': store.draft.player.photoFileId }"
              >
                <input
                  id="photo"
                  type="file"
                  accept="image/*"
                  capture="user"
                  hidden
                  @change="onFile($event, 'photo')"
                >
                <img
                  v-if="photoPreview"
                  :src="photoPreview"
                  :alt="$t('registrations.player.photoAlt')"
                  class="portrait__image"
                >
                <strong>{{
                  store.draft.player.photoFileId
                    ? $t('registrations.player.photoReplace')
                    : $t('registrations.player.photoChoose')
                }}</strong>
                <span v-if="uploading === 'photo'" class="muted">{{ $t('common.loading') }}</span>
              </label>
            </AreneField>

            <p v-if="store.draft.ageCategory" class="field__hint">
              {{
                $t('registrations.player.categoryComputed', {
                  category: $t(`category.${store.draft.ageCategory}`)
                })
              }}
            </p>
          </template>

          <!-- Étape 2 : les notes -->
          <template v-else-if="step === 2">
            <div class="two">
              <AreneField
                :label="$t('registrations.grades.average')"
                :hint="$t('registrations.grades.averageHint')"
                for="average"
                required
              >
                <input
                  id="average"
                  v-model.number="store.draft.grades.average"
                  class="input numeric"
                  type="number"
                  min="0"
                  max="20"
                  step="0.01"
                  inputmode="decimal"
                  required
                >
              </AreneField>
              <AreneField
                :label="$t('registrations.grades.term')"
                :hint="$t('registrations.grades.termHint')"
                for="term"
              >
                <input id="term" v-model="store.draft.grades.term" class="input">
              </AreneField>
            </div>

            <AreneNotice v-if="belowThreshold" tone="danger">
              {{ $t('registrations.grades.belowThreshold') }}
            </AreneNotice>

            <AreneField
              :label="$t('registrations.grades.bulletin')"
              :hint="$t('registrations.grades.bulletinHint')"
              for="bulletin"
              required
            >
              <label class="dropzone" :class="{ 'dropzone--filled': store.draft.grades.bulletinFileId }">
                <input
                  id="bulletin"
                  type="file"
                  accept="application/pdf,image/*"
                  hidden
                  @change="onFile($event, 'bulletin')"
                >
                <strong>{{
                  store.draft.grades.bulletinFileId
                    ? $t('registrations.grades.bulletinReady')
                    : $t('registrations.grades.bulletinChoose')
                }}</strong>
                <span v-if="store.draft.grades.bulletinName" class="muted">
                  {{ store.draft.grades.bulletinName }}
                </span>
                <span v-if="uploading === 'bulletin'" class="muted">{{ $t('common.loading') }}</span>
              </label>
            </AreneField>
          </template>

          <!-- Étape 3 : les autorisations -->
          <template v-else-if="step === 3">
            <label class="check" :class="{ 'check--checked': store.draft.consents.participation }">
              <input v-model="store.draft.consents.participation" type="checkbox" required>
              <span>{{ $t('registrations.consents.participation') }}</span>
            </label>

            <label class="check" :class="{ 'check--checked': store.draft.consents.imageRights }">
              <input v-model="store.draft.consents.imageRights" type="checkbox" required>
              <span>{{ $t('registrations.consents.imageRights') }}</span>
            </label>

            <label class="check" :class="{ 'check--checked': store.draft.consents.monetizedVideos }">
              <input v-model="store.draft.consents.monetizedVideos" type="checkbox">
              <span>{{ $t('registrations.consents.monetizedVideos') }}</span>
            </label>

            <label
              class="check"
              :class="{ 'check--checked': store.draft.consents.bulletinAuthenticity }"
            >
              <input v-model="store.draft.consents.bulletinAuthenticity" type="checkbox" required>
              <span>{{ $t('registrations.consents.bulletinAuthenticity') }}</span>
            </label>

            <AreneNotice v-if="!store.draft.consents.monetizedVideos" tone="info">
              {{ $t('registrations.consents.monetizedNotice') }}
            </AreneNotice>
          </template>

          <!-- Étape 4 : récapitulatif -->
          <template v-else>
            <h2>{{ $t('registrations.review.title') }}</h2>

            <figure v-if="photoPreview" class="recap__portrait">
              <img :src="photoPreview" :alt="$t('registrations.player.photoAlt')">
              <figcaption class="muted">{{ $t('registrations.player.photoRecap') }}</figcaption>
            </figure>

            <dl class="recap">
              <div>
                <dt>{{ $t('registrations.player.name') }}</dt>
                <dd>{{ store.draft.player.name || auth.user?.name }}</dd>
              </div>
              <div>
                <dt>{{ $t('registrations.player.birthDate') }}</dt>
                <dd class="numeric">{{ store.draft.player.birthDate }}</dd>
              </div>
              <div>
                <dt>{{ $t('registrations.player.school') }}</dt>
                <dd>{{ store.draft.schoolLabel || otherSchool.name }}</dd>
              </div>
              <div>
                <dt>{{ $t('registrations.player.role') }}</dt>
                <dd>{{ $t(`role.${store.draft.role}`) }}</dd>
              </div>
              <div v-if="store.draft.ageCategory">
                <dt>{{ $t('registrations.staff.filterCategory') }}</dt>
                <dd>{{ $t(`category.${store.draft.ageCategory}`) }}</dd>
              </div>
              <div>
                <dt>{{ $t('registrations.staff.declaredAverage') }}</dt>
                <dd class="numeric">{{ store.draft.grades.average }}/20</dd>
              </div>
            </dl>

            <AreneNotice tone="info">
              {{ $t('registrations.review.feeReminder', { amount: money(edition.fee) }) }}
            </AreneNotice>

            <AreneNotice v-if="store.missingFields.length" tone="danger">
              {{ $t('registrations.review.missing', { fields: missingLabels }) }}
            </AreneNotice>

            <AreneNotice v-if="submitError" tone="danger">{{ submitError }}</AreneNotice>
          </template>

          <div class="form__actions">
            <button v-if="step > 1" type="button" class="btn btn--ghost" @click="back">
              {{ $t('common.back') }}
            </button>
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="!canContinue || store.pending || (step === 4 && store.missingFields.length > 0)"
            >
              {{ step === 4 ? $t('registrations.review.submit') : $t('common.continue') }}
            </button>
          </div>
        </form>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.form {
  margin-block-start: var(--space-5);
}

.two {
  display: grid;
  gap: var(--space-4);

  @include from(sm) {
    grid-template-columns: 1fr 1fr;
  }
}

.form__actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
  margin-block-start: var(--space-4);
  padding-block-start: var(--space-4);
  border-block-start: 1px solid var(--color-line);
}

.form-done {
  margin-block-start: var(--space-5);
}

/** Portrait : l'aperçu prend la place du libellé, le bouton reste tapable. */
.portrait {
  padding: var(--space-4);
}

.portrait__image {
  inline-size: 8rem;
  block-size: 8rem;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-line);
}

.recap__portrait {
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  margin: 0;

  img {
    inline-size: 7rem;
    block-size: 7rem;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-line);
  }
}

/** Nom hérité du compte : affiché, jamais saisi. */
.identity {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
}

.recap {
  display: grid;
  gap: var(--space-3);

  > div {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    padding-block-end: var(--space-2);
    border-block-end: 1px dashed var(--color-line);
  }

  dt {
    color: var(--color-muted);
    font-size: var(--text-sm);
  }

  dd {
    margin: 0;
    font-weight: 600;
    text-align: end;
  }
}
</style>
