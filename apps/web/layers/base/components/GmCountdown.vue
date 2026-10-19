<script setup lang="ts">
/**
 * Compte à rebours façon tableau d'affichage de stade.
 * Il ne tourne qu'au client : la page d'accueil est servie depuis le cache
 * serveur (SWR 5 min), un rendu SSR des secondes serait faux et provoquerait
 * un écart d'hydratation. L'appelant l'enveloppe dans <ClientOnly>.
 */
const props = defineProps<{ target: string | Date; label?: string }>()
const { t } = useI18n()

function remaining() {
  const ms = Math.max(0, new Date(props.target).getTime() - Date.now())
  return {
    over: ms === 0,
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    seconds: Math.floor((ms % 60000) / 1000)
  }
}

const left = ref(remaining())
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timer = setInterval(() => {
    left.value = remaining()
  }, 1000)
})

onBeforeUnmount(() => clearInterval(timer))

const pad = (value: number) => String(value).padStart(2, '0')

const cells = computed(() => [
  { key: 'days', value: String(left.value.days), label: t('home.cdDays') },
  { key: 'hours', value: pad(left.value.hours), label: t('home.cdHours') },
  { key: 'minutes', value: pad(left.value.minutes), label: t('home.cdMinutes') },
  { key: 'seconds', value: pad(left.value.seconds), label: t('home.cdSeconds') }
])

const reading = computed(() =>
  cells.value.map((cell) => `${cell.value} ${cell.label}`).join(' ')
)
</script>

<template>
  <div class="board">
    <p v-if="label && !left.over" class="board__label">{{ label }}</p>
    <p v-if="left.over" class="board__over">{{ $t('home.cdClosedNote') }}</p>

    <div v-else class="board__cells" role="timer" :aria-label="`${label} ${reading}`">
      <div v-for="cell in cells" :key="cell.key" class="digit">
        <span :key="cell.value" class="digit__value numeric">{{ cell.value }}</span>
        <span class="digit__label">{{ cell.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.board {
  display: grid;
  gap: var(--space-3);
}

.board__label {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-gold-bright);
}

.board__over {
  font-size: var(--text-sm);
  opacity: 0.8;
}

.board__cells {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.digit {
  display: grid;
  gap: var(--space-1);
  justify-items: center;
  padding: var(--space-2) var(--space-1) var(--space-2);
  background: linear-gradient(180deg, rgb(0 0 0 / 55%), rgb(0 0 0 / 25%));
  border: 1px solid rgb(231 178 62 / 28%);
  border-radius: var(--radius-md);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 10%);
  overflow: hidden;
}

/** Le chiffre est remonté à chaque seconde : la clé force le petit clac. */
.digit__value {
  position: relative;
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 1.1rem + 1.4vw, 2.25rem);
  font-weight: 800;
  line-height: 1;
  color: var(--color-gold-bright);
  text-shadow: 0 0 18px rgb(231 178 62 / 45%);
  animation: clac 260ms cubic-bezier(0.2, 0.8, 0.2, 1);

  // La ligne de pliage d'un afficheur à volets.
  &::after {
    content: '';
    position: absolute;
    inset-inline: -0.35em;
    inset-block-start: 50%;
    block-size: 1px;
    background: rgb(0 0 0 / 45%);
  }
}

.digit__label {
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.68;
}

@keyframes clac {
  from {
    transform: translateY(-28%) scaleY(0.82);
    opacity: 0.35;
  }

  to {
    transform: translateY(0) scaleY(1);
    opacity: 1;
  }
}
</style>
