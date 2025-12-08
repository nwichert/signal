<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useStrategicContextStore } from '@/stores/strategicContext'
import { useVisionStore } from '@/stores/vision'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { StrategicContextSection } from '@/types'
import StrategicSectionCard from '@/components/StrategicSectionCard.vue'

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

export interface SectionConfig {
  key: StrategicContextSection
  title: string
  description: string
  icon: string
}

// External forces - what's happening in the market
const externalSections: SectionConfig[] = [
  {
    key: 'marketDynamics',
    title: 'Market Dynamics',
    description: 'Trends affecting your industry and customers',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
  {
    key: 'enablingTechnologies',
    title: 'Enabling Technologies',
    description: "What's now possible that wasn't before",
    icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
]

// Internal analysis - how we respond
const internalSections: SectionConfig[] = [
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
]

// Key insights - synthesis
const keyInsightsSection: SectionConfig = {
  key: 'keyInsights',
  title: 'Key Insights',
  description: 'Strategic learnings that inform your Focus Areas and priorities',
  icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
}

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
  <div class="space-y-8">
    <!-- Hero intro -->
    <div class="bg-gradient-to-br from-slate-50 to-indigo-50 -mx-6 -mt-6 px-6 py-8 border-b border-slate-200">
      <div class="max-w-3xl">
        <p class="text-gray-600 leading-relaxed">
          Strategic Context captures the "Why Now" — the market forces, competitive dynamics, and customer pain points
          that shape your product priorities. This analysis feeds directly into your Focus Areas and helps ensure
          strategic alignment across the team.
        </p>
        <div class="flex items-center gap-4 mt-4">
          <span class="text-xs text-gray-400">Last updated: {{ lastUpdated }}</span>
          <RouterLink
            to="/focus-areas"
            class="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            View Focus Areas
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="contextStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Foundation Section: Company Context -->
      <section>
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-6 bg-indigo-500 rounded-full" />
          <h2 class="text-sm font-semibold text-gray-900 uppercase tracking-wide">Foundation</h2>
        </div>

        <div class="card overflow-hidden border-indigo-200 bg-gradient-to-br from-white to-indigo-50/30">
          <button
            class="w-full px-5 py-4 flex items-center justify-between hover:bg-indigo-50/50 transition-colors"
            @click="showCompanyContext = !showCompanyContext"
          >
            <div class="flex items-center gap-4">
              <div class="p-2.5 bg-indigo-100 rounded-xl">
                <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div class="text-left">
                <h3 class="font-medium text-gray-900">Company Context</h3>
                <p class="text-sm text-gray-500">
                  {{ contextStore.context?.companyContext ? 'Core context that informs all AI enrichment' : 'Start here — define your company\'s strategic foundation' }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span
                v-if="contextStore.context?.companyContext"
                class="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1"
              >
                <span class="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Configured
              </span>
              <span
                v-else-if="derivedCompanyContext"
                class="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full"
              >
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
            <div v-if="showCompanyContext" class="px-5 py-4 border-t border-indigo-100 bg-white space-y-4">
              <!-- Derived context preview -->
              <div v-if="derivedCompanyContext && !companyContextEdit" class="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Pulled from Vision & Principles</span>
                  <button
                    v-if="authStore.canEdit"
                    class="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    @click="useDerivedContext"
                  >
                    Use as starting point
                  </button>
                </div>
                <p class="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{{ derivedCompanyContext }}</p>
              </div>

              <!-- Edit form -->
              <div v-if="authStore.canEdit" class="space-y-3">
                <div class="relative">
                  <textarea
                    v-model="companyContextEdit"
                    class="input min-h-[180px] pr-12"
                    placeholder="Describe your company's strategic position: target market, key differentiators, current stage, competitive advantages..."
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
              <div v-else-if="contextStore.context?.companyContext" class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {{ contextStore.context.companyContext }}
              </div>
            </div>
          </Transition>
        </div>
      </section>

      <!-- External Forces Section -->
      <section>
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-6 bg-emerald-500 rounded-full" />
          <h2 class="text-sm font-semibold text-gray-900 uppercase tracking-wide">External Forces</h2>
          <span class="text-xs text-gray-400 ml-2">What's happening in the market</span>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <StrategicSectionCard
            v-for="section in externalSections"
            :key="section.key"
            :section="section"
            :is-expanded="isSectionExpanded(section.key)"
            :is-editing="editingSection === section.key"
            :edit-content="editContent"
            :content="contextStore.getSectionContent(section.key)"
            :can-edit="authStore.canEdit"
            :is-enriching="contextStore.enriching === section.key"
            :is-saving="contextStore.saving"
            @toggle="toggleSection(section.key)"
            @start-edit="startEditing(section.key)"
            @save="saveSection"
            @cancel="cancelEditing"
            @enrich="enrichSection(section.key)"
            @update:edit-content="editContent = $event"
          />
        </div>
      </section>

      <!-- Internal Analysis Section -->
      <section>
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-6 bg-amber-500 rounded-full" />
          <h2 class="text-sm font-semibold text-gray-900 uppercase tracking-wide">Internal Analysis</h2>
          <span class="text-xs text-gray-400 ml-2">How we respond</span>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <StrategicSectionCard
            v-for="section in internalSections"
            :key="section.key"
            :section="section"
            :is-expanded="isSectionExpanded(section.key)"
            :is-editing="editingSection === section.key"
            :edit-content="editContent"
            :content="contextStore.getSectionContent(section.key)"
            :can-edit="authStore.canEdit"
            :is-enriching="contextStore.enriching === section.key"
            :is-saving="contextStore.saving"
            @toggle="toggleSection(section.key)"
            @start-edit="startEditing(section.key)"
            @save="saveSection"
            @cancel="cancelEditing"
            @enrich="enrichSection(section.key)"
            @update:edit-content="editContent = $event"
          />
        </div>
      </section>

      <!-- Key Insights Section - Full width, prominent -->
      <section>
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-6 bg-purple-500 rounded-full" />
          <h2 class="text-sm font-semibold text-gray-900 uppercase tracking-wide">Synthesis</h2>
          <span class="text-xs text-gray-400 ml-2">Insights that drive strategy</span>
        </div>

        <StrategicSectionCard
          :section="keyInsightsSection"
          :is-expanded="isSectionExpanded(keyInsightsSection.key)"
          :is-editing="editingSection === keyInsightsSection.key"
          :edit-content="editContent"
          :content="contextStore.getSectionContent(keyInsightsSection.key)"
          :can-edit="authStore.canEdit"
          :is-enriching="contextStore.enriching === keyInsightsSection.key"
          :is-saving="contextStore.saving"
          variant="prominent"
          @toggle="toggleSection(keyInsightsSection.key)"
          @start-edit="startEditing(keyInsightsSection.key)"
          @save="saveSection"
          @cancel="cancelEditing"
          @enrich="enrichSection(keyInsightsSection.key)"
          @update:edit-content="editContent = $event"
        />
      </section>

      <!-- Connection to Focus Areas -->
      <section class="bg-gradient-to-r from-slate-50 to-indigo-50 -mx-6 px-6 py-6 border-t border-b border-slate-200">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-medium text-gray-900">Ready to translate insights into action?</h3>
            <p class="text-sm text-gray-500 mt-1">
              Use these strategic insights to define and prioritize your Focus Areas.
            </p>
          </div>
          <RouterLink to="/focus-areas" class="btn-primary flex items-center gap-2">
            Go to Focus Areas
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </RouterLink>
        </div>
      </section>

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
