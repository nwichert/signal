import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db } from '@/firebase/config'
import { functions } from '@/firebase/config'
import type { StrategicContext, StrategicContextSection } from '@/types'
import { useAuthStore } from './auth'

const CONTEXT_DOC_ID = 'main'

export const useStrategicContextStore = defineStore('strategicContext', () => {
  const context = ref<StrategicContext | null>(null)
  const loading = ref(true)
  const saving = ref(false)
  const enriching = ref<StrategicContextSection | null>(null)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  function subscribe() {
    if (unsubscribe) return

    loading.value = true
    const docRef = doc(db, 'strategicContext', CONTEXT_DOC_ID)

    unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          context.value = { id: snapshot.id, ...snapshot.data() } as StrategicContext
        } else {
          context.value = null
        }
        loading.value = false
      },
      (err) => {
        console.error('Strategic context subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )
  }

  function unsubscribeFromContext() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  async function saveSection(section: StrategicContextSection, content: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized to edit strategic context')
    }

    saving.value = true
    error.value = null

    try {
      const docRef = doc(db, 'strategicContext', CONTEXT_DOC_ID)
      await setDoc(docRef, {
        [section]: content,
        updatedAt: serverTimestamp(),
        updatedBy: authStore.user?.id,
      }, { merge: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function saveCompanyContext(companyContext: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    saving.value = true
    error.value = null

    try {
      const docRef = doc(db, 'strategicContext', CONTEXT_DOC_ID)
      await setDoc(docRef, {
        companyContext,
        updatedAt: serverTimestamp(),
        updatedBy: authStore.user?.id,
      }, { merge: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function enrichSection(section: StrategicContextSection): Promise<string> {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    enriching.value = section
    error.value = null

    try {
      const enrichFn = httpsCallable<
        { section: string; currentContent?: string; companyContext?: string },
        { enrichedContent: string; usage: { inputTokens: number; outputTokens: number } }
      >(functions, 'enrichStrategicContext')

      const currentContent = context.value?.[section] || ''
      const companyContext = context.value?.companyContext || ''

      const result = await enrichFn({
        section,
        currentContent: currentContent || undefined,
        companyContext: companyContext || undefined,
      })

      return result.data.enrichedContent
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to enrich content'
      error.value = message
      throw e
    } finally {
      enriching.value = null
    }
  }

  function getSectionContent(section: StrategicContextSection): string {
    if (!context.value) return ''
    return context.value[section] || ''
  }

  return {
    context,
    loading,
    saving,
    enriching,
    error,
    subscribe,
    unsubscribe: unsubscribeFromContext,
    saveSection,
    saveCompanyContext,
    enrichSection,
    getSectionContent,
  }
})
