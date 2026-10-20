<script setup lang="ts">
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { text, date } = useFormat()

const slug = computed(() => String(route.params.slug))

const { data } = await useAsyncData(`edition-galleries-${slug.value}`, async () => {
  const { $api } = useNuxtApp()
  const edition = await $api.get<{ data: any }>(`/editions/${slug.value}`).then((r) => r.data)
  const galleries = await $api
    .get<{ data: any[] }>(`/editions/${edition._id}/galleries`)
    .then((r) => r.data)
    .catch(() => [])
  return { edition, galleries }
})

const edition = computed(() => data.value?.edition)
const galleries = computed(() => data.value?.galleries ?? [])

useSeoPage({
  title: `${t('galleries.title')} — ${text(edition.value?.title)}`,
  description: t('galleries.lead')
})
</script>

<template>
  <div v-if="edition">
    <section class="section section--ink">
      <div class="container stack">
        <p class="eyebrow">{{ text(edition.title) }}</p>
        <h1>{{ $t('galleries.title') }}</h1>
      </div>
    </section>

    <div class="container">
      <AreneEditionTabs :slug="edition.slug" />
    </div>

    <section class="section">
      <div class="container">
        <ul v-if="galleries.length" class="grid grid--3 list">
          <li v-for="gallery in galleries" :key="gallery._id">
            <NuxtLink :to="localePath(`/galeries/${gallery.slug}`)" class="card card--link">
              <img
                v-if="gallery.coverUrl || gallery.items?.[0]?.thumbUrl"
                :src="gallery.coverUrl || gallery.items[0].thumbUrl"
                :alt="text(gallery.title)"
                loading="lazy"
                width="600"
                height="400"
                class="cover"
              >
              <h2 class="card__title">{{ text(gallery.title) }}</h2>
              <p class="muted numeric">
                {{ gallery.counts?.photos ?? 0 }} {{ $t('galleries.photos') }} ·
                {{ gallery.counts?.videos ?? 0 }} {{ $t('galleries.videos') }}
              </p>
              <p v-if="gallery.publishedAt" class="muted numeric">{{ date(gallery.publishedAt) }}</p>
            </NuxtLink>
          </li>
        </ul>

        <AreneEmpty v-else :title="$t('galleries.empty')" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.list {
  padding: 0;
  list-style: none;
}

.cover {
  inline-size: 100%;
  block-size: 10rem;
  object-fit: cover;
  border-radius: var(--radius-md);
}
</style>
