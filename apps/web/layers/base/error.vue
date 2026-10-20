<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const localePath = useLocalePath()

const key = computed(() => {
  if (props.error?.statusCode === 404) return '404'
  if (props.error?.statusCode === 403) return '403'
  return '500'
})

useHead({ meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <div class="shell">
    <AreneHeader />
    <main class="section">
      <div class="container container--narrow stack">
        <p class="eyebrow numeric">{{ error?.statusCode }}</p>
        <h1>{{ $t(`error.${key}Title`) }}</h1>
        <p class="lead">{{ $t(`error.${key}Text`) }}</p>
        <NuxtLink :to="localePath('/')" class="btn btn--primary" @click="clearError()">
          {{ $t('error.home') }}
        </NuxtLink>
      </div>
    </main>
    <AreneFooter />
  </div>
</template>

<style scoped lang="scss">
.shell {
  display: flex;
  flex-direction: column;
  min-block-size: 100dvh;

  main {
    flex: 1;
  }
}
</style>
