<script setup lang="ts">
const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const localePath = useLocalePath()

const identifier = ref('')
const password = ref('')
const pending = ref(false)
const error = ref('')

useNoIndex(t('auth.loginTitle'))

async function afterLogin(role: string) {
  const next = typeof route.query.suivant === 'string' ? route.query.suivant : null
  if (next) return navigateTo(next)
  return navigateTo(localePath(role === 'candidate' ? '/compte' : '/staff'))
}

async function submitPassword() {
  pending.value = true
  error.value = ''
  try {
    const user = await auth.login(identifier.value, password.value)
    await afterLogin(user.role)
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
      <AreneSectionHead :title="$t('auth.loginTitle')" :lead="$t('auth.loginLead')" />

      <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>

      <form class="card stack" @submit.prevent="submitPassword">
        <AreneField :label="$t('auth.identifier')" for="identifier" required>
          <input
            id="identifier"
            v-model="identifier"
            class="input"
            type="text"
            autocomplete="username"
            required
          >
        </AreneField>

        <AreneField :label="$t('auth.password')" for="password" required>
          <input
            id="password"
            v-model="password"
            class="input"
            type="password"
            autocomplete="current-password"
            required
          >
        </AreneField>

        <button class="btn btn--primary btn--block" type="submit" :disabled="pending">
          {{ pending ? $t('common.loading') : $t('auth.submit') }}
        </button>

        <div class="spread">
          <NuxtLink :to="localePath('/mot-de-passe-oublie')" class="btn btn--quiet btn--sm">
            {{ $t('auth.forgot') }}
          </NuxtLink>
          <NuxtLink :to="localePath('/creer-compte')" class="btn btn--quiet btn--sm">
            {{ $t('auth.createAccount') }}
          </NuxtLink>
        </div>
      </form>
    </div>
  </section>
</template>
