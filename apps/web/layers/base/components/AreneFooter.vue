<script setup lang="ts">
const localePath = useLocalePath()
const config = useRuntimeConfig()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <div class="footer__brand">
        <AreneLogo class="footer__mark" />
        <p class="footer__pitch">{{ $t('footer.pitch') }}</p>
      </div>

      <nav class="footer__group" :aria-label="$t('footer.tournament')">
        <h2>{{ $t('footer.tournament') }}</h2>
        <NuxtLink :to="localePath('/editions')">{{ $t('nav.editions') }}</NuxtLink>
        <NuxtLink :to="localePath('/inscription')">{{ $t('nav.register') }}</NuxtLink>
        <NuxtLink :to="localePath('/ecoles')">{{ $t('nav.schools') }}</NuxtLink>
        <NuxtLink :to="localePath('/galeries')">{{ $t('nav.galleries') }}</NuxtLink>
      </nav>

      <nav class="footer__group" :aria-label="$t('footer.infos')">
        <h2>{{ $t('footer.infos') }}</h2>
        <NuxtLink :to="localePath('/reglement')">{{ $t('nav.rules') }}</NuxtLink>
        <NuxtLink :to="localePath('/faq')">{{ $t('nav.faq') }}</NuxtLink>
        <NuxtLink :to="localePath('/a-propos')">{{ $t('nav.about') }}</NuxtLink>
        <NuxtLink :to="localePath('/confidentialite')">{{ $t('nav.privacy') }}</NuxtLink>
      </nav>

      <div class="footer__group">
        <h2>{{ $t('footer.follow') }}</h2>
        <a v-if="config.public.youtubeChannel" :href="config.public.youtubeChannel" rel="noopener">
          YouTube
        </a>
        <a href="mailto:contact@dj-arene.com">contact@dj-arene.com</a>
      </div>
    </div>

    <div class="container footer__legal">
      <p class="numeric">© {{ year }} L'Arène — Djibouti</p>
      <p>{{ $t('footer.minors') }}</p>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.footer {
  @include on-ink;

  padding-block: var(--space-7) var(--space-5);
  margin-block-start: auto;
}

.footer__inner {
  display: grid;
  gap: var(--space-6);
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}

.footer__brand {
  display: grid;
  gap: var(--space-3);
  justify-items: start;
}

.footer__mark {
  inline-size: 2.5rem;
  block-size: 2.5rem;
}

.footer__pitch {
  font-size: var(--text-sm);
  opacity: 0.8;
  max-inline-size: 28ch;
}

.footer__group {
  display: grid;
  gap: var(--space-2);
  align-content: start;

  h2 {
    font-size: var(--text-xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-gold-bright);
  }

  a {
    font-size: var(--text-sm);
    text-decoration: none;
    color: inherit;
    opacity: 0.85;

    &:hover {
      opacity: 1;
      text-decoration: underline;
    }
  }
}

.footer__legal {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: space-between;
  margin-block-start: var(--space-6);
  padding-block-start: var(--space-4);
  border-block-start: 1px solid var(--color-ink-soft);
  font-size: var(--text-xs);
  opacity: 0.7;
}
</style>
