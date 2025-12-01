<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFocusAreasStore } from '@/stores/focusAreas'
import { useDiscoveryStore } from '@/stores/discovery'
import { useDeliveryStore } from '@/stores/delivery'
import type { ConfidenceLevel } from '@/types'

const authStore = useAuthStore()
const focusAreasStore = useFocusAreasStore()
const discoveryStore = useDiscoveryStore()
const deliveryStore = useDeliveryStore()

const loading = computed(() =>
  focusAreasStore.loading || discoveryStore.loading || deliveryStore.loading
)

// Calculate validated this week
const validatedThisWeek = computed(() => {
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  return discoveryStore.hypotheses.filter((h) => {
    if (h.status !== 'validated') return false
    if (!h.updatedAt) return false
    const updatedDate = h.updatedAt.toDate()
    return updatedDate >= oneWeekAgo
  }).length
})

// Recent changelog entries
const recentChangelog = computed(() => {
  return deliveryStore.changelog.slice(0, 5)
})

onMounted(() => {
  focusAreasStore.subscribe()
  discoveryStore.subscribe()
  deliveryStore.subscribe()
})

onUnmounted(() => {
  focusAreasStore.unsubscribe()
  discoveryStore.unsubscribe()
  deliveryStore.unsubscribe()
})

function getConfidenceBadgeClass(level: ConfidenceLevel) {
  switch (level) {
    case 'high':
      return 'badge-green'
    case 'medium':
      return 'badge-yellow'
    case 'low':
      return 'badge-red'
  }
}

function formatDate(timestamp: { toDate: () => Date } | null) {
  if (!timestamp) return ''
  const date = timestamp.toDate()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Welcome section -->
    <div>
      <h2 class="text-lg font-medium text-gray-900">
        Welcome back, {{ authStore.user?.displayName?.split(' ')[0] }}
      </h2>
      <p class="text-sm text-gray-500 mt-1">Here's what's happening with Signal today.</p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Stats grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RouterLink to="/focus-areas" class="card p-4 hover:border-gray-300 transition-colors">
          <div class="text-sm font-medium text-gray-500">Active Focus Areas</div>
          <div class="text-2xl font-semibold text-gray-900 mt-1">
            {{ focusAreasStore.activeFocusAreas.length }}
          </div>
        </RouterLink>

        <RouterLink
          v-if="authStore.canViewTeamContent"
          to="/discovery"
          class="card p-4 hover:border-gray-300 transition-colors"
        >
          <div class="text-sm font-medium text-gray-500">Active Hypotheses</div>
          <div class="text-2xl font-semibold text-gray-900 mt-1">
            {{ discoveryStore.activeHypotheses.length }}
          </div>
        </RouterLink>

        <div v-if="authStore.canViewTeamContent" class="card p-4">
          <div class="text-sm font-medium text-gray-500">Validated This Week</div>
          <div class="text-2xl font-semibold text-green-600 mt-1">
            {{ validatedThisWeek }}
          </div>
        </div>

        <RouterLink
          v-if="authStore.canViewTeamContent"
          to="/delivery"
          class="card p-4 hover:border-gray-300 transition-colors"
        >
          <div class="text-sm font-medium text-gray-500">Open Blockers</div>
          <div
            :class="[
              'text-2xl font-semibold mt-1',
              deliveryStore.openBlockers.length > 0 ? 'text-red-600' : 'text-gray-900'
            ]"
          >
            {{ deliveryStore.openBlockers.length }}
          </div>
        </RouterLink>
      </div>

      <!-- Quick links -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Current Focus Areas -->
        <div class="card p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-gray-900">Current Focus Areas</h3>
            <RouterLink to="/focus-areas" class="text-xs text-accent-600 hover:text-accent-700">
              View all
            </RouterLink>
          </div>

          <div v-if="focusAreasStore.activeFocusAreas.length === 0" class="text-sm text-gray-500">
            No focus areas yet. Add one to get started.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="fa in focusAreasStore.activeFocusAreas.slice(0, 4)"
              :key="fa.id"
              class="flex items-center justify-between"
            >
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 truncate">{{ fa.title }}</div>
              </div>
              <span :class="getConfidenceBadgeClass(fa.confidenceLevel)" class="ml-2">
                {{ fa.confidenceLevel }}
              </span>
            </div>
          </div>
        </div>

        <!-- Recent Updates (Changelog) -->
        <div class="card p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-gray-900">Recent Releases</h3>
            <RouterLink
              v-if="authStore.canViewTeamContent"
              to="/delivery"
              class="text-xs text-accent-600 hover:text-accent-700"
            >
              View all
            </RouterLink>
          </div>

          <div v-if="recentChangelog.length === 0" class="text-sm text-gray-500">
            No recent releases.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="entry in recentChangelog"
              :key="entry.id"
              class="flex items-center gap-2 text-sm"
            >
              <span class="text-gray-400 text-xs">{{ formatDate(entry.shippedAt) }}</span>
              <span class="text-gray-900 truncate">{{ entry.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Hypotheses (team/CPO only) -->
      <div v-if="authStore.canViewTeamContent" class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium text-gray-900">Active Hypotheses</h3>
          <RouterLink to="/discovery" class="text-xs text-accent-600 hover:text-accent-700">
            View all
          </RouterLink>
        </div>

        <div v-if="discoveryStore.activeHypotheses.length === 0" class="text-sm text-gray-500">
          No active hypotheses. Start tracking your experiments in the Discovery Hub.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="h in discoveryStore.activeHypotheses.slice(0, 5)"
            :key="h.id"
            class="border-b border-gray-100 pb-3 last:border-0 last:pb-0"
          >
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-900">{{ h.belief }}</div>
                <div class="text-xs text-gray-500 mt-1">
                  Test: {{ h.test }}
                </div>
              </div>
              <div class="flex gap-1">
                <span
                  v-for="risk in h.risks"
                  :key="risk"
                  class="badge-gray text-xs"
                >
                  {{ risk }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Open Blockers Alert -->
      <div
        v-if="authStore.canViewTeamContent && deliveryStore.openBlockers.length > 0"
        class="card p-4 border-l-4 border-l-red-400"
      >
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium text-gray-900">Open Blockers Requiring Attention</h3>
          <RouterLink to="/delivery" class="text-xs text-accent-600 hover:text-accent-700">
            View all
          </RouterLink>
        </div>

        <div class="space-y-2">
          <div
            v-for="blocker in deliveryStore.openBlockers.slice(0, 3)"
            :key="blocker.id"
            class="flex items-center justify-between text-sm"
          >
            <span class="text-gray-900">{{ blocker.title }}</span>
            <span v-if="blocker.owner" class="text-xs text-gray-400">{{ blocker.owner }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
