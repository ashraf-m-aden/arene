<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { text, date } = useFormat()

const { data: galleries } = await useAsyncData('galleries-list', async () => {
  const { $api } = useNuxtApp()
  const editions = await $api.get<{ data: any[] }>('/editions').then((r) => r.data).catch(() => [])
  const lists = await Promise.all(
    editions.map((edition: any) =>
      $api
        .get<{ data: any[] }>(`/editions/${edition._id}/galleries`)
        .then((r) => r.data.map((gallery: any) => ({ ...gallery, edition })))
        .catch(() => [])
    )
  )
  return lists.flat()
})

useSeoPage({
  title: `${t('galleries.title')} — L'Arène`,
  description: t('galleries.lead'),
  jsonLd: breadcrumbLd([
    { name: "L'Arène", path: '/' },
    { name: t('galleries.title'), path: '/galeries' }
  ])
})
</script>

<template>
  <section class="section">
    <div class="container">
      <AreneSectionHead
        :eyebrow="$t('nav.galleries')"
        :title="$t('galleries.title')"
        :lead="$t('galleries.lead')"
      />

      <ul v-if="galleries?.length" class="grid grid--3 list">
        <li v-for="gallery in galleries" :key="gallery._id">
          <NuxtLink :to="localePath(`/galeries/${gallery.slug}`)" class="tile">
            <img
              v-if="gallery.coverUrl || gallery.items?.[0]?.thumbUrl"
              :src="gallery.coverUrl || gallery.items[0].thumbUrl"
              :alt="text(gallery.title)"
              loading="lazy"
              width="600"
              height="400"
            >
            <div v-else class="tile__placeholder" aria-hidden="true" />
            <div class="tile__body">
              <h2>{{ text(gallery.title) }}</h2>
              <p class="muted numeric">
                {{ gallery.counts?.photos ?? 0 }} {{ $t('galleries.photos') }} ·
                {{ gallery.counts?.videos ?? 0 }} {{ $t('galleries.videos') }}
              </p>
              <p v-if="gallery.publishedAt" class="muted numeric">{{ date(gallery.publishedAt) }}</p>
            </div>
          </NuxtLink>
        </li>
      </ul>

      <AreneEmpty v-else :title="$t('galleries.empty')" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.list {
  padding: 0;
  list-style: none;
}

.tile {
  display: grid;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  transition: transform var(--transition), border-color var(--transition);

  &:hover {
    transform: translateY(-2px);
    border-color: var(--color-gold);
  }

  img {
    inline-size: 100%;
    block-size: 11rem;
    object-fit: cover;
  }
}

.tile__placeholder {
  block-size: 11rem;
  background: linear-gradient(135deg, var(--color-ink), var(--color-ink-soft));
}

.tile__body {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);

  h2 {
    font-size: var(--text-lg);
  }
}
</style>
