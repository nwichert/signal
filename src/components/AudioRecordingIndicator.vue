<script setup lang="ts">
import { useAudioRecorder } from '@/composables/useAudioRecorder'
import { useRouter } from 'vue-router'

const emit = defineEmits<{
  stop: [blob: Blob]
  cancel: []
}>()

const router = useRouter()
const recorder = useAudioRecorder()

async function handleStop() {
  const blob = await recorder.stopRecording()
  if (blob) {
    emit('stop', blob)
  }
}

function handleCancel() {
  recorder.cancelRecording()
  emit('cancel')
}

// Navigate to source page
function goToSource() {
  if (recorder.sourceType.value === 'interview' && recorder.sourceId.value) {
    router.push(`/customer-archetypes?archetype=${recorder.sourceId.value}&tab=interviews`)
  } else if (recorder.sourceType.value === 'journey-map' && recorder.sourceId.value) {
    router.push(`/journey-maps?id=${recorder.sourceId.value}`)
  }
}
</script>

<template>
  <!-- Floating recording indicator - shows when recording is active anywhere in the app -->
  <Teleport to="body">
    <Transition name="slide-up">
      <div
        v-if="recorder.isRecording.value"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      >
        <div class="bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4">
          <!-- Recording pulse -->
          <div class="relative flex items-center justify-center">
            <div class="absolute w-4 h-4 bg-red-500 rounded-full animate-ping opacity-75" />
            <div class="relative w-3 h-3 bg-red-500 rounded-full" />
          </div>

          <!-- Recording info -->
          <div class="flex flex-col">
            <span class="text-sm font-medium">
              {{ recorder.isPaused.value ? 'Paused' : 'Recording' }}
            </span>
            <span class="text-xs text-gray-400">
              {{ recorder.sourceName.value || 'Audio' }} &bull; {{ recorder.formattedDuration.value }}
            </span>
          </div>

          <!-- Controls -->
          <div class="flex items-center gap-2 ml-4">
            <!-- Pause/Resume -->
            <button
              class="p-2 rounded-lg hover:bg-gray-800 transition-colors"
              :title="recorder.isPaused.value ? 'Resume' : 'Pause'"
              @click="recorder.isPaused.value ? recorder.resumeRecording() : recorder.pauseRecording()"
            >
              <svg v-if="recorder.isPaused.value" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </button>

            <!-- Stop -->
            <button
              class="p-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors"
              title="Stop recording"
              @click="handleStop"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>

            <!-- Cancel -->
            <button
              class="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
              title="Cancel recording"
              @click="handleCancel"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Go to source -->
          <button
            v-if="recorder.sourceType.value && recorder.sourceId.value"
            class="ml-2 text-xs text-blue-400 hover:text-blue-300 underline"
            @click="goToSource"
          >
            View source
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
