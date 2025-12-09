<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { useAuthStore } from '@/stores/auth'
import { useDiscoveryStore } from '@/stores/discovery'
import { useFocusAreasStore } from '@/stores/focusAreas'
import { useCustomerArchetypesStore } from '@/stores/customerArchetypes'
import { useDecisionsStore } from '@/stores/decisions'
import { useDeliveryStore } from '@/stores/delivery'
import type { Hypothesis, HypothesisStatus, RiskType } from '@/types'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import RelatedItems from '@/components/RelatedItems.vue'

// AI Suggestion types
interface HypothesisSuggestion {
  belief: string
  test: string
  risks: RiskType[]
  rationale: string
  source: string
  suggestedArchetypeId: string | null
  suggestedFocusAreaId: string | null
  priority: 'high' | 'medium' | 'low'
  confidence: 'high' | 'medium' | 'low'
}

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
  { value: 'desirable', label: 'Desirable', class: 'badge-pink' },
  { value: 'feasible', label: 'Feasible', class: 'badge-yellow' },
  { value: 'viable', label: 'Viable', class: 'badge-green' },
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

// Inline editing state
const inlineEditingId = ref<string | null>(null)
const inlineEditForm = ref({
  belief: '',
  test: '',
  result: '',
  risks: [] as RiskType[],
  focusAreaId: '',
  archetypeId: '',
})

// AI Suggestions state
const suggestions = ref<HypothesisSuggestion[]>([])
const suggestionsLoading = ref(false)
const suggestionsError = ref<string | null>(null)
const suggestionsInsights = ref<string[]>([])
const showSuggestions = ref(false)
const dismissedSuggestions = ref<Set<string>>(new Set())
const enableWebSearch = ref(true)
const webSearchUsed = ref(false)

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

async function updateStatus(id: string, status: HypothesisStatus) {
  // Use the new updateHypothesisStatus for validated/invalidated to auto-generate decisions
  if (status === 'validated' || status === 'invalidated') {
    await discoveryStore.updateHypothesisStatus(id, status)
  } else {
    // For parked/active, just update the status directly
    await discoveryStore.updateHypothesis(id, { status })
  }
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

// Start inline editing
function startInlineEditing(h: Hypothesis) {
  inlineEditingId.value = h.id
  inlineEditForm.value = {
    belief: h.belief,
    test: h.test,
    result: h.result || '',
    risks: [...h.risks],
    focusAreaId: h.focusAreaId || '',
    archetypeId: h.archetypeId || '',
  }
}

// Cancel inline editing
function cancelInlineEditing() {
  inlineEditingId.value = null
}

// Save inline edits
async function saveInlineEditing() {
  if (!inlineEditingId.value) return

  try {
    await discoveryStore.updateHypothesis(inlineEditingId.value, {
      belief: inlineEditForm.value.belief,
      test: inlineEditForm.value.test,
      result: inlineEditForm.value.result || undefined,
      risks: inlineEditForm.value.risks,
      focusAreaId: inlineEditForm.value.focusAreaId || undefined,
      archetypeId: inlineEditForm.value.archetypeId || undefined,
    })
    inlineEditingId.value = null
  } catch (error) {
    console.error('Failed to update hypothesis:', error)
  }
}

// Toggle risk in inline edit mode
function toggleInlineRisk(risk: RiskType) {
  const idx = inlineEditForm.value.risks.indexOf(risk)
  if (idx >= 0) {
    inlineEditForm.value.risks.splice(idx, 1)
  } else {
    inlineEditForm.value.risks.push(risk)
  }
}

// Get related items for a hypothesis
type RelatedItemType = 'hypothesis' | 'feedback' | 'journey-map' | 'document' | 'changelog' | 'archetype' | 'focus-area' | 'idea' | 'decision' | 'objective' | 'blocker'

function getRelatedItems(hypothesisId: string) {
  const items: { id: string; type: RelatedItemType; title: string; status?: string; path?: string }[] = []
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

// Visible suggestions (not dismissed)
const visibleSuggestions = computed(() => {
  return suggestions.value.filter(s => !dismissedSuggestions.value.has(s.belief))
})

// Generate AI suggestions
async function generateSuggestions() {
  suggestionsLoading.value = true
  suggestionsError.value = null
  showSuggestions.value = true
  webSearchUsed.value = false

  try {
    const functions = getFunctions()
    const generateHypothesisSuggestions = httpsCallable(functions, 'generateHypothesisSuggestions')
    const result = await generateHypothesisSuggestions({ enableWebSearch: enableWebSearch.value })
    const data = result.data as {
      suggestions: HypothesisSuggestion[]
      insights: string[]
      webSearchUsed?: boolean
    }
    suggestions.value = data.suggestions || []
    suggestionsInsights.value = data.insights || []
    webSearchUsed.value = data.webSearchUsed || false
    dismissedSuggestions.value = new Set()
  } catch (error) {
    console.error('Failed to generate suggestions:', error)
    suggestionsError.value = error instanceof Error ? error.message : 'Failed to generate suggestions'
  } finally {
    suggestionsLoading.value = false
  }
}

// Accept a suggestion and add it as a hypothesis
async function acceptSuggestion(suggestion: HypothesisSuggestion) {
  try {
    // Build hypothesis data, only including optional fields if they have values
    const hypothesisData: {
      belief: string
      test: string
      risks: RiskType[]
      focusAreaId?: string
      archetypeId?: string
    } = {
      belief: suggestion.belief,
      test: suggestion.test,
      risks: suggestion.risks,
    }

    // Only add focusAreaId if it's a non-empty string
    if (suggestion.suggestedFocusAreaId && typeof suggestion.suggestedFocusAreaId === 'string') {
      hypothesisData.focusAreaId = suggestion.suggestedFocusAreaId
    }

    // Only add archetypeId if it's a non-empty string
    if (suggestion.suggestedArchetypeId && typeof suggestion.suggestedArchetypeId === 'string') {
      hypothesisData.archetypeId = suggestion.suggestedArchetypeId
    }

    await discoveryStore.addHypothesis(hypothesisData)
    // Remove from suggestions
    dismissedSuggestions.value.add(suggestion.belief)
  } catch (error) {
    console.error('Failed to add hypothesis:', error)
  }
}

// Accept and edit - populate the form with the suggestion
function acceptAndEditSuggestion(suggestion: HypothesisSuggestion) {
  hypothesisForm.value = {
    belief: suggestion.belief,
    test: suggestion.test,
    result: '',
    risks: [...suggestion.risks],
    focusAreaId: suggestion.suggestedFocusAreaId || '',
    archetypeId: suggestion.suggestedArchetypeId || '',
  }
  showAddHypothesis.value = true
  // Remove from suggestions
  dismissedSuggestions.value.add(suggestion.belief)
}

// Dismiss a suggestion
function dismissSuggestion(suggestion: HypothesisSuggestion) {
  dismissedSuggestions.value.add(suggestion.belief)
}

// Get priority badge class
function getPriorityBadgeClass(priority: string) {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-700'
    case 'medium': return 'bg-yellow-100 text-yellow-700'
    case 'low': return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <p class="text-sm text-gray-500">Track hypotheses, experiments, and design partner feedback.</p>
      <div v-if="authStore.canEdit && !showAddHypothesis" class="flex gap-2">
        <button
          class="btn-ghost text-sm inline-flex items-center gap-1.5"
          :disabled="suggestionsLoading"
          @click="generateSuggestions"
        >
          <svg v-if="suggestionsLoading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          {{ suggestionsLoading ? 'Analyzing...' : 'AI Suggestions' }}
        </button>
        <button
          class="btn-primary text-sm"
          @click="showAddHypothesis = true"
        >
          New Hypothesis
        </button>
      </div>
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

    <!-- AI Suggestions Panel -->
    <div v-if="showSuggestions" class="card overflow-hidden border-accent-200 bg-gradient-to-br from-accent-50/50 to-white">
      <div class="px-4 py-3 bg-accent-50 border-b border-accent-100 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 class="font-medium text-accent-900">AI-Generated Hypothesis Suggestions</h3>
          <span v-if="visibleSuggestions.length > 0" class="text-xs bg-accent-200 text-accent-800 px-2 py-0.5 rounded-full">
            {{ visibleSuggestions.length }} suggestion{{ visibleSuggestions.length !== 1 ? 's' : '' }}
          </span>
          <span v-if="webSearchUsed" class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Web-enriched
          </span>
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              v-model="enableWebSearch"
              type="checkbox"
              class="rounded border-gray-300 text-accent-600 focus:ring-accent-500"
            />
            Web search
          </label>
          <button
            class="p-1 hover:bg-accent-100 rounded transition-colors"
            @click="showSuggestions = false"
          >
            <svg class="w-5 h-5 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="p-4">
        <!-- Loading State -->
        <div v-if="suggestionsLoading" class="flex flex-col items-center justify-center py-8">
          <div class="w-10 h-10 border-4 border-accent-200 border-t-accent-600 rounded-full animate-spin"></div>
          <p class="mt-4 text-sm text-gray-600">
            {{ enableWebSearch ? 'Analyzing your data and searching the web for market insights...' : 'Analyzing your data across archetypes, ideas, journey maps, and focus areas...' }}
          </p>
        </div>

        <!-- Error State -->
        <div v-else-if="suggestionsError" class="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p class="text-sm text-red-600">{{ suggestionsError }}</p>
          <button class="mt-2 text-sm text-red-700 underline" @click="generateSuggestions">Try again</button>
        </div>

        <!-- No Suggestions -->
        <div v-else-if="visibleSuggestions.length === 0 && suggestions.length > 0" class="text-center py-6">
          <p class="text-sm text-gray-500">All suggestions have been processed.</p>
          <button class="mt-2 text-sm text-accent-600 hover:text-accent-700" @click="generateSuggestions">
            Generate new suggestions
          </button>
        </div>

        <div v-else-if="visibleSuggestions.length === 0" class="text-center py-6">
          <p class="text-sm text-gray-500">No suggestions available. Add more data to archetypes, ideas, or focus areas.</p>
        </div>

        <!-- Suggestions List -->
        <div v-else class="space-y-4">
          <!-- Insights Summary -->
          <div v-if="suggestionsInsights.length > 0" class="p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <h4 class="text-xs font-medium text-blue-800 mb-1">Insights from Analysis</h4>
            <ul class="text-xs text-blue-700 space-y-1">
              <li v-for="(insight, idx) in suggestionsInsights" :key="idx">• {{ insight }}</li>
            </ul>
          </div>

          <!-- Suggestion Cards -->
          <div
            v-for="(suggestion, idx) in visibleSuggestions"
            :key="idx"
            class="bg-white border border-gray-200 rounded-lg p-4 hover:border-accent-300 transition-colors"
          >
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span :class="['text-xs px-2 py-0.5 rounded-full font-medium', getPriorityBadgeClass(suggestion.priority)]">
                    {{ suggestion.priority }} priority
                  </span>
                  <span
                    v-for="risk in suggestion.risks"
                    :key="risk"
                    :class="['text-xs px-2 py-0.5 rounded-full', getRiskBadgeClass(risk)]"
                  >
                    {{ risk }}
                  </span>
                </div>
              </div>
            </div>

            <div class="space-y-2 mb-3">
              <div>
                <p class="text-xs text-gray-500 mb-0.5">We believe that...</p>
                <p class="text-sm text-gray-900">{{ suggestion.belief }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500 mb-0.5">We will test this by...</p>
                <p class="text-sm text-gray-700">{{ suggestion.test }}</p>
              </div>
            </div>

            <div class="text-xs text-gray-500 mb-3 p-2 bg-gray-50 rounded">
              <strong>Why this matters:</strong> {{ suggestion.rationale }}
              <br />
              <span class="text-gray-400">Source: {{ suggestion.source }}</span>
            </div>

            <!-- Suggested Links -->
            <div v-if="suggestion.suggestedArchetypeId || suggestion.suggestedFocusAreaId" class="flex flex-wrap gap-2 mb-3">
              <span v-if="suggestion.suggestedFocusAreaId" class="text-xs text-gray-500">
                Links to: <span class="text-accent-600">{{ getFocusAreaTitle(suggestion.suggestedFocusAreaId) || 'Focus Area' }}</span>
              </span>
              <span v-if="suggestion.suggestedArchetypeId" class="text-xs text-gray-500">
                About: <span class="text-accent-600">{{ getArchetypeName(suggestion.suggestedArchetypeId) || 'Archetype' }}</span>
              </span>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 pt-3 border-t border-gray-100">
              <button
                class="flex-1 btn-primary text-xs py-1.5"
                @click="acceptSuggestion(suggestion)"
              >
                Accept
              </button>
              <button
                class="flex-1 btn-ghost text-xs py-1.5"
                @click="acceptAndEditSuggestion(suggestion)"
              >
                Edit & Add
              </button>
              <button
                class="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                @click="dismissSuggestion(suggestion)"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
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
            <!-- Inline Edit Mode -->
            <div v-if="inlineEditingId === h.id" class="p-4 space-y-4 bg-gray-50">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-medium text-gray-700">Edit Hypothesis</h4>
                <div class="flex items-center gap-2">
                  <span :class="getStatusBadgeClass(h.status)">{{ h.status }}</span>
                </div>
              </div>

              <div>
                <label class="label">We believe that... (Belief)</label>
                <textarea
                  v-model="inlineEditForm.belief"
                  class="input min-h-[60px]"
                  placeholder="State your hypothesis..."
                />
              </div>

              <div>
                <label class="label">We will test this by... (Test)</label>
                <textarea
                  v-model="inlineEditForm.test"
                  class="input min-h-[60px]"
                  placeholder="How will you validate or invalidate this?"
                />
              </div>

              <div>
                <label class="label">Result</label>
                <textarea
                  v-model="inlineEditForm.result"
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
                      inlineEditForm.risks.includes(risk.value)
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    ]"
                    @click="toggleInlineRisk(risk.value)"
                  >
                    {{ risk.label }}
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="label">Related Focus Area</label>
                  <select v-model="inlineEditForm.focusAreaId" class="input">
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
                  <label class="label">Customer Archetype</label>
                  <select v-model="inlineEditForm.archetypeId" class="input">
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

              <div class="flex gap-2 justify-end pt-2 border-t">
                <button class="btn-ghost text-sm" @click="cancelInlineEditing">Cancel</button>
                <button
                  class="btn-primary text-sm"
                  :disabled="discoveryStore.saving || !inlineEditForm.belief.trim()"
                  @click="saveInlineEditing"
                >
                  {{ discoveryStore.saving ? 'Saving...' : 'Save Changes' }}
                </button>
              </div>
            </div>

            <!-- Normal View Mode -->
            <template v-else>
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
                      @click="startInlineEditing(h)"
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
            </template>
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
