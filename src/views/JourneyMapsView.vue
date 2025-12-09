<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useIdeasStore } from '@/stores/ideas'
import { useJourneyMapsStore } from '@/stores/journeyMaps'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/firebase/config'
import type { JourneyMap, JourneyStep, ExperienceLevel, Idea } from '@/types'
import AudioTranscriber from '@/components/AudioTranscriber.vue'

const authStore = useAuthStore()
const ideasStore = useIdeasStore()
const journeyMapsStore = useJourneyMapsStore()

// View state
const selectedIdeaId = ref<string | null>(null)
const selectedJourneyMapId = ref<string | null>(null)
const showCreateForm = ref(false)
const editingJourneyMap = ref<JourneyMap | null>(null)

// Form state
const formTitle = ref('')
const formSubtitle = ref('')
const formSteps = ref<Omit<JourneyStep, 'id'>[]>([])

// AI generation state
const generating = ref(false)
const generateError = ref<string | null>(null)

// Step detail modal state
const expandedStep = ref<(JourneyStep | Omit<JourneyStep, 'id'>) | null>(null)

function openStepDetail(step: JourneyStep | Omit<JourneyStep, 'id'>) {
  expandedStep.value = step
}

function closeStepDetail() {
  expandedStep.value = null
}

onMounted(() => {
  ideasStore.subscribe()
  journeyMapsStore.subscribe()
})

onUnmounted(() => {
  ideasStore.unsubscribe()
  journeyMapsStore.unsubscribe()
})

// Get ideas that have a complete JTBD
const ideasWithJobs = computed(() => {
  return ideasStore.ideas.filter(
    (idea) => idea.job?.customer && idea.job?.progress && idea.job?.circumstance
  )
})

// Get journey maps for selected idea
const journeyMapsForIdea = computed(() => {
  if (!selectedIdeaId.value) return []
  return journeyMapsStore.getJourneyMapsForIdea(selectedIdeaId.value)
})

// Currently selected journey map
const currentJourneyMap = computed(() => {
  if (!selectedJourneyMapId.value) return null
  return journeyMapsStore.getJourneyMapById(selectedJourneyMapId.value) || null
})

// Selected idea details
const selectedIdea = computed(() => {
  if (!selectedIdeaId.value) return null
  return ideasStore.getIdeaById(selectedIdeaId.value) || null
})

// Watch for idea changes
watch(selectedIdeaId, () => {
  selectedJourneyMapId.value = null
  showCreateForm.value = false
})

function resetForm() {
  formTitle.value = ''
  formSubtitle.value = ''
  formSteps.value = []
  editingJourneyMap.value = null
  showCreateForm.value = false
}

function startCreate() {
  resetForm()
  showCreateForm.value = true
}

function startEdit(journeyMap: JourneyMap) {
  editingJourneyMap.value = journeyMap
  formTitle.value = journeyMap.title
  formSubtitle.value = journeyMap.subtitle || ''
  formSteps.value = journeyMap.steps.map((s) => ({ ...s }))
  showCreateForm.value = true
}

function addStep() {
  const lastStep = formSteps.value[formSteps.value.length - 1]
  const newOrder = formSteps.value.length + 1
  const newTimelineDay = lastStep ? lastStep.timelineDay + 7 : 0

  formSteps.value.push({
    order: newOrder,
    title: '',
    description: '',
    outcome: '',
    timelineDay: newTimelineDay,
    negativeExperience: 3 as ExperienceLevel,
    positiveExperience: 3 as ExperienceLevel,
    painPointNote: '',
  })
}

function removeStep(index: number) {
  formSteps.value.splice(index, 1)
  // Re-order remaining steps
  formSteps.value.forEach((step, i) => {
    step.order = i + 1
  })
}

async function generateWithAI(transcriptText?: string) {
  if (!selectedIdea.value) return

  generating.value = true
  generateError.value = null

  try {
    const generateFn = httpsCallable(functions, 'generateJourneyMap')
    const result = await generateFn({
      job: selectedIdea.value.job,
      ideaTitle: selectedIdea.value.title,
      ideaDescription: selectedIdea.value.description + (transcriptText ? `\n\nTranscript from customer call:\n${transcriptText}` : ''),
    })

    const data = result.data as {
      journeyMap: { title: string; subtitle?: string; steps: Omit<JourneyStep, 'id'>[] }
    }

    formTitle.value = data.journeyMap.title
    formSubtitle.value = data.journeyMap.subtitle || ''
    formSteps.value = data.journeyMap.steps.map((s, i) => ({
      ...s,
      order: i + 1,
      negativeExperience: Math.min(5, Math.max(1, s.negativeExperience)) as ExperienceLevel,
      positiveExperience: Math.min(5, Math.max(1, s.positiveExperience)) as ExperienceLevel,
    }))
  } catch (err) {
    console.error('Failed to generate journey map:', err)
    generateError.value = err instanceof Error ? err.message : 'Failed to generate journey map'
  } finally {
    generating.value = false
  }
}

// Handle transcription from audio recording
async function handleTranscriptionComplete(result: { text: string; documentId?: string }) {
  // Use the transcribed text to generate the journey map with additional context
  await generateWithAI(result.text)
}

async function handleSubmit() {
  if (!selectedIdeaId.value || formSteps.value.length === 0) return

  const stepsWithIds = formSteps.value.map((step, index) => ({
    ...step,
    id: editingJourneyMap.value?.steps[index]?.id || `step-${Date.now()}-${index}`,
  }))

  if (editingJourneyMap.value) {
    await journeyMapsStore.updateJourneyMap(editingJourneyMap.value.id, {
      title: formTitle.value,
      subtitle: formSubtitle.value,
      steps: stepsWithIds,
    })
    selectedJourneyMapId.value = editingJourneyMap.value.id
  } else {
    await journeyMapsStore.addJourneyMap({
      title: formTitle.value,
      subtitle: formSubtitle.value,
      ideaId: selectedIdeaId.value,
      steps: formSteps.value,
    })
  }

  resetForm()
}

async function handleDelete(id: string) {
  if (!confirm('Delete this journey map?')) return
  await journeyMapsStore.deleteJourneyMap(id)
  if (selectedJourneyMapId.value === id) {
    selectedJourneyMapId.value = null
  }
}

function formatJobStatement(idea: Idea): string {
  return `${idea.job.customer} wants to ${idea.job.progress} when ${idea.job.circumstance}`
}

// Chart calculations
const chartConfig = computed(() => {
  const steps = currentJourneyMap.value?.steps || formSteps.value
  if (steps.length === 0) return null

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
  const maxDay = Math.max(...sortedSteps.map((s) => s.timelineDay), 1)
  const chartWidth = 100 // percentage
  const chartHeight = 300 // pixels
  const padding = { left: 60, right: 20, top: 40, bottom: 60 }

  return {
    steps: sortedSteps,
    maxDay,
    chartWidth,
    chartHeight,
    padding,
  }
})

function getJobTypeBadgeClass(type: string) {
  switch (type) {
    case 'functional':
      return 'badge-blue'
    case 'social':
      return 'badge-purple'
    case 'emotional':
      return 'badge-pink'
    default:
      return 'badge-gray'
  }
}

function getExperienceColor(value: number, isNegative: boolean) {
  if (isNegative) {
    const colors = ['bg-red-100', 'bg-red-200', 'bg-red-300', 'bg-red-400', 'bg-red-500']
    return colors[value - 1]
  } else {
    const colors = ['bg-green-100', 'bg-green-200', 'bg-green-300', 'bg-green-400', 'bg-green-500']
    return colors[value - 1]
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm text-gray-500">
          Map customer journeys for Jobs to be Done to visualize pain points and opportunities.
        </p>
      </div>
    </div>

    <!-- Idea Selection Card -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4">
        <h2 class="text-white font-semibold flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Select an Idea
        </h2>
      </div>
      <div class="p-6">
        <select v-model="selectedIdeaId" class="input">
          <option :value="null">Choose an idea with a Job to be Done...</option>
          <option v-for="idea in ideasWithJobs" :key="idea.id" :value="idea.id">
            {{ idea.title }}
          </option>
        </select>

        <div v-if="selectedIdea" class="mt-4 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-semibold text-gray-900">Job to be Done</span>
                <span :class="getJobTypeBadgeClass(selectedIdea.job.type)">{{ selectedIdea.job.type }}</span>
              </div>
              <p class="text-sm text-gray-600 leading-relaxed">{{ formatJobStatement(selectedIdea) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template v-if="selectedIdeaId">
      <!-- Journey Maps Header -->
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Journey Maps
          <span class="text-sm font-normal text-gray-500">({{ journeyMapsForIdea.length }})</span>
        </h2>
        <button
          v-if="authStore.canEdit && !showCreateForm"
          class="btn-primary inline-flex items-center gap-2"
          @click="startCreate"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Journey Map
        </button>
      </div>

      <!-- Existing Journey Maps Grid -->
      <div v-if="journeyMapsForIdea.length > 0 && !showCreateForm" class="grid md:grid-cols-2 gap-4">
        <div
          v-for="jm in journeyMapsForIdea"
          :key="jm.id"
          :class="[
            'group bg-white rounded-xl border-2 p-5 cursor-pointer transition-all duration-200',
            selectedJourneyMapId === jm.id
              ? 'border-indigo-500 shadow-lg shadow-indigo-100'
              : 'border-gray-200 hover:border-indigo-300 hover:shadow-md',
          ]"
          @click="selectedJourneyMapId = jm.id"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-gray-900 truncate">{{ jm.title }}</h3>
              <p v-if="jm.subtitle" class="text-sm text-gray-500 mt-0.5 line-clamp-2">{{ jm.subtitle }}</p>
              <div class="flex items-center gap-3 mt-3">
                <span class="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  {{ jm.steps.length }} steps
                </span>
              </div>
            </div>
            <div v-if="authStore.canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
              <button
                class="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Edit"
                @click="startEdit(jm)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
                @click="handleDelete(jm.id)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Create/Edit Form -->
      <div v-if="showCreateForm" class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <!-- Form Header -->
        <div class="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">
                {{ editingJourneyMap ? 'Edit Journey Map' : 'Create Journey Map' }}
              </h3>
              <p class="text-indigo-100 text-sm mt-1">Define the steps in your customer's journey</p>
            </div>
            <div v-if="authStore.canEdit && !editingJourneyMap" class="flex items-center gap-2">
              <!-- Listen & Enrich with AI - Audio Transcription -->
              <AudioTranscriber
                mode="journey-map"
                :source-id="selectedIdeaId || undefined"
                :source-name="selectedIdea?.title"
                @transcribed="handleTranscriptionComplete"
              >
                <template #trigger="{ start, isRecording }">
                  <button
                    v-if="!isRecording"
                    class="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-sm font-medium backdrop-blur-sm"
                    :disabled="generating"
                    @click="start"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Listen & Enrich
                  </button>
                </template>
              </AudioTranscriber>
              <button
                class="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors text-sm font-medium backdrop-blur-sm"
                :disabled="generating"
                @click="generateWithAI()"
              >
                <svg v-if="generating" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                {{ generating ? 'Generating...' : 'Generate with AI' }}
              </button>
            </div>
          </div>
        </div>

        <div class="p-6 space-y-6">
          <div v-if="generateError" class="flex items-center gap-3 bg-red-50 text-red-700 text-sm p-4 rounded-lg border border-red-200">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ generateError }}
          </div>

          <!-- Title/Subtitle -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
              <input
                v-model="formTitle"
                class="input"
                placeholder="e.g., New Customer Onboarding Journey"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">Subtitle <span class="text-gray-400 font-normal">(optional)</span></label>
              <input
                v-model="formSubtitle"
                class="input"
                placeholder="Brief description of this journey"
              />
            </div>
          </div>

          <!-- Steps Section -->
          <div class="space-y-4">
            <div class="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h4 class="font-semibold text-gray-900">Journey Steps</h4>
                <p class="text-sm text-gray-500">Define each step in the customer journey</p>
              </div>
              <button
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                @click="addStep"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Step
              </button>
            </div>

            <!-- Empty State -->
            <div v-if="formSteps.length === 0" class="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <svg class="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p class="text-gray-500 font-medium">No steps yet</p>
              <p class="text-gray-400 text-sm mt-1">Add steps manually or generate with AI</p>
            </div>

            <!-- Steps List -->
            <div class="space-y-4">
              <div
                v-for="(step, index) in formSteps"
                :key="index"
                class="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
              >
                <!-- Step Header -->
                <div class="flex items-center justify-between px-4 py-3 bg-gray-100 border-b border-gray-200">
                  <div class="flex items-center gap-3">
                    <span class="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold">
                      {{ step.order }}
                    </span>
                    <span class="font-medium text-gray-700">{{ step.title || 'Untitled Step' }}</span>
                  </div>
                  <button
                    class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    @click="removeStep(index)"
                    title="Remove step"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div class="p-4 space-y-4">
                  <!-- Title & Timeline Row -->
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="md:col-span-2">
                      <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Step Title</label>
                      <input
                        v-model="step.title"
                        class="input"
                        placeholder="e.g., Initial Research"
                      />
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Timeline Day</label>
                      <div class="relative">
                        <input
                          v-model.number="step.timelineDay"
                          type="number"
                          min="0"
                          class="input pl-10"
                        />
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">Day</span>
                      </div>
                    </div>
                  </div>

                  <!-- Description & Outcome -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                      <textarea
                        v-model="step.description"
                        class="input resize-none"
                        rows="2"
                        placeholder="What does the customer do at this step?"
                      ></textarea>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Expected Outcome</label>
                      <textarea
                        v-model="step.outcome"
                        class="input resize-none"
                        rows="2"
                        placeholder="What does success look like?"
                      ></textarea>
                    </div>
                  </div>

                  <!-- Experience Sliders -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div>
                      <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                        Current Pain Level
                        <span class="text-red-500 ml-1">(Negative Experience)</span>
                      </label>
                      <div class="flex items-center gap-3">
                        <div class="flex-1 relative">
                          <input
                            v-model.number="step.negativeExperience"
                            type="range"
                            min="1"
                            max="5"
                            class="w-full h-2 bg-gradient-to-r from-red-100 to-red-500 rounded-full appearance-none cursor-pointer slider-red"
                          />
                          <div class="flex justify-between text-xs text-gray-400 mt-1 px-0.5">
                            <span>Low</span>
                            <span>High</span>
                          </div>
                        </div>
                        <div :class="[
                          'flex items-center justify-center w-10 h-10 rounded-lg font-bold text-lg',
                          getExperienceColor(step.negativeExperience, true),
                          step.negativeExperience >= 4 ? 'text-white' : 'text-red-700'
                        ]">
                          {{ step.negativeExperience }}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                        Solution Potential
                        <span class="text-green-600 ml-1">(Positive Experience)</span>
                      </label>
                      <div class="flex items-center gap-3">
                        <div class="flex-1 relative">
                          <input
                            v-model.number="step.positiveExperience"
                            type="range"
                            min="1"
                            max="5"
                            class="w-full h-2 bg-gradient-to-r from-green-100 to-green-500 rounded-full appearance-none cursor-pointer slider-green"
                          />
                          <div class="flex justify-between text-xs text-gray-400 mt-1 px-0.5">
                            <span>Low</span>
                            <span>High</span>
                          </div>
                        </div>
                        <div :class="[
                          'flex items-center justify-center w-10 h-10 rounded-lg font-bold text-lg',
                          getExperienceColor(step.positiveExperience, false),
                          step.positiveExperience >= 4 ? 'text-white' : 'text-green-700'
                        ]">
                          {{ step.positiveExperience }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Pain Point Note -->
                  <div>
                    <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                      Pain Point Note <span class="text-gray-400 font-normal normal-case">(optional)</span>
                    </label>
                    <div class="relative">
                      <svg class="absolute left-3 top-3 w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <input
                        v-model="step.painPointNote"
                        class="input pl-10"
                        placeholder="Why is this step particularly painful for customers?"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Form Actions -->
          <div class="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              class="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors font-medium"
              @click="resetForm"
            >
              Cancel
            </button>
            <button
              class="btn-primary inline-flex items-center gap-2"
              :disabled="journeyMapsStore.saving || !formTitle.trim() || formSteps.length === 0"
              @click="handleSubmit"
            >
              <svg v-if="journeyMapsStore.saving" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {{ journeyMapsStore.saving ? 'Saving...' : editingJourneyMap ? 'Update Journey Map' : 'Create Journey Map' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Journey Map Visualization -->
      <div v-if="(currentJourneyMap || (showCreateForm && formSteps.length > 0)) && chartConfig" class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <!-- Viz Header -->
        <div class="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-semibold text-gray-900 text-lg">
                {{ currentJourneyMap?.title || formTitle || 'Journey Map Preview' }}
              </h3>
              <p v-if="currentJourneyMap?.subtitle || formSubtitle" class="text-sm text-gray-500 mt-0.5">
                {{ currentJourneyMap?.subtitle || formSubtitle }}
              </p>
            </div>
            <!-- Legend -->
            <div class="flex items-center gap-6 text-sm">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-green-500"></div>
                <span class="text-gray-600">New Solution</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-red-500"></div>
                <span class="text-gray-600">Current Pain</span>
              </div>
            </div>
          </div>
        </div>

        <div class="p-6">
          <!-- Step Headers -->
          <div class="relative mb-4 overflow-x-auto pb-2">
            <div class="flex gap-3" :style="{ minWidth: `${chartConfig.steps.length * 160}px` }">
              <div
                v-for="step in chartConfig.steps"
                :key="step.order"
                class="flex-1 min-w-[150px]"
              >
                <button
                  class="w-full text-left bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl p-4 shadow-md transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer group"
                  @click="openStepDetail(step)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold text-sm mb-1 truncate">{{ step.title }}</div>
                      <div class="text-indigo-100 text-xs line-clamp-2">{{ step.description }}</div>
                    </div>
                    <svg class="w-4 h-4 text-indigo-200 group-hover:text-white flex-shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Chart Area -->
          <div class="relative overflow-x-auto rounded-xl">
            <svg
              class="w-full"
              :style="{ minWidth: `${chartConfig.steps.length * 160}px`, height: '280px' }"
              :viewBox="`0 0 ${chartConfig.steps.length * 160} 280`"
              preserveAspectRatio="xMidYMid meet"
            >
              <!-- Background gradient -->
              <defs>
                <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#dcfce7;stop-opacity:0.8" />
                  <stop offset="100%" style="stop-color:#f0fdf4;stop-opacity:0.3" />
                </linearGradient>
                <linearGradient id="redGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#fef2f2;stop-opacity:0.3" />
                  <stop offset="100%" style="stop-color:#fecaca;stop-opacity:0.8" />
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              <!-- Background sections -->
              <rect x="0" y="0" :width="chartConfig.steps.length * 160" height="140" fill="url(#greenGradient)" />
              <rect x="0" y="140" :width="chartConfig.steps.length * 160" height="140" fill="url(#redGradient)" />

              <!-- Grid lines -->
              <g stroke="#e5e7eb" stroke-width="1" stroke-dasharray="4,4" opacity="0.5">
                <line x1="0" y1="35" :x2="chartConfig.steps.length * 160" y2="35" />
                <line x1="0" y1="70" :x2="chartConfig.steps.length * 160" y2="70" />
                <line x1="0" y1="105" :x2="chartConfig.steps.length * 160" y2="105" />
                <line x1="0" y1="175" :x2="chartConfig.steps.length * 160" y2="175" />
                <line x1="0" y1="210" :x2="chartConfig.steps.length * 160" y2="210" />
                <line x1="0" y1="245" :x2="chartConfig.steps.length * 160" y2="245" />
              </g>

              <!-- Center line -->
              <line x1="0" y1="140" :x2="chartConfig.steps.length * 160" y2="140" stroke="#9ca3af" stroke-width="2" />

              <!-- Positive experience area fill -->
              <polygon
                :points="`${80},140 ${chartConfig!.steps.map((s, i) => {
                  const x = 80 + i * 160
                  const y = 120 - ((s.positiveExperience - 1) / 4) * 85
                  return `${x},${y}`
                }).join(' ')} ${80 + (chartConfig!.steps.length - 1) * 160},140`"
                fill="#22c55e"
                opacity="0.1"
              />

              <!-- Positive experience line (green) -->
              <polyline
                :points="chartConfig!.steps.map((s, i) => {
                  const x = 80 + i * 160
                  const y = 120 - ((s.positiveExperience - 1) / 4) * 85
                  return `${x},${y}`
                }).join(' ')"
                fill="none"
                stroke="#22c55e"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Positive experience dots -->
              <g filter="url(#glow)">
                <circle
                  v-for="(step, i) in chartConfig.steps"
                  :key="`pos-${i}`"
                  :cx="80 + i * 160"
                  :cy="120 - ((step.positiveExperience - 1) / 4) * 85"
                  r="8"
                  fill="#22c55e"
                  stroke="white"
                  stroke-width="3"
                />
              </g>

              <!-- Negative experience area fill -->
              <polygon
                :points="`${80},140 ${chartConfig!.steps.map((s, i) => {
                  const x = 80 + i * 160
                  const y = 160 + ((s.negativeExperience - 1) / 4) * 85
                  return `${x},${y}`
                }).join(' ')} ${80 + (chartConfig!.steps.length - 1) * 160},140`"
                fill="#ef4444"
                opacity="0.1"
              />

              <!-- Negative experience line (red) -->
              <polyline
                :points="chartConfig!.steps.map((s, i) => {
                  const x = 80 + i * 160
                  const y = 160 + ((s.negativeExperience - 1) / 4) * 85
                  return `${x},${y}`
                }).join(' ')"
                fill="none"
                stroke="#ef4444"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Negative experience dots -->
              <g filter="url(#glow)">
                <circle
                  v-for="(step, i) in chartConfig.steps"
                  :key="`neg-${i}`"
                  :cx="80 + i * 160"
                  :cy="160 + ((step.negativeExperience - 1) / 4) * 85"
                  r="8"
                  fill="#ef4444"
                  stroke="white"
                  stroke-width="3"
                />
              </g>

              <!-- Timeline labels -->
              <g v-for="(step, i) in chartConfig.steps" :key="`timeline-${i}`">
                <rect
                  :x="80 + i * 160 - 25"
                  y="130"
                  width="50"
                  height="20"
                  rx="10"
                  fill="white"
                  stroke="#d1d5db"
                  stroke-width="1"
                />
                <text
                  :x="80 + i * 160"
                  y="144"
                  text-anchor="middle"
                  class="fill-gray-600 font-medium"
                  font-size="11"
                >
                  Day {{ step.timelineDay }}
                </text>
              </g>
            </svg>
          </div>

          <!-- Pain Point Notes -->
          <div v-if="chartConfig.steps.some(s => s.painPointNote)" class="mt-6 space-y-3">
            <h4 class="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Pain Points Identified
            </h4>
            <div class="grid gap-3">
              <div
                v-for="step in chartConfig.steps.filter(s => s.painPointNote)"
                :key="`note-${step.order}`"
                class="flex items-start gap-3 bg-red-50 rounded-lg p-4 border border-red-100"
              >
                <span class="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                  {{ step.order }}
                </span>
                <div>
                  <span class="font-semibold text-red-800">{{ step.title }}</span>
                  <p class="text-red-700 text-sm mt-0.5">{{ step.painPointNote }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <div v-if="!selectedIdeaId && ideasWithJobs.length === 0" class="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      </div>
      <h3 class="font-semibold text-gray-900 mb-2">No Ideas with Jobs to be Done</h3>
      <p class="text-gray-500 text-sm max-w-sm mx-auto">
        Create an idea in the Idea Hopper with a complete Job to be Done to start mapping customer journeys.
      </p>
    </div>

    <!-- Step Detail Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="expandedStep"
          class="fixed inset-0 z-50 overflow-y-auto"
          @click.self="closeStepDetail"
        >
          <div class="flex min-h-full items-center justify-center p-4">
            <!-- Backdrop -->
            <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="closeStepDetail"></div>

            <!-- Modal Content -->
            <div class="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transform transition-all">
              <!-- Header -->
              <div class="bg-gradient-to-br from-indigo-500 to-indigo-600 px-6 py-5">
                <div class="flex items-start justify-between">
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-white text-sm font-bold">
                        {{ expandedStep.order }}
                      </span>
                      <span class="text-indigo-100 text-sm">Step {{ expandedStep.order }}</span>
                    </div>
                    <h3 class="text-xl font-semibold text-white">{{ expandedStep.title }}</h3>
                  </div>
                  <button
                    class="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                    @click="closeStepDetail"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Body -->
              <div class="px-6 py-5 space-y-5">
                <!-- Timeline -->
                <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-700">
                  <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Day {{ expandedStep.timelineDay }}
                </div>

                <!-- Description -->
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</h4>
                  <p class="text-gray-700 leading-relaxed">{{ expandedStep.description }}</p>
                </div>

                <!-- Outcome -->
                <div>
                  <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Expected Outcome</h4>
                  <p class="text-gray-700 leading-relaxed">{{ expandedStep.outcome }}</p>
                </div>

                <!-- Experience Levels -->
                <div class="grid grid-cols-2 gap-4">
                  <div class="bg-red-50 rounded-xl p-4 border border-red-100">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-semibold text-red-700 uppercase tracking-wide">Pain Level</span>
                      <span class="text-2xl font-bold text-red-600">{{ expandedStep.negativeExperience }}</span>
                    </div>
                    <div class="flex gap-1">
                      <div
                        v-for="i in 5"
                        :key="`neg-${i}`"
                        :class="[
                          'h-2 flex-1 rounded-full',
                          i <= expandedStep.negativeExperience ? 'bg-red-500' : 'bg-red-200'
                        ]"
                      ></div>
                    </div>
                  </div>
                  <div class="bg-green-50 rounded-xl p-4 border border-green-100">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-semibold text-green-700 uppercase tracking-wide">Solution Potential</span>
                      <span class="text-2xl font-bold text-green-600">{{ expandedStep.positiveExperience }}</span>
                    </div>
                    <div class="flex gap-1">
                      <div
                        v-for="i in 5"
                        :key="`pos-${i}`"
                        :class="[
                          'h-2 flex-1 rounded-full',
                          i <= expandedStep.positiveExperience ? 'bg-green-500' : 'bg-green-200'
                        ]"
                      ></div>
                    </div>
                  </div>
                </div>

                <!-- Pain Point Note -->
                <div v-if="expandedStep.painPointNote" class="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <div class="flex items-start gap-3">
                    <svg class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <h4 class="text-sm font-semibold text-amber-800 mb-1">Pain Point</h4>
                      <p class="text-amber-700 text-sm leading-relaxed">{{ expandedStep.painPointNote }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <div class="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <button
                  class="w-full px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors"
                  @click="closeStepDetail"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.badge-blue {
  @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800;
}

.badge-purple {
  @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800;
}

.badge-pink {
  @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-100 text-pink-800;
}

.badge-gray {
  @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800;
}

.slider-red::-webkit-slider-thumb {
  @apply appearance-none w-5 h-5 rounded-full bg-red-500 cursor-pointer shadow-lg border-2 border-white;
}

.slider-red::-moz-range-thumb {
  @apply w-5 h-5 rounded-full bg-red-500 cursor-pointer shadow-lg border-2 border-white;
}

.slider-green::-webkit-slider-thumb {
  @apply appearance-none w-5 h-5 rounded-full bg-green-500 cursor-pointer shadow-lg border-2 border-white;
}

.slider-green::-moz-range-thumb {
  @apply w-5 h-5 rounded-full bg-green-500 cursor-pointer shadow-lg border-2 border-white;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
