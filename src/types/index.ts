import type { Timestamp } from 'firebase/firestore'

// User roles
export type UserRole = 'cpo' | 'team' | 'leadership'

// User profile
export interface User {
  id: string
  email: string
  displayName: string
  role: UserRole
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Vision & Principles
export interface Vision {
  id: string
  mission: string
  vision: string
  principles: Principle[]
  updatedAt: Timestamp
  updatedBy: string
}

export interface Principle {
  id: string
  order: number
  title: string
  description: string
}

// Focus Areas
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type FocusAreaStatus = 'active' | 'archived'

export interface FocusArea {
  id: string
  title: string
  problemStatement: string
  confidenceLevel: ConfidenceLevel
  confidenceRationale: string
  successCriteria: string[]
  status: FocusAreaStatus
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// Discovery Hub - Hypotheses
export type HypothesisStatus = 'active' | 'validated' | 'invalidated' | 'parked'
export type RiskType = 'valuable' | 'usable' | 'feasible' | 'viable'

export interface Hypothesis {
  id: string
  belief: string
  test: string
  result: string
  status: HypothesisStatus
  risks: RiskType[]
  focusAreaId?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// Design Partner Feedback
export interface Feedback {
  id: string
  source: string
  content: string
  theme: string
  hypothesisId?: string
  createdAt: Timestamp
  createdBy: string
}

// Insights
export interface Insight {
  id: string
  title: string
  content: string
  source: 'hypothesis' | 'feedback' | 'research'
  sourceId?: string
  createdAt: Timestamp
  createdBy: string
}

// Delivery Tracker
export interface ChangelogEntry {
  id: string
  title: string
  description: string
  type: 'feature' | 'fix' | 'improvement' | 'technical'
  shippedAt: Timestamp
  createdBy: string
}

export interface Blocker {
  id: string
  title: string
  description: string
  owner: string
  status: 'open' | 'resolved'
  createdAt: Timestamp
  resolvedAt?: Timestamp
}

// Dashboard aggregates
export interface DashboardStats {
  activeFocusAreas: number
  activeHypotheses: number
  validatedThisWeek: number
  openBlockers: number
}
