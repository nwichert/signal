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
import type { Decision, DecisionOption, DecisionStatus, DecisionCategory } from '@/types'
import { useAuthStore } from './auth'

export const useDecisionsStore = defineStore('decisions', () => {
  const decisions = ref<Decision[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  const proposedDecisions = computed(() =>
    decisions.value.filter((d) => d.status === 'proposed')
  )

  const decidedDecisions = computed(() =>
    decisions.value.filter((d) => d.status === 'decided')
  )

  const revisitedDecisions = computed(() =>
    decisions.value.filter((d) => d.status === 'revisited')
  )

  // Get decisions by category
  function getDecisionsByCategory(category: DecisionCategory) {
    return decisions.value.filter((d) => d.category === category)
  }

  function subscribe() {
    if (unsubscribe) return

    loading.value = true

    const decisionsQuery = query(
      collection(db, 'decisions'),
      orderBy('createdAt', 'desc')
    )

    unsubscribe = onSnapshot(
      decisionsQuery,
      (snapshot) => {
        decisions.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Decision[]
        loading.value = false
      },
      (err) => {
        console.error('Decisions subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeFromDecisions() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function addDecision(data: {
    title: string
    context: string
    category: DecisionCategory
    owner: string
    options: Omit<DecisionOption, 'id'>[]
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    saving.value = true
    error.value = null

    try {
      // Generate IDs for options
      const optionsWithIds = data.options.map((opt, index) => ({
        ...opt,
        id: `opt-${Date.now()}-${index}`,
      }))

      await addDoc(collection(db, 'decisions'), {
        title: data.title,
        context: data.context,
        category: data.category,
        owner: data.owner,
        status: 'proposed' as DecisionStatus,
        options: optionsWithIds,
        rationale: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add decision'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateDecision(
    id: string,
    data: Partial<Pick<Decision, 'title' | 'context' | 'category' | 'owner' | 'rationale' | 'outcome'>>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const docRef = doc(db, 'decisions', id)
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update decision'
      error.value = message
      throw e
    }
  }

  async function makeDecision(id: string, selectedOptionId: string, rationale: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const decision = decisions.value.find((d) => d.id === id)
      if (!decision) throw new Error('Decision not found')

      // Update options to mark selected one
      const updatedOptions = decision.options.map((opt) => ({
        ...opt,
        selected: opt.id === selectedOptionId,
      }))

      const docRef = doc(db, 'decisions', id)
      await updateDoc(docRef, {
        status: 'decided',
        options: updatedOptions,
        rationale,
        decidedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to make decision'
      error.value = message
      throw e
    }
  }

  async function revisitDecision(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const docRef = doc(db, 'decisions', id)
      await updateDoc(docRef, {
        status: 'revisited',
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to revisit decision'
      error.value = message
      throw e
    }
  }

  async function reopenDecision(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const docRef = doc(db, 'decisions', id)
      await updateDoc(docRef, {
        status: 'proposed',
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to reopen decision'
      error.value = message
      throw e
    }
  }

  async function addOption(decisionId: string, option: Omit<DecisionOption, 'id'>) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const decision = decisions.value.find((d) => d.id === decisionId)
      if (!decision) throw new Error('Decision not found')

      const newOption: DecisionOption = {
        ...option,
        id: `opt-${Date.now()}`,
      }

      const docRef = doc(db, 'decisions', decisionId)
      await updateDoc(docRef, {
        options: [...decision.options, newOption],
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add option'
      error.value = message
      throw e
    }
  }

  async function updateOption(
    decisionId: string,
    optionId: string,
    data: Partial<Omit<DecisionOption, 'id'>>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const decision = decisions.value.find((d) => d.id === decisionId)
      if (!decision) throw new Error('Decision not found')

      const updatedOptions = decision.options.map((opt) =>
        opt.id === optionId ? { ...opt, ...data } : opt
      )

      const docRef = doc(db, 'decisions', decisionId)
      await updateDoc(docRef, {
        options: updatedOptions,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update option'
      error.value = message
      throw e
    }
  }

  async function deleteOption(decisionId: string, optionId: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const decision = decisions.value.find((d) => d.id === decisionId)
      if (!decision) throw new Error('Decision not found')

      const updatedOptions = decision.options.filter((opt) => opt.id !== optionId)

      const docRef = doc(db, 'decisions', decisionId)
      await updateDoc(docRef, {
        options: updatedOptions,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete option'
      error.value = message
      throw e
    }
  }

  async function deleteDecision(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      await deleteDoc(doc(db, 'decisions', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete decision'
      error.value = message
      throw e
    }
  }

  // Get category badge class
  function getCategoryBadgeClass(category: DecisionCategory): string {
    switch (category) {
      case 'product':
        return 'badge-blue'
      case 'technical':
        return 'badge-purple'
      case 'process':
        return 'badge-yellow'
      case 'strategy':
        return 'badge-green'
      default:
        return 'badge-gray'
    }
  }

  // Get status badge class
  function getStatusBadgeClass(status: DecisionStatus): string {
    switch (status) {
      case 'proposed':
        return 'badge-yellow'
      case 'decided':
        return 'badge-green'
      case 'revisited':
        return 'badge-blue'
      default:
        return 'badge-gray'
    }
  }

  return {
    decisions,
    proposedDecisions,
    decidedDecisions,
    revisitedDecisions,
    loading,
    saving,
    error,
    subscribe,
    unsubscribe: unsubscribeFromDecisions,
    getDecisionsByCategory,
    getCategoryBadgeClass,
    getStatusBadgeClass,
    addDecision,
    updateDecision,
    makeDecision,
    revisitDecision,
    reopenDecision,
    addOption,
    updateOption,
    deleteOption,
    deleteDecision,
  }
})
