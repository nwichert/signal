<script setup lang="ts">
import type { SectionConfig } from '@/views/StrategicContextView.vue'

defineProps<{
  section: SectionConfig
  isExpanded: boolean
  isEditing: boolean
  editContent: string
  content: string
  canEdit: boolean
  isEnriching: boolean
  isSaving: boolean
  variant?: 'default' | 'prominent'
}>()

const emit = defineEmits<{
  toggle: []
  startEdit: []
  save: []
  cancel: []
  enrich: []
  'update:editContent': [value: string]
}>()

function handleContentChange(event: Event) {
  emit('update:editContent', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div
    :class="[
      'card overflow-hidden',
      variant === 'prominent' ? 'border-purple-200 bg-gradient-to-br from-white to-purple-50/30' : ''
    ]"
  >
    <!-- Section header -->
    <button
      :class="[
        'w-full px-4 py-3 flex items-center justify-between transition-colors',
        variant === 'prominent'
          ? 'hover:bg-purple-50/50'
          : 'bg-gray-50 border-b border-gray-200 hover:bg-gray-100'
      ]"
      @click="emit('toggle')"
    >
      <div class="flex items-center gap-3">
        <div
          :class="[
            'p-2 rounded-lg',
            variant === 'prominent' ? 'bg-purple-100' : 'bg-white border border-gray-200'
          ]"
        >
          <svg
            :class="[
              'w-5 h-5',
              variant === 'prominent' ? 'text-purple-600' : 'text-gray-600'
            ]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="section.icon" />
          </svg>
        </div>
        <div class="text-left">
          <h3 class="font-medium text-gray-900">{{ section.title }}</h3>
          <p class="text-xs text-gray-500">{{ section.description }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Content indicator -->
        <span
          v-if="content"
          class="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1"
        >
          <span class="w-1.5 h-1.5 bg-green-500 rounded-full" />
          Has content
        </span>
        <span
          v-else
          class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"
        >
          Empty
        </span>
        <!-- Chevron -->
        <svg
          :class="['w-5 h-5 text-gray-400 transition-transform', isExpanded ? 'rotate-180' : '']"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <!-- Section content -->
    <Transition name="expand">
      <div
        v-if="isExpanded"
        :class="[
          'p-4',
          variant === 'prominent' ? 'bg-white border-t border-purple-100' : ''
        ]"
      >
        <!-- Action buttons -->
        <div v-if="canEdit && !isEditing" class="flex gap-2 mb-3 justify-end">
          <button
            class="btn-ghost text-sm flex items-center gap-1"
            :disabled="isEnriching"
            @click.stop="emit('enrich')"
          >
            <svg
              :class="['w-4 h-4', isEnriching ? 'animate-spin' : '']"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                v-if="isEnriching"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
              <path
                v-else
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            {{ isEnriching ? 'Enriching...' : 'Enrich with AI' }}
          </button>
          <button
            class="btn-ghost text-sm"
            @click.stop="emit('startEdit')"
          >
            Edit
          </button>
        </div>

        <!-- Editing mode -->
        <div v-if="isEditing" class="space-y-3">
          <textarea
            :value="editContent"
            class="input min-h-[200px] font-mono text-sm"
            placeholder="Enter content for this section..."
            @input="handleContentChange"
          />
          <div class="flex items-center justify-between">
            <button
              class="btn-ghost text-sm flex items-center gap-1"
              :disabled="isEnriching"
              @click="emit('enrich')"
            >
              <svg
                :class="['w-4 h-4', isEnriching ? 'animate-spin' : '']"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
              {{ isEnriching ? 'Generating...' : 'Generate with AI' }}
            </button>
            <div class="flex gap-2">
              <button class="btn-ghost" @click="emit('cancel')">Cancel</button>
              <button
                class="btn-primary"
                :disabled="isSaving"
                @click="emit('save')"
              >
                {{ isSaving ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Display mode -->
        <div v-else>
          <div
            v-if="content"
            class="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed"
          >
            {{ content }}
          </div>
          <p v-else class="text-sm text-gray-400 italic">
            No content yet. Click "Enrich with AI" to generate or "Edit" to add manually.
          </p>
        </div>
      </div>
    </Transition>
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
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 1000px;
}
</style>
