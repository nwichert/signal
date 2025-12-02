import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/config'
import type { Vision, Principle } from '@/types'
import { useAuthStore } from './auth'

const VISION_DOC_ID = 'main'

export const useVisionStore = defineStore('vision', () => {
  const vision = ref<Vision | null>(null)
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  function subscribe() {
    if (unsubscribe) return

    loading.value = true
    const docRef = doc(db, 'vision', VISION_DOC_ID)

    unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          vision.value = { id: snapshot.id, ...snapshot.data() } as Vision
        } else {
          vision.value = null
        }
        loading.value = false
      },
      (err) => {
        console.error('Vision subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeFromVision() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function saveVision(data: { companyUrl?: string; coreBusinessModel?: string; mission: string; vision: string; principles: Principle[] }) {
    const authStore = useAuthStore()
    if (!authStore.canEditVision) {
      throw new Error('Not authorized to edit vision')
    }

    saving.value = true
    error.value = null

    try {
      const docRef = doc(db, 'vision', VISION_DOC_ID)
      await setDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: authStore.user?.id,
      }, { merge: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save vision'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function addPrinciple(title: string, description: string) {
    if (!vision.value) {
      await saveVision({
        companyUrl: '',
        coreBusinessModel: '',
        mission: '',
        vision: '',
        principles: [{ id: crypto.randomUUID(), order: 0, title, description }],
      })
      return
    }

    const newPrinciple: Principle = {
      id: crypto.randomUUID(),
      order: vision.value.principles?.length || 0,
      title,
      description,
    }

    await saveVision({
      companyUrl: vision.value.companyUrl || '',
      coreBusinessModel: vision.value.coreBusinessModel || '',
      mission: vision.value.mission || '',
      vision: vision.value.vision || '',
      principles: [...(vision.value.principles || []), newPrinciple],
    })
  }

  async function updatePrinciple(id: string, title: string, description: string) {
    if (!vision.value?.principles) return

    const principles = vision.value.principles.map((p) =>
      p.id === id ? { ...p, title, description } : p
    )

    await saveVision({
      companyUrl: vision.value.companyUrl || '',
      coreBusinessModel: vision.value.coreBusinessModel || '',
      mission: vision.value.mission || '',
      vision: vision.value.vision || '',
      principles,
    })
  }

  async function deletePrinciple(id: string) {
    if (!vision.value?.principles) return

    const principles = vision.value.principles
      .filter((p) => p.id !== id)
      .map((p, index) => ({ ...p, order: index }))

    await saveVision({
      companyUrl: vision.value.companyUrl || '',
      coreBusinessModel: vision.value.coreBusinessModel || '',
      mission: vision.value.mission || '',
      vision: vision.value.vision || '',
      principles,
    })
  }

  async function reorderPrinciples(principles: Principle[]) {
    if (!vision.value) return

    await saveVision({
      companyUrl: vision.value.companyUrl || '',
      coreBusinessModel: vision.value.coreBusinessModel || '',
      mission: vision.value.mission || '',
      vision: vision.value.vision || '',
      principles: principles.map((p, index) => ({ ...p, order: index })),
    })
  }

  return {
    vision,
    loading,
    saving,
    error,
    subscribe,
    unsubscribe: unsubscribeFromVision,
    saveVision,
    addPrinciple,
    updatePrinciple,
    deletePrinciple,
    reorderPrinciples,
  }
})
