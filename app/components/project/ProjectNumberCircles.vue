<script setup lang="ts">
/*
 * The trailing numbers of an NGI project name ("P.Name_45_11" → 45, 11) rendered as the signature
 * outlined circles also used in the expanded rows of the project table. Renders nothing if the
 * name carries no such numbers.
 */
const props = withDefaults(defineProps<{
  projectName?: string | null
  /* Closed projects get gray circles; anything else (or unknown) the primary color. */
  status?: string | null
  size?: 'sm' | 'md' | 'lg'
}>(), {
  projectName: null,
  status: null,
  size: 'md'
})

const fragments = computed(() => (props.projectName?.split(/[_.]/g) ?? []).slice(2, 4).filter(Boolean))
const avatarVariant = computed(() => props.status === 'closed' ? 'outline-gray' : 'outline-primary')
</script>

<template>
  <NAvatarGroup
    v-if="fragments.length"
    :max="2"
    aria-hidden="true"
  >
    <NAvatar
      v-for="fragment in fragments"
      :key="fragment"
      :avatar="avatarVariant"
      :label="fragment"
      :size="size"
    />
  </NAvatarGroup>
</template>
