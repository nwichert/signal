import { useFocusAreasStore } from '@/stores/focusAreas'
import { useDiscoveryStore } from '@/stores/discovery'
import { useCustomerArchetypesStore } from '@/stores/customerArchetypes'
import { useIdeasStore } from '@/stores/ideas'
import { useDecisionsStore } from '@/stores/decisions'
import { useObjectivesStore } from '@/stores/objectives'
import { useJourneyMapsStore } from '@/stores/journeyMaps'
import { useDocumentsStore } from '@/stores/documents'
import { useDeliveryStore } from '@/stores/delivery'

interface RelatedItem {
  id: string
  type: 'archetype' | 'focus-area' | 'hypothesis' | 'idea' | 'decision' | 'objective' | 'journey-map' | 'document' | 'feedback' | 'changelog' | 'blocker'
  title: string
  status?: string
  path?: string
}

export function useRelatedItems() {
  const focusAreasStore = useFocusAreasStore()
  const discoveryStore = useDiscoveryStore()
  const archetypesStore = useCustomerArchetypesStore()
  const ideasStore = useIdeasStore()
  const decisionsStore = useDecisionsStore()
  const objectivesStore = useObjectivesStore()
  const journeyMapsStore = useJourneyMapsStore()
  const documentsStore = useDocumentsStore()
  const deliveryStore = useDeliveryStore()

  // Get related items for a Focus Area
  function getRelatedToFocusArea(focusAreaId: string): RelatedItem[] {
    const items: RelatedItem[] = []

    // Archetypes linked to this focus area
    archetypesStore.archetypes
      .filter(a => a.relatedFocusAreaIds?.includes(focusAreaId))
      .forEach(a => items.push({
        id: a.id,
        type: 'archetype',
        title: a.name,
        status: a.status,
        path: '/customer-archetypes'
      }))

    // Hypotheses linked to this focus area
    discoveryStore.hypotheses
      .filter(h => h.focusAreaId === focusAreaId)
      .forEach(h => items.push({
        id: h.id,
        type: 'hypothesis',
        title: h.belief,
        status: h.status,
        path: '/discovery'
      }))

    // Ideas linked to this focus area
    ideasStore.ideas
      .filter(i => i.focusAreaId === focusAreaId)
      .forEach(i => items.push({
        id: i.id,
        type: 'idea',
        title: i.title,
        status: i.status,
        path: '/idea-hopper'
      }))

    // Decisions linked to this focus area
    decisionsStore.decisions
      .filter(d => d.focusAreaId === focusAreaId)
      .forEach(d => items.push({
        id: d.id,
        type: 'decision',
        title: d.title,
        status: d.status,
        path: '/decisions'
      }))

    // Objectives linked to this focus area
    objectivesStore.objectives
      .filter(o => o.focusAreaIds?.includes(focusAreaId))
      .forEach(o => items.push({
        id: o.id,
        type: 'objective',
        title: o.title,
        status: o.status,
        path: '/objectives'
      }))

    // Documents linked to this focus area
    documentsStore.documents
      .filter(d => d.focusAreaIds?.includes(focusAreaId))
      .forEach(d => items.push({
        id: d.id,
        type: 'document',
        title: d.name,
        path: '/documents'
      }))

    // Changelog entries linked to this focus area
    deliveryStore.changelog
      .filter(c => c.focusAreaId === focusAreaId)
      .forEach(c => items.push({
        id: c.id,
        type: 'changelog',
        title: c.title,
        path: '/delivery'
      }))

    // Blockers linked to this focus area
    deliveryStore.blockers
      .filter(b => b.focusAreaId === focusAreaId)
      .forEach(b => items.push({
        id: b.id,
        type: 'blocker',
        title: b.title,
        status: b.status,
        path: '/delivery'
      }))

    return items
  }

  // Get related items for a Customer Archetype
  function getRelatedToArchetype(archetypeId: string): RelatedItem[] {
    const items: RelatedItem[] = []
    const archetype = archetypesStore.getArchetypeById(archetypeId)

    // Focus Areas linked to this archetype
    if (archetype?.relatedFocusAreaIds) {
      archetype.relatedFocusAreaIds.forEach(faId => {
        const fa = focusAreasStore.focusAreas.find(f => f.id === faId)
        if (fa) {
          items.push({
            id: fa.id,
            type: 'focus-area',
            title: fa.title,
            status: fa.status,
            path: '/focus-areas'
          })
        }
      })
    }

    // Focus Areas that target this archetype
    focusAreasStore.focusAreas
      .filter(fa => fa.targetArchetypeIds?.includes(archetypeId))
      .forEach(fa => {
        if (!items.some(i => i.id === fa.id)) {
          items.push({
            id: fa.id,
            type: 'focus-area',
            title: fa.title,
            status: fa.status,
            path: '/focus-areas'
          })
        }
      })

    // Hypotheses about this archetype
    discoveryStore.hypotheses
      .filter(h => h.archetypeId === archetypeId)
      .forEach(h => items.push({
        id: h.id,
        type: 'hypothesis',
        title: h.belief,
        status: h.status,
        path: '/discovery'
      }))

    // Feedback from this archetype
    discoveryStore.feedback
      .filter(f => f.archetypeId === archetypeId)
      .forEach(f => items.push({
        id: f.id,
        type: 'feedback',
        title: f.content.substring(0, 50) + '...',
        path: '/discovery'
      }))

    // Ideas targeting this archetype
    ideasStore.ideas
      .filter(i => i.targetArchetypeId === archetypeId)
      .forEach(i => items.push({
        id: i.id,
        type: 'idea',
        title: i.title,
        status: i.status,
        path: '/idea-hopper'
      }))

    // Journey Maps for this archetype
    journeyMapsStore.journeyMaps
      .filter(j => j.archetypeId === archetypeId)
      .forEach(j => items.push({
        id: j.id,
        type: 'journey-map',
        title: j.title,
        path: '/journey-maps'
      }))

    // Documents about this archetype
    documentsStore.documents
      .filter(d => d.archetypeIds?.includes(archetypeId))
      .forEach(d => items.push({
        id: d.id,
        type: 'document',
        title: d.name,
        path: '/documents'
      }))

    return items
  }

  // Get related items for a Hypothesis
  function getRelatedToHypothesis(hypothesisId: string): RelatedItem[] {
    const items: RelatedItem[] = []
    const hypothesis = discoveryStore.hypotheses.find(h => h.id === hypothesisId)

    // Focus Area
    if (hypothesis?.focusAreaId) {
      const fa = focusAreasStore.focusAreas.find(f => f.id === hypothesis.focusAreaId)
      if (fa) {
        items.push({
          id: fa.id,
          type: 'focus-area',
          title: fa.title,
          status: fa.status,
          path: '/focus-areas'
        })
      }
    }

    // Archetype
    if (hypothesis?.archetypeId) {
      const archetype = archetypesStore.getArchetypeById(hypothesis.archetypeId)
      if (archetype) {
        items.push({
          id: archetype.id,
          type: 'archetype',
          title: archetype.name,
          status: archetype.status,
          path: '/customer-archetypes'
        })
      }
    }

    // Decisions using this hypothesis
    decisionsStore.decisions
      .filter(d => d.relatedHypothesisIds?.includes(hypothesisId))
      .forEach(d => items.push({
        id: d.id,
        type: 'decision',
        title: d.title,
        status: d.status,
        path: '/decisions'
      }))

    // Changelog entries that validated this hypothesis
    deliveryStore.changelog
      .filter(c => c.validatedHypothesisIds?.includes(hypothesisId))
      .forEach(c => items.push({
        id: c.id,
        type: 'changelog',
        title: c.title,
        path: '/delivery'
      }))

    return items
  }

  // Get related items for an Idea
  function getRelatedToIdea(ideaId: string): RelatedItem[] {
    const items: RelatedItem[] = []
    const idea = ideasStore.getIdeaById(ideaId)

    // Focus Area
    if (idea?.focusAreaId) {
      const fa = focusAreasStore.focusAreas.find(f => f.id === idea.focusAreaId)
      if (fa) {
        items.push({
          id: fa.id,
          type: 'focus-area',
          title: fa.title,
          status: fa.status,
          path: '/focus-areas'
        })
      }
    }

    // Target Archetype
    if (idea?.targetArchetypeId) {
      const archetype = archetypesStore.getArchetypeById(idea.targetArchetypeId)
      if (archetype) {
        items.push({
          id: archetype.id,
          type: 'archetype',
          title: archetype.name,
          status: archetype.status,
          path: '/customer-archetypes'
        })
      }
    }

    // Journey Maps for this idea
    journeyMapsStore.journeyMaps
      .filter(j => j.ideaId === ideaId)
      .forEach(j => items.push({
        id: j.id,
        type: 'journey-map',
        title: j.title,
        path: '/journey-maps'
      }))

    return items
  }

  // Get related items for a Decision
  function getRelatedToDecision(decisionId: string): RelatedItem[] {
    const items: RelatedItem[] = []
    const decision = decisionsStore.decisions.find(d => d.id === decisionId)

    // Focus Area
    if (decision?.focusAreaId) {
      const fa = focusAreasStore.focusAreas.find(f => f.id === decision.focusAreaId)
      if (fa) {
        items.push({
          id: fa.id,
          type: 'focus-area',
          title: fa.title,
          status: fa.status,
          path: '/focus-areas'
        })
      }
    }

    // Related Hypotheses
    if (decision?.relatedHypothesisIds) {
      decision.relatedHypothesisIds.forEach(hId => {
        const h = discoveryStore.hypotheses.find(hyp => hyp.id === hId)
        if (h) {
          items.push({
            id: h.id,
            type: 'hypothesis',
            title: h.belief,
            status: h.status,
            path: '/discovery'
          })
        }
      })
    }

    return items
  }

  // Get related items for an Objective
  function getRelatedToObjective(objectiveId: string): RelatedItem[] {
    const items: RelatedItem[] = []
    const objective = objectivesStore.objectives.find(o => o.id === objectiveId)

    // Focus Areas
    if (objective?.focusAreaIds) {
      objective.focusAreaIds.forEach(faId => {
        const fa = focusAreasStore.focusAreas.find(f => f.id === faId)
        if (fa) {
          items.push({
            id: fa.id,
            type: 'focus-area',
            title: fa.title,
            status: fa.status,
            path: '/focus-areas'
          })
        }
      })
    }

    return items
  }

  // Get related items for a Journey Map
  function getRelatedToJourneyMap(journeyMapId: string): RelatedItem[] {
    const items: RelatedItem[] = []
    const journeyMap = journeyMapsStore.getJourneyMapById(journeyMapId)

    // Linked Idea
    if (journeyMap?.ideaId) {
      const idea = ideasStore.getIdeaById(journeyMap.ideaId)
      if (idea) {
        items.push({
          id: idea.id,
          type: 'idea',
          title: idea.title,
          status: idea.status,
          path: '/idea-hopper'
        })
      }
    }

    // Linked Archetype
    if (journeyMap?.archetypeId) {
      const archetype = archetypesStore.getArchetypeById(journeyMap.archetypeId)
      if (archetype) {
        items.push({
          id: archetype.id,
          type: 'archetype',
          title: archetype.name,
          status: archetype.status,
          path: '/customer-archetypes'
        })
      }
    }

    return items
  }

  // Get counts for dashboard
  function getConnectionCounts() {
    return {
      archetypesWithFocusAreas: archetypesStore.archetypes.filter(a => a.relatedFocusAreaIds?.length).length,
      focusAreasWithArchetypes: focusAreasStore.focusAreas.filter(f => f.targetArchetypeIds?.length).length,
      hypothesesWithArchetypes: discoveryStore.hypotheses.filter(h => h.archetypeId).length,
      ideasWithArchetypes: ideasStore.ideas.filter(i => i.targetArchetypeId).length,
      objectivesWithFocusAreas: objectivesStore.objectives.filter(o => o.focusAreaIds?.length).length,
      decisionsWithEvidence: decisionsStore.decisions.filter(d => d.relatedHypothesisIds?.length).length,
      journeyMapsWithArchetypes: journeyMapsStore.journeyMaps.filter(j => j.archetypeId).length,
    }
  }

  // Get alignment warnings for dashboard
  function getAlignmentWarnings() {
    const warnings: { type: 'warning' | 'info'; message: string; path: string }[] = []

    // Focus areas without target archetypes
    const faWithoutArchetypes = focusAreasStore.activeFocusAreas.filter(fa => !fa.targetArchetypeIds?.length)
    if (faWithoutArchetypes.length > 0) {
      warnings.push({
        type: 'warning',
        message: `${faWithoutArchetypes.length} focus area${faWithoutArchetypes.length > 1 ? 's' : ''} without target customers`,
        path: '/focus-areas'
      })
    }

    // Active archetypes without focus areas
    const archWithoutFa = archetypesStore.activeArchetypes.filter(a => !a.relatedFocusAreaIds?.length)
    if (archWithoutFa.length > 0) {
      warnings.push({
        type: 'warning',
        message: `${archWithoutFa.length} archetype${archWithoutFa.length > 1 ? 's' : ''} not linked to problems`,
        path: '/customer-archetypes'
      })
    }

    // Active hypotheses without archetypes
    const hypWithoutArch = discoveryStore.activeHypotheses.filter(h => !h.archetypeId)
    if (hypWithoutArch.length > 0) {
      warnings.push({
        type: 'info',
        message: `${hypWithoutArch.length} hypothesis${hypWithoutArch.length > 1 ? 'es' : ''} not linked to customers`,
        path: '/discovery'
      })
    }

    // OKRs without focus areas
    const okrWithoutFa = objectivesStore.activeObjectives.filter(o => !o.focusAreaIds?.length)
    if (okrWithoutFa.length > 0) {
      warnings.push({
        type: 'warning',
        message: `${okrWithoutFa.length} objective${okrWithoutFa.length > 1 ? 's' : ''} not aligned to focus areas`,
        path: '/objectives'
      })
    }

    // Proposed decisions without evidence
    const decisionsWithoutEvidence = decisionsStore.proposedDecisions.filter(d => !d.relatedHypothesisIds?.length)
    if (decisionsWithoutEvidence.length > 0) {
      warnings.push({
        type: 'info',
        message: `${decisionsWithoutEvidence.length} proposed decision${decisionsWithoutEvidence.length > 1 ? 's' : ''} without linked evidence`,
        path: '/decisions'
      })
    }

    return warnings
  }

  return {
    getRelatedToFocusArea,
    getRelatedToArchetype,
    getRelatedToHypothesis,
    getRelatedToIdea,
    getRelatedToDecision,
    getRelatedToObjective,
    getRelatedToJourneyMap,
    getConnectionCounts,
    getAlignmentWarnings,
  }
}
