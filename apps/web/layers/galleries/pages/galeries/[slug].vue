<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const { text, date } = useFormat()

const slug = computed(() => String(route.params.slug))

const { data: gallery } = await useAsyncData(`gallery-${slug.value}`, () => {
  const { $api } = useNuxtApp()
  return $api.get<{ data: any }>(`/galleries/${slug.value}`).then((r) => r.data)
})

if (!gallery.value) {
  throw createError({ statusCode: 404, statusMessage: 'Galerie introuvable', fatal: true })
}

const items = computed(() => gallery.value?.items ?? [])
const viewerIndex = ref(-1)
const viewerOpen = computed(() => viewerIndex.value >= 0)

function open(index: number) {
  viewerIndex.value = index
}

function move(step: number) {
  const total = items.value.length
  if (!total) return
  viewerIndex.value = (viewerIndex.value + step + total) % total
}

watch(viewerOpen, (isOpen) => {
  if (import.meta.client) document.body.style.overflow = isOpen ? 'hidden' : ''
})

onBeforeUnmount(() => {
  if (import.meta.client) document.body.style.overflow = ''
})

const photos = computed(() => items.value.filter((item: any) => item.type === 'photo'))
const videos = computed(() => items.value.filter((item: any) => item.type === 'youtube'))

useSeoPage({
  title: `${text(gallery.value.title)} — L'Arène`,
  description: text(gallery.value.description) || t('galleries.lead'),
  image: gallery.value.coverUrl || items.value[0]?.thumbUrl,
  type: 'article',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'ImageGallery',
      name: text(gallery.value.title),
      datePublished: gallery.value.publishedAt,
      image: photos.value.map((item: any) => item.url).filter(Boolean)
    },
    ...videos.value.map((item: any) => ({
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: text(item.caption) || text(gallery.value.title),
      thumbnailUrl: item.thumbUrl,
      uploadDate: gallery.value.publishedAt,
      ...(item.durationSeconds ? { duration: `PT${item.durationSeconds}S` } : {}),
      embedUrl: `https://www.youtube-nocookie.com/embed/${item.youtubeId}`
    })),
    breadcrumbLd([
      { name: "L'Arène", path: '/' },
      { name: t('galleries.title'), path: '/galeries' },
      { name: text(gallery.value.title), path: `/galeries/${slug.value}` }
    ])
  ]
})
</script>

<template>
  <div v-if="gallery">
    <section class="section section--ink">
      <div class="container stack">
        <p class="eyebrow">{{ $t('galleries.title') }}</p>
        <h1>{{ text(gallery.title) }}</h1>
        <p v-if="text(gallery.description)" class="lead">{{ text(gallery.description) }}</p>
        <p class="muted numeric">
          {{ gallery.counts?.photos ?? 0 }} {{ $t('galleries.photos') }} ·
          {{ gallery.counts?.videos ?? 0 }} {{ $t('galleries.videos') }}
          <template v-if="gallery.publishedAt"> · {{ date(gallery.publishedAt) }}</template>
        </p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <ul v-if="items.length" class="grid grid--gallery list">
          <li v-for="(item, index) in items" :key="item._id">
            <button class="thumb" @click="open(index)">
              <img
                v-if="item.thumbUrl"
                :src="item.thumbUrl"
                :alt="text(item.caption) || ''"
                loading="lazy"
                width="400"
                height="300"
              >
              <span v-if="item.type === 'youtube'" class="thumb__play" aria-hidden="true">▶</span>
              <span v-if="text(item.caption)" class="thumb__caption">{{ text(item.caption) }}</span>
            </button>
          </li>
        </ul>

        <AreneEmpty v-else :title="$t('galleries.empty')" />
        <p class="muted video-note">{{ $t('galleries.videoNotice') }}</p>
      </div>
    </section>

    <AreneGalleryViewer
      v-if="viewerOpen"
      :items="items"
      :index="viewerIndex"
      @close="viewerIndex = -1"
      @move="move"
    />
  </div>
</template>

<style scoped lang="scss">
.list {
  padding: 0;
  list-style: none;
}

.thumb {
  position: relative;
  display: block;
  inline-size: 100%;
  block-size: 100%;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);

  img {
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 9rem;
    object-fit: cover;
    transition: transform var(--transition);
  }

  &:hover img {
    transform: scale(1.04);
  }
}

.thumb__play {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  transform: translate(-50%, -50%);
  font-size: 2rem;
  color: #fff;
  text-shadow: 0 2px 12px rgb(0 0 0 / 60%);
}

.thumb__caption {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  text-align: start;
  color: #fff;
  background: linear-gradient(transparent, rgb(6 17 28 / 85%));
}

.video-note {
  margin-block-start: var(--space-4);
  font-size: var(--text-xs);
}
</style>
