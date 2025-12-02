<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const route = useRoute()
const authStore = useAuthStore()

interface NavItem {
  name: string
  path: string
  icon: string
  roles: ('cpo' | 'team' | 'leadership')[]
}

const navItems: NavItem[] = [
  { name: 'Dashboard', path: '/', icon: 'home', roles: ['cpo', 'team', 'leadership'] },
  { name: 'Vision & Principles', path: '/vision', icon: 'star', roles: ['cpo', 'team', 'leadership'] },
  { name: 'Focus Areas', path: '/focus-areas', icon: 'target', roles: ['cpo', 'team', 'leadership'] },
  { name: 'Strategic Context', path: '/strategic-context', icon: 'compass', roles: ['cpo', 'team'] },
  { name: 'Team Objectives', path: '/objectives', icon: 'flag', roles: ['cpo', 'team'] },
  { name: 'Discovery Hub', path: '/discovery', icon: 'search', roles: ['cpo', 'team'] },
  { name: 'Delivery Tracker', path: '/delivery', icon: 'truck', roles: ['cpo', 'team'] },
  { name: 'Decisions Log', path: '/decisions', icon: 'clipboard', roles: ['cpo', 'team'] },
  { name: 'Documents', path: '/documents', icon: 'folder', roles: ['cpo', 'team'] },
  { name: 'Idea Hopper', path: '/idea-hopper', icon: 'lightbulb', roles: ['cpo', 'team'] },
  { name: 'Journey Maps', path: '/journey-maps', icon: 'map', roles: ['cpo', 'team'] },
]

const visibleNavItems = computed(() => {
  if (!authStore.role) return []
  return navItems.filter((item) => item.roles.includes(authStore.role!))
})

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const iconPaths: Record<string, string> = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  target: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  compass: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  flag: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  truck: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  folder: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  lightbulb: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  map: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
}
</script>

<template>
  <aside
    :class="[
      'flex flex-col bg-gray-900 text-gray-100 transition-all duration-200',
      collapsed ? 'w-16' : 'w-64',
    ]"
  >
    <!-- Logo -->
    <div class="flex h-16 items-center justify-between px-4 border-b border-gray-800">
      <span v-if="!collapsed" class="text-lg font-semibold">Signal</span>
      <button
        class="p-1.5 rounded hover:bg-gray-800 transition-colors"
        @click="emit('toggle')"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            :d="collapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'"
          />
        </svg>
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 py-4 space-y-1 overflow-y-auto">
      <RouterLink
        v-for="item in visibleNavItems"
        :key="item.path"
        :to="item.path"
        :class="[
          'flex items-center mx-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          isActive(item.path)
            ? 'bg-accent-600 text-white'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white',
        ]"
        :title="collapsed ? item.name : undefined"
      >
        <svg
          class="w-5 h-5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            :d="iconPaths[item.icon]"
          />
        </svg>
        <span
          v-if="!collapsed"
          class="ml-3 truncate"
        >
          {{ item.name }}
        </span>
      </RouterLink>
    </nav>

    <!-- User info -->
    <div class="border-t border-gray-800 p-4">
      <div v-if="!collapsed" class="text-xs text-gray-400">
        <div class="font-medium text-gray-200 truncate">{{ authStore.user?.displayName }}</div>
        <div class="truncate">{{ authStore.user?.email }}</div>
        <span class="inline-block mt-1 px-2 py-0.5 bg-gray-800 rounded text-gray-300 capitalize">
          {{ authStore.role }}
        </span>
      </div>
      <div v-else class="flex justify-center">
        <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium">
          {{ authStore.user?.displayName?.charAt(0) || '?' }}
        </div>
      </div>
    </div>
  </aside>
</template>
