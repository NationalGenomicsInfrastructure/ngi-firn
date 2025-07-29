<script setup lang="ts">

const props = defineProps<{
    title: string
    subtitle?: string
    description?: string
}>()
</script>

<template>
    <div flex="~ col" class="text-center space-y-1 lg:text-left lg:space-y-2 mb-8 mt-4">
        <h1 class="scroll-m-20 text-center font-extrabold tracking-tight text-balance text-2xl lg:text-3xl">
            {{ props.title }} 
        </h1>
        <h2 v-if="props.subtitle" class="scroll-m-20 border-l-3 border-l-primary pl-2 font-semibold tracking-tight first:mt-0 text-xl lg:text-2xl"> 
            {{ props.subtitle }}
        </h2>
        <p v-if="props.description" class="text-center text-muted text-md md:text-lg"> 
            {{ props.description }} 
        </p>
    </div>
</template>