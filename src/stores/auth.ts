import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/firebase/config'
import type { User, UserRole } from '@/types'

const googleProvider = new GoogleAuthProvider()

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const firebaseUser = ref<FirebaseUser | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)
  const role = computed(() => user.value?.role ?? null)
  const isCPO = computed(() => role.value === 'cpo')
  const isTeam = computed(() => role.value === 'team' || role.value === 'cpo')
  const isLeadership = computed(() => role.value === 'leadership')

  // Check if user can view team-level content
  const canViewTeamContent = computed(() => isCPO.value || isTeam.value)

  // Check if user can edit content (CPO or team member)
  const canEdit = computed(() => isCPO.value || isTeam.value)

  // Check if user is CPO (can edit vision, principles, etc.)
  const canEditVision = computed(() => isCPO.value)

  async function fetchUserProfile(uid: string): Promise<User | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid))
      if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() } as User
      }
      return null
    } catch (e) {
      console.error('Error fetching user profile:', e)
      return null
    }
  }

  async function createUserProfile(fbUser: FirebaseUser, role: UserRole = 'team'): Promise<User> {
    const userRef = doc(db, 'users', fbUser.uid)
    const userData = {
      email: fbUser.email,
      displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
      role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(userRef, userData)
    return { id: fbUser.uid, ...userData } as User
  }

  async function signInWithGoogle() {
    error.value = null
    loading.value = true
    try {
      const result = await signInWithPopup(auth, googleProvider)
      let profile = await fetchUserProfile(result.user.uid)

      // Auto-create profile for new users (default role: team)
      if (!profile) {
        profile = await createUserProfile(result.user, 'team')
      }

      user.value = profile
      firebaseUser.value = result.user
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to sign in'
      error.value = errorMessage
      throw e
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    try {
      await firebaseSignOut(auth)
      user.value = null
      firebaseUser.value = null
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to sign out'
      error.value = errorMessage
      throw e
    }
  }

  function initAuth(): Promise<void> {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (fbUser) => {
        firebaseUser.value = fbUser
        if (fbUser) {
          const profile = await fetchUserProfile(fbUser.uid)
          user.value = profile
        } else {
          user.value = null
        }
        loading.value = false
        resolve()
      })
    })
  }

  function hasRole(requiredRole: UserRole | UserRole[]): boolean {
    if (!role.value) return false
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    return roles.includes(role.value)
  }

  return {
    user,
    firebaseUser,
    loading,
    error,
    isAuthenticated,
    role,
    isCPO,
    isTeam,
    isLeadership,
    canViewTeamContent,
    canEdit,
    canEditVision,
    signInWithGoogle,
    signOut,
    initAuth,
    hasRole,
  }
})
