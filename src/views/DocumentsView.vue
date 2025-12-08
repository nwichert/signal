<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDocumentsStore } from '@/stores/documents'
import { useFocusAreasStore } from '@/stores/focusAreas'
import type { DocumentType, KnowledgeCategory, InspirationCategory, Document } from '@/types'

const authStore = useAuthStore()
const documentsStore = useDocumentsStore()
const focusAreasStore = useFocusAreasStore()

// Tab state
const activeTab = ref<DocumentType>('knowledge')

// Upload state
const showUpload = ref(false)
const editingDocumentId = ref<string | null>(null)
const searchQuery = ref('')
const filterCategory = ref<string>('all')
const filterTag = ref<string>('all')
const dragOver = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)

// Form state
const uploadForm = ref({
  name: '',
  description: '',
  documentType: 'knowledge' as DocumentType,
  category: 'reference' as KnowledgeCategory | InspirationCategory,
  tags: [] as string[],
  newTag: '',
  priority: 2 as 1 | 2 | 3,
  externalUrl: '',
  focusAreaIds: [] as string[],
})

const editForm = ref({
  name: '',
  description: '',
  category: 'reference' as KnowledgeCategory | InspirationCategory,
  tags: [] as string[],
  newTag: '',
  priority: 2 as 1 | 2 | 3,
  externalUrl: '',
  focusAreaIds: [] as string[],
})

// URL-only form for inspiration
const showAddLink = ref(false)
const linkForm = ref({
  name: '',
  description: '',
  category: 'article' as InspirationCategory,
  tags: [] as string[],
  newTag: '',
  externalUrl: '',
})

const knowledgeCategories: { value: KnowledgeCategory; label: string; description: string }[] = [
  { value: 'strategy', label: 'Strategy', description: 'Company & product strategy' },
  { value: 'brand', label: 'Brand', description: 'Guidelines, voice & tone' },
  { value: 'research', label: 'Research', description: 'User & market research' },
  { value: 'technical', label: 'Technical', description: 'Specs & architecture' },
  { value: 'process', label: 'Process', description: 'Playbooks & workflows' },
  { value: 'reference', label: 'Reference', description: 'General reference' },
]

const inspirationCategories: { value: InspirationCategory; label: string; description: string }[] = [
  { value: 'ux-pattern', label: 'UX Pattern', description: 'UI/UX examples' },
  { value: 'competitor', label: 'Competitor', description: 'Competitive analysis' },
  { value: 'article', label: 'Article', description: 'Interesting reads' },
  { value: 'visual', label: 'Visual', description: 'Design inspiration' },
  { value: 'product', label: 'Product', description: 'Product ideas' },
  { value: 'other', label: 'Other', description: 'Misc inspiration' },
]

const currentCategories = computed(() =>
  activeTab.value === 'knowledge' ? knowledgeCategories : inspirationCategories
)

const filteredDocuments = computed(() => {
  let result = activeTab.value === 'knowledge'
    ? [...documentsStore.knowledgeDocuments]
    : [...documentsStore.inspirationDocuments]

  // Search filter
  if (searchQuery.value.trim()) {
    const term = searchQuery.value.toLowerCase()
    result = result.filter(
      (doc) =>
        doc.name.toLowerCase().includes(term) ||
        doc.description.toLowerCase().includes(term) ||
        doc.tags.some((tag) => tag.toLowerCase().includes(term)) ||
        (doc.summary && doc.summary.toLowerCase().includes(term))
    )
  }

  // Category filter
  if (filterCategory.value !== 'all') {
    result = result.filter((d) => d.category === filterCategory.value)
  }

  // Tag filter
  if (filterTag.value !== 'all') {
    result = result.filter((d) => d.tags.includes(filterTag.value))
  }

  // Sort by priority for knowledge, by date for inspiration
  if (activeTab.value === 'knowledge') {
    result.sort((a, b) => (a.priority || 3) - (b.priority || 3))
  }

  return result
})

const currentTags = computed(() => documentsStore.getTagsByType(activeTab.value))

onMounted(() => {
  documentsStore.subscribe()
  focusAreasStore.subscribe()
})

onUnmounted(() => {
  documentsStore.unsubscribe()
  focusAreasStore.unsubscribe()
})

function switchTab(tab: DocumentType) {
  activeTab.value = tab
  filterCategory.value = 'all'
  filterTag.value = 'all'
  searchQuery.value = ''
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectFile(target.files[0])
  }
}

function selectFile(file: File) {
  selectedFile.value = file
  if (!uploadForm.value.name) {
    uploadForm.value.name = file.name.replace(/\.[^/.]+$/, '')
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function handleDragLeave() {
  dragOver.value = false
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false
  if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
    selectFile(event.dataTransfer.files[0])
  }
}

function addTagToUpload() {
  if (uploadForm.value.newTag.trim() && !uploadForm.value.tags.includes(uploadForm.value.newTag.trim())) {
    uploadForm.value.tags.push(uploadForm.value.newTag.trim())
    uploadForm.value.newTag = ''
  }
}

function removeTagFromUpload(tag: string) {
  uploadForm.value.tags = uploadForm.value.tags.filter((t) => t !== tag)
}

function addTagToEdit() {
  if (editForm.value.newTag.trim() && !editForm.value.tags.includes(editForm.value.newTag.trim())) {
    editForm.value.tags.push(editForm.value.newTag.trim())
    editForm.value.newTag = ''
  }
}

function removeTagFromEdit(tag: string) {
  editForm.value.tags = editForm.value.tags.filter((t) => t !== tag)
}

function addTagToLink() {
  if (linkForm.value.newTag.trim() && !linkForm.value.tags.includes(linkForm.value.newTag.trim())) {
    linkForm.value.tags.push(linkForm.value.newTag.trim())
    linkForm.value.newTag = ''
  }
}

function removeTagFromLink(tag: string) {
  linkForm.value.tags = linkForm.value.tags.filter((t) => t !== tag)
}

async function handleUpload() {
  if (!selectedFile.value || !uploadForm.value.name.trim()) return

  await documentsStore.uploadDocument(selectedFile.value, {
    name: uploadForm.value.name,
    description: uploadForm.value.description,
    documentType: uploadForm.value.documentType,
    category: uploadForm.value.category,
    tags: uploadForm.value.tags,
    priority: uploadForm.value.priority,
    externalUrl: uploadForm.value.externalUrl.trim() || undefined,
    focusAreaIds: uploadForm.value.focusAreaIds.length > 0 ? uploadForm.value.focusAreaIds : undefined,
  })

  resetUploadForm()
  showUpload.value = false
}

async function handleAddLink() {
  if (!linkForm.value.name.trim() || !linkForm.value.externalUrl.trim()) return

  await documentsStore.addInspirationLink({
    name: linkForm.value.name,
    description: linkForm.value.description,
    category: linkForm.value.category,
    tags: linkForm.value.tags,
    externalUrl: linkForm.value.externalUrl,
  })

  resetLinkForm()
  showAddLink.value = false
}

function resetUploadForm() {
  selectedFile.value = null
  uploadForm.value = {
    name: '',
    description: '',
    documentType: activeTab.value,
    category: activeTab.value === 'knowledge' ? 'reference' : 'article',
    tags: [],
    newTag: '',
    priority: 2,
    externalUrl: '',
    focusAreaIds: [],
  }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function resetLinkForm() {
  linkForm.value = {
    name: '',
    description: '',
    category: 'article',
    tags: [],
    newTag: '',
    externalUrl: '',
  }
}

function openUploadForm() {
  uploadForm.value.documentType = activeTab.value
  uploadForm.value.category = activeTab.value === 'knowledge' ? 'reference' : 'article'
  showUpload.value = true
}

function startEditDocument(document: Document) {
  editingDocumentId.value = document.id
  editForm.value = {
    name: document.name,
    description: document.description,
    category: document.category,
    tags: [...document.tags],
    newTag: '',
    priority: document.priority || 2,
    externalUrl: document.externalUrl || '',
    focusAreaIds: document.focusAreaIds || [],
  }
}

async function handleUpdateDocument() {
  if (!editingDocumentId.value) return

  await documentsStore.updateDocument(editingDocumentId.value, {
    name: editForm.value.name,
    description: editForm.value.description,
    category: editForm.value.category,
    tags: editForm.value.tags,
    priority: editForm.value.priority,
    externalUrl: editForm.value.externalUrl.trim() || undefined,
    focusAreaIds: editForm.value.focusAreaIds.length > 0 ? editForm.value.focusAreaIds : undefined,
  })

  editingDocumentId.value = null
}

async function handleDeleteDocument(id: string) {
  if (!confirm('Delete this document? This will also remove the file from storage.')) return
  await documentsStore.deleteDocument(id)
}

async function handlePriorityChange(id: string, priority: 1 | 2 | 3) {
  await documentsStore.updatePriority(id, priority)
}

function formatDate(timestamp: { toDate: () => Date } | null | undefined) {
  if (!timestamp) return ''
  const date = timestamp.toDate()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isImageFile(fileType: string): boolean {
  return fileType.startsWith('image/')
}
</script>

<template>
  <div class="space-y-6">
    <!-- Hero header -->
    <div class="bg-gradient-to-br from-slate-50 to-indigo-50 -mx-6 -mt-6 px-6 py-8 border-b border-slate-200">
      <div class="max-w-3xl">
        <p class="text-gray-600 leading-relaxed">
          Your team's knowledge center. Upload reference documents to inform AI-powered features across Signal,
          and save inspiring examples to fuel ideation.
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
      <button
        :class="[
          'px-4 py-2 text-sm font-medium rounded-md transition-colors',
          activeTab === 'knowledge'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        ]"
        @click="switchTab('knowledge')"
      >
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Knowledge
          <span class="text-xs text-gray-400">({{ documentsStore.knowledgeDocuments.length }})</span>
        </div>
      </button>
      <button
        :class="[
          'px-4 py-2 text-sm font-medium rounded-md transition-colors',
          activeTab === 'inspiration'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        ]"
        @click="switchTab('inspiration')"
      >
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Inspiration
          <span class="text-xs text-gray-400">({{ documentsStore.inspirationDocuments.length }})</span>
        </div>
      </button>
    </div>

    <!-- Tab description + actions -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <p class="text-sm text-gray-500">
        <template v-if="activeTab === 'knowledge'">
          Reference documents that inform AI enrichment across the platform. High-priority docs get more weight.
        </template>
        <template v-else>
          Screenshots, articles, and links that spark ideas. Save what inspires you.
        </template>
      </p>
      <div class="flex gap-2">
        <button
          v-if="authStore.canEdit && activeTab === 'inspiration' && !showAddLink && !showUpload"
          class="btn-ghost text-sm flex items-center gap-1"
          @click="showAddLink = true"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Add Link
        </button>
        <button
          v-if="authStore.canEdit && !showUpload && !showAddLink"
          class="btn-primary text-sm flex items-center gap-1"
          @click="openUploadForm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload {{ activeTab === 'knowledge' ? 'Document' : 'File' }}
        </button>
      </div>
    </div>

    <!-- Search and Filters -->
    <div class="flex flex-wrap gap-3">
      <div class="flex-1 min-w-[200px]">
        <input
          v-model="searchQuery"
          class="input"
          :placeholder="`Search ${activeTab} documents...`"
        />
      </div>
      <div>
        <select v-model="filterCategory" class="input">
          <option value="all">All Categories</option>
          <option v-for="c in currentCategories" :key="c.value" :value="c.value">
            {{ c.label }}
          </option>
        </select>
      </div>
      <div v-if="currentTags.length > 0">
        <select v-model="filterTag" class="input">
          <option value="all">All Tags</option>
          <option v-for="tag in currentTags" :key="tag" :value="tag">
            {{ tag }}
          </option>
        </select>
      </div>
    </div>

    <!-- Add Link Form (Inspiration only) -->
    <div v-if="showAddLink" class="card p-6 space-y-4 border-pink-200 bg-gradient-to-br from-white to-pink-50/30">
      <h3 class="font-medium text-gray-900">Save Inspiration Link</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="label">URL</label>
          <input
            v-model="linkForm.externalUrl"
            class="input"
            type="url"
            placeholder="https://..."
          />
        </div>

        <div class="md:col-span-2">
          <label class="label">Title</label>
          <input
            v-model="linkForm.name"
            class="input"
            placeholder="What is this?"
          />
        </div>

        <div class="md:col-span-2">
          <label class="label">Why it's interesting</label>
          <textarea
            v-model="linkForm.description"
            class="input min-h-[60px]"
            placeholder="What caught your attention?"
          />
        </div>

        <div>
          <label class="label">Category</label>
          <select v-model="linkForm.category" class="input">
            <option v-for="c in inspirationCategories" :key="c.value" :value="c.value">
              {{ c.label }}
            </option>
          </select>
        </div>

        <div>
          <label class="label">Tags</label>
          <div class="flex gap-2">
            <input
              v-model="linkForm.newTag"
              class="input flex-1"
              placeholder="Add tag..."
              @keydown.enter.prevent="addTagToLink"
            />
            <button type="button" class="btn-ghost" @click="addTagToLink">Add</button>
          </div>
          <div v-if="linkForm.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="tag in linkForm.tags"
              :key="tag"
              class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
            >
              {{ tag }}
              <button type="button" class="hover:text-red-600" @click="removeTagFromLink(tag)">&times;</button>
            </span>
          </div>
        </div>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="btn-ghost" @click="showAddLink = false; resetLinkForm()">Cancel</button>
        <button
          class="btn-primary"
          :disabled="!linkForm.name.trim() || !linkForm.externalUrl.trim()"
          @click="handleAddLink"
        >
          Save Link
        </button>
      </div>
    </div>

    <!-- Upload Form -->
    <div v-if="showUpload" class="card p-6 space-y-4">
      <h3 class="font-medium text-gray-900">
        Upload {{ activeTab === 'knowledge' ? 'Knowledge Document' : 'Inspiration' }}
      </h3>

      <!-- Drop Zone -->
      <div
        :class="[
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
          dragOver ? 'border-accent-500 bg-accent-50' : 'border-gray-300 hover:border-gray-400',
          selectedFile ? 'bg-green-50 border-green-300' : ''
        ]"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          :accept="activeTab === 'knowledge' ? '.pdf,.doc,.docx,.txt,.pages,.md,.pptx,.ppt,.xlsx,.xls' : 'image/*,.pdf'"
          @change="handleFileSelect"
        />

        <div v-if="selectedFile" class="space-y-2">
          <svg class="w-12 h-12 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <p class="text-sm font-medium text-gray-900">{{ selectedFile.name }}</p>
          <p class="text-xs text-gray-500">{{ documentsStore.formatFileSize(selectedFile.size) }}</p>
          <button type="button" class="text-xs text-red-600 hover:text-red-700" @click="selectedFile = null">
            Remove
          </button>
        </div>

        <div v-else class="space-y-2">
          <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p class="text-sm text-gray-600">
            Drag and drop a file here, or
            <button type="button" class="text-accent-600 hover:text-accent-700 font-medium" @click="fileInput?.click()">
              browse
            </button>
          </p>
          <p class="text-xs text-gray-400">
            <template v-if="activeTab === 'knowledge'">PDF, DOC, TXT, PPTX, XLSX, and more</template>
            <template v-else>Images and PDFs</template>
          </p>
        </div>
      </div>

      <!-- Document Details -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="label">Name</label>
          <input v-model="uploadForm.name" class="input" placeholder="Give this a descriptive name" />
        </div>

        <div class="md:col-span-2">
          <label class="label">Description</label>
          <textarea
            v-model="uploadForm.description"
            class="input min-h-[60px]"
            :placeholder="activeTab === 'knowledge' ? 'What context does this provide?' : 'Why is this inspiring?'"
          />
        </div>

        <div>
          <label class="label">Category</label>
          <select v-model="uploadForm.category" class="input">
            <option v-for="c in currentCategories" :key="c.value" :value="c.value">
              {{ c.label }} - {{ c.description }}
            </option>
          </select>
        </div>

        <div v-if="activeTab === 'knowledge'">
          <label class="label">Priority</label>
          <select v-model="uploadForm.priority" class="input">
            <option :value="1">High - Core context for AI</option>
            <option :value="2">Medium - Helpful reference</option>
            <option :value="3">Low - Background info</option>
          </select>
        </div>

        <div>
          <label class="label">Tags</label>
          <div class="flex gap-2">
            <input
              v-model="uploadForm.newTag"
              class="input flex-1"
              placeholder="Add a tag..."
              @keydown.enter.prevent="addTagToUpload"
            />
            <button type="button" class="btn-ghost" @click="addTagToUpload">Add</button>
          </div>
          <div v-if="uploadForm.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="tag in uploadForm.tags"
              :key="tag"
              class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
            >
              {{ tag }}
              <button type="button" class="hover:text-red-600" @click="removeTagFromUpload(tag)">&times;</button>
            </span>
          </div>
        </div>

        <div v-if="activeTab === 'knowledge' && focusAreasStore.activeFocusAreas.length > 0">
          <label class="label">Related Focus Areas</label>
          <select v-model="uploadForm.focusAreaIds" class="input" multiple>
            <option v-for="fa in focusAreasStore.activeFocusAreas" :key="fa.id" :value="fa.id">
              {{ fa.title }}
            </option>
          </select>
          <p class="text-xs text-gray-400 mt-1">Hold Cmd/Ctrl to select multiple</p>
        </div>

        <div class="md:col-span-2">
          <label class="label">External URL <span class="text-gray-400 font-normal">(optional)</span></label>
          <input
            v-model="uploadForm.externalUrl"
            class="input"
            type="url"
            placeholder="https://docs.google.com/... or https://notion.so/..."
          />
        </div>
      </div>

      <!-- Upload Progress -->
      <div v-if="documentsStore.uploading" class="space-y-2">
        <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-accent-500 transition-all"
            :style="{ width: `${documentsStore.uploadProgress}%` }"
          />
        </div>
        <p class="text-xs text-gray-500 text-center">Uploading... {{ documentsStore.uploadProgress }}%</p>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="btn-ghost" @click="showUpload = false; resetUploadForm()">Cancel</button>
        <button
          class="btn-primary"
          :disabled="documentsStore.uploading || !selectedFile || !uploadForm.name.trim()"
          @click="handleUpload"
        >
          {{ documentsStore.uploading ? 'Uploading...' : 'Upload' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="documentsStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- Priority Knowledge Docs callout (knowledge tab only) -->
      <div v-if="activeTab === 'knowledge' && documentsStore.priorityKnowledgeDocs.length > 0" class="card p-4 bg-amber-50 border-amber-200">
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          <span class="text-sm font-medium text-amber-800">{{ documentsStore.priorityKnowledgeDocs.length }} high-priority docs informing AI</span>
        </div>
        <p class="text-xs text-amber-700">These documents get more weight when enriching strategic context, generating insights, and more.</p>
      </div>

      <!-- No documents -->
      <div v-if="filteredDocuments.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path v-if="activeTab === 'knowledge'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p class="text-sm text-gray-500">
          <template v-if="activeTab === 'knowledge'">No knowledge documents yet.</template>
          <template v-else>No inspiration saved yet.</template>
        </p>
        <p class="text-xs text-gray-400 mt-1">
          <template v-if="activeTab === 'knowledge'">Upload strategy docs, brand guidelines, research, and more.</template>
          <template v-else>Save screenshots, articles, and links that inspire you.</template>
        </p>
      </div>

      <!-- Documents Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="document in filteredDocuments"
          :key="document.id"
          class="card p-4 group hover:border-gray-300 transition-colors"
        >
          <!-- Edit Mode -->
          <div v-if="editingDocumentId === document.id" class="space-y-3">
            <input v-model="editForm.name" class="input" placeholder="Document name" />
            <textarea v-model="editForm.description" class="input min-h-[60px]" placeholder="Description" />
            <select v-model="editForm.category" class="input">
              <option v-for="c in currentCategories" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
            <div v-if="activeTab === 'knowledge'">
              <select v-model="editForm.priority" class="input">
                <option :value="1">High Priority</option>
                <option :value="2">Medium Priority</option>
                <option :value="3">Low Priority</option>
              </select>
            </div>
            <div>
              <div class="flex gap-2">
                <input v-model="editForm.newTag" class="input flex-1 text-sm" placeholder="Add tag..." @keydown.enter.prevent="addTagToEdit" />
                <button type="button" class="btn-ghost text-sm" @click="addTagToEdit">Add</button>
              </div>
              <div v-if="editForm.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                <span v-for="tag in editForm.tags" :key="tag" class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                  {{ tag }}
                  <button type="button" class="hover:text-red-600" @click="removeTagFromEdit(tag)">&times;</button>
                </span>
              </div>
            </div>
            <input v-model="editForm.externalUrl" class="input text-sm" type="url" placeholder="External URL (optional)" />
            <div class="flex gap-2 justify-end">
              <button class="btn-ghost text-sm" @click="editingDocumentId = null">Cancel</button>
              <button class="btn-primary text-sm" @click="handleUpdateDocument">Save</button>
            </div>
          </div>

          <!-- Display Mode -->
          <div v-else>
            <div class="flex items-start gap-3">
              <!-- File Icon / Image Preview -->
              <div v-if="isImageFile(document.fileType) && document.storageUrl" class="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                <img :src="document.storageUrl" :alt="document.name" class="w-full h-full object-cover" />
              </div>
              <div v-else class="p-2 bg-gray-100 rounded-lg flex-shrink-0">
                <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="documentsStore.getFileIcon(document.fileType)" />
                </svg>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 class="font-medium text-gray-900 truncate">{{ document.name }}</h3>
                  <!-- Priority badge for knowledge docs -->
                  <span
                    v-if="activeTab === 'knowledge' && document.priority"
                    :class="['text-xs px-1.5 py-0.5 rounded', documentsStore.getPriorityBadgeClass(document.priority)]"
                  >
                    {{ documentsStore.getPriorityLabel(document.priority) }}
                  </span>
                </div>
                <span :class="documentsStore.getCategoryBadgeClass(document.category)" class="text-xs">
                  {{ document.category }}
                </span>
              </div>
            </div>

            <p v-if="document.description" class="text-sm text-gray-600 mt-2 line-clamp-2">
              {{ document.description }}
            </p>

            <!-- Tags -->
            <div v-if="document.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
              <span v-for="tag in document.tags" :key="tag" class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                {{ tag }}
              </span>
            </div>

            <!-- External URL indicator -->
            <div v-if="document.externalUrl" class="flex items-center gap-1.5 mt-2 text-xs text-indigo-600">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span class="truncate">Has external link</span>
            </div>

            <!-- File info -->
            <div class="flex items-center gap-3 mt-3 text-xs text-gray-400">
              <span v-if="document.fileSize">{{ documentsStore.formatFileSize(document.fileSize) }}</span>
              <span>{{ formatDate(document.createdAt) }}</span>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <a
                v-if="document.storageUrl"
                :href="document.storageUrl"
                target="_blank"
                class="text-xs px-3 py-1.5 rounded bg-accent-500 text-white hover:bg-accent-600"
              >
                {{ isImageFile(document.fileType) ? 'View' : 'Download' }}
              </a>
              <a
                v-if="document.externalUrl"
                :href="document.externalUrl"
                target="_blank"
                class="text-xs px-3 py-1.5 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
              >
                Open Link
              </a>
              <!-- Quick priority change for knowledge docs -->
              <select
                v-if="authStore.canEdit && activeTab === 'knowledge'"
                :value="document.priority"
                class="text-xs px-2 py-1 rounded border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                @change="handlePriorityChange(document.id, Number(($event.target as HTMLSelectElement).value) as 1 | 2 | 3)"
              >
                <option :value="1">High</option>
                <option :value="2">Medium</option>
                <option :value="3">Low</option>
              </select>
              <button
                v-if="authStore.canEdit"
                class="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                @click="startEditDocument(document)"
              >
                Edit
              </button>
              <button
                v-if="authStore.canEdit"
                class="text-xs px-3 py-1.5 rounded text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                @click="handleDeleteDocument(document.id)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Document count -->
      <div class="text-xs text-gray-400 text-center">
        {{ filteredDocuments.length }} {{ activeTab === 'knowledge' ? 'document' : 'item' }}{{ filteredDocuments.length !== 1 ? 's' : '' }}
      </div>
    </template>

    <!-- Error display -->
    <div v-if="documentsStore.error" class="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
      {{ documentsStore.error }}
    </div>
  </div>
</template>

<style scoped>
.badge-indigo {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700;
}
.badge-purple {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700;
}
.badge-blue {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700;
}
.badge-gray {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700;
}
.badge-green {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700;
}
.badge-yellow {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700;
}
.badge-pink {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-pink-100 text-pink-700;
}
.badge-red {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700;
}
.badge-teal {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-teal-100 text-teal-700;
}
</style>
