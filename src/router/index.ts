import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types'

// Route meta types
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    roles?: UserRole[]
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Login' },
  },
  {
    path: '/',
    component: () => import('@/components/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: 'Dashboard', roles: ['cpo', 'team', 'leadership'] },
      },
      {
        path: 'vision',
        name: 'Vision',
        component: () => import('@/views/VisionView.vue'),
        meta: { title: 'Vision & Principles', roles: ['cpo', 'team', 'leadership'] },
      },
      {
        path: 'focus-areas',
        name: 'FocusAreas',
        component: () => import('@/views/FocusAreasView.vue'),
        meta: { title: 'Focus Areas', roles: ['cpo', 'team', 'leadership'] },
      },
      {
        path: 'strategic-context',
        name: 'StrategicContext',
        component: () => import('@/views/StrategicContextView.vue'),
        meta: { title: 'Strategic Context', roles: ['cpo', 'team'] },
      },
      {
        path: 'objectives',
        name: 'Objectives',
        component: () => import('@/views/ObjectivesView.vue'),
        meta: { title: 'Team Objectives', roles: ['cpo', 'team'] },
      },
      {
        path: 'discovery',
        name: 'Discovery',
        component: () => import('@/views/DiscoveryView.vue'),
        meta: { title: 'Discovery Hub', roles: ['cpo', 'team'] },
      },
      {
        path: 'delivery',
        name: 'Delivery',
        component: () => import('@/views/DeliveryView.vue'),
        meta: { title: 'Delivery Tracker', roles: ['cpo', 'team'] },
      },
      {
        path: 'decisions',
        name: 'Decisions',
        component: () => import('@/views/DecisionsView.vue'),
        meta: { title: 'Decisions Log', roles: ['cpo', 'team'] },
      },
      {
        path: 'documents',
        name: 'Documents',
        component: () => import('@/views/DocumentsView.vue'),
        meta: { title: 'Documents', roles: ['cpo', 'team'] },
      },
      {
        path: 'idea-hopper',
        name: 'IdeaHopper',
        component: () => import('@/views/IdeaHopperView.vue'),
        meta: { title: 'Idea Hopper', roles: ['cpo', 'team'] },
      },
      {
        path: 'journey-maps',
        name: 'JourneyMaps',
        component: () => import('@/views/JourneyMapsView.vue'),
        meta: { title: 'Journey Maps', roles: ['cpo', 'team'] },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  // Wait for auth to initialize if still loading
  if (authStore.loading) {
    await authStore.initAuth()
  }

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiredRoles = to.meta.roles as UserRole[] | undefined

  // Not authenticated but route requires auth
  if (requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'Login', query: { redirect: to.fullPath } })
  }

  // Already authenticated but going to login
  if (to.name === 'Login' && authStore.isAuthenticated) {
    return next({ name: 'Dashboard' })
  }

  // Check role-based access
  if (requiredRoles && authStore.role) {
    if (!requiredRoles.includes(authStore.role)) {
      // Redirect to dashboard if user doesn't have required role
      return next({ name: 'Dashboard' })
    }
  }

  // Update document title
  if (to.meta.title) {
    document.title = `${to.meta.title} | Signal`
  }

  next()
})

export default router
