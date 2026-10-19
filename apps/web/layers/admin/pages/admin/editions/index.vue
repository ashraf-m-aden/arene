<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'admin' })

const { t } = useI18n()
const localePath = useLocalePath()
const editions = useEditionsStore()
const { text, date } = useFormat()

useNoIndex(t('admin.editionsTitle'))

const items = ref<any[]>([])
const pending = ref(true)
const error = ref('')
const feedback = ref('')
const showCreate = ref(false)
const slugTouched = ref(false)

const form = reactive({
  slug: '',
  titleFr: '',
  titleAr: '',
  descriptionFr: '',
  descriptionAr: '',
  season: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
  fee: 2000,
  gradeThreshold: 12,
  venueName: '',
  venueCity: 'Djibouti',
  capacity: {
    lycee: { striker: 50, defender: 50 },
    universite: { striker: 50, defender: 50 }
  }
})

function stripDiacritics(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code < 0x0300 || code > 0x036f
    })
    .join('')
}

function slugify(value: string) {
  return stripDiacritics(value.normalize('NFD'))
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70)
}

watch(
  () => form.titleFr,
  (value) => {
    if (!slugTouched.value) form.slug = slugify(value)
  }
)

async function load() {
  pending.value = true
  error.value = ''
  try {
    items.value = await editions.fetchList()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

onMounted(load)

async function createEdition() {
  pending.value = true
  error.value = ''
  try {
    const payload = {
      slug: form.slug,
      title: { fr: form.titleFr, ar: form.titleAr },
      description: { fr: form.descriptionFr, ar: form.descriptionAr },
      season: form.season || undefined,
      registrationOpensAt: form.registrationOpensAt,
      registrationClosesAt: form.registrationClosesAt,
      capacity: form.capacity,
      fee: form.fee,
      rules: { gradeThreshold: form.gradeThreshold },
      venue: { name: form.venueName, city: form.venueCity }
    }
    const created = await editions.createEdition(payload)
    feedback.value = t('admin.editionCreated')
    showCreate.value = false
    slugTouched.value = false
    form.slug = ''
    form.titleFr = ''
    form.titleAr = ''
    form.descriptionFr = ''
    form.descriptionAr = ''
    form.season = ''
    form.registrationOpensAt = ''
    form.registrationClosesAt = ''
    await load()
    await navigateTo(localePath(`/admin/editions/${created.slug}`))
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="stack">
    <div class="spread">
      <div>
        <h1>{{ $t('admin.editionsTitle') }}</h1>
        <p class="muted">{{ $t('admin.editionsLead') }}</p>
      </div>
      <button class="btn btn--primary" @click="showCreate = !showCreate">
        {{ showCreate ? $t('common.close') : $t('admin.newEdition') }}
      </button>
    </div>

    <GmNotice v-if="error" tone="danger">{{ error }}</GmNotice>
    <GmNotice v-if="feedback" tone="success">{{ feedback }}</GmNotice>

    <form v-if="showCreate" class="card stack create-form" @submit.prevent="createEdition">
      <div class="two">
        <GmField :label="$t('editions.titleFr')" for="titleFr" required>
          <input id="titleFr" v-model="form.titleFr" class="input" required>
        </GmField>
        <GmField :label="$t('editions.titleAr')" for="titleAr">
          <input id="titleAr" v-model="form.titleAr" class="input" dir="rtl">
        </GmField>
      </div>

      <GmField :label="$t('admin.slug')" :hint="$t('admin.slugHint')" for="slug" required>
        <input
          id="slug"
          v-model="form.slug"
          class="input numeric"
          required
          @input="slugTouched = true"
        >
      </GmField>

      <div class="two">
        <GmField :label="$t('editions.descriptionFr')" for="descFr">
          <textarea id="descFr" v-model="form.descriptionFr" class="textarea" rows="3" />
        </GmField>
        <GmField :label="$t('editions.descriptionAr')" for="descAr">
          <textarea id="descAr" v-model="form.descriptionAr" class="textarea" rows="3" dir="rtl" />
        </GmField>
      </div>

      <div class="two">
        <GmField :label="$t('admin.startsAt')" for="opensAt" required>
          <input
            id="opensAt"
            v-model="form.registrationOpensAt"
            class="input numeric"
            type="datetime-local"
            required
          >
        </GmField>
        <GmField :label="$t('admin.endsAt')" for="closesAt" required>
          <input
            id="closesAt"
            v-model="form.registrationClosesAt"
            class="input numeric"
            type="datetime-local"
            required
          >
        </GmField>
      </div>

      <div class="two">
        <GmField :label="$t('editions.season')" for="season">
          <input id="season" v-model="form.season" class="input" placeholder="2026">
        </GmField>
        <GmField :label="$t('editions.fee')" for="fee" required>
          <input id="fee" v-model.number="form.fee" class="input numeric" type="number" min="0">
        </GmField>
      </div>

      <div class="two">
        <GmField :label="$t('admin.venueName')" for="venueName" required>
          <input id="venueName" v-model="form.venueName" class="input" required>
        </GmField>
        <GmField :label="$t('admin.venueCity')" for="venueCity">
          <input id="venueCity" v-model="form.venueCity" class="input">
        </GmField>
      </div>

      <fieldset class="quotas">
        <legend>{{ $t('editions.capacity') }}</legend>
        <div class="quotas__grid">
          <GmField :label="`${$t('category.lycee')} · ${$t('role.striker')}`" for="qls">
            <input id="qls" v-model.number="form.capacity.lycee.striker" class="input numeric" type="number" min="0">
          </GmField>
          <GmField :label="`${$t('category.lycee')} · ${$t('role.defender')}`" for="qld">
            <input id="qld" v-model.number="form.capacity.lycee.defender" class="input numeric" type="number" min="0">
          </GmField>
          <GmField :label="`${$t('category.universite')} · ${$t('role.striker')}`" for="qus">
            <input id="qus" v-model.number="form.capacity.universite.striker" class="input numeric" type="number" min="0">
          </GmField>
          <GmField :label="`${$t('category.universite')} · ${$t('role.defender')}`" for="qud">
            <input id="qud" v-model.number="form.capacity.universite.defender" class="input numeric" type="number" min="0">
          </GmField>
        </div>
      </fieldset>

      <GmField :label="$t('admin.gradeThreshold')" for="threshold">
        <input id="threshold" v-model.number="form.gradeThreshold" class="input numeric" type="number" min="0" max="20" step="0.5">
      </GmField>

      <button class="btn btn--ink" type="submit" :disabled="pending">
        {{ $t('admin.createEdition') }}
      </button>
    </form>

    <GmSpinner v-if="pending && !items.length" />
    <GmEmpty v-else-if="!items.length" :title="$t('admin.noEditions')" />

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('editions.titleFr') }}</th>
            <th>{{ $t('admin.status') }}</th>
            <th>{{ $t('editions.season') }}</th>
            <th>{{ $t('editions.registrationWindow') }}</th>
            <th class="numeric">{{ $t('editions.capacity') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="edition in items" :key="edition._id">
            <td>
              <strong>{{ text(edition.title) }}</strong>
              <span class="muted">· {{ edition.slug }}</span>
            </td>
            <td><span class="badge badge--gold">{{ $t(`editionStatus.${edition.status}`) }}</span></td>
            <td>{{ edition.season || '—' }}</td>
            <td class="numeric">
              {{ date(edition.registrationOpensAt) }} → {{ date(edition.registrationClosesAt) }}
            </td>
            <td class="numeric">
              {{
                (edition.capacity?.lycee?.striker ?? 0) +
                (edition.capacity?.lycee?.defender ?? 0) +
                (edition.capacity?.universite?.striker ?? 0) +
                (edition.capacity?.universite?.defender ?? 0)
              }}
            </td>
            <td>
              <NuxtLink :to="localePath(`/admin/editions/${edition.slug}`)" class="btn btn--quiet btn--sm">
                {{ $t('admin.openEdition') }}
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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

.create-form {
  border-color: var(--color-gold);
}

.quotas {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  padding: var(--space-4);

  legend {
    font-weight: 600;
    padding-inline: var(--space-2);
  }
}

.quotas__grid {
  display: grid;
  gap: var(--space-3);

  @include from(sm) {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
