<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { useAudioRecorder } from '@/composables/useAudioRecorder'
import { useDocumentsStore } from '@/stores/documents'
import { useIdeasStore } from '@/stores/ideas'
import { useJourneyMapsStore } from '@/stores/journeyMaps'
import type { TranscriptSourceType, JourneyStep, JobToBeDone } from '@/types'

const props = defineProps<{
  mode: 'interview' | 'journey-map'
  sourceId?: string
  sourceName?: string
  archetypeId?: string  // For interview mode - link transcript to archetype
}>()

const emit = defineEmits<{
  transcribed: [result: { text: string; documentId?: string }]
  cancelled: []
  journeyMapCreated: [journeyMapId: string]
}>()

const recorder = useAudioRecorder()
const documentsStore = useDocumentsStore()
const ideasStore = useIdeasStore()
const journeyMapsStore = useJourneyMapsStore()
const functions = getFunctions()

const showDialog = ref(false)
const transcriptText = ref('')
const isSaving = ref(false)
const saveError = ref<string | null>(null)

// Journey map detection state
const showJourneyMapModal = ref(false)
const isAnalyzingForJourneyMap = ref(false)
const journeyMapAnalysis = ref<{
  detected: boolean
  confidence?: 'high' | 'medium' | 'low'
  journeyTitle?: string
  journeySubtitle?: string
  suggestedIdeaId?: string | null
  suggestedNewIdea?: {
    title: string
    description: string
    job: JobToBeDone
  } | null
  steps?: Array<Omit<JourneyStep, 'id'>>
  summary?: string
  reason?: string
} | null>(null)
const selectedIdeaId = ref<string | null>(null)
const isCreatingJourneyMap = ref(false)
const journeyMapError = ref<string | null>(null)

// Map mode to source type
const sourceType = computed<TranscriptSourceType>(() => {
  return props.mode === 'interview' ? 'interview' : 'journey-map'
})

// Check if we're currently recording for this source
const isRecordingForThis = computed(() => {
  return recorder.isRecording.value &&
         recorder.sourceType.value === sourceType.value &&
         recorder.sourceId.value === props.sourceId
})

// Subscribe to stores on mount
onMounted(() => {
  ideasStore.subscribe()
  journeyMapsStore.subscribe()
})

onUnmounted(() => {
  ideasStore.unsubscribe()
  journeyMapsStore.unsubscribe()
})

// Start recording
async function startRecording() {
  await recorder.startRecording({
    sourceType: sourceType.value,
    sourceId: props.sourceId,
    sourceName: props.sourceName,
  })
}

// Stop and transcribe
async function stopAndTranscribe() {
  const blob = await recorder.stopRecording()
  if (!blob) return

  showDialog.value = true

  const result = await recorder.transcribeAudio(blob)
  if (result) {
    transcriptText.value = result.text
  }
}

// Analyze transcript for journey maps (only for interview mode)
async function analyzeForJourneyMap() {
  if (!transcriptText.value.trim() || props.mode !== 'interview') return

  isAnalyzingForJourneyMap.value = true
  journeyMapError.value = null

  try {
    const analyzeTranscriptFn = httpsCallable(functions, 'analyzeTranscriptForJourneyMap')

    // Pass available ideas to the function
    const availableIdeas = ideasStore.ideas.map(idea => ({
      id: idea.id,
      title: idea.title,
      job: idea.job,
    }))

    const result = await analyzeTranscriptFn({
      transcript: transcriptText.value,
      availableIdeas,
    })

    journeyMapAnalysis.value = result.data as typeof journeyMapAnalysis.value

    if (journeyMapAnalysis.value?.detected) {
      // Pre-select the suggested idea if available
      if (journeyMapAnalysis.value.suggestedIdeaId) {
        selectedIdeaId.value = journeyMapAnalysis.value.suggestedIdeaId
      }
      showJourneyMapModal.value = true
    }
  } catch (error) {
    console.error('Failed to analyze transcript for journey map:', error)
    // Don't show error to user - this is an optional feature
  } finally {
    isAnalyzingForJourneyMap.value = false
  }
}

// Save transcript to Knowledge Center
async function saveTranscript() {
  if (!transcriptText.value.trim()) return

  isSaving.value = true
  saveError.value = null

  try {
    // Create a text file from the transcript
    const fileName = `transcript_${props.sourceName?.replace(/\s+/g, '_') || sourceType.value}_${Date.now()}.txt`
    const file = new File([transcriptText.value], fileName, { type: 'text/plain' })

    // Build document data
    const documentData: Parameters<typeof documentsStore.uploadDocument>[1] = {
      name: `Transcript: ${props.sourceName || 'Recording'}`,
      description: `Audio transcript from ${props.mode === 'interview' ? 'customer interview' : 'journey mapping session'}. Duration: ${recorder.formattedDuration.value}`,
      documentType: 'knowledge',
      category: 'transcript',
      tags: [sourceType.value, 'audio', 'transcript'],
      priority: 2,
    }

    // Add archetype link if in interview mode
    if (props.archetypeId) {
      documentData.tags.push(`archetype:${props.archetypeId}`)
    }

    await documentsStore.uploadDocument(file, documentData)

    // Emit success
    emit('transcribed', {
      text: transcriptText.value,
      documentId: undefined,
    })

    // For interview mode, analyze for journey maps after saving
    if (props.mode === 'interview') {
      await analyzeForJourneyMap()
    }

    // Close dialog if no journey map modal to show
    if (!showJourneyMapModal.value) {
      showDialog.value = false
      transcriptText.value = ''
      recorder.reset()
    }
  } catch (error) {
    console.error('Failed to save transcript:', error)
    saveError.value = error instanceof Error ? error.message : 'Failed to save transcript'
  } finally {
    isSaving.value = false
  }
}

// Use transcript without saving
async function useWithoutSaving() {
  emit('transcribed', {
    text: transcriptText.value,
  })

  // For interview mode, analyze for journey maps
  if (props.mode === 'interview') {
    await analyzeForJourneyMap()
  }

  // Close dialog if no journey map modal to show
  if (!showJourneyMapModal.value) {
    showDialog.value = false
    transcriptText.value = ''
    recorder.reset()
  }
}

// Create journey map from analysis
async function createJourneyMap() {
  if (!journeyMapAnalysis.value?.detected || !journeyMapAnalysis.value.steps) return

  isCreatingJourneyMap.value = true
  journeyMapError.value = null

  try {
    let ideaIdToUse = selectedIdeaId.value

    // If no idea selected but we have a suggested new idea, create it first
    if (!ideaIdToUse && journeyMapAnalysis.value.suggestedNewIdea) {
      const newIdea = journeyMapAnalysis.value.suggestedNewIdea
      await ideasStore.addIdea({
        title: newIdea.title,
        description: newIdea.description,
        job: newIdea.job,
      })

      // Wait for the store to update and get the new idea
      await new Promise(resolve => setTimeout(resolve, 500))
      const createdIdea = ideasStore.ideas.find(i => i.title === newIdea.title)
      if (createdIdea) {
        ideaIdToUse = createdIdea.id
      }
    }

    if (!ideaIdToUse) {
      journeyMapError.value = 'Please select an idea to associate with this journey map'
      return
    }

    // Create the journey map
    await journeyMapsStore.addJourneyMap({
      title: journeyMapAnalysis.value.journeyTitle || 'Customer Journey',
      subtitle: journeyMapAnalysis.value.journeySubtitle,
      ideaId: ideaIdToUse,
      steps: journeyMapAnalysis.value.steps,
    })

    // Find the created journey map
    await new Promise(resolve => setTimeout(resolve, 500))
    const createdMap = journeyMapsStore.journeyMaps.find(
      jm => jm.title === journeyMapAnalysis.value?.journeyTitle
    )

    if (createdMap) {
      emit('journeyMapCreated', createdMap.id)
    }

    // Close both modals
    showJourneyMapModal.value = false
    showDialog.value = false
    transcriptText.value = ''
    journeyMapAnalysis.value = null
    recorder.reset()
  } catch (error) {
    console.error('Failed to create journey map:', error)
    journeyMapError.value = error instanceof Error ? error.message : 'Failed to create journey map'
  } finally {
    isCreatingJourneyMap.value = false
  }
}

// Skip journey map creation
function skipJourneyMap() {
  showJourneyMapModal.value = false
  showDialog.value = false
  transcriptText.value = ''
  journeyMapAnalysis.value = null
  recorder.reset()
}

// Cancel and close dialog
function closeDialog() {
  showDialog.value = false
  showJourneyMapModal.value = false
  transcriptText.value = ''
  journeyMapAnalysis.value = null
  recorder.reset()
  emit('cancelled')
}

// Watch for recording completion from the global indicator
watch(() => recorder.isRecording.value, (isRecording, wasRecording) => {
  if (wasRecording && !isRecording && recorder.audioBlob.value) {
    // Recording stopped, show dialog if we were recording for this source
    if (recorder.sourceType.value === sourceType.value &&
        recorder.sourceId.value === props.sourceId) {
      showDialog.value = true
      transcribeRecording()
    }
  }
})

async function transcribeRecording() {
  if (!recorder.audioBlob.value) return

  const result = await recorder.transcribeAudio()
  if (result) {
    transcriptText.value = result.text
  }
}

// Get confidence badge class
function getConfidenceBadgeClass(confidence: string) {
  switch (confidence) {
    case 'high': return 'bg-green-100 text-green-700'
    case 'medium': return 'bg-yellow-100 text-yellow-700'
    case 'low': return 'bg-orange-100 text-orange-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}
</script>

<template>
  <div class="audio-transcriber">
    <!-- Start Recording Button -->
    <slot name="trigger" :start="startRecording" :isRecording="isRecordingForThis">
      <button
        v-if="!isRecordingForThis"
        class="btn-secondary inline-flex items-center gap-2"
        :disabled="!recorder.isSupported.value"
        @click="startRecording"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        {{ mode === 'interview' ? 'Take Notes with AI' : 'Listen & Enrich with AI' }}
      </button>
      <button
        v-else
        class="btn-primary inline-flex items-center gap-2 bg-red-600 hover:bg-red-700"
        @click="stopAndTranscribe"
      >
        <div class="relative flex items-center justify-center">
          <div class="absolute w-3 h-3 bg-white rounded-full animate-ping opacity-75" />
          <div class="relative w-2 h-2 bg-white rounded-full" />
        </div>
        Stop Recording ({{ recorder.formattedDuration.value }})
      </button>
    </slot>

    <!-- Not Supported Warning -->
    <p v-if="!recorder.isSupported.value" class="text-xs text-amber-600 mt-1">
      Audio recording is not supported in your browser
    </p>

    <!-- Error Display -->
    <p v-if="recorder.error.value" class="text-xs text-red-600 mt-1">
      {{ recorder.error.value }}
    </p>

    <!-- Transcript Dialog -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showDialog"
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          @click.self="closeDialog"
        >
          <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">
                  {{ recorder.isTranscribing.value ? 'Transcribing...' : 'Review Transcript' }}
                </h3>
                <p class="text-sm text-gray-500">
                  {{ props.sourceName || 'Recording' }} &bull; {{ recorder.formattedDuration.value }}
                </p>
              </div>
              <button
                class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                @click="closeDialog"
              >
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-6">
              <!-- Loading state -->
              <div v-if="recorder.isTranscribing.value" class="flex flex-col items-center justify-center py-12">
                <div class="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                <p class="mt-4 text-gray-600">Processing audio with Whisper AI...</p>
                <p class="text-sm text-gray-400 mt-1">This may take a moment</p>
              </div>

              <!-- Analyzing for journey map -->
              <div v-else-if="isAnalyzingForJourneyMap" class="flex flex-col items-center justify-center py-12">
                <div class="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p class="mt-4 text-gray-600">Analyzing transcript for journey insights...</p>
                <p class="text-sm text-gray-400 mt-1">Looking for customer journeys described in the interview</p>
              </div>

              <!-- Transcript -->
              <div v-else>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Transcript
                </label>
                <textarea
                  v-model="transcriptText"
                  class="input min-h-[200px] w-full"
                  placeholder="Transcript will appear here..."
                />
                <p class="text-xs text-gray-400 mt-2">
                  You can edit the transcript before saving or using it
                </p>

                <!-- Error -->
                <div v-if="recorder.error.value || saveError" class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p class="text-sm text-red-600">{{ recorder.error.value || saveError }}</p>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                class="btn-ghost"
                @click="closeDialog"
              >
                Cancel
              </button>
              <div class="flex items-center gap-3">
                <button
                  v-if="!recorder.isTranscribing.value && !isAnalyzingForJourneyMap && transcriptText"
                  class="btn-secondary"
                  @click="useWithoutSaving"
                >
                  Use without saving
                </button>
                <button
                  v-if="!recorder.isTranscribing.value && !isAnalyzingForJourneyMap && transcriptText"
                  class="btn-primary inline-flex items-center gap-2"
                  :disabled="isSaving"
                  @click="saveTranscript"
                >
                  <svg v-if="!isSaving" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  <span v-if="isSaving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {{ isSaving ? 'Saving...' : 'Save to Knowledge Center' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Journey Map Detection Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showJourneyMapModal && journeyMapAnalysis?.detected"
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          @click.self="skipJourneyMap"
        >
          <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-200">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-indigo-100 rounded-lg">
                  <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-gray-900">Journey Map Detected</h3>
                  <p class="text-sm text-gray-500">
                    We identified a customer journey in your interview
                  </p>
                </div>
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
              <!-- Confidence & Summary -->
              <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-2">
                  <span
                    :class="['px-2 py-0.5 text-xs font-medium rounded-full', getConfidenceBadgeClass(journeyMapAnalysis.confidence || 'medium')]"
                  >
                    {{ journeyMapAnalysis.confidence }} confidence
                  </span>
                </div>
                <p class="text-sm text-gray-700">{{ journeyMapAnalysis.summary }}</p>
              </div>

              <!-- Journey Details -->
              <div>
                <h4 class="font-medium text-gray-900 mb-2">{{ journeyMapAnalysis.journeyTitle }}</h4>
                <p v-if="journeyMapAnalysis.journeySubtitle" class="text-sm text-gray-600">
                  {{ journeyMapAnalysis.journeySubtitle }}
                </p>
              </div>

              <!-- Steps Preview -->
              <div>
                <h4 class="text-sm font-medium text-gray-700 mb-3">
                  Journey Steps ({{ journeyMapAnalysis.steps?.length || 0 }})
                </h4>
                <div class="space-y-2">
                  <div
                    v-for="(step, index) in journeyMapAnalysis.steps?.slice(0, 4)"
                    :key="index"
                    class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <span class="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-medium">
                      {{ index + 1 }}
                    </span>
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-gray-900">{{ step.title }}</p>
                      <p class="text-xs text-gray-500 truncate">{{ step.description }}</p>
                    </div>
                  </div>
                  <p
                    v-if="(journeyMapAnalysis.steps?.length || 0) > 4"
                    class="text-xs text-gray-400 text-center"
                  >
                    + {{ (journeyMapAnalysis.steps?.length || 0) - 4 }} more steps
                  </p>
                </div>
              </div>

              <!-- Idea Selection -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Link to Idea
                </label>
                <select v-model="selectedIdeaId" class="input w-full">
                  <option :value="null">
                    {{ journeyMapAnalysis.suggestedNewIdea ? 'Create new idea (recommended)' : 'Select an idea...' }}
                  </option>
                  <option
                    v-for="idea in ideasStore.ideas"
                    :key="idea.id"
                    :value="idea.id"
                  >
                    {{ idea.title }}
                  </option>
                </select>
                <p v-if="journeyMapAnalysis.suggestedNewIdea && !selectedIdeaId" class="text-xs text-indigo-600 mt-1">
                  Will create: "{{ journeyMapAnalysis.suggestedNewIdea.title }}"
                </p>
                <p v-else-if="journeyMapAnalysis.suggestedIdeaId && selectedIdeaId === journeyMapAnalysis.suggestedIdeaId" class="text-xs text-green-600 mt-1">
                  AI recommended this idea based on the transcript
                </p>
              </div>

              <!-- Error -->
              <div v-if="journeyMapError" class="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p class="text-sm text-red-600">{{ journeyMapError }}</p>
              </div>
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                class="btn-ghost"
                @click="skipJourneyMap"
              >
                Skip
              </button>
              <button
                class="btn-primary inline-flex items-center gap-2"
                :disabled="isCreatingJourneyMap"
                @click="createJourneyMap"
              >
                <svg v-if="!isCreatingJourneyMap" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span v-if="isCreatingJourneyMap" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {{ isCreatingJourneyMap ? 'Creating...' : 'Create Journey Map' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
