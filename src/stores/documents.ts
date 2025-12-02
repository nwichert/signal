import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore'
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { db, storage } from '@/firebase/config'
import type { Document, DocumentCategory } from '@/types'
import { useAuthStore } from './auth'

export const useDocumentsStore = defineStore('documents', () => {
  const documents = ref<Document[]>([])
  const loading = ref(true)
  const uploading = ref(false)
  const error = ref<string | null>(null)
  const uploadProgress = ref(0)

  let unsubscribe: (() => void) | null = null

  // Get documents by category
  function getDocumentsByCategory(category: DocumentCategory) {
    return documents.value.filter((d) => d.category === category)
  }

  // Get unique tags from all documents
  const allTags = computed(() => {
    const tags = new Set<string>()
    documents.value.forEach((doc) => {
      doc.tags.forEach((tag) => tags.add(tag))
    })
    return Array.from(tags).sort()
  })

  // Search documents by name, description, or tags
  function searchDocuments(searchTerm: string) {
    const term = searchTerm.toLowerCase()
    return documents.value.filter(
      (doc) =>
        doc.name.toLowerCase().includes(term) ||
        doc.description.toLowerCase().includes(term) ||
        doc.tags.some((tag) => tag.toLowerCase().includes(term))
    )
  }

  function subscribe() {
    if (unsubscribe) return

    loading.value = true

    const documentsQuery = query(
      collection(db, 'documents'),
      orderBy('createdAt', 'desc')
    )

    unsubscribe = onSnapshot(
      documentsQuery,
      (snapshot) => {
        documents.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Document[]
        loading.value = false
      },
      (err) => {
        console.error('Documents subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeFromDocuments() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function uploadDocument(
    file: File,
    data: {
      name: string
      description: string
      category: DocumentCategory
      tags: string[]
      externalUrl?: string
    }
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    uploading.value = true
    uploadProgress.value = 0
    error.value = null

    try {
      // Generate unique file path
      const timestamp = Date.now()
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const storagePath = `documents/${timestamp}_${sanitizedFileName}`

      // Upload file to Firebase Storage
      const fileRef = storageRef(storage, storagePath)
      await uploadBytes(fileRef, file)
      uploadProgress.value = 50

      // Get download URL
      const storageUrl = await getDownloadURL(fileRef)
      uploadProgress.value = 75

      // Save document metadata to Firestore
      const docData: Record<string, unknown> = {
        name: data.name,
        description: data.description,
        category: data.category,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        storageUrl,
        storagePath,
        tags: data.tags,
        uploadedBy: authStore.user?.id,
        uploadedByName: authStore.user?.displayName || 'Unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      // Add externalUrl if provided
      if (data.externalUrl) {
        docData.externalUrl = data.externalUrl
      }

      await addDoc(collection(db, 'documents'), docData)

      uploadProgress.value = 100
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to upload document'
      error.value = message
      throw e
    } finally {
      uploading.value = false
      uploadProgress.value = 0
    }
  }

  async function updateDocument(
    id: string,
    data: Partial<Pick<Document, 'name' | 'description' | 'category' | 'tags' | 'externalUrl'>>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const docRef = doc(db, 'documents', id)
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update document'
      error.value = message
      throw e
    }
  }

  async function deleteDocument(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      // Find the document to get storage path
      const document = documents.value.find((d) => d.id === id)
      if (!document) throw new Error('Document not found')

      // Delete from Firebase Storage
      const fileRef = storageRef(storage, document.storagePath)
      try {
        await deleteObject(fileRef)
      } catch (storageError) {
        // File might not exist in storage, continue with Firestore deletion
        console.warn('Could not delete file from storage:', storageError)
      }

      // Delete from Firestore
      await deleteDoc(doc(db, 'documents', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete document'
      error.value = message
      throw e
    }
  }

  // Format file size for display
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Get file icon based on type
  function getFileIcon(fileType: string): string {
    if (fileType.includes('pdf')) return 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z'
    if (fileType.includes('image')) return 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
    if (fileType.includes('video')) return 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
    if (fileType.includes('word') || fileType.includes('document')) return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
    if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z'
    return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
  }

  // Get category badge class
  function getCategoryBadgeClass(category: DocumentCategory): string {
    switch (category) {
      case 'research':
        return 'badge-blue'
      case 'design':
        return 'badge-purple'
      case 'technical':
        return 'badge-gray'
      case 'business':
        return 'badge-green'
      case 'legal':
        return 'badge-red'
      case 'other':
        return 'badge-yellow'
      default:
        return 'badge-gray'
    }
  }

  return {
    documents,
    allTags,
    loading,
    uploading,
    uploadProgress,
    error,
    subscribe,
    unsubscribe: unsubscribeFromDocuments,
    getDocumentsByCategory,
    searchDocuments,
    uploadDocument,
    updateDocument,
    deleteDocument,
    formatFileSize,
    getFileIcon,
    getCategoryBadgeClass,
  }
})
