import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useFocusAreasStore } from './focusAreas'
import { useDiscoveryStore } from './discovery'
import { useCustomerArchetypesStore } from './customerArchetypes'
import { useObjectivesStore } from './objectives'
import { useDecisionsStore } from './decisions'
import { useDeliveryStore } from './delivery'
import type {
  FocusAreaMetrics,
  DiscoveryMetrics,
  CustomerDiscoveryHealth,
  StrategicAlignmentScore,
  ExecutiveMetrics,
  ConfidenceTrend,
} from '@/types'

export const useMetricsStore = defineStore('metrics', () => {
  const focusAreasStore = useFocusAreasStore()
  const discoveryStore = useDiscoveryStore()
  const archetypesStore = useCustomerArchetypesStore()
  const objectivesStore = useObjectivesStore()
  const decisionsStore = useDecisionsStore()
  const deliveryStore = useDeliveryStore()

  // Helper: Get timestamp from N days ago
  function getDaysAgo(days: number): Date {
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date
  }

  // Helper: Calculate days between two dates
  function daysBetween(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  // Focus Area Metrics
  const focusAreaMetrics = computed<FocusAreaMetrics[]>(() => {
    return focusAreasStore.activeFocusAreas.map((fa) => {
      const hypotheses = discoveryStore.hypotheses.filter((h) => h.focusAreaId === fa.id)
      const validated = hypotheses.filter((h) => h.status === 'validated').length
      const invalidated = hypotheses.filter((h) => h.status === 'invalidated').length
      const active = hypotheses.filter((h) => h.status === 'active').length
      const resolved = validated + invalidated

      // Count interviews from linked archetypes
      let interviewCount = 0
      if (fa.targetArchetypeIds?.length) {
        fa.targetArchetypeIds.forEach((archId) => {
          const arch = archetypesStore.archetypes.find((a) => a.id === archId)
          if (arch) {
            interviewCount += arch.interviewNotes.length
          }
        })
      }

      // Count delivered features linked to this focus area
      const deliveredFeatures = deliveryStore.changelog.filter(
        (c) => c.focusAreaId === fa.id
      ).length

      // Count open blockers
      const openBlockers = deliveryStore.blockers.filter(
        (b) => b.focusAreaId === fa.id && b.status === 'open'
      ).length

      // Calculate days active
      const createdDate = fa.createdAt?.toDate?.() || new Date()
      const daysActive = daysBetween(createdDate, new Date())

      // Determine confidence trend
      let confidenceTrend: ConfidenceTrend = 'stable'
      if (fa.confidenceHistory && fa.confidenceHistory.length >= 2) {
        const latest = fa.confidenceHistory[fa.confidenceHistory.length - 1]
        const previous = fa.confidenceHistory[fa.confidenceHistory.length - 2]
        const levels = { low: 1, medium: 2, high: 3 }
        if (latest && previous) {
          const latestLevel = levels[latest.level]
          const previousLevel = levels[previous.level]
          if (latestLevel > previousLevel) confidenceTrend = 'improving'
          else if (latestLevel < previousLevel) confidenceTrend = 'declining'
        }
      }

      return {
        id: fa.id,
        title: fa.title,
        status: fa.status,
        confidenceLevel: fa.confidenceLevel,
        confidenceTrend: fa.confidenceTrend || confidenceTrend,
        totalHypotheses: hypotheses.length,
        validatedHypotheses: validated,
        invalidatedHypotheses: invalidated,
        activeHypotheses: active,
        validationRate: resolved > 0 ? Math.round((validated / resolved) * 100) : 0,
        customerInterviewCount: interviewCount,
        deliveredFeatures,
        openBlockers,
        daysActive,
        lastActivityDate: fa.updatedAt?.toDate?.(),
        progressPercentage: fa.progressPercentage || 0,
      }
    })
  })

  // Discovery Velocity Metrics
  const discoveryMetrics = computed<DiscoveryMetrics>(() => {
    const oneWeekAgo = getDaysAgo(7)
    const twoWeeksAgo = getDaysAgo(14)

    // This week's activity
    const createdThisWeek = discoveryStore.hypotheses.filter((h) => {
      const created = h.createdAt?.toDate?.()
      return created && created >= oneWeekAgo
    }).length

    const validatedThisWeek = discoveryStore.hypotheses.filter((h) => {
      const validated = h.validatedAt?.toDate?.() || h.updatedAt?.toDate?.()
      return h.status === 'validated' && validated && validated >= oneWeekAgo
    }).length

    const invalidatedThisWeek = discoveryStore.hypotheses.filter((h) => {
      const invalidated = h.invalidatedAt?.toDate?.() || h.updatedAt?.toDate?.()
      return h.status === 'invalidated' && invalidated && invalidated >= oneWeekAgo
    }).length

    const resolvedThisWeek = validatedThisWeek + invalidatedThisWeek

    // Last week's activity for comparison
    const validatedLastWeek = discoveryStore.hypotheses.filter((h) => {
      const validated = h.validatedAt?.toDate?.() || h.updatedAt?.toDate?.()
      return (
        h.status === 'validated' &&
        validated &&
        validated >= twoWeeksAgo &&
        validated < oneWeekAgo
      )
    }).length

    const invalidatedLastWeek = discoveryStore.hypotheses.filter((h) => {
      const invalidated = h.invalidatedAt?.toDate?.() || h.updatedAt?.toDate?.()
      return (
        h.status === 'invalidated' &&
        invalidated &&
        invalidated >= twoWeeksAgo &&
        invalidated < oneWeekAgo
      )
    }).length

    const resolvedLastWeek = validatedLastWeek + invalidatedLastWeek

    // Week over week change
    const weekOverWeekChange =
      resolvedLastWeek > 0
        ? Math.round(((resolvedThisWeek - resolvedLastWeek) / resolvedLastWeek) * 100)
        : resolvedThisWeek > 0
          ? 100
          : 0

    // Validation rate
    const totalResolved = discoveryStore.validatedHypotheses.length + discoveryStore.invalidatedHypotheses.length
    const validationRate =
      totalResolved > 0
        ? Math.round((discoveryStore.validatedHypotheses.length / totalResolved) * 100)
        : 0

    // Evidence quality score (0-100)
    let evidenceQualityScore = 50 // Default
    const hypothesesWithEvidence = discoveryStore.hypotheses.filter(
      (h) => h.evidence && h.evidence.length > 0
    )
    if (hypothesesWithEvidence.length > 0) {
      const strengthScores = { weak: 25, moderate: 60, strong: 100 }
      const totalScore = hypothesesWithEvidence.reduce((sum, h) => {
        const strength = h.overallEvidenceStrength || 'weak'
        return sum + strengthScores[strength]
      }, 0)
      evidenceQualityScore = Math.round(totalScore / hypothesesWithEvidence.length)
    }

    // Average time to validation (simplified)
    const validatedWithDates = discoveryStore.validatedHypotheses.filter(
      (h) => h.createdAt && (h.validatedAt || h.updatedAt)
    )
    let avgTimeToValidation = 0
    if (validatedWithDates.length > 0) {
      const totalDays = validatedWithDates.reduce((sum, h) => {
        const created = h.createdAt.toDate()
        const validated = h.validatedAt?.toDate?.() || h.updatedAt?.toDate?.() || new Date()
        return sum + daysBetween(created, validated)
      }, 0)
      avgTimeToValidation = Math.round(totalDays / validatedWithDates.length)
    }

    return {
      hypothesesCreatedThisWeek: createdThisWeek,
      hypothesesResolvedThisWeek: resolvedThisWeek,
      validatedThisWeek,
      invalidatedThisWeek,
      avgTimeToValidation,
      validationRate,
      evidenceQualityScore,
      weekOverWeekChange,
    }
  })

  // Customer Discovery Health
  const customerDiscoveryHealth = computed<CustomerDiscoveryHealth>(() => {
    const activeArchetypes = archetypesStore.activeArchetypes

    const archetypesWithSufficientInterviews = activeArchetypes.filter(
      (a) => a.interviewNotes.length >= a.interviewTarget
    ).length

    const totalInterviews = activeArchetypes.reduce(
      (sum, a) => sum + a.interviewNotes.length,
      0
    )

    const avgInterviewsPerArchetype =
      activeArchetypes.length > 0
        ? Math.round((totalInterviews / activeArchetypes.length) * 10) / 10
        : 0

    // Interview velocity (last 30 days)
    const thirtyDaysAgo = getDaysAgo(30)
    let recentInterviews = 0
    activeArchetypes.forEach((a) => {
      a.interviewNotes.forEach((note) => {
        const noteDate = note.date?.toDate?.() || note.createdAt?.toDate?.()
        if (noteDate && noteDate >= thirtyDaysAgo) {
          recentInterviews++
        }
      })
    })
    const interviewVelocity = Math.round((recentInterviews / 4) * 10) / 10 // per week

    // Hypothesis validation rate across archetypes
    let totalHypotheses = 0
    let validatedHypotheses = 0
    activeArchetypes.forEach((a) => {
      const allHyps = [
        ...a.specificPainPoints,
        ...a.currentSolutions,
        ...a.primaryGoals,
        ...a.successMetrics,
        ...a.buyingCriteria,
        ...a.objections,
      ]
      totalHypotheses += allHyps.length
      validatedHypotheses += allHyps.filter((h) => h.status === 'validated').length
    })
    const hypothesisValidationRate =
      totalHypotheses > 0
        ? Math.round((validatedHypotheses / totalHypotheses) * 100)
        : 0

    // Average confidence score
    const avgConfidenceScore =
      activeArchetypes.length > 0
        ? Math.round(
            activeArchetypes.reduce((sum, a) => sum + a.confidenceScore, 0) /
              activeArchetypes.length
          )
        : 0

    // Archetypes at risk (low confidence + no recent interviews)
    const archetypesAtRisk = activeArchetypes.filter((a) => {
      const hasRecentInterview = a.interviewNotes.some((note) => {
        const noteDate = note.date?.toDate?.() || note.createdAt?.toDate?.()
        return noteDate && noteDate >= thirtyDaysAgo
      })
      return a.confidenceScore < 40 && !hasRecentInterview
    }).length

    return {
      totalArchetypes: activeArchetypes.length,
      archetypesWithSufficientInterviews,
      avgInterviewsPerArchetype,
      interviewVelocity,
      hypothesisValidationRate,
      avgConfidenceScore,
      archetypesAtRisk,
    }
  })

  // Strategic Alignment Score
  const strategicAlignmentScore = computed<StrategicAlignmentScore>(() => {
    // OKRs with focus areas
    const activeObjectives = objectivesStore.activeObjectives
    const objectivesWithFocusAreas =
      activeObjectives.length > 0
        ? Math.round(
            (activeObjectives.filter((o) => o.focusAreaIds?.length).length /
              activeObjectives.length) *
              100
          )
        : 100

    // Decisions with evidence
    const decidedDecisions = decisionsStore.decisions.filter(
      (d) => d.status === 'decided'
    )
    const decisionsWithEvidence =
      decidedDecisions.length > 0
        ? Math.round(
            (decidedDecisions.filter((d) => d.relatedHypothesisIds?.length).length /
              decidedDecisions.length) *
              100
          )
        : 100

    // Focus areas with archetypes
    const activeFocusAreas = focusAreasStore.activeFocusAreas
    const focusAreasWithArchetypes =
      activeFocusAreas.length > 0
        ? Math.round(
            (activeFocusAreas.filter((fa) => fa.targetArchetypeIds?.length).length /
              activeFocusAreas.length) *
              100
          )
        : 100

    // Hypotheses with archetypes
    const activeHypotheses = discoveryStore.activeHypotheses
    const hypothesesWithArchetypes =
      activeHypotheses.length > 0
        ? Math.round(
            (activeHypotheses.filter((h) => h.archetypeId).length /
              activeHypotheses.length) *
              100
          )
        : 100

    // Delivery with hypothesis validation
    const features = deliveryStore.changelog.filter((c) => c.type === 'feature')
    const deliveryWithHypotheses =
      features.length > 0
        ? Math.round(
            (features.filter((f) => f.validatedHypothesisIds?.length).length /
              features.length) *
              100
          )
        : 100

    // Overall weighted score
    const overallScore = Math.round(
      objectivesWithFocusAreas * 0.25 +
        decisionsWithEvidence * 0.25 +
        focusAreasWithArchetypes * 0.2 +
        hypothesesWithArchetypes * 0.15 +
        deliveryWithHypotheses * 0.15
    )

    return {
      objectivesWithFocusAreas,
      decisionsWithEvidence,
      focusAreasWithArchetypes,
      hypothesesWithArchetypes,
      deliveryWithHypotheses,
      overallScore,
    }
  })

  // Risk Indicators
  const riskIndicators = computed(() => {
    const risks: ExecutiveMetrics['riskIndicators'] = []

    // Open blockers
    const openBlockers = deliveryStore.blockers.filter((b) => b.status === 'open')
    if (openBlockers.length > 0) {
      risks.push({
        type: 'blocker',
        message: `${openBlockers.length} open blocker${openBlockers.length === 1 ? '' : 's'} requiring attention`,
        severity: openBlockers.length >= 3 ? 'high' : 'medium',
        path: '/delivery',
      })
    }

    // Stalled focus areas (no activity in 14+ days, low progress)
    const fourteenDaysAgo = getDaysAgo(14)
    const stalledFocusAreas = focusAreasStore.activeFocusAreas.filter((fa) => {
      const lastUpdate = fa.updatedAt?.toDate?.()
      const isStale = !lastUpdate || lastUpdate < fourteenDaysAgo
      const lowProgress = (fa.progressPercentage || 0) < 25
      return isStale && lowProgress
    })
    if (stalledFocusAreas.length > 0) {
      risks.push({
        type: 'stalled-focus-area',
        message: `${stalledFocusAreas.length} focus area${stalledFocusAreas.length === 1 ? '' : 's'} with no recent progress`,
        severity: 'medium',
        path: '/focus-areas',
      })
    }

    // Low evidence quality
    const lowEvidenceHypotheses = discoveryStore.validatedHypotheses.filter(
      (h) => h.overallEvidenceStrength === 'weak' || !h.evidence?.length
    )
    if (lowEvidenceHypotheses.length >= 3) {
      risks.push({
        type: 'low-evidence',
        message: `${lowEvidenceHypotheses.length} validated hypotheses lack strong evidence`,
        severity: 'medium',
        path: '/discovery',
      })
    }

    // Orphaned OKRs
    const orphanedOKRs = objectivesStore.activeObjectives.filter(
      (o) => !o.focusAreaIds?.length
    )
    if (orphanedOKRs.length > 0) {
      risks.push({
        type: 'orphaned-okr',
        message: `${orphanedOKRs.length} objective${orphanedOKRs.length === 1 ? '' : 's'} not aligned to focus areas`,
        severity: 'low',
        path: '/objectives',
      })
    }

    return risks.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })
  })

  // Top Insights (recent surprises and learnings)
  const topInsights = computed(() => {
    const insights: string[] = []

    // Recent invalidated hypotheses are learning opportunities
    const recentInvalidated = discoveryStore.invalidatedHypotheses
      .filter((h) => {
        const date = h.invalidatedAt?.toDate?.() || h.updatedAt?.toDate?.()
        return date && date >= getDaysAgo(30)
      })
      .slice(0, 3)

    recentInvalidated.forEach((h) => {
      insights.push(`Invalidated: "${h.belief.substring(0, 80)}${h.belief.length > 80 ? '...' : ''}"`)
    })

    // Surprising interview findings
    archetypesStore.activeArchetypes.forEach((a) => {
      a.interviewNotes
        .filter((note) => {
          const date = note.date?.toDate?.() || note.createdAt?.toDate?.()
          return date && date >= getDaysAgo(30)
        })
        .forEach((note) => {
          note.surprises.slice(0, 1).forEach((surprise) => {
            insights.push(`From ${a.name}: ${surprise.substring(0, 80)}${surprise.length > 80 ? '...' : ''}`)
          })
        })
    })

    return insights.slice(0, 5)
  })

  // Full Executive Metrics
  const executiveMetrics = computed<ExecutiveMetrics>(() => ({
    focusAreaMetrics: focusAreaMetrics.value,
    discoveryMetrics: discoveryMetrics.value,
    customerDiscoveryHealth: customerDiscoveryHealth.value,
    strategicAlignmentScore: strategicAlignmentScore.value,
    topInsights: topInsights.value,
    riskIndicators: riskIndicators.value,
  }))

  return {
    focusAreaMetrics,
    discoveryMetrics,
    customerDiscoveryHealth,
    strategicAlignmentScore,
    riskIndicators,
    topInsights,
    executiveMetrics,
  }
})
