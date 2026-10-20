<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const { $api } = useNuxtApp()
const localePath = useLocalePath()

const password = ref('')
const pending = ref(false)
const error = ref('')
const token = computed(() => String(route.query.token || ''))

useNoIndex(t('auth.resetTitle'))

async function submit() {
  pending.value = true
  error.value = ''
  try {
    const { data } = await $api.post<{ data: any }>('/auth/password/reset', {
      token: token.value,
      password: password.value
    })
    auth.setSession(data)
    await navigateTo(localePath('/compte'))
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
      <AreneSectionHead :title="$t('auth.resetTitle')" />

      <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>
      <AreneNotice v-else-if="!token" tone="danger">{{ $t('common.error') }}</AreneNotice>

      <form v-if="token" class="card stack" @submit.prevent="submit">
        <AreneField :label="$t('auth.password')" :hint="$t('auth.passwordHint')" for="password" required>
          <input
            id="password"
            v-model="password"
            class="input"
            type="password"
            minlength="8"
            autocomplete="new-password"
            required
          >
        </AreneField>
        <button class="btn btn--primary btn--block" type="submit" :disabled="pending">
          {{ $t('common.save') }}
        </button>
      </form>
    </div>
  </section>
</template>
