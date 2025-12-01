<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

defineProps<{
  title: string
  sidebarCollapsed: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
}>()

const authStore = useAuthStore()
const router = useRouter()

async function handleLogout() {
  await authStore.signOut()
  router.push('/login')
}
</script>

<template>
  <header class="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
    <div class="flex items-center gap-4">
      <button
        class="p-1.5 rounded hover:bg-gray-100 transition-colors lg:hidden"
        @click="emit('toggleSidebar')"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <h1 class="text-xl font-semibold text-gray-900">{{ title }}</h1>
    </div>

    <div class="flex items-center gap-4">
      <span class="text-sm text-gray-600 hidden sm:block">
        {{ authStore.user?.displayName }}
      </span>
      <button
        class="btn-ghost text-sm"
        @click="handleLogout"
      >
        Sign out
      </button>
    </div>
  </header>
</template>
