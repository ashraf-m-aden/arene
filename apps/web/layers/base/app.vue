<script setup lang="ts">
const { locale, locales } = useI18n()
const head = useLocaleHead({ dir: true, lang: true, seo: true })

const current = computed(() => locales.value.find((l: any) => l.code === locale.value))

/** La police arabe n'est chargée que sur les pages arabes. */
useHead(() => ({
  htmlAttrs: {
    lang: head.value.htmlAttrs?.lang,
    dir: current.value?.dir ?? 'ltr'
  },
  meta: head.value.meta ?? [],
  link: [
    // Alternances hreflang fr / ar / x-default produites par l'i18n.
    ...(head.value.link ?? []),
    ...(locale.value === 'ar'
      ? [
          {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap'
          }
        ]
      : [])
  ]
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
