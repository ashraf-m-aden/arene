<script setup lang="ts">
const props = defineProps<{ items: any[]; index: number }>()
const emit = defineEmits<{ close: []; move: [number] }>()

const { text } = useFormat()
const current = computed(() => props.items[props.index])
const videoLoaded = ref(false)

watch(
  () => props.index,
  () => {
    videoLoaded.value = false
  }
)

/** Navigation au clavier, dans le sens de lecture de la page. */
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  if (event.key === 'ArrowRight') emit('move', 1)
  if (event.key === 'ArrowLeft') emit('move', -1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

/* Gestes tactiles : glisser pour changer d'image. */
let startX = 0
const onTouchStart = (event: TouchEvent) => {
  startX = event.touches[0].clientX
}
const onTouchEnd = (event: TouchEvent) => {
  const delta = event.changedTouches[0].clientX - startX
  if (Math.abs(delta) > 60) emit('move', delta < 0 ? 1 : -1)
}
</script>

<template>
  <div
    class="viewer"
    role="dialog"
    :aria-label="$t('galleries.viewer')"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <button class="viewer__close btn btn--ghost btn--sm" @click="emit('close')">
      {{ $t('galleries.closeViewer') }}
    </button>

    <button class="viewer__nav viewer__nav--prev" :aria-label="$t('galleries.previous')" @click="emit('move', -1)">
      ‹
    </button>

    <figure class="viewer__stage">
      <template v-if="current?.type === 'photo'">
        <img :src="current.url" :alt="text(current.caption) || ''" loading="eager">
      </template>

      <template v-else-if="current?.type === 'youtube'">
        <!-- Façade cliquable : rien n'est chargé depuis YouTube avant le clic. -->
        <button v-if="!videoLoaded" class="viewer__facade" @click="videoLoaded = true">
          <img
            :src="`https://i.ytimg.com/vi/${current.youtubeId}/hqdefault.jpg`"
            :alt="text(current.caption) || ''"
            loading="lazy"
          >
          <span class="viewer__play" aria-hidden="true">▶</span>
          <span>{{ $t('galleries.playVideo') }}</span>
        </button>
        <iframe
          v-else
          :src="`https://www.youtube-nocookie.com/embed/${current.youtubeId}?autoplay=1&rel=0`"
          title="YouTube"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
        />
      </template>

      <figcaption v-if="text(current?.caption)">{{ text(current.caption) }}</figcaption>
    </figure>

    <button class="viewer__nav viewer__nav--next" :aria-label="$t('galleries.next')" @click="emit('move', 1)">
      ›
    </button>
  </div>
</template>

<style scoped lang="scss">
.viewer {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  background: rgb(6 17 28 / 94%);
  color: var(--color-on-ink);
}

.viewer__close {
  position: absolute;
  inset-block-start: var(--space-4);
  inset-inline-end: var(--space-4);
  z-index: 2;
}

.viewer__nav {
  font-size: 2.5rem;
  line-height: 1;
  color: inherit;
  padding: var(--space-3);
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
}

[dir='rtl'] .viewer__nav--prev,
[dir='rtl'] .viewer__nav--next {
  transform: scaleX(-1);
}

.viewer__stage {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
  margin: 0;
  max-block-size: 90dvh;

  img,
  iframe {
    max-inline-size: min(100%, 68rem);
    max-block-size: 76dvh;
    border-radius: var(--radius-md);
  }

  iframe {
    inline-size: min(100%, 68rem);
    aspect-ratio: 16 / 9;
    block-size: auto;
    border: 0;
  }

  figcaption {
    font-size: var(--text-sm);
    opacity: 0.85;
    text-align: center;
  }
}

.viewer__facade {
  position: relative;
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  color: inherit;
}

.viewer__play {
  position: absolute;
  inset-block-start: 40%;
  font-size: 3rem;
  color: var(--color-gold-bright);
}
</style>
