<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDocumentsStore } from '@/stores/documents'
import type { DocumentCategory, Document } from '@/types'

const authStore = useAuthStore()
const documentsStore = useDocumentsStore()

const showUpload = ref(false)
const editingDocumentId = ref<string | null>(null)
const searchQuery = ref('')
const filterCategory = ref<DocumentCategory | 'all'>('all')
const filterTag = ref<string | 'all'>('all')
const dragOver = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)

const uploadForm = ref({
  name: '',
  description: '',
  category: 'other' as DocumentCategory,
  tags: [] as string[],
  newTag: '',
  externalUrl: '',
})

const editForm = ref({
  name: '',
  description: '',
  category: 'other' as DocumentCategory,
  tags: [] as string[],
  newTag: '',
  externalUrl: '',
})

const categories: { value: DocumentCategory; label: string }[] = [
  { value: 'research', label: 'Research' },
  { value: 'design', label: 'Design' },
  { value: 'technical', label: 'Technical' },
  { value: 'business', label: 'Business' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
]

const filteredDocuments = computed(() => {
  let result = [...documentsStore.documents]

  // Search filter
  if (searchQuery.value.trim()) {
    result = documentsStore.searchDocuments(searchQuery.value)
  }

  // Category filter
  if (filterCategory.value !== 'all') {
    result = result.filter((d) => d.category === filterCategory.value)
  }

  // Tag filter
  if (filterTag.value !== 'all') {
    result = result.filter((d) => d.tags.includes(filterTag.value))
  }

  return result
})

onMounted(() => {
  documentsStore.subscribe()
})

onUnmounted(() => {
  documentsStore.unsubscribe()
})

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectFile(target.files[0])
  }
}

function selectFile(file: File) {
  selectedFile.value = file
  // Auto-fill name from filename if empty
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

async function handleUpload() {
  if (!selectedFile.value || !uploadForm.value.name.trim()) return

  await documentsStore.uploadDocument(selectedFile.value, {
    name: uploadForm.value.name,
    description: uploadForm.value.description,
    category: uploadForm.value.category,
    tags: uploadForm.value.tags,
    externalUrl: uploadForm.value.externalUrl.trim() || undefined,
  })

  resetUploadForm()
  showUpload.value = false
}

function resetUploadForm() {
  selectedFile.value = null
  uploadForm.value = {
    name: '',
    description: '',
    category: 'other',
    tags: [],
    newTag: '',
    externalUrl: '',
  }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function startEditDocument(document: Document) {
  editingDocumentId.value = document.id
  editForm.value = {
    name: document.name,
    description: document.description,
    category: document.category,
    tags: [...document.tags],
    newTag: '',
    externalUrl: document.externalUrl || '',
  }
}

async function handleUpdateDocument() {
  if (!editingDocumentId.value) return

  await documentsStore.updateDocument(editingDocumentId.value, {
    name: editForm.value.name,
    description: editForm.value.description,
    category: editForm.value.category,
    tags: editForm.value.tags,
    externalUrl: editForm.value.externalUrl.trim() || undefined,
  })

  editingDocumentId.value = null
}

async function handleDeleteDocument(id: string) {
  if (!confirm('Delete this document? This will also remove the file from storage.')) return
  await documentsStore.deleteDocument(id)
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p class="text-sm text-gray-500">Central repository for supporting artifacts and files.</p>
      </div>
      <button
        v-if="authStore.canEdit && !showUpload"
        class="btn-primary text-sm"
        @click="showUpload = true"
      >
        Upload Document
      </button>
    </div>

    <!-- Search and Filters -->
    <div class="flex flex-wrap gap-3">
      <div class="flex-1 min-w-[200px]">
        <input
          v-model="searchQuery"
          class="input"
          placeholder="Search documents..."
        />
      </div>
      <div>
        <select v-model="filterCategory" class="input">
          <option value="all">All Categories</option>
          <option v-for="c in categories" :key="c.value" :value="c.value">
            {{ c.label }}
          </option>
        </select>
      </div>
      <div v-if="documentsStore.allTags.length > 0">
        <select v-model="filterTag" class="input">
          <option value="all">All Tags</option>
          <option v-for="tag in documentsStore.allTags" :key="tag" :value="tag">
            {{ tag }}
          </option>
        </select>
      </div>
    </div>

    <!-- Upload Form -->
    <div v-if="showUpload" class="card p-6 space-y-4">
      <h3 class="font-medium text-gray-900">Upload Document</h3>

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
          @change="handleFileSelect"
        />

        <div v-if="selectedFile" class="space-y-2">
          <svg class="w-12 h-12 mx-auto text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <p class="text-sm font-medium text-gray-900">{{ selectedFile.name }}</p>
          <p class="text-xs text-gray-500">{{ documentsStore.formatFileSize(selectedFile.size) }}</p>
          <button
            type="button"
            class="text-xs text-red-600 hover:text-red-700"
            @click="selectedFile = null"
          >
            Remove
          </button>
        </div>

        <div v-else class="space-y-2">
          <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p class="text-sm text-gray-600">
            Drag and drop a file here, or
            <button
              type="button"
              class="text-accent-600 hover:text-accent-700 font-medium"
              @click="fileInput?.click()"
            >
              browse
            </button>
          </p>
          <p class="text-xs text-gray-400">PDF, DOC, XLS, PPT, images, and more</p>
        </div>
      </div>

      <!-- Document Details -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="label">Document Name</label>
          <input
            v-model="uploadForm.name"
            class="input"
            placeholder="Give this document a descriptive name"
          />
        </div>

        <div class="md:col-span-2">
          <label class="label">Description</label>
          <textarea
            v-model="uploadForm.description"
            class="input min-h-[60px]"
            placeholder="What is this document about?"
          />
        </div>

        <div>
          <label class="label">Category</label>
          <select v-model="uploadForm.category" class="input">
            <option v-for="c in categories" :key="c.value" :value="c.value">
              {{ c.label }}
            </option>
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
            <button
              type="button"
              class="btn-ghost"
              @click="addTagToUpload"
            >
              Add
            </button>
          </div>
          <div v-if="uploadForm.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="tag in uploadForm.tags"
              :key="tag"
              class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
            >
              {{ tag }}
              <button
                type="button"
                class="hover:text-red-600"
                @click="removeTagFromUpload(tag)"
              >
                &times;
              </button>
            </span>
          </div>
        </div>

        <div class="md:col-span-2">
          <label class="label">External URL <span class="text-gray-400 font-normal">(optional)</span></label>
          <input
            v-model="uploadForm.externalUrl"
            class="input"
            type="url"
            placeholder="https://docs.google.com/... or https://notion.so/..."
          />
          <p class="text-xs text-gray-400 mt-1">Link to an external resource like Google Docs, Notion, Figma, etc.</p>
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
        <button class="btn-ghost" @click="showUpload = false; resetUploadForm()">
          Cancel
        </button>
        <button
          class="btn-primary"
          :disabled="documentsStore.uploading || !selectedFile || !uploadForm.name.trim()"
          @click="handleUpload"
        >
          {{ documentsStore.uploading ? 'Uploading...' : 'Upload Document' }}
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="documentsStore.loading" class="text-sm text-gray-500">Loading...</div>

    <template v-else>
      <!-- No documents -->
      <div v-if="filteredDocuments.length === 0" class="card p-6 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-sm text-gray-500">No documents found.</p>
        <p class="text-xs text-gray-400 mt-1">Upload a document to get started.</p>
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
            <input
              v-model="editForm.name"
              class="input"
              placeholder="Document name"
            />
            <textarea
              v-model="editForm.description"
              class="input min-h-[60px]"
              placeholder="Description"
            />
            <select v-model="editForm.category" class="input">
              <option v-for="c in categories" :key="c.value" :value="c.value">
                {{ c.label }}
              </option>
            </select>
            <div>
              <div class="flex gap-2">
                <input
                  v-model="editForm.newTag"
                  class="input flex-1 text-sm"
                  placeholder="Add tag..."
                  @keydown.enter.prevent="addTagToEdit"
                />
                <button
                  type="button"
                  class="btn-ghost text-sm"
                  @click="addTagToEdit"
                >
                  Add
                </button>
              </div>
              <div v-if="editForm.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                <span
                  v-for="tag in editForm.tags"
                  :key="tag"
                  class="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                >
                  {{ tag }}
                  <button
                    type="button"
                    class="hover:text-red-600"
                    @click="removeTagFromEdit(tag)"
                  >
                    &times;
                  </button>
                </span>
              </div>
            </div>
            <input
              v-model="editForm.externalUrl"
              class="input text-sm"
              type="url"
              placeholder="External URL (optional)"
            />
            <div class="flex gap-2 justify-end">
              <button class="btn-ghost text-sm" @click="editingDocumentId = null">Cancel</button>
              <button class="btn-primary text-sm" @click="handleUpdateDocument">Save</button>
            </div>
          </div>

          <!-- Display Mode -->
          <div v-else>
            <div class="flex items-start gap-3">
              <!-- File Icon -->
              <div class="p-2 bg-gray-100 rounded-lg flex-shrink-0">
                <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="documentsStore.getFileIcon(document.fileType)" />
                </svg>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-medium text-gray-900 truncate">{{ document.name }}</h3>
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
              <span
                v-for="tag in document.tags"
                :key="tag"
                class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
              >
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
              <span>{{ documentsStore.formatFileSize(document.fileSize) }}</span>
              <span>{{ formatDate(document.createdAt) }}</span>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <a
                :href="document.storageUrl"
                target="_blank"
                class="text-xs px-3 py-1.5 rounded bg-accent-500 text-white hover:bg-accent-600"
              >
                Download
              </a>
              <a
                v-if="document.externalUrl"
                :href="document.externalUrl"
                target="_blank"
                class="text-xs px-3 py-1.5 rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
              >
                Open Link
              </a>
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
        {{ filteredDocuments.length }} document{{ filteredDocuments.length !== 1 ? 's' : '' }}
      </div>
    </template>

    <!-- Error display -->
    <div v-if="documentsStore.error" class="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
      {{ documentsStore.error }}
    </div>
  </div>
</template>

<style scoped>
.badge-purple {
  @apply px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700;
}
</style>
