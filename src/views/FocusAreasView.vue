<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useFocusAreasStore } from '@/stores/focusAreas'
import type { FocusArea, ConfidenceLevel } from '@/types'

const authStore = useAuthStore()
const focusAreasStore = useFocusAreasStore()

const showAddForm = ref(false)
const editingId = ref<string | null>(null)

const defaultForm = {
  title: '',
  problemStatement: '',
  confidenceLevel: 'medium' as ConfidenceLevel,
  confidenceRationale: '',
  successCriteria: [''],
}

const form = ref({ ...defaultForm })

onMounted(() => {
  focusAreasStore.subscribe()
})

onUnmounted(() => {
  focusAreasStore.unsubscribe()
})

function resetForm() {
  form.value = { ...defaultForm, successCriteria: [''] }
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
    })
  } else {
    await focusAreasStore.addFocusArea({
      title: form.value.title,
      problemStatement: form.value.problemStatement,
      confidenceLevel: form.value.confidenceLevel,
      confidenceRationale: form.value.confidenceRationale,
      successCriteria: criteria,
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
        <textarea
          v-model="form.problemStatement"
          class="input min-h-[80px]"
          placeholder="What problem are we solving and for whom?"
        />
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
              placeholder="How will we know it's working?"
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
            class="card p-4 group"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-medium text-gray-900 truncate">{{ fa.title }}</h3>
                  <span :class="getConfidenceBadgeClass(fa.confidenceLevel)">
                    {{ fa.confidenceLevel }}
                  </span>
                </div>
                <p class="text-sm text-gray-600 mb-2">{{ fa.problemStatement }}</p>

                <div v-if="fa.confidenceRationale" class="text-xs text-gray-500 mb-2">
                  <span class="font-medium">Rationale:</span> {{ fa.confidenceRationale }}
                </div>

                <div v-if="fa.successCriteria?.length" class="mt-2">
                  <div class="text-xs font-medium text-gray-500 mb-1">Success Criteria:</div>
                  <ul class="text-sm text-gray-600 space-y-1">
                    <li v-for="(criteria, i) in fa.successCriteria" :key="i" class="flex gap-2">
                      <span class="text-gray-400">-</span>
                      {{ criteria }}
                    </li>
                  </ul>
                </div>
              </div>

              <div v-if="authStore.canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100">
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
  </div>
</template>
