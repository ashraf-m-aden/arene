<template>
  <div class="shell">
    <a class="skip-link" href="#contenu">{{ $t('nav.skip') }}</a>
    <GmHeader />
    <main id="contenu" class="shell__main">
      <slot />
    </main>
    <GmFooter />
  </div>
</template>

<style scoped lang="scss">
.shell {
  display: flex;
  flex-direction: column;
  min-block-size: 100dvh;
}

.shell__main {
  flex: 1;
}
</style>
