<script setup lang="ts">
const { t, tm, rt } = useI18n()

const items = computed(() =>
  (tm('faq.items') as any[]).map((item: any) => ({ q: rt(item.q), a: rt(item.a) }))
)

useSeoPage({
  title: `${t('legal.faqTitle')} — L'Arène`,
  description: items.value[0]?.a,
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.value.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  }
})
</script>

<template>
  <section class="section">
    <div class="container container--narrow">
      <AreneSectionHead :title="$t('legal.faqTitle')" />

      <div class="faq">
        <details v-for="(item, index) in items" :key="index" class="faq__item">
          <summary>{{ item.q }}</summary>
          <p>{{ item.a }}</p>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.faq {
  display: grid;
  gap: var(--space-3);
}

.faq__item {
  background: var(--color-paper);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  padding: var(--space-4);

  summary {
    cursor: pointer;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--text-lg);
  }

  p {
    margin-block-start: var(--space-3);
    color: var(--color-muted);
  }

  &[open] {
    border-color: var(--color-gold);
  }
}
</style>
