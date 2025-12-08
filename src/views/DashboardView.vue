<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFocusAreasStore } from '@/stores/focusAreas'
import { useDiscoveryStore } from '@/stores/discovery'
import { useDeliveryStore } from '@/stores/delivery'
import { useVisionStore } from '@/stores/vision'
import { useCustomerArchetypesStore } from '@/stores/customerArchetypes'
import { useIdeasStore } from '@/stores/ideas'
import { useObjectivesStore } from '@/stores/objectives'
import { useDecisionsStore } from '@/stores/decisions'
import { useJourneyMapsStore } from '@/stores/journeyMaps'
import { useRelatedItems } from '@/composables/useRelatedItems'
import type { ConfidenceLevel } from '@/types'

const authStore = useAuthStore()
const focusAreasStore = useFocusAreasStore()
const discoveryStore = useDiscoveryStore()
const deliveryStore = useDeliveryStore()
const visionStore = useVisionStore()
const archetypesStore = useCustomerArchetypesStore()
const ideasStore = useIdeasStore()
const objectivesStore = useObjectivesStore()
const decisionsStore = useDecisionsStore()
const journeyMapsStore = useJourneyMapsStore()
const { getConnectionCounts, getAlignmentWarnings } = useRelatedItems()

const loading = computed(() =>
  focusAreasStore.loading || discoveryStore.loading || deliveryStore.loading || visionStore.loading ||
  archetypesStore.loading || ideasStore.loading || objectivesStore.loading || decisionsStore.loading
)

// Connection statistics
const connectionStats = computed(() => getConnectionCounts())
const alignmentWarnings = computed(() => getAlignmentWarnings())

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
  visionStore.subscribe()
  archetypesStore.subscribe()
  ideasStore.subscribe()
  objectivesStore.subscribe()
  decisionsStore.subscribe()
  journeyMapsStore.subscribe()
})

onUnmounted(() => {
  focusAreasStore.unsubscribe()
  discoveryStore.unsubscribe()
  deliveryStore.unsubscribe()
  visionStore.unsubscribe()
  archetypesStore.unsubscribe()
  ideasStore.unsubscribe()
  objectivesStore.unsubscribe()
  decisionsStore.unsubscribe()
  journeyMapsStore.unsubscribe()
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
      <!-- Product Vision Summary -->
      <div v-if="visionStore.vision?.vision" class="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 rounded-xl shadow-lg overflow-hidden">
        <div class="px-6 py-5">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-3">
                <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
                <h3 class="text-white/80 text-sm font-medium uppercase tracking-wide">Product Vision</h3>
              </div>
              <p class="text-white text-lg font-medium leading-relaxed">
                {{ visionStore.vision.vision }}
              </p>
              <div v-if="visionStore.vision.mission" class="mt-4 pt-4 border-t border-white/20">
                <p class="text-white/70 text-sm">
                  <span class="font-medium text-white/90">Mission:</span> {{ visionStore.vision.mission }}
                </p>
              </div>
            </div>
            <RouterLink
              to="/vision"
              class="flex-shrink-0 ml-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title="View Vision & Principles"
            >
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </RouterLink>
          </div>
        </div>
        <!-- Key Principles Preview -->
        <div v-if="visionStore.vision.principles && visionStore.vision.principles.length > 0" class="bg-black/10 px-6 py-3">
          <div class="flex items-center gap-4 overflow-x-auto">
            <span class="text-white/60 text-xs font-medium uppercase tracking-wide flex-shrink-0">Key Principles:</span>
            <div class="flex gap-2">
              <span
                v-for="principle in visionStore.vision.principles.slice(0, 4)"
                :key="principle.id"
                class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white/20 text-white truncate max-w-[150px]"
                :title="principle.title"
              >
                {{ principle.title }}
              </span>
              <span
                v-if="visionStore.vision.principles.length > 4"
                class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/70"
              >
                +{{ visionStore.vision.principles.length - 4 }} more
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- No Vision Set State -->
      <RouterLink
        v-else
        to="/vision"
        class="block bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-6 hover:border-indigo-300 hover:from-indigo-50 hover:to-purple-50 transition-all group"
      >
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-gray-200 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
            <svg class="w-6 h-6 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 group-hover:text-indigo-900 transition-colors">Set Your Product Vision</h3>
            <p class="text-sm text-gray-500 group-hover:text-indigo-600 transition-colors">Define your product vision, mission, and guiding principles to align your team.</p>
          </div>
          <svg class="w-5 h-5 text-gray-400 group-hover:text-indigo-500 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </RouterLink>

      <!-- Alignment Status Panel - Command Center -->
      <div v-if="authStore.canViewTeamContent && alignmentWarnings.length > 0" class="card p-4 border-l-4 border-l-amber-400">
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <h3 class="text-sm font-medium text-gray-900">Alignment Status</h3>
          <span class="text-xs text-gray-400">({{ alignmentWarnings.length }} items need attention)</span>
        </div>
        <div class="space-y-2">
          <RouterLink
            v-for="(warning, index) in alignmentWarnings.slice(0, 4)"
            :key="index"
            :to="warning.path"
            class="flex items-center gap-3 p-2 rounded-lg hover:bg-amber-50 transition-colors"
          >
            <svg
              :class="[
                'w-4 h-4 flex-shrink-0',
                warning.type === 'warning' ? 'text-amber-500' : 'text-blue-500'
              ]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                v-if="warning.type === 'warning'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
              <path
                v-else
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span class="text-sm text-gray-700">{{ warning.message }}</span>
            <svg class="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </RouterLink>
          <div v-if="alignmentWarnings.length > 4" class="text-xs text-gray-400 text-center pt-2">
            +{{ alignmentWarnings.length - 4 }} more items to review
          </div>
        </div>
      </div>

      <!-- Connection Statistics Panel -->
      <div v-if="authStore.canViewTeamContent" class="card p-4">
        <div class="flex items-center gap-2 mb-4">
          <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
          <h3 class="text-sm font-medium text-gray-900">Data Connectivity Overview</h3>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="text-center">
            <div class="text-2xl font-semibold text-purple-600">{{ connectionStats.archetypesWithFocusAreas }}</div>
            <div class="text-xs text-gray-500">Archetypes with Focus Areas</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-semibold text-blue-600">{{ connectionStats.hypothesesWithArchetypes }}</div>
            <div class="text-xs text-gray-500">Hypotheses with Archetypes</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-semibold text-green-600">{{ connectionStats.objectivesWithFocusAreas }}</div>
            <div class="text-xs text-gray-500">OKRs aligned to Focus</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-semibold text-indigo-600">{{ connectionStats.decisionsWithEvidence }}</div>
            <div class="text-xs text-gray-500">Evidence-Based Decisions</div>
          </div>
        </div>
      </div>

      <!-- Stats grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <RouterLink to="/focus-areas" class="card p-4 hover:border-gray-300 transition-colors">
          <div class="text-xs font-medium text-gray-500">Focus Areas</div>
          <div class="text-2xl font-semibold text-gray-900 mt-1">
            {{ focusAreasStore.activeFocusAreas.length }}
          </div>
        </RouterLink>

        <RouterLink to="/customer-archetypes" class="card p-4 hover:border-gray-300 transition-colors">
          <div class="text-xs font-medium text-gray-500">Archetypes</div>
          <div class="text-2xl font-semibold text-purple-600 mt-1">
            {{ archetypesStore.activeArchetypes.length }}
          </div>
        </RouterLink>

        <RouterLink
          v-if="authStore.canViewTeamContent"
          to="/discovery"
          class="card p-4 hover:border-gray-300 transition-colors"
        >
          <div class="text-xs font-medium text-gray-500">Hypotheses</div>
          <div class="text-2xl font-semibold text-yellow-600 mt-1">
            {{ discoveryStore.activeHypotheses.length }}
          </div>
        </RouterLink>

        <RouterLink to="/idea-hopper" class="card p-4 hover:border-gray-300 transition-colors">
          <div class="text-xs font-medium text-gray-500">Ideas</div>
          <div class="text-2xl font-semibold text-amber-600 mt-1">
            {{ ideasStore.ideas.length }}
          </div>
        </RouterLink>

        <div v-if="authStore.canViewTeamContent" class="card p-4">
          <div class="text-xs font-medium text-gray-500">Validated This Week</div>
          <div class="text-2xl font-semibold text-green-600 mt-1">
            {{ validatedThisWeek }}
          </div>
        </div>

        <RouterLink
          v-if="authStore.canViewTeamContent"
          to="/delivery"
          class="card p-4 hover:border-gray-300 transition-colors"
        >
          <div class="text-xs font-medium text-gray-500">Blockers</div>
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
