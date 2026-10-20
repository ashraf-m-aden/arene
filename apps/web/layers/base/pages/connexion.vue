<script setup lang="ts">
const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const localePath = useLocalePath()

const mode = ref<'password' | 'otp'>('password')
const identifier = ref('')
const password = ref('')
const phone = ref('')
const code = ref('')
const otpSent = ref(false)
const pending = ref(false)
const error = ref('')

useNoIndex(t('auth.loginTitle'))

async function afterLogin(role: string) {
  const next = typeof route.query.suivant === 'string' ? route.query.suivant : null
  if (next) return navigateTo(next)
  return navigateTo(localePath(role === 'parent' ? '/compte' : '/staff'))
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

async function requestCode() {
  pending.value = true
  error.value = ''
  try {
    await auth.requestOtp(phone.value)
    otpSent.value = true
  } catch (err: any) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

async function submitCode() {
  pending.value = true
  error.value = ''
  try {
    const user = await auth.verifyOtp(phone.value, code.value)
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

      <div class="tabs auth-tabs">
        <button
          class="tabs__link"
          :class="{ 'tabs__link--active': mode === 'password' }"
          @click="mode = 'password'"
        >
          {{ $t('auth.password') }}
        </button>
        <button
          class="tabs__link"
          :class="{ 'tabs__link--active': mode === 'otp' }"
          @click="mode = 'otp'"
        >
          {{ $t('auth.otpTitle') }}
        </button>
      </div>

      <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>

      <form v-if="mode === 'password'" class="card stack" @submit.prevent="submitPassword">
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

      <form v-else class="card stack" @submit.prevent="otpSent ? submitCode() : requestCode()">
        <p class="muted">{{ $t('auth.otpLead') }}</p>

        <AreneField :label="$t('auth.phone')" :hint="$t('auth.phoneHint')" for="phone" required>
          <input
            id="phone"
            v-model="phone"
            class="input numeric"
            type="tel"
            inputmode="tel"
            placeholder="+25377123456"
            required
          >
        </AreneField>

        <template v-if="otpSent">
          <AreneNotice tone="success">{{ $t('auth.otpSent') }}</AreneNotice>
          <AreneField :label="$t('auth.otpCode')" for="code" required>
            <input
              id="code"
              v-model="code"
              class="input numeric"
              inputmode="numeric"
              pattern="\d{6}"
              maxlength="6"
              autocomplete="one-time-code"
              required
            >
          </AreneField>
        </template>

        <button class="btn btn--primary btn--block" type="submit" :disabled="pending">
          {{ otpSent ? $t('auth.otpVerify') : $t('auth.otpRequest') }}
        </button>
      </form>
    </div>
  </section>
</template>

<style scoped lang="scss">
.auth-tabs {
  margin-block-end: var(--space-5);
}
</style>
