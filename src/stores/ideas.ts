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
import type { Idea, IdeaStatus, JobToBeDone } from '@/types'
import { useAuthStore } from './auth'

export const useIdeasStore = defineStore('ideas', () => {
  const ideas = ref<Idea[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  // Filter ideas by status
  const newIdeas = computed(() =>
    ideas.value.filter((idea) => idea.status === 'new')
  )

  const exploringIdeas = computed(() =>
    ideas.value.filter((idea) => idea.status === 'exploring')
  )

  const validatedIdeas = computed(() =>
    ideas.value.filter((idea) => idea.status === 'validated')
  )

  const parkedIdeas = computed(() =>
    ideas.value.filter((idea) => idea.status === 'parked')
  )

  const promotedIdeas = computed(() =>
    ideas.value.filter((idea) => idea.status === 'promoted')
  )

  function subscribe() {
    if (unsubscribe) return

    loading.value = true
    const q = query(collection(db, 'ideas'), orderBy('createdAt', 'desc'))

    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        ideas.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Idea[]
        loading.value = false
      },
      (err) => {
        console.error('Ideas subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeFromIdeas() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function addIdea(data: {
    title: string
    description: string
    job: JobToBeDone
    notes?: string
    focusAreaId?: string
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to add ideas')
    }

    saving.value = true
    error.value = null

    try {
      // Build document data, excluding undefined values
      const docData: Record<string, unknown> = {
        title: data.title,
        description: data.description,
        job: data.job,
        status: 'new' as IdeaStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      }

      // Only add optional fields if they have values
      if (data.notes) {
        docData.notes = data.notes
      }
      if (data.focusAreaId) {
        docData.focusAreaId = data.focusAreaId
      }

      await addDoc(collection(db, 'ideas'), docData)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add idea'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateIdea(
    id: string,
    data: Partial<{
      title: string
      description: string
      job: JobToBeDone
      status: IdeaStatus
      notes: string
      focusAreaId: string
    }>
  ) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to update ideas')
    }

    saving.value = true
    error.value = null

    try {
      // Build update data, excluding undefined values
      const updateData: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      }

      // Only add fields that are defined
      if (data.title !== undefined) {
        updateData.title = data.title
      }
      if (data.description !== undefined) {
        updateData.description = data.description
      }
      if (data.job !== undefined) {
        updateData.job = data.job
      }
      if (data.status !== undefined) {
        updateData.status = data.status
      }
      if (data.notes !== undefined) {
        updateData.notes = data.notes
      }
      if (data.focusAreaId !== undefined) {
        updateData.focusAreaId = data.focusAreaId
      }

      const docRef = doc(db, 'ideas', id)
      await updateDoc(docRef, updateData)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update idea'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateStatus(id: string, status: IdeaStatus) {
    await updateIdea(id, { status })
  }

  async function deleteIdea(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to delete ideas')
    }

    try {
      await deleteDoc(doc(db, 'ideas', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete idea'
      error.value = message
      throw e
    }
  }

  function getIdeaById(id: string): Idea | undefined {
    return ideas.value.find((idea) => idea.id === id)
  }

  return {
    ideas,
    newIdeas,
    exploringIdeas,
    validatedIdeas,
    parkedIdeas,
    promotedIdeas,
    loading,
    saving,
    error,
    subscribe,
    unsubscribe: unsubscribeFromIdeas,
    addIdea,
    updateIdea,
    updateStatus,
    deleteIdea,
    getIdeaById,
  }
})
