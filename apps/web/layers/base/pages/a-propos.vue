<script setup lang="ts">
const { t, tm, rt } = useI18n()

const paragraphs = computed(() => (tm('about.paragraphs') as any[]).map((p) => rt(p)))

useSeoPage({
  title: `${t('legal.aboutTitle')} — L'Arène`,
  description: paragraphs.value[0]
})
</script>

<template>
  <section class="section">
    <div class="container container--narrow prose">
      <h1>{{ $t('legal.aboutTitle') }}</h1>
      <p v-for="(paragraph, index) in paragraphs" :key="index" :class="{ lead: index === 0 }">
        {{ paragraph }}
      </p>
    </div>
  </section>
</template>
