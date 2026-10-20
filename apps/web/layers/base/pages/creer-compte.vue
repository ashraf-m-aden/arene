<script setup lang="ts">
const { t, locale } = useI18n()
const auth = useAuthStore()
const localePath = useLocalePath()

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  locale: locale.value as 'fr' | 'ar',
  acceptsWhatsapp: true
})

const pending = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})

useNoIndex(t('auth.registerTitle'))

async function submit() {
  pending.value = true
  error.value = ''
  fieldErrors.value = {}
  try {
    const payload: Record<string, unknown> = { ...form }
    if (!form.email) delete payload.email
    const user = await auth.register(payload)
    await navigateTo(localePath(user.role === 'parent' ? '/compte' : '/staff'))
  } catch (err: any) {
    error.value = err.message
    if (Array.isArray(err.details)) {
      for (const detail of err.details) {
        if (detail.path) fieldErrors.value[detail.path] = detail.message
      }
    }
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="container container--narrow">
      <AreneSectionHead :title="$t('auth.registerTitle')" :lead="$t('auth.registerLead')" />

      <AreneNotice v-if="error" tone="danger">{{ error }}</AreneNotice>

      <form class="card stack" @submit.prevent="submit">
        <div class="two">
          <AreneField :label="$t('auth.firstName')" for="firstName" required :error="fieldErrors.firstName">
            <input id="firstName" v-model="form.firstName" class="input" autocomplete="given-name" required>
          </AreneField>
          <AreneField :label="$t('auth.lastName')" for="lastName" required :error="fieldErrors.lastName">
            <input id="lastName" v-model="form.lastName" class="input" autocomplete="family-name" required>
          </AreneField>
        </div>

        <AreneField
          :label="$t('auth.phone')"
          :hint="$t('auth.phoneHint')"
          for="phone"
          required
          :error="fieldErrors.phone"
        >
          <input
            id="phone"
            v-model="form.phone"
            class="input numeric"
            type="tel"
            inputmode="tel"
            placeholder="+25377123456"
            required
          >
        </AreneField>

        <AreneField :label="$t('auth.email')" for="email" :error="fieldErrors.email">
          <input id="email" v-model="form.email" class="input" type="email" autocomplete="email">
        </AreneField>

        <AreneField
          :label="$t('auth.password')"
          :hint="$t('auth.passwordHint')"
          for="password"
          required
          :error="fieldErrors.password"
        >
          <input
            id="password"
            v-model="form.password"
            class="input"
            type="password"
            minlength="8"
            autocomplete="new-password"
            required
          >
        </AreneField>

        <AreneField :label="$t('auth.localeChoice')" for="locale">
          <select id="locale" v-model="form.locale" class="select">
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
          </select>
        </AreneField>

        <label class="check" :class="{ 'check--checked': form.acceptsWhatsapp }">
          <input v-model="form.acceptsWhatsapp" type="checkbox">
          <span>{{ $t('auth.acceptsWhatsapp') }}</span>
        </label>

        <button class="btn btn--primary btn--block" type="submit" :disabled="pending">
          {{ pending ? $t('common.loading') : $t('auth.createAccount') }}
        </button>

        <NuxtLink :to="localePath('/connexion')" class="btn btn--quiet btn--sm">
          {{ $t('auth.haveAccount') }}
        </NuxtLink>
      </form>
    </div>
  </section>
</template>

<style scoped lang="scss">
.two {
  display: grid;
  gap: var(--space-4);

  @include from(sm) {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
