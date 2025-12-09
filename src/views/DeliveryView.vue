<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDeliveryStore } from '@/stores/delivery'
import { useDiscoveryStore } from '@/stores/discovery'
import { useFocusAreasStore } from '@/stores/focusAreas'

const authStore = useAuthStore()
const deliveryStore = useDeliveryStore()
const discoveryStore = useDiscoveryStore()
const focusAreasStore = useFocusAreasStore()

const showAddChangelog = ref(false)
const showAddBlocker = ref(false)
const expandedEntryId = ref<string | null>(null)
const linkingHypothesesForEntry = ref<string | null>(null)
const selectedHypothesisIds = ref<string[]>([])

type EntryType = 'feature' | 'fix' | 'improvement' | 'technical'

const changelogForm = ref({
  title: '',
  description: '',
  type: 'feature' as EntryType,
  focusAreaId: '',
  validatedHypothesisIds: [] as string[],
})

const blockerForm = ref({
  title: '',
  description: '',
  owner: '',
})

const entryTypes: { value: EntryType; label: string; class: string }[] = [
  { value: 'feature', label: 'Feature', class: 'badge-green' },
  { value: 'fix', label: 'Fix', class: 'badge-red' },
  { value: 'improvement', label: 'Improvement', class: 'badge-blue' },
  { value: 'technical', label: 'Technical', class: 'badge-gray' },
]

onMounted(() => {
  deliveryStore.subscribe()
  discoveryStore.subscribe()
  focusAreasStore.subscribe()
})

onUnmounted(() => {
  deliveryStore.unsubscribe()
  discoveryStore.unsubscribe()
  focusAreasStore.unsubscribe()
})

async function handleSubmitChangelog() {
  await deliveryStore.addChangelogEntry({
    title: changelogForm.value.title,
    description: changelogForm.value.description,
    type: changelogForm.value.type,
    focusAreaId: changelogForm.value.focusAreaId || undefined,
    validatedHypothesisIds: changelogForm.value.validatedHypothesisIds.length > 0
      ? changelogForm.value.validatedHypothesisIds
      : undefined,
  })
  changelogForm.value = { title: '', description: '', type: 'feature', focusAreaId: '', validatedHypothesisIds: [] }
  showAddChangelog.value = false
}

async function handleDeleteChangelog(id: string) {
  if (!confirm('Delete this changelog entry?')) return
  await deliveryStore.deleteChangelogEntry(id)
}

async function handleSubmitBlocker() {
  await deliveryStore.addBlocker({
    title: blockerForm.value.title,
    description: blockerForm.value.description,
    owner: blockerForm.value.owner,
  })
  blockerForm.value = { title: '', description: '', owner: '' }
  showAddBlocker.value = false
}

async function handleResolveBlocker(id: string) {
  await deliveryStore.resolveBlocker(id)
}

async function handleReopenBlocker(id: string) {
  await deliveryStore.reopenBlocker(id)
}

async function handleDeleteBlocker(id: string) {
  if (!confirm('Delete this blocker?')) return
  await deliveryStore.deleteBlocker(id)
}

function getTypeBadgeClass(type: EntryType) {
  return entryTypes.find((t) => t.value === type)?.class || 'badge-gray'
}

function formatDate(timestamp: { toDate: () => Date } | null) {
  if (!timestamp) return ''
  const date = timestamp.toDate()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function toggleExpandEntry(id: string) {
  expandedEntryId.value = expandedEntryId.value === id ? null : id
}

// Toggle hypothesis selection in form
function toggleHypothesisInForm(hypothesisId: string) {
  const idx = changelogForm.value.validatedHypothesisIds.indexOf(hypothesisId)
  if (idx >= 0) {
    changelogForm.value.validatedHypothesisIds.splice(idx, 1)
  } else {
    changelogForm.value.validatedHypothesisIds.push(hypothesisId)
  }
}

// Linking functions for existing entries
function startLinkingHypotheses(entryId: string) {
  const entry = deliveryStore.changelog.find(c => c.id === entryId)
  linkingHypothesesForEntry.value = entryId
  selectedHypothesisIds.value = entry?.validatedHypothesisIds ? [...entry.validatedHypothesisIds] : []
}

function cancelLinkingHypotheses() {
  linkingHypothesesForEntry.value = null
  selectedHypothesisIds.value = []
}

function toggleHypothesisSelection(hypothesisId: string) {
  const idx = selectedHypothesisIds.value.indexOf(hypothesisId)
  if (idx >= 0) {
    selectedHypothesisIds.value.splice(idx, 1)
  } else {
    selectedHypothesisIds.value.push(hypothesisId)
  }
}

async function saveLinkHypotheses(entryId: string) {
  await deliveryStore.updateChangelogEntry(entryId, {
    validatedHypothesisIds: selectedHypothesisIds.value,
  })
  linkingHypothesesForEntry.value = null
  selectedHypothesisIds.value = []
}

function getHypothesisBelief(id: string) {
  const hypothesis = discoveryStore.hypotheses.find(h => h.id === id)
  return hypothesis?.belief || 'Unknown hypothesis'
}

function getHypothesisStatus(id: string) {
  const hypothesis = discoveryStore.hypotheses.find(h => h.id === id)
  return hypothesis?.status || 'unknown'
}

function getFocusAreaTitle(id?: string) {
  if (!id) return null
  const fa = focusAreasStore.focusAreas.find(f => f.id === id)
  return fa?.title
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'active':
      return 'badge-blue'
    case 'validated':
      return 'badge-green'
    case 'invalidated':
      return 'badge-red'
    case 'parked':
      return 'badge-gray'
    default:
      return 'badge-gray'
  }
}

</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">Technical progress, blockers, and what's shipped.</p>
      <button
        v-if="authStore.canEdit && !showAddChangelog"
        class="btn-primary text-sm"
        @click="showAddChangelog = true"
      >
        Add Entry
      </button>
    </div>

    <!-- Add Changelog Form -->
    <div v-if="showAddChangelog" class="card p-6 space-y-4">
      <h3 class="font-medium text-gray-900">New Changelog Entry</h3>

      <div>
        <label class="label">Title</label>
        <input
          v-model="changelogForm.title"
          class="input"
          placeholder="What shipped?"
        />
      </div>

      <div>
        <label class="label">Description</label>
        <textarea
          v-model="changelogForm.description"
          class="input min-h-[60px]"
          placeholder="Details about this release..."
        />
      </div>

      <div>
        <label class="label">Type</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="type in entryTypes"
            :key="type.value"
            :class="[
              'px-3 py-1.5 text-sm rounded-md border transition-colors',
              changelogForm.type === type.value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            ]"
            @click="changelogForm.type = type.value"
          >
            {{ type.label }}
          </button>
        </div>
      </div>

      <div>
        <label class="label">Related Focus Area (Optional)</label>
        <select v-model="changelogForm.focusAreaId" class="input">
          <option value="">None</option>
          <option
            v-for="fa in focusAreasStore.activeFocusAreas"
            :key="fa.id"
            :value="fa.id"
          >
            {{ fa.title }}
          </option>
        </select>
      </div>

      <div>
        <label class="label">Validated Hypotheses (Optional)</label>
        <p class="text-xs text-gray-500 mb-2">Link this release to hypotheses it validates</p>
        <div v-if="discoveryStore.validatedHypotheses.length > 0" class="space-y-2 max-h-48 overflow-y-auto">
          <div
            v-for="hypothesis in discoveryStore.validatedHypotheses"
            :key="hypothesis.id"
            :class="[
              'p-3 rounded-lg border-2 cursor-pointer transition-colors',
              changelogForm.validatedHypothesisIds.includes(hypothesis.id)
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-gray-300'
            ]"
            @click="toggleHypothesisInForm(hypothesis.id)"
          >
            <div class="flex items-start gap-2">
              <div
                :class="[
                  'w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
                  changelogForm.validatedHypothesisIds.includes(hypothesis.id) ? 'border-green-500 bg-green-500' : 'border-gray-300'
                ]"
              >
                <svg
                  v-if="changelogForm.validatedHypothesisIds.includes(hypothesis.id)"
                  class="w-3 h-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p class="text-sm text-gray-900">{{ hypothesis.belief }}</p>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 italic">No validated hypotheses available to link.</p>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="btn-ghost" @click="showAddChangelog = false">Cancel</button>
        <button
          class="btn-primary"
          :disabled="deliveryStore.saving || !changelogForm.title.trim()"
          @click="handleSubmitChangelog"
        >
          {{ deliveryStore.saving ? 'Saving...' : 'Add Entry' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="deliveryStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Changelog -->
      <section>
        <h2 class="text-sm font-medium text-gray-700 mb-3">
          Changelog ({{ deliveryStore.changelog.length }})
        </h2>

        <div v-if="deliveryStore.changelog.length === 0" class="card p-6 text-center">
          <p class="text-sm text-gray-500">No releases logged yet. Add entries as you ship.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="entry in deliveryStore.changelog"
            :key="entry.id"
            class="card overflow-hidden group"
          >
            <!-- Entry Header - Clickable to expand -->
            <div
              class="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              @click="toggleExpandEntry(entry.id)"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <svg
                      :class="['w-4 h-4 text-gray-400 transition-transform flex-shrink-0', expandedEntryId === entry.id ? 'rotate-90' : '']"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                    <span :class="getTypeBadgeClass(entry.type)">{{ entry.type }}</span>
                    <span class="text-xs text-gray-400">{{ formatDate(entry.shippedAt) }}</span>
                    <span v-if="entry.validatedHypothesisIds && entry.validatedHypothesisIds.length > 0" class="badge-green" title="Linked to validated hypotheses">
                      {{ entry.validatedHypothesisIds.length }} hypothesis{{ entry.validatedHypothesisIds.length !== 1 ? 'es' : '' }}
                    </span>
                    <span v-if="entry.focusAreaId" class="badge-indigo" title="Linked to focus area">
                      focus
                    </span>
                  </div>
                  <h3 class="font-medium text-gray-900 ml-6">{{ entry.title }}</h3>
                  <p v-if="entry.description" class="text-sm text-gray-600 mt-1 ml-6">
                    {{ entry.description }}
                  </p>
                </div>

                <button
                  v-if="authStore.canEdit"
                  class="p-1.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                  @click.stop="handleDeleteChangelog(entry.id)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Expanded Content -->
            <div v-if="expandedEntryId === entry.id" class="border-t bg-gray-50 p-4 space-y-4">
              <!-- Related Focus Area -->
              <div v-if="entry.focusAreaId">
                <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Related Focus Area</h4>
                <RouterLink
                  to="/focus-areas"
                  class="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-md text-sm hover:bg-indigo-100 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  {{ getFocusAreaTitle(entry.focusAreaId) || 'View Focus Area' }}
                </RouterLink>
              </div>

              <!-- Linked Hypotheses -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Validated Hypotheses Shipped
                  </h4>
                  <button
                    v-if="authStore.canEdit && linkingHypothesesForEntry !== entry.id"
                    class="text-xs text-green-600 hover:text-green-700"
                    @click.stop="startLinkingHypotheses(entry.id)"
                  >
                    + Link Hypotheses
                  </button>
                </div>

                <!-- Linking UI -->
                <div v-if="linkingHypothesesForEntry === entry.id" class="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
                  <p class="text-sm text-gray-600">Select validated hypotheses that this release ships:</p>

                  <div class="max-h-64 overflow-y-auto space-y-2">
                    <div
                      v-for="hypothesis in discoveryStore.validatedHypotheses"
                      :key="hypothesis.id"
                      :class="[
                        'p-3 rounded-lg border-2 cursor-pointer transition-colors bg-white',
                        selectedHypothesisIds.includes(hypothesis.id)
                          ? 'border-green-500'
                          : 'border-gray-200 hover:border-gray-300'
                      ]"
                      @click="toggleHypothesisSelection(hypothesis.id)"
                    >
                      <div class="flex items-start gap-2">
                        <div
                          :class="[
                            'w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
                            selectedHypothesisIds.includes(hypothesis.id) ? 'border-green-500 bg-green-500' : 'border-gray-300'
                          ]"
                        >
                          <svg
                            v-if="selectedHypothesisIds.includes(hypothesis.id)"
                            class="w-3 h-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p class="text-sm text-gray-900">{{ hypothesis.belief }}</p>
                      </div>
                    </div>
                  </div>

                  <div v-if="discoveryStore.validatedHypotheses.length === 0" class="text-sm text-gray-500 text-center py-4">
                    No validated hypotheses available. Validate hypotheses in the Discovery Hub first.
                  </div>

                  <div class="flex gap-2 justify-end pt-2">
                    <button class="btn-ghost text-sm" @click.stop="cancelLinkingHypotheses">Cancel</button>
                    <button
                      class="btn-primary text-sm"
                      @click.stop="saveLinkHypotheses(entry.id)"
                    >
                      Save Links ({{ selectedHypothesisIds.length }} selected)
                    </button>
                  </div>
                </div>

                <!-- Display linked hypotheses -->
                <div v-else-if="entry.validatedHypothesisIds && entry.validatedHypothesisIds.length > 0" class="space-y-2">
                  <RouterLink
                    v-for="hypId in entry.validatedHypothesisIds"
                    :key="hypId"
                    to="/discovery"
                    class="block p-3 bg-white rounded-lg border border-gray-200 hover:border-green-300 transition-colors"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <span :class="getStatusBadgeClass(getHypothesisStatus(hypId))">{{ getHypothesisStatus(hypId) }}</span>
                    </div>
                    <p class="text-sm text-gray-700">{{ getHypothesisBelief(hypId) }}</p>
                  </RouterLink>
                </div>

                <p v-else class="text-sm text-gray-400 italic">
                  No hypotheses linked yet. Link validated hypotheses to track what evidence this release ships.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Blockers -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-medium text-gray-700">
            Open Blockers ({{ deliveryStore.openBlockers.length }})
          </h2>
          <button
            v-if="authStore.canEdit && !showAddBlocker"
            class="btn-ghost text-sm"
            @click="showAddBlocker = true"
          >
            + Add Blocker
          </button>
        </div>

        <!-- Add blocker form -->
        <div v-if="showAddBlocker" class="card p-4 mb-4 space-y-3">
          <div>
            <label class="label">Title</label>
            <input
              v-model="blockerForm.title"
              class="input"
              placeholder="What's blocking progress?"
            />
          </div>
          <div>
            <label class="label">Description</label>
            <textarea
              v-model="blockerForm.description"
              class="input min-h-[60px]"
              placeholder="Details..."
            />
          </div>
          <div>
            <label class="label">Owner</label>
            <input
              v-model="blockerForm.owner"
              class="input"
              placeholder="Who's responsible for resolving this?"
            />
          </div>
          <div class="flex gap-2 justify-end">
            <button class="btn-ghost text-sm" @click="showAddBlocker = false">Cancel</button>
            <button
              class="btn-primary text-sm"
              :disabled="!blockerForm.title.trim()"
              @click="handleSubmitBlocker"
            >
              Add Blocker
            </button>
          </div>
        </div>

        <div v-if="deliveryStore.openBlockers.length === 0 && !showAddBlocker" class="text-sm text-gray-400">
          No open blockers.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="blocker in deliveryStore.openBlockers"
            :key="blocker.id"
            class="card p-3 border-l-4 border-l-red-400 group"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-medium text-gray-900">{{ blocker.title }}</h3>
                  <span v-if="blocker.owner" class="text-xs text-gray-400">
                    Owner: {{ blocker.owner }}
                  </span>
                </div>
                <p v-if="blocker.description" class="text-sm text-gray-600">
                  {{ blocker.description }}
                </p>

                <button
                  v-if="authStore.canEdit"
                  class="text-xs px-2 py-1 mt-2 rounded bg-green-50 text-green-700 hover:bg-green-100"
                  @click="handleResolveBlocker(blocker.id)"
                >
                  Mark Resolved
                </button>
              </div>

              <button
                v-if="authStore.canEdit"
                class="p-1.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                @click="handleDeleteBlocker(blocker.id)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Resolved Blockers -->
      <section v-if="deliveryStore.resolvedBlockers.length > 0">
        <h2 class="text-sm font-medium text-gray-700 mb-3">
          Resolved Blockers ({{ deliveryStore.resolvedBlockers.length }})
        </h2>

        <div class="space-y-2">
          <div
            v-for="blocker in deliveryStore.resolvedBlockers"
            :key="blocker.id"
            class="card p-3 bg-gray-50 group"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-medium text-gray-600 line-through">{{ blocker.title }}</h3>
                  <span class="badge-green">resolved</span>
                </div>
              </div>

              <div v-if="authStore.canEdit" class="flex gap-1 opacity-0 group-hover:opacity-100">
                <button
                  class="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                  title="Reopen"
                  @click="handleReopenBlocker(blocker.id)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  class="p-1.5 text-gray-400 hover:text-red-600 rounded"
                  title="Delete"
                  @click="handleDeleteBlocker(blocker.id)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.badge-green {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700;
}
.badge-red {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700;
}
.badge-blue {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700;
}
.badge-gray {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700;
}
.badge-indigo {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700;
}
</style>
