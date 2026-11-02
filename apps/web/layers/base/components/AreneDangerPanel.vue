<script setup lang="ts">
/**
 * Panneau de confirmation d'une suppression définitive.
 *
 * Partagé par la suppression d'un dossier et celle d'un compte : les deux
 * posent la même question et doivent la poser de la même manière. Un écran
 * qui invente ses propres garde-fous à chaque endroit finit par en oublier un.
 *
 * Ce qu'il impose, dans cet ordre :
 *
 *  1. **Ce qui disparaît**, chiffré, avant toute saisie. C'est l'aperçu
 *     d'impact rendu par l'API — pas une liste écrite à la main ici, qui se
 *     désynchroniserait du jour où la cascade changerait.
 *  2. **Les blocages**, séparés en deux. Les `hard` ferment le bouton pour de
 *     bon ; les autres demandent de cocher « je passe outre », case qui part en
 *     `force` et dans le journal d'audit.
 *  3. **Le motif**, dix caractères au moins. L'objet s'en va : le journal est
 *     tout ce qui restera pour expliquer le geste.
 *  4. **La référence retapée**. Le bouton reste fermé tant qu'elle ne
 *     correspond pas, et l'API la revérifie — ici ce n'est qu'un garde-fou de
 *     confort, la vraie barrière est côté serveur.
 */
const props = defineProps<{
  title: string
  /** Lignes « ce qui disparaît » : libellé + nombre. */
  items: Array<{ label: string; value: number | string }>
  /** Blocages levables en cochant « passer outre ». */
  blockers?: Array<{ code: string; label: string }>
  /** Blocages structurels : aucune case ne les lève. */
  hard?: Array<{ code: string; label: string }>
  /** Référence exacte à retaper (numéro de dossier, email du compte). */
  confirmExpected: string
  pending?: boolean
}>()

const emit = defineEmits<{
  confirm: [payload: { reason: string; confirm: string; force: boolean }]
  cancel: []
}>()

const reason = ref('')
const confirm = ref('')
const force = ref(false)

const blocked = computed(() => (props.hard?.length ?? 0) > 0)
const needsForce = computed(() => (props.blockers?.length ?? 0) > 0)

/*
 * Comparaison insensible a la casse et aux espaces de bord, comme cote serveur :
 * retaper un email colle souvent une majuscule involontaire, et transformer
 * cela en echec serait une brimade sans effet sur la securite.
 */
const matches = computed(
  () => confirm.value.trim().toLowerCase() === props.confirmExpected.trim().toLowerCase()
)

const ready = computed(
  () =>
    !blocked.value &&
    reason.value.trim().length >= 10 &&
    matches.value &&
    (!needsForce.value || force.value)
)

function submit() {
  if (!ready.value) return
  emit('confirm', { reason: reason.value.trim(), confirm: confirm.value.trim(), force: force.value })
}
</script>

<template>
  <section class="danger card">
    <div class="spread">
      <h2 class="card__title danger__title">{{ title }}</h2>
      <button class="btn btn--quiet btn--sm" type="button" @click="emit('cancel')">
        {{ $t('common.close') }}
      </button>
    </div>

    <AreneNotice tone="danger">{{ $t('danger.irreversible') }}</AreneNotice>

    <div>
      <h3 class="danger__subtitle">{{ $t('danger.whatGoes') }}</h3>
      <dl class="danger__items">
        <div v-for="item in items" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd class="numeric">{{ item.value }}</dd>
        </div>
      </dl>
    </div>

    <!-- Blocages structurels : on explique, et le bouton reste fermé. -->
    <AreneNotice v-if="hard?.length" tone="danger" :title="$t('danger.refused')">
      <ul class="danger__list">
        <li v-for="blocker in hard" :key="blocker.code">{{ blocker.label }}</li>
      </ul>
    </AreneNotice>

    <!-- Blocages d'arbitrage : levables, mais jamais en silence. -->
    <template v-if="needsForce">
      <AreneNotice tone="warning" :title="$t('danger.warnings')">
        <ul class="danger__list">
          <li v-for="blocker in blockers" :key="blocker.code">{{ blocker.label }}</li>
        </ul>
      </AreneNotice>
      <label class="check" :class="{ 'check--checked': force }">
        <input v-model="force" type="checkbox" :disabled="blocked">
        <span>{{ $t('danger.override') }}</span>
      </label>
    </template>

    <AreneField
      :label="$t('danger.reason')"
      :hint="$t('danger.reasonHint')"
      for="dangerReason"
      required
    >
      <textarea
        id="dangerReason"
        v-model="reason"
        class="input"
        rows="3"
        minlength="10"
        maxlength="500"
        :disabled="blocked"
      />
    </AreneField>

    <AreneField
      :label="$t('danger.confirm', { reference: confirmExpected })"
      for="dangerConfirm"
      required
    >
      <input
        id="dangerConfirm"
        v-model="confirm"
        class="input"
        autocomplete="off"
        :disabled="blocked"
      >
    </AreneField>

    <div class="cluster">
      <button
        class="btn btn--danger"
        type="button"
        :disabled="!ready || pending"
        @click="submit"
      >
        {{ $t('danger.delete') }}
      </button>
      <button class="btn btn--quiet" type="button" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.danger {
  border-color: var(--color-danger, #b3261e);
  box-shadow: var(--shadow-lg);
  display: grid;
  gap: var(--space-3);
}

.danger__title {
  color: var(--color-danger, #b3261e);
}

.danger__subtitle {
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  margin-block-end: var(--space-2);
  text-transform: uppercase;
}

.danger__items {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));

  dt {
    color: var(--color-muted);
    font-size: var(--text-xs);
  }

  dd {
    font-weight: 600;
    margin: 0;
  }
}

.danger__list {
  margin: 0;
  padding-inline-start: var(--space-4);
}
</style>
