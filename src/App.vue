<script setup lang="ts">
import { RouterView } from 'vue-router'
import AudioRecordingIndicator from '@/components/AudioRecordingIndicator.vue'
</script>

<template>
  <RouterView />
  <!-- Global audio recording indicator - shows when recording anywhere in the app -->
  <AudioRecordingIndicator />
</template>
