<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useVisionStore } from '@/stores/vision'
import type { Principle } from '@/types'

const authStore = useAuthStore()
const visionStore = useVisionStore()

const isEditing = ref(false)
const editForm = ref({
  mission: '',
  vision: '',
})

const editingPrinciple = ref<Principle | null>(null)
const newPrinciple = ref({ title: '', description: '' })
const showAddPrinciple = ref(false)

const sortedPrinciples = computed(() => {
  if (!visionStore.vision?.principles) return []
  return [...visionStore.vision.principles].sort((a, b) => a.order - b.order)
})

const lastUpdated = computed(() => {
  if (!visionStore.vision?.updatedAt) return 'Not yet updated'
  const date = visionStore.vision.updatedAt.toDate()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
})

onMounted(() => {
  visionStore.subscribe()
})

onUnmounted(() => {
  visionStore.unsubscribe()
})

function startEditing() {
  editForm.value = {
    mission: visionStore.vision?.mission || '',
    vision: visionStore.vision?.vision || '',
  }
  isEditing.value = true
}

async function saveChanges() {
  await visionStore.saveVision({
    mission: editForm.value.mission,
    vision: editForm.value.vision,
    principles: visionStore.vision?.principles || [],
  })
  isEditing.value = false
}

function cancelEditing() {
  isEditing.value = false
}

async function handleAddPrinciple() {
  if (!newPrinciple.value.title.trim()) return
  await visionStore.addPrinciple(newPrinciple.value.title, newPrinciple.value.description)
  newPrinciple.value = { title: '', description: '' }
  showAddPrinciple.value = false
}

function startEditingPrinciple(principle: Principle) {
  editingPrinciple.value = { ...principle }
}

async function savePrinciple() {
  if (!editingPrinciple.value) return
  await visionStore.updatePrinciple(
    editingPrinciple.value.id,
    editingPrinciple.value.title,
    editingPrinciple.value.description
  )
  editingPrinciple.value = null
}

async function deletePrinciple(id: string) {
  if (!confirm('Delete this principle?')) return
  await visionStore.deletePrinciple(id)
}
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-gray-500">The north star. Stable foundation that rarely changes.</p>
      </div>
      <button
        v-if="authStore.canEditVision && !isEditing"
        class="btn-secondary text-sm"
        @click="startEditing"
      >
        Edit
      </button>
      <div v-if="isEditing" class="flex gap-2">
        <button class="btn-ghost text-sm" @click="cancelEditing">Cancel</button>
        <button class="btn-primary text-sm" :disabled="visionStore.saving" @click="saveChanges">
          {{ visionStore.saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="visionStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Mission -->
      <section class="card p-6">
        <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Mission</h2>
        <div v-if="isEditing">
          <textarea
            v-model="editForm.mission"
            class="input min-h-[80px]"
            placeholder="Your company mission..."
          />
        </div>
        <p v-else class="text-gray-900 whitespace-pre-wrap">
          {{ visionStore.vision?.mission || 'No mission defined yet.' }}
        </p>
      </section>

      <!-- Vision -->
      <section class="card p-6">
        <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Product Vision (2-5 Year)</h2>
        <div v-if="isEditing">
          <textarea
            v-model="editForm.vision"
            class="input min-h-[120px]"
            placeholder="Your product vision..."
          />
        </div>
        <p v-else class="text-gray-900 whitespace-pre-wrap">
          {{ visionStore.vision?.vision || 'No vision defined yet.' }}
        </p>
      </section>

      <!-- Principles -->
      <section class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Product Principles</h2>
          <button
            v-if="authStore.canEditVision && !showAddPrinciple"
            class="btn-ghost text-sm"
            @click="showAddPrinciple = true"
          >
            + Add
          </button>
        </div>

        <!-- Add principle form -->
        <div v-if="showAddPrinciple" class="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <input
            v-model="newPrinciple.title"
            class="input"
            placeholder="Principle title"
            @keyup.enter="handleAddPrinciple"
          />
          <textarea
            v-model="newPrinciple.description"
            class="input min-h-[60px]"
            placeholder="Description (optional)"
          />
          <div class="flex gap-2 justify-end">
            <button class="btn-ghost text-sm" @click="showAddPrinciple = false; newPrinciple = { title: '', description: '' }">
              Cancel
            </button>
            <button class="btn-primary text-sm" @click="handleAddPrinciple">
              Add Principle
            </button>
          </div>
        </div>

        <!-- Principles list -->
        <ol v-if="sortedPrinciples.length > 0" class="space-y-4">
          <li
            v-for="(principle, index) in sortedPrinciples"
            :key="principle.id"
            class="flex gap-3"
          >
            <span class="text-sm font-medium text-gray-400 mt-0.5">{{ index + 1 }}.</span>

            <!-- Editing mode for this principle -->
            <div v-if="editingPrinciple?.id === principle.id" class="flex-1 space-y-2">
              <input
                v-model="editingPrinciple.title"
                class="input"
                placeholder="Principle title"
              />
              <textarea
                v-model="editingPrinciple.description"
                class="input min-h-[60px]"
                placeholder="Description"
              />
              <div class="flex gap-2">
                <button class="btn-ghost text-sm" @click="editingPrinciple = null">Cancel</button>
                <button class="btn-primary text-sm" @click="savePrinciple">Save</button>
              </div>
            </div>

            <!-- Display mode -->
            <div v-else class="flex-1 group">
              <div class="flex items-start justify-between">
                <div>
                  <h3 class="text-sm font-medium text-gray-900">{{ principle.title }}</h3>
                  <p v-if="principle.description" class="text-sm text-gray-600 mt-1">
                    {{ principle.description }}
                  </p>
                </div>
                <div v-if="authStore.canEditVision" class="opacity-0 group-hover:opacity-100 flex gap-1">
                  <button
                    class="p-1 text-gray-400 hover:text-gray-600"
                    @click="startEditingPrinciple(principle)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    class="p-1 text-gray-400 hover:text-red-600"
                    @click="deletePrinciple(principle.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </li>
        </ol>
        <p v-else class="text-sm text-gray-500 italic">No principles defined yet.</p>
      </section>

      <!-- Last updated -->
      <div class="text-xs text-gray-400">
        Last updated: {{ lastUpdated }}
      </div>
    </template>
  </div>
</template>
