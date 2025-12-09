<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFocusAreasStore } from '@/stores/focusAreas'
import { useCustomerArchetypesStore } from '@/stores/customerArchetypes'
import { useDiscoveryStore } from '@/stores/discovery'
import { useIdeasStore } from '@/stores/ideas'
import { useObjectivesStore } from '@/stores/objectives'
import { useDecisionsStore } from '@/stores/decisions'
import { useDeliveryStore } from '@/stores/delivery'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { FocusArea, ConfidenceLevel } from '@/types'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import RelatedItems from '@/components/RelatedItems.vue'

const authStore = useAuthStore()
const focusAreasStore = useFocusAreasStore()
const archetypesStore = useCustomerArchetypesStore()
const discoveryStore = useDiscoveryStore()
const ideasStore = useIdeasStore()
const objectivesStore = useObjectivesStore()
const decisionsStore = useDecisionsStore()
const deliveryStore = useDeliveryStore()
const functions = getFunctions()

const showAddForm = ref(false)
const editingId = ref<string | null>(null)

// AI Problem Statement Improvement
const showAiDrawer = ref(false)
const aiLoading = ref(false)
const aiError = ref<string | null>(null)
const aiSuggestions = ref<string[]>([])

const defaultForm = {
  title: '',
  problemStatement: '',
  confidenceLevel: 'medium' as ConfidenceLevel,
  confidenceRationale: '',
  successCriteria: [''],
  targetArchetypeIds: [] as string[],
}

const form = ref({ ...defaultForm })

// Expanded focus area for showing connections
const expandedFocusAreaId = ref<string | null>(null)

// All usable archetypes (not archived)
const availableArchetypes = computed(() =>
  archetypesStore.archetypes.filter(a => a.status !== 'archived')
)

onMounted(() => {
  focusAreasStore.subscribe()
  archetypesStore.subscribe()
  discoveryStore.subscribe()
  ideasStore.subscribe()
  objectivesStore.subscribe()
  decisionsStore.subscribe()
  deliveryStore.subscribe()
})

onUnmounted(() => {
  focusAreasStore.unsubscribe()
  archetypesStore.unsubscribe()
  discoveryStore.unsubscribe()
  ideasStore.unsubscribe()
  objectivesStore.unsubscribe()
  decisionsStore.unsubscribe()
  deliveryStore.unsubscribe()
})

// Get related items for a focus area
type RelatedItemType = 'hypothesis' | 'feedback' | 'journey-map' | 'document' | 'changelog' | 'archetype' | 'focus-area' | 'idea' | 'decision' | 'objective' | 'blocker'

function getRelatedItems(focusAreaId: string) {
  const items: { id: string; type: RelatedItemType; title: string; status?: string; path?: string }[] = []

  // Archetypes linked to this focus area
  archetypesStore.archetypes
    .filter(a => a.relatedFocusAreaIds?.includes(focusAreaId))
    .forEach(a => items.push({
      id: a.id, type: 'archetype', title: a.name, status: a.status, path: '/customer-archetypes'
    }))

  // Hypotheses linked to this focus area
  discoveryStore.hypotheses
    .filter(h => h.focusAreaId === focusAreaId)
    .forEach(h => items.push({
      id: h.id, type: 'hypothesis', title: h.belief.substring(0, 60) + (h.belief.length > 60 ? '...' : ''), status: h.status, path: '/discovery'
    }))

  // Ideas linked to this focus area
  ideasStore.ideas
    .filter(i => i.focusAreaId === focusAreaId)
    .forEach(i => items.push({
      id: i.id, type: 'idea', title: i.title, status: i.status, path: '/idea-hopper'
    }))

  // Objectives linked to this focus area
  objectivesStore.objectives
    .filter(o => o.focusAreaIds?.includes(focusAreaId))
    .forEach(o => items.push({
      id: o.id, type: 'objective', title: o.title, status: o.status, path: '/objectives'
    }))

  // Decisions linked to this focus area
  decisionsStore.decisions
    .filter(d => d.focusAreaId === focusAreaId)
    .forEach(d => items.push({
      id: d.id, type: 'decision', title: d.title, status: d.status, path: '/decisions'
    }))

  // Blockers linked to this focus area
  deliveryStore.blockers
    .filter(b => b.focusAreaId === focusAreaId)
    .forEach(b => items.push({
      id: b.id, type: 'blocker', title: b.title, status: b.status, path: '/delivery'
    }))

  return items
}

// Get connection counts for a focus area
function getConnectionCounts(focusAreaId: string) {
  return {
    archetypes: archetypesStore.archetypes.filter(a => a.relatedFocusAreaIds?.includes(focusAreaId)).length,
    hypotheses: discoveryStore.hypotheses.filter(h => h.focusAreaId === focusAreaId).length,
    ideas: ideasStore.ideas.filter(i => i.focusAreaId === focusAreaId).length,
    objectives: objectivesStore.objectives.filter(o => o.focusAreaIds?.includes(focusAreaId)).length,
    decisions: decisionsStore.decisions.filter(d => d.focusAreaId === focusAreaId).length,
    blockers: deliveryStore.blockers.filter(b => b.focusAreaId === focusAreaId).length,
  }
}

function toggleExpanded(id: string) {
  expandedFocusAreaId.value = expandedFocusAreaId.value === id ? null : id
}

// Update target archetypes for a focus area
async function updateTargetArchetypes(focusAreaId: string, archetypeIds: string[]) {
  await focusAreasStore.updateFocusArea(focusAreaId, { targetArchetypeIds: archetypeIds })
}

function resetForm() {
  form.value = { ...defaultForm, successCriteria: [''], targetArchetypeIds: [] }
  showAddForm.value = false
  editingId.value = null
}

function addCriteria() {
  form.value.successCriteria.push('')
}

function removeCriteria(index: number) {
  form.value.successCriteria.splice(index, 1)
}

async function handleSubmit() {
  const criteria = form.value.successCriteria.filter((c) => c.trim())

  if (editingId.value) {
    await focusAreasStore.updateFocusArea(editingId.value, {
      title: form.value.title,
      problemStatement: form.value.problemStatement,
      confidenceLevel: form.value.confidenceLevel,
      confidenceRationale: form.value.confidenceRationale,
      successCriteria: criteria,
      targetArchetypeIds: form.value.targetArchetypeIds,
    })
  } else {
    await focusAreasStore.addFocusArea({
      title: form.value.title,
      problemStatement: form.value.problemStatement,
      confidenceLevel: form.value.confidenceLevel,
      confidenceRationale: form.value.confidenceRationale,
      successCriteria: criteria,
      targetArchetypeIds: form.value.targetArchetypeIds,
    })
  }
  resetForm()
}

function startEditing(focusArea: FocusArea) {
  editingId.value = focusArea.id
  form.value = {
    title: focusArea.title,
    problemStatement: focusArea.problemStatement,
    confidenceLevel: focusArea.confidenceLevel,
    confidenceRationale: focusArea.confidenceRationale,
    successCriteria: focusArea.successCriteria.length ? [...focusArea.successCriteria] : [''],
    targetArchetypeIds: focusArea.targetArchetypeIds ? [...focusArea.targetArchetypeIds] : [],
  }
  showAddForm.value = true
}

async function handleArchive(id: string) {
  await focusAreasStore.archiveFocusArea(id)
}

async function handleReactivate(id: string) {
  await focusAreasStore.reactivateFocusArea(id)
}

async function handleDelete(id: string) {
  if (!confirm('Permanently delete this focus area?')) return
  await focusAreasStore.deleteFocusArea(id)
}

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

// AI Problem Statement Improvement
async function improveProblemStatement() {
  if (!form.value.problemStatement.trim()) {
    aiError.value = 'Please write a problem statement first'
    showAiDrawer.value = true
    return
  }

  showAiDrawer.value = true
  aiLoading.value = true
  aiError.value = null
  aiSuggestions.value = []

  try {
    const improve = httpsCallable(functions, 'improveProblemStatement')
    const result = await improve({
      title: form.value.title,
      problemStatement: form.value.problemStatement,
    })

    const data = result.data as { suggestions: string[] }
    aiSuggestions.value = data.suggestions
  } catch (err) {
    console.error('Failed to improve problem statement:', err)
    aiError.value = err instanceof Error ? err.message : 'Failed to generate suggestions'
  } finally {
    aiLoading.value = false
  }
}

function selectProblemSuggestion(suggestion: string) {
  form.value.problemStatement = suggestion
  showAiDrawer.value = false
}

function closeAiDrawer() {
  showAiDrawer.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">The 2-4 problems we've chosen to solve (strategy = focus).</p>
      <button
        v-if="authStore.canEdit && !showAddForm"
        class="btn-primary text-sm"
        @click="showAddForm = true"
      >
        Add Focus Area
      </button>
    </div>

    <!-- Add/Edit Form -->
    <div v-if="showAddForm" class="card p-6 space-y-4">
      <h3 class="font-medium text-gray-900">
        {{ editingId ? 'Edit Focus Area' : 'New Focus Area' }}
      </h3>

      <div>
        <label class="label">Title</label>
        <input
          v-model="form.title"
          class="input"
          placeholder="e.g., Reduce onboarding friction"
        />
      </div>

      <div>
        <label class="label">Problem Statement</label>
        <div class="relative">
          <textarea
            v-model="form.problemStatement"
            class="input min-h-[80px] pr-12"
            placeholder="What problem are we solving and for whom?"
          />
          <button
            v-if="authStore.canEdit"
            type="button"
            class="absolute bottom-3 right-3 p-2 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Improve with AI"
            @click="improveProblemStatement"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label">Confidence Level</label>
          <select v-model="form.confidenceLevel" class="input">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label class="label">Confidence Rationale</label>
          <input
            v-model="form.confidenceRationale"
            class="input"
            placeholder="Why this confidence level?"
          />
        </div>
      </div>

      <div>
        <label class="label">Success Criteria</label>
        <div class="space-y-2">
          <div
            v-for="(_, index) in form.successCriteria"
            :key="index"
            class="flex gap-2"
          >
            <input
              v-model="form.successCriteria[index]"
              class="input flex-1"
              placeholder="How will we know we're right?"
            />
            <button
              v-if="form.successCriteria.length > 1"
              class="btn-ghost text-gray-400 hover:text-red-500 px-2"
              @click="removeCriteria(index)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <button class="btn-ghost text-sm" @click="addCriteria">+ Add criteria</button>
        </div>
      </div>

      <!-- Target Customer Archetypes -->
      <div>
        <label class="label">Target Customer Archetypes</label>
        <p class="text-xs text-gray-500 mb-2">Which customers experience this problem?</p>
        <div v-if="availableArchetypes.length > 0" class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <label
              v-for="arch in availableArchetypes"
              :key="arch.id"
              :class="[
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
                form.targetArchetypeIds.includes(arch.id)
                  ? 'bg-purple-100 border-purple-300 text-purple-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-purple-200'
              ]"
            >
              <input
                type="checkbox"
                :checked="form.targetArchetypeIds.includes(arch.id)"
                class="sr-only"
                @change="() => {
                  if (form.targetArchetypeIds.includes(arch.id)) {
                    form.targetArchetypeIds = form.targetArchetypeIds.filter(id => id !== arch.id)
                  } else {
                    form.targetArchetypeIds = [...form.targetArchetypeIds, arch.id]
                  }
                }"
              />
              <span class="text-sm">{{ arch.name }}</span>
              <span class="text-xs opacity-60">{{ arch.stakeholderRole }}</span>
            </label>
          </div>
          <RouterLink to="/customer-archetypes" class="text-xs text-purple-600 hover:underline">
            + Add new archetype
          </RouterLink>
        </div>
        <p v-else class="text-sm text-gray-400 italic">
          No customer archetypes defined yet.
          <RouterLink to="/customer-archetypes" class="text-purple-600 hover:underline">Create one</RouterLink>
        </p>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="btn-ghost" @click="resetForm">Cancel</button>
        <button
          class="btn-primary"
          :disabled="focusAreasStore.saving || !form.title.trim()"
          @click="handleSubmit"
        >
          {{ focusAreasStore.saving ? 'Saving...' : editingId ? 'Update' : 'Add Focus Area' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="focusAreasStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Active focus areas -->
      <section>
        <h2 class="text-sm font-medium text-gray-700 mb-3">
          Active ({{ focusAreasStore.activeFocusAreas.length }})
        </h2>

        <div v-if="focusAreasStore.activeFocusAreas.length === 0" class="card p-6 text-center">
          <p class="text-sm text-gray-500">No active focus areas. Add one to define your strategic focus.</p>
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="fa in focusAreasStore.activeFocusAreas"
            :key="fa.id"
            class="card overflow-hidden group"
          >
            <!-- Main content - clickable to expand -->
            <div
              class="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              @click="toggleExpanded(fa.id)"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <svg
                      :class="[
                        'w-4 h-4 text-gray-400 transition-transform flex-shrink-0',
                        expandedFocusAreaId === fa.id ? 'rotate-90' : ''
                      ]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                    <h3 class="font-medium text-gray-900 truncate">{{ fa.title }}</h3>
                    <span :class="getConfidenceBadgeClass(fa.confidenceLevel)">
                      {{ fa.confidenceLevel }}
                    </span>
                    <!-- Connection badges -->
                    <div class="flex gap-1 ml-2">
                      <ConnectionBadge
                        v-if="getConnectionCounts(fa.id).archetypes > 0"
                        :count="getConnectionCounts(fa.id).archetypes"
                        type="archetype"
                      />
                      <ConnectionBadge
                        v-if="getConnectionCounts(fa.id).hypotheses > 0"
                        :count="getConnectionCounts(fa.id).hypotheses"
                        type="hypothesis"
                      />
                      <ConnectionBadge
                        v-if="getConnectionCounts(fa.id).ideas > 0"
                        :count="getConnectionCounts(fa.id).ideas"
                        type="idea"
                      />
                      <ConnectionBadge
                        v-if="getConnectionCounts(fa.id).objectives > 0"
                        :count="getConnectionCounts(fa.id).objectives"
                        type="objective"
                      />
                      <ConnectionBadge
                        v-if="getConnectionCounts(fa.id).blockers > 0"
                        :count="getConnectionCounts(fa.id).blockers"
                        type="blocker"
                      />
                    </div>
                  </div>
                  <p class="text-sm text-gray-600 mb-2 pl-6">{{ fa.problemStatement }}</p>

                  <div v-if="fa.confidenceRationale" class="text-xs text-gray-500 mb-2 pl-6">
                    <span class="font-medium">Rationale:</span> {{ fa.confidenceRationale }}
                  </div>

                  <div v-if="fa.successCriteria?.length" class="mt-2 pl-6">
                    <div class="text-xs font-medium text-gray-500 mb-1">Success Criteria:</div>
                    <ul class="text-sm text-gray-600 space-y-1">
                      <li v-for="(criteria, i) in fa.successCriteria" :key="i" class="flex gap-2">
                        <span class="text-gray-400">-</span>
                        {{ criteria }}
                      </li>
                    </ul>
                  </div>
                </div>

                <div v-if="authStore.canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100" @click.stop>
                  <button
                    class="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    title="Edit"
                    @click="startEditing(fa)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    class="p-1.5 text-gray-400 hover:text-yellow-600 rounded"
                    title="Archive"
                    @click="handleArchive(fa.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Expanded section with connections -->
            <Transition name="expand">
              <div v-if="expandedFocusAreaId === fa.id" class="border-t bg-gray-50">
                <div class="p-4 space-y-4">
                  <!-- Target Customer Archetypes -->
                  <div>
                    <div class="flex items-center gap-2 mb-2">
                      <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span class="text-sm font-medium text-gray-700">Target Customer Archetypes</span>
                    </div>
                    <div v-if="availableArchetypes.length > 0" class="space-y-2">
                      <div class="flex flex-wrap gap-2">
                        <label
                          v-for="arch in availableArchetypes"
                          :key="arch.id"
                          :class="[
                            'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors',
                            fa.targetArchetypeIds?.includes(arch.id)
                              ? 'bg-purple-100 border-purple-300 text-purple-800'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-purple-200'
                          ]"
                        >
                          <input
                            type="checkbox"
                            :checked="fa.targetArchetypeIds?.includes(arch.id)"
                            class="sr-only"
                            @change="() => {
                              const current = fa.targetArchetypeIds || []
                              const updated = current.includes(arch.id)
                                ? current.filter(id => id !== arch.id)
                                : [...current, arch.id]
                              updateTargetArchetypes(fa.id, updated)
                            }"
                          />
                          <span class="text-sm">{{ arch.name }}</span>
                          <span class="text-xs opacity-60">{{ arch.stakeholderRole }}</span>
                        </label>
                      </div>
                      <RouterLink to="/customer-archetypes" class="text-xs text-purple-600 hover:underline">
                        + Add new archetype
                      </RouterLink>
                    </div>
                    <p v-else class="text-sm text-gray-400 italic">
                      No customer archetypes defined yet.
                      <RouterLink to="/customer-archetypes" class="text-purple-600 hover:underline">Create one</RouterLink>
                    </p>
                  </div>

                  <!-- Related Items -->
                  <div v-if="getRelatedItems(fa.id).length > 0">
                    <RelatedItems
                      :items="getRelatedItems(fa.id)"
                      title="Connected Items"
                      compact
                    />
                  </div>

                  <!-- Empty state for connections -->
                  <div v-else-if="!fa.targetArchetypeIds?.length" class="bg-yellow-50 rounded-lg p-3">
                    <div class="flex items-start gap-2">
                      <svg class="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p class="text-sm font-medium text-yellow-800">No connections yet</p>
                        <p class="text-xs text-yellow-600 mt-1">
                          Link this focus area to customer archetypes, hypotheses, or ideas to track progress.
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

      <!-- Archived focus areas -->
      <section v-if="focusAreasStore.archivedFocusAreas.length > 0">
        <h2 class="text-sm font-medium text-gray-700 mb-3">
          Archived ({{ focusAreasStore.archivedFocusAreas.length }})
        </h2>

        <div class="space-y-2">
          <div
            v-for="fa in focusAreasStore.archivedFocusAreas"
            :key="fa.id"
            class="card p-3 bg-gray-50 group"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-medium text-gray-600 truncate">{{ fa.title }}</h3>
                  <span class="badge-gray">archived</span>
                </div>
              </div>

              <div v-if="authStore.canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100">
                <button
                  class="p-1.5 text-gray-400 hover:text-green-600 rounded"
                  title="Reactivate"
                  @click="handleReactivate(fa.id)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  class="p-1.5 text-gray-400 hover:text-red-600 rounded"
                  title="Delete permanently"
                  @click="handleDelete(fa.id)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- AI Problem Statement Suggestions Drawer -->
    <Teleport to="body">
      <Transition name="drawer">
        <div
          v-if="showAiDrawer"
          class="fixed inset-0 z-50 overflow-hidden"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-gray-500/50 transition-opacity"
            @click="closeAiDrawer"
          />

          <!-- Drawer panel -->
          <div class="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div class="w-screen max-w-md">
              <div class="flex h-full flex-col overflow-y-auto bg-white shadow-xl">
                <!-- Header -->
                <div class="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-6">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="p-2 bg-white/20 rounded-lg">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                      </div>
                      <div>
                        <h2 class="text-lg font-medium text-white">Improve Problem Statement</h2>
                        <p class="text-sm text-indigo-200">Click a suggestion to use it</p>
                      </div>
                    </div>
                    <button
                      class="rounded-md text-indigo-200 hover:text-white focus:outline-none"
                      @click="closeAiDrawer"
                    >
                      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 px-6 py-6">
                  <!-- Loading state -->
                  <div v-if="aiLoading" class="flex flex-col items-center justify-center py-12">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <p class="text-sm text-gray-500">Analyzing your problem statement...</p>
                  </div>

                  <!-- Error state -->
                  <div v-else-if="aiError" class="bg-red-50 rounded-lg p-4">
                    <div class="flex items-start gap-3">
                      <svg class="w-5 h-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                      </svg>
                      <div>
                        <h3 class="text-sm font-medium text-red-800">Generation Failed</h3>
                        <p class="text-sm text-red-700 mt-1">{{ aiError }}</p>
                      </div>
                    </div>
                    <button
                      class="mt-4 btn-secondary text-sm w-full"
                      @click="improveProblemStatement"
                    >
                      Try Again
                    </button>
                  </div>

                  <!-- Suggestions -->
                  <div v-else-if="aiSuggestions.length > 0" class="space-y-4">
                    <!-- Original statement -->
                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                      <div class="text-xs font-medium text-gray-500 uppercase mb-2">Your Original</div>
                      <p class="text-sm text-gray-700">{{ form.problemStatement }}</p>
                    </div>

                    <p class="text-sm text-gray-500 mb-4">
                      Here are improved versions that are more specific, observable, and impact-focused:
                    </p>
                    <button
                      v-for="(suggestion, index) in aiSuggestions"
                      :key="index"
                      class="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors group"
                      @click="selectProblemSuggestion(suggestion)"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <p class="text-sm text-gray-700 group-hover:text-gray-900">{{ suggestion }}</p>
                        <svg class="w-5 h-5 text-gray-400 group-hover:text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>

                    <div class="pt-4 border-t">
                      <button
                        class="w-full btn-ghost text-sm"
                        @click="improveProblemStatement"
                      >
                        <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Generate More Suggestions
                      </button>
                    </div>
                  </div>

                  <!-- Empty state -->
                  <div v-else class="text-center py-12">
                    <svg class="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    <p class="text-sm text-gray-500">No suggestions yet</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-enter-active .absolute.inset-y-0,
.drawer-leave-active .absolute.inset-y-0 {
  transition: transform 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .absolute.inset-y-0,
.drawer-leave-to .absolute.inset-y-0 {
  transform: translateX(100%);
}

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
