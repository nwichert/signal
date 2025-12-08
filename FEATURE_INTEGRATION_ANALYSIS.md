# Signal Feature Integration Analysis

## Vision: Product Team Command Center

Signal should be the central nervous system for product teams - where every feature communicates with others to provide a unified view of customer discovery, strategy, and execution.

---

## Current State: Feature Connection Map

### Existing Connections (What's Working)

| From | To | Connection Type | Location |
|------|-----|-----------------|----------|
| Discovery Hub | Focus Areas | Hypothesis → Focus Area link | `DiscoveryView.vue:232-240` |
| Idea Hopper | Focus Areas | Idea → Focus Area link | `IdeaHopperView.vue:260-270` |
| Journey Maps | Idea Hopper | Journey Map → Idea link | `JourneyMapsView.vue:15-16` |
| Dashboard | Focus Areas | Displays active count | `DashboardView.vue:169-174` |
| Dashboard | Discovery | Displays active hypotheses | `DashboardView.vue:176-185` |
| Dashboard | Delivery | Displays blockers/changelog | `DashboardView.vue:194-208` |
| Dashboard | Vision | Displays vision statement | `DashboardView.vue:89-143` |
| Strategic Context | Vision | Fetches vision for AI context | `functions/index.js:84-111` |

### Connection Strength Rating

```
STRONG (bi-directional, actively used):
  Journey Maps ←→ Idea Hopper (required link)

MEDIUM (one-directional, optional):
  Discovery Hub → Focus Areas (optional focusAreaId)
  Idea Hopper → Focus Areas (optional focusAreaId)

WEAK (display only, no interaction):
  Dashboard → All features (read-only aggregation)
  Strategic Context → Vision (AI context only)

NONE (completely isolated):
  Customer Archetypes ←✕→ Everything else
  Team Objectives ←✕→ Everything else
  Decisions Log ←✕→ Everything else
  Documents ←✕→ Everything else
  Delivery Tracker ←✕→ Focus Areas
  Vision ←✕→ Customer Archetypes
```

---

## Gap Analysis: Missing Integrations

### CRITICAL GAPS (High Impact)

#### 1. Customer Archetypes ←→ Discovery Hub
**Current State:** Completely isolated
**Problem:** Both track hypotheses about customers, but don't share data
**Impact:** Duplicate work, inconsistent customer understanding

**Missing Connections:**
- Customer Archetype pain points should link to Discovery hypotheses
- Validated archetype hypotheses should create/update Discovery entries
- Design Partner Feedback should be linkable to specific archetypes
- Interview insights should flow to Discovery Hub patterns

---

#### 2. Customer Archetypes ←→ Focus Areas
**Current State:** No connection
**Problem:** Focus Areas define problems, Archetypes define who has them
**Impact:** No visibility into which customer segments relate to which focus areas

**Missing Connections:**
- Focus Area should be linkable to Customer Archetypes
- Archetype pain points should reference Focus Areas
- Focus Area confidence should consider archetype validation status

---

#### 3. Customer Archetypes ←→ Idea Hopper
**Current State:** No connection
**Problem:** Ideas have JTBD with "Customer" field but don't link to Archetypes
**Impact:** No connection between customer insights and product ideas

**Missing Connections:**
- Idea's JTBD "Customer" should optionally link to an Archetype
- Archetype pain points should spawn Ideas
- Validated archetypes should influence idea prioritization

---

#### 4. Team Objectives ←→ Focus Areas
**Current State:** No connection
**Problem:** OKRs exist in isolation from strategic focus
**Impact:** Can't see if OKRs align with strategic priorities

**Missing Connections:**
- Objectives should link to Focus Areas they address
- Key Results should reference hypothesis validation metrics
- Focus Area success criteria should drive Key Results

---

### IMPORTANT GAPS (Medium Impact)

#### 5. Decisions Log ←→ Focus Areas
**Current State:** No connection
**Problem:** Decisions made without explicit focus area context
**Impact:** Hard to trace why decisions were made

**Missing Connections:**
- Decisions should link to relevant Focus Areas
- Focus Area changes should trigger decision review prompts

---

#### 6. Decisions Log ←→ Discovery Hub
**Current State:** No connection
**Problem:** Decisions not informed by validated/invalidated hypotheses
**Impact:** Decisions made without evidence context

**Missing Connections:**
- Decisions should reference supporting hypotheses
- Hypothesis results should suggest decision reviews

---

#### 7. Documents ←→ Customer Archetypes
**Current State:** No connection
**Problem:** Research documents not linked to archetype profiles
**Impact:** Interview transcripts, research reports disconnected from archetypes

**Missing Connections:**
- Documents should link to relevant Archetypes
- Archetype interview notes should reference documents
- Research documents should auto-suggest archetype updates

---

#### 8. Delivery Tracker ←→ Discovery Hub
**Current State:** No connection
**Problem:** Can't see which shipped features validated which hypotheses
**Impact:** No feedback loop from delivery to learning

**Missing Connections:**
- Changelog entries should link to validated hypotheses
- Blockers should reference at-risk hypotheses

---

#### 9. Journey Maps ←→ Customer Archetypes
**Current State:** No connection
**Problem:** Journey maps don't reference the archetype experiencing the journey
**Impact:** Journeys exist without customer context

**Missing Connections:**
- Journey Maps should optionally link to Archetypes
- Archetype daily reality should inform journey pain points

---

### NICE-TO-HAVE GAPS (Lower Impact)

#### 10. Vision ←→ Team Objectives
**Current State:** No connection
**Problem:** Vision principles don't connect to quarterly objectives
**Impact:** Hard to verify OKRs align with vision

---

#### 11. Strategic Context ←→ Focus Areas
**Current State:** AI uses for context, but no explicit link
**Problem:** Market dynamics don't directly influence focus prioritization
**Impact:** Strategic context feels disconnected from tactical focus

---

#### 12. Documents ←→ Decisions
**Current State:** No connection
**Problem:** Decision rationale can't reference supporting documents
**Impact:** Decisions lack traceable evidence

---

## Proposed Integration Architecture

### Core Entity Relationships

```
                    ┌─────────────────┐
                    │     VISION      │
                    │   & STRATEGY    │
                    └────────┬────────┘
                             │ informs
                             ▼
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   CUSTOMER   │◄───►│   FOCUS AREAS   │◄───►│    TEAM      │
│  ARCHETYPES  │     │   (Problems)    │     │  OBJECTIVES  │
└──────┬───────┘     └────────┬────────┘     └──────────────┘
       │                      │
       │ validates            │ tests
       ▼                      ▼
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│  INTERVIEWS  │────►│  DISCOVERY HUB  │◄────│  DECISIONS   │
│   & NOTES    │     │  (Hypotheses)   │     │     LOG      │
└──────────────┘     └────────┬────────┘     └──────────────┘
                              │
                              │ spawns
                              ▼
                    ┌─────────────────┐     ┌──────────────┐
                    │   IDEA HOPPER   │────►│   JOURNEY    │
                    │    (JTBD)       │     │     MAPS     │
                    └────────┬────────┘     └──────────────┘
                             │
                             │ ships as
                             ▼
                    ┌─────────────────┐
                    │    DELIVERY     │
                    │    TRACKER      │
                    └─────────────────┘
```

---

## Implementation Plan: Adding Missing Links

### Phase 1: Critical Links (Highest Value)

#### 1.1 Customer Archetypes ↔ Focus Areas

**Type Changes:**
```typescript
// src/types/index.ts

// Add to CustomerArchetype
interface CustomerArchetype {
  // ... existing fields
  relatedFocusAreaIds: string[]  // NEW: which focus areas this archetype relates to
}

// Add to FocusArea
interface FocusArea {
  // ... existing fields
  targetArchetypeIds: string[]  // NEW: which archetypes experience this problem
}
```

**UI Changes:**
- Focus Areas: Add "Target Customers" multi-select showing archetypes
- Customer Archetypes: Add "Related Problems" section linking to focus areas
- Dashboard: Show focus area + archetype alignment status

---

#### 1.2 Customer Archetypes ↔ Discovery Hub

**Type Changes:**
```typescript
// Add to Hypothesis
interface Hypothesis {
  // ... existing fields
  archetypeId?: string  // NEW: which archetype this hypothesis is about
}

// Add to Feedback
interface Feedback {
  // ... existing fields
  archetypeId?: string  // NEW: which archetype this feedback is from
}
```

**UI Changes:**
- Discovery Hub: Add archetype selector when creating hypotheses
- Discovery Hub: Filter hypotheses by archetype
- Customer Archetypes: Show related hypotheses from Discovery Hub
- Archetype Interviews tab: Option to create Discovery hypothesis from interview insight

---

#### 1.3 Customer Archetypes ↔ Idea Hopper

**Type Changes:**
```typescript
// Add to Idea
interface Idea {
  // ... existing fields
  targetArchetypeId?: string  // NEW: which archetype this idea serves
}
```

**UI Changes:**
- Idea Hopper: Add "Target Customer" dropdown showing archetypes
- Idea detail: Show linked archetype's key pain points
- Customer Archetypes: Show ideas targeting this archetype

---

### Phase 2: Important Links (Medium Value)

#### 2.1 Team Objectives ↔ Focus Areas

**Type Changes:**
```typescript
// Add to Objective
interface Objective {
  // ... existing fields
  focusAreaIds: string[]  // NEW: which focus areas this objective addresses
}
```

**UI Changes:**
- Objectives: Multi-select for related focus areas
- Focus Areas: Show objectives working on this problem
- Dashboard: Alignment score between objectives and focus areas

---

#### 2.2 Decisions ↔ Focus Areas + Discovery

**Type Changes:**
```typescript
// Add to Decision
interface Decision {
  // ... existing fields
  focusAreaId?: string     // NEW: which focus area this decision affects
  relatedHypothesisIds: string[]  // NEW: hypotheses informing this decision
}
```

**UI Changes:**
- Decisions: Link to focus area and supporting hypotheses
- Decision detail: Show validation status of linked hypotheses
- Discovery Hub: Show decisions influenced by each hypothesis

---

#### 2.3 Delivery ↔ Discovery + Focus Areas

**Type Changes:**
```typescript
// Add to ChangelogEntry
interface ChangelogEntry {
  // ... existing fields
  validatedHypothesisIds: string[]  // NEW: hypotheses this feature validates
  focusAreaId?: string              // NEW: which focus area this addresses
}

// Add to Blocker
interface Blocker {
  // ... existing fields
  focusAreaId?: string  // NEW: which focus area is blocked
}
```

**UI Changes:**
- Changelog: Link entries to validated hypotheses
- Blockers: Link to focus areas being blocked
- Discovery Hub: Show which hypotheses have shipped validation

---

#### 2.4 Documents ↔ Customer Archetypes

**Type Changes:**
```typescript
// Add to Document
interface Document {
  // ... existing fields
  archetypeIds: string[]  // NEW: which archetypes this document relates to
}
```

**UI Changes:**
- Documents: Multi-select for related archetypes
- Customer Archetypes: Show related documents in profile
- Interview notes: Attach documents to interview records

---

#### 2.5 Journey Maps ↔ Customer Archetypes

**Type Changes:**
```typescript
// Add to JourneyMap
interface JourneyMap {
  // ... existing fields
  archetypeId?: string  // NEW: which archetype experiences this journey
}
```

**UI Changes:**
- Journey Maps: Optional archetype selector
- Customer Archetypes: Show journey maps for this archetype
- Journey step pain points: Reference archetype's validated pain points

---

### Phase 3: Dashboard as Command Center

Transform Dashboard from passive display to active command center:

#### 3.1 Cross-Feature Insights Panel

```
┌─────────────────────────────────────────────────────────────┐
│                    ALIGNMENT STATUS                          │
├─────────────────────────────────────────────────────────────┤
│  Focus Areas without target Archetypes: 2 ⚠️                │
│  Archetypes without validated hypotheses: 3 ⚠️              │
│  OKRs not linked to Focus Areas: 4 ⚠️                       │
│  Ideas without target Archetypes: 5                         │
│  Decisions pending hypothesis validation: 2                 │
└─────────────────────────────────────────────────────────────┘
```

#### 3.2 Customer Discovery Funnel

```
┌─────────────────────────────────────────────────────────────┐
│              CUSTOMER DISCOVERY FUNNEL                       │
├─────────────────────────────────────────────────────────────┤
│  Archetypes:  12 total │ 8 active │ 3 validated │ 1 draft  │
│  Hypotheses:  45 total │ 18 active │ 20 validated │ 7 inv. │
│  Interviews:  34 completed │ 8 this week │ 66 to go        │
│  Confidence:  Average 67% across validated archetypes       │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3 Quick Navigation by Context

```
"Show me everything about [Archetype Name]"
  → Pain points, hypotheses, feedback, ideas, journey maps, documents

"What's blocking [Focus Area Name]?"
  → Blockers, unvalidated hypotheses, missing archetype data

"Evidence for [Decision Title]"
  → Linked hypotheses, interview quotes, archetype insights
```

---

## Data Flow: How Features Should Communicate

### Customer Discovery Flow

```
1. VISION defines who we serve (target user)
                ↓
2. FOCUS AREAS identify problems to solve
                ↓
3. CUSTOMER ARCHETYPES model who has these problems
                ↓
4. DISCOVERY HUB tests hypotheses about archetypes + problems
                ↓
5. INTERVIEWS validate/invalidate hypotheses
                ↓
6. VALIDATED INSIGHTS spawn IDEAS (JTBD)
                ↓
7. JOURNEY MAPS visualize archetype experience
                ↓
8. DECISIONS use validated evidence
                ↓
9. DELIVERY ships features that validate hypotheses
                ↓
10. CHANGELOG closes the loop back to DISCOVERY
```

### Decision Flow

```
1. FOCUS AREA raises strategic question
                ↓
2. DISCOVERY HUB tests options as hypotheses
                ↓
3. ARCHETYPE INTERVIEWS gather evidence
                ↓
4. DECISION LOG records options with evidence links
                ↓
5. DECISION made referencing validated hypotheses
                ↓
6. OKR created to execute decision
                ↓
7. DELIVERY tracks implementation
```

---

## Implementation Priority

### Must Have (v1.0)
1. Customer Archetypes ↔ Focus Areas link
2. Customer Archetypes ↔ Discovery Hub link
3. Dashboard alignment status panel

### Should Have (v1.1)
4. Customer Archetypes ↔ Idea Hopper link
5. Team Objectives ↔ Focus Areas link
6. Journey Maps ↔ Customer Archetypes link

### Nice to Have (v1.2)
7. Decisions ↔ Focus Areas + Discovery link
8. Delivery ↔ Discovery feedback loop
9. Documents ↔ Archetypes link
10. Cross-feature search and navigation

---

## Success Metrics

After implementing integrations, measure:

1. **Link Utilization**: % of entities with cross-feature links populated
2. **Discovery Cycle Time**: Time from hypothesis → validation → decision
3. **Evidence-Based Decisions**: % of decisions with linked validated hypotheses
4. **Archetype Completeness**: % of archetypes linked to focus areas, ideas, journeys
5. **Dashboard Engagement**: Time spent on dashboard, actions taken from dashboard

---

## Summary

Signal currently has 12 features that operate largely in isolation. To become a true product team command center, these features need to communicate through:

- **15+ new entity relationships** connecting archetypes, focus areas, hypotheses, ideas, and decisions
- **Cross-feature UI patterns** showing related entities inline
- **Dashboard transformation** from passive display to active command center
- **Data flow enforcement** ensuring evidence flows from discovery to decision to delivery

The result: A unified system where customer insights flow naturally from discovery through delivery, with full traceability at every step.
