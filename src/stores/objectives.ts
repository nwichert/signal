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
import type { Objective, KeyResult, ObjectiveStatus, KeyResultStatus } from '@/types'
import { useAuthStore } from './auth'

export const useObjectivesStore = defineStore('objectives', () => {
  const objectives = ref<Objective[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  const activeObjectives = computed(() =>
    objectives.value.filter((o) => o.status === 'active')
  )

  const completedObjectives = computed(() =>
    objectives.value.filter((o) => o.status === 'completed')
  )

  const archivedObjectives = computed(() =>
    objectives.value.filter((o) => o.status === 'archived')
  )

  // Get objectives by quarter
  function getObjectivesByQuarter(quarter: string) {
    return objectives.value.filter((o) => o.quarter === quarter && o.status !== 'archived')
  }

  // Get unique quarters from objectives
  const quarters = computed(() => {
    const uniqueQuarters = new Set(objectives.value.map((o) => o.quarter))
    return Array.from(uniqueQuarters).sort().reverse()
  })

  function subscribe() {
    if (unsubscribe) return

    loading.value = true

    const objectivesQuery = query(
      collection(db, 'objectives'),
      orderBy('createdAt', 'desc')
    )

    unsubscribe = onSnapshot(
      objectivesQuery,
      (snapshot) => {
        objectives.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Objective[]
        loading.value = false
      },
      (err) => {
        console.error('Objectives subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeFromObjectives() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function addObjective(data: {
    title: string
    description: string
    owner: string
    quarter: string
    keyResults: Omit<KeyResult, 'id'>[]
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    saving.value = true
    error.value = null

    try {
      // Generate IDs for key results
      const keyResultsWithIds = data.keyResults.map((kr, index) => ({
        ...kr,
        id: `kr-${Date.now()}-${index}`,
      }))

      await addDoc(collection(db, 'objectives'), {
        title: data.title,
        description: data.description,
        owner: data.owner,
        quarter: data.quarter,
        status: 'active' as ObjectiveStatus,
        keyResults: keyResultsWithIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add objective'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateObjective(
    id: string,
    data: Partial<Pick<Objective, 'title' | 'description' | 'owner' | 'quarter' | 'status'>>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const docRef = doc(db, 'objectives', id)
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update objective'
      error.value = message
      throw e
    }
  }

  async function updateKeyResult(
    objectiveId: string,
    keyResultId: string,
    data: Partial<Pick<KeyResult, 'current' | 'status'>>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const objective = objectives.value.find((o) => o.id === objectiveId)
      if (!objective) throw new Error('Objective not found')

      const updatedKeyResults = objective.keyResults.map((kr) =>
        kr.id === keyResultId ? { ...kr, ...data } : kr
      )

      const docRef = doc(db, 'objectives', objectiveId)
      await updateDoc(docRef, {
        keyResults: updatedKeyResults,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update key result'
      error.value = message
      throw e
    }
  }

  async function addKeyResult(
    objectiveId: string,
    keyResult: Omit<KeyResult, 'id'>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const objective = objectives.value.find((o) => o.id === objectiveId)
      if (!objective) throw new Error('Objective not found')

      const newKeyResult: KeyResult = {
        ...keyResult,
        id: `kr-${Date.now()}`,
      }

      const docRef = doc(db, 'objectives', objectiveId)
      await updateDoc(docRef, {
        keyResults: [...objective.keyResults, newKeyResult],
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add key result'
      error.value = message
      throw e
    }
  }

  async function deleteKeyResult(objectiveId: string, keyResultId: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const objective = objectives.value.find((o) => o.id === objectiveId)
      if (!objective) throw new Error('Objective not found')

      const updatedKeyResults = objective.keyResults.filter(
        (kr) => kr.id !== keyResultId
      )

      const docRef = doc(db, 'objectives', objectiveId)
      await updateDoc(docRef, {
        keyResults: updatedKeyResults,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete key result'
      error.value = message
      throw e
    }
  }

  async function deleteObjective(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      await deleteDoc(doc(db, 'objectives', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete objective'
      error.value = message
      throw e
    }
  }

  // Calculate overall progress for an objective
  function getObjectiveProgress(objective: Objective): number {
    if (objective.keyResults.length === 0) return 0
    const totalProgress = objective.keyResults.reduce((sum, kr) => {
      const progress = kr.target > 0 ? (kr.current / kr.target) * 100 : 0
      return sum + Math.min(progress, 100)
    }, 0)
    return Math.round(totalProgress / objective.keyResults.length)
  }

  // Get status badge class for key results
  function getKeyResultStatusClass(status: KeyResultStatus): string {
    switch (status) {
      case 'on_track':
        return 'badge-green'
      case 'at_risk':
        return 'badge-yellow'
      case 'behind':
        return 'badge-red'
      case 'completed':
        return 'badge-blue'
      default:
        return 'badge-gray'
    }
  }

  return {
    objectives,
    activeObjectives,
    completedObjectives,
    archivedObjectives,
    quarters,
    loading,
    saving,
    error,
    subscribe,
    unsubscribe: unsubscribeFromObjectives,
    getObjectivesByQuarter,
    getObjectiveProgress,
    getKeyResultStatusClass,
    addObjective,
    updateObjective,
    updateKeyResult,
    addKeyResult,
    deleteKeyResult,
    deleteObjective,
  }
})
