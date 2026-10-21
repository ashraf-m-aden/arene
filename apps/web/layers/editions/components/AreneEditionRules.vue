<script setup lang="ts">
/**
 * Le règlement tel qu'il s'applique à UNE édition : ses conditions chiffrées en tête,
 * puis les règles générales du tournoi. Plusieurs éditions peuvent être ouvertes en même
 * temps, donc le règlement n'existe jamais seul — il appartient toujours à une édition.
 */
const props = defineProps<{ edition: any }>()

const { t, tm, rt } = useI18n()
const { money, date } = useFormat()

/** Règles communes à toutes les éditions, écrites une fois dans les locales. */
const sections = computed(() =>
  (tm('rules.sections') as any[]).map((section: any) => ({
    title: rt(section.title),
    items: (section.items as any[]).map((item) => rt(item))
  }))
)

/** Conditions propres à l'édition, lues sur l'édition elle-même. */
const conditions = computed(() => {
  const edition = props.edition
  if (!edition) return []

  return [
    { key: 'editions.threshold', value: edition.rules?.gradeThreshold ? `${edition.rules.gradeThreshold}/20` : '' },
    { key: 'editions.fee', value: money(edition.fee) },
    {
      key: 'editions.registrationWindow',
      value: `${date(edition.registrationOpensAt)} → ${date(edition.registrationClosesAt)}`
    },
    { key: 'editions.venue', value: edition.venue?.name },
    {
      key: 'editions.categories',
      value: (edition.ageCategories ?? []).map((category: string) => t(`category.${category}`)).join(' · ')
    }
  ].filter((row) => row.value)
})
</script>

<template>
  <div class="stack">
    <section class="card card--flat stack">
      <h2 class="card__title">{{ $t('editions.rulesConditions') }}</h2>
      <dl class="edition-rules__facts">
        <div v-for="row in conditions" :key="row.key">
          <dt>{{ $t(row.key) }}</dt>
          <dd class="numeric">{{ row.value }}</dd>
        </div>
      </dl>
    </section>

    <section class="prose">
      <h2>{{ $t('editions.rulesGeneral') }}</h2>
      <section v-for="(section, index) in sections" :key="index">
        <h3>{{ section.title }}</h3>
        <ul>
          <li v-for="(item, i) in section.items" :key="i">{{ item }}</li>
        </ul>
      </section>
    </section>
  </div>
</template>

<style scoped lang="scss">
.edition-rules__facts {
  display: grid;
  gap: var(--space-4);
  margin: 0;

  @include from(sm) {
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }

  dt {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-muted);
  }

  dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
  }
}
</style>
