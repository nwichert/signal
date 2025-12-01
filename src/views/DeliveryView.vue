<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDeliveryStore } from '@/stores/delivery'

const authStore = useAuthStore()
const deliveryStore = useDeliveryStore()

const showAddChangelog = ref(false)
const showAddBlocker = ref(false)

type EntryType = 'feature' | 'fix' | 'improvement' | 'technical'

const changelogForm = ref({
  title: '',
  description: '',
  type: 'feature' as EntryType,
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
})

onUnmounted(() => {
  deliveryStore.unsubscribe()
})

async function handleSubmitChangelog() {
  await deliveryStore.addChangelogEntry({
    title: changelogForm.value.title,
    description: changelogForm.value.description,
    type: changelogForm.value.type,
  })
  changelogForm.value = { title: '', description: '', type: 'feature' }
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
            class="card p-4 group"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span :class="getTypeBadgeClass(entry.type)">{{ entry.type }}</span>
                  <span class="text-xs text-gray-400">{{ formatDate(entry.shippedAt) }}</span>
                </div>
                <h3 class="font-medium text-gray-900">{{ entry.title }}</h3>
                <p v-if="entry.description" class="text-sm text-gray-600 mt-1">
                  {{ entry.description }}
                </p>
              </div>

              <button
                v-if="authStore.canEdit"
                class="p-1.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                @click="handleDeleteChangelog(entry.id)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
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
