# Signal Simplification Plan

## Vision Statement
**Signal helps product teams validate customer hypotheses through structured discovery, powered by AI.**

The core value is Steve Blank's customer development methodology - everything else is secondary.

---

## Current State → Target State

### Navigation Reduction: 12 → 5 Items

| Current (12) | Target (5) | Action |
|--------------|------------|--------|
| Dashboard | **Dashboard** | Keep - streamline metrics |
| Vision & Principles | **Vision & Strategy** | Keep - absorb Strategic Context |
| Focus Areas | **Focus Areas** | Keep - link to Customer Discovery |
| Strategic Context | ~~Remove~~ | Merge into Vision & Strategy |
| Team Objectives | ~~Remove~~ | Delete - use dedicated OKR tools |
| Customer Archetypes | **Customer Discovery** | Keep - absorb Discovery Hub |
| Discovery Hub | ~~Remove~~ | Merge into Customer Discovery |
| Delivery Tracker | ~~Remove~~ | Delete - use dedicated PM tools |
| Decisions Log | ~~Remove~~ | Delete - low strategic value |
| Documents | ~~Remove~~ | Delete - use Google Drive/Notion |
| Idea Hopper | **Customer Jobs** | Keep - absorb Journey Maps |
| Journey Maps | ~~Remove~~ | Merge into Customer Jobs |

---

## Phase 1: Remove Low-Value Features

**Goal:** Eliminate 5 standalone features that don't serve core customer discovery mission.

### 1.1 Remove Documents Feature

**Files to Delete:**
- `src/views/DocumentsView.vue`
- `src/stores/documents.ts`

**Files to Modify:**
- `src/router/index.ts` - Remove route
- `src/components/AppSidebar.vue` - Remove nav item
- `src/types/index.ts` - Remove Document, DocumentCategory types

**Firestore Collections to Deprecate:**
- `documents` (keep data, remove access)

---

### 1.2 Remove Delivery Tracker Feature

**Files to Delete:**
- `src/views/DeliveryView.vue`
- `src/stores/delivery.ts`

**Files to Modify:**
- `src/router/index.ts` - Remove route
- `src/components/AppSidebar.vue` - Remove nav item
- `src/views/DashboardView.vue` - Remove changelog/blockers sections
- `src/types/index.ts` - Remove ChangelogEntry, Blocker types

**Firestore Collections to Deprecate:**
- `changelog`
- `blockers`

---

### 1.3 Remove Team Objectives (OKRs) Feature

**Files to Delete:**
- `src/views/ObjectivesView.vue`
- `src/stores/objectives.ts`

**Files to Modify:**
- `src/router/index.ts` - Remove route
- `src/components/AppSidebar.vue` - Remove nav item
- `src/types/index.ts` - Remove Objective, KeyResult, ObjectiveStatus, KeyResultStatus types

**Firestore Collections to Deprecate:**
- `objectives`

---

### 1.4 Remove Decisions Log Feature

**Files to Delete:**
- `src/views/DecisionsView.vue`
- `src/stores/decisions.ts`

**Files to Modify:**
- `src/router/index.ts` - Remove route
- `src/components/AppSidebar.vue` - Remove nav item
- `src/types/index.ts` - Remove Decision, DecisionOption, DecisionStatus, DecisionCategory types

**Firestore Collections to Deprecate:**
- `decisions`

---

## Phase 2: Merge Related Features

### 2.1 Merge Strategic Context → Vision & Strategy

**Rationale:** Strategic context (market dynamics, competitive landscape, etc.) is foundational context that belongs with vision and principles, not as a separate destination.

**Current State:**
- VisionView.vue: Mission, vision, principles, company URL, business model
- StrategicContextView.vue: 5 strategic sections with AI enrichment

**Target State:**
- Single "Vision & Strategy" page with expandable sections
- Vision/Mission/Principles at top
- Strategic Context sections below (collapsible)

**Files to Modify:**
- `src/views/VisionView.vue` - Add strategic context sections
- `src/stores/vision.ts` - Absorb strategic context state/actions

**Files to Delete:**
- `src/views/StrategicContextView.vue`
- `src/stores/strategicContext.ts`

**Implementation:**
```vue
<!-- VisionView.vue - New Structure -->
<template>
  <div>
    <!-- Existing Vision Section -->
    <section class="vision-section">
      <h2>Product Vision</h2>
      <!-- vision, mission, principles -->
    </section>

    <!-- NEW: Collapsible Strategic Context -->
    <section class="strategic-context">
      <h2>Strategic Context</h2>
      <Disclosure v-for="section in strategicSections">
        <DisclosureButton>{{ section.title }}</DisclosureButton>
        <DisclosurePanel>
          <!-- AI enrich button + content -->
        </DisclosurePanel>
      </Disclosure>
    </section>
  </div>
</template>
```

---

### 2.2 Merge Discovery Hub → Customer Discovery

**Rationale:** Discovery Hub tracks hypotheses. Customer Archetypes tracks hypotheses per customer segment. These are the same concept at different levels of abstraction.

**Current State:**
- DiscoveryView.vue: Generic hypotheses (belief/test/result) + design partner feedback
- CustomerArchetypesView.vue: Customer-specific hypotheses across 6 categories

**Target State:**
- Customer Discovery page with archetypes as primary container
- Hypotheses always belong to an archetype (or "General" archetype)
- Design partner feedback linked to specific archetypes
- Discovery Hub insights become archetype interview insights

**Files to Modify:**
- `src/views/CustomerArchetypesView.vue` → Rename to `CustomerDiscoveryView.vue`
- `src/stores/customerArchetypes.ts` → Absorb discovery store functionality

**Files to Delete:**
- `src/views/DiscoveryView.vue`
- `src/stores/discovery.ts`

**Data Migration:**
- Existing hypotheses → Create "General Research" archetype to hold them
- Existing feedback → Link to appropriate archetype or "General Research"

**Key Changes:**
1. Add "General Research" as a special archetype for non-customer-specific hypotheses
2. Move feedback management into archetype detail view
3. Simplify hypothesis categories from 6 to 3:
   - **Problems** (merge: specificPainPoints, currentSolutions)
   - **Goals** (merge: primaryGoals, successMetrics)
   - **Buying** (merge: buyingCriteria, objections)

---

### 2.3 Merge Journey Maps → Customer Jobs (Idea Hopper)

**Rationale:** Journey Maps are always created FROM an Idea. They should be inline, not a separate destination.

**Current State:**
- IdeaHopperView.vue: Ideas with JTBD structure
- JourneyMapsView.vue: Journey maps linked to ideas

**Target State:**
- Renamed to "Customer Jobs"
- Journey map is an expandable section within each idea's detail view
- AI-generate journey map button inside idea detail

**Files to Modify:**
- `src/views/IdeaHopperView.vue` → Rename to `CustomerJobsView.vue`
- `src/stores/ideas.ts` - No changes needed (journeyMaps store still separate but UI merged)

**Files to Delete:**
- `src/views/JourneyMapsView.vue` (UI only - keep store for data)

**Implementation:**
```vue
<!-- CustomerJobsView.vue - Idea Detail -->
<div v-if="selectedIdea" class="idea-detail">
  <h3>{{ selectedIdea.title }}</h3>

  <!-- JTBD Info -->
  <div class="jtbd-card">
    <p><strong>Customer:</strong> {{ selectedIdea.job.customer }}</p>
    <p><strong>Progress:</strong> {{ selectedIdea.job.progress }}</p>
    <p><strong>Circumstance:</strong> {{ selectedIdea.job.circumstance }}</p>
  </div>

  <!-- NEW: Inline Journey Map -->
  <div class="journey-map-section">
    <div class="flex justify-between">
      <h4>Customer Journey</h4>
      <button @click="generateJourneyMap">Generate with AI</button>
    </div>
    <JourneyMapVisualization
      v-if="ideaJourneyMap"
      :journey-map="ideaJourneyMap"
    />
    <p v-else class="text-gray-500">
      No journey map yet. Generate one to visualize the customer experience.
    </p>
  </div>
</div>
```

---

## Phase 3: Simplify Core Features

### 3.1 Simplify Customer Discovery (Archetypes)

**Current Complexity:**
- 6 hypothesis categories
- 6 tabs in detail view
- 25+ form fields
- 3500+ lines in single view file

**Target Simplification:**

#### A. Reduce Hypothesis Categories: 6 → 3

| Current | Target |
|---------|--------|
| specificPainPoints | **Problems** |
| currentSolutions | **Problems** |
| primaryGoals | **Goals** |
| successMetrics | **Goals** |
| buyingCriteria | **Buying** |
| objections | **Buying** |

#### B. Reduce Tabs: 6 → 4

| Current Tabs | Target Tabs |
|--------------|-------------|
| Profile | **Profile** (simplified) |
| Problems | **Hypotheses** (all 3 categories) |
| Goals | ~~merged~~ |
| Buying | ~~merged~~ |
| Value Props | **Value Props** |
| Interviews | **Interviews** |

#### C. Progressive Disclosure for Profile Fields

Only show essential fields initially:
- Name
- Stakeholder Role
- Job Title
- Problem Statement

Reveal additional fields after initial save:
- Daily Reality
- Background
- Demographics

#### D. Split View Component

Extract tab contents into separate components:

```
src/components/archetypes/
  ├── ArchetypeProfile.vue
  ├── ArchetypeHypotheses.vue
  ├── ArchetypeValueProps.vue
  └── ArchetypeInterviews.vue
```

---

### 3.2 Simplify Dashboard

**Current State:** Shows metrics from 4 stores (focusAreas, discovery, delivery, vision)

**Target State:** Shows metrics from 2 stores (focusAreas, customerDiscovery)

**New Dashboard Metrics:**
1. Active Focus Areas (count)
2. Customer Archetypes (count by phase)
3. Hypotheses Validated This Week
4. Interview Count / Target
5. Confidence Score (average across archetypes)

**Remove:**
- Changelog section
- Blockers alert
- Generic hypothesis list (now in Customer Discovery)

---

### 3.3 Extract Cloud Function Auth Middleware

**Current:** Auth check duplicated in all 10 functions (~200 lines)

**Target:** Single reusable middleware

```javascript
// functions/lib/auth.js
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

async function requireAuth(request, allowedRoles = ["cpo", "team"]) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const userDoc = await admin
    .firestore()
    .collection("users")
    .doc(request.auth.uid)
    .get();

  if (!userDoc.exists) {
    throw new HttpsError("permission-denied", "User profile not found");
  }

  const userData = userDoc.data();
  if (!allowedRoles.includes(userData.role)) {
    throw new HttpsError("permission-denied", "Insufficient permissions");
  }

  return { user: userData, uid: request.auth.uid };
}

module.exports = { requireAuth };
```

---

## Phase 4: Update Navigation & Routes

### 4.1 New Route Structure

```typescript
// src/router/index.ts
const routes = [
  { path: '/login', name: 'Login', component: LoginView },
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', component: DashboardView },
      { path: 'vision', name: 'Vision', component: VisionView },
      { path: 'focus-areas', name: 'FocusAreas', component: FocusAreasView },
      { path: 'customer-discovery', name: 'CustomerDiscovery', component: CustomerDiscoveryView },
      { path: 'customer-jobs', name: 'CustomerJobs', component: CustomerJobsView },
    ],
  },
]
```

### 4.2 New Navigation Items

```typescript
// src/components/AppSidebar.vue
const navItems = [
  { name: 'Dashboard', path: '/', icon: 'home', roles: ['cpo', 'team', 'leadership'] },
  { name: 'Vision & Strategy', path: '/vision', icon: 'star', roles: ['cpo', 'team', 'leadership'] },
  { name: 'Focus Areas', path: '/focus-areas', icon: 'target', roles: ['cpo', 'team', 'leadership'] },
  { name: 'Customer Discovery', path: '/customer-discovery', icon: 'users', roles: ['cpo', 'team'] },
  { name: 'Customer Jobs', path: '/customer-jobs', icon: 'lightbulb', roles: ['cpo', 'team'] },
]
```

---

## Implementation Checklist

### Phase 1: Remove Features (Est. 1 day)
- [ ] Delete DocumentsView.vue and documents.ts
- [ ] Delete DeliveryView.vue and delivery.ts
- [ ] Delete ObjectivesView.vue and objectives.ts
- [ ] Delete DecisionsView.vue and decisions.ts
- [ ] Update router to remove routes
- [ ] Update AppSidebar to remove nav items
- [ ] Update DashboardView to remove delivery metrics
- [ ] Clean up types/index.ts
- [ ] Test application still builds and runs

### Phase 2: Merge Features (Est. 3 days)
- [ ] Merge Strategic Context into VisionView
- [ ] Delete StrategicContextView.vue and strategicContext.ts
- [ ] Merge Discovery Hub into CustomerDiscoveryView
- [ ] Delete DiscoveryView.vue and discovery.ts
- [ ] Merge Journey Maps UI into CustomerJobsView
- [ ] Delete JourneyMapsView.vue (keep store)
- [ ] Update all routes and navigation
- [ ] Test merged functionality

### Phase 3: Simplify Core (Est. 2 days)
- [ ] Reduce hypothesis categories from 6 to 3
- [ ] Reduce archetype tabs from 6 to 4
- [ ] Implement progressive disclosure for profile fields
- [ ] Split CustomerDiscoveryView into sub-components
- [ ] Simplify Dashboard metrics
- [ ] Extract Cloud Function auth middleware
- [ ] Update all Cloud Functions to use middleware

### Phase 4: Polish (Est. 1 day)
- [ ] Update all navigation and routes
- [ ] Test complete user flows
- [ ] Update any hardcoded references
- [ ] Clean up unused types and imports
- [ ] Final testing and bug fixes

---

## Preserved Capabilities

Despite removing 7 features, these core capabilities remain:

| Capability | How It's Preserved |
|------------|-------------------|
| Track company vision | Vision & Strategy page |
| Define principles | Vision & Strategy page |
| Strategic analysis | Collapsible sections in Vision & Strategy |
| AI enrichment | All AI functions preserved |
| Problem prioritization | Focus Areas (unchanged) |
| Customer hypothesis tracking | Customer Discovery (enhanced) |
| Interview management | Customer Discovery (unchanged) |
| Transcript analysis | Customer Discovery (unchanged) |
| Jobs to Be Done | Customer Jobs (unchanged) |
| Journey mapping | Inline in Customer Jobs |
| Confidence scoring | Customer Discovery (unchanged) |
| BS detection | Customer Discovery (unchanged) |

---

## What's NOT Being Preserved

| Removed Capability | Rationale | Alternative |
|-------------------|-----------|-------------|
| Document storage | Use Google Drive, Notion, etc. | External tools |
| OKR tracking | Use Lattice, 15Five, etc. | Dedicated OKR tools |
| Decision logging | Low usage, not core to discovery | Meeting notes, Notion |
| Changelog tracking | Use Linear, Jira, etc. | Dedicated PM tools |
| Blocker tracking | Use Linear, Jira, etc. | Dedicated PM tools |
| Standalone journey maps | Merged into Customer Jobs | Still available inline |
| Standalone hypotheses | Merged into Customer Discovery | Still available with archetypes |

---

## Success Metrics

After implementation, measure:

1. **Navigation clicks to complete core workflow**
   - Before: 7+ clicks to validate a hypothesis
   - Target: 4 clicks

2. **New user time-to-first-archetype**
   - Before: Unknown (likely 10+ minutes)
   - Target: < 5 minutes

3. **Code complexity**
   - Before: 13 views, 12 stores, ~15,000 LOC
   - Target: 6 views, 6 stores, ~9,000 LOC

4. **Cognitive load**
   - Before: 12 navigation items
   - Target: 5 navigation items
