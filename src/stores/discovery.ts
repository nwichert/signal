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
import type { Hypothesis, HypothesisStatus, RiskType, Feedback } from '@/types'
import { useAuthStore } from './auth'

export const useDiscoveryStore = defineStore('discovery', () => {
  const hypotheses = ref<Hypothesis[]>([])
  const feedback = ref<Feedback[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubHypotheses: (() => void) | null = null
  let unsubFeedback: (() => void) | null = null

  const activeHypotheses = computed(() =>
    hypotheses.value.filter((h) => h.status === 'active')
  )

  const validatedHypotheses = computed(() =>
    hypotheses.value.filter((h) => h.status === 'validated')
  )

  const invalidatedHypotheses = computed(() =>
    hypotheses.value.filter((h) => h.status === 'invalidated')
  )

  const parkedHypotheses = computed(() =>
    hypotheses.value.filter((h) => h.status === 'parked')
  )

  function filterByStatus(status: HypothesisStatus | 'all') {
    if (status === 'all') return hypotheses.value
    return hypotheses.value.filter((h) => h.status === status)
  }

  function subscribe() {
    if (unsubHypotheses) return

    loading.value = true

    const hypothesesQuery = query(collection(db, 'hypotheses'), orderBy('createdAt', 'desc'))
    unsubHypotheses = onSnapshot(
      hypothesesQuery,
      (snapshot) => {
        hypotheses.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Hypothesis[]
        loading.value = false
      },
      (err) => {
        console.error('Hypotheses subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )

    const feedbackQuery = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'))
    unsubFeedback = onSnapshot(
      feedbackQuery,
      (snapshot) => {
        feedback.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Feedback[]
      },
      (err) => {
        console.error('Feedback subscription error:', err)
      }
    )
  }

  function unsubscribeFromDiscovery() {
    if (unsubHypotheses) {
      unsubHypotheses()
      unsubHypotheses = null
    }
    if (unsubFeedback) {
      unsubFeedback()
      unsubFeedback = null
    }
  }

  async function addHypothesis(data: {
    belief: string
    test: string
    risks: RiskType[]
    focusAreaId?: string
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    saving.value = true
    error.value = null

    try {
      await addDoc(collection(db, 'hypotheses'), {
        ...data,
        result: '',
        status: 'active' as HypothesisStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add hypothesis'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateHypothesis(
    id: string,
    data: Partial<{
      belief: string
      test: string
      result: string
      status: HypothesisStatus
      risks: RiskType[]
      focusAreaId: string
    }>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    saving.value = true
    error.value = null

    try {
      const docRef = doc(db, 'hypotheses', id)
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update hypothesis'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function deleteHypothesis(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      await deleteDoc(doc(db, 'hypotheses', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete hypothesis'
      error.value = message
      throw e
    }
  }

  async function addFeedback(data: {
    source: string
    content: string
    theme: string
    hypothesisId?: string
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    saving.value = true
    error.value = null

    try {
      await addDoc(collection(db, 'feedback'), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add feedback'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function deleteFeedback(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      await deleteDoc(doc(db, 'feedback', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete feedback'
      error.value = message
      throw e
    }
  }

  return {
    hypotheses,
    feedback,
    activeHypotheses,
    validatedHypotheses,
    invalidatedHypotheses,
    parkedHypotheses,
    loading,
    saving,
    error,
    filterByStatus,
    subscribe,
    unsubscribe: unsubscribeFromDiscovery,
    addHypothesis,
    updateHypothesis,
    deleteHypothesis,
    addFeedback,
    deleteFeedback,
  }
})
