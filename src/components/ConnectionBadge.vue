<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  count: number
  type: 'archetype' | 'focus-area' | 'hypothesis' | 'idea' | 'decision' | 'objective' | 'journey-map' | 'document' | 'feedback' | 'changelog' | 'blocker'
  label?: string
  showZero?: boolean
}>()

const typeConfig: Record<string, { icon: string; color: string; bgColor: string; label: string }> = {
  'archetype': {
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    label: 'Archetypes'
  },
  'focus-area': {
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: 'Focus Areas'
  },
  'hypothesis': {
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    label: 'Hypotheses'
  },
  'idea': {
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    label: 'Ideas'
  },
  'decision': {
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    label: 'Decisions'
  },
  'objective': {
    icon: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: 'Objectives'
  },
  'journey-map': {
    icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    label: 'Journeys'
  },
  'document': {
    icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    color: 'text-gray-600',
    bgColor: 'bg-gray-200',
    label: 'Documents'
  },
  'feedback': {
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
    label: 'Feedback'
  },
  'changelog': {
    icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    label: 'Releases'
  },
  'blocker': {
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: 'Blockers'
  },
}

const config = computed(() => typeConfig[props.type] ?? typeConfig['document']!)
const displayLabel = computed(() => props.label || config.value?.label || '')
const shouldShow = computed(() => props.showZero || props.count > 0)
</script>

<template>
  <div
    v-if="shouldShow && config"
    :class="[
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      config.bgColor,
      config.color
    ]"
    :title="`${count} ${displayLabel}`"
  >
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="config.icon" />
    </svg>
    <span>{{ count }}</span>
  </div>
</template>
