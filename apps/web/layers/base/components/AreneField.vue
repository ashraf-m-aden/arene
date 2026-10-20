<script setup lang="ts">
defineProps<{
  label: string
  hint?: string
  error?: string
  required?: boolean
  for?: string
}>()
</script>

<template>
  <div class="field">
    <label class="field__label" :for="$props.for">
      {{ label }}
      <span v-if="required" class="field__required" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="hint && !error" class="field__hint">{{ hint }}</p>
    <p v-if="error" class="field__error" role="alert">{{ error }}</p>
  </div>
</template>
