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
import type {
  Hypothesis,
  HypothesisStatus,
  RiskType,
  Feedback,
  HypothesisEvidence,
  EvidenceType,
  EvidenceStrength,
} from '@/types'
import { useAuthStore } from './auth'
import { useDecisionsStore } from './decisions'
import { useFocusAreasStore } from './focusAreas'

function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

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

  // Hypotheses with strong evidence (for executive reporting)
  const hypothesesWithStrongEvidence = computed(() =>
    hypotheses.value.filter((h) => h.overallEvidenceStrength === 'strong')
  )

  // High priority hypotheses (for roadmap prioritization)
  const highPriorityHypotheses = computed(() =>
    hypotheses.value.filter((h) => h.priority === 'high' && h.status === 'active')
  )

  // Get hypotheses by focus area
  const hypothesesByFocusArea = computed(() => {
    const byFocusArea: Record<string, Hypothesis[]> = {}
    hypotheses.value.forEach((h) => {
      if (h.focusAreaId) {
        if (!byFocusArea[h.focusAreaId]) {
          byFocusArea[h.focusAreaId] = []
        }
        byFocusArea[h.focusAreaId]!.push(h)
      }
    })
    return byFocusArea
  })

  // Get hypothesis by ID
  function getHypothesisById(id: string): Hypothesis | undefined {
    return hypotheses.value.find((h) => h.id === id)
  }

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
    archetypeId?: string
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
      archetypeId: string
      // Evidence tracking fields
      evidence: HypothesisEvidence[]
      overallEvidenceStrength: EvidenceStrength
      expectedImpact: string
      priority: 'high' | 'medium' | 'low'
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

  /**
   * Update hypothesis status and optionally auto-generate a Decision Log entry.
   * This creates a traceable connection between discovery learnings and decisions.
   */
  async function updateHypothesisStatus(
    id: string,
    newStatus: HypothesisStatus,
    options?: {
      result?: string
      autoGenerateDecision?: boolean
    }
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    // Get the hypothesis to access its data
    const hypothesis = hypotheses.value.find(h => h.id === id)
    if (!hypothesis) {
      throw new Error('Hypothesis not found')
    }

    // Don't auto-generate for parked or reactivated hypotheses
    const shouldAutoGenerate = options?.autoGenerateDecision !== false &&
      (newStatus === 'validated' || newStatus === 'invalidated')

    saving.value = true
    error.value = null

    try {
      // Update the hypothesis
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      }
      if (options?.result !== undefined) {
        updateData.result = options.result
      }

      const docRef = doc(db, 'hypotheses', id)
      await updateDoc(docRef, updateData)

      // Auto-generate Decision Log entry
      if (shouldAutoGenerate) {
        const decisionsStore = useDecisionsStore()
        const focusAreasStore = useFocusAreasStore()

        // Get focus area title if linked
        let focusAreaTitle = ''
        if (hypothesis.focusAreaId) {
          const focusArea = focusAreasStore.focusAreas.find(fa => fa.id === hypothesis.focusAreaId)
          focusAreaTitle = focusArea?.title || ''
        }

        // Build decision title and context
        const statusText = newStatus === 'validated' ? 'Validated' : 'Invalidated'
        const decisionTitle = `[Auto] Hypothesis ${statusText}: ${hypothesis.belief.substring(0, 60)}${hypothesis.belief.length > 60 ? '...' : ''}`

        const contextParts = [
          `**Status:** ${statusText}`,
          '',
          `**Original Belief:** ${hypothesis.belief}`,
          '',
          `**Test Method:** ${hypothesis.test}`,
        ]

        if (options?.result || hypothesis.result) {
          contextParts.push('', `**Result:** ${options?.result || hypothesis.result}`)
        }

        if (focusAreaTitle) {
          contextParts.push('', `**Related Focus Area:** ${focusAreaTitle}`)
        }

        if (hypothesis.risks.length > 0) {
          contextParts.push('', `**Risks Tested:** ${hypothesis.risks.join(', ')}`)
        }

        contextParts.push('', '---', '*This decision was auto-generated when a hypothesis was validated/invalidated in Discovery Hub.*')

        // Create auto-generated decision
        await decisionsStore.addDecision({
          title: decisionTitle,
          context: contextParts.join('\n'),
          category: 'product',
          owner: authStore.user?.displayName || 'System',
          options: newStatus === 'validated' ? [
            {
              title: 'Proceed with implementation',
              description: 'The hypothesis was validated - consider moving forward with related features or changes.',
              pros: ['Evidence supports the approach', 'Reduces risk of building wrong thing'],
              cons: [],
              selected: false,
            },
            {
              title: 'Gather more evidence',
              description: 'While validated, more data might strengthen the case before major investment.',
              pros: ['Higher confidence before investment'],
              cons: ['Delays potential value delivery'],
              selected: false,
            },
          ] : [
            {
              title: 'Pivot approach',
              description: 'The hypothesis was invalidated - consider alternative approaches to solve the problem.',
              pros: ['Avoids investing in wrong direction', 'Opens up exploration of new ideas'],
              cons: ['Requires new hypothesis development'],
              selected: false,
            },
            {
              title: 'Archive and move on',
              description: 'Document the learning and focus resources elsewhere.',
              pros: ['Frees up resources', 'Creates documented learning'],
              cons: ['Problem may remain unsolved'],
              selected: false,
            },
          ],
          relatedHypothesisIds: [id],
          focusAreaId: hypothesis.focusAreaId,
          autoGenerated: true,
          sourceHypothesisId: id,
        })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update hypothesis status'
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

  // Evidence management functions
  async function addEvidence(
    hypothesisId: string,
    data: {
      type: EvidenceType
      description: string
      sampleSize?: number
      dataSource?: string
      strength: EvidenceStrength
      documentIds?: string[]
      designPartnerId?: string
    }
  ): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to add evidence')
    }

    const hypothesis = hypotheses.value.find((h) => h.id === hypothesisId)
    if (!hypothesis) throw new Error('Hypothesis not found')

    const newEvidence: HypothesisEvidence = {
      id: generateId(),
      type: data.type,
      description: data.description,
      sampleSize: data.sampleSize,
      dataSource: data.dataSource,
      strength: data.strength,
      documentIds: data.documentIds || [],
      designPartnerId: data.designPartnerId,
      createdAt: Timestamp.now(),
      createdBy: authStore.user?.id || '',
    }

    const updatedEvidence = [...(hypothesis.evidence || []), newEvidence]
    const overallStrength = calculateOverallEvidenceStrength(updatedEvidence)

    await updateHypothesis(hypothesisId, {
      evidence: updatedEvidence,
      overallEvidenceStrength: overallStrength,
    })
  }

  async function updateEvidence(
    hypothesisId: string,
    evidenceId: string,
    data: Partial<HypothesisEvidence>
  ): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to update evidence')
    }

    const hypothesis = hypotheses.value.find((h) => h.id === hypothesisId)
    if (!hypothesis) throw new Error('Hypothesis not found')

    const updatedEvidence = (hypothesis.evidence || []).map((e) =>
      e.id === evidenceId ? { ...e, ...data } : e
    )
    const overallStrength = calculateOverallEvidenceStrength(updatedEvidence)

    await updateHypothesis(hypothesisId, {
      evidence: updatedEvidence,
      overallEvidenceStrength: overallStrength,
    })
  }

  async function removeEvidence(
    hypothesisId: string,
    evidenceId: string
  ): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to remove evidence')
    }

    const hypothesis = hypotheses.value.find((h) => h.id === hypothesisId)
    if (!hypothesis) throw new Error('Hypothesis not found')

    const updatedEvidence = (hypothesis.evidence || []).filter((e) => e.id !== evidenceId)
    const overallStrength = calculateOverallEvidenceStrength(updatedEvidence)

    await updateHypothesis(hypothesisId, {
      evidence: updatedEvidence,
      overallEvidenceStrength: overallStrength,
    })
  }

  // Calculate overall evidence strength from multiple evidence items
  function calculateOverallEvidenceStrength(
    evidence: HypothesisEvidence[]
  ): EvidenceStrength {
    if (evidence.length === 0) return 'weak'

    const strengthScores = { weak: 1, moderate: 2, strong: 3 }
    const totalScore = evidence.reduce(
      (sum, e) => sum + strengthScores[e.strength],
      0
    )
    const avgScore = totalScore / evidence.length

    // Factor in quantity - more evidence increases strength
    const quantityBonus = Math.min(evidence.length * 0.1, 0.5)
    const adjustedScore = avgScore + quantityBonus

    if (adjustedScore >= 2.5) return 'strong'
    if (adjustedScore >= 1.5) return 'moderate'
    return 'weak'
  }

  // Update hypothesis priority
  async function updatePriority(
    id: string,
    priority: 'high' | 'medium' | 'low'
  ): Promise<void> {
    await updateHypothesis(id, { priority })
  }

  // Update expected impact
  async function updateExpectedImpact(
    id: string,
    expectedImpact: string
  ): Promise<void> {
    await updateHypothesis(id, { expectedImpact })
  }

  // Get hypotheses count by focus area
  function getHypothesesCountByFocusArea(focusAreaId: string): {
    total: number
    active: number
    validated: number
    invalidated: number
  } {
    const focusAreaHypotheses = hypotheses.value.filter(
      (h) => h.focusAreaId === focusAreaId
    )
    return {
      total: focusAreaHypotheses.length,
      active: focusAreaHypotheses.filter((h) => h.status === 'active').length,
      validated: focusAreaHypotheses.filter((h) => h.status === 'validated').length,
      invalidated: focusAreaHypotheses.filter((h) => h.status === 'invalidated').length,
    }
  }

  async function addFeedback(data: {
    source: string
    content: string
    theme: string
    hypothesisId?: string
    archetypeId?: string
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
    hypothesesWithStrongEvidence,
    highPriorityHypotheses,
    hypothesesByFocusArea,
    loading,
    saving,
    error,
    filterByStatus,
    getHypothesisById,
    getHypothesesCountByFocusArea,
    subscribe,
    unsubscribe: unsubscribeFromDiscovery,
    addHypothesis,
    updateHypothesis,
    updateHypothesisStatus,
    deleteHypothesis,
    // Evidence management
    addEvidence,
    updateEvidence,
    removeEvidence,
    calculateOverallEvidenceStrength,
    updatePriority,
    updateExpectedImpact,
    // Feedback (legacy)
    addFeedback,
    deleteFeedback,
  }
})
