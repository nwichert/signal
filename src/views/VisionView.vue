<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useVisionStore } from '@/stores/vision'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { Principle } from '@/types'

const authStore = useAuthStore()
const visionStore = useVisionStore()
const functions = getFunctions()

const isEditing = ref(false)
const editForm = ref({
  companyUrl: '',
  coreBusinessModel: '',
  mission: '',
  vision: '',
})

const editingPrinciple = ref<Principle | null>(null)
const newPrinciple = ref({ title: '', description: '' })
const showAddPrinciple = ref(false)

// AI Vision Generation
const showAiDrawer = ref(false)
const aiLoading = ref(false)
const aiError = ref<string | null>(null)
const aiSuggestions = ref<string[]>([])

// Drawer state
type DrawerType = 'mission' | 'vision' | 'principles' | null
const activeDrawer = ref<DrawerType>(null)

const drawerContent = {
  mission: {
    title: 'Mission Statement',
    definition: 'A mission statement defines your organization\'s purpose - why you exist and what you do for your customers. It describes your current focus and the value you deliver today.',
    purpose: [
      'Provides clarity on organizational purpose',
      'Guides strategic decisions and priorities',
      'Aligns team members around a common cause',
      'Communicates your value to stakeholders',
    ],
    examples: [
      {
        company: 'Tesla',
        statement: 'To accelerate the world\'s transition to sustainable energy.',
      },
      {
        company: 'Airbnb',
        statement: 'To create a world where anyone can belong anywhere.',
      },
      {
        company: 'Stripe',
        statement: 'To increase the GDP of the internet.',
      },
      {
        company: 'Spotify',
        statement: 'To unlock the potential of human creativity by giving a million creative artists the opportunity to live off their art.',
      },
    ],
    tips: [
      'Keep it concise (1-2 sentences)',
      'Focus on the impact you make, not what you do',
      'Make it inspiring and memorable',
      'Avoid jargon and buzzwords',
      'Should answer "Why do we exist?"',
    ],
  },
  vision: {
    title: 'Product Vision',
    definition: 'A product vision describes the future state you\'re working toward - what success looks like in 2-5 years. It paints a picture of the world once your product achieves its full potential.',
    purpose: [
      'Sets a clear long-term direction for the product',
      'Inspires and motivates the team',
      'Helps prioritize features and initiatives',
      'Creates alignment across departments',
    ],
    examples: [
      {
        company: 'Amazon (early days)',
        statement: 'To be Earth\'s most customer-centric company, where customers can find and discover anything they might want to buy online.',
      },
      {
        company: 'LinkedIn',
        statement: 'Create economic opportunity for every member of the global workforce.',
      },
      {
        company: 'Microsoft',
        statement: 'To empower every person and every organization on the planet to achieve more.',
      },
      {
        company: 'Notion',
        statement: 'To make toolmaking ubiquitous - enabling everyone to build their own tools.',
      },
    ],
    tips: [
      'Think 2-5 years ahead',
      'Describe the end state, not the journey',
      'Make it ambitious but achievable',
      'Should inspire action and commitment',
      'Focus on customer/user outcomes',
    ],
  },
  principles: {
    title: 'Product Principles',
    definition: 'Product principles are the core beliefs and values that guide product decisions. They act as a decision-making framework when trade-offs are required, ensuring consistency across the team.',
    purpose: [
      'Enable faster, more consistent decisions',
      'Reduce debates and conflicts',
      'Communicate what the product stands for',
      'Help onboard new team members',
    ],
    examples: [
      {
        company: 'Intercom',
        statement: '1. Start with the problem\n2. Think big, start small\n3. Ship fast, learn fast\n4. Simple is almost always better',
      },
      {
        company: 'Slack',
        statement: '1. Be a good person\n2. Empathy is paramount\n3. Courtesy\n4. Craftsmanship\n5. Solidarity',
      },
      {
        company: 'Stripe',
        statement: '1. Users first\n2. Move fast\n3. Think rigorously\n4. Make it work, then make it beautiful',
      },
      {
        company: 'Linear',
        statement: '1. Opinionated by default, flexible when needed\n2. Quality is a feature\n3. Build for power users first\n4. Speed is a feature',
      },
    ],
    tips: [
      'Limit to 5-7 principles (memorable)',
      'Each should be actionable',
      'Principles should help with trade-offs',
      'Include what you WON\'T do',
      'Test: "Would this help me make a decision?"',
    ],
  },
}

function openDrawer(type: DrawerType) {
  activeDrawer.value = type
}

function closeDrawer() {
  activeDrawer.value = null
}

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
    companyUrl: visionStore.vision?.companyUrl || '',
    coreBusinessModel: visionStore.vision?.coreBusinessModel || '',
    mission: visionStore.vision?.mission || '',
    vision: visionStore.vision?.vision || '',
  }
  isEditing.value = true
}

async function saveChanges() {
  await visionStore.saveVision({
    companyUrl: editForm.value.companyUrl,
    coreBusinessModel: editForm.value.coreBusinessModel,
    mission: editForm.value.mission,
    vision: editForm.value.vision,
    principles: visionStore.vision?.principles || [],
  })
  isEditing.value = false
}

function cancelEditing() {
  isEditing.value = false
}

// AI Vision Generation
async function generateVisionSuggestions() {
  const companyUrl = isEditing.value ? editForm.value.companyUrl : visionStore.vision?.companyUrl
  const coreBusinessModel = isEditing.value ? editForm.value.coreBusinessModel : visionStore.vision?.coreBusinessModel
  const mission = isEditing.value ? editForm.value.mission : visionStore.vision?.mission
  const principles = visionStore.vision?.principles || []

  if (!companyUrl && !mission) {
    aiError.value = 'Please add a company URL or mission statement first'
    showAiDrawer.value = true
    return
  }

  showAiDrawer.value = true
  aiLoading.value = true
  aiError.value = null
  aiSuggestions.value = []

  try {
    const generateVision = httpsCallable(functions, 'generateProductVision')
    const result = await generateVision({
      companyUrl,
      coreBusinessModel,
      mission,
      principles: principles.map(p => ({ title: p.title, description: p.description })),
    })

    const data = result.data as { suggestions: string[] }
    aiSuggestions.value = data.suggestions
  } catch (err) {
    console.error('Failed to generate vision suggestions:', err)
    aiError.value = err instanceof Error ? err.message : 'Failed to generate suggestions'
  } finally {
    aiLoading.value = false
  }
}

function selectVisionSuggestion(suggestion: string) {
  if (isEditing.value) {
    editForm.value.vision = suggestion
  } else {
    // Start editing mode with the selected vision
    editForm.value = {
      companyUrl: visionStore.vision?.companyUrl || '',
      coreBusinessModel: visionStore.vision?.coreBusinessModel || '',
      mission: visionStore.vision?.mission || '',
      vision: suggestion,
    }
    isEditing.value = true
  }
  showAiDrawer.value = false
}

function closeAiDrawer() {
  showAiDrawer.value = false
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
      <!-- Company Context (editing mode) -->
      <section v-if="isEditing" class="card p-6 space-y-4">
        <!-- Company URL -->
        <div>
          <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Company Website</h2>
          <input
            v-model="editForm.companyUrl"
            type="url"
            class="input"
            placeholder="https://yourcompany.com"
          />
        </div>

        <!-- Core Business Model -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Core Business Model</h2>
            <span class="text-xs text-gray-400">{{ editForm.coreBusinessModel.length }}/160</span>
          </div>
          <input
            v-model="editForm.coreBusinessModel"
            type="text"
            class="input"
            maxlength="160"
            placeholder="e.g., B2B SaaS for healthcare providers, subscription-based wellness platform"
          />
          <p class="text-xs text-gray-400 mt-1">Briefly describe how your company creates and delivers value</p>
        </div>
      </section>

      <!-- Company Context Display (when not editing) -->
      <div v-else-if="visionStore.vision?.companyUrl || visionStore.vision?.coreBusinessModel" class="space-y-2">
        <div v-if="visionStore.vision?.companyUrl" class="flex items-center gap-2 text-sm text-gray-500">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <a :href="visionStore.vision.companyUrl" target="_blank" class="text-indigo-600 hover:text-indigo-700">
            {{ visionStore.vision.companyUrl }}
          </a>
        </div>
        <div v-if="visionStore.vision?.coreBusinessModel" class="flex items-start gap-2 text-sm text-gray-500">
          <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span>{{ visionStore.vision.coreBusinessModel }}</span>
        </div>
      </div>

      <!-- Mission -->
      <section class="card p-6 group">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Mission</h2>
          <button
            class="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
            title="Learn more about Mission"
            @click="openDrawer('mission')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
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
      <section class="card p-6 group">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Product Vision (2-5 Year)</h2>
          <div class="flex items-center gap-1">
            <button
              v-if="authStore.canEditVision"
              class="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
              title="Generate vision with AI"
              @click="generateVisionSuggestions"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </button>
            <button
              class="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
              title="Learn more about Product Vision"
              @click="openDrawer('vision')"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>
        <div v-if="isEditing" class="relative">
          <textarea
            v-model="editForm.vision"
            class="input min-h-[120px]"
            placeholder="Your product vision..."
          />
          <button
            v-if="authStore.canEditVision"
            class="absolute bottom-3 right-3 p-2 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Generate vision with AI"
            @click="generateVisionSuggestions"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </button>
        </div>
        <p v-else class="text-gray-900 whitespace-pre-wrap">
          {{ visionStore.vision?.vision || 'No vision defined yet.' }}
        </p>
      </section>

      <!-- Principles -->
      <section class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Product Principles</h2>
            <button
              class="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
              title="Learn more about Product Principles"
              @click="openDrawer('principles')"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
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

    <!-- Slide-over Drawer -->
    <Teleport to="body">
      <Transition name="drawer">
        <div
          v-if="activeDrawer"
          class="fixed inset-0 z-50 overflow-hidden"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-gray-500/50 transition-opacity"
            @click="closeDrawer"
          />

          <!-- Drawer panel -->
          <div class="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div class="w-screen max-w-md">
              <div class="flex h-full flex-col overflow-y-auto bg-white shadow-xl">
                <!-- Header -->
                <div class="bg-indigo-600 px-6 py-6">
                  <div class="flex items-center justify-between">
                    <h2 class="text-lg font-medium text-white">
                      {{ drawerContent[activeDrawer].title }}
                    </h2>
                    <button
                      class="rounded-md text-indigo-200 hover:text-white focus:outline-none"
                      @click="closeDrawer"
                    >
                      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 px-6 py-6 space-y-6">
                  <!-- Definition -->
                  <div>
                    <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
                      What is it?
                    </h3>
                    <p class="text-sm text-gray-600 leading-relaxed">
                      {{ drawerContent[activeDrawer].definition }}
                    </p>
                  </div>

                  <!-- Purpose -->
                  <div>
                    <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
                      Why it matters
                    </h3>
                    <ul class="space-y-2">
                      <li
                        v-for="(item, index) in drawerContent[activeDrawer].purpose"
                        :key="index"
                        class="flex items-start gap-2 text-sm text-gray-600"
                      >
                        <svg class="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                        <span>{{ item }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- Examples -->
                  <div>
                    <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                      Real-world examples
                    </h3>
                    <div class="space-y-4">
                      <div
                        v-for="(example, index) in drawerContent[activeDrawer].examples"
                        :key="index"
                        class="bg-gray-50 rounded-lg p-4"
                      >
                        <div class="flex items-center gap-2 mb-2">
                          <span class="text-sm font-medium text-gray-900">{{ example.company }}</span>
                        </div>
                        <p class="text-sm text-gray-600 italic whitespace-pre-line">
                          "{{ example.statement }}"
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Tips -->
                  <div>
                    <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
                      Tips for writing a great one
                    </h3>
                    <ul class="space-y-2">
                      <li
                        v-for="(tip, index) in drawerContent[activeDrawer].tips"
                        :key="index"
                        class="flex items-start gap-2 text-sm text-gray-600"
                      >
                        <svg class="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                        </svg>
                        <span>{{ tip }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- AI Vision Suggestions Drawer -->
    <Teleport to="body">
      <Transition name="drawer">
        <div
          v-if="showAiDrawer"
          class="fixed inset-0 z-50 overflow-hidden"
        >
          <!-- Backdrop -->
          <div
            class="absolute inset-0 bg-gray-500/50 transition-opacity"
            @click="closeAiDrawer"
          />

          <!-- Drawer panel -->
          <div class="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div class="w-screen max-w-md">
              <div class="flex h-full flex-col overflow-y-auto bg-white shadow-xl">
                <!-- Header -->
                <div class="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-6">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="p-2 bg-white/20 rounded-lg">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                      </div>
                      <div>
                        <h2 class="text-lg font-medium text-white">AI Vision Generator</h2>
                        <p class="text-sm text-indigo-200">Click a suggestion to use it</p>
                      </div>
                    </div>
                    <button
                      class="rounded-md text-indigo-200 hover:text-white focus:outline-none"
                      @click="closeAiDrawer"
                    >
                      <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 px-6 py-6">
                  <!-- Loading state -->
                  <div v-if="aiLoading" class="flex flex-col items-center justify-center py-12">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <p class="text-sm text-gray-500">Analyzing your company and generating vision suggestions...</p>
                  </div>

                  <!-- Error state -->
                  <div v-else-if="aiError" class="bg-red-50 rounded-lg p-4">
                    <div class="flex items-start gap-3">
                      <svg class="w-5 h-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                      </svg>
                      <div>
                        <h3 class="text-sm font-medium text-red-800">Generation Failed</h3>
                        <p class="text-sm text-red-700 mt-1">{{ aiError }}</p>
                      </div>
                    </div>
                    <button
                      class="mt-4 btn-secondary text-sm w-full"
                      @click="generateVisionSuggestions"
                    >
                      Try Again
                    </button>
                  </div>

                  <!-- Suggestions -->
                  <div v-else-if="aiSuggestions.length > 0" class="space-y-4">
                    <p class="text-sm text-gray-500 mb-4">
                      Based on your company website, mission, and principles, here are some vision statement suggestions:
                    </p>
                    <button
                      v-for="(suggestion, index) in aiSuggestions"
                      :key="index"
                      class="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors group"
                      @click="selectVisionSuggestion(suggestion)"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <p class="text-sm text-gray-700 group-hover:text-gray-900">{{ suggestion }}</p>
                        <svg class="w-5 h-5 text-gray-400 group-hover:text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>

                    <div class="pt-4 border-t">
                      <button
                        class="w-full btn-ghost text-sm"
                        @click="generateVisionSuggestions"
                      >
                        <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Generate More Suggestions
                      </button>
                    </div>
                  </div>

                  <!-- Empty state -->
                  <div v-else class="text-center py-12">
                    <svg class="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    <p class="text-sm text-gray-500">No suggestions yet</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-enter-active .absolute.inset-y-0,
.drawer-leave-active .absolute.inset-y-0 {
  transition: transform 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .absolute.inset-y-0,
.drawer-leave-to .absolute.inset-y-0 {
  transform: translateX(100%);
}
</style>
