<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useObjectivesStore } from '@/stores/objectives'
import type { KeyResult, KeyResultStatus, ObjectiveStatus } from '@/types'

const authStore = useAuthStore()
const objectivesStore = useObjectivesStore()

const showAddObjective = ref(false)
const editingKeyResultId = ref<string | null>(null)
const showAddKeyResult = ref<string | null>(null)
const selectedQuarter = ref<string | null>(null)

const objectiveForm = ref({
  title: '',
  description: '',
  owner: '',
  quarter: getCurrentQuarter(),
  keyResults: [] as Omit<KeyResult, 'id'>[],
})

const keyResultForm = ref({
  title: '',
  target: 100,
  current: 0,
  unit: '%',
  status: 'on_track' as KeyResultStatus,
})

const keyResultStatuses: { value: KeyResultStatus; label: string }[] = [
  { value: 'on_track', label: 'On Track' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'behind', label: 'Behind' },
  { value: 'completed', label: 'Completed' },
]

function getCurrentQuarter(): string {
  const now = new Date()
  const quarter = Math.ceil((now.getMonth() + 1) / 3)
  return `Q${quarter} ${now.getFullYear()}`
}

const displayedQuarter = computed(() => {
  if (selectedQuarter.value) return selectedQuarter.value
  if (objectivesStore.quarters.length > 0) return objectivesStore.quarters[0]
  return getCurrentQuarter()
})

const filteredObjectives = computed(() => {
  const quarter = displayedQuarter.value
  return quarter ? objectivesStore.getObjectivesByQuarter(quarter) : []
})

onMounted(() => {
  objectivesStore.subscribe()
})

onUnmounted(() => {
  objectivesStore.unsubscribe()
})

function addKeyResultToForm() {
  objectiveForm.value.keyResults.push({
    title: '',
    target: 100,
    current: 0,
    unit: '%',
    status: 'on_track',
  })
}

function removeKeyResultFromForm(index: number) {
  objectiveForm.value.keyResults.splice(index, 1)
}

async function handleSubmitObjective() {
  if (!objectiveForm.value.title.trim()) return

  await objectivesStore.addObjective({
    title: objectiveForm.value.title,
    description: objectiveForm.value.description,
    owner: objectiveForm.value.owner,
    quarter: objectiveForm.value.quarter,
    keyResults: objectiveForm.value.keyResults.filter(kr => kr.title.trim()),
  })

  resetObjectiveForm()
  showAddObjective.value = false
}

function resetObjectiveForm() {
  objectiveForm.value = {
    title: '',
    description: '',
    owner: '',
    quarter: getCurrentQuarter(),
    keyResults: [],
  }
}

async function handleUpdateKeyResult(
  objectiveId: string,
  keyResultId: string,
  current: number,
  status: KeyResultStatus
) {
  await objectivesStore.updateKeyResult(objectiveId, keyResultId, { current, status })
  editingKeyResultId.value = null
}

async function handleAddKeyResult(objectiveId: string) {
  if (!keyResultForm.value.title.trim()) return

  await objectivesStore.addKeyResult(objectiveId, {
    title: keyResultForm.value.title,
    target: keyResultForm.value.target,
    current: keyResultForm.value.current,
    unit: keyResultForm.value.unit,
    status: keyResultForm.value.status,
  })

  keyResultForm.value = {
    title: '',
    target: 100,
    current: 0,
    unit: '%',
    status: 'on_track',
  }
  showAddKeyResult.value = null
}

async function handleDeleteKeyResult(objectiveId: string, keyResultId: string) {
  if (!confirm('Delete this key result?')) return
  await objectivesStore.deleteKeyResult(objectiveId, keyResultId)
}

async function handleUpdateObjectiveStatus(id: string, status: ObjectiveStatus) {
  await objectivesStore.updateObjective(id, { status })
}

async function handleDeleteObjective(id: string) {
  if (!confirm('Delete this objective and all its key results?')) return
  await objectivesStore.deleteObjective(id)
}

function getProgressColor(progress: number): string {
  if (progress >= 70) return 'bg-green-500'
  if (progress >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p class="text-sm text-gray-500">Track team objectives and key results (OKRs).</p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Quarter selector -->
        <select
          v-if="objectivesStore.quarters.length > 0"
          v-model="selectedQuarter"
          class="input text-sm py-1.5"
        >
          <option :value="null">Current Quarter</option>
          <option v-for="q in objectivesStore.quarters" :key="q" :value="q">
            {{ q }}
          </option>
        </select>

        <button
          v-if="authStore.canEdit && !showAddObjective"
          class="btn-primary text-sm"
          @click="showAddObjective = true"
        >
          Add Objective
        </button>
      </div>
    </div>

    <!-- Add Objective Form -->
    <div v-if="showAddObjective" class="card p-6 space-y-4">
      <h3 class="font-medium text-gray-900">New Objective</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="label">Objective Title</label>
          <input
            v-model="objectiveForm.title"
            class="input"
            placeholder="What do you want to achieve?"
          />
        </div>

        <div class="md:col-span-2">
          <label class="label">Description</label>
          <textarea
            v-model="objectiveForm.description"
            class="input min-h-[60px]"
            placeholder="Why is this important?"
          />
        </div>

        <div>
          <label class="label">Owner</label>
          <input
            v-model="objectiveForm.owner"
            class="input"
            placeholder="Who's responsible?"
          />
        </div>

        <div>
          <label class="label">Quarter</label>
          <input
            v-model="objectiveForm.quarter"
            class="input"
            placeholder="e.g., Q1 2025"
          />
        </div>
      </div>

      <!-- Key Results -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="label mb-0">Key Results</label>
          <button
            type="button"
            class="btn-ghost text-sm"
            @click="addKeyResultToForm"
          >
            + Add Key Result
          </button>
        </div>

        <div
          v-for="(kr, index) in objectiveForm.keyResults"
          :key="index"
          class="p-3 bg-gray-50 rounded-lg space-y-3"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">Key Result {{ index + 1 }}</span>
            <button
              type="button"
              class="text-gray-400 hover:text-red-600"
              @click="removeKeyResultFromForm(index)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <input
            v-model="kr.title"
            class="input"
            placeholder="Key result description"
          />

          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="text-xs text-gray-500">Target</label>
              <input
                v-model.number="kr.target"
                type="number"
                class="input"
              />
            </div>
            <div>
              <label class="text-xs text-gray-500">Current</label>
              <input
                v-model.number="kr.current"
                type="number"
                class="input"
              />
            </div>
            <div>
              <label class="text-xs text-gray-500">Unit</label>
              <input
                v-model="kr.unit"
                class="input"
                placeholder="%"
              />
            </div>
          </div>
        </div>

        <p v-if="objectiveForm.keyResults.length === 0" class="text-sm text-gray-400 italic">
          No key results added yet. Click "Add Key Result" to add measurable outcomes.
        </p>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="btn-ghost" @click="showAddObjective = false; resetObjectiveForm()">
          Cancel
        </button>
        <button
          class="btn-primary"
          :disabled="objectivesStore.saving || !objectiveForm.title.trim()"
          @click="handleSubmitObjective"
        >
          {{ objectivesStore.saving ? 'Saving...' : 'Create Objective' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="objectivesStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Quarter heading -->
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-medium text-gray-900">{{ displayedQuarter }}</h2>
        <span class="text-sm text-gray-500">
          {{ filteredObjectives.length }} objective{{ filteredObjectives.length !== 1 ? 's' : '' }}
        </span>
      </div>

      <!-- No objectives -->
      <div v-if="filteredObjectives.length === 0" class="card p-6 text-center">
        <p class="text-sm text-gray-500">No objectives for {{ displayedQuarter }}.</p>
        <p class="text-xs text-gray-400 mt-1">Add an objective to start tracking progress.</p>
      </div>

      <!-- Objectives list -->
      <div v-else class="space-y-4">
        <div
          v-for="objective in filteredObjectives"
          :key="objective.id"
          class="card overflow-hidden"
        >
          <!-- Objective header -->
          <div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-medium text-gray-900">{{ objective.title }}</h3>
                  <span
                    v-if="objective.status === 'completed'"
                    class="badge-green"
                  >
                    Completed
                  </span>
                </div>
                <p v-if="objective.description" class="text-sm text-gray-600">
                  {{ objective.description }}
                </p>
                <div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <span v-if="objective.owner">Owner: {{ objective.owner }}</span>
                </div>
              </div>

              <!-- Progress circle -->
              <div class="flex flex-col items-center">
                <div class="relative w-14 h-14">
                  <svg class="w-14 h-14 transform -rotate-90">
                    <circle
                      cx="28"
                      cy="28"
                      r="24"
                      stroke="currentColor"
                      stroke-width="4"
                      fill="none"
                      class="text-gray-200"
                    />
                    <circle
                      cx="28"
                      cy="28"
                      r="24"
                      stroke="currentColor"
                      stroke-width="4"
                      fill="none"
                      :class="getProgressColor(objectivesStore.getObjectiveProgress(objective)).replace('bg-', 'text-')"
                      :stroke-dasharray="`${objectivesStore.getObjectiveProgress(objective) * 1.51} 151`"
                    />
                  </svg>
                  <span class="absolute inset-0 flex items-center justify-center text-sm font-medium">
                    {{ objectivesStore.getObjectiveProgress(objective) }}%
                  </span>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div v-if="authStore.canEdit" class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
              <button
                v-if="objective.status === 'active'"
                class="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100"
                @click="handleUpdateObjectiveStatus(objective.id, 'completed')"
              >
                Mark Complete
              </button>
              <button
                v-if="objective.status === 'completed'"
                class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                @click="handleUpdateObjectiveStatus(objective.id, 'active')"
              >
                Reopen
              </button>
              <button
                class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                @click="handleUpdateObjectiveStatus(objective.id, 'archived')"
              >
                Archive
              </button>
              <button
                class="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50"
                @click="handleDeleteObjective(objective.id)"
              >
                Delete
              </button>
            </div>
          </div>

          <!-- Key Results -->
          <div class="p-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Key Results ({{ objective.keyResults.length }})
              </span>
              <button
                v-if="authStore.canEdit && showAddKeyResult !== objective.id"
                class="btn-ghost text-xs"
                @click="showAddKeyResult = objective.id"
              >
                + Add
              </button>
            </div>

            <!-- Add Key Result Form -->
            <div v-if="showAddKeyResult === objective.id" class="p-3 bg-gray-50 rounded-lg space-y-3">
              <input
                v-model="keyResultForm.title"
                class="input"
                placeholder="Key result description"
              />
              <div class="grid grid-cols-4 gap-2">
                <div>
                  <label class="text-xs text-gray-500">Target</label>
                  <input
                    v-model.number="keyResultForm.target"
                    type="number"
                    class="input"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-500">Current</label>
                  <input
                    v-model.number="keyResultForm.current"
                    type="number"
                    class="input"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-500">Unit</label>
                  <input
                    v-model="keyResultForm.unit"
                    class="input"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-500">Status</label>
                  <select v-model="keyResultForm.status" class="input">
                    <option v-for="s in keyResultStatuses" :key="s.value" :value="s.value">
                      {{ s.label }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="flex gap-2 justify-end">
                <button class="btn-ghost text-sm" @click="showAddKeyResult = null">Cancel</button>
                <button
                  class="btn-primary text-sm"
                  :disabled="!keyResultForm.title.trim()"
                  @click="handleAddKeyResult(objective.id)"
                >
                  Add
                </button>
              </div>
            </div>

            <!-- Key Results List -->
            <div v-if="objective.keyResults.length === 0" class="text-sm text-gray-400 italic">
              No key results defined.
            </div>

            <div
              v-for="kr in objective.keyResults"
              :key="kr.id"
              class="group"
            >
              <!-- Editing key result -->
              <div v-if="editingKeyResultId === kr.id" class="p-3 bg-gray-50 rounded-lg space-y-2">
                <div class="text-sm font-medium text-gray-900">{{ kr.title }}</div>
                <div class="grid grid-cols-3 gap-2">
                  <div>
                    <label class="text-xs text-gray-500">Current</label>
                    <input
                      :value="kr.current"
                      type="number"
                      class="input"
                      @input="(e) => kr.current = Number((e.target as HTMLInputElement).value)"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">Target: {{ kr.target }} {{ kr.unit }}</label>
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">Status</label>
                    <select
                      :value="kr.status"
                      class="input"
                      @change="(e) => kr.status = (e.target as HTMLSelectElement).value as KeyResultStatus"
                    >
                      <option v-for="s in keyResultStatuses" :key="s.value" :value="s.value">
                        {{ s.label }}
                      </option>
                    </select>
                  </div>
                </div>
                <div class="flex gap-2 justify-end">
                  <button class="btn-ghost text-sm" @click="editingKeyResultId = null">Cancel</button>
                  <button
                    class="btn-primary text-sm"
                    @click="handleUpdateKeyResult(objective.id, kr.id, kr.current, kr.status)"
                  >
                    Save
                  </button>
                </div>
              </div>

              <!-- Display key result -->
              <div v-else class="flex items-center gap-3 py-2">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-900">{{ kr.title }}</span>
                    <span :class="objectivesStore.getKeyResultStatusClass(kr.status)" class="text-xs">
                      {{ kr.status.replace('_', ' ') }}
                    </span>
                  </div>

                  <!-- Progress bar -->
                  <div class="mt-1.5 flex items-center gap-2">
                    <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        :class="getProgressColor(kr.target > 0 ? (kr.current / kr.target) * 100 : 0)"
                        class="h-full rounded-full transition-all"
                        :style="{ width: `${Math.min((kr.current / kr.target) * 100, 100)}%` }"
                      />
                    </div>
                    <span class="text-xs text-gray-500 w-24 text-right">
                      {{ kr.current }} / {{ kr.target }} {{ kr.unit }}
                    </span>
                  </div>
                </div>

                <!-- Actions -->
                <div v-if="authStore.canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    class="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    title="Edit"
                    @click="editingKeyResultId = kr.id"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    class="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Delete"
                    @click="handleDeleteKeyResult(objective.id, kr.id)"
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
      </div>

      <!-- Archived section -->
      <div v-if="objectivesStore.archivedObjectives.length > 0" class="mt-8">
        <details class="group">
          <summary class="flex items-center gap-2 cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            <svg class="w-4 h-4 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            Archived ({{ objectivesStore.archivedObjectives.length }})
          </summary>

          <div class="mt-3 space-y-2">
            <div
              v-for="objective in objectivesStore.archivedObjectives"
              :key="objective.id"
              class="card p-3 bg-gray-50 group"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-sm text-gray-600">{{ objective.title }}</span>
                  <span class="text-xs text-gray-400 ml-2">{{ objective.quarter }}</span>
                </div>
                <div v-if="authStore.canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    class="text-xs px-2 py-1 rounded text-gray-600 hover:bg-gray-200"
                    @click="handleUpdateObjectiveStatus(objective.id, 'active')"
                  >
                    Restore
                  </button>
                  <button
                    class="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50"
                    @click="handleDeleteObjective(objective.id)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </template>

    <!-- Error display -->
    <div v-if="objectivesStore.error" class="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
      {{ objectivesStore.error }}
    </div>
  </div>
</template>
