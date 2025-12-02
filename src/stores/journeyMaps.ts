import { defineStore } from 'pinia'
import { ref } from 'vue'
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
import type { JourneyMap, JourneyStep } from '@/types'
import { useAuthStore } from './auth'

export const useJourneyMapsStore = defineStore('journeyMaps', () => {
  const journeyMaps = ref<JourneyMap[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  // Get journey maps for a specific idea
  function getJourneyMapsForIdea(ideaId: string) {
    return journeyMaps.value.filter((jm) => jm.ideaId === ideaId)
  }

  function subscribe() {
    if (unsubscribe) return

    loading.value = true
    const q = query(collection(db, 'journeyMaps'), orderBy('createdAt', 'desc'))

    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        journeyMaps.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as JourneyMap[]
        loading.value = false
      },
      (err) => {
        console.error('Journey maps subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeFromJourneyMaps() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function addJourneyMap(data: {
    title: string
    subtitle?: string
    ideaId: string
    steps: Omit<JourneyStep, 'id'>[]
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to add journey maps')
    }

    saving.value = true
    error.value = null

    try {
      // Generate IDs for steps
      const stepsWithIds = data.steps.map((step, index) => ({
        ...step,
        id: `step-${Date.now()}-${index}`,
      }))

      await addDoc(collection(db, 'journeyMaps'), {
        title: data.title,
        subtitle: data.subtitle || null,
        ideaId: data.ideaId,
        steps: stepsWithIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add journey map'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateJourneyMap(
    id: string,
    data: Partial<{
      title: string
      subtitle: string
      steps: JourneyStep[]
    }>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to update journey maps')
    }

    saving.value = true
    error.value = null

    try {
      const docRef = doc(db, 'journeyMaps', id)
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update journey map'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function deleteJourneyMap(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to delete journey maps')
    }

    try {
      await deleteDoc(doc(db, 'journeyMaps', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete journey map'
      error.value = message
      throw e
    }
  }

  function getJourneyMapById(id: string): JourneyMap | undefined {
    return journeyMaps.value.find((jm) => jm.id === id)
  }

  return {
    journeyMaps,
    loading,
    saving,
    error,
    getJourneyMapsForIdea,
    subscribe,
    unsubscribe: unsubscribeFromJourneyMaps,
    addJourneyMap,
    updateJourneyMap,
    deleteJourneyMap,
    getJourneyMapById,
  }
})
