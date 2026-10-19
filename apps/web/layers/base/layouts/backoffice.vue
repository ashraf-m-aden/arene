<script setup lang="ts">
const auth = useAuthStore()
const localePath = useLocalePath()

/** Navigation du back-office, pensée pour le téléphone du staff. */
const links = computed(() => {
  const items = [
    { to: '/staff', label: 'backoffice.dashboard', icon: '◍' },
    { to: '/staff/dossiers', label: 'backoffice.files', icon: '✓' },
    { to: '/staff/checkin', label: 'backoffice.checkin', icon: '⌁' },
    { to: '/staff/resultats', label: 'backoffice.results', icon: '⚽' },
    { to: '/staff/caisse', label: 'backoffice.cash', icon: '₣' }
  ]
  if (auth.isAdmin) {
    items.push(
      { to: '/admin/editions', label: 'backoffice.editions', icon: '🏆' },
      { to: '/admin', label: 'backoffice.admin', icon: '⚙' },
      { to: '/admin/messages', label: 'backoffice.messages', icon: '✉' }
    )
  }
  return items
})
</script>

<template>
  <div class="bo">
    <header class="bo__top">
      <div class="container bo__top-inner">
        <NuxtLink :to="localePath('/')" class="bo__brand">
          <GmLogo class="bo__mark" />
          <span>{{ $t('backoffice.title') }}</span>
        </NuxtLink>
        <div class="cluster">
          <span class="badge badge--gold">{{ auth.user?.role }}</span>
          <button class="btn btn--ghost btn--sm" @click="auth.logout()">
            {{ $t('nav.logout') }}
          </button>
        </div>
      </div>
    </header>

    <nav class="bo__tabs" :aria-label="$t('backoffice.title')">
      <div class="container bo__tabs-inner">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="localePath(link.to)"
          class="bo__tab"
          active-class="bo__tab--active"
        >
          <span aria-hidden="true">{{ link.icon }}</span>
          {{ $t(link.label) }}
        </NuxtLink>
      </div>
    </nav>

    <main class="container bo__main">
      <slot />
    </main>
  </div>
</template>

<style scoped lang="scss">
.bo {
  min-block-size: 100dvh;
  background: var(--color-surface-2);
}

.bo__top {
  background: var(--color-ink);
  color: var(--color-on-ink);
}

.bo__top-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-block-size: 3.5rem;
}

.bo__brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-decoration: none;
  font-family: var(--font-display);
  font-weight: 700;
}

.bo__mark {
  inline-size: 1.75rem;
  block-size: 1.75rem;
}

.bo__tabs {
  background: var(--color-paper);
  border-block-end: 1px solid var(--color-line);
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
}

.bo__tabs-inner {
  display: flex;
  gap: var(--space-1);
  overflow-x: auto;
}

.bo__tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-muted);
  text-decoration: none;
  white-space: nowrap;
  border-block-end: 2px solid transparent;
}

.bo__tab--active {
  color: var(--color-text);
  border-block-end-color: var(--color-gold);
}

.bo__main {
  padding-block: var(--space-5) var(--space-8);
}
</style>
