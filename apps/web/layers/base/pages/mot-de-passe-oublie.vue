<script setup lang="ts">
const { t } = useI18n()
const { $api } = useNuxtApp()
const localePath = useLocalePath()

const identifier = ref('')
const sent = ref(false)
const pending = ref(false)
const error = ref('')

useNoIndex(t('auth.forgotTitle'))

async function submit() {
  pending.value = true
  error.value = ''
  try {
    await $api.post('/auth/password/forgot', { identifier: identifier.value })
    sent.value = true
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="container container--narrow">
      <GmSectionHead :title="$t('auth.forgotTitle')" :lead="$t('auth.forgotLead')" />

      <GmNotice v-if="error" tone="danger">{{ error }}</GmNotice>
      <GmNotice v-else-if="sent" tone="success">{{ $t('auth.forgotSent') }}</GmNotice>

      <form v-if="!sent" class="card stack" @submit.prevent="submit">
        <GmField :label="$t('auth.identifier')" for="identifier" required>
          <input id="identifier" v-model="identifier" class="input" required>
        </GmField>
        <button class="btn btn--primary btn--block" type="submit" :disabled="pending">
          {{ $t('common.continue') }}
        </button>
      </form>

      <NuxtLink v-else :to="localePath('/connexion')" class="btn btn--ghost">
        {{ $t('auth.loginTitle') }}
      </NuxtLink>
    </div>
  </section>
</template>
