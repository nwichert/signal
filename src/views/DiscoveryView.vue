<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDiscoveryStore } from '@/stores/discovery'
import { useFocusAreasStore } from '@/stores/focusAreas'
import { useCustomerArchetypesStore } from '@/stores/customerArchetypes'
import { useDecisionsStore } from '@/stores/decisions'
import { useDeliveryStore } from '@/stores/delivery'
import type { Hypothesis, HypothesisStatus, RiskType } from '@/types'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import RelatedItems from '@/components/RelatedItems.vue'

const authStore = useAuthStore()
const discoveryStore = useDiscoveryStore()
const focusAreasStore = useFocusAreasStore()
const archetypesStore = useCustomerArchetypesStore()
const decisionsStore = useDecisionsStore()
const deliveryStore = useDeliveryStore()

const activeFilter = ref<HypothesisStatus | 'all'>('all')
const showAddHypothesis = ref(false)
const showAddFeedback = ref(false)
const editingHypothesis = ref<Hypothesis | null>(null)

const filters = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'validated', label: 'Validated' },
  { value: 'invalidated', label: 'Invalidated' },
  { value: 'parked', label: 'Parked' },
] as const

const riskTypes: { value: RiskType; label: string; class: string }[] = [
  { value: 'valuable', label: 'Valuable', class: 'badge-blue' },
  { value: 'usable', label: 'Usable', class: 'badge-green' },
  { value: 'feasible', label: 'Feasible', class: 'badge-yellow' },
  { value: 'viable', label: 'Viable', class: 'badge-gray' },
]

const defaultHypothesisForm = {
  belief: '',
  test: '',
  result: '',
  risks: [] as RiskType[],
  focusAreaId: '',
  archetypeId: '',
}

const hypothesisForm = ref({ ...defaultHypothesisForm })

const feedbackForm = ref({
  source: '',
  content: '',
  theme: '',
  archetypeId: '',
})

// Expanded hypothesis for showing connections
const expandedHypothesisId = ref<string | null>(null)

const filteredHypotheses = computed(() => {
  return discoveryStore.filterByStatus(activeFilter.value)
})

const filterCounts = computed(() => ({
  all: discoveryStore.hypotheses.length,
  active: discoveryStore.activeHypotheses.length,
  validated: discoveryStore.validatedHypotheses.length,
  invalidated: discoveryStore.invalidatedHypotheses.length,
  parked: discoveryStore.parkedHypotheses.length,
}))

onMounted(() => {
  discoveryStore.subscribe()
  focusAreasStore.subscribe()
  archetypesStore.subscribe()
  decisionsStore.subscribe()
  deliveryStore.subscribe()
})

onUnmounted(() => {
  discoveryStore.unsubscribe()
  focusAreasStore.unsubscribe()
  archetypesStore.unsubscribe()
  decisionsStore.unsubscribe()
  deliveryStore.unsubscribe()
})

function resetHypothesisForm() {
  hypothesisForm.value = { ...defaultHypothesisForm, risks: [] }
  showAddHypothesis.value = false
  editingHypothesis.value = null
}

function toggleRisk(risk: RiskType) {
  const idx = hypothesisForm.value.risks.indexOf(risk)
  if (idx >= 0) {
    hypothesisForm.value.risks.splice(idx, 1)
  } else {
    hypothesisForm.value.risks.push(risk)
  }
}

async function handleSubmitHypothesis() {
  if (editingHypothesis.value) {
    await discoveryStore.updateHypothesis(editingHypothesis.value.id, {
      belief: hypothesisForm.value.belief,
      test: hypothesisForm.value.test,
      result: hypothesisForm.value.result,
      risks: hypothesisForm.value.risks,
      focusAreaId: hypothesisForm.value.focusAreaId || undefined,
      archetypeId: hypothesisForm.value.archetypeId || undefined,
    })
  } else {
    await discoveryStore.addHypothesis({
      belief: hypothesisForm.value.belief,
      test: hypothesisForm.value.test,
      risks: hypothesisForm.value.risks,
      focusAreaId: hypothesisForm.value.focusAreaId || undefined,
      archetypeId: hypothesisForm.value.archetypeId || undefined,
    })
  }
  resetHypothesisForm()
}

function startEditingHypothesis(h: Hypothesis) {
  editingHypothesis.value = h
  hypothesisForm.value = {
    belief: h.belief,
    test: h.test,
    result: h.result || '',
    risks: [...h.risks],
    focusAreaId: h.focusAreaId || '',
    archetypeId: h.archetypeId || '',
  }
  showAddHypothesis.value = true
}

async function updateStatus(id: string, status: HypothesisStatus) {
  await discoveryStore.updateHypothesis(id, { status })
}

async function handleDeleteHypothesis(id: string) {
  if (!confirm('Delete this hypothesis?')) return
  await discoveryStore.deleteHypothesis(id)
}

async function handleSubmitFeedback() {
  await discoveryStore.addFeedback({
    source: feedbackForm.value.source,
    content: feedbackForm.value.content,
    theme: feedbackForm.value.theme,
    archetypeId: feedbackForm.value.archetypeId || undefined,
  })
  feedbackForm.value = { source: '', content: '', theme: '', archetypeId: '' }
  showAddFeedback.value = false
}

async function handleDeleteFeedback(id: string) {
  if (!confirm('Delete this feedback?')) return
  await discoveryStore.deleteFeedback(id)
}

function getStatusBadgeClass(status: HypothesisStatus) {
  switch (status) {
    case 'active':
      return 'badge-blue'
    case 'validated':
      return 'badge-green'
    case 'invalidated':
      return 'badge-red'
    case 'parked':
      return 'badge-gray'
  }
}

function getRiskBadgeClass(risk: RiskType) {
  return riskTypes.find((r) => r.value === risk)?.class || 'badge-gray'
}

function getFocusAreaTitle(id?: string) {
  if (!id) return null
  const fa = focusAreasStore.focusAreas.find((f) => f.id === id)
  return fa?.title
}

function getArchetypeName(id?: string) {
  if (!id) return null
  const arch = archetypesStore.archetypes.find((a) => a.id === id)
  return arch?.name
}

function toggleExpanded(id: string) {
  expandedHypothesisId.value = expandedHypothesisId.value === id ? null : id
}

// Get related items for a hypothesis
function getRelatedItems(hypothesisId: string) {
  const items: { id: string; type: string; title: string; status?: string; path?: string }[] = []
  const hypothesis = discoveryStore.hypotheses.find(h => h.id === hypothesisId)

  // Focus Area
  if (hypothesis?.focusAreaId) {
    const fa = focusAreasStore.focusAreas.find(f => f.id === hypothesis.focusAreaId)
    if (fa) {
      items.push({
        id: fa.id, type: 'focus-area', title: fa.title, status: fa.status, path: '/focus-areas'
      })
    }
  }

  // Archetype
  if (hypothesis?.archetypeId) {
    const arch = archetypesStore.archetypes.find(a => a.id === hypothesis.archetypeId)
    if (arch) {
      items.push({
        id: arch.id, type: 'archetype', title: arch.name, status: arch.status, path: '/customer-archetypes'
      })
    }
  }

  // Decisions using this hypothesis
  decisionsStore.decisions
    .filter(d => d.relatedHypothesisIds?.includes(hypothesisId))
    .forEach(d => items.push({
      id: d.id, type: 'decision', title: d.title, status: d.status, path: '/decisions'
    }))

  // Changelog entries that validated this hypothesis
  deliveryStore.changelog
    .filter(c => c.validatedHypothesisIds?.includes(hypothesisId))
    .forEach(c => items.push({
      id: c.id, type: 'changelog', title: c.title, path: '/delivery'
    }))

  return items
}

// Get connection counts for a hypothesis
function getConnectionCounts(hypothesisId: string) {
  const hypothesis = discoveryStore.hypotheses.find(h => h.id === hypothesisId)
  return {
    focusArea: hypothesis?.focusAreaId ? 1 : 0,
    archetype: hypothesis?.archetypeId ? 1 : 0,
    decisions: decisionsStore.decisions.filter(d => d.relatedHypothesisIds?.includes(hypothesisId)).length,
    changelog: deliveryStore.changelog.filter(c => c.validatedHypothesisIds?.includes(hypothesisId)).length,
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <p class="text-sm text-gray-500">Track hypotheses, experiments, and design partner feedback.</p>
      <button
        v-if="authStore.canEdit && !showAddHypothesis"
        class="btn-primary text-sm"
        @click="showAddHypothesis = true"
      >
        New Hypothesis
      </button>
    </div>

    <!-- Add/Edit Hypothesis Form -->
    <div v-if="showAddHypothesis" class="card p-6 space-y-4">
      <h3 class="font-medium text-gray-900">
        {{ editingHypothesis ? 'Edit Hypothesis' : 'New Hypothesis' }}
      </h3>

      <div>
        <label class="label">We believe that... (Belief)</label>
        <textarea
          v-model="hypothesisForm.belief"
          class="input min-h-[60px]"
          placeholder="State your hypothesis..."
        />
      </div>

      <div>
        <label class="label">We will test this by... (Test)</label>
        <textarea
          v-model="hypothesisForm.test"
          class="input min-h-[60px]"
          placeholder="How will you validate or invalidate this?"
        />
      </div>

      <div v-if="editingHypothesis">
        <label class="label">Result</label>
        <textarea
          v-model="hypothesisForm.result"
          class="input min-h-[60px]"
          placeholder="What did you learn?"
        />
      </div>

      <div>
        <label class="label">Risk Types Being Tested</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="risk in riskTypes"
            :key="risk.value"
            :class="[
              'px-3 py-1.5 text-sm rounded-md border transition-colors',
              hypothesisForm.risks.includes(risk.value)
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            ]"
            @click="toggleRisk(risk.value)"
          >
            {{ risk.label }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label">Related Focus Area (optional)</label>
          <select v-model="hypothesisForm.focusAreaId" class="input">
            <option value="">None</option>
            <option
              v-for="fa in focusAreasStore.activeFocusAreas"
              :key="fa.id"
              :value="fa.id"
            >
              {{ fa.title }}
            </option>
          </select>
        </div>

        <div>
          <label class="label">About Customer Archetype (optional)</label>
          <select v-model="hypothesisForm.archetypeId" class="input">
            <option value="">None</option>
            <option
              v-for="arch in archetypesStore.activeArchetypes"
              :key="arch.id"
              :value="arch.id"
            >
              {{ arch.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="btn-ghost" @click="resetHypothesisForm">Cancel</button>
        <button
          class="btn-primary"
          :disabled="discoveryStore.saving || !hypothesisForm.belief.trim()"
          @click="handleSubmitHypothesis"
        >
          {{ discoveryStore.saving ? 'Saving...' : editingHypothesis ? 'Update' : 'Add Hypothesis' }}
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex gap-2 flex-wrap">
      <button
        v-for="filter in filters"
        :key="filter.value"
        :class="[
          'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
          activeFilter === filter.value
            ? 'bg-gray-900 text-white'
            : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
        ]"
        @click="activeFilter = filter.value"
      >
        {{ filter.label }} ({{ filterCounts[filter.value] }})
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="discoveryStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Hypotheses list -->
      <section>
        <h2 class="text-sm font-medium text-gray-700 mb-3">Hypotheses</h2>

        <div v-if="filteredHypotheses.length === 0" class="card p-6 text-center">
          <p class="text-sm text-gray-500">No hypotheses yet. Add one to start tracking your experiments.</p>
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="h in filteredHypotheses"
            :key="h.id"
            class="card overflow-hidden group"
          >
            <!-- Main content - clickable to expand -->
            <div
              class="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              @click="toggleExpanded(h.id)"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <svg
                      :class="[
                        'w-4 h-4 text-gray-400 transition-transform flex-shrink-0',
                        expandedHypothesisId === h.id ? 'rotate-90' : ''
                      ]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                    <span :class="getStatusBadgeClass(h.status)">{{ h.status }}</span>
                    <span
                      v-for="risk in h.risks"
                      :key="risk"
                      :class="getRiskBadgeClass(risk)"
                    >
                      {{ risk }}
                    </span>
                    <!-- Connection badges -->
                    <div class="flex gap-1 ml-1">
                      <ConnectionBadge
                        v-if="getConnectionCounts(h.id).archetype > 0"
                        :count="getConnectionCounts(h.id).archetype"
                        type="archetype"
                      />
                      <ConnectionBadge
                        v-if="getConnectionCounts(h.id).focusArea > 0"
                        :count="getConnectionCounts(h.id).focusArea"
                        type="focus-area"
                      />
                      <ConnectionBadge
                        v-if="getConnectionCounts(h.id).decisions > 0"
                        :count="getConnectionCounts(h.id).decisions"
                        type="decision"
                      />
                      <ConnectionBadge
                        v-if="getConnectionCounts(h.id).changelog > 0"
                        :count="getConnectionCounts(h.id).changelog"
                        type="changelog"
                      />
                    </div>
                  </div>

                  <div class="space-y-2 text-sm pl-6">
                    <div>
                      <span class="font-medium text-gray-500">Belief:</span>
                      <span class="text-gray-900 ml-1">{{ h.belief }}</span>
                    </div>
                    <div>
                      <span class="font-medium text-gray-500">Test:</span>
                      <span class="text-gray-900 ml-1">{{ h.test }}</span>
                    </div>
                    <div v-if="h.result">
                      <span class="font-medium text-gray-500">Result:</span>
                      <span class="text-gray-900 ml-1">{{ h.result }}</span>
                    </div>
                  </div>

                  <!-- Quick status actions -->
                  <div v-if="authStore.canEdit && h.status === 'active'" class="flex gap-2 mt-3 pl-6" @click.stop>
                    <button
                      class="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100"
                      @click="updateStatus(h.id, 'validated')"
                    >
                      Mark Validated
                    </button>
                    <button
                      class="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                      @click="updateStatus(h.id, 'invalidated')"
                    >
                      Mark Invalidated
                    </button>
                    <button
                      class="text-xs px-2 py-1 rounded bg-gray-50 text-gray-700 hover:bg-gray-100"
                      @click="updateStatus(h.id, 'parked')"
                    >
                      Park
                    </button>
                  </div>

                  <div v-else-if="authStore.canEdit && h.status !== 'active'" class="mt-3 pl-6" @click.stop>
                    <button
                      class="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                      @click="updateStatus(h.id, 'active')"
                    >
                      Reactivate
                    </button>
                  </div>
                </div>

                <div v-if="authStore.canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100" @click.stop>
                  <button
                    class="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    title="Edit"
                    @click="startEditingHypothesis(h)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    class="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Delete"
                    @click="handleDeleteHypothesis(h.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Expanded section with connections -->
            <Transition name="expand">
              <div v-if="expandedHypothesisId === h.id" class="border-t bg-gray-50">
                <div class="p-4 space-y-4">
                  <!-- Linked items display -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <!-- Focus Area link -->
                    <div>
                      <div class="flex items-center gap-2 mb-2">
                        <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span class="text-sm font-medium text-gray-700">Focus Area</span>
                      </div>
                      <RouterLink
                        v-if="getFocusAreaTitle(h.focusAreaId)"
                        to="/focus-areas"
                        class="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <span class="text-sm">{{ getFocusAreaTitle(h.focusAreaId) }}</span>
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </RouterLink>
                      <span v-else class="text-sm text-gray-400 italic">Not linked</span>
                    </div>

                    <!-- Archetype link -->
                    <div>
                      <div class="flex items-center gap-2 mb-2">
                        <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span class="text-sm font-medium text-gray-700">Customer Archetype</span>
                      </div>
                      <RouterLink
                        v-if="getArchetypeName(h.archetypeId)"
                        to="/customer-archetypes"
                        class="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
                      >
                        <span class="text-sm">{{ getArchetypeName(h.archetypeId) }}</span>
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </RouterLink>
                      <span v-else class="text-sm text-gray-400 italic">Not linked</span>
                    </div>
                  </div>

                  <!-- Related Items (decisions, changelog) -->
                  <div v-if="getRelatedItems(h.id).filter(i => i.type === 'decision' || i.type === 'changelog').length > 0">
                    <RelatedItems
                      :items="getRelatedItems(h.id).filter(i => i.type === 'decision' || i.type === 'changelog')"
                      title="Used In"
                      compact
                    />
                  </div>

                  <!-- Empty state for connections -->
                  <div v-else-if="!h.focusAreaId && !h.archetypeId" class="bg-yellow-50 rounded-lg p-3">
                    <div class="flex items-start gap-2">
                      <svg class="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p class="text-sm font-medium text-yellow-800">Not connected</p>
                        <p class="text-xs text-yellow-600 mt-1">
                          Link this hypothesis to a focus area or customer archetype for better tracking.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <!-- 4-Risk Framework Legend -->
      <section class="card p-4">
        <h3 class="text-sm font-medium text-gray-700 mb-3">4-Risk Framework</h3>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span class="badge-blue">Valuable</span>
            <p class="text-gray-500 mt-1">Will users want this?</p>
          </div>
          <div>
            <span class="badge-green">Usable</span>
            <p class="text-gray-500 mt-1">Can users figure it out?</p>
          </div>
          <div>
            <span class="badge-yellow">Feasible</span>
            <p class="text-gray-500 mt-1">Can we build it?</p>
          </div>
          <div>
            <span class="badge-gray">Viable</span>
            <p class="text-gray-500 mt-1">Does it work for business?</p>
          </div>
        </div>
      </section>

      <!-- Design Partner Feedback -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-medium text-gray-700">Design Partner Feedback</h2>
          <button
            v-if="authStore.canEdit && !showAddFeedback"
            class="btn-ghost text-sm"
            @click="showAddFeedback = true"
          >
            + Add Feedback
          </button>
        </div>

        <!-- Add feedback form -->
        <div v-if="showAddFeedback" class="card p-4 mb-4 space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="label">Source</label>
              <input
                v-model="feedbackForm.source"
                class="input"
                placeholder="e.g., Fire Dept A, EMT John"
              />
            </div>
            <div>
              <label class="label">Theme</label>
              <input
                v-model="feedbackForm.theme"
                class="input"
                placeholder="e.g., Onboarding, Scheduling"
              />
            </div>
            <div>
              <label class="label">Customer Archetype</label>
              <select v-model="feedbackForm.archetypeId" class="input">
                <option value="">None</option>
                <option
                  v-for="arch in archetypesStore.activeArchetypes"
                  :key="arch.id"
                  :value="arch.id"
                >
                  {{ arch.name }}
                </option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Feedback</label>
            <textarea
              v-model="feedbackForm.content"
              class="input min-h-[60px]"
              placeholder="What did they say?"
            />
          </div>
          <div class="flex gap-2 justify-end">
            <button class="btn-ghost text-sm" @click="showAddFeedback = false">Cancel</button>
            <button
              class="btn-primary text-sm"
              :disabled="!feedbackForm.content.trim()"
              @click="handleSubmitFeedback"
            >
              Add Feedback
            </button>
          </div>
        </div>

        <div v-if="discoveryStore.feedback.length === 0" class="text-sm text-gray-400">
          No feedback recorded yet.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="fb in discoveryStore.feedback"
            :key="fb.id"
            class="card p-3 group"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <span class="text-sm font-medium text-gray-900">{{ fb.source }}</span>
                  <span v-if="fb.theme" class="badge-gray">{{ fb.theme }}</span>
                  <RouterLink
                    v-if="getArchetypeName(fb.archetypeId)"
                    to="/customer-archetypes"
                    class="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {{ getArchetypeName(fb.archetypeId) }}
                  </RouterLink>
                </div>
                <p class="text-sm text-gray-600">{{ fb.content }}</p>
              </div>
              <button
                v-if="authStore.canEdit"
                class="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                @click="handleDeleteFeedback(fb.id)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 500px;
  opacity: 1;
}
</style>
