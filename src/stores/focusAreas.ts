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
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import type { FocusArea, ConfidenceLevel, FocusAreaStatus, ConfidenceTrend, ConfidenceSnapshot } from '@/types'
import { useAuthStore } from './auth'

export const useFocusAreasStore = defineStore('focusAreas', () => {
  const focusAreas = ref<FocusArea[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  // Filter by active statuses (not archived)
  const activeFocusAreas = computed(() =>
    focusAreas.value.filter((fa) => fa.status !== 'archived' && fa.status !== 'achieved')
  )

  const archivedFocusAreas = computed(() =>
    focusAreas.value.filter((fa) => fa.status === 'archived')
  )

  const achievedFocusAreas = computed(() =>
    focusAreas.value.filter((fa) => fa.status === 'achieved')
  )

  // By status
  const focusAreasByStatus = computed(() => {
    const byStatus: Record<FocusAreaStatus, FocusArea[]> = {
      active: [],
      validating: [],
      scaling: [],
      achieved: [],
      pivoted: [],
      paused: [],
      archived: [],
    }
    focusAreas.value.forEach((fa) => {
      if (byStatus[fa.status]) {
        byStatus[fa.status].push(fa)
      }
    })
    return byStatus
  })

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
    targetArchetypeIds?: string[]
    strategicImportance?: string
    expectedOutcome?: string
    principleIds?: string[]
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to add focus areas')
    }

    saving.value = true
    error.value = null

    try {
      // Create initial confidence history entry
      const initialConfidenceSnapshot: ConfidenceSnapshot = {
        level: data.confidenceLevel,
        rationale: data.confidenceRationale,
        changedAt: Timestamp.now(),
        changedBy: authStore.user?.id || '',
      }

      await addDoc(collection(db, 'focusAreas'), {
        ...data,
        status: 'active' as FocusAreaStatus,
        confidenceTrend: 'stable' as ConfidenceTrend,
        confidenceHistory: [initialConfidenceSnapshot],
        progressPercentage: 0,
        statusHistory: [{
          status: 'active',
          changedAt: Timestamp.now(),
          changedBy: authStore.user?.id || '',
          reason: 'Initial creation',
        }],
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
    data: Partial<FocusArea>
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

  // Update confidence with history tracking
  async function updateConfidence(
    id: string,
    level: ConfidenceLevel,
    rationale: string
  ) {
    const authStore = useAuthStore()
    const focusArea = focusAreas.value.find((fa) => fa.id === id)
    if (!focusArea) throw new Error('Focus area not found')

    const newSnapshot: ConfidenceSnapshot = {
      level,
      rationale,
      changedAt: Timestamp.now(),
      changedBy: authStore.user?.id || '',
    }

    const history = [...(focusArea.confidenceHistory || []), newSnapshot]

    // Calculate trend
    let trend: ConfidenceTrend = 'stable'
    if (history.length >= 2) {
      const levels = { low: 1, medium: 2, high: 3 }
      const current = levels[level]
      const previous = levels[focusArea.confidenceLevel]
      if (current > previous) trend = 'improving'
      else if (current < previous) trend = 'declining'
    }

    await updateFocusArea(id, {
      confidenceLevel: level,
      confidenceRationale: rationale,
      confidenceTrend: trend,
      confidenceHistory: history,
    })
  }

  // Update status with history tracking
  async function updateStatus(
    id: string,
    status: FocusAreaStatus,
    reason?: string
  ) {
    const authStore = useAuthStore()
    const focusArea = focusAreas.value.find((fa) => fa.id === id)
    if (!focusArea) throw new Error('Focus area not found')

    const statusEntry = {
      status,
      changedAt: Timestamp.now(),
      changedBy: authStore.user?.id || '',
      reason,
    }

    const history = [...(focusArea.statusHistory || []), statusEntry]

    await updateFocusArea(id, {
      status,
      statusHistory: history,
    })
  }

  // Update progress percentage
  async function updateProgress(id: string, percentage: number) {
    await updateFocusArea(id, {
      progressPercentage: Math.min(100, Math.max(0, percentage)),
    })
  }

  async function archiveFocusArea(id: string, reason?: string) {
    await updateStatus(id, 'archived', reason || 'Archived')
  }

  async function reactivateFocusArea(id: string) {
    await updateStatus(id, 'active', 'Reactivated')
  }

  // Get focus area by ID
  function getFocusAreaById(id: string): FocusArea | undefined {
    return focusAreas.value.find((fa) => fa.id === id)
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
    achievedFocusAreas,
    focusAreasByStatus,
    loading,
    saving,
    error,
    subscribe,
    unsubscribe: unsubscribeFromFocusAreas,
    addFocusArea,
    updateFocusArea,
    updateConfidence,
    updateStatus,
    updateProgress,
    archiveFocusArea,
    reactivateFocusArea,
    deleteFocusArea,
    getFocusAreaById,
  }
})
