<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useCustomerArchetypesStore } from '@/stores/customerArchetypes'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/firebase/config'
import type {
  CustomerArchetype,
  StakeholderRole,
  ArchetypePhase,
  ValidationStatus,
} from '@/types'
import { Timestamp } from 'firebase/firestore'

const authStore = useAuthStore()
const store = useCustomerArchetypesStore()

// View state
const selectedArchetypeId = ref<string | null>(null)
const showCreateModal = ref(false)
const activeTab = ref<'profile' | 'problems' | 'goals' | 'buying' | 'value_props' | 'interviews'>('profile')

// AI state
const aiLoading = ref(false)
const aiError = ref<string | null>(null)
const showAiDrawer = ref(false)

// Structured AI response data for actionable items
interface AiAssumption {
  assumption: string
  category: string
  riskScore: number
  validationApproach: string
  added?: boolean
}

interface AiQuestion {
  question: string
  purpose: string
  category: string
  followUps?: string[]
  added?: boolean
}

interface AiHypothesisUpdate {
  hypothesis: string
  category: string
  previousStatus: string
  newStatus: string
  evidence: string
  applied?: boolean
}

interface AiNewHypothesis {
  hypothesis: string
  category: string
  added?: boolean
}

const aiResponse = ref<{
  type: 'challenge' | 'questions' | 'synthesis' | 'assumptions'
  content: string[]
  suggestions?: string[]
  // Structured data for actionable items
  rawData?: {
    assumptions?: AiAssumption[]
    topRisks?: string[]
    overallReadiness?: string
    questions?: AiQuestion[]
    interviewFlow?: { opening: string; warmUp: string[]; core: string[]; closing: string }
    tips?: string[]
    synthesis?: {
      summary?: { keyInsight: string; confidenceLevel: string; recommendedNextSteps: string[] }
      patterns?: Array<{ pattern: string; frequency: string; significance: string }>
      hypothesisUpdates?: AiHypothesisUpdate[]
      contradictions?: Array<{ stated: string; revealed: string; implication: string }>
      newHypotheses?: AiNewHypothesis[]
      quotableInsights?: string[]
    }
  }
} | null>(null)

// Form states
const newArchetypeName = ref('')
const newArchetypeRole = ref<StakeholderRole>('user')
const newArchetypeCustomRole = ref('')

// Hypothesis form - separate refs for each field to avoid shared state
const hypothesisInputs = ref({
  specificPainPoints: '',
  currentSolutions: '',
  primaryGoals: '',
  successMetrics: '',
  buyingCriteria: '',
  objections: '',
})

// Interview question form
const newQuestionContent = ref('')
const newQuestionPurpose = ref('')

// Interview note form
const showInterviewForm = ref(false)
const interviewForm = ref({
  interviewee: '',
  role: '',
  rawNotes: '',
})

// Transcript analysis state
const transcriptAnalyzing = ref(false)
const transcriptAnalysis = ref<{
  interviewSummary?: {
    keyTakeaway: string
    interviewQuality: string
    customerFit: string
    recommendFollowUp: boolean
    followUpTopics: string[]
  }
  questionResponses?: Array<{
    questionId?: string
    question: string
    wasAnswered: boolean
    response: string
    directQuote?: string
    insight: string
  }>
  hypothesisValidations?: Array<{
    hypothesisId?: string
    hypothesisContent: string
    category: string
    previousStatus: string
    newStatus: string
    evidence: string
    confidence: string
    directQuote?: string
    applied?: boolean
  }>
  extractedInsights?: {
    keyInsights: string[]
    surprises: string[]
    contradictions: string[]
    quotableLines: string[]
  }
  suggestedProfileUpdates?: {
    dailyReality?: string
    problemStatement?: string
    background?: string
  }
  newHypotheses?: Array<{
    content: string
    category: string
    source: string
    added?: boolean
  }>
  actionItems?: string[]
} | null>(null)
const showTranscriptResults = ref(false)

// File upload ref
const fileInputRef = ref<HTMLInputElement | null>(null)

// Value proposition form
const showValuePropForm = ref(false)
const valuePropForm = ref({
  proposition: '',
  relevanceScore: 3 as 1 | 2 | 3 | 4 | 5,
  painAddressed: '',
})

onMounted(() => {
  store.subscribe()
})

onUnmounted(() => {
  store.unsubscribe()
})

// Computed
const selectedArchetype = computed(() => {
  if (!selectedArchetypeId.value) return null
  return store.getArchetypeById(selectedArchetypeId.value) || null
})

const stakeholderRoles: { value: StakeholderRole; label: string; description: string }[] = [
  { value: 'user', label: 'User', description: 'The person who actually uses your product' },
  { value: 'payer', label: 'Payer', description: 'The person who pays for your product' },
  { value: 'economic_buyer', label: 'Economic Buyer', description: 'Controls the budget' },
  { value: 'decision_maker', label: 'Decision Maker', description: 'Has final say on purchase' },
  { value: 'influencer', label: 'Influencer', description: 'Influences the decision' },
  { value: 'recommender', label: 'Recommender', description: 'Recommends solutions' },
  { value: 'saboteur', label: 'Saboteur', description: 'May block the purchase' },
]

const phaseLabels: Record<ArchetypePhase, { label: string; color: string }> = {
  setup: { label: 'Setup', color: 'bg-gray-100 text-gray-700' },
  hypothesis: { label: 'Hypothesis', color: 'bg-yellow-100 text-yellow-800' },
  interview_prep: { label: 'Interview Prep', color: 'bg-blue-100 text-blue-800' },
  synthesis: { label: 'Synthesis', color: 'bg-purple-100 text-purple-800' },
  validated: { label: 'Validated', color: 'bg-green-100 text-green-800' },
}

const validationColors: Record<ValidationStatus, string> = {
  hypothesis: 'bg-gray-100 text-gray-700 border-gray-200',
  partially_validated: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  validated: 'bg-green-100 text-green-800 border-green-200',
  invalidated: 'bg-red-100 text-red-800 border-red-200',
}

// Get interview readiness message
const readinessMessage = computed(() => {
  if (!selectedArchetype.value) return ''
  const score = selectedArchetype.value.readinessScore
  const interviews = selectedArchetype.value.interviewNotes.length
  const target = selectedArchetype.value.interviewTarget
  const remaining = target - interviews

  if (score >= 100) return 'Ready to export!'
  if (remaining > 0) return `Need ${remaining} more interview${remaining === 1 ? '' : 's'} to validate`
  return 'Analyze your interviews to reach validation'
})

// Functions
async function createArchetype() {
  if (!newArchetypeName.value.trim()) return

  const id = await store.addArchetype({
    name: newArchetypeName.value,
    stakeholderRole: newArchetypeRole.value,
    customRoleName: newArchetypeCustomRole.value || undefined,
  })

  selectedArchetypeId.value = id
  showCreateModal.value = false
  newArchetypeName.value = ''
  newArchetypeRole.value = 'user'
  newArchetypeCustomRole.value = ''
}

async function updateField(field: keyof CustomerArchetype, value: any) {
  if (!selectedArchetypeId.value) return
  await store.updateArchetype(selectedArchetypeId.value, { [field]: value })
}

type HypothesisField = keyof typeof hypothesisInputs.value

async function addHypothesis(field: HypothesisField) {
  const content = hypothesisInputs.value[field]
  if (!selectedArchetypeId.value || !content.trim()) return
  await store.addHypothesis(selectedArchetypeId.value, field, content)
  hypothesisInputs.value[field] = ''
}

async function updateHypothesisStatus(field: HypothesisField, hypothesisId: string, status: ValidationStatus, evidence?: string) {
  if (!selectedArchetypeId.value) return
  await store.updateHypothesisStatus(selectedArchetypeId.value, field, hypothesisId, status, evidence)
}

async function removeHypothesis(field: HypothesisField, hypothesisId: string) {
  if (!selectedArchetypeId.value) return
  await store.removeHypothesis(selectedArchetypeId.value, field, hypothesisId)
}

async function addInterviewQuestion() {
  if (!selectedArchetypeId.value || !newQuestionContent.value.trim()) return
  await store.addInterviewQuestion(selectedArchetypeId.value, newQuestionContent.value, newQuestionPurpose.value)
  newQuestionContent.value = ''
  newQuestionPurpose.value = ''
}

async function removeInterviewQuestion(questionId: string) {
  if (!selectedArchetypeId.value) return
  await store.removeInterviewQuestion(selectedArchetypeId.value, questionId)
}

async function addInterviewNote() {
  if (!selectedArchetypeId.value || !interviewForm.value.rawNotes.trim()) return

  await store.addInterviewNote(selectedArchetypeId.value, {
    date: Timestamp.now(),
    interviewee: interviewForm.value.interviewee,
    role: interviewForm.value.role,
    rawNotes: interviewForm.value.rawNotes,
    keyInsights: [],
    surprises: [],
    contradictions: [],
    validatedHypotheses: [],
    invalidatedHypotheses: [],
  })

  interviewForm.value = { interviewee: '', role: '', rawNotes: '' }
  showInterviewForm.value = false

  // Trigger AI synthesis
  await synthesizeInterviews()
}

// File upload handler
function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    if (content) {
      interviewForm.value.rawNotes = content
    }
  }
  reader.readAsText(file)

  // Reset the file input
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// Analyze transcript with AI
async function analyzeTranscript() {
  if (!selectedArchetypeId.value || !selectedArchetype.value || !interviewForm.value.rawNotes.trim()) return

  transcriptAnalyzing.value = true
  transcriptAnalysis.value = null

  try {
    const analyzeFn = httpsCallable(functions, 'analyzeTranscript')
    const result = await analyzeFn({
      transcript: interviewForm.value.rawNotes,
      archetype: selectedArchetype.value,
      interviewee: interviewForm.value.interviewee,
      role: interviewForm.value.role,
    })

    const data = result.data as { analysis: typeof transcriptAnalysis.value }
    transcriptAnalysis.value = data.analysis
    showTranscriptResults.value = true
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    aiError.value = errorMsg
    showAiDrawer.value = true
  } finally {
    transcriptAnalyzing.value = false
  }
}

// Save interview with AI-extracted insights
async function saveInterviewWithInsights() {
  if (!selectedArchetypeId.value || !interviewForm.value.rawNotes.trim()) return

  await store.addInterviewNote(selectedArchetypeId.value, {
    date: Timestamp.now(),
    interviewee: interviewForm.value.interviewee,
    role: interviewForm.value.role,
    rawNotes: interviewForm.value.rawNotes,
    keyInsights: transcriptAnalysis.value?.extractedInsights?.keyInsights || [],
    surprises: transcriptAnalysis.value?.extractedInsights?.surprises || [],
    contradictions: transcriptAnalysis.value?.extractedInsights?.contradictions || [],
    validatedHypotheses: transcriptAnalysis.value?.hypothesisValidations
      ?.filter(h => h.newStatus === 'validated' && h.hypothesisId)
      .map(h => h.hypothesisId!) || [],
    invalidatedHypotheses: transcriptAnalysis.value?.hypothesisValidations
      ?.filter(h => h.newStatus === 'invalidated' && h.hypothesisId)
      .map(h => h.hypothesisId!) || [],
  })

  // Reset form
  interviewForm.value = { interviewee: '', role: '', rawNotes: '' }
  transcriptAnalysis.value = null
  showTranscriptResults.value = false
  showInterviewForm.value = false
}

// Apply hypothesis validation from transcript analysis
async function applyHypothesisValidation(validation: NonNullable<typeof transcriptAnalysis.value>['hypothesisValidations'][number], index: number) {
  if (!selectedArchetypeId.value || !transcriptAnalysis.value?.hypothesisValidations) return

  if (validation.hypothesisId) {
    // Update existing hypothesis
    const field = validation.category as keyof Pick<CustomerArchetype, 'specificPainPoints' | 'currentSolutions' | 'primaryGoals' | 'successMetrics' | 'buyingCriteria' | 'objections'>
    await store.updateHypothesisStatus(
      selectedArchetypeId.value,
      field,
      validation.hypothesisId,
      validation.newStatus as ValidationStatus,
      validation.evidence
    )
  }

  // Mark as applied
  transcriptAnalysis.value.hypothesisValidations[index].applied = true
}

// Apply all hypothesis validations
async function applyAllValidations() {
  if (!transcriptAnalysis.value?.hypothesisValidations) return

  for (let i = 0; i < transcriptAnalysis.value.hypothesisValidations.length; i++) {
    const validation = transcriptAnalysis.value.hypothesisValidations[i]
    if (!validation.applied && validation.hypothesisId) {
      await applyHypothesisValidation(validation, i)
    }
  }
}

// Add new hypothesis from transcript analysis
async function addNewHypothesisFromTranscript(hyp: NonNullable<typeof transcriptAnalysis.value>['newHypotheses'][number], index: number) {
  if (!selectedArchetypeId.value || !transcriptAnalysis.value?.newHypotheses) return

  const fieldMap: Record<string, keyof typeof hypothesisInputs.value> = {
    specificPainPoints: 'specificPainPoints',
    currentSolutions: 'currentSolutions',
    primaryGoals: 'primaryGoals',
    successMetrics: 'successMetrics',
    buyingCriteria: 'buyingCriteria',
    objections: 'objections',
  }

  const field = fieldMap[hyp.category] || 'specificPainPoints'
  await store.addHypothesis(selectedArchetypeId.value, field, hyp.content)

  // Mark as added
  transcriptAnalysis.value.newHypotheses[index].added = true
}

// Apply profile updates from transcript analysis
async function applyProfileUpdate(field: 'dailyReality' | 'problemStatement' | 'background') {
  if (!selectedArchetypeId.value || !transcriptAnalysis.value?.suggestedProfileUpdates?.[field]) return

  await store.updateArchetype(selectedArchetypeId.value, {
    [field]: transcriptAnalysis.value.suggestedProfileUpdates[field]
  })
}

async function addValueProposition() {
  if (!selectedArchetypeId.value || !valuePropForm.value.proposition.trim()) return

  await store.addValueProposition(selectedArchetypeId.value, {
    proposition: valuePropForm.value.proposition,
    relevanceScore: valuePropForm.value.relevanceScore,
    painAddressed: valuePropForm.value.painAddressed,
    status: 'hypothesis',
  })

  valuePropForm.value = { proposition: '', relevanceScore: 3, painAddressed: '' }
  showValuePropForm.value = false
}

async function removeValueProposition(propId: string) {
  if (!selectedArchetypeId.value) return
  await store.removeValueProposition(selectedArchetypeId.value, propId)
}

async function deleteArchetype() {
  if (!selectedArchetypeId.value) return
  if (!confirm('Delete this archetype? This cannot be undone.')) return

  await store.deleteArchetype(selectedArchetypeId.value)
  selectedArchetypeId.value = null
}

function copyInterviewScript() {
  if (!selectedArchetype.value) return

  const script = selectedArchetype.value.interviewQuestions
    .map((q, i) => `${i + 1}. ${q.question}\n   Purpose: ${q.purpose}`)
    .join('\n\n')

  navigator.clipboard.writeText(script)
}

function getRoleBadgeColor(role: StakeholderRole): string {
  const colors: Record<StakeholderRole, string> = {
    user: 'bg-blue-100 text-blue-800',
    payer: 'bg-green-100 text-green-800',
    economic_buyer: 'bg-emerald-100 text-emerald-800',
    decision_maker: 'bg-purple-100 text-purple-800',
    influencer: 'bg-orange-100 text-orange-800',
    recommender: 'bg-cyan-100 text-cyan-800',
    saboteur: 'bg-red-100 text-red-800',
  }
  return colors[role]
}

// AI Functions
async function challengeInput(text: string, context: string) {
  if (!text.trim()) return

  showAiDrawer.value = true
  aiLoading.value = true
  aiError.value = null

  try {
    const challengeFn = httpsCallable(functions, 'challengeArchetypeInput')
    const result = await challengeFn({
      input: text,
      inputType: context,
      archetypeContext: selectedArchetype.value ? {
        name: selectedArchetype.value.name,
        stakeholderRole: selectedArchetype.value.stakeholderRole,
        jobTitle: selectedArchetype.value.jobTitle,
        phase: selectedArchetype.value.phase,
      } : undefined,
    })

    const data = result.data as {
      analysis: {
        isValid: boolean
        concerns: string[]
        suggestions: string[]
        improvedVersion?: string
      }
    }
    aiResponse.value = {
      type: 'challenge',
      content: data.analysis.isValid
        ? ['✓ This input looks good! No major concerns found.']
        : [
            '**Concerns:**',
            ...data.analysis.concerns.map(c => `• ${c}`),
            '',
            ...(data.analysis.improvedVersion ? ['**Suggested Improvement:**', data.analysis.improvedVersion] : []),
          ],
      suggestions: data.analysis.suggestions,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (errorMsg.includes('CORS') || errorMsg.includes('not found') || errorMsg.includes('ERR_FAILED')) {
      aiError.value = 'AI features require Cloud Functions to be deployed. See functions/ directory for implementation.'
    } else {
      aiError.value = errorMsg
    }
  } finally {
    aiLoading.value = false
  }
}

async function identifyAssumptions() {
  if (!selectedArchetype.value) return

  showAiDrawer.value = true
  aiLoading.value = true
  aiError.value = null

  try {
    const assumptionsFn = httpsCallable(functions, 'identifyArchetypeAssumptions')
    const result = await assumptionsFn({
      archetype: selectedArchetype.value,
    })

    const data = result.data as {
      analysis: {
        assumptions: Array<{ assumption: string; category: string; riskScore: number; validationApproach: string }>
        topRisks: string[]
        overallReadiness: string
      }
    }
    aiResponse.value = {
      type: 'assumptions',
      content: [],
      rawData: {
        assumptions: data.analysis.assumptions.map(a => ({ ...a, added: false })),
        topRisks: data.analysis.topRisks,
        overallReadiness: data.analysis.overallReadiness,
      },
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (errorMsg.includes('CORS') || errorMsg.includes('not found') || errorMsg.includes('ERR_FAILED')) {
      aiError.value = 'AI features require Cloud Functions to be deployed. See functions/ directory for implementation.'
    } else {
      aiError.value = errorMsg
    }
  } finally {
    aiLoading.value = false
  }
}

async function generateInterviewQuestions() {
  if (!selectedArchetype.value) return

  showAiDrawer.value = true
  aiLoading.value = true
  aiError.value = null

  try {
    const generateFn = httpsCallable(functions, 'generateInterviewQuestions')
    const result = await generateFn({
      archetype: selectedArchetype.value,
    })

    const data = result.data as {
      result: {
        questions: Array<{ question: string; purpose: string; category: string; followUps?: string[] }>
        interviewFlow: { opening: string; warmUp: string[]; core: string[]; closing: string }
        tips: string[]
      }
    }
    aiResponse.value = {
      type: 'questions',
      content: [],
      rawData: {
        questions: data.result.questions.map(q => ({ ...q, added: false })),
        interviewFlow: data.result.interviewFlow,
        tips: data.result.tips,
      },
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (errorMsg.includes('CORS') || errorMsg.includes('not found') || errorMsg.includes('ERR_FAILED')) {
      aiError.value = 'AI features require Cloud Functions to be deployed. See functions/ directory for implementation.'
    } else {
      aiError.value = errorMsg
    }
  } finally {
    aiLoading.value = false
  }
}

async function synthesizeInterviews() {
  if (!selectedArchetype.value || selectedArchetype.value.interviewNotes.length === 0) return

  showAiDrawer.value = true
  aiLoading.value = true
  aiError.value = null

  try {
    const synthesizeFn = httpsCallable(functions, 'synthesizeInterviews')
    const result = await synthesizeFn({
      archetype: selectedArchetype.value,
      interviewNotes: selectedArchetype.value.interviewNotes.map(n => ({
        interviewee: n.interviewee,
        date: n.date,
        content: n.rawNotes,
        keyInsights: n.keyInsights,
      })),
    })

    const data = result.data as {
      synthesis: {
        summary: { totalInterviews: number; keyInsight: string; confidenceLevel: string; recommendedNextSteps: string[] }
        patterns: Array<{ pattern: string; frequency: string; significance: string }>
        hypothesisUpdates: Array<{ hypothesis: string; category?: string; previousStatus: string; newStatus: string; evidence: string }>
        contradictions: Array<{ stated: string; revealed: string; implication: string }>
        newHypotheses: Array<{ hypothesis: string; category: string }>
        quotableInsights: string[]
      }
    }

    aiResponse.value = {
      type: 'synthesis',
      content: [],
      rawData: {
        synthesis: {
          summary: data.synthesis.summary,
          patterns: data.synthesis.patterns,
          hypothesisUpdates: data.synthesis.hypothesisUpdates.map(h => ({
            ...h,
            category: h.category || 'problem',
            applied: false
          })),
          contradictions: data.synthesis.contradictions,
          newHypotheses: data.synthesis.newHypotheses.map(h => ({ ...h, added: false })),
          quotableInsights: data.synthesis.quotableInsights,
        },
      },
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (errorMsg.includes('CORS') || errorMsg.includes('not found') || errorMsg.includes('ERR_FAILED')) {
      aiError.value = 'AI features require Cloud Functions to be deployed. See functions/ directory for implementation.'
    } else {
      aiError.value = errorMsg
    }
  } finally {
    aiLoading.value = false
  }
}

function closeAiDrawer() {
  showAiDrawer.value = false
  aiResponse.value = null
}

async function applyAiSuggestion(suggestion: string) {
  // Parse the suggestion and apply it based on context
  // This would add the suggestion as a hypothesis or question
  if (activeTab.value === 'interviews' && suggestion.includes('Purpose:')) {
    // It's an interview question
    const parts = suggestion.split('\n   Purpose: ')
    if (parts.length === 2 && parts[0] && parts[1]) {
      newQuestionContent.value = parts[0]
      newQuestionPurpose.value = parts[1]
      await addInterviewQuestion()
    }
  }
}

// Map AI category to hypothesis field
function mapCategoryToField(category: string): HypothesisField | null {
  const mapping: Record<string, HypothesisField> = {
    problem: 'specificPainPoints',
    painPoint: 'specificPainPoints',
    customer: 'specificPainPoints',
    solution: 'currentSolutions',
    goal: 'primaryGoals',
    metric: 'successMetrics',
    business_model: 'buyingCriteria',
    buyingCriteria: 'buyingCriteria',
    objection: 'objections',
  }
  return mapping[category] || null
}

// Add an AI-identified assumption as a hypothesis
async function addAssumptionAsHypothesis(assumption: AiAssumption, index: number) {
  if (!selectedArchetypeId.value || !aiResponse.value?.rawData?.assumptions) return

  const field = mapCategoryToField(assumption.category)
  if (!field) {
    // Default to pain points if category doesn't map
    await store.addHypothesis(selectedArchetypeId.value, 'specificPainPoints', assumption.assumption)
  } else {
    await store.addHypothesis(selectedArchetypeId.value, field, assumption.assumption)
  }

  // Mark as added
  aiResponse.value.rawData.assumptions[index].added = true
}

// Add all assumptions at once
async function addAllAssumptions() {
  if (!selectedArchetypeId.value || !aiResponse.value?.rawData?.assumptions) return

  for (let i = 0; i < aiResponse.value.rawData.assumptions.length; i++) {
    const assumption = aiResponse.value.rawData.assumptions[i]
    if (!assumption.added) {
      await addAssumptionAsHypothesis(assumption, i)
    }
  }
}

// Add an AI-generated question to interview script
async function addAiQuestion(question: AiQuestion, index: number) {
  if (!selectedArchetypeId.value || !aiResponse.value?.rawData?.questions) return

  await store.addInterviewQuestion(selectedArchetypeId.value, question.question, question.purpose)

  // Mark as added
  aiResponse.value.rawData.questions[index].added = true
}

// Add all questions at once
async function addAllQuestions() {
  if (!selectedArchetypeId.value || !aiResponse.value?.rawData?.questions) return

  for (let i = 0; i < aiResponse.value.rawData.questions.length; i++) {
    const question = aiResponse.value.rawData.questions[i]
    if (!question.added) {
      await addAiQuestion(question, i)
    }
  }
}

// Add a new hypothesis from synthesis
async function addNewHypothesisFromSynthesis(hyp: AiNewHypothesis, index: number) {
  if (!selectedArchetypeId.value || !aiResponse.value?.rawData?.synthesis?.newHypotheses) return

  const field = mapCategoryToField(hyp.category)
  if (!field) {
    await store.addHypothesis(selectedArchetypeId.value, 'specificPainPoints', hyp.hypothesis)
  } else {
    await store.addHypothesis(selectedArchetypeId.value, field, hyp.hypothesis)
  }

  // Mark as added
  aiResponse.value.rawData.synthesis.newHypotheses[index].added = true
}

// Apply hypothesis status update from synthesis
async function applyHypothesisUpdate(update: AiHypothesisUpdate, index: number) {
  if (!selectedArchetypeId.value || !selectedArchetype.value || !aiResponse.value?.rawData?.synthesis?.hypothesisUpdates) return

  // Find matching hypothesis by content (across all hypothesis fields)
  const fields: HypothesisField[] = ['specificPainPoints', 'currentSolutions', 'primaryGoals', 'successMetrics', 'buyingCriteria', 'objections']

  for (const field of fields) {
    const hypotheses = selectedArchetype.value[field] as Array<{ id: string; content: string; status: string }>
    if (!hypotheses) continue

    const match = hypotheses.find(h =>
      h.content.toLowerCase().includes(update.hypothesis.toLowerCase()) ||
      update.hypothesis.toLowerCase().includes(h.content.toLowerCase())
    )

    if (match) {
      const newStatus = update.newStatus as ValidationStatus
      await store.updateHypothesisStatus(selectedArchetypeId.value, field, match.id, newStatus, update.evidence)
      aiResponse.value.rawData.synthesis.hypothesisUpdates[index].applied = true
      return
    }
  }

  // If no match found, mark as applied anyway (couldn't find hypothesis)
  aiResponse.value.rawData.synthesis.hypothesisUpdates[index].applied = true
}

// Watch for BS flags
watch(selectedArchetype, (archetype) => {
  if (archetype && archetype.bsFlags.length > 0) {
    // Show BS warning in AI drawer
    aiResponse.value = {
      type: 'challenge',
      content: [
        'Marketing speak detected! The following terms need validation with real customer language:',
        ...archetype.bsFlags.map(flag => `• "${flag}"`),
        '',
        'What\'s the actual problem in their words?'
      ],
    }
    showAiDrawer.value = true
  }
}, { immediate: true })
</script>

<template>
  <div class="flex h-[calc(100vh-8rem)] -m-6">
    <!-- Left Sidebar: Archetypes List -->
    <div class="w-72 border-r border-gray-200 bg-gray-50 flex flex-col">
      <!-- Header -->
      <div class="p-4 border-b border-gray-200 bg-white">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-semibold text-gray-900">Archetypes</h2>
          <button
            v-if="authStore.canEdit"
            class="p-1.5 text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
            @click="showCreateModal = true"
            title="Add Archetype"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <p class="text-xs text-gray-500">Map value propositions to customer segments</p>
      </div>

      <!-- Research Progress -->
      <div class="p-4 border-b border-gray-200 bg-gradient-to-br from-indigo-50 to-purple-50">
        <div class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Research Maturity</div>
        <div class="flex items-center gap-2">
          <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
              :style="{ width: `${store.validatedArchetypes.length / Math.max(store.archetypes.length, 1) * 100}%` }"
            ></div>
          </div>
          <span class="text-sm font-medium text-gray-700">
            {{ store.validatedArchetypes.length }}/{{ store.archetypes.length }}
          </span>
        </div>
      </div>

      <!-- Archetypes List -->
      <div class="flex-1 overflow-y-auto p-3 space-y-2">
        <div v-if="store.loading" class="text-center py-8 text-gray-500 text-sm">Loading...</div>

        <div v-else-if="store.archetypes.length === 0" class="text-center py-8">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-200 flex items-center justify-center">
            <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p class="text-gray-500 text-sm">No archetypes yet</p>
          <button
            v-if="authStore.canEdit"
            class="mt-2 text-sm text-accent-600 hover:text-accent-700 font-medium"
            @click="showCreateModal = true"
          >
            Create your first archetype
          </button>
        </div>

        <button
          v-for="archetype in store.archetypes"
          :key="archetype.id"
          :class="[
            'w-full text-left p-3 rounded-xl border-2 transition-all duration-200',
            selectedArchetypeId === archetype.id
              ? 'bg-white border-accent-500 shadow-md'
              : 'bg-white border-transparent hover:border-gray-200 hover:shadow-sm'
          ]"
          @click="selectedArchetypeId = archetype.id"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="font-medium text-gray-900 truncate">{{ archetype.name }}</div>
              <div class="flex items-center gap-2 mt-1">
                <span :class="['text-xs px-2 py-0.5 rounded-full', getRoleBadgeColor(archetype.stakeholderRole)]">
                  {{ archetype.stakeholderRole.replace('_', ' ') }}
                </span>
              </div>
            </div>
            <span :class="['text-xs px-2 py-0.5 rounded-full whitespace-nowrap', phaseLabels[archetype.phase].color]">
              {{ phaseLabels[archetype.phase].label }}
            </span>
          </div>

          <!-- Progress indicators -->
          <div class="mt-3 space-y-1.5">
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500 w-16">Confidence</span>
              <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="archetype.confidenceScore >= 70 ? 'bg-green-500' : archetype.confidenceScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'"
                  :style="{ width: `${archetype.confidenceScore}%` }"
                ></div>
              </div>
              <span class="text-xs font-medium text-gray-600 w-8">{{ archetype.confidenceScore }}%</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500 w-16">Interviews</span>
              <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  class="h-full bg-accent-500 rounded-full transition-all duration-300"
                  :style="{ width: `${archetype.readinessScore}%` }"
                ></div>
              </div>
              <span class="text-xs font-medium text-gray-600 w-8">{{ archetype.interviewNotes.length }}/{{ archetype.interviewTarget }}</span>
            </div>
          </div>

          <!-- BS Flag Warning -->
          <div v-if="archetype.bsFlags.length > 0" class="mt-2 flex items-center gap-1 text-xs text-amber-600">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {{ archetype.bsFlags.length }} BS flag{{ archetype.bsFlags.length === 1 ? '' : 's' }}
          </div>
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <template v-if="selectedArchetype">
        <!-- Header -->
        <div class="p-6 border-b border-gray-200 bg-white">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-3">
                <h1 class="text-2xl font-bold text-gray-900">{{ selectedArchetype.name }}</h1>
                <span :class="['text-sm px-3 py-1 rounded-full', phaseLabels[selectedArchetype.phase].color]">
                  {{ phaseLabels[selectedArchetype.phase].label }}
                </span>
              </div>
              <div class="flex items-center gap-4 mt-2">
                <span :class="['text-sm px-2.5 py-1 rounded-full', getRoleBadgeColor(selectedArchetype.stakeholderRole)]">
                  {{ selectedArchetype.customRoleName || selectedArchetype.stakeholderRole.replace('_', ' ') }}
                </span>
                <span class="text-sm text-gray-500">{{ readinessMessage }}</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                class="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-all"
                @click="identifyAssumptions"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Identify Assumptions
              </button>
              <button
                v-if="authStore.canEdit"
                class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                @click="deleteArchetype"
                title="Delete archetype"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mt-6 -mb-6 px-0">
            <button
              v-for="tab in [
                { id: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                { id: 'problems', label: 'Problems', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
                { id: 'goals', label: 'Goals & Metrics', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                { id: 'buying', label: 'Buying Process', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
                { id: 'value_props', label: 'Value Props', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                { id: 'interviews', label: 'Interviews', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
              ]"
              :key="tab.id"
              :class="[
                'flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'bg-white border-accent-500 text-accent-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              ]"
              @click="activeTab = tab.id as any"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tab.icon" />
              </svg>
              {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-y-auto p-6 bg-gray-50">
          <!-- Profile Tab -->
          <div v-if="activeTab === 'profile'" class="space-y-6">
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <h3 class="font-semibold text-gray-900 mb-4">Who They Are</h3>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="label">Job Title</label>
                  <input
                    :value="selectedArchetype.jobTitle"
                    class="input"
                    placeholder="e.g., VP of Engineering"
                    @blur="updateField('jobTitle', ($event.target as HTMLInputElement).value)"
                  />
                </div>
                <div>
                  <label class="label">Background</label>
                  <input
                    :value="selectedArchetype.background"
                    class="input"
                    placeholder="e.g., Technical, 10+ years experience"
                    @blur="updateField('background', ($event.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
              <div class="mt-4">
                <label class="label">Daily Reality</label>
                <div class="relative">
                  <textarea
                    :value="selectedArchetype.dailyReality"
                    class="input resize-none pr-12"
                    rows="3"
                    placeholder="Describe their typical day, challenges, and pressures..."
                    @blur="updateField('dailyReality', ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                  <button
                    class="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Challenge this input"
                    @click="challengeInput(selectedArchetype.dailyReality, 'daily reality')"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Problems Tab -->
          <div v-if="activeTab === 'problems'" class="space-y-6">
            <!-- Problem Statement -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <h3 class="font-semibold text-gray-900 mb-4">Problem Statement</h3>
              <div class="relative">
                <textarea
                  :value="selectedArchetype.problemStatement"
                  class="input resize-none pr-12"
                  rows="3"
                  placeholder="What problem are you solving for them?"
                  @blur="updateField('problemStatement', ($event.target as HTMLTextAreaElement).value)"
                ></textarea>
                <button
                  class="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Challenge this input"
                  @click="challengeInput(selectedArchetype.problemStatement, 'problem statement')"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Pain Points -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-900">Specific Pain Points</h3>
                <span class="text-xs text-gray-500">Hypotheses that need validation</span>
              </div>

              <div class="space-y-2 mb-4">
                <div
                  v-for="hypothesis in selectedArchetype.specificPainPoints"
                  :key="hypothesis.id"
                  :class="['flex items-start gap-3 p-3 rounded-lg border', validationColors[hypothesis.status]]"
                >
                  <div class="flex-1">
                    <p class="text-sm">{{ hypothesis.content }}</p>
                    <p v-if="hypothesis.evidence" class="text-xs text-gray-500 mt-1">Evidence: {{ hypothesis.evidence }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      class="p-1 text-gray-400 hover:text-green-600 rounded"
                      title="Mark validated"
                      @click="updateHypothesisStatus('specificPainPoints', hypothesis.id, 'validated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-red-600 rounded"
                      title="Mark invalidated"
                      @click="updateHypothesisStatus('specificPainPoints', hypothesis.id, 'invalidated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-gray-600 rounded"
                      title="Remove"
                      @click="removeHypothesis('specificPainPoints', hypothesis.id)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-2">
                <input
                  v-model="hypothesisInputs.specificPainPoints"
                  class="input flex-1"
                  placeholder="Add a pain point hypothesis..."
                  @keyup.enter="addHypothesis('specificPainPoints')"
                />
                <button
                  class="btn-primary"
                  :disabled="!hypothesisInputs.specificPainPoints.trim()"
                  @click="addHypothesis('specificPainPoints')"
                >
                  Add
                </button>
              </div>
            </div>

            <!-- Current Solutions -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-900">Current Solutions (Workarounds)</h3>
                <span class="text-xs text-gray-500">How do they solve this today?</span>
              </div>

              <div class="space-y-2 mb-4">
                <div
                  v-for="hypothesis in selectedArchetype.currentSolutions"
                  :key="hypothesis.id"
                  :class="['flex items-start gap-3 p-3 rounded-lg border', validationColors[hypothesis.status]]"
                >
                  <div class="flex-1">
                    <p class="text-sm">{{ hypothesis.content }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      class="p-1 text-gray-400 hover:text-green-600 rounded"
                      @click="updateHypothesisStatus('currentSolutions', hypothesis.id, 'validated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-red-600 rounded"
                      @click="updateHypothesisStatus('currentSolutions', hypothesis.id, 'invalidated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-gray-600 rounded"
                      @click="removeHypothesis('currentSolutions', hypothesis.id)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-2">
                <input
                  v-model="hypothesisInputs.currentSolutions"
                  class="input flex-1"
                  placeholder="Add a current solution..."
                  @keyup.enter="addHypothesis('currentSolutions')"
                />
                <button
                  class="btn-primary"
                  :disabled="!hypothesisInputs.currentSolutions.trim()"
                  @click="addHypothesis('currentSolutions')"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <!-- Goals & Metrics Tab -->
          <div v-if="activeTab === 'goals'" class="space-y-6">
            <!-- Primary Goals -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-900">Primary Goals</h3>
                <span class="text-xs text-gray-500">What are they trying to achieve?</span>
              </div>

              <div class="space-y-2 mb-4">
                <div
                  v-for="hypothesis in selectedArchetype.primaryGoals"
                  :key="hypothesis.id"
                  :class="['flex items-start gap-3 p-3 rounded-lg border', validationColors[hypothesis.status]]"
                >
                  <div class="flex-1">
                    <p class="text-sm">{{ hypothesis.content }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      class="p-1 text-gray-400 hover:text-green-600 rounded"
                      @click="updateHypothesisStatus('primaryGoals', hypothesis.id, 'validated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-red-600 rounded"
                      @click="updateHypothesisStatus('primaryGoals', hypothesis.id, 'invalidated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-gray-600 rounded"
                      @click="removeHypothesis('primaryGoals', hypothesis.id)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-2">
                <input
                  v-model="hypothesisInputs.primaryGoals"
                  class="input flex-1"
                  placeholder="Add a goal..."
                  @keyup.enter="addHypothesis('primaryGoals')"
                />
                <button
                  class="btn-primary"
                  :disabled="!hypothesisInputs.primaryGoals.trim()"
                  @click="addHypothesis('primaryGoals')"
                >
                  Add
                </button>
              </div>
            </div>

            <!-- Success Metrics -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-900">Success Metrics</h3>
                <span class="text-xs text-gray-500">How are they measured?</span>
              </div>

              <div class="space-y-2 mb-4">
                <div
                  v-for="hypothesis in selectedArchetype.successMetrics"
                  :key="hypothesis.id"
                  :class="['flex items-start gap-3 p-3 rounded-lg border', validationColors[hypothesis.status]]"
                >
                  <div class="flex-1">
                    <p class="text-sm">{{ hypothesis.content }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      class="p-1 text-gray-400 hover:text-green-600 rounded"
                      @click="updateHypothesisStatus('successMetrics', hypothesis.id, 'validated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-red-600 rounded"
                      @click="updateHypothesisStatus('successMetrics', hypothesis.id, 'invalidated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-gray-600 rounded"
                      @click="removeHypothesis('successMetrics', hypothesis.id)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-2">
                <input
                  v-model="hypothesisInputs.successMetrics"
                  class="input flex-1"
                  placeholder="Add a success metric..."
                  @keyup.enter="addHypothesis('successMetrics')"
                />
                <button
                  class="btn-primary"
                  :disabled="!hypothesisInputs.successMetrics.trim()"
                  @click="addHypothesis('successMetrics')"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <!-- Buying Process Tab -->
          <div v-if="activeTab === 'buying'" class="space-y-6">
            <!-- Decision Process -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <h3 class="font-semibold text-gray-900 mb-4">Decision Process</h3>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="label">Budget Authority</label>
                  <select
                    :value="selectedArchetype.budgetAuthority"
                    class="input"
                    @change="updateField('budgetAuthority', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="hypothesis">Hypothesis (unvalidated)</option>
                    <option value="partially_validated">Partially Validated</option>
                    <option value="validated">Validated</option>
                    <option value="invalidated">Invalidated</option>
                  </select>
                </div>
                <div>
                  <label class="label">Decision Process Description</label>
                  <input
                    :value="selectedArchetype.decisionProcess"
                    class="input"
                    placeholder="How do they make purchasing decisions?"
                    @blur="updateField('decisionProcess', ($event.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
            </div>

            <!-- Buying Criteria -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-900">Buying Criteria</h3>
                <span class="text-xs text-gray-500">What matters to them in a solution?</span>
              </div>

              <div class="space-y-2 mb-4">
                <div
                  v-for="hypothesis in selectedArchetype.buyingCriteria"
                  :key="hypothesis.id"
                  :class="['flex items-start gap-3 p-3 rounded-lg border', validationColors[hypothesis.status]]"
                >
                  <div class="flex-1">
                    <p class="text-sm">{{ hypothesis.content }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      class="p-1 text-gray-400 hover:text-green-600 rounded"
                      @click="updateHypothesisStatus('buyingCriteria', hypothesis.id, 'validated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-red-600 rounded"
                      @click="updateHypothesisStatus('buyingCriteria', hypothesis.id, 'invalidated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-gray-600 rounded"
                      @click="removeHypothesis('buyingCriteria', hypothesis.id)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-2">
                <input
                  v-model="hypothesisInputs.buyingCriteria"
                  class="input flex-1"
                  placeholder="Add a buying criterion..."
                  @keyup.enter="addHypothesis('buyingCriteria')"
                />
                <button
                  class="btn-primary"
                  :disabled="!hypothesisInputs.buyingCriteria.trim()"
                  @click="addHypothesis('buyingCriteria')"
                >
                  Add
                </button>
              </div>
            </div>

            <!-- Objections -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-900">Potential Objections</h3>
                <span class="text-xs text-gray-500">What might stop them from buying?</span>
              </div>

              <div class="space-y-2 mb-4">
                <div
                  v-for="hypothesis in selectedArchetype.objections"
                  :key="hypothesis.id"
                  :class="['flex items-start gap-3 p-3 rounded-lg border', validationColors[hypothesis.status]]"
                >
                  <div class="flex-1">
                    <p class="text-sm">{{ hypothesis.content }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <button
                      class="p-1 text-gray-400 hover:text-green-600 rounded"
                      @click="updateHypothesisStatus('objections', hypothesis.id, 'validated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-red-600 rounded"
                      @click="updateHypothesisStatus('objections', hypothesis.id, 'invalidated')"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <button
                      class="p-1 text-gray-400 hover:text-gray-600 rounded"
                      @click="removeHypothesis('objections', hypothesis.id)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-2">
                <input
                  v-model="hypothesisInputs.objections"
                  class="input flex-1"
                  placeholder="Add a potential objection..."
                  @keyup.enter="addHypothesis('objections')"
                />
                <button
                  class="btn-primary"
                  :disabled="!hypothesisInputs.objections.trim()"
                  @click="addHypothesis('objections')"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <!-- Value Propositions Tab -->
          <div v-if="activeTab === 'value_props'" class="space-y-6">
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h3 class="font-semibold text-gray-900">Value Propositions</h3>
                  <p class="text-sm text-gray-500 mt-1">Map your value propositions to this archetype's pain points</p>
                </div>
                <button
                  class="btn-primary inline-flex items-center gap-2"
                  @click="showValuePropForm = true"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Value Prop
                </button>
              </div>

              <!-- Value Prop Form -->
              <div v-if="showValuePropForm" class="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div class="space-y-4">
                  <div>
                    <label class="label">Value Proposition</label>
                    <textarea
                      v-model="valuePropForm.proposition"
                      class="input resize-none"
                      rows="2"
                      placeholder="What value do you deliver to this archetype?"
                    ></textarea>
                  </div>
                  <div class="grid md:grid-cols-2 gap-4">
                    <div>
                      <label class="label">Pain Addressed</label>
                      <select v-model="valuePropForm.painAddressed" class="input">
                        <option value="">Select a pain point...</option>
                        <option v-for="pain in selectedArchetype.specificPainPoints" :key="pain.id" :value="pain.content">
                          {{ pain.content }}
                        </option>
                      </select>
                    </div>
                    <div>
                      <label class="label">Relevance Score (1-5)</label>
                      <div class="flex items-center gap-2">
                        <input
                          v-model.number="valuePropForm.relevanceScore"
                          type="range"
                          min="1"
                          max="5"
                          class="flex-1"
                        />
                        <span class="w-8 text-center font-medium">{{ valuePropForm.relevanceScore }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="flex justify-end gap-2">
                    <button class="btn-secondary" @click="showValuePropForm = false">Cancel</button>
                    <button class="btn-primary" @click="addValueProposition">Add</button>
                  </div>
                </div>
              </div>

              <!-- Value Props List -->
              <div class="space-y-3">
                <div
                  v-for="prop in selectedArchetype.valuePropositions"
                  :key="prop.id"
                  :class="['p-4 rounded-xl border', validationColors[prop.status]]"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                      <p class="font-medium text-gray-900">{{ prop.proposition }}</p>
                      <div class="flex items-center gap-4 mt-2">
                        <span class="text-xs text-gray-500">
                          Addresses: {{ prop.painAddressed || 'Not specified' }}
                        </span>
                        <div class="flex items-center gap-1">
                          <span class="text-xs text-gray-500">Relevance:</span>
                          <div class="flex gap-0.5">
                            <div
                              v-for="i in 5"
                              :key="i"
                              :class="[
                                'w-2 h-2 rounded-full',
                                i <= prop.relevanceScore ? 'bg-accent-500' : 'bg-gray-200'
                              ]"
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      class="p-1 text-gray-400 hover:text-red-600 rounded"
                      @click="removeValueProposition(prop.id)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div v-if="selectedArchetype.valuePropositions.length === 0" class="text-center py-8 text-gray-500">
                  <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p>No value propositions mapped yet</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Interviews Tab -->
          <div v-if="activeTab === 'interviews'" class="space-y-6">
            <!-- Interview Questions -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h3 class="font-semibold text-gray-900">Interview Script</h3>
                  <p class="text-sm text-gray-500 mt-1">Questions to validate your hypotheses</p>
                </div>
                <div class="flex gap-2">
                  <button
                    class="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-accent-600 hover:bg-accent-50 rounded-lg transition-colors"
                    @click="generateInterviewQuestions"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    Generate with AI
                  </button>
                  <button
                    v-if="selectedArchetype.interviewQuestions.length > 0"
                    class="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    @click="copyInterviewScript"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy Script
                  </button>
                </div>
              </div>

              <div class="space-y-2 mb-4">
                <div
                  v-for="(question, index) in selectedArchetype.interviewQuestions"
                  :key="question.id"
                  class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <span class="flex-shrink-0 w-6 h-6 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center text-sm font-medium">
                    {{ index + 1 }}
                  </span>
                  <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900">{{ question.question }}</p>
                    <p class="text-xs text-gray-500 mt-1">Purpose: {{ question.purpose }}</p>
                  </div>
                  <button
                    class="p-1 text-gray-400 hover:text-red-600 rounded"
                    @click="removeInterviewQuestion(question.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <input
                  v-model="newQuestionContent"
                  class="input"
                  placeholder="Add an interview question..."
                />
                <div class="flex gap-2">
                  <input
                    v-model="newQuestionPurpose"
                    class="input flex-1"
                    placeholder="What hypothesis does this validate?"
                  />
                  <button
                    class="btn-primary"
                    :disabled="!newQuestionContent.trim()"
                    @click="addInterviewQuestion"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <!-- Interview Notes -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h3 class="font-semibold text-gray-900">Interview Notes</h3>
                  <p class="text-sm text-gray-500 mt-1">
                    {{ selectedArchetype.interviewNotes.length }} of {{ selectedArchetype.interviewTarget }} interviews completed
                  </p>
                </div>
                <button
                  class="btn-primary inline-flex items-center gap-2"
                  @click="showInterviewForm = true"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Interview
                </button>
              </div>

              <!-- Interview Form -->
              <div v-if="showInterviewForm" class="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div class="space-y-4">
                  <div class="grid md:grid-cols-2 gap-4">
                    <div>
                      <label class="label">Interviewee</label>
                      <input
                        v-model="interviewForm.interviewee"
                        class="input"
                        placeholder="Name or identifier"
                      />
                    </div>
                    <div>
                      <label class="label">Role</label>
                      <input
                        v-model="interviewForm.role"
                        class="input"
                        placeholder="Their job title/role"
                      />
                    </div>
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <label class="label mb-0">Transcript / Notes</label>
                      <div class="flex items-center gap-2">
                        <input
                          ref="fileInputRef"
                          type="file"
                          accept=".txt,.md,.doc,.docx"
                          class="hidden"
                          @change="handleFileUpload"
                        />
                        <button
                          type="button"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          @click="fileInputRef?.click()"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          Upload File
                        </button>
                      </div>
                    </div>
                    <textarea
                      v-model="interviewForm.rawNotes"
                      class="input resize-none font-mono text-sm"
                      rows="10"
                      placeholder="Paste your interview transcript here, or upload a file above.

The AI will analyze your transcript against the interview questions and:
- Validate/invalidate hypotheses with evidence
- Extract key insights and quotes
- Suggest profile updates
- Identify new hypotheses"
                    ></textarea>
                    <p class="text-xs text-gray-500 mt-1">
                      {{ interviewForm.rawNotes.length.toLocaleString() }} characters
                    </p>
                  </div>
                  <div class="flex justify-end gap-2">
                    <button
                      class="btn-secondary"
                      @click="showInterviewForm = false; transcriptAnalysis = null; showTranscriptResults = false"
                    >
                      Cancel
                    </button>
                    <button
                      class="btn-secondary inline-flex items-center gap-2"
                      :disabled="!interviewForm.rawNotes.trim() || transcriptAnalyzing"
                      @click="analyzeTranscript"
                    >
                      <svg v-if="transcriptAnalyzing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      {{ transcriptAnalyzing ? 'Analyzing...' : 'Analyze with AI' }}
                    </button>
                    <button
                      class="btn-primary"
                      :disabled="!interviewForm.rawNotes.trim()"
                      @click="transcriptAnalysis ? saveInterviewWithInsights() : addInterviewNote()"
                    >
                      {{ transcriptAnalysis ? 'Save with Insights' : 'Save Interview' }}
                    </button>
                  </div>
                </div>

                <!-- Transcript Analysis Results -->
                <div v-if="showTranscriptResults && transcriptAnalysis" class="mt-6 border-t border-gray-200 pt-6">
                  <div class="flex items-center justify-between mb-4">
                    <h4 class="font-semibold text-gray-900">AI Analysis Results</h4>
                    <button
                      class="text-sm text-gray-500 hover:text-gray-700"
                      @click="showTranscriptResults = false"
                    >
                      Hide Results
                    </button>
                  </div>

                  <!-- Interview Summary -->
                  <div v-if="transcriptAnalysis.interviewSummary" class="mb-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
                    <div class="flex items-start gap-3">
                      <div class="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div class="flex-1">
                        <p class="font-medium text-gray-900">{{ transcriptAnalysis.interviewSummary.keyTakeaway }}</p>
                        <div class="flex flex-wrap gap-2 mt-2">
                          <span :class="[
                            'px-2 py-0.5 text-xs rounded-full',
                            transcriptAnalysis.interviewSummary.customerFit === 'strong_match' ? 'bg-green-100 text-green-800' :
                            transcriptAnalysis.interviewSummary.customerFit === 'partial_match' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          ]">
                            {{ transcriptAnalysis.interviewSummary.customerFit?.replace('_', ' ') }}
                          </span>
                          <span :class="[
                            'px-2 py-0.5 text-xs rounded-full',
                            transcriptAnalysis.interviewSummary.interviewQuality === 'high' ? 'bg-green-100 text-green-800' :
                            transcriptAnalysis.interviewSummary.interviewQuality === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          ]">
                            {{ transcriptAnalysis.interviewSummary.interviewQuality }} quality
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Hypothesis Validations -->
                  <div v-if="transcriptAnalysis.hypothesisValidations?.length" class="mb-6">
                    <div class="flex items-center justify-between mb-3">
                      <h5 class="text-sm font-medium text-gray-700">Hypothesis Updates</h5>
                      <button
                        class="text-xs text-accent-600 hover:text-accent-700"
                        @click="applyAllValidations"
                      >
                        Apply All Updates
                      </button>
                    </div>
                    <div class="space-y-2">
                      <div
                        v-for="(validation, index) in transcriptAnalysis.hypothesisValidations"
                        :key="index"
                        class="p-3 bg-white rounded-lg border border-gray-200"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex-1">
                            <p class="text-sm font-medium text-gray-900">{{ validation.hypothesisContent }}</p>
                            <div class="flex items-center gap-2 mt-1">
                              <span class="text-xs text-gray-500">{{ validation.previousStatus }}</span>
                              <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                              <span :class="[
                                'px-2 py-0.5 text-xs rounded-full font-medium',
                                validation.newStatus === 'validated' ? 'bg-green-100 text-green-800' :
                                validation.newStatus === 'invalidated' ? 'bg-red-100 text-red-800' :
                                validation.newStatus === 'partially_validated' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              ]">
                                {{ validation.newStatus?.replace('_', ' ') }}
                              </span>
                              <span class="text-xs text-gray-400">({{ validation.confidence }} confidence)</span>
                            </div>
                            <p class="text-xs text-gray-600 mt-2">{{ validation.evidence }}</p>
                            <p v-if="validation.directQuote" class="text-xs text-gray-500 mt-1 italic">"{{ validation.directQuote }}"</p>
                          </div>
                          <button
                            v-if="validation.hypothesisId && !validation.applied"
                            class="flex-shrink-0 px-3 py-1 text-xs bg-accent-100 text-accent-700 rounded-lg hover:bg-accent-200 transition-colors"
                            @click="applyHypothesisValidation(validation, index)"
                          >
                            Apply
                          </button>
                          <span v-else-if="validation.applied" class="flex-shrink-0 text-xs text-green-600">Applied</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- New Hypotheses -->
                  <div v-if="transcriptAnalysis.newHypotheses?.length" class="mb-6">
                    <h5 class="text-sm font-medium text-gray-700 mb-3">New Hypotheses Discovered</h5>
                    <div class="space-y-2">
                      <div
                        v-for="(hyp, index) in transcriptAnalysis.newHypotheses"
                        :key="index"
                        class="p-3 bg-white rounded-lg border border-gray-200"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex-1">
                            <p class="text-sm font-medium text-gray-900">{{ hyp.content }}</p>
                            <div class="flex items-center gap-2 mt-1">
                              <span class="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">
                                {{ hyp.category?.replace(/([A-Z])/g, ' $1').trim() }}
                              </span>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">Source: {{ hyp.source }}</p>
                          </div>
                          <button
                            v-if="!hyp.added"
                            class="flex-shrink-0 px-3 py-1 text-xs bg-accent-100 text-accent-700 rounded-lg hover:bg-accent-200 transition-colors"
                            @click="addNewHypothesisFromTranscript(hyp, index)"
                          >
                            Add
                          </button>
                          <span v-else class="flex-shrink-0 text-xs text-green-600">Added</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Profile Updates -->
                  <div v-if="transcriptAnalysis.suggestedProfileUpdates && (transcriptAnalysis.suggestedProfileUpdates.dailyReality || transcriptAnalysis.suggestedProfileUpdates.problemStatement || transcriptAnalysis.suggestedProfileUpdates.background)" class="mb-6">
                    <h5 class="text-sm font-medium text-gray-700 mb-3">Suggested Profile Updates</h5>
                    <div class="space-y-2">
                      <div v-if="transcriptAnalysis.suggestedProfileUpdates.dailyReality" class="p-3 bg-white rounded-lg border border-gray-200">
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex-1">
                            <p class="text-xs font-medium text-gray-500 mb-1">Daily Reality</p>
                            <p class="text-sm text-gray-900">{{ transcriptAnalysis.suggestedProfileUpdates.dailyReality }}</p>
                          </div>
                          <button
                            class="flex-shrink-0 px-3 py-1 text-xs bg-accent-100 text-accent-700 rounded-lg hover:bg-accent-200 transition-colors"
                            @click="applyProfileUpdate('dailyReality')"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                      <div v-if="transcriptAnalysis.suggestedProfileUpdates.problemStatement" class="p-3 bg-white rounded-lg border border-gray-200">
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex-1">
                            <p class="text-xs font-medium text-gray-500 mb-1">Problem Statement</p>
                            <p class="text-sm text-gray-900">{{ transcriptAnalysis.suggestedProfileUpdates.problemStatement }}</p>
                          </div>
                          <button
                            class="flex-shrink-0 px-3 py-1 text-xs bg-accent-100 text-accent-700 rounded-lg hover:bg-accent-200 transition-colors"
                            @click="applyProfileUpdate('problemStatement')"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                      <div v-if="transcriptAnalysis.suggestedProfileUpdates.background" class="p-3 bg-white rounded-lg border border-gray-200">
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex-1">
                            <p class="text-xs font-medium text-gray-500 mb-1">Background</p>
                            <p class="text-sm text-gray-900">{{ transcriptAnalysis.suggestedProfileUpdates.background }}</p>
                          </div>
                          <button
                            class="flex-shrink-0 px-3 py-1 text-xs bg-accent-100 text-accent-700 rounded-lg hover:bg-accent-200 transition-colors"
                            @click="applyProfileUpdate('background')"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Extracted Insights -->
                  <div v-if="transcriptAnalysis.extractedInsights" class="mb-6">
                    <h5 class="text-sm font-medium text-gray-700 mb-3">Extracted Insights</h5>
                    <div class="grid md:grid-cols-2 gap-4">
                      <div v-if="transcriptAnalysis.extractedInsights.keyInsights?.length" class="p-3 bg-green-50 rounded-lg border border-green-200">
                        <p class="text-xs font-medium text-green-800 mb-2">Key Insights</p>
                        <ul class="space-y-1">
                          <li v-for="(insight, i) in transcriptAnalysis.extractedInsights.keyInsights" :key="i" class="text-xs text-green-700">
                            - {{ insight }}
                          </li>
                        </ul>
                      </div>
                      <div v-if="transcriptAnalysis.extractedInsights.surprises?.length" class="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p class="text-xs font-medium text-yellow-800 mb-2">Surprises</p>
                        <ul class="space-y-1">
                          <li v-for="(surprise, i) in transcriptAnalysis.extractedInsights.surprises" :key="i" class="text-xs text-yellow-700">
                            - {{ surprise }}
                          </li>
                        </ul>
                      </div>
                      <div v-if="transcriptAnalysis.extractedInsights.contradictions?.length" class="p-3 bg-red-50 rounded-lg border border-red-200">
                        <p class="text-xs font-medium text-red-800 mb-2">Contradictions</p>
                        <ul class="space-y-1">
                          <li v-for="(contradiction, i) in transcriptAnalysis.extractedInsights.contradictions" :key="i" class="text-xs text-red-700">
                            - {{ contradiction }}
                          </li>
                        </ul>
                      </div>
                      <div v-if="transcriptAnalysis.extractedInsights.quotableLines?.length" class="p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <p class="text-xs font-medium text-purple-800 mb-2">Quotable Lines</p>
                        <ul class="space-y-1">
                          <li v-for="(quote, i) in transcriptAnalysis.extractedInsights.quotableLines" :key="i" class="text-xs text-purple-700 italic">
                            "{{ quote }}"
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <!-- Action Items -->
                  <div v-if="transcriptAnalysis.actionItems?.length" class="mb-4">
                    <h5 class="text-sm font-medium text-gray-700 mb-3">Recommended Next Steps</h5>
                    <ul class="space-y-1">
                      <li v-for="(action, i) in transcriptAnalysis.actionItems" :key="i" class="flex items-start gap-2 text-sm text-gray-600">
                        <svg class="w-4 h-4 text-accent-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {{ action }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Interview List -->
              <div class="space-y-3">
                <div
                  v-for="note in selectedArchetype.interviewNotes"
                  :key="note.id"
                  class="p-4 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-gray-900">{{ note.interviewee }}</span>
                        <span class="text-xs text-gray-500">{{ note.role }}</span>
                      </div>
                      <p class="text-sm text-gray-600 mt-2 line-clamp-3">{{ note.rawNotes }}</p>

                      <!-- Extracted insights -->
                      <div v-if="note.keyInsights.length > 0" class="mt-3 space-y-1">
                        <div v-for="(insight, i) in note.keyInsights" :key="i" class="flex items-start gap-2 text-xs">
                          <span class="text-green-600">Key:</span>
                          <span class="text-gray-600">{{ insight }}</span>
                        </div>
                      </div>
                      <div v-if="note.contradictions.length > 0" class="mt-2 space-y-1">
                        <div v-for="(contradiction, i) in note.contradictions" :key="i" class="flex items-start gap-2 text-xs">
                          <span class="text-red-600">Contradiction:</span>
                          <span class="text-gray-600">{{ contradiction }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="selectedArchetype.interviewNotes.length === 0" class="text-center py-8 text-gray-500">
                  <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p>No interviews recorded yet</p>
                  <p class="text-sm mt-1">Talk to real customers to validate your hypotheses</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="flex-1 flex items-center justify-center bg-gray-50">
        <div class="text-center max-w-md">
          <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
            <svg class="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900 mb-2">Customer Archetypes</h2>
          <p class="text-gray-500 mb-6">
            Map your customer segments, validate hypotheses through interviews, and discover what really drives their decisions.
          </p>
          <button
            v-if="authStore.canEdit"
            class="btn-primary inline-flex items-center gap-2"
            @click="showCreateModal = true"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Archetype
          </button>
        </div>
      </div>
    </div>

    <!-- AI Drawer -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="showAiDrawer" class="fixed inset-0 z-50 overflow-hidden">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-gray-500/50 transition-opacity" @click="closeAiDrawer"></div>

          <!-- Drawer -->
          <div class="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div class="w-screen max-w-md">
              <div class="h-full flex flex-col bg-white shadow-xl">
                <!-- Header -->
                <div class="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-6">
                  <div class="flex items-start justify-between">
                    <div>
                      <h3 class="text-lg font-semibold text-white">AI Discovery Coach</h3>
                      <p class="text-indigo-100 text-sm mt-1">Challenging assumptions & finding blind spots</p>
                    </div>
                    <button
                      class="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                      @click="closeAiDrawer"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-6">
                  <!-- Loading -->
                  <div v-if="aiLoading" class="flex flex-col items-center justify-center py-12">
                    <svg class="w-8 h-8 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="text-gray-500 mt-3">Analyzing...</p>
                  </div>

                  <!-- Error -->
                  <div v-else-if="aiError" class="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
                    <div class="flex items-start gap-3">
                      <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p class="text-sm">{{ aiError }}</p>
                    </div>
                  </div>

                  <!-- Response -->
                  <div v-else-if="aiResponse" class="space-y-4">
                    <!-- ASSUMPTIONS PANEL -->
                    <template v-if="aiResponse.type === 'assumptions' && aiResponse.rawData?.assumptions">
                      <div class="flex items-center justify-between">
                        <span class="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Assumptions Found</span>
                        <button
                          class="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          @click="addAllAssumptions"
                        >
                          Add All to Hypotheses
                        </button>
                      </div>

                      <!-- Overall Readiness -->
                      <div class="p-3 bg-gray-100 rounded-lg">
                        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Overall Readiness</div>
                        <div class="font-semibold text-gray-900">{{ aiResponse.rawData.overallReadiness?.replace(/_/g, ' ') }}</div>
                      </div>

                      <!-- Top Risks -->
                      <div v-if="aiResponse.rawData.topRisks?.length" class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">Top Risks to Validate</h4>
                        <div v-for="(risk, i) in aiResponse.rawData.topRisks" :key="i" class="p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                          {{ i + 1 }}. {{ risk }}
                        </div>
                      </div>

                      <!-- Assumptions with Add buttons -->
                      <div class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">All Assumptions</h4>
                        <div
                          v-for="(assumption, index) in aiResponse.rawData.assumptions"
                          :key="index"
                          :class="[
                            'p-3 rounded-lg border transition-all',
                            assumption.added ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                          ]"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                              <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">{{ assumption.category }}</span>
                                <span class="text-xs text-gray-500">Risk: {{ assumption.riskScore }}</span>
                              </div>
                              <p class="text-sm text-gray-900">{{ assumption.assumption }}</p>
                              <p class="text-xs text-gray-600 mt-1">Validate: {{ assumption.validationApproach }}</p>
                            </div>
                            <button
                              v-if="!assumption.added"
                              class="flex-shrink-0 p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors"
                              title="Add as hypothesis"
                              @click="addAssumptionAsHypothesis(assumption, index)"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                            <span v-else class="flex-shrink-0 p-1.5 text-green-600">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      </div>
                    </template>

                    <!-- QUESTIONS PANEL -->
                    <template v-else-if="aiResponse.type === 'questions' && aiResponse.rawData?.questions">
                      <div class="flex items-center justify-between">
                        <span class="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">Interview Questions</span>
                        <button
                          class="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          @click="addAllQuestions"
                        >
                          Add All to Script
                        </button>
                      </div>

                      <!-- Tips -->
                      <div v-if="aiResponse.rawData.tips?.length" class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 class="font-semibold text-blue-900 text-sm mb-2">Interview Tips</h4>
                        <ul class="space-y-1">
                          <li v-for="(tip, i) in aiResponse.rawData.tips" :key="i" class="text-xs text-blue-800 flex items-start gap-2">
                            <span class="text-blue-500">•</span>
                            {{ tip }}
                          </li>
                        </ul>
                      </div>

                      <!-- Interview Flow -->
                      <div v-if="aiResponse.rawData.interviewFlow" class="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <h4 class="font-semibold text-gray-900 text-sm mb-2">Interview Flow</h4>
                        <p class="text-xs text-gray-600"><strong>Opening:</strong> {{ aiResponse.rawData.interviewFlow.opening }}</p>
                      </div>

                      <!-- Questions with Add buttons -->
                      <div class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">Questions</h4>
                        <div
                          v-for="(question, index) in aiResponse.rawData.questions"
                          :key="index"
                          :class="[
                            'p-3 rounded-lg border transition-all',
                            question.added ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                          ]"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                              <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{{ question.category }}</span>
                              </div>
                              <p class="text-sm font-medium text-gray-900">{{ question.question }}</p>
                              <p class="text-xs text-gray-600 mt-1">Purpose: {{ question.purpose }}</p>
                              <div v-if="question.followUps?.length" class="mt-2 pl-3 border-l-2 border-gray-200">
                                <p class="text-xs text-gray-500 mb-1">Follow-ups:</p>
                                <p v-for="(fu, fi) in question.followUps" :key="fi" class="text-xs text-gray-600">• {{ fu }}</p>
                              </div>
                            </div>
                            <button
                              v-if="!question.added"
                              class="flex-shrink-0 p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors"
                              title="Add to interview script"
                              @click="addAiQuestion(question, index)"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                            <span v-else class="flex-shrink-0 p-1.5 text-green-600">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      </div>
                    </template>

                    <!-- SYNTHESIS PANEL -->
                    <template v-else-if="aiResponse.type === 'synthesis' && aiResponse.rawData?.synthesis">
                      <span class="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Interview Synthesis</span>

                      <!-- Summary -->
                      <div v-if="aiResponse.rawData.synthesis.summary" class="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div class="text-sm font-medium text-green-900">{{ aiResponse.rawData.synthesis.summary.keyInsight }}</div>
                        <div class="flex items-center gap-4 mt-2">
                          <span class="text-xs text-green-700">Confidence: {{ aiResponse.rawData.synthesis.summary.confidenceLevel }}</span>
                        </div>
                      </div>

                      <!-- Hypothesis Updates -->
                      <div v-if="aiResponse.rawData.synthesis.hypothesisUpdates?.length" class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">Hypothesis Updates</h4>
                        <div
                          v-for="(update, index) in aiResponse.rawData.synthesis.hypothesisUpdates"
                          :key="index"
                          :class="[
                            'p-3 rounded-lg border transition-all',
                            update.applied ? 'bg-gray-100 border-gray-200' :
                            update.newStatus === 'validated' ? 'bg-green-50 border-green-200' :
                            update.newStatus === 'invalidated' ? 'bg-red-50 border-red-200' :
                            'bg-yellow-50 border-yellow-200'
                          ]"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                              <div class="flex items-center gap-2 mb-1">
                                <span :class="[
                                  'text-xs px-1.5 py-0.5 rounded',
                                  update.newStatus === 'validated' ? 'bg-green-200 text-green-800' :
                                  update.newStatus === 'invalidated' ? 'bg-red-200 text-red-800' :
                                  'bg-yellow-200 text-yellow-800'
                                ]">
                                  {{ update.previousStatus }} → {{ update.newStatus }}
                                </span>
                              </div>
                              <p class="text-sm text-gray-900">{{ update.hypothesis }}</p>
                              <p class="text-xs text-gray-600 mt-1">Evidence: {{ update.evidence }}</p>
                            </div>
                            <button
                              v-if="!update.applied"
                              class="flex-shrink-0 px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors text-xs font-medium"
                              @click="applyHypothesisUpdate(update, index)"
                            >
                              Apply
                            </button>
                            <span v-else class="flex-shrink-0 p-1.5 text-gray-400 text-xs">Applied</span>
                          </div>
                        </div>
                      </div>

                      <!-- Patterns -->
                      <div v-if="aiResponse.rawData.synthesis.patterns?.length" class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">Patterns Found</h4>
                        <div v-for="(pattern, i) in aiResponse.rawData.synthesis.patterns" :key="i" class="p-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-900">
                          <div class="font-medium">{{ pattern.pattern }}</div>
                          <div class="text-xs text-purple-700 mt-1">{{ pattern.frequency }} • {{ pattern.significance }} significance</div>
                        </div>
                      </div>

                      <!-- Contradictions -->
                      <div v-if="aiResponse.rawData.synthesis.contradictions?.length" class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">Contradictions</h4>
                        <div v-for="(c, i) in aiResponse.rawData.synthesis.contradictions" :key="i" class="p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                          <div class="text-amber-900"><strong>Said:</strong> "{{ c.stated }}"</div>
                          <div class="text-amber-900 mt-1"><strong>Did:</strong> "{{ c.revealed }}"</div>
                          <div class="text-xs text-amber-700 mt-1">→ {{ c.implication }}</div>
                        </div>
                      </div>

                      <!-- New Hypotheses -->
                      <div v-if="aiResponse.rawData.synthesis.newHypotheses?.length" class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">New Hypotheses to Test</h4>
                        <div
                          v-for="(hyp, index) in aiResponse.rawData.synthesis.newHypotheses"
                          :key="index"
                          :class="[
                            'p-3 rounded-lg border transition-all',
                            hyp.added ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
                          ]"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                              <span class="text-xs px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded">{{ hyp.category }}</span>
                              <p class="text-sm text-gray-900 mt-1">{{ hyp.hypothesis }}</p>
                            </div>
                            <button
                              v-if="!hyp.added"
                              class="flex-shrink-0 p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors"
                              title="Add as hypothesis"
                              @click="addNewHypothesisFromSynthesis(hyp, index)"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                            <span v-else class="flex-shrink-0 p-1.5 text-green-600">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      </div>

                      <!-- Quotable Insights -->
                      <div v-if="aiResponse.rawData.synthesis.quotableInsights?.length" class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">Quotable Insights</h4>
                        <div v-for="(quote, i) in aiResponse.rawData.synthesis.quotableInsights" :key="i" class="p-2 bg-gray-50 border-l-4 border-gray-400 text-sm text-gray-700 italic">
                          "{{ quote }}"
                        </div>
                      </div>

                      <!-- Next Steps -->
                      <div v-if="aiResponse.rawData.synthesis.summary?.recommendedNextSteps?.length" class="space-y-2">
                        <h4 class="font-semibold text-gray-900 text-sm">Recommended Next Steps</h4>
                        <ol class="list-decimal list-inside space-y-1">
                          <li v-for="(step, i) in aiResponse.rawData.synthesis.summary.recommendedNextSteps" :key="i" class="text-sm text-gray-700">
                            {{ step }}
                          </li>
                        </ol>
                      </div>
                    </template>

                    <!-- CHALLENGE PANEL (original text-based) -->
                    <template v-else-if="aiResponse.type === 'challenge'">
                      <span class="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">Challenge</span>
                      <div class="space-y-2">
                        <div
                          v-for="(item, index) in aiResponse.content"
                          :key="index"
                          :class="[
                            'p-3 rounded-lg text-sm',
                            item.startsWith('**') ? 'font-semibold text-gray-900 bg-transparent p-0 mt-4' :
                            item.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200' :
                            item.startsWith('•') ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                            'bg-gray-50 text-gray-700 border border-gray-200'
                          ]"
                        >
                          {{ item.replace(/\*\*/g, '') }}
                        </div>
                      </div>

                      <!-- Suggestions -->
                      <div v-if="aiResponse.suggestions && aiResponse.suggestions.length > 0" class="mt-6">
                        <h4 class="text-sm font-semibold text-gray-900 mb-3">Suggestions:</h4>
                        <div class="space-y-2">
                          <button
                            v-for="(suggestion, index) in aiResponse.suggestions"
                            :key="index"
                            class="w-full text-left p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-lg text-sm border border-indigo-200 transition-colors"
                            @click="applyAiSuggestion(suggestion)"
                          >
                            <span class="flex items-center gap-2">
                              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                              </svg>
                              {{ suggestion }}
                            </span>
                          </button>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- Empty state -->
                  <div v-else class="text-center py-12 text-gray-500">
                    <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <p>AI insights will appear here</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Create Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showCreateModal"
          class="fixed inset-0 z-50 overflow-y-auto"
        >
          <div class="flex min-h-full items-center justify-center p-4">
            <!-- Backdrop -->
            <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="showCreateModal = false"></div>

            <!-- Modal -->
            <div class="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
              <!-- Header -->
              <div class="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
                <h3 class="text-lg font-semibold text-white">Create Customer Archetype</h3>
                <p class="text-indigo-100 text-sm mt-1">Define a new customer segment to validate</p>
              </div>

              <!-- Body -->
              <div class="p-6 space-y-4">
                <div>
                  <label class="label">Archetype Name</label>
                  <input
                    v-model="newArchetypeName"
                    class="input"
                    placeholder="e.g., Enterprise IT Manager"
                    @keyup.enter="createArchetype"
                  />
                </div>

                <div>
                  <label class="label">Stakeholder Role</label>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="role in stakeholderRoles"
                      :key="role.value"
                      :class="[
                        'p-3 rounded-lg border-2 text-left transition-all',
                        newArchetypeRole === role.value
                          ? 'border-accent-500 bg-accent-50'
                          : 'border-gray-200 hover:border-gray-300'
                      ]"
                      @click="newArchetypeRole = role.value"
                    >
                      <span class="font-medium text-gray-900 text-sm">{{ role.label }}</span>
                      <p class="text-xs text-gray-500 mt-0.5">{{ role.description }}</p>
                    </button>
                  </div>
                </div>

                <div>
                  <label class="label">Custom Role Name (optional)</label>
                  <input
                    v-model="newArchetypeCustomRole"
                    class="input"
                    placeholder="e.g., The Budget-Conscious Innovator"
                  />
                  <p class="text-xs text-gray-500 mt-1">Give this persona a more specific name</p>
                </div>
              </div>

              <!-- Footer -->
              <div class="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button class="btn-secondary" @click="showCreateModal = false">Cancel</button>
                <button
                  class="btn-primary"
                  :disabled="!newArchetypeName.trim() || store.saving"
                  @click="createArchetype"
                >
                  {{ store.saving ? 'Creating...' : 'Create Archetype' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Drawer transitions */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-enter-active > div:last-child,
.drawer-leave-active > div:last-child {
  transition: transform 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from > div:last-child,
.drawer-leave-to > div:last-child {
  transform: translateX(100%);
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
