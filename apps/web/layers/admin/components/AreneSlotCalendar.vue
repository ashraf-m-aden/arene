<script setup lang="ts">
/**
 * Agenda hebdomadaire des rendez-vous d'une édition.
 *
 * Les créneaux ne sont pas publics : cet écran est le seul endroit où la grille
 * existe, et c'est là qu'on place les participants. Un clic sur une case libre
 * propose d'y créer un rendez-vous, un clic sur un bloc le sélectionne.
 */
const props = defineProps<{ slots: any[]; pending?: boolean }>()
const emit = defineEmits<{
  create: [startsAt: Date]
  select: [slot: any]
}>()

/** Plage affichée et pas du quadrillage : une journée de convocations tient là. */
const START_HOUR = 7
const END_HOUR = 20
const STEP_MINUTES = 30

const RANGE_MINUTES = (END_HOUR - START_HOUR) * 60
const STEPS = RANGE_MINUTES / STEP_MINUTES

/** Lundi de la semaine contenant `value`. */
function mondayOf(value: Date) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  const shift = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - shift)
  return d
}

/** On ouvre sur la semaine du premier rendez-vous, sinon sur la semaine courante. */
function initialWeek() {
  const earliest = props.slots
    .map((slot) => new Date(slot.startsAt))
    .sort((a, b) => a.getTime() - b.getTime())[0]
  return mondayOf(earliest ?? new Date())
}

const weekStart = ref(initialWeek())

// Si les rendez-vous arrivent après le premier rendu, on recadre une seule fois.
let framed = props.slots.length > 0
watch(
  () => props.slots.length,
  (count) => {
    if (!framed && count > 0) {
      weekStart.value = initialWeek()
      framed = true
    }
  }
)

const days = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart.value)
    day.setDate(day.getDate() + index)
    return day
  })
)

const dayKey = (value: Date | string) => new Date(value).toDateString()

/** Les rendez-vous de la semaine, rangés par jour. */
const byDay = computed(() => {
  const map = new Map<string, any[]>()
  for (const day of days.value) map.set(dayKey(day), [])
  for (const slot of props.slots) {
    const key = dayKey(slot.startsAt)
    if (map.has(key)) map.get(key)!.push(slot)
  }
  return map
})

const weekLabel = computed(() => {
  const first = days.value[0]
  const last = days.value[6]
  const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
  return `${fmt.format(first)} — ${fmt.format(last)}`
})

const hourRows = computed(() =>
  Array.from({ length: END_HOUR - START_HOUR }, (_, index) => `${String(START_HOUR + index).padStart(2, '0')}:00`)
)

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Minutes depuis le début de la plage, pour positionner un bloc. */
function minutesFromStart(value: Date | string) {
  const d = new Date(value)
  return (d.getHours() - START_HOUR) * 60 + d.getMinutes()
}

function blockStyle(slot: any) {
  const from = Math.max(0, minutesFromStart(slot.startsAt))
  const to = Math.min(RANGE_MINUTES, minutesFromStart(slot.endsAt))
  return {
    top: `${(from / RANGE_MINUTES) * 100}%`,
    height: `${(Math.max(STEP_MINUTES, to - from) / RANGE_MINUTES) * 100}%`
  }
}

/** Plein, partiel ou vide : la teinte dit l'état d'un rendez-vous d'un coup d'œil. */
function fillOf(slot: any) {
  const used = slot.occupancy?.total?.used ?? 0
  const capacity = slot.occupancy?.total?.capacity ?? slot.capacity?.total ?? 0
  if (!capacity) return 'empty'
  if (used >= capacity) return 'full'
  return used > 0 ? 'partial' : 'empty'
}

function occupancyLabel(slot: any) {
  const used = slot.occupancy?.total?.used ?? 0
  const capacity = slot.occupancy?.total?.capacity ?? slot.capacity?.total ?? 0
  return `${used}/${capacity}`
}

function stepStart(day: Date, step: number) {
  const start = new Date(day)
  start.setHours(START_HOUR, 0, 0, 0)
  start.setMinutes(start.getMinutes() + step * STEP_MINUTES)
  return start
}

function shiftWeek(weeks: number) {
  const next = new Date(weekStart.value)
  next.setDate(next.getDate() + weeks * 7)
  weekStart.value = next
}

function today() {
  weekStart.value = mondayOf(new Date())
}
</script>

<template>
  <div class="calendar">
    <div class="calendar__bar">
      <div class="cluster">
        <button class="btn btn--ghost btn--sm" type="button" @click="shiftWeek(-1)">
          ← {{ $t('admin.weekPrev') }}
        </button>
        <button class="btn btn--ghost btn--sm" type="button" @click="today">
          {{ $t('admin.weekToday') }}
        </button>
        <button class="btn btn--ghost btn--sm" type="button" @click="shiftWeek(1)">
          {{ $t('admin.weekNext') }} →
        </button>
      </div>
      <strong class="numeric">{{ weekLabel }}</strong>
    </div>

    <div class="calendar__scroll">
      <div class="calendar__grid">
        <!-- Colonne des heures -->
        <div class="calendar__gutter">
          <div class="calendar__corner" />
          <div class="calendar__hours">
            <div v-for="hour in hourRows" :key="hour" class="calendar__hour numeric">{{ hour }}</div>
          </div>
        </div>

        <!-- Une colonne par jour -->
        <div v-for="day in days" :key="day.toISOString()" class="calendar__day">
          <div class="calendar__head">{{ dayFormatter.format(day) }}</div>

          <div class="calendar__track">
            <!-- Cases cliquables, en fond -->
            <button
              v-for="step in STEPS"
              :key="step"
              type="button"
              class="calendar__cell"
              :style="{ top: `${((step - 1) / STEPS) * 100}%`, height: `${100 / STEPS}%` }"
              :aria-label="`${dayFormatter.format(day)} ${timeFormatter.format(stepStart(day, step - 1))}`"
              @click="emit('create', stepStart(day, step - 1))"
            />

            <!--
              Rendez-vous existants, au-dessus. Les deux natures cohabitent sur
              le même agenda mais ne se tiennent pas la même semaine : la teinte
              les distingue, sans quoi un rendez-vous administratif et une
              session de jeu se ressemblent trait pour trait.
            -->
            <button
              v-for="slot in byDay.get(dayKey(day))"
              :key="slot._id"
              type="button"
              class="calendar__slot"
              :class="[
                `calendar__slot--${fillOf(slot)}`,
                slot.kind === 'competition' ? 'calendar__slot--session' : ''
              ]"
              :style="blockStyle(slot)"
              :title="$t(slot.kind === 'competition' ? 'admin.slotKindCompetition' : 'admin.slotKindCheckin')"
              @click.stop="emit('select', slot)"
            >
              <span class="calendar__slot-time numeric">{{ timeFormatter.format(new Date(slot.startsAt)) }}</span>
              <span class="calendar__slot-count numeric">{{ occupancyLabel(slot) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <p class="muted calendar__legend">{{ $t('admin.calendarHint') }}</p>
  </div>
</template>

<style scoped lang="scss">
.calendar {
  display: grid;
  gap: var(--space-3);
}

.calendar__bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
}

.calendar__scroll {
  overflow-x: auto;
}

.calendar__grid {
  display: grid;
  grid-template-columns: 3.5rem repeat(7, minmax(6rem, 1fr));
  min-inline-size: 44rem;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.calendar__corner,
.calendar__head {
  block-size: 2.25rem;
  display: grid;
  place-items: center;
  font-size: var(--text-xs);
  font-weight: 600;
  background: var(--color-surface-2);
  border-block-end: 1px solid var(--color-line);
}

.calendar__day {
  border-inline-start: 1px solid var(--color-line);
}

.calendar__hours,
.calendar__track {
  position: relative;
  block-size: 26rem;
}

.calendar__hour {
  position: relative;
  block-size: calc(100% / 13);
  padding-inline-end: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-muted);
  text-align: end;
  border-block-start: 1px solid var(--color-line);
}

.calendar__cell {
  position: absolute;
  inset-inline: 0;
  background: none;
  border: 0;
  border-block-start: 1px dashed color-mix(in srgb, var(--color-line) 70%, transparent);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--color-gold) 12%, transparent);
  }
}

.calendar__slot {
  position: absolute;
  inset-inline: 2px;
  display: grid;
  gap: 2px;
  align-content: start;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-pitch);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-pitch) 16%, var(--color-paper));
  font-size: var(--text-xs);
  text-align: start;
  cursor: pointer;
  overflow: hidden;

  &:hover {
    filter: brightness(0.97);
  }
}

.calendar__slot--full {
  border-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 16%, var(--color-paper));
}

.calendar__slot--empty {
  border-color: var(--color-line);
  background: var(--color-surface-2);
}

/*
 * Session de jeu : teinte or, et un liseré à gauche pour rester lisible même
 * quand l'occupation repeint le fond. L'or est la couleur de la compétition
 * dans le reste de l'interface ; le vert pelouse reste celle des rendez-vous.
 */
.calendar__slot--session {
  border-color: var(--color-gold);
  border-inline-start-width: 3px;
  background: color-mix(in srgb, var(--color-gold) 16%, var(--color-paper));

  &.calendar__slot--empty {
    background: color-mix(in srgb, var(--color-gold) 8%, var(--color-surface-2));
  }
}

.calendar__slot-time {
  font-weight: 600;
}

.calendar__slot-count {
  color: var(--color-muted);
}

.calendar__legend {
  font-size: var(--text-xs);
}
</style>
