<template>
  <div class="shell">
    <a class="skip-link" href="#contenu">{{ $t('nav.skip') }}</a>
    <AreneHeader />
    <main id="contenu" class="shell__main">
      <slot />
    </main>
    <AreneFooter />
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
