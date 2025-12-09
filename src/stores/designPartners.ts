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
  DesignPartner,
  DesignPartnerStatus,
  DesignPartnerEngagement,
  DesignPartnerFeedback,
  DesignPartnerInsight,
  EngagementType,
} from '@/types'
import { useAuthStore } from './auth'

function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

export const useDesignPartnersStore = defineStore('designPartners', () => {
  const partners = ref<DesignPartner[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  // Filtered views by status
  const prospectPartners = computed(() =>
    partners.value.filter((p) => p.status === 'prospect')
  )

  const activePartners = computed(() =>
    partners.value.filter((p) => p.status === 'active')
  )

  const pausedPartners = computed(() =>
    partners.value.filter((p) => p.status === 'paused')
  )

  const churnedPartners = computed(() =>
    partners.value.filter((p) => p.status === 'churned')
  )

  // Get partners by archetype
  const partnersByArchetype = computed(() => {
    const byArchetype: Record<string, DesignPartner[]> = {}
    partners.value.forEach((p) => {
      if (p.archetypeId) {
        if (!byArchetype[p.archetypeId]) {
          byArchetype[p.archetypeId] = []
        }
        byArchetype[p.archetypeId]!.push(p)
      }
    })
    return byArchetype
  })

  // Get all feedback across all partners (for Discovery Hub integration)
  const allFeedback = computed(() => {
    const feedback: Array<DesignPartnerFeedback & { partnerId: string; partnerName: string }> = []
    partners.value.forEach((p) => {
      p.feedback.forEach((f) => {
        feedback.push({
          ...f,
          partnerId: p.id,
          partnerName: p.name,
        })
      })
    })
    return feedback.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0
      const bTime = b.createdAt?.toMillis?.() || 0
      return bTime - aTime
    })
  })

  function subscribe() {
    if (unsubscribe) return

    loading.value = true

    const partnersQuery = query(
      collection(db, 'designPartners'),
      orderBy('createdAt', 'desc')
    )

    unsubscribe = onSnapshot(
      partnersQuery,
      (snapshot) => {
        partners.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as DesignPartner[]
        loading.value = false
      },
      (err) => {
        console.error('Design Partners subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeAll() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function addPartner(data: {
    name: string
    contactName: string
    contactEmail?: string
    contactRole?: string
    company?: string
    status?: DesignPartnerStatus
    archetypeId?: string
    notes?: string
  }): Promise<string> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to add design partners')
    }

    saving.value = true
    error.value = null

    try {
      const newPartner: Omit<DesignPartner, 'id'> = {
        name: data.name,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactRole: data.contactRole,
        company: data.company,
        status: data.status || 'prospect',
        archetypeId: data.archetypeId,
        notes: data.notes,
        engagements: [],
        feedback: [],
        insights: [],
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any,
        createdBy: authStore.user?.id || '',
      }

      const docRef = await addDoc(collection(db, 'designPartners'), newPartner)
      return docRef.id
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add partner'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updatePartner(
    id: string,
    data: Partial<DesignPartner>
  ): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to update design partners')
    }

    saving.value = true
    error.value = null

    try {
      const updateData: Record<string, unknown> = {
        ...data,
        updatedAt: serverTimestamp(),
      }

      const docRef = doc(db, 'designPartners', id)
      await updateDoc(docRef, updateData)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update partner'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateStatus(id: string, status: DesignPartnerStatus): Promise<void> {
    await updatePartner(id, { status })
  }

  // Engagement management
  async function addEngagement(
    partnerId: string,
    data: {
      type: EngagementType
      title: string
      date: Date
      notes: string
      keyTakeaways?: string[]
    }
  ): Promise<void> {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner) throw new Error('Partner not found')

    const newEngagement: DesignPartnerEngagement = {
      id: generateId(),
      type: data.type,
      title: data.title,
      date: Timestamp.fromDate(data.date),
      notes: data.notes,
      keyTakeaways: data.keyTakeaways || [],
      createdAt: Timestamp.now(),
    }

    const updated = [...partner.engagements, newEngagement]
    await updatePartner(partnerId, { engagements: updated })
  }

  async function updateEngagement(
    partnerId: string,
    engagementId: string,
    data: Partial<DesignPartnerEngagement>
  ): Promise<void> {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner) throw new Error('Partner not found')

    const updated = partner.engagements.map((e) =>
      e.id === engagementId ? { ...e, ...data } : e
    )
    await updatePartner(partnerId, { engagements: updated })
  }

  async function removeEngagement(partnerId: string, engagementId: string): Promise<void> {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner) throw new Error('Partner not found')

    const updated = partner.engagements.filter((e) => e.id !== engagementId)
    await updatePartner(partnerId, { engagements: updated })
  }

  // Feedback management
  async function addFeedback(
    partnerId: string,
    data: {
      content: string
      theme: string
      hypothesisId?: string
      engagementId?: string
    }
  ): Promise<void> {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner) throw new Error('Partner not found')

    const newFeedback: DesignPartnerFeedback = {
      id: generateId(),
      content: data.content,
      theme: data.theme,
      hypothesisId: data.hypothesisId,
      engagementId: data.engagementId,
      createdAt: Timestamp.now(),
    }

    const updated = [...partner.feedback, newFeedback]
    await updatePartner(partnerId, { feedback: updated })
  }

  async function updateFeedback(
    partnerId: string,
    feedbackId: string,
    data: Partial<DesignPartnerFeedback>
  ): Promise<void> {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner) throw new Error('Partner not found')

    const updated = partner.feedback.map((f) =>
      f.id === feedbackId ? { ...f, ...data } : f
    )
    await updatePartner(partnerId, { feedback: updated })
  }

  async function removeFeedback(partnerId: string, feedbackId: string): Promise<void> {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner) throw new Error('Partner not found')

    const updated = partner.feedback.filter((f) => f.id !== feedbackId)
    await updatePartner(partnerId, { feedback: updated })
  }

  // Insight management
  async function addInsight(
    partnerId: string,
    data: {
      content: string
      category: 'pain-point' | 'feature-request' | 'validation' | 'surprise' | 'quote'
      priority: 'high' | 'medium' | 'low'
    }
  ): Promise<void> {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner) throw new Error('Partner not found')

    const newInsight: DesignPartnerInsight = {
      id: generateId(),
      content: data.content,
      category: data.category,
      priority: data.priority,
      createdAt: Timestamp.now(),
    }

    const updated = [...partner.insights, newInsight]
    await updatePartner(partnerId, { insights: updated })
  }

  async function removeInsight(partnerId: string, insightId: string): Promise<void> {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner) throw new Error('Partner not found')

    const updated = partner.insights.filter((i) => i.id !== insightId)
    await updatePartner(partnerId, { insights: updated })
  }

  async function deletePartner(id: string): Promise<void> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to delete design partners')
    }

    try {
      await deleteDoc(doc(db, 'designPartners', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete partner'
      error.value = message
      throw e
    }
  }

  function getPartnerById(id: string): DesignPartner | undefined {
    return partners.value.find((p) => p.id === id)
  }

  // Get count of partners by archetype (for archetype page)
  function getPartnerCountByArchetype(archetypeId: string): number {
    return partners.value.filter((p) => p.archetypeId === archetypeId).length
  }

  // Get most recent engagement for a partner
  function getLastEngagement(partnerId: string): DesignPartnerEngagement | undefined {
    const partner = partners.value.find((p) => p.id === partnerId)
    if (!partner || partner.engagements.length === 0) return undefined

    return partner.engagements.sort((a, b) => {
      const aTime = a.date?.toMillis?.() || 0
      const bTime = b.date?.toMillis?.() || 0
      return bTime - aTime
    })[0]
  }

  return {
    partners,
    loading,
    saving,
    error,
    prospectPartners,
    activePartners,
    pausedPartners,
    churnedPartners,
    partnersByArchetype,
    allFeedback,
    subscribe,
    unsubscribe: unsubscribeAll,
    addPartner,
    updatePartner,
    updateStatus,
    addEngagement,
    updateEngagement,
    removeEngagement,
    addFeedback,
    updateFeedback,
    removeFeedback,
    addInsight,
    removeInsight,
    deletePartner,
    getPartnerById,
    getPartnerCountByArchetype,
    getLastEngagement,
  }
})
