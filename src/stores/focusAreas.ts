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
import { db } from '@/firebase/config'
import type { FocusArea, ConfidenceLevel, FocusAreaStatus } from '@/types'
import { useAuthStore } from './auth'

export const useFocusAreasStore = defineStore('focusAreas', () => {
  const focusAreas = ref<FocusArea[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  const activeFocusAreas = computed(() =>
    focusAreas.value.filter((fa) => fa.status === 'active')
  )

  const archivedFocusAreas = computed(() =>
    focusAreas.value.filter((fa) => fa.status === 'archived')
  )

  function subscribe() {
    if (unsubscribe) return

    loading.value = true
    const q = query(collection(db, 'focusAreas'), orderBy('createdAt', 'desc'))

    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        focusAreas.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as FocusArea[]
        loading.value = false
      },
      (err) => {
        console.error('Focus areas subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeFromFocusAreas() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function addFocusArea(data: {
    title: string
    problemStatement: string
    confidenceLevel: ConfidenceLevel
    confidenceRationale: string
    successCriteria: string[]
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to add focus areas')
    }

    saving.value = true
    error.value = null

    try {
      await addDoc(collection(db, 'focusAreas'), {
        ...data,
        status: 'active' as FocusAreaStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add focus area'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateFocusArea(
    id: string,
    data: Partial<{
      title: string
      problemStatement: string
      confidenceLevel: ConfidenceLevel
      confidenceRationale: string
      successCriteria: string[]
      status: FocusAreaStatus
    }>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to update focus areas')
    }

    saving.value = true
    error.value = null

    try {
      const docRef = doc(db, 'focusAreas', id)
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update focus area'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function archiveFocusArea(id: string) {
    await updateFocusArea(id, { status: 'archived' })
  }

  async function reactivateFocusArea(id: string) {
    await updateFocusArea(id, { status: 'active' })
  }

  async function deleteFocusArea(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to delete focus areas')
    }

    try {
      await deleteDoc(doc(db, 'focusAreas', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete focus area'
      error.value = message
      throw e
    }
  }

  return {
    focusAreas,
    activeFocusAreas,
    archivedFocusAreas,
    loading,
    saving,
    error,
    subscribe,
    unsubscribe: unsubscribeFromFocusAreas,
    addFocusArea,
    updateFocusArea,
    archiveFocusArea,
    reactivateFocusArea,
    deleteFocusArea,
  }
})
