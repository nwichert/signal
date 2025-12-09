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
  CustomerArchetype,
  ArchetypeProject,
  StakeholderRole,
  ArchetypePhase,
  ArchetypeHypothesis,
  InterviewNote,
  InterviewQuestion,
  ValuePropositionMap,
  ValidationStatus,
} from '@/types'
import { useAuthStore } from './auth'

// Helper to generate unique IDs
function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

// BS Detector - marketing speak that needs validation
const BS_WORDS = [
  'innovative',
  'seamless',
  'revolutionize',
  'cutting-edge',
  'best-in-class',
  'world-class',
  'game-changing',
  'disruptive',
  'synergy',
  'leverage',
  'paradigm',
  'holistic',
  'scalable',
  'robust',
  'next-generation',
  'transformative',
  'empower',
  'streamline',
]

export const useCustomerArchetypesStore = defineStore('customerArchetypes', () => {
  const archetypes = ref<CustomerArchetype[]>([])
  const projects = ref<ArchetypeProject[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let archetypesUnsubscribe: (() => void) | null = null
  let projectsUnsubscribe: (() => void) | null = null

  // Filter archetypes by status
  const draftArchetypes = computed(() =>
    archetypes.value.filter((a) => a.status === 'draft')
  )

  const activeArchetypes = computed(() =>
    archetypes.value.filter((a) => a.status === 'active')
  )

  const validatedArchetypes = computed(() =>
    archetypes.value.filter((a) => a.status === 'validated')
  )

  const archivedArchetypes = computed(() =>
    archetypes.value.filter((a) => a.status === 'archived')
  )

  // Filter by stakeholder role
  const archetypesByRole = computed(() => {
    const byRole: Record<StakeholderRole, CustomerArchetype[]> = {
      user: [],
      payer: [],
      economic_buyer: [],
      decision_maker: [],
      influencer: [],
      recommender: [],
      saboteur: [],
    }
    archetypes.value.forEach((a) => {
      if (byRole[a.stakeholderRole]) {
        byRole[a.stakeholderRole].push(a)
      }
    })
    return byRole
  })

  // Calculate confidence score for an archetype
  function calculateConfidenceScore(archetype: CustomerArchetype): number {
    const allHypotheses: ArchetypeHypothesis[] = [
      ...archetype.specificPainPoints,
      ...archetype.currentSolutions,
      ...archetype.primaryGoals,
      ...archetype.successMetrics,
      ...archetype.buyingCriteria,
      ...archetype.objections,
    ]

    if (allHypotheses.length === 0) return 0

    const validated = allHypotheses.filter((h) => h.status === 'validated').length
    const partiallyValidated = allHypotheses.filter(
      (h) => h.status === 'partially_validated'
    ).length

    return Math.round(
      ((validated * 1 + partiallyValidated * 0.5) / allHypotheses.length) * 100
    )
  }

  // Calculate interview readiness score
  function calculateReadinessScore(archetype: CustomerArchetype): number {
    const completedInterviews = archetype.interviewNotes.length
    const targetInterviews = archetype.interviewTarget || 8
    return Math.min(100, Math.round((completedInterviews / targetInterviews) * 100))
  }

  // BS Detector - find marketing speak
  function detectBSFlags(archetype: CustomerArchetype): string[] {
    const flags: string[] = []
    const textToScan = [
      archetype.problemStatement,
      archetype.dailyReality,
      archetype.decisionProcess,
      ...archetype.specificPainPoints.map((h) => h.content),
      ...archetype.primaryGoals.map((h) => h.content),
      ...archetype.valuePropositions.map((v) => v.proposition),
    ].join(' ').toLowerCase()

    BS_WORDS.forEach((word) => {
      if (textToScan.includes(word.toLowerCase())) {
        flags.push(word)
      }
    })

    return flags
  }

  function subscribe() {
    if (archetypesUnsubscribe) return

    loading.value = true

    // Subscribe to archetypes
    const archetypesQuery = query(
      collection(db, 'customerArchetypes'),
      orderBy('createdAt', 'desc')
    )

    archetypesUnsubscribe = onSnapshot(
      archetypesQuery,
      (snapshot) => {
        archetypes.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as CustomerArchetype[]
        loading.value = false
      },
      (err) => {
        console.error('Archetypes subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )

    // Subscribe to projects
    const projectsQuery = query(
      collection(db, 'archetypeProjects'),
      orderBy('createdAt', 'desc')
    )

    projectsUnsubscribe = onSnapshot(
      projectsQuery,
      (snapshot) => {
        projects.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ArchetypeProject[]
      },
      (err) => {
        console.error('Projects subscription error:', err)
      }
    )
  }

  function unsubscribeAll() {
    if (archetypesUnsubscribe) {
      archetypesUnsubscribe()
      archetypesUnsubscribe = null
    }
    if (projectsUnsubscribe) {
      projectsUnsubscribe()
      projectsUnsubscribe = null
    }
  }

  async function addArchetype(data: {
    name: string
    stakeholderRole: StakeholderRole
    customRoleName?: string
  }): Promise<string> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to add archetypes')
    }

    saving.value = true
    error.value = null

    try {
      const newArchetype: Omit<CustomerArchetype, 'id'> = {
        name: data.name,
        stakeholderRole: data.stakeholderRole,
        customRoleName: data.customRoleName,
        phase: 'setup',
        jobTitle: '',
        dailyReality: '',
        background: '',
        problemStatement: '',
        specificPainPoints: [],
        currentSolutions: [],
        primaryGoals: [],
        successMetrics: [],
        budgetAuthority: 'hypothesis',
        decisionProcess: '',
        buyingCriteria: [],
        objections: [],
        valuePropositions: [],
        interviewQuestions: [],
        interviewNotes: [],
        interviewTarget: 8,
        confidenceScore: 0,
        readinessScore: 0,
        bsFlags: [],
        status: 'draft',
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
        createdBy: authStore.user?.id || '',
      }

      const docRef = await addDoc(collection(db, 'customerArchetypes'), newArchetype)
      return docRef.id
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add archetype'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateArchetype(
    id: string,
    data: Partial<CustomerArchetype>
  ): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to update archetypes')
    }

    saving.value = true
    error.value = null

    try {
      const updateData: Record<string, unknown> = {
        ...data,
        updatedAt: serverTimestamp(),
      }

      // Recalculate scores if relevant fields changed
      const archetype = archetypes.value.find((a) => a.id === id)
      if (archetype) {
        const merged = { ...archetype, ...data }
        updateData.confidenceScore = calculateConfidenceScore(merged as CustomerArchetype)
        updateData.readinessScore = calculateReadinessScore(merged as CustomerArchetype)
        updateData.bsFlags = detectBSFlags(merged as CustomerArchetype)
      }

      const docRef = doc(db, 'customerArchetypes', id)
      await updateDoc(docRef, updateData)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update archetype'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updatePhase(id: string, phase: ArchetypePhase): Promise<void> {
    await updateArchetype(id, { phase })
  }

  async function updateStatus(
    id: string,
    status: 'draft' | 'active' | 'validated' | 'archived'
  ): Promise<void> {
    await updateArchetype(id, { status })
  }

  // Hypothesis management
  async function addHypothesis(
    archetypeId: string,
    field: 'specificPainPoints' | 'currentSolutions' | 'primaryGoals' | 'successMetrics' | 'buyingCriteria' | 'objections',
    content: string
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const newHypothesis: ArchetypeHypothesis = {
      id: generateId(),
      content,
      status: 'hypothesis',
    }

    const updated = [...archetype[field], newHypothesis]
    await updateArchetype(archetypeId, { [field]: updated })
  }

  async function updateHypothesisStatus(
    archetypeId: string,
    field: 'specificPainPoints' | 'currentSolutions' | 'primaryGoals' | 'successMetrics' | 'buyingCriteria' | 'objections',
    hypothesisId: string,
    status: ValidationStatus,
    evidence?: string
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const updated = archetype[field].map((h) =>
      h.id === hypothesisId
        ? {
            ...h,
            status,
            evidence,
            validatedAt: status === 'validated' ? serverTimestamp() : undefined,
          }
        : h
    )
    await updateArchetype(archetypeId, { [field]: updated })
  }

  async function removeHypothesis(
    archetypeId: string,
    field: 'specificPainPoints' | 'currentSolutions' | 'primaryGoals' | 'successMetrics' | 'buyingCriteria' | 'objections',
    hypothesisId: string
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const updated = archetype[field].filter((h) => h.id !== hypothesisId)
    await updateArchetype(archetypeId, { [field]: updated })
  }

  // Interview question management
  async function addInterviewQuestion(
    archetypeId: string,
    question: string,
    purpose: string,
    hypothesisId?: string
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const newQuestion: InterviewQuestion = {
      id: generateId(),
      question,
      purpose,
      ...(hypothesisId && { hypothesisId }),
    }

    const updated = [...archetype.interviewQuestions, newQuestion]
    await updateArchetype(archetypeId, { interviewQuestions: updated })
  }

  async function removeInterviewQuestion(
    archetypeId: string,
    questionId: string
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const updated = archetype.interviewQuestions.filter((q) => q.id !== questionId)
    await updateArchetype(archetypeId, { interviewQuestions: updated })
  }

  // Interview notes management
  async function addInterviewNote(
    archetypeId: string,
    note: Omit<InterviewNote, 'id' | 'createdAt'>
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const newNote: InterviewNote = {
      ...note,
      id: generateId(),
      createdAt: Timestamp.now(),  // Use Timestamp.now() instead of serverTimestamp() for arrays
    }

    const updated = [...archetype.interviewNotes, newNote]
    await updateArchetype(archetypeId, { interviewNotes: updated })
  }

  async function updateInterviewNote(
    archetypeId: string,
    noteId: string,
    data: Partial<InterviewNote>
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const updated = archetype.interviewNotes.map((n) =>
      n.id === noteId ? { ...n, ...data } : n
    )
    await updateArchetype(archetypeId, { interviewNotes: updated })
  }

  // Value proposition management
  async function addValueProposition(
    archetypeId: string,
    proposition: Omit<ValuePropositionMap, 'id'>
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const newProp: ValuePropositionMap = {
      ...proposition,
      id: generateId(),
    }

    const updated = [...archetype.valuePropositions, newProp]
    await updateArchetype(archetypeId, { valuePropositions: updated })
  }

  async function updateValueProposition(
    archetypeId: string,
    propId: string,
    data: Partial<ValuePropositionMap>
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const updated = archetype.valuePropositions.map((p) =>
      p.id === propId ? { ...p, ...data } : p
    )
    await updateArchetype(archetypeId, { valuePropositions: updated })
  }

  async function removeValueProposition(
    archetypeId: string,
    propId: string
  ): Promise<void> {
    const archetype = archetypes.value.find((a) => a.id === archetypeId)
    if (!archetype) throw new Error('Archetype not found')

    const updated = archetype.valuePropositions.filter((p) => p.id !== propId)
    await updateArchetype(archetypeId, { valuePropositions: updated })
  }

  async function deleteArchetype(id: string): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to delete archetypes')
    }

    try {
      await deleteDoc(doc(db, 'customerArchetypes', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete archetype'
      error.value = message
      throw e
    }
  }

  // Project management
  async function addProject(data: {
    name: string
    productContext: string
    businessModel: string
  }): Promise<string> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to add projects')
    }

    saving.value = true
    error.value = null

    try {
      const docRef = await addDoc(collection(db, 'archetypeProjects'), {
        ...data,
        archetypeIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      })
      return docRef.id
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add project'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  function getArchetypeById(id: string): CustomerArchetype | undefined {
    return archetypes.value.find((a) => a.id === id)
  }

  function getProjectById(id: string): ArchetypeProject | undefined {
    return projects.value.find((p) => p.id === id)
  }

  return {
    archetypes,
    projects,
    loading,
    saving,
    error,
    draftArchetypes,
    activeArchetypes,
    validatedArchetypes,
    archivedArchetypes,
    archetypesByRole,
    subscribe,
    unsubscribe: unsubscribeAll,
    addArchetype,
    updateArchetype,
    updatePhase,
    updateStatus,
    addHypothesis,
    updateHypothesisStatus,
    removeHypothesis,
    addInterviewQuestion,
    removeInterviewQuestion,
    addInterviewNote,
    updateInterviewNote,
    addValueProposition,
    updateValueProposition,
    removeValueProposition,
    deleteArchetype,
    addProject,
    getArchetypeById,
    getProjectById,
    calculateConfidenceScore,
    calculateReadinessScore,
    detectBSFlags,
  }
})
