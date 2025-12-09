import { ref, readonly, computed } from 'vue'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { TranscriptSourceType } from '@/types'

// Recording state - singleton pattern for persistence across navigation
interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  isTranscribing: boolean
  duration: number
  audioBlob: Blob | null
  error: string | null
  // Context for where the recording started
  sourceType: TranscriptSourceType | null
  sourceId: string | null
  sourceName: string | null
}

const state = ref<RecordingState>({
  isRecording: false,
  isPaused: false,
  isTranscribing: false,
  duration: 0,
  audioBlob: null,
  error: null,
  sourceType: null,
  sourceId: null,
  sourceName: null,
})

// MediaRecorder instance - persists across navigation
let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let durationInterval: ReturnType<typeof setInterval> | null = null
let audioStream: MediaStream | null = null

// Transcription result
const transcriptionResult = ref<{
  text: string
  segments: Array<{ start: number; end: number; text: string }>
  language: string
  duration: number
} | null>(null)

export function useAudioRecorder() {
  const functions = getFunctions()

  // Check if browser supports audio recording
  const isSupported = computed(() => {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && typeof window.MediaRecorder !== 'undefined')
  })

  // Start recording
  async function startRecording(options: {
    sourceType: TranscriptSourceType
    sourceId?: string
    sourceName?: string
  }) {
    if (state.value.isRecording) {
      console.warn('Already recording')
      return
    }

    state.value.error = null
    state.value.audioBlob = null
    transcriptionResult.value = null
    audioChunks = []

    try {
      // Request microphone access - capture system audio if available
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      }

      audioStream = await navigator.mediaDevices.getUserMedia(constraints)

      // Determine the best supported format
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav',
      ]

      let selectedMimeType = 'audio/webm'
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType
          break
        }
      }

      mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: selectedMimeType,
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder?.mimeType || 'audio/webm'
        state.value.audioBlob = new Blob(audioChunks, { type: mimeType })
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        state.value.error = 'Recording error occurred'
        stopRecording()
      }

      // Start recording with timeslice of 1 second for progressive chunks
      mediaRecorder.start(1000)

      // Store context
      state.value.sourceType = options.sourceType
      state.value.sourceId = options.sourceId || null
      state.value.sourceName = options.sourceName || null
      state.value.isRecording = true
      state.value.isPaused = false
      state.value.duration = 0

      // Start duration counter
      durationInterval = setInterval(() => {
        if (!state.value.isPaused) {
          state.value.duration++
        }
      }, 1000)

    } catch (error) {
      console.error('Failed to start recording:', error)
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          state.value.error = 'Microphone access denied. Please allow microphone access and try again.'
        } else if (error.name === 'NotFoundError') {
          state.value.error = 'No microphone found. Please connect a microphone and try again.'
        } else {
          state.value.error = `Failed to start recording: ${error.message}`
        }
      }
    }
  }

  // Pause recording
  function pauseRecording() {
    if (mediaRecorder && state.value.isRecording && !state.value.isPaused) {
      mediaRecorder.pause()
      state.value.isPaused = true
    }
  }

  // Resume recording
  function resumeRecording() {
    if (mediaRecorder && state.value.isRecording && state.value.isPaused) {
      mediaRecorder.resume()
      state.value.isPaused = false
    }
  }

  // Stop recording
  function stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (durationInterval) {
        clearInterval(durationInterval)
        durationInterval = null
      }

      if (!mediaRecorder || !state.value.isRecording) {
        resolve(null)
        return
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder?.mimeType || 'audio/webm'
        state.value.audioBlob = new Blob(audioChunks, { type: mimeType })
        state.value.isRecording = false
        state.value.isPaused = false

        // Stop all tracks
        if (audioStream) {
          audioStream.getTracks().forEach(track => track.stop())
          audioStream = null
        }

        resolve(state.value.audioBlob)
      }

      mediaRecorder.stop()
    })
  }

  // Cancel recording without saving
  function cancelRecording() {
    if (durationInterval) {
      clearInterval(durationInterval)
      durationInterval = null
    }

    if (mediaRecorder && state.value.isRecording) {
      mediaRecorder.stop()
    }

    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop())
      audioStream = null
    }

    state.value.isRecording = false
    state.value.isPaused = false
    state.value.duration = 0
    state.value.audioBlob = null
    state.value.sourceType = null
    state.value.sourceId = null
    state.value.sourceName = null
    audioChunks = []
  }

  // Transcribe the recorded audio
  async function transcribeAudio(audioBlob?: Blob): Promise<{
    text: string
    segments: Array<{ start: number; end: number; text: string }>
    language: string
    duration: number
  } | null> {
    const blob = audioBlob || state.value.audioBlob

    if (!blob) {
      state.value.error = 'No audio to transcribe'
      return null
    }

    state.value.isTranscribing = true
    state.value.error = null

    try {
      // Convert blob to base64
      const base64 = await blobToBase64(blob)

      // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
      const base64Data = base64.split(',')[1]

      // Call the Cloud Function
      const transcribeFn = httpsCallable(functions, 'transcribeAudio')
      const result = await transcribeFn({
        audioBase64: base64Data,
        mimeType: blob.type,
      })

      const data = result.data as {
        text: string
        segments: Array<{ start: number; end: number; text: string }>
        language: string
        duration: number
      }

      transcriptionResult.value = data
      return data
    } catch (error) {
      console.error('Transcription error:', error)
      if (error instanceof Error) {
        state.value.error = `Transcription failed: ${error.message}`
      }
      return null
    } finally {
      state.value.isTranscribing = false
    }
  }

  // Helper: Convert Blob to base64
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  // Format duration as MM:SS
  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Reset the state completely
  function reset() {
    cancelRecording()
    transcriptionResult.value = null
    state.value.error = null
  }

  return {
    // State
    isRecording: computed(() => state.value.isRecording),
    isPaused: computed(() => state.value.isPaused),
    isTranscribing: computed(() => state.value.isTranscribing),
    duration: computed(() => state.value.duration),
    formattedDuration: computed(() => formatDuration(state.value.duration)),
    audioBlob: computed(() => state.value.audioBlob),
    error: computed(() => state.value.error),
    sourceType: computed(() => state.value.sourceType),
    sourceId: computed(() => state.value.sourceId),
    sourceName: computed(() => state.value.sourceName),
    transcriptionResult: readonly(transcriptionResult),
    isSupported,

    // Actions
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    transcribeAudio,
    formatDuration,
    reset,
  }
}
