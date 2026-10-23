<script setup lang="ts">
const localePath = useLocalePath()
const auth = useAuthStore()
const route = useRoute()
const open = ref(false)

const links = computed(() => [
  { to: '/editions', label: 'nav.editions' },
  { to: '/inscription', label: 'nav.register' },
  { to: '/galeries', label: 'nav.galleries' }
])

watch(() => route.fullPath, () => { open.value = false })
</script>

<template>
  <header class="header">
    <div class="container header__inner">
      <NuxtLink :to="localePath('/')" class="brand">
        <AreneLogo class="brand__mark" />
        <span class="brand__text">
          <strong>L'Arène</strong>
          <small>{{ $t('brand.tagline') }}</small>
        </span>
      </NuxtLink>

      <button
        class="header__burger"
        :aria-expanded="open"
        aria-controls="menu-principal"
        @click="open = !open"
      >
        <span class="sr-only">{{ $t('nav.menu') }}</span>
        <span class="header__burger-bar" aria-hidden="true" />
        <span class="header__burger-bar" aria-hidden="true" />
      </button>

      <nav id="menu-principal" class="header__nav" :class="{ 'header__nav--open': open }">
        <NuxtLink v-for="link in links" :key="link.to" :to="localePath(link.to)" class="header__link">
          {{ $t(link.label) }}
        </NuxtLink>

        <div class="header__actions">
          <AreneLocaleSwitch />
          <NuxtLink
            v-if="!auth.isLoggedIn"
            :to="localePath('/connexion')"
            class="btn btn--ghost btn--sm"
          >
            {{ $t('nav.login') }}
          </NuxtLink>
          <NuxtLink v-else :to="localePath(auth.isStaff ? '/staff' : '/compte')" class="btn btn--primary btn--sm">
            {{ auth.isStaff ? $t('nav.backoffice') : $t('nav.account') }}
          </NuxtLink>
        </div>
      </nav>
    </div>
  </header>
</template>

<style scoped lang="scss">
.header {
  position: sticky;
  inset-block-start: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--color-ink) 94%, transparent);
  backdrop-filter: blur(8px);
  color: var(--color-on-ink);
}

.header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-block-size: var(--header-height);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-decoration: none;
}

.brand__mark {
  inline-size: 2.1rem;
  block-size: 2.1rem;
  flex: none;
}

.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;

  strong {
    font-family: var(--font-display);
    font-size: 1rem;
    letter-spacing: -0.01em;
  }

  small {
    font-size: 0.7rem;
    color: var(--color-gold-bright);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
}

.header__burger {
  display: grid;
  gap: 5px;
  padding: var(--space-3);
  color: inherit;

  @include from(md) {
    display: none;
  }
}

.header__burger-bar {
  inline-size: 1.25rem;
  block-size: 2px;
  background: currentcolor;
}

.header__nav {
  display: none;
  align-items: center;
  gap: var(--space-5);

  @include from(md) {
    display: flex;
  }
}

.header__nav--open {
  position: absolute;
  inset-inline: 0;
  inset-block-start: var(--header-height);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-ink);
  border-block-start: 1px solid var(--color-ink-soft);
}

.header__link {
  color: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
  padding-block: var(--space-2);

  &:hover,
  &.router-link-active {
    color: var(--color-gold-bright);
  }
}

.header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sr-only {
  @include visually-hidden;
}
</style>
