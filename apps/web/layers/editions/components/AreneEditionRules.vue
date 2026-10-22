<script setup lang="ts">
/**
 * Le règlement d'UNE édition : ses conditions chiffrées en tête, puis le texte
 * rédigé par l'organisation pour cette édition précisément.
 *
 * Il n'existe pas de règlement général du tournoi : plusieurs éditions peuvent être
 * ouvertes en même temps, et une édition intellectuelle n'a rien à voir avec une
 * sportive. Tant que le texte n'est pas écrit, la page le dit plutôt que d'afficher
 * des règles qui ne seraient celles de personne.
 */
const props = defineProps<{ edition: any }>()

const { t, locale } = useI18n()
const { money, date } = useFormat()

/** Le texte de l'édition, découpé en paragraphes sur les lignes vides. */
const paragraphs = computed(() => {
  const text = props.edition?.rules?.text || {}
  const raw = String(text[locale.value] || text.fr || '').trim()
  if (!raw) return []
  return raw
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
})

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
    {
      // Les dates du tournoi n'ont rien a voir avec la fenetre d'inscription :
      // on les montre separement pour que personne ne confonde les deux.
      key: 'editions.tournamentDates',
      value: edition.startsAt
        ? `${date(edition.startsAt)}${edition.endsAt ? ` → ${date(edition.endsAt)}` : ''}`
        : ''
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

    <section v-if="paragraphs.length" class="prose">
      <h2>{{ $t('editions.rulesOwn') }}</h2>
      <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
    </section>

    <AreneEmpty
      v-else
      :title="$t('editions.rulesEmpty')"
      :hint="$t('editions.rulesEmptyHint')"
    />
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
