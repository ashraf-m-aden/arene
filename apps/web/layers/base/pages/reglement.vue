<script setup lang="ts">
const { t, tm, rt } = useI18n()

const sections = computed(() =>
  (tm('rules.sections') as any[]).map((section: any) => ({
    title: rt(section.title),
    items: (section.items as any[]).map((item) => rt(item))
  }))
)

useSeoPage({
  title: `${t('legal.rulesTitle')} — L'Arène`,
  description: t('rules.intro'),
  jsonLd: breadcrumbLd([
    { name: "L'Arène", path: '/' },
    { name: t('legal.rulesTitle'), path: '/reglement' }
  ])
})
</script>

<template>
  <section class="section">
    <div class="container container--narrow prose">
      <h1>{{ $t('legal.rulesTitle') }}</h1>
      <p class="lead">{{ $t('rules.intro') }}</p>

      <section v-for="(section, index) in sections" :key="index">
        <h2>{{ section.title }}</h2>
        <ul>
          <li v-for="(item, i) in section.items" :key="i">{{ item }}</li>
        </ul>
      </section>
    </div>
  </section>
</template>
