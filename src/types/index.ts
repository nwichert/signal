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
  companyUrl?: string
  coreBusinessModel?: string
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

// Strategic Context
export type StrategicContextSection =
  | 'marketDynamics'
  | 'enablingTechnologies'
  | 'competitiveLandscape'
  | 'customerPainEvolution'
  | 'keyInsights'

export interface StrategicContext {
  id: string
  marketDynamics: string
  enablingTechnologies: string
  competitiveLandscape: string
  customerPainEvolution: string
  keyInsights: string
  companyContext: string
  updatedAt: Timestamp
  updatedBy: string
}

// Team Objectives (OKRs)
export type ObjectiveStatus = 'active' | 'completed' | 'archived'
export type KeyResultStatus = 'on_track' | 'at_risk' | 'behind' | 'completed'

export interface KeyResult {
  id: string
  title: string
  target: number
  current: number
  unit: string
  status: KeyResultStatus
}

export interface Objective {
  id: string
  title: string
  description: string
  owner: string
  quarter: string // e.g., "Q1 2025"
  status: ObjectiveStatus
  keyResults: KeyResult[]
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// Decisions Log
export type DecisionStatus = 'proposed' | 'decided' | 'revisited'
export type DecisionCategory = 'product' | 'technical' | 'process' | 'strategy'

export interface DecisionOption {
  id: string
  title: string
  description: string
  pros: string[]
  cons: string[]
  selected: boolean
}

export interface Decision {
  id: string
  title: string
  context: string
  category: DecisionCategory
  status: DecisionStatus
  options: DecisionOption[]
  rationale: string
  outcome?: string
  owner: string
  decidedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// Documents Repository
export type DocumentCategory =
  | 'research'
  | 'design'
  | 'technical'
  | 'business'
  | 'legal'
  | 'other'

export interface Document {
  id: string
  name: string
  description: string
  category: DocumentCategory
  fileName: string
  fileSize: number
  fileType: string
  storageUrl: string
  storagePath: string
  externalUrl?: string  // Optional external URL (e.g., Google Doc, Notion, etc.)
  tags: string[]
  uploadedBy: string
  uploadedByName: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Idea Hopper - Jobs to be Done
export type JobType = 'functional' | 'social' | 'emotional'
export type IdeaStatus = 'new' | 'exploring' | 'validated' | 'parked' | 'promoted'

export interface JobToBeDone {
  progress: string      // The PROGRESS (what they're trying to accomplish)
  customer: string      // The CUSTOMER (who is trying to make progress)
  circumstance: string  // The CIRCUMSTANCE (when/where they need this)
  type: JobType         // functional, social, or emotional
}

export interface Idea {
  id: string
  title: string
  description: string
  job: JobToBeDone
  status: IdeaStatus
  focusAreaId?: string  // Optional link to a focus area
  notes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// Journey Maps
export type ExperienceLevel = 1 | 2 | 3 | 4 | 5

export interface JourneyStep {
  id: string
  order: number
  title: string
  description: string
  outcome: string
  timelineDay: number              // Cumulative day (e.g., 0, 2, 5, 10)
  negativeExperience: ExperienceLevel  // 1-5, 5 being most negative
  positiveExperience: ExperienceLevel  // 1-5, 5 being most positive
  painPointNote?: string           // Optional annotation for pain points
}

export interface JourneyMap {
  id: string
  title: string
  subtitle?: string
  ideaId: string                   // Link to an Idea (and its JTBD)
  steps: JourneyStep[]
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}
