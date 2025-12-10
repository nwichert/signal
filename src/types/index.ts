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
  // Strategic links - which focus areas embody this principle
  focusAreaIds?: string[]
}

// Focus Areas
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type FocusAreaStatus = 'active' | 'validating' | 'scaling' | 'achieved' | 'pivoted' | 'paused' | 'archived'
export type ConfidenceTrend = 'improving' | 'stable' | 'declining'

export interface ConfidenceSnapshot {
  level: ConfidenceLevel
  rationale: string
  changedAt: Timestamp
  changedBy: string
}

export interface FocusArea {
  id: string
  title: string
  problemStatement: string
  confidenceLevel: ConfidenceLevel
  confidenceRationale: string
  confidenceTrend?: ConfidenceTrend
  confidenceHistory?: ConfidenceSnapshot[]
  successCriteria: string[]
  progressPercentage?: number  // 0-100
  status: FocusAreaStatus
  statusHistory?: Array<{
    status: FocusAreaStatus
    changedAt: Timestamp
    changedBy: string
    reason?: string
  }>
  // Strategic priority
  strategicImportance?: string  // Why this is prioritized now
  expectedOutcome?: string      // What success looks like
  // Cross-feature links
  targetArchetypeIds?: string[]  // Which customer archetypes experience this problem
  principleIds?: string[]        // Which principles this focus area embodies
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// Discovery Hub - Hypotheses
export type HypothesisStatus = 'active' | 'validated' | 'invalidated' | 'parked'
export type RiskType = 'desirable' | 'feasible' | 'viable'
export type EvidenceType = 'interview' | 'usage-data' | 'ab-test' | 'prototype' | 'survey' | 'expert-review' | 'design-partner'
export type EvidenceStrength = 'weak' | 'moderate' | 'strong'

export interface HypothesisEvidence {
  id: string
  type: EvidenceType
  description: string
  sampleSize?: number
  dataSource?: string
  strength: EvidenceStrength
  documentIds?: string[]  // Link to supporting docs
  designPartnerId?: string  // Link to design partner who provided evidence
  createdAt: Timestamp
  createdBy: string
}

export interface Hypothesis {
  id: string
  belief: string
  test: string
  result: string
  status: HypothesisStatus
  risks: RiskType[]
  focusAreaId?: string
  // Evidence tracking
  evidence?: HypothesisEvidence[]
  overallEvidenceStrength?: EvidenceStrength
  validatedAt?: Timestamp
  invalidatedAt?: Timestamp
  // Strategic context
  expectedImpact?: string  // What will change if validated
  priority?: 'high' | 'medium' | 'low'
  // Cross-feature links
  archetypeId?: string  // Which customer archetype this hypothesis is about
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// Design Partners - CRM-light for managing partner relationships
export type DesignPartnerStatus = 'prospect' | 'active' | 'paused' | 'churned'
export type EngagementType = 'call' | 'demo' | 'feedback-session' | 'usability-test' | 'interview' | 'email' | 'other'

export interface DesignPartnerEngagement {
  id: string
  date: Timestamp
  type: EngagementType
  title: string
  notes: string
  keyTakeaways: string[]
  createdAt: Timestamp
}

export interface DesignPartnerFeedback {
  id: string
  content: string
  theme: string
  hypothesisId?: string  // Links feedback to hypothesis for validation
  engagementId?: string  // Which engagement session this came from
  createdAt: Timestamp
}

export interface DesignPartnerInsight {
  id: string
  content: string
  category: 'pain-point' | 'feature-request' | 'validation' | 'surprise' | 'quote'
  priority: 'high' | 'medium' | 'low'
  createdAt: Timestamp
}

export interface DesignPartner {
  id: string
  // Contact Info
  name: string                    // Partner/company name
  contactName: string             // Primary contact person
  contactEmail?: string
  contactRole?: string            // Their job title/role
  company?: string                // Company name if different from partner name

  // Relationship
  status: DesignPartnerStatus
  startDate?: Timestamp

  // Context
  notes?: string                  // General notes about the partner

  // Activity Data
  engagements: DesignPartnerEngagement[]
  feedback: DesignPartnerFeedback[]
  insights: DesignPartnerInsight[]

  // Cross-feature links
  archetypeId?: string            // Which customer archetype they represent

  // Meta
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// Legacy Feedback type - kept for migration but will be deprecated
export interface Feedback {
  id: string
  source: string
  content: string
  theme: string
  hypothesisId?: string
  // Cross-feature links
  archetypeId?: string  // Which customer archetype this feedback is from
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
  // Cross-feature links
  focusAreaId?: string           // Which focus area this addresses
  validatedHypothesisIds?: string[]  // Which hypotheses this feature validates
}

export interface Blocker {
  id: string
  title: string
  description: string
  owner: string
  status: 'open' | 'resolved'
  createdAt: Timestamp
  resolvedAt?: Timestamp
  // Cross-feature links
  focusAreaId?: string  // Which focus area is blocked
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
  // Cross-feature links
  focusAreaIds?: string[]  // Which focus areas this objective addresses
}

// Decisions Log
export type DecisionStatus = 'proposed' | 'decided' | 'revisited'
export type DecisionCategory = 'product' | 'technical' | 'process' | 'strategy'
export type ImplementationStatus = 'not-started' | 'in-progress' | 'completed' | 'blocked' | 'abandoned'

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
  // Implementation tracking
  implementationStatus?: ImplementationStatus
  implementationStartDate?: Timestamp
  implementationCompletedDate?: Timestamp
  actualOutcome?: string         // What actually happened after implementation
  lessonsLearned?: string        // What we learned from this decision
  wouldDecideSameAgain?: boolean // Retrospective assessment
  // Cross-feature links
  focusAreaId?: string          // Which focus area this decision affects
  relatedHypothesisIds?: string[]  // Hypotheses informing this decision
  changelogIds?: string[]        // Features/changes that implemented this decision
  // Auto-generated decision metadata
  autoGenerated?: boolean        // Was this decision auto-created from hypothesis validation?
  sourceHypothesisId?: string    // If auto-generated, which hypothesis triggered it
}

// Knowledge Center - Documents Repository
export type DocumentType = 'knowledge' | 'inspiration'

export type KnowledgeCategory =
  | 'strategy'      // Company/product strategy docs
  | 'brand'         // Brand guidelines, voice & tone
  | 'research'      // User research, market research
  | 'technical'     // Technical specs, architecture docs
  | 'process'       // Team processes, playbooks
  | 'reference'     // General reference material
  | 'transcript'    // Audio transcriptions from interviews/calls

export type InspirationCategory =
  | 'ux-pattern'    // UI/UX patterns and examples
  | 'competitor'    // Competitor screenshots/analysis
  | 'article'       // Interesting articles/posts
  | 'visual'        // Visual design inspiration
  | 'product'       // Product ideas from other products
  | 'other'         // Miscellaneous inspiration

export type DocumentCategory = KnowledgeCategory | InspirationCategory

// Source type for transcripts - where the recording came from
export type TranscriptSourceType = 'interview' | 'journey-map' | 'general'

export interface Document {
  id: string
  name: string
  description: string
  documentType: DocumentType           // 'knowledge' or 'inspiration'
  category: DocumentCategory
  fileName: string
  fileSize: number
  fileType: string
  storageUrl: string
  storagePath: string
  externalUrl?: string                 // Optional external URL (e.g., Google Doc, Notion, etc.)
  thumbnailUrl?: string                // For inspiration images - auto-generated preview
  tags: string[]
  priority: 1 | 2 | 3                  // 1 = high priority context, 2 = medium, 3 = low
  isProcessed?: boolean                // For knowledge docs: has AI processed/chunked this?
  summary?: string                     // AI-generated summary for quick reference
  uploadedBy: string
  uploadedByName: string
  createdAt: Timestamp
  updatedAt: Timestamp
  // Cross-feature links
  archetypeIds?: string[]              // Which archetypes this document relates to
  focusAreaIds?: string[]              // Which focus areas this document relates to
  // Transcript-specific fields
  sourceType?: TranscriptSourceType    // For transcripts: where the recording came from
  sourceId?: string                    // For transcripts: ID of the source (archetypeId, journeyMapId, etc.)
  transcriptDuration?: number          // For transcripts: duration in seconds
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
  // Cross-feature links
  targetArchetypeId?: string  // Which customer archetype this idea serves
}

// Customer Archetypes - Steve Blank Customer Discovery
export type StakeholderRole = 'user' | 'payer' | 'economic_buyer' | 'decision_maker' | 'influencer' | 'recommender' | 'saboteur'
export type ArchetypePhase = 'setup' | 'hypothesis' | 'interview_prep' | 'synthesis' | 'validated'
export type ValidationStatus = 'hypothesis' | 'partially_validated' | 'validated' | 'invalidated'

export interface ArchetypeHypothesis {
  id: string
  content: string
  status: ValidationStatus
  validatedAt?: Timestamp
  evidence?: string
}

export interface InterviewNote {
  id: string
  date: Timestamp
  interviewee: string
  role: string
  rawNotes: string
  keyInsights: string[]
  surprises: string[]
  contradictions: string[]
  validatedHypotheses: string[]  // hypothesis IDs
  invalidatedHypotheses: string[] // hypothesis IDs
  createdAt: Timestamp
}

export interface InterviewQuestion {
  id: string
  question: string
  purpose: string
  hypothesisId?: string  // which hypothesis this validates
}

export interface CustomerArchetype {
  id: string
  // Basic Info
  name: string
  stakeholderRole: StakeholderRole
  customRoleName?: string  // for custom personality types beyond the 7 primary
  phase: ArchetypePhase

  // Profile (Who they are)
  jobTitle: string
  dailyReality: string
  background: string
  demographics?: string

  // Problems (Their pains)
  problemStatement: string
  specificPainPoints: ArchetypeHypothesis[]
  currentSolutions: ArchetypeHypothesis[]  // How they solve it today (workarounds)

  // Goals & Metrics (How they're measured)
  primaryGoals: ArchetypeHypothesis[]
  successMetrics: ArchetypeHypothesis[]

  // Buying Process (Who decides)
  budgetAuthority: ValidationStatus
  decisionProcess: string
  buyingCriteria: ArchetypeHypothesis[]
  objections: ArchetypeHypothesis[]

  // Value Proposition Mapping
  valuePropositions: ValuePropositionMap[]

  // Interview Tracking
  interviewQuestions: InterviewQuestion[]
  interviewNotes: InterviewNote[]
  interviewTarget: number  // target number of interviews

  // Validation
  confidenceScore: number  // 0-100, calculated from validated hypotheses
  readinessScore: number   // 0-100, interview readiness
  bsFlags: string[]        // marketing speak that needs validation

  // Meta
  status: 'draft' | 'active' | 'validated' | 'archived'
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  // Cross-feature links
  relatedFocusAreaIds?: string[]  // Which focus areas this archetype relates to
}

export interface ValuePropositionMap {
  id: string
  proposition: string
  relevanceScore: 1 | 2 | 3 | 4 | 5  // how relevant to this archetype
  painAddressed: string  // which pain point this addresses
  status: ValidationStatus
  evidence?: string
}

export interface ArchetypeProject {
  id: string
  name: string
  productContext: string
  businessModel: string
  archetypeIds: string[]
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
  // Cross-feature links
  archetypeId?: string  // Which archetype experiences this journey
}

// Cross-feature relationship helper type
export interface RelatedItems {
  focusAreas: FocusArea[]
  archetypes: CustomerArchetype[]
  hypotheses: Hypothesis[]
  ideas: Idea[]
  decisions: Decision[]
  objectives: Objective[]
  journeyMaps: JourneyMap[]
  documents: Document[]
  feedback: Feedback[]
  changelog: ChangelogEntry[]
  blockers: Blocker[]
}

// Executive Metrics Types
export interface FocusAreaMetrics {
  id: string
  title: string
  status: FocusAreaStatus
  confidenceLevel: ConfidenceLevel
  confidenceTrend: ConfidenceTrend
  totalHypotheses: number
  validatedHypotheses: number
  invalidatedHypotheses: number
  activeHypotheses: number
  validationRate: number  // % validated of resolved
  customerInterviewCount: number  // From linked archetypes
  deliveredFeatures: number  // From changelog
  openBlockers: number
  daysActive: number
  lastActivityDate?: Date
  progressPercentage: number
}

export interface DiscoveryMetrics {
  hypothesesCreatedThisWeek: number
  hypothesesResolvedThisWeek: number
  validatedThisWeek: number
  invalidatedThisWeek: number
  avgTimeToValidation: number  // days
  validationRate: number  // % validated of resolved
  evidenceQualityScore: number  // 0-100 based on evidence strength distribution
  weekOverWeekChange: number  // % change in velocity
}

export interface CustomerDiscoveryHealth {
  totalArchetypes: number
  archetypesWithSufficientInterviews: number  // >= target
  avgInterviewsPerArchetype: number
  interviewVelocity: number  // interviews per week (last 30 days)
  hypothesisValidationRate: number  // % validated across all archetypes
  avgConfidenceScore: number  // Average archetype confidence
  archetypesAtRisk: number  // Low confidence + no recent interviews
}

export interface StrategicAlignmentScore {
  objectivesWithFocusAreas: number  // % of OKRs linked to strategy
  decisionsWithEvidence: number  // % backed by hypotheses
  focusAreasWithArchetypes: number  // % with target customers
  hypothesesWithArchetypes: number  // % grounded in customer
  deliveryWithHypotheses: number  // % of shipped features validating hypotheses
  overallScore: number  // Weighted average 0-100
}

export interface ExecutiveMetrics {
  focusAreaMetrics: FocusAreaMetrics[]
  discoveryMetrics: DiscoveryMetrics
  customerDiscoveryHealth: CustomerDiscoveryHealth
  strategicAlignmentScore: StrategicAlignmentScore
  topInsights: string[]  // Recent key learnings
  riskIndicators: Array<{
    type: 'blocker' | 'stalled-focus-area' | 'low-evidence' | 'orphaned-okr'
    message: string
    severity: 'high' | 'medium' | 'low'
    path?: string
  }>
}
