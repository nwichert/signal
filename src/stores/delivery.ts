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
import type { ChangelogEntry, Blocker } from '@/types'
import { useAuthStore } from './auth'

export const useDeliveryStore = defineStore('delivery', () => {
  const changelog = ref<ChangelogEntry[]>([])
  const blockers = ref<Blocker[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)

  let unsubChangelog: (() => void) | null = null
  let unsubBlockers: (() => void) | null = null

  const openBlockers = computed(() =>
    blockers.value.filter((b) => b.status === 'open')
  )

  const resolvedBlockers = computed(() =>
    blockers.value.filter((b) => b.status === 'resolved')
  )

  function subscribe() {
    if (unsubChangelog) return

    loading.value = true

    const changelogQuery = query(collection(db, 'changelog'), orderBy('shippedAt', 'desc'))
    unsubChangelog = onSnapshot(
      changelogQuery,
      (snapshot) => {
        changelog.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ChangelogEntry[]
        loading.value = false
      },
      (err) => {
        console.error('Changelog subscription error:', err)
        error.value = err.message
        loading.value = false
      }
    )

    const blockersQuery = query(collection(db, 'blockers'), orderBy('createdAt', 'desc'))
    unsubBlockers = onSnapshot(
      blockersQuery,
      (snapshot) => {
        blockers.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Blocker[]
      },
      (err) => {
        console.error('Blockers subscription error:', err)
      }
    )
  }

  function unsubscribeFromDelivery() {
    if (unsubChangelog) {
      unsubChangelog()
      unsubChangelog = null
    }
    if (unsubBlockers) {
      unsubBlockers()
      unsubBlockers = null
    }
  }

  async function addChangelogEntry(data: {
    title: string
    description: string
    type: 'feature' | 'fix' | 'improvement' | 'technical'
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    saving.value = true
    error.value = null

    try {
      await addDoc(collection(db, 'changelog'), {
        ...data,
        shippedAt: serverTimestamp(),
        createdBy: authStore.user?.id,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add changelog entry'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function deleteChangelogEntry(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      await deleteDoc(doc(db, 'changelog', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete changelog entry'
      error.value = message
      throw e
    }
  }

  async function addBlocker(data: {
    title: string
    description: string
    owner: string
  }) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    saving.value = true
    error.value = null

    try {
      await addDoc(collection(db, 'blockers'), {
        ...data,
        status: 'open',
        createdAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to add blocker'
      error.value = message
      throw e
    } finally {
      saving.value = false
    }
  }

  async function resolveBlocker(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const docRef = doc(db, 'blockers', id)
      await updateDoc(docRef, {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to resolve blocker'
      error.value = message
      throw e
    }
  }

  async function reopenBlocker(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      const docRef = doc(db, 'blockers', id)
      await updateDoc(docRef, {
        status: 'open',
        resolvedAt: null,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to reopen blocker'
      error.value = message
      throw e
    }
  }

  async function deleteBlocker(id: string) {
    const authStore = useAuthStore()
    if (!authStore.canEdit) {
      throw new Error('Not authorized')
    }

    try {
      await deleteDoc(doc(db, 'blockers', id))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete blocker'
      error.value = message
      throw e
    }
  }

  return {
    changelog,
    blockers,
    openBlockers,
    resolvedBlockers,
    loading,
    saving,
    error,
    subscribe,
    unsubscribe: unsubscribeFromDelivery,
    addChangelogEntry,
    deleteChangelogEntry,
    addBlocker,
    resolveBlocker,
    reopenBlocker,
    deleteBlocker,
  }
})
