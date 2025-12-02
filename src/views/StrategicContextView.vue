<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useStrategicContextStore } from '@/stores/strategicContext'
import { useVisionStore } from '@/stores/vision'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { StrategicContextSection } from '@/types'

const authStore = useAuthStore()
const contextStore = useStrategicContextStore()
const visionStore = useVisionStore()
const functions = getFunctions()

const editingSection = ref<StrategicContextSection | null>(null)
const editContent = ref('')
const showCompanyContext = ref(false)
const companyContextEdit = ref('')

// Collapsible sections state - start with all collapsed
const expandedSections = ref<Set<StrategicContextSection>>(new Set())

// AI Company Context enrichment
const enrichingCompanyContext = ref(false)
const companyContextError = ref<string | null>(null)

// Computed: derived company context from Vision & Principles
const derivedCompanyContext = computed(() => {
  if (!visionStore.vision) return ''

  const parts: string[] = []

  if (visionStore.vision.companyUrl) {
    parts.push(`Website: ${visionStore.vision.companyUrl}`)
  }

  if (visionStore.vision.coreBusinessModel) {
    parts.push(`Business Model: ${visionStore.vision.coreBusinessModel}`)
  }

  if (visionStore.vision.mission) {
    parts.push(`Mission: ${visionStore.vision.mission}`)
  }

  if (visionStore.vision.vision) {
    parts.push(`Vision: ${visionStore.vision.vision}`)
  }

  if (visionStore.vision.principles?.length) {
    const principlesList = visionStore.vision.principles
      .map(p => `• ${p.title}: ${p.description}`)
      .join('\n')
    parts.push(`Principles:\n${principlesList}`)
  }

  return parts.join('\n\n')
})

interface SectionConfig {
  key: StrategicContextSection
  title: string
  description: string
  icon: string
}

const sections: SectionConfig[] = [
  {
    key: 'marketDynamics',
    title: 'Market Dynamics',
    description: 'Trends affecting first responders and healthcare navigation',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
  {
    key: 'enablingTechnologies',
    title: 'Enabling Technologies',
    description: "What's now possible that wasn't before",
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  {
    key: 'competitiveLandscape',
    title: 'Competitive Landscape',
    description: 'Where we differentiate and compete',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    key: 'customerPainEvolution',
    title: 'Customer Pain Evolution',
    description: "What's getting worse or newly articulated",
    icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'keyInsights',
    title: 'Key Insights',
    description: 'Learnings that inform strategy',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },
]

const lastUpdated = computed(() => {
  if (!contextStore.context?.updatedAt) return 'Not yet updated'
  const date = contextStore.context.updatedAt.toDate()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
})

// Check if section has content
function sectionHasContent(key: StrategicContextSection): boolean {
  return !!contextStore.getSectionContent(key)
}

// Toggle section expansion
function toggleSection(key: StrategicContextSection) {
  if (expandedSections.value.has(key)) {
    expandedSections.value.delete(key)
  } else {
    expandedSections.value.add(key)
  }
  // Force reactivity
  expandedSections.value = new Set(expandedSections.value)
}

function isSectionExpanded(key: StrategicContextSection): boolean {
  return expandedSections.value.has(key) || editingSection.value === key
}

onMounted(() => {
  contextStore.subscribe()
  visionStore.subscribe()
})

onUnmounted(() => {
  contextStore.unsubscribe()
  visionStore.unsubscribe()
})

function startEditing(section: StrategicContextSection) {
  editingSection.value = section
  editContent.value = contextStore.getSectionContent(section)
  expandedSections.value.add(section)
  expandedSections.value = new Set(expandedSections.value)
}

async function saveSection() {
  if (!editingSection.value) return
  await contextStore.saveSection(editingSection.value, editContent.value)
  editingSection.value = null
  editContent.value = ''
}

function cancelEditing() {
  editingSection.value = null
  editContent.value = ''
}

async function enrichSection(section: StrategicContextSection) {
  try {
    const enrichedContent = await contextStore.enrichSection(section)
    // If currently editing this section, update the edit content
    if (editingSection.value === section) {
      editContent.value = enrichedContent
    } else {
      // Otherwise save directly
      await contextStore.saveSection(section, enrichedContent)
    }
    // Expand the section to show the new content
    expandedSections.value.add(section)
    expandedSections.value = new Set(expandedSections.value)
  } catch (e) {
    console.error('Failed to enrich:', e)
  }
}

async function saveCompanyContext() {
  await contextStore.saveCompanyContext(companyContextEdit.value)
  showCompanyContext.value = false
}

async function enrichCompanyContext() {
  enrichingCompanyContext.value = true
  companyContextError.value = null

  try {
    const enrichFn = httpsCallable<
      { currentContext: string; derivedContext: string },
      { enrichedContent: string }
    >(functions, 'enrichCompanyContext')

    const result = await enrichFn({
      currentContext: companyContextEdit.value,
      derivedContext: derivedCompanyContext.value,
    })

    companyContextEdit.value = result.data.enrichedContent
  } catch (e) {
    console.error('Failed to enrich company context:', e)
    companyContextError.value = e instanceof Error ? e.message : 'Failed to enrich context'
  } finally {
    enrichingCompanyContext.value = false
  }
}

function useDerivedContext() {
  companyContextEdit.value = derivedCompanyContext.value
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p class="text-sm text-gray-500">The "Why Now" — market dynamics, insights, and rationale for focus.</p>
      </div>
      <div class="flex gap-2">
        <span class="text-xs text-gray-400 self-center">{{ lastUpdated }}</span>
      </div>
    </div>

    <!-- Company Context Card - Always visible at top -->
    <div class="card overflow-hidden">
      <button
        class="w-full px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 flex items-center justify-between hover:from-indigo-100 hover:to-purple-100 transition-colors"
        @click="showCompanyContext = !showCompanyContext"
      >
        <div class="flex items-center gap-3">
          <div class="p-2 bg-white rounded-lg border border-indigo-200">
            <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div class="text-left">
            <h3 class="font-medium text-gray-900">Company Context</h3>
            <p class="text-xs text-gray-500">
              {{ contextStore.context?.companyContext ? 'AI uses this to enrich all sections' : 'Auto-populated from Vision & Principles' }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="derivedCompanyContext && !contextStore.context?.companyContext" class="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
            From Vision
          </span>
          <svg
            :class="['w-5 h-5 text-gray-400 transition-transform', showCompanyContext ? 'rotate-180' : '']"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      <Transition name="expand">
        <div v-if="showCompanyContext" class="p-4 space-y-4 bg-white">
          <!-- Derived context preview -->
          <div v-if="derivedCompanyContext && !companyContextEdit" class="bg-gray-50 rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-gray-500 uppercase">Auto-populated from Vision & Principles</span>
              <button
                v-if="authStore.canEdit"
                class="text-xs text-indigo-600 hover:text-indigo-700"
                @click="useDerivedContext"
              >
                Use as starting point
              </button>
            </div>
            <p class="text-sm text-gray-600 whitespace-pre-wrap">{{ derivedCompanyContext }}</p>
          </div>

          <!-- Edit form -->
          <div v-if="authStore.canEdit" class="space-y-3">
            <div class="relative">
              <textarea
                v-model="companyContextEdit"
                class="input min-h-[160px] pr-12"
                placeholder="Add additional context about your company: target market, key differentiators, current stage, competitive advantages, and any other strategic information..."
              />
              <button
                class="absolute bottom-3 right-3 p-2 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Enrich with AI"
                :disabled="enrichingCompanyContext"
                @click="enrichCompanyContext"
              >
                <svg
                  :class="['w-5 h-5', enrichingCompanyContext ? 'animate-spin' : '']"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    v-if="enrichingCompanyContext"
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
              </button>
            </div>

            <!-- Error -->
            <div v-if="companyContextError" class="text-sm text-red-600">
              {{ companyContextError }}
            </div>

            <div class="flex items-center justify-between">
              <p class="text-xs text-gray-400">
                This context enriches all AI-generated strategic analysis
              </p>
              <button
                class="btn-primary text-sm"
                :disabled="contextStore.saving"
                @click="saveCompanyContext"
              >
                {{ contextStore.saving ? 'Saving...' : 'Save Context' }}
              </button>
            </div>
          </div>

          <!-- Read-only display -->
          <div v-else-if="contextStore.context?.companyContext" class="text-sm text-gray-700 whitespace-pre-wrap">
            {{ contextStore.context.companyContext }}
          </div>
        </div>
      </Transition>
    </div>

    <!-- Loading state -->
    <div v-if="contextStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Sections - Collapsible accordion style -->
      <div class="space-y-2">
        <div
          v-for="section in sections"
          :key="section.key"
          class="card overflow-hidden"
        >
          <!-- Section header - clickable to expand/collapse -->
          <button
            class="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
            @click="toggleSection(section.key)"
          >
            <div class="flex items-center gap-3">
              <div class="p-2 bg-white rounded-lg border border-gray-200">
                <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                v-if="sectionHasContent(section.key)"
                class="w-2 h-2 rounded-full bg-green-500"
                title="Has content"
              />
              <span
                v-else
                class="w-2 h-2 rounded-full bg-gray-300"
                title="No content"
              />
              <!-- Chevron -->
              <svg
                :class="['w-5 h-5 text-gray-400 transition-transform', isSectionExpanded(section.key) ? 'rotate-180' : '']"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          <!-- Section content - collapsible -->
          <Transition name="expand">
            <div v-if="isSectionExpanded(section.key)" class="p-4">
              <!-- Action buttons -->
              <div v-if="authStore.canEdit && editingSection !== section.key" class="flex gap-2 mb-3 justify-end">
                <button
                  class="btn-ghost text-sm flex items-center gap-1"
                  :disabled="contextStore.enriching === section.key"
                  @click.stop="enrichSection(section.key)"
                >
                  <svg
                    :class="['w-4 h-4', contextStore.enriching === section.key ? 'animate-spin' : '']"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      v-if="contextStore.enriching === section.key"
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
                  {{ contextStore.enriching === section.key ? 'Enriching...' : 'Enrich with AI' }}
                </button>
                <button
                  class="btn-ghost text-sm"
                  @click.stop="startEditing(section.key)"
                >
                  Edit
                </button>
              </div>

              <!-- Editing mode -->
              <div v-if="editingSection === section.key" class="space-y-3">
                <textarea
                  v-model="editContent"
                  class="input min-h-[200px] font-mono text-sm"
                  placeholder="Enter content for this section..."
                />
                <div class="flex items-center justify-between">
                  <button
                    class="btn-ghost text-sm flex items-center gap-1"
                    :disabled="contextStore.enriching === section.key"
                    @click="enrichSection(section.key)"
                  >
                    <svg
                      :class="['w-4 h-4', contextStore.enriching === section.key ? 'animate-spin' : '']"
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
                    {{ contextStore.enriching === section.key ? 'Generating...' : 'Generate with AI' }}
                  </button>
                  <div class="flex gap-2">
                    <button class="btn-ghost" @click="cancelEditing">Cancel</button>
                    <button
                      class="btn-primary"
                      :disabled="contextStore.saving"
                      @click="saveSection"
                    >
                      {{ contextStore.saving ? 'Saving...' : 'Save' }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Display mode -->
              <div v-else>
                <div
                  v-if="contextStore.getSectionContent(section.key)"
                  class="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap"
                >
                  {{ contextStore.getSectionContent(section.key) }}
                </div>
                <p v-else class="text-sm text-gray-400 italic">
                  No content yet. Click "Enrich with AI" to generate or "Edit" to add manually.
                </p>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Error display -->
      <div v-if="contextStore.error" class="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
        {{ contextStore.error }}
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
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 1000px;
}
</style>
