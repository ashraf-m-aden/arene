<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const store = useRegistrationStore()
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

const uploading = ref<'' | 'photo' | 'bulletin'>('')
const uploadError = ref('')
const submitError = ref('')
const submitted = ref(false)

onMounted(async () => {
  if (!edition.value?._id) return
  if (!store.draft.registrationId || store.draft.editionId !== edition.value._id) {
    await store.start(edition.value._id, locale.value as 'fr' | 'ar')
  }
})

/* ── Étape 1 : recherche d'établissement ─────────────────────────────── */
const schoolQuery = ref('')
const schoolResults = ref<any[]>([])
const schoolOther = ref(false)

let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(schoolQuery, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!value || value.length < 2) {
    schoolResults.value = []
    return
  }
  // Petite temporisation : on n'interroge l'API qu'une fois la frappe calmée.
  searchTimer = setTimeout(async () => {
    const { $api } = useNuxtApp()
    const { data } = await $api
      .get<{ data: any[] }>(`/schools?q=${encodeURIComponent(value)}&limit=8`)
      .catch(() => ({ data: [] as any[] }))
    schoolResults.value = data
  }, 300)
})

function chooseSchool(school: any) {
  store.draft.schoolId = school._id
  store.draft.schoolLabel = text(school.name)
  store.draft.newSchool = null
  store.draft.ageCategory = school.type
  schoolResults.value = []
  schoolQuery.value = text(school.name)
}

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
      store.draft.player.firstName &&
        store.draft.player.lastName &&
        store.draft.player.birthDate &&
        store.draft.player.gender &&
        (store.draft.schoolId || store.draft.newSchool) &&
        store.draft.role
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

      <template v-else>
        <AreneSectionHead
          :eyebrow="text(edition.title)"
          :title="$t(`registrations.steps.${stepKeys[step - 1]}`)"
        />

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
            <div class="two">
              <AreneField :label="$t('registrations.player.firstName')" for="firstName" required>
                <input id="firstName" v-model="store.draft.player.firstName" class="input" required>
              </AreneField>
              <AreneField :label="$t('registrations.player.lastName')" for="lastName" required>
                <input id="lastName" v-model="store.draft.player.lastName" class="input" required>
              </AreneField>
            </div>

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
              :hint="$t('registrations.player.schoolSearch')"
              for="school"
            >
              <input
                id="school"
                v-model="schoolQuery"
                class="input"
                type="search"
                autocomplete="off"
                :disabled="schoolOther"
              >
              <ul v-if="schoolResults.length" class="suggestions">
                <li v-for="school in schoolResults" :key="school._id">
                  <button type="button" @click="chooseSchool(school)">
                    {{ text(school.name) }}
                    <span class="badge">{{ $t(`category.${school.type}`) }}</span>
                  </button>
                </li>
              </ul>
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

            <AreneField
              :label="$t('registrations.player.photo')"
              :hint="$t('registrations.player.photoHint')"
              for="photo"
            >
              <label class="dropzone" :class="{ 'dropzone--filled': store.draft.player.photoFileId }">
                <input id="photo" type="file" accept="image/*" hidden @change="onFile($event, 'photo')">
                <strong>{{
                  store.draft.player.photoFileId
                    ? $t('registrations.grades.bulletinReady')
                    : $t('registrations.grades.bulletinChoose')
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
              <input v-model="store.draft.consents.imageRights" type="checkbox">
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

            <AreneNotice v-if="!store.draft.consents.imageRights">
              {{ $t('registrations.consents.imageNotice') }}
            </AreneNotice>
          </template>

          <!-- Étape 4 : récapitulatif -->
          <template v-else>
            <h2>{{ $t('registrations.review.title') }}</h2>
            <dl class="recap">
              <div>
                <dt>{{ $t('registrations.player.firstName') }}</dt>
                <dd>{{ store.draft.player.firstName }} {{ store.draft.player.lastName }}</dd>
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
              {{ $t('registrations.review.missing', { fields: store.missingFields.join(', ') }) }}
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

.suggestions {
  display: grid;
  gap: 2px;
  margin-block-start: var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  overflow: hidden;

  button {
    inline-size: 100%;
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    text-align: start;
    background: var(--color-paper);

    &:hover {
      background: var(--color-surface-2);
    }
  }
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
