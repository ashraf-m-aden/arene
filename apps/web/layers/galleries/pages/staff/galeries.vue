<script setup lang="ts">
definePageMeta({ layout: 'backoffice', middleware: ['auth', 'role'], role: 'staff' })

const { t } = useI18n()
const { $api } = useNuxtApp()
const editions = useEditionsStore()
const { text } = useFormat()

useNoIndex(t('galleries.staff.title'))

const galleries = ref<any[]>([])
const selected = ref<any>(null)
const pending = ref(false)
const error = ref('')
const feedback = ref('')
const youtubeUrl = ref('')

const form = reactive({ slug: '', titleFr: '', titleAr: '' })

async function load() {
  const edition = await editions.fetchCurrent()
  if (!edition?._id) return
  pending.value = true
  try {
    const { data } = await $api.get<{ data: any[] }>(`/editions/${edition._id}/galleries`)
    galleries.value = data
    if (selected.value) {
      selected.value = data.find((gallery: any) => gallery._id === selected.value._id) ?? null
    }
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

onMounted(load)

async function create() {
  const edition = await editions.fetchCurrent()
  if (!edition?._id) return
  pending.value = true
  error.value = ''
  try {
    await $api.post('/galleries', {
      editionId: edition._id,
      slug: form.slug,
      title: { fr: form.titleFr, ar: form.titleAr }
    })
    feedback.value = t('galleries.staff.saved')
    form.slug = ''
    form.titleFr = ''
    form.titleAr = ''
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

/** Téléversement multiple : chaque photo est déclinée côté API (WebP, EXIF retiré). */
async function addPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length || !selected.value) return

  pending.value = true
  error.value = ''
  try {
    const body = new FormData()
    for (const file of files) body.append('files', file)
    const edition = await editions.fetchCurrent()
    const { data } = await $api.post<{ data: any[] }>(
      `/files/batch?kind=media&editionId=${edition?._id}`,
      body
    )
    await $api.post(`/galleries/${selected.value._id}/items`, {
      items: data.map((file: any) => ({ type: 'photo', fileId: file._id, featuredRegIds: [] }))
    })
    feedback.value = t('galleries.staff.saved')
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
    input.value = ''
  }
}

async function addVideo() {
  if (!selected.value || !youtubeUrl.value) return
  pending.value = true
  error.value = ''
  try {
    await $api.post(`/galleries/${selected.value._id}/items`, {
      items: [{ type: 'youtube', youtubeId: youtubeUrl.value, featuredRegIds: [] }]
    })
    youtubeUrl.value = ''
    feedback.value = t('galleries.staff.saved')
    await load()
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function removeItem(itemId: string) {
  if (!selected.value) return
  try {
    await $api.delete(`/galleries/${selected.value._id}/items/${itemId}`)
    await load()
  } catch (err: any) {
    error.value = err.message
  }
}

async function togglePublish(gallery: any) {
  try {
    await $api.post(`/galleries/${gallery._id}/publish`, { isPublished: !gallery.isPublished })
    await load()
  } catch (err: any) {
    error.value = err.message
  }
}
</script>

<template>
  <div class="stack">
    <div>
      <h1>{{ $t('galleries.staff.title') }}</h1>
      <p class="muted">{{ $t('galleries.staff.lead') }}</p>
    </div>

    <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
    <AreneNotice v-if="feedback" tone="success">{{ feedback }}</AreneNotice>

    <form class="card card--flat creator" @submit.prevent="create">
      <AreneField :label="$t('galleries.staff.titleFr')" for="titleFr" required>
        <input id="titleFr" v-model="form.titleFr" class="input" required>
      </AreneField>
      <AreneField :label="$t('galleries.staff.titleAr')" for="titleAr">
        <input id="titleAr" v-model="form.titleAr" class="input" dir="rtl">
      </AreneField>
      <AreneField :label="$t('galleries.staff.slug')" for="slug" required>
        <input id="slug" v-model="form.slug" class="input" pattern="[a-z0-9-]+" required>
      </AreneField>
      <button class="btn btn--primary" type="submit" :disabled="pending">
        {{ $t('galleries.staff.create') }}
      </button>
    </form>

    <div v-if="galleries.length" class="grid grid--2">
      <article
        v-for="gallery in galleries"
        :key="gallery._id"
        class="card"
        :class="{ 'card--selected': selected?._id === gallery._id }"
      >
        <div class="cluster">
          <span class="badge" :class="gallery.isPublished ? 'badge--pitch' : 'badge--warning'">
            {{ gallery.isPublished ? $t('galleries.staff.published') : $t('galleries.staff.unpublished') }}
          </span>
          <span class="badge numeric">{{ gallery.items?.length ?? 0 }}</span>
        </div>
        <h2 class="card__title">{{ text(gallery.title) }}</h2>
        <div class="cluster">
          <button class="btn btn--ink btn--sm" @click="selected = gallery">
            {{ $t('common.continue') }}
          </button>
          <button class="btn btn--ghost btn--sm" @click="togglePublish(gallery)">
            {{ gallery.isPublished ? $t('galleries.staff.unpublish') : $t('galleries.staff.publish') }}
          </button>
        </div>
      </article>
    </div>

    <AreneEmpty v-else-if="!pending" :title="$t('galleries.empty')" />

    <aside v-if="selected" class="card editor">
      <div class="spread">
        <h2 class="card__title">{{ text(selected.title) }}</h2>
        <button class="btn btn--quiet btn--sm" @click="selected = null">{{ $t('common.close') }}</button>
      </div>

      <AreneField :label="$t('galleries.staff.addPhotos')" for="photos">
        <label class="dropzone">
          <input id="photos" type="file" accept="image/*" multiple hidden @change="addPhotos">
          <strong>{{ $t('galleries.staff.addPhotos') }}</strong>
        </label>
      </AreneField>

      <AreneField :label="$t('galleries.staff.youtubeUrl')" for="youtube">
        <div class="cluster">
          <input id="youtube" v-model="youtubeUrl" class="input" placeholder="https://youtu.be/…">
          <button class="btn btn--ink btn--sm" :disabled="pending" @click="addVideo">
            {{ $t('galleries.staff.addVideo') }}
          </button>
        </div>
      </AreneField>

      <ul v-if="selected.items?.length" class="grid grid--gallery items">
        <li v-for="item in selected.items" :key="item._id">
          <img v-if="item.thumbUrl" :src="item.thumbUrl" :alt="text(item.caption) || ''" loading="lazy">
          <button class="btn btn--quiet btn--sm" @click="removeItem(item._id)">
            {{ $t('galleries.staff.deleteItem') }}
          </button>
        </li>
      </ul>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.creator {
  display: grid;
  gap: var(--space-3);
  align-items: end;

  @include from(md) {
    grid-template-columns: repeat(3, 1fr) auto;
  }
}

.card--selected {
  border-color: var(--color-gold);
}

.editor {
  border-color: var(--color-gold);
}

.items {
  padding: 0;
  list-style: none;

  li {
    display: grid;
    gap: var(--space-2);
  }

  img {
    inline-size: 100%;
    block-size: 8rem;
    object-fit: cover;
    border-radius: var(--radius-md);
  }
}
</style>
