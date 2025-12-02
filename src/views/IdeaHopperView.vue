<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useIdeasStore } from '@/stores/ideas'
import { useFocusAreasStore } from '@/stores/focusAreas'
import type { Idea, JobType, IdeaStatus, JobToBeDone } from '@/types'

const authStore = useAuthStore()
const ideasStore = useIdeasStore()
const focusAreasStore = useFocusAreasStore()

const showAddForm = ref(false)
const editingId = ref<string | null>(null)
const expandedIdeaId = ref<string | null>(null)
const activeTab = ref<IdeaStatus | 'all'>('all')

const defaultForm = {
  title: '',
  description: '',
  job: {
    progress: '',
    customer: '',
    circumstance: '',
    type: 'functional' as JobType,
  } as JobToBeDone,
  notes: '',
  focusAreaId: '',
}

const form = ref({ ...defaultForm })

onMounted(() => {
  ideasStore.subscribe()
  focusAreasStore.subscribe()
})

onUnmounted(() => {
  ideasStore.unsubscribe()
  focusAreasStore.unsubscribe()
})

const filteredIdeas = computed(() => {
  if (activeTab.value === 'all') return ideasStore.ideas
  return ideasStore.ideas.filter((idea) => idea.status === activeTab.value)
})

const statusCounts = computed(() => ({
  all: ideasStore.ideas.length,
  new: ideasStore.newIdeas.length,
  exploring: ideasStore.exploringIdeas.length,
  validated: ideasStore.validatedIdeas.length,
  parked: ideasStore.parkedIdeas.length,
  promoted: ideasStore.promotedIdeas.length,
}))

function resetForm() {
  form.value = {
    ...defaultForm,
    job: { ...defaultForm.job },
  }
  showAddForm.value = false
  editingId.value = null
}

async function handleSubmit() {
  const data = {
    title: form.value.title,
    description: form.value.description,
    job: form.value.job,
    notes: form.value.notes || undefined,
    focusAreaId: form.value.focusAreaId || undefined,
  }

  if (editingId.value) {
    await ideasStore.updateIdea(editingId.value, data)
  } else {
    await ideasStore.addIdea(data)
  }
  resetForm()
}

function startEditing(idea: Idea) {
  editingId.value = idea.id
  form.value = {
    title: idea.title,
    description: idea.description,
    job: { ...idea.job },
    notes: idea.notes || '',
    focusAreaId: idea.focusAreaId || '',
  }
  showAddForm.value = true
}

async function handleStatusChange(id: string, status: IdeaStatus) {
  await ideasStore.updateStatus(id, status)
}

async function handleDelete(id: string) {
  if (!confirm('Delete this idea?')) return
  await ideasStore.deleteIdea(id)
}

function toggleExpanded(id: string) {
  expandedIdeaId.value = expandedIdeaId.value === id ? null : id
}

function getJobTypeBadgeClass(type: JobType) {
  switch (type) {
    case 'functional':
      return 'badge-blue'
    case 'social':
      return 'badge-purple'
    case 'emotional':
      return 'badge-pink'
  }
}

function getStatusBadgeClass(status: IdeaStatus) {
  switch (status) {
    case 'new':
      return 'badge-gray'
    case 'exploring':
      return 'badge-blue'
    case 'validated':
      return 'badge-green'
    case 'parked':
      return 'badge-yellow'
    case 'promoted':
      return 'badge-indigo'
  }
}

function getFocusAreaTitle(id: string): string {
  const fa = focusAreasStore.focusAreas.find((f) => f.id === id)
  return fa?.title || 'Unknown'
}

function formatJobStatement(job: JobToBeDone): string {
  return `${job.customer} wants to ${job.progress} when ${job.circumstance}`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">
        Capture and track product ideas with their Jobs to be Done.
      </p>
      <button
        v-if="authStore.canEdit && !showAddForm"
        class="btn-primary text-sm"
        @click="showAddForm = true"
      >
        Add Idea
      </button>
    </div>

    <!-- Add/Edit Form -->
    <div v-if="showAddForm" class="card p-6 space-y-4">
      <h3 class="font-medium text-gray-900">
        {{ editingId ? 'Edit Idea' : 'New Idea' }}
      </h3>

      <div>
        <label class="label">Title</label>
        <input
          v-model="form.title"
          class="input"
          placeholder="e.g., In-app messaging for care coordinators"
        />
      </div>

      <div>
        <label class="label">Description</label>
        <textarea
          v-model="form.description"
          class="input min-h-[80px]"
          placeholder="Describe the idea..."
        />
      </div>

      <!-- Job to be Done Section -->
      <div class="border rounded-lg p-4 bg-gray-50 space-y-4">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h4 class="font-medium text-gray-900">Job to be Done</h4>
        </div>
        <p class="text-xs text-gray-500">
          The PROGRESS that a CUSTOMER wants to make in a particular CIRCUMSTANCE
        </p>

        <div>
          <label class="label">Customer (Who)</label>
          <input
            v-model="form.job.customer"
            class="input"
            placeholder="e.g., First responders with chronic pain"
          />
        </div>

        <div>
          <label class="label">Progress (What they want to accomplish)</label>
          <input
            v-model="form.job.progress"
            class="input"
            placeholder="e.g., get quick answers about their treatment options"
          />
        </div>

        <div>
          <label class="label">Circumstance (When/Where)</label>
          <input
            v-model="form.job.circumstance"
            class="input"
            placeholder="e.g., they're between shifts and can't make a phone call"
          />
        </div>

        <div>
          <label class="label">Job Type</label>
          <div class="flex gap-3 mt-1">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="form.job.type"
                type="radio"
                value="functional"
                class="text-indigo-600"
              />
              <span class="text-sm">Functional</span>
              <span class="text-xs text-gray-400">(get something done)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="form.job.type"
                type="radio"
                value="social"
                class="text-indigo-600"
              />
              <span class="text-sm">Social</span>
              <span class="text-xs text-gray-400">(how others perceive)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="form.job.type"
                type="radio"
                value="emotional"
                class="text-indigo-600"
              />
              <span class="text-sm">Emotional</span>
              <span class="text-xs text-gray-400">(how they feel)</span>
            </label>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label">Link to Focus Area (optional)</label>
          <select v-model="form.focusAreaId" class="input">
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
          <label class="label">Notes (optional)</label>
          <input
            v-model="form.notes"
            class="input"
            placeholder="Additional context or notes"
          />
        </div>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="btn-ghost" @click="resetForm">Cancel</button>
        <button
          class="btn-primary"
          :disabled="ideasStore.saving || !form.title.trim() || !form.job.customer.trim()"
          @click="handleSubmit"
        >
          {{ ideasStore.saving ? 'Saving...' : editingId ? 'Update' : 'Add Idea' }}
        </button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
      <button
        v-for="tab in (['all', 'new', 'exploring', 'validated', 'parked', 'promoted'] as const)"
        :key="tab"
        :class="[
          'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
          activeTab === tab
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900',
        ]"
        @click="activeTab = tab"
      >
        {{ tab.charAt(0).toUpperCase() + tab.slice(1) }}
        <span class="ml-1 text-xs text-gray-400">({{ statusCounts[tab] }})</span>
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="ideasStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Ideas list -->
      <div v-if="filteredIdeas.length === 0" class="card p-6 text-center">
        <p class="text-sm text-gray-500">
          {{ activeTab === 'all' ? 'No ideas yet. Add your first idea!' : `No ${activeTab} ideas.` }}
        </p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="idea in filteredIdeas"
          :key="idea.id"
          class="card overflow-hidden group"
        >
          <!-- Header row - always visible -->
          <div
            class="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
            @click="toggleExpanded(idea.id)"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <svg
                    :class="[
                      'w-4 h-4 text-gray-400 transition-transform',
                      expandedIdeaId === idea.id ? 'rotate-90' : '',
                    ]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  <h3 class="font-medium text-gray-900 truncate">{{ idea.title }}</h3>
                  <span :class="getStatusBadgeClass(idea.status)">{{ idea.status }}</span>
                  <span :class="getJobTypeBadgeClass(idea.job.type)">{{ idea.job.type }}</span>
                </div>
                <p class="text-sm text-gray-600 pl-6 truncate">
                  {{ formatJobStatement(idea.job) }}
                </p>
              </div>

              <div
                v-if="authStore.canEdit"
                class="flex gap-1 opacity-0 group-hover:opacity-100"
                @click.stop
              >
                <button
                  class="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                  title="Edit"
                  @click="startEditing(idea)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  class="p-1.5 text-gray-400 hover:text-red-600 rounded"
                  title="Delete"
                  @click="handleDelete(idea.id)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Expanded content -->
          <Transition name="expand">
            <div v-if="expandedIdeaId === idea.id" class="border-t bg-gray-50">
              <div class="p-4 space-y-4">
                <!-- Description -->
                <div v-if="idea.description">
                  <div class="text-xs font-medium text-gray-500 uppercase mb-1">Description</div>
                  <p class="text-sm text-gray-700">{{ idea.description }}</p>
                </div>

                <!-- Job to be Done details -->
                <div class="bg-white rounded-lg p-3 border">
                  <div class="text-xs font-medium text-gray-500 uppercase mb-2">Job to be Done</div>
                  <div class="space-y-2 text-sm">
                    <div>
                      <span class="font-medium text-gray-600">Customer:</span>
                      <span class="text-gray-700 ml-1">{{ idea.job.customer }}</span>
                    </div>
                    <div>
                      <span class="font-medium text-gray-600">Progress:</span>
                      <span class="text-gray-700 ml-1">{{ idea.job.progress }}</span>
                    </div>
                    <div>
                      <span class="font-medium text-gray-600">Circumstance:</span>
                      <span class="text-gray-700 ml-1">{{ idea.job.circumstance }}</span>
                    </div>
                  </div>
                </div>

                <!-- Focus Area link -->
                <div v-if="idea.focusAreaId" class="text-sm">
                  <span class="font-medium text-gray-600">Focus Area:</span>
                  <span class="text-indigo-600 ml-1">{{ getFocusAreaTitle(idea.focusAreaId) }}</span>
                </div>

                <!-- Notes -->
                <div v-if="idea.notes" class="text-sm">
                  <span class="font-medium text-gray-600">Notes:</span>
                  <span class="text-gray-700 ml-1">{{ idea.notes }}</span>
                </div>

                <!-- Status change buttons -->
                <div v-if="authStore.canEdit" class="pt-2 border-t flex flex-wrap gap-2">
                  <span class="text-xs text-gray-500 self-center mr-2">Move to:</span>
                  <button
                    v-for="status in (['new', 'exploring', 'validated', 'parked', 'promoted'] as IdeaStatus[])"
                    :key="status"
                    :disabled="idea.status === status"
                    :class="[
                      'px-2 py-1 text-xs rounded transition-colors',
                      idea.status === status
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
                    ]"
                    @click="handleStatusChange(idea.id, status)"
                  >
                    {{ status }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
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

.badge-blue {
  @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800;
}

.badge-purple {
  @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800;
}

.badge-pink {
  @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-100 text-pink-800;
}

.badge-indigo {
  @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800;
}
</style>
