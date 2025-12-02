<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDecisionsStore } from '@/stores/decisions'
import type { DecisionCategory, DecisionOption, DecisionStatus } from '@/types'

const authStore = useAuthStore()
const decisionsStore = useDecisionsStore()

const showAddDecision = ref(false)
const expandedDecisionId = ref<string | null>(null)
const showMakeDecision = ref<string | null>(null)
const selectedOptionId = ref<string | null>(null)
const decisionRationale = ref('')
const filterStatus = ref<DecisionStatus | 'all'>('all')
const filterCategory = ref<DecisionCategory | 'all'>('all')

const decisionForm = ref({
  title: '',
  context: '',
  category: 'product' as DecisionCategory,
  owner: '',
  options: [] as Omit<DecisionOption, 'id'>[],
})

const categories: { value: DecisionCategory; label: string }[] = [
  { value: 'product', label: 'Product' },
  { value: 'technical', label: 'Technical' },
  { value: 'process', label: 'Process' },
  { value: 'strategy', label: 'Strategy' },
]

const statuses: { value: DecisionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'decided', label: 'Decided' },
  { value: 'revisited', label: 'Revisited' },
]

import type { Decision } from '@/types'

const filteredDecisions = ref<Decision[]>([])

function updateFilteredDecisions() {
  let result = [...decisionsStore.decisions]

  if (filterStatus.value !== 'all') {
    result = result.filter((d) => d.status === filterStatus.value)
  }

  if (filterCategory.value !== 'all') {
    result = result.filter((d) => d.category === filterCategory.value)
  }

  filteredDecisions.value = result
}

onMounted(() => {
  decisionsStore.subscribe()
})

onUnmounted(() => {
  decisionsStore.unsubscribe()
})

// Watch for changes
import { watch } from 'vue'
watch([() => decisionsStore.decisions, filterStatus, filterCategory], updateFilteredDecisions, { immediate: true })

function addOptionToForm() {
  decisionForm.value.options.push({
    title: '',
    description: '',
    pros: [],
    cons: [],
    selected: false,
  })
}

function removeOptionFromForm(index: number) {
  decisionForm.value.options.splice(index, 1)
}

function addProToOption(optionIndex: number) {
  const option = decisionForm.value.options[optionIndex]
  if (option) option.pros.push('')
}

function removeProFromOption(optionIndex: number, proIndex: number) {
  const option = decisionForm.value.options[optionIndex]
  if (option) option.pros.splice(proIndex, 1)
}

function addConToOption(optionIndex: number) {
  const option = decisionForm.value.options[optionIndex]
  if (option) option.cons.push('')
}

function removeConFromOption(optionIndex: number, conIndex: number) {
  const option = decisionForm.value.options[optionIndex]
  if (option) option.cons.splice(conIndex, 1)
}

async function handleSubmitDecision() {
  if (!decisionForm.value.title.trim()) return

  // Clean up options - remove empty pros/cons
  const cleanedOptions = decisionForm.value.options
    .filter((opt) => opt.title.trim())
    .map((opt) => ({
      ...opt,
      pros: opt.pros.filter((p) => p.trim()),
      cons: opt.cons.filter((c) => c.trim()),
    }))

  await decisionsStore.addDecision({
    title: decisionForm.value.title,
    context: decisionForm.value.context,
    category: decisionForm.value.category,
    owner: decisionForm.value.owner,
    options: cleanedOptions,
  })

  resetDecisionForm()
  showAddDecision.value = false
}

function resetDecisionForm() {
  decisionForm.value = {
    title: '',
    context: '',
    category: 'product',
    owner: '',
    options: [],
  }
}

function startMakeDecision(decisionId: string) {
  showMakeDecision.value = decisionId
  selectedOptionId.value = null
  decisionRationale.value = ''
}

async function handleMakeDecision(decisionId: string) {
  if (!selectedOptionId.value) return

  await decisionsStore.makeDecision(decisionId, selectedOptionId.value, decisionRationale.value)
  showMakeDecision.value = null
  selectedOptionId.value = null
  decisionRationale.value = ''
}

async function handleRevisitDecision(id: string) {
  await decisionsStore.revisitDecision(id)
}

async function handleReopenDecision(id: string) {
  await decisionsStore.reopenDecision(id)
}

async function handleDeleteDecision(id: string) {
  if (!confirm('Delete this decision and all its options?')) return
  await decisionsStore.deleteDecision(id)
}

function toggleExpand(id: string) {
  expandedDecisionId.value = expandedDecisionId.value === id ? null : id
}

function formatDate(timestamp: { toDate: () => Date } | null | undefined) {
  if (!timestamp) return ''
  const date = timestamp.toDate()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p class="text-sm text-gray-500">Record consequential choices with context, options, and rationale.</p>
      </div>
      <button
        v-if="authStore.canEdit && !showAddDecision"
        class="btn-primary text-sm"
        @click="showAddDecision = true"
      >
        Add Decision
      </button>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3">
      <div>
        <label class="text-xs text-gray-500 block mb-1">Status</label>
        <select v-model="filterStatus" class="input text-sm py-1.5">
          <option v-for="s in statuses" :key="s.value" :value="s.value">
            {{ s.label }}
          </option>
        </select>
      </div>
      <div>
        <label class="text-xs text-gray-500 block mb-1">Category</label>
        <select v-model="filterCategory" class="input text-sm py-1.5">
          <option value="all">All</option>
          <option v-for="c in categories" :key="c.value" :value="c.value">
            {{ c.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Add Decision Form -->
    <div v-if="showAddDecision" class="card p-6 space-y-4">
      <h3 class="font-medium text-gray-900">New Decision</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="label">Decision Title</label>
          <input
            v-model="decisionForm.title"
            class="input"
            placeholder="What decision needs to be made?"
          />
        </div>

        <div class="md:col-span-2">
          <label class="label">Context</label>
          <textarea
            v-model="decisionForm.context"
            class="input min-h-[80px]"
            placeholder="What's the background? Why is this decision needed now?"
          />
        </div>

        <div>
          <label class="label">Category</label>
          <select v-model="decisionForm.category" class="input">
            <option v-for="c in categories" :key="c.value" :value="c.value">
              {{ c.label }}
            </option>
          </select>
        </div>

        <div>
          <label class="label">Owner</label>
          <input
            v-model="decisionForm.owner"
            class="input"
            placeholder="Who's responsible for this decision?"
          />
        </div>
      </div>

      <!-- Options -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <label class="label mb-0">Options Considered</label>
          <button
            type="button"
            class="btn-ghost text-sm"
            @click="addOptionToForm"
          >
            + Add Option
          </button>
        </div>

        <div
          v-for="(option, optIndex) in decisionForm.options"
          :key="optIndex"
          class="p-4 bg-gray-50 rounded-lg space-y-3"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">Option {{ optIndex + 1 }}</span>
            <button
              type="button"
              class="text-gray-400 hover:text-red-600"
              @click="removeOptionFromForm(optIndex)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <input
            v-model="option.title"
            class="input"
            placeholder="Option name"
          />

          <textarea
            v-model="option.description"
            class="input min-h-[60px]"
            placeholder="Describe this option..."
          />

          <div class="grid grid-cols-2 gap-4">
            <!-- Pros -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-green-600">Pros</span>
                <button
                  type="button"
                  class="text-xs text-green-600 hover:text-green-700"
                  @click="addProToOption(optIndex)"
                >
                  + Add
                </button>
              </div>
              <div class="space-y-2">
                <div
                  v-for="(_, proIndex) in option.pros"
                  :key="proIndex"
                  class="flex gap-2"
                >
                  <input
                    v-model="option.pros[proIndex]"
                    class="input flex-1"
                    placeholder="Pro..."
                  />
                  <button
                    type="button"
                    class="text-gray-400 hover:text-red-600"
                    @click="removeProFromOption(optIndex, proIndex)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Cons -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-red-600">Cons</span>
                <button
                  type="button"
                  class="text-xs text-red-600 hover:text-red-700"
                  @click="addConToOption(optIndex)"
                >
                  + Add
                </button>
              </div>
              <div class="space-y-2">
                <div
                  v-for="(_, conIndex) in option.cons"
                  :key="conIndex"
                  class="flex gap-2"
                >
                  <input
                    v-model="option.cons[conIndex]"
                    class="input flex-1"
                    placeholder="Con..."
                  />
                  <button
                    type="button"
                    class="text-gray-400 hover:text-red-600"
                    @click="removeConFromOption(optIndex, conIndex)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-if="decisionForm.options.length === 0" class="text-sm text-gray-400 italic">
          No options added yet. Click "Add Option" to document the alternatives being considered.
        </p>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="btn-ghost" @click="showAddDecision = false; resetDecisionForm()">
          Cancel
        </button>
        <button
          class="btn-primary"
          :disabled="decisionsStore.saving || !decisionForm.title.trim()"
          @click="handleSubmitDecision"
        >
          {{ decisionsStore.saving ? 'Saving...' : 'Create Decision' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="decisionsStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- No decisions -->
      <div v-if="filteredDecisions.length === 0" class="card p-6 text-center">
        <p class="text-sm text-gray-500">No decisions found.</p>
        <p class="text-xs text-gray-400 mt-1">Add a decision to start documenting choices.</p>
      </div>

      <!-- Decisions list -->
      <div v-else class="space-y-4">
        <div
          v-for="decision in filteredDecisions"
          :key="decision.id"
          class="card overflow-hidden"
        >
          <!-- Decision header -->
          <div
            class="px-4 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
            @click="toggleExpand(decision.id)"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <svg
                    :class="['w-4 h-4 text-gray-400 transition-transform', expandedDecisionId === decision.id ? 'rotate-90' : '']"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  <h3 class="font-medium text-gray-900">{{ decision.title }}</h3>
                  <span :class="decisionsStore.getCategoryBadgeClass(decision.category)">
                    {{ decision.category }}
                  </span>
                  <span :class="decisionsStore.getStatusBadgeClass(decision.status)">
                    {{ decision.status }}
                  </span>
                </div>
                <p v-if="decision.context" class="text-sm text-gray-600 line-clamp-2 ml-6">
                  {{ decision.context }}
                </p>
                <div class="flex items-center gap-3 mt-2 ml-6 text-xs text-gray-500">
                  <span v-if="decision.owner">Owner: {{ decision.owner }}</span>
                  <span v-if="decision.decidedAt">Decided: {{ formatDate(decision.decidedAt) }}</span>
                  <span>{{ decision.options.length }} option{{ decision.options.length !== 1 ? 's' : '' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Expanded content -->
          <div v-if="expandedDecisionId === decision.id" class="p-4 space-y-4">
            <!-- Context -->
            <div v-if="decision.context">
              <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Context</h4>
              <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ decision.context }}</p>
            </div>

            <!-- Make Decision UI -->
            <div v-if="showMakeDecision === decision.id && decision.status === 'proposed'" class="p-4 bg-accent-50 border border-accent-200 rounded-lg space-y-4">
              <h4 class="font-medium text-gray-900">Make Decision</h4>
              <p class="text-sm text-gray-600">Select the chosen option and provide rationale.</p>

              <div class="space-y-2">
                <div
                  v-for="option in decision.options"
                  :key="option.id"
                  :class="[
                    'p-3 rounded-lg border-2 cursor-pointer transition-colors',
                    selectedOptionId === option.id
                      ? 'border-accent-500 bg-accent-50'
                      : 'border-gray-200 hover:border-gray-300'
                  ]"
                  @click="selectedOptionId = option.id"
                >
                  <div class="flex items-center gap-2">
                    <div
                      :class="[
                        'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                        selectedOptionId === option.id ? 'border-accent-500' : 'border-gray-300'
                      ]"
                    >
                      <div
                        v-if="selectedOptionId === option.id"
                        class="w-2 h-2 rounded-full bg-accent-500"
                      />
                    </div>
                    <span class="font-medium text-gray-900">{{ option.title }}</span>
                  </div>
                </div>
              </div>

              <div>
                <label class="label">Rationale</label>
                <textarea
                  v-model="decisionRationale"
                  class="input min-h-[80px]"
                  placeholder="Why was this option chosen?"
                />
              </div>

              <div class="flex gap-2 justify-end">
                <button class="btn-ghost" @click="showMakeDecision = null">Cancel</button>
                <button
                  class="btn-primary"
                  :disabled="!selectedOptionId"
                  @click="handleMakeDecision(decision.id)"
                >
                  Confirm Decision
                </button>
              </div>
            </div>

            <!-- Options -->
            <div>
              <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Options Considered
              </h4>

              <div v-if="decision.options.length === 0" class="text-sm text-gray-400 italic">
                No options documented.
              </div>

              <div v-else class="space-y-3">
                <div
                  v-for="option in decision.options"
                  :key="option.id"
                  :class="[
                    'p-4 rounded-lg border',
                    option.selected ? 'border-green-300 bg-green-50' : 'border-gray-200'
                  ]"
                >
                  <div class="flex items-center gap-2 mb-2">
                    <span class="font-medium text-gray-900">{{ option.title }}</span>
                    <span v-if="option.selected" class="badge-green">Selected</span>
                  </div>

                  <p v-if="option.description" class="text-sm text-gray-600 mb-3">
                    {{ option.description }}
                  </p>

                  <div class="grid grid-cols-2 gap-4 text-sm">
                    <div v-if="option.pros.length > 0">
                      <span class="text-xs font-medium text-green-600">Pros</span>
                      <ul class="mt-1 space-y-1">
                        <li v-for="(pro, i) in option.pros" :key="i" class="flex items-start gap-1">
                          <svg class="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span class="text-gray-600">{{ pro }}</span>
                        </li>
                      </ul>
                    </div>

                    <div v-if="option.cons.length > 0">
                      <span class="text-xs font-medium text-red-600">Cons</span>
                      <ul class="mt-1 space-y-1">
                        <li v-for="(con, i) in option.cons" :key="i" class="flex items-start gap-1">
                          <svg class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span class="text-gray-600">{{ con }}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Rationale (for decided) -->
            <div v-if="decision.status === 'decided' && decision.rationale">
              <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Rationale</h4>
              <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ decision.rationale }}</p>
            </div>

            <!-- Outcome (if any) -->
            <div v-if="decision.outcome">
              <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Outcome</h4>
              <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ decision.outcome }}</p>
            </div>

            <!-- Actions -->
            <div v-if="authStore.canEdit" class="flex items-center gap-2 pt-3 border-t border-gray-200">
              <button
                v-if="decision.status === 'proposed'"
                class="text-xs px-3 py-1.5 rounded bg-accent-500 text-white hover:bg-accent-600"
                @click.stop="startMakeDecision(decision.id)"
              >
                Make Decision
              </button>
              <button
                v-if="decision.status === 'decided'"
                class="text-xs px-3 py-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                @click.stop="handleRevisitDecision(decision.id)"
              >
                Mark for Revisit
              </button>
              <button
                v-if="decision.status === 'revisited'"
                class="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                @click.stop="handleReopenDecision(decision.id)"
              >
                Reopen
              </button>
              <button
                class="text-xs px-3 py-1.5 rounded text-red-600 hover:bg-red-50"
                @click.stop="handleDeleteDecision(decision.id)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Error display -->
    <div v-if="decisionsStore.error" class="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
      {{ decisionsStore.error }}
    </div>
  </div>
</template>

<style scoped>
.badge-purple {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700;
}
</style>
