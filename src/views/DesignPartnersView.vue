<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDesignPartnersStore } from '@/stores/designPartners'
import { useCustomerArchetypesStore } from '@/stores/customerArchetypes'
import { useDiscoveryStore } from '@/stores/discovery'
import type {
  DesignPartner,
  DesignPartnerStatus,
  EngagementType,
} from '@/types'

const authStore = useAuthStore()
const store = useDesignPartnersStore()
const archetypesStore = useCustomerArchetypesStore()
const discoveryStore = useDiscoveryStore()

// View state
const selectedPartnerId = ref<string | null>(null)
const showCreateModal = ref(false)
const activeTab = ref<'overview' | 'engagements' | 'feedback' | 'insights'>('overview')

// Form states
const partnerForm = ref({
  name: '',
  contactName: '',
  contactEmail: '',
  contactRole: '',
  company: '',
  status: 'prospect' as DesignPartnerStatus,
  archetypeId: '',
  notes: '',
})

const engagementForm = ref({
  type: 'call' as EngagementType,
  title: '',
  date: new Date().toISOString().split('T')[0],
  notes: '',
  keyTakeaways: [] as string[],
  newTakeaway: '',
})

const feedbackForm = ref({
  content: '',
  theme: '',
  hypothesisId: '',
  engagementId: '',
})

const insightForm = ref({
  content: '',
  category: 'pain-point' as 'pain-point' | 'feature-request' | 'validation' | 'surprise' | 'quote',
  priority: 'medium' as 'high' | 'medium' | 'low',
})

const showEngagementForm = ref(false)
const showFeedbackForm = ref(false)
const showInsightForm = ref(false)

onMounted(() => {
  store.subscribe()
  archetypesStore.subscribe()
  discoveryStore.subscribe()
})

onUnmounted(() => {
  store.unsubscribe()
  archetypesStore.unsubscribe()
  discoveryStore.unsubscribe()
})

// Computed
const selectedPartner = computed(() => {
  if (!selectedPartnerId.value) return null
  return store.getPartnerById(selectedPartnerId.value) || null
})

const statusConfig: Record<DesignPartnerStatus, { label: string; color: string }> = {
  prospect: { label: 'Prospect', color: 'bg-gray-100 text-gray-700' },
  active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  paused: { label: 'Paused', color: 'bg-yellow-100 text-yellow-800' },
  churned: { label: 'Churned', color: 'bg-red-100 text-red-800' },
}

const engagementTypeConfig: Record<EngagementType, { label: string; icon: string }> = {
  call: { label: 'Call', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
  demo: { label: 'Demo', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  'feedback-session': { label: 'Feedback Session', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  'usability-test': { label: 'Usability Test', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  interview: { label: 'Interview', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  email: { label: 'Email', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  other: { label: 'Other', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
}

const insightCategoryConfig: Record<string, { label: string; color: string }> = {
  'pain-point': { label: 'Pain Point', color: 'bg-red-100 text-red-800' },
  'feature-request': { label: 'Feature Request', color: 'bg-blue-100 text-blue-800' },
  validation: { label: 'Validation', color: 'bg-green-100 text-green-800' },
  surprise: { label: 'Surprise', color: 'bg-purple-100 text-purple-800' },
  quote: { label: 'Quote', color: 'bg-amber-100 text-amber-800' },
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: 'High', color: 'bg-red-100 text-red-800' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  low: { label: 'Low', color: 'bg-gray-100 text-gray-600' },
}

// Partner counts by archetype (for display)
const archetypeCoverage = computed(() => {
  const coverage: Array<{ id: string; name: string; count: number }> = []
  archetypesStore.activeArchetypes.forEach((arch) => {
    coverage.push({
      id: arch.id,
      name: arch.name,
      count: store.getPartnerCountByArchetype(arch.id),
    })
  })
  return coverage
})

// Get archetype name
function getArchetypeName(archetypeId?: string): string {
  if (!archetypeId) return ''
  const arch = archetypesStore.archetypes.find((a) => a.id === archetypeId)
  return arch?.name || ''
}

// Get last engagement date formatted
function getLastEngagementDisplay(partner: DesignPartner): string {
  const lastEngagement = store.getLastEngagement(partner.id)
  if (!lastEngagement) return 'No engagements'
  const date = lastEngagement.date?.toDate?.()
  if (!date) return 'No engagements'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Functions
async function createPartner() {
  if (!partnerForm.value.name.trim() || !partnerForm.value.contactName.trim()) return

  const id = await store.addPartner({
    name: partnerForm.value.name,
    contactName: partnerForm.value.contactName,
    contactEmail: partnerForm.value.contactEmail || undefined,
    contactRole: partnerForm.value.contactRole || undefined,
    company: partnerForm.value.company || undefined,
    status: partnerForm.value.status,
    archetypeId: partnerForm.value.archetypeId || undefined,
    notes: partnerForm.value.notes || undefined,
  })

  selectedPartnerId.value = id
  showCreateModal.value = false
  resetPartnerForm()
}

function resetPartnerForm() {
  partnerForm.value = {
    name: '',
    contactName: '',
    contactEmail: '',
    contactRole: '',
    company: '',
    status: 'prospect',
    archetypeId: '',
    notes: '',
  }
}

async function updatePartnerField(field: keyof DesignPartner, value: any) {
  if (!selectedPartnerId.value) return
  await store.updatePartner(selectedPartnerId.value, { [field]: value })
}

async function addEngagement() {
  if (!selectedPartnerId.value || !engagementForm.value.title.trim()) return

  await store.addEngagement(selectedPartnerId.value, {
    type: engagementForm.value.type,
    title: engagementForm.value.title,
    date: new Date(engagementForm.value.date || new Date()),
    notes: engagementForm.value.notes,
    keyTakeaways: engagementForm.value.keyTakeaways,
  })

  resetEngagementForm()
  showEngagementForm.value = false
}

function resetEngagementForm() {
  engagementForm.value = {
    type: 'call',
    title: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    keyTakeaways: [],
    newTakeaway: '',
  }
}

function addTakeaway() {
  if (engagementForm.value.newTakeaway.trim()) {
    engagementForm.value.keyTakeaways.push(engagementForm.value.newTakeaway.trim())
    engagementForm.value.newTakeaway = ''
  }
}

function removeTakeaway(index: number) {
  engagementForm.value.keyTakeaways.splice(index, 1)
}

async function removeEngagement(engagementId: string) {
  if (!selectedPartnerId.value) return
  if (!confirm('Remove this engagement?')) return
  await store.removeEngagement(selectedPartnerId.value, engagementId)
}

async function addFeedback() {
  if (!selectedPartnerId.value || !feedbackForm.value.content.trim()) return

  await store.addFeedback(selectedPartnerId.value, {
    content: feedbackForm.value.content,
    theme: feedbackForm.value.theme,
    hypothesisId: feedbackForm.value.hypothesisId || undefined,
    engagementId: feedbackForm.value.engagementId || undefined,
  })

  resetFeedbackForm()
  showFeedbackForm.value = false
}

function resetFeedbackForm() {
  feedbackForm.value = {
    content: '',
    theme: '',
    hypothesisId: '',
    engagementId: '',
  }
}

async function removeFeedback(feedbackId: string) {
  if (!selectedPartnerId.value) return
  if (!confirm('Remove this feedback?')) return
  await store.removeFeedback(selectedPartnerId.value, feedbackId)
}

async function addInsight() {
  if (!selectedPartnerId.value || !insightForm.value.content.trim()) return

  await store.addInsight(selectedPartnerId.value, {
    content: insightForm.value.content,
    category: insightForm.value.category,
    priority: insightForm.value.priority,
  })

  resetInsightForm()
  showInsightForm.value = false
}

function resetInsightForm() {
  insightForm.value = {
    content: '',
    category: 'pain-point',
    priority: 'medium',
  }
}

async function removeInsight(insightId: string) {
  if (!selectedPartnerId.value) return
  if (!confirm('Remove this insight?')) return
  await store.removeInsight(selectedPartnerId.value, insightId)
}

async function deletePartner() {
  if (!selectedPartnerId.value) return
  if (!confirm('Delete this design partner? This cannot be undone.')) return

  await store.deletePartner(selectedPartnerId.value)
  selectedPartnerId.value = null
}

// Format date for display
function formatDate(timestamp: any): string {
  const date = timestamp?.toDate?.()
  if (!date) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="flex h-[calc(100vh-8rem)] -m-6">
    <!-- Left Sidebar: Partners List -->
    <div class="w-72 border-r border-gray-200 bg-gray-50 flex flex-col">
      <!-- Header -->
      <div class="p-4 border-b border-gray-200 bg-white">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-900">Design Partners</h2>
          <button
            v-if="authStore.canEdit"
            class="p-1.5 text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
            @click="showCreateModal = true"
            title="Add Partner"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <p class="text-xs text-gray-500">Manage partner relationships and feedback</p>
      </div>

      <!-- Archetype Coverage -->
      <div v-if="archetypeCoverage.length > 0" class="p-4 border-b border-gray-200 bg-gradient-to-br from-purple-50 to-indigo-50">
        <div class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Archetype Coverage</div>
        <div class="space-y-1.5">
          <div v-for="arch in archetypeCoverage" :key="arch.id" class="flex items-center justify-between text-sm">
            <span class="text-gray-700 truncate">{{ arch.name }}</span>
            <span :class="[
              'px-2 py-0.5 rounded-full text-xs font-medium',
              arch.count > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
            ]">
              {{ arch.count }} partner{{ arch.count === 1 ? '' : 's' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Partners List -->
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        <div v-if="store.loading" class="text-center py-8 text-gray-500 text-sm">Loading...</div>

        <div v-else-if="store.partners.length === 0" class="text-center py-8">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-200 flex items-center justify-center">
            <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p class="text-gray-500 text-sm">No design partners yet</p>
          <button
            v-if="authStore.canEdit"
            class="mt-2 text-sm text-accent-600 hover:text-accent-700 font-medium"
            @click="showCreateModal = true"
          >
            Add your first partner
          </button>
        </div>

        <button
          v-for="partner in store.partners"
          :key="partner.id"
          :class="[
            'w-full text-left p-3 rounded-xl border-2 transition-all duration-200',
            selectedPartnerId === partner.id
              ? 'bg-white border-accent-500 shadow-md'
              : 'bg-white border-transparent hover:border-gray-200 hover:shadow-sm'
          ]"
          @click="selectedPartnerId = partner.id"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="font-medium text-gray-900 truncate">{{ partner.name }}</div>
              <div class="text-xs text-gray-500 truncate">{{ partner.contactName }}</div>
            </div>
            <span :class="['text-xs px-2 py-0.5 rounded-full whitespace-nowrap', statusConfig[partner.status].color]">
              {{ statusConfig[partner.status].label }}
            </span>
          </div>

          <div class="mt-2 flex items-center gap-2 flex-wrap">
            <span v-if="getArchetypeName(partner.archetypeId)" class="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {{ getArchetypeName(partner.archetypeId) }}
            </span>
            <span class="text-xs text-gray-400">{{ getLastEngagementDisplay(partner) }}</span>
          </div>

          <!-- Quick stats -->
          <div class="mt-2 flex items-center gap-3 text-xs text-gray-500">
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {{ partner.engagements.length }}
            </span>
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {{ partner.feedback.length }}
            </span>
            <span class="flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {{ partner.insights.length }}
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <template v-if="selectedPartner">
        <!-- Header -->
        <div class="p-6 border-b border-gray-200 bg-white">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-3">
                <h1 class="text-2xl font-bold text-gray-900">{{ selectedPartner.name }}</h1>
                <span :class="['text-sm px-3 py-1 rounded-full', statusConfig[selectedPartner.status].color]">
                  {{ statusConfig[selectedPartner.status].label }}
                </span>
              </div>
              <div class="flex items-center gap-4 mt-2">
                <span class="text-sm text-gray-600">{{ selectedPartner.contactName }}</span>
                <span v-if="selectedPartner.contactRole" class="text-sm text-gray-500">{{ selectedPartner.contactRole }}</span>
                <RouterLink
                  v-if="getArchetypeName(selectedPartner.archetypeId)"
                  to="/customer-archetypes"
                  class="inline-flex items-center gap-1 px-2.5 py-1 text-sm bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {{ getArchetypeName(selectedPartner.archetypeId) }}
                </RouterLink>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <select
                v-if="authStore.canEdit"
                :value="selectedPartner.status"
                class="input text-sm"
                @change="updatePartnerField('status', ($event.target as HTMLSelectElement).value)"
              >
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="churned">Churned</option>
              </select>
              <button
                v-if="authStore.canEdit"
                class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                @click="deletePartner"
                title="Delete partner"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mt-4">
            <button
              v-for="tab in ['overview', 'engagements', 'feedback', 'insights'] as const"
              :key="tab"
              :class="[
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                activeTab === tab
                  ? 'bg-accent-100 text-accent-700'
                  : 'text-gray-600 hover:bg-gray-100'
              ]"
              @click="activeTab = tab"
            >
              {{ tab.charAt(0).toUpperCase() + tab.slice(1) }}
              <span v-if="tab === 'engagements'" class="ml-1 text-xs opacity-75">({{ selectedPartner.engagements.length }})</span>
              <span v-if="tab === 'feedback'" class="ml-1 text-xs opacity-75">({{ selectedPartner.feedback.length }})</span>
              <span v-if="tab === 'insights'" class="ml-1 text-xs opacity-75">({{ selectedPartner.insights.length }})</span>
            </button>
          </div>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-y-auto p-6">
          <!-- Overview Tab -->
          <div v-if="activeTab === 'overview'" class="space-y-6">
            <!-- Contact Info -->
            <div class="card p-4">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">Contact Information</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="label">Contact Name</label>
                  <input
                    :value="selectedPartner.contactName"
                    class="input"
                    :disabled="!authStore.canEdit"
                    @blur="updatePartnerField('contactName', ($event.target as HTMLInputElement).value)"
                  />
                </div>
                <div>
                  <label class="label">Email</label>
                  <input
                    :value="selectedPartner.contactEmail"
                    type="email"
                    class="input"
                    :disabled="!authStore.canEdit"
                    @blur="updatePartnerField('contactEmail', ($event.target as HTMLInputElement).value)"
                  />
                </div>
                <div>
                  <label class="label">Role / Title</label>
                  <input
                    :value="selectedPartner.contactRole"
                    class="input"
                    :disabled="!authStore.canEdit"
                    @blur="updatePartnerField('contactRole', ($event.target as HTMLInputElement).value)"
                  />
                </div>
                <div>
                  <label class="label">Company</label>
                  <input
                    :value="selectedPartner.company"
                    class="input"
                    :disabled="!authStore.canEdit"
                    @blur="updatePartnerField('company', ($event.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
            </div>

            <!-- Archetype Assignment -->
            <div class="card p-4">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">Archetype Assignment</h3>
              <p class="text-xs text-gray-500 mb-2">Which customer archetype does this partner represent?</p>
              <select
                :value="selectedPartner.archetypeId || ''"
                class="input"
                :disabled="!authStore.canEdit"
                @change="updatePartnerField('archetypeId', ($event.target as HTMLSelectElement).value || undefined)"
              >
                <option value="">No archetype assigned</option>
                <option
                  v-for="arch in archetypesStore.archetypes"
                  :key="arch.id"
                  :value="arch.id"
                >
                  {{ arch.name }} ({{ arch.stakeholderRole.replace('_', ' ') }})
                </option>
              </select>
            </div>

            <!-- Notes -->
            <div class="card p-4">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
              <textarea
                :value="selectedPartner.notes"
                class="input min-h-[100px]"
                placeholder="General notes about this partner..."
                :disabled="!authStore.canEdit"
                @blur="updatePartnerField('notes', ($event.target as HTMLTextAreaElement).value)"
              />
            </div>

            <!-- Quick Stats -->
            <div class="grid grid-cols-3 gap-4">
              <div class="card p-4 text-center">
                <div class="text-2xl font-bold text-gray-900">{{ selectedPartner.engagements.length }}</div>
                <div class="text-sm text-gray-500">Engagements</div>
              </div>
              <div class="card p-4 text-center">
                <div class="text-2xl font-bold text-gray-900">{{ selectedPartner.feedback.length }}</div>
                <div class="text-sm text-gray-500">Feedback Items</div>
              </div>
              <div class="card p-4 text-center">
                <div class="text-2xl font-bold text-gray-900">{{ selectedPartner.insights.length }}</div>
                <div class="text-sm text-gray-500">Key Insights</div>
              </div>
            </div>
          </div>

          <!-- Engagements Tab -->
          <div v-else-if="activeTab === 'engagements'" class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900">Engagement Timeline</h3>
              <button
                v-if="authStore.canEdit && !showEngagementForm"
                class="btn-ghost text-sm"
                @click="showEngagementForm = true"
              >
                + Log Engagement
              </button>
            </div>

            <!-- Add Engagement Form -->
            <div v-if="showEngagementForm" class="card p-4 space-y-3">
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="label">Type</label>
                  <select v-model="engagementForm.type" class="input">
                    <option v-for="(config, type) in engagementTypeConfig" :key="type" :value="type">
                      {{ config.label }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="label">Title</label>
                  <input v-model="engagementForm.title" class="input" placeholder="e.g., Discovery Call" />
                </div>
                <div>
                  <label class="label">Date</label>
                  <input v-model="engagementForm.date" type="date" class="input" />
                </div>
              </div>
              <div>
                <label class="label">Notes</label>
                <textarea v-model="engagementForm.notes" class="input min-h-[80px]" placeholder="What happened?" />
              </div>
              <div>
                <label class="label">Key Takeaways</label>
                <div class="flex gap-2 mb-2">
                  <input
                    v-model="engagementForm.newTakeaway"
                    class="input flex-1"
                    placeholder="Add a takeaway..."
                    @keyup.enter="addTakeaway"
                  />
                  <button class="btn-ghost" @click="addTakeaway">Add</button>
                </div>
                <div v-if="engagementForm.keyTakeaways.length > 0" class="space-y-1">
                  <div
                    v-for="(takeaway, index) in engagementForm.keyTakeaways"
                    :key="index"
                    class="flex items-center gap-2 text-sm bg-gray-50 px-2 py-1 rounded"
                  >
                    <span class="flex-1">{{ takeaway }}</span>
                    <button class="text-gray-400 hover:text-red-600" @click="removeTakeaway(index)">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div class="flex gap-2 justify-end">
                <button class="btn-ghost text-sm" @click="showEngagementForm = false; resetEngagementForm()">Cancel</button>
                <button class="btn-primary text-sm" :disabled="!engagementForm.title.trim()" @click="addEngagement">
                  Log Engagement
                </button>
              </div>
            </div>

            <!-- Engagements List -->
            <div v-if="selectedPartner.engagements.length === 0" class="text-sm text-gray-400 text-center py-8">
              No engagements logged yet.
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="engagement in selectedPartner.engagements.slice().sort((a, b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0))"
                :key="engagement.id"
                class="card p-4 group"
              >
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center">
                      <svg class="w-5 h-5 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="engagementTypeConfig[engagement.type].icon" />
                      </svg>
                    </div>
                    <div>
                      <div class="font-medium text-gray-900">{{ engagement.title }}</div>
                      <div class="flex items-center gap-2 text-sm text-gray-500">
                        <span>{{ engagementTypeConfig[engagement.type].label }}</span>
                        <span>·</span>
                        <span>{{ formatDate(engagement.date) }}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    v-if="authStore.canEdit"
                    class="p-1.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="removeEngagement(engagement.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <p v-if="engagement.notes" class="mt-3 text-sm text-gray-600">{{ engagement.notes }}</p>
                <div v-if="engagement.keyTakeaways.length > 0" class="mt-3">
                  <div class="text-xs font-medium text-gray-500 mb-1">Key Takeaways</div>
                  <ul class="space-y-1">
                    <li v-for="(takeaway, i) in engagement.keyTakeaways" :key="i" class="text-sm text-gray-700 flex items-start gap-2">
                      <svg class="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                      {{ takeaway }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Feedback Tab -->
          <div v-else-if="activeTab === 'feedback'" class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900">Partner Feedback</h3>
              <button
                v-if="authStore.canEdit && !showFeedbackForm"
                class="btn-ghost text-sm"
                @click="showFeedbackForm = true"
              >
                + Add Feedback
              </button>
            </div>

            <!-- Add Feedback Form -->
            <div v-if="showFeedbackForm" class="card p-4 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Theme</label>
                  <input v-model="feedbackForm.theme" class="input" placeholder="e.g., Onboarding, Scheduling" />
                </div>
                <div>
                  <label class="label">Link to Hypothesis</label>
                  <select v-model="feedbackForm.hypothesisId" class="input">
                    <option value="">None</option>
                    <option
                      v-for="hyp in discoveryStore.hypotheses"
                      :key="hyp.id"
                      :value="hyp.id"
                    >
                      {{ hyp.belief.substring(0, 50) }}{{ hyp.belief.length > 50 ? '...' : '' }}
                    </option>
                  </select>
                </div>
              </div>
              <div>
                <label class="label">Feedback</label>
                <textarea v-model="feedbackForm.content" class="input min-h-[80px]" placeholder="What did they say?" />
              </div>
              <div class="flex gap-2 justify-end">
                <button class="btn-ghost text-sm" @click="showFeedbackForm = false; resetFeedbackForm()">Cancel</button>
                <button class="btn-primary text-sm" :disabled="!feedbackForm.content.trim()" @click="addFeedback">
                  Add Feedback
                </button>
              </div>
            </div>

            <!-- Feedback List -->
            <div v-if="selectedPartner.feedback.length === 0" class="text-sm text-gray-400 text-center py-8">
              No feedback recorded yet.
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="fb in selectedPartner.feedback.slice().sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))"
                :key="fb.id"
                class="card p-3 group"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                      <span v-if="fb.theme" class="badge-gray">{{ fb.theme }}</span>
                      <span class="text-xs text-gray-400">{{ formatDate(fb.createdAt) }}</span>
                    </div>
                    <p class="text-sm text-gray-600">{{ fb.content }}</p>
                    <RouterLink
                      v-if="fb.hypothesisId"
                      to="/discovery"
                      class="inline-flex items-center gap-1 mt-2 text-xs text-accent-600 hover:text-accent-700"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Linked to hypothesis
                    </RouterLink>
                  </div>
                  <button
                    v-if="authStore.canEdit"
                    class="p-1.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="removeFeedback(fb.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Insights Tab -->
          <div v-else-if="activeTab === 'insights'" class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900">Key Insights</h3>
              <button
                v-if="authStore.canEdit && !showInsightForm"
                class="btn-ghost text-sm"
                @click="showInsightForm = true"
              >
                + Add Insight
              </button>
            </div>

            <!-- Add Insight Form -->
            <div v-if="showInsightForm" class="card p-4 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Category</label>
                  <select v-model="insightForm.category" class="input">
                    <option v-for="(config, cat) in insightCategoryConfig" :key="cat" :value="cat">
                      {{ config.label }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="label">Priority</label>
                  <select v-model="insightForm.priority" class="input">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="label">Insight</label>
                <textarea v-model="insightForm.content" class="input min-h-[80px]" placeholder="What's the key learning?" />
              </div>
              <div class="flex gap-2 justify-end">
                <button class="btn-ghost text-sm" @click="showInsightForm = false; resetInsightForm()">Cancel</button>
                <button class="btn-primary text-sm" :disabled="!insightForm.content.trim()" @click="addInsight">
                  Add Insight
                </button>
              </div>
            </div>

            <!-- Insights List -->
            <div v-if="selectedPartner.insights.length === 0" class="text-sm text-gray-400 text-center py-8">
              No insights recorded yet.
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="insight in selectedPartner.insights.slice().sort((a, b) => {
                  const priorityOrder = { high: 0, medium: 1, low: 2 }
                  return priorityOrder[a.priority] - priorityOrder[b.priority]
                })"
                :key="insight.id"
                class="card p-3 group"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                      <span :class="['text-xs px-2 py-0.5 rounded-full', insightCategoryConfig[insight.category]?.color || 'bg-gray-100 text-gray-600']">
                        {{ insightCategoryConfig[insight.category]?.label || insight.category }}
                      </span>
                      <span :class="['text-xs px-2 py-0.5 rounded-full', priorityConfig[insight.priority]?.color || 'bg-gray-100 text-gray-600']">
                        {{ priorityConfig[insight.priority]?.label || insight.priority }}
                      </span>
                    </div>
                    <p class="text-sm text-gray-700">{{ insight.content }}</p>
                  </div>
                  <button
                    v-if="authStore.canEdit"
                    class="p-1.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="removeInsight(insight.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="flex-1 flex items-center justify-center bg-gray-50">
        <div class="text-center">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-200 flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 mb-1">Select a Design Partner</h3>
          <p class="text-gray-500">Choose a partner from the list to view details</p>
        </div>
      </div>
    </div>

    <!-- Create Partner Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div class="p-6 border-b border-gray-200">
          <h2 class="text-xl font-semibold text-gray-900">Add Design Partner</h2>
          <p class="text-sm text-gray-500 mt-1">Add a new design partner to track engagements and feedback</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Partner / Company Name *</label>
              <input v-model="partnerForm.name" class="input" placeholder="e.g., Fire Dept A" />
            </div>
            <div>
              <label class="label">Contact Name *</label>
              <input v-model="partnerForm.contactName" class="input" placeholder="e.g., John Smith" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Email</label>
              <input v-model="partnerForm.contactEmail" type="email" class="input" placeholder="email@example.com" />
            </div>
            <div>
              <label class="label">Role / Title</label>
              <input v-model="partnerForm.contactRole" class="input" placeholder="e.g., Fire Chief" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Status</label>
              <select v-model="partnerForm.status" class="input">
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
              </select>
            </div>
            <div>
              <label class="label">Customer Archetype</label>
              <select v-model="partnerForm.archetypeId" class="input">
                <option value="">None</option>
                <option v-for="arch in archetypesStore.archetypes" :key="arch.id" :value="arch.id">
                  {{ arch.name }}
                </option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Notes</label>
            <textarea v-model="partnerForm.notes" class="input" placeholder="Any initial notes..." />
          </div>
        </div>
        <div class="p-6 border-t border-gray-200 bg-gray-50 flex gap-3 justify-end">
          <button class="btn-ghost" @click="showCreateModal = false; resetPartnerForm()">Cancel</button>
          <button
            class="btn-primary"
            :disabled="!partnerForm.name.trim() || !partnerForm.contactName.trim()"
            @click="createPartner"
          >
            Add Partner
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
