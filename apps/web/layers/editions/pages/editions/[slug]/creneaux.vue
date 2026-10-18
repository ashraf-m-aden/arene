<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const { text, date } = useFormat()

const slug = computed(() => String(route.params.slug))

const { data } = await useAsyncData(`slots-${slug.value}`, async () => {
  const { $api } = useNuxtApp()
  const edition = await $api.get<{ data: any }>(`/editions/${slug.value}`).then((r) => r.data)
  const slots = await $api
    .get<{ data: any[] }>(`/editions/${edition._id}/slots`)
    .then((r) => r.data)
    .catch(() => [])
  return { edition, slots }
})

const edition = computed(() => data.value?.edition)
const slots = computed(() => data.value?.slots ?? [])

useSeoPage({
  title: `${t('editions.slotsTitle')} — ${text(edition.value?.title)}`,
  description: t('editions.slotsLead')
})
</script>

<template>
  <div v-if="edition">
    <section class="section section--ink">
      <div class="container stack">
        <p class="eyebrow">{{ text(edition.title) }}</p>
        <h1>{{ $t('editions.slotsTitle') }}</h1>
        <p class="lead">{{ $t('editions.slotsLead') }}</p>
      </div>
    </section>

    <div class="container">
      <GmEditionTabs :slug="edition.slug" />
    </div>

    <section class="section">
      <div class="container">
        <div v-if="slots.length" class="grid grid--2">
          <article v-for="slot in slots" :key="slot._id" class="card">
            <div class="cluster">
              <span class="badge badge--gold">{{ $t(`category.${slot.ageCategory}`) }}</span>
              <span class="badge">{{ $t(`editions.slotStatus.${slot.status}`) }}</span>
            </div>
            <h2 class="card__title">{{ slot.label }}</h2>
            <p class="numeric muted">{{ date(slot.startsAt, true) }}</p>
            <p v-if="slot.venue" class="muted">{{ slot.venue }}</p>

            <template v-if="slot.occupancy">
              <GmMeter
                :label="$t('role.striker')"
                :used="slot.occupancy.striker.used"
                :capacity="slot.occupancy.striker.capacity"
              />
              <GmMeter
                :label="$t('role.defender')"
                :used="slot.occupancy.defender.used"
                :capacity="slot.occupancy.defender.capacity"
              />
            </template>
          </article>
        </div>

        <GmEmpty v-else :title="$t('editions.empty')" />
      </div>
    </section>
  </div>
</template>
