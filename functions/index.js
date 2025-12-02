const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk").default;

admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/**
 * Enriches strategic context using Claude AI
 */
exports.enrichStrategicContext = onCall(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    // Verify user has team or cpo role
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (!userDoc.exists) {
      throw new HttpsError("permission-denied", "User profile not found");
    }

    const userRole = userDoc.data().role;
    if (!["cpo", "team"].includes(userRole)) {
      throw new HttpsError("permission-denied", "Insufficient permissions");
    }

    const { section, currentContent, companyContext } = request.data;

    if (!section) {
      throw new HttpsError("invalid-argument", "Section is required");
    }

    const validSections = [
      "marketDynamics",
      "enablingTechnologies",
      "competitiveLandscape",
      "customerPainEvolution",
      "keyInsights",
    ];

    if (!validSections.includes(section)) {
      throw new HttpsError("invalid-argument", "Invalid section");
    }

    // Fetch Vision & Principles from Firestore
    const visionDoc = await admin
      .firestore()
      .collection("vision")
      .doc("current")
      .get();

    const visionData = visionDoc.exists ? visionDoc.data() : null;

    // Build vision context string
    let visionContext = "";
    if (visionData) {
      if (visionData.vision) {
        visionContext += `Product Vision:\n${visionData.vision}\n\n`;
      }
      if (visionData.principles && visionData.principles.length > 0) {
        visionContext += "Guiding Principles:\n";
        visionData.principles.forEach((p, i) => {
          visionContext += `${i + 1}. ${p.title}: ${p.description}\n`;
        });
        visionContext += "\n";
      }
      if (visionData.targetUser) {
        visionContext += `Target User: ${visionData.targetUser}\n\n`;
      }
      if (visionData.problemStatement) {
        visionContext += `Problem Statement: ${visionData.problemStatement}\n\n`;
      }
    }

    // Fetch active Focus Areas for additional context
    const focusAreasSnapshot = await admin
      .firestore()
      .collection("focusAreas")
      .where("status", "==", "active")
      .get();

    let focusAreasContext = "";
    if (!focusAreasSnapshot.empty) {
      focusAreasContext = "Current Focus Areas:\n";
      focusAreasSnapshot.docs.forEach((doc) => {
        const fa = doc.data();
        focusAreasContext += `- ${fa.title} (${fa.confidenceLevel} confidence): ${fa.rationale || ""}\n`;
      });
      focusAreasContext += "\n";
    }

    const sectionPrompts = {
      marketDynamics: `Analyze market dynamics for a healthcare navigation company serving first responders. Consider:
- Current trends affecting first responders and healthcare navigation
- Regulatory changes impacting the industry
- Economic factors influencing purchasing decisions
- Emerging market opportunities`,

      enablingTechnologies: `Identify enabling technologies relevant to a healthcare navigation platform for first responders:
- AI and automation capabilities now feasible
- Mobile and communication technologies
- Data integration and interoperability advances
- Emerging tech that could be leveraged`,

      competitiveLandscape: `Analyze the competitive landscape for healthcare navigation serving first responders:
- Types of competitors (direct, indirect, potential)
- Key differentiators and positioning opportunities
- Market gaps and underserved needs
- Competitive threats to monitor`,

      customerPainEvolution: `Analyze evolving customer pain points for first responders needing healthcare navigation:
- Pain points that are getting worse
- Newly articulated frustrations
- Unmet needs becoming more urgent
- Changing expectations and behaviors`,

      keyInsights: `Synthesize strategic insights for a healthcare navigation company serving first responders:
- Patterns across market, technology, and customer signals
- Strategic implications
- Opportunities to prioritize
- Risks to mitigate`,
    };

    const systemPrompt = `You are a strategic analyst helping a product team stay aligned on vision, strategy, and execution.

Your role is to provide thoughtful, actionable strategic analysis grounded in the company's actual vision, principles, and current focus areas. Be specific rather than generic. Focus on insights that would actually inform product and business decisions.

Format your response as structured content with clear sections and bullet points where appropriate. Keep the total response under 500 words but make every word count.`;

    // Build comprehensive context from all sources
    let fullContext = "";

    if (visionContext) {
      fullContext += "=== COMPANY VISION & PRINCIPLES ===\n" + visionContext;
    }

    if (focusAreasContext) {
      fullContext += "=== CURRENT STRATEGIC FOCUS ===\n" + focusAreasContext;
    }

    if (companyContext) {
      fullContext += "=== ADDITIONAL COMPANY CONTEXT ===\n" + companyContext + "\n\n";
    }

    const userPrompt = `${sectionPrompts[section]}

${fullContext ? `Use the following context to inform your analysis:\n\n${fullContext}` : ""}
${currentContent ? `Current content to enhance:\n${currentContent}\n\nBuild on and improve this existing content while staying aligned with the company's vision and focus.` : "Generate fresh analysis for this section that aligns with the company's vision and current strategic focus."}`;

    try {
      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new HttpsError("internal", "Unexpected response format");
      }

      return {
        enrichedContent: content.text,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error("Claude API error:", error);
      throw new HttpsError(
        "internal",
        "Failed to generate content: " + error.message
      );
    }
  }
);

/**
 * Generates product vision suggestions using Claude AI
 */
exports.generateProductVision = onCall(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    // Verify user has team or cpo role
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (!userDoc.exists) {
      throw new HttpsError("permission-denied", "User profile not found");
    }

    const userRole = userDoc.data().role;
    if (!["cpo", "team"].includes(userRole)) {
      throw new HttpsError("permission-denied", "Insufficient permissions");
    }

    const { companyUrl, coreBusinessModel, mission, principles } = request.data;

    if (!companyUrl && !mission) {
      throw new HttpsError(
        "invalid-argument",
        "Company URL or mission is required"
      );
    }

    // Build context from inputs
    let context = "";

    if (companyUrl) {
      context += `Company Website: ${companyUrl}\n\n`;
    }

    if (coreBusinessModel) {
      context += `Core Business Model: ${coreBusinessModel}\n\n`;
    }

    if (mission) {
      context += `Mission Statement: ${mission}\n\n`;
    }

    if (principles && principles.length > 0) {
      context += "Product Principles:\n";
      principles.forEach((p, i) => {
        context += `${i + 1}. ${p.title}`;
        if (p.description) {
          context += `: ${p.description}`;
        }
        context += "\n";
      });
      context += "\n";
    }

    const systemPrompt = `You are a strategic product vision expert who thinks like a top-tier venture capitalist at Sequoia or a16z. Your job is to help product teams craft compelling, ambitious product vision statements that could define an entire category.

A product vision answers the question: "If we succeed wildly, what's different in the world 3-5 years from now?"

## The VC Mindset for Vision
Great VCs don't invest in incremental improvements - they invest in companies that will fundamentally reshape how things work. Think about:
- Airbnb didn't say "better hotel bookings" - they envisioned "belong anywhere"
- Stripe didn't say "easier payments" - they envisioned "increase the GDP of the internet"
- Figma didn't say "better design tools" - they envisioned "making design accessible to everyone"

Your visions should be:
- TRANSFORMATIONAL, not incremental (10x better, not 10% better)
- CATEGORY-DEFINING, not category-following
- INEVITABLE - describing a future that feels obvious once stated but bold nonetheless
- EXPANSIVE - hinting at a much larger opportunity than current scope

## Vision Framework
To craft the best vision, consider:
1. WHO are you serving? (the specific people whose lives will change)
2. What does PAIN look like today? (their current struggles, frustrations, unmet needs)
3. What does "BETTER" look like emotionally? (how they'll feel when the pain is solved - relief, empowerment, joy, peace of mind)
4. What does the company BELIEVE? (core convictions that drive the mission)
5. What PARADIGM SHIFT does this enable? (what becomes possible that wasn't before?)

## Characteristics of a Great Vision
- Paints a vivid picture of a transformed future state (3-5 years out)
- Centers on human outcomes, not product features or technology
- Captures the emotional shift - from pain to possibility
- Is ambitious enough to attract world-class talent and partners
- Feels slightly uncomfortable in its ambition - if it doesn't scare you a little, it's not bold enough
- Could be the opening line of a pitch to Sequoia
- Is concise (1-3 sentences max)

## What to Avoid
- Incremental language ("improve", "better", "easier", "faster")
- Feature-focused statements
- Safe, achievable-sounding goals
- Vague platitudes without specificity

Based on the company context provided, generate exactly 4 distinct product vision statements. Each should:
- Take a slightly different angle or emphasis
- Stay true to the company's mission and principles
- Be bold enough to define a category
- Sound like something a founder would say when pitching Sequoia

Return your response as a JSON array of 4 strings, each containing one vision statement. Do not include any other text, just the JSON array.

Example format:
["Vision statement 1", "Vision statement 2", "Vision statement 3", "Vision statement 4"]`;

    const userPrompt = `Based on the following company context, generate 4 compelling product vision statements.

${context}

For each vision, think about:
- Who specifically does this company serve?
- What pain or struggle do those people face today?
- What would "better" look and feel like for them?
- What beliefs or values drive this company?
- What PARADIGM SHIFT could this company enable?
- What category could they define or own?

Imagine you're a partner at Sequoia or a16z evaluating this company. What vision would make you say "This could be huge - they're not just building a product, they're reshaping an industry"?

Craft visions that answer: "If we succeed wildly, what's fundamentally different in the world 3-5 years from now?"

Avoid incremental language. Be bold. Think 10x, not 10%.

Return ONLY a JSON array of 4 vision statement strings, no other text.`;

    try {
      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new HttpsError("internal", "Unexpected response format");
      }

      // Parse the JSON array from the response
      let suggestions;
      try {
        // Try to extract JSON from the response
        const jsonMatch = content.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON array found in response");
        }
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError(
          "internal",
          "Failed to parse vision suggestions"
        );
      }

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        throw new HttpsError("internal", "Invalid suggestions format");
      }

      return {
        suggestions,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error("Claude API error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to generate vision suggestions: " + error.message
      );
    }
  }
);

/**
 * Improves a problem statement using Claude AI
 */
exports.improveProblemStatement = onCall(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    // Verify user has team or cpo role
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (!userDoc.exists) {
      throw new HttpsError("permission-denied", "User profile not found");
    }

    const userRole = userDoc.data().role;
    if (!["cpo", "team"].includes(userRole)) {
      throw new HttpsError("permission-denied", "Insufficient permissions");
    }

    const { title, problemStatement } = request.data;

    if (!problemStatement || !problemStatement.trim()) {
      throw new HttpsError(
        "invalid-argument",
        "Problem statement is required"
      );
    }

    // Fetch Vision & Principles for context
    const visionDoc = await admin
      .firestore()
      .collection("vision")
      .doc("main")
      .get();

    let visionContext = "";
    if (visionDoc.exists) {
      const visionData = visionDoc.data();
      if (visionData.vision) {
        visionContext += `Product Vision: ${visionData.vision}\n\n`;
      }
      if (visionData.mission) {
        visionContext += `Mission: ${visionData.mission}\n\n`;
      }
    }

    const systemPrompt = `You are a product strategy expert who helps teams write crisp, actionable problem statements for their focus areas.

## What Makes a Great Problem Statement
A great problem statement follows the format: "[WHO] struggles with [WHAT] because [WHY], which results in [IMPACT]"

Key characteristics:
- **Specific**: Names a concrete user segment, not "users" or "customers"
- **Observable**: Describes behavior or symptoms you can actually see/measure
- **Root-cause aware**: Goes beyond surface symptoms to underlying causes
- **Impact-focused**: Connects to business or user outcomes that matter
- **Non-solutioned**: Describes the problem without prescribing a solution
- **Emotionally resonant**: Captures the human frustration or pain

## Examples of Weak vs Strong Problem Statements

WEAK: "Users have trouble with onboarding"
STRONG: "New small business owners abandon our setup flow at the bank connection step because they're worried about security, leaving 34% of signups unable to use core features."

WEAK: "Our search doesn't work well"
STRONG: "Field technicians waste 15+ minutes per job searching for equipment manuals because our search only matches exact titles, causing frustration and delayed service calls."

WEAK: "Customers want better reporting"
STRONG: "Finance managers spend 4+ hours weekly manually exporting and reformatting data for board reports because our dashboards can't be customized for executive audiences, creating busywork and delayed insights."

## Your Task
Take the user's draft problem statement and generate 3 improved versions that are:
1. More specific about WHO is affected
2. Clearer about the observable PROBLEM
3. More insightful about the root CAUSE
4. More compelling about the IMPACT

Each suggestion should take a slightly different angle or emphasis while staying true to the core issue.

Return your response as a JSON array of 3 strings. Do not include any other text, just the JSON array.

Example format:
["Improved statement 1", "Improved statement 2", "Improved statement 3"]`;

    let userPrompt = `Please improve this problem statement for a focus area${title ? ` titled "${title}"` : ""}:

"${problemStatement}"

${visionContext ? `Context about our product:\n${visionContext}` : ""}

Generate 3 improved versions that are more specific, observable, root-cause aware, and impact-focused. Each should take a slightly different angle.

Return ONLY a JSON array of 3 improved problem statement strings, no other text.`;

    try {
      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new HttpsError("internal", "Unexpected response format");
      }

      // Parse the JSON array from the response
      let suggestions;
      try {
        const jsonMatch = content.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON array found in response");
        }
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError(
          "internal",
          "Failed to parse problem statement suggestions"
        );
      }

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        throw new HttpsError("internal", "Invalid suggestions format");
      }

      return {
        suggestions,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error("Claude API error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to improve problem statement: " + error.message
      );
    }
  }
);

/**
 * Enriches company context using Claude AI
 */
exports.enrichCompanyContext = onCall(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    // Verify user has team or cpo role
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (!userDoc.exists) {
      throw new HttpsError("permission-denied", "User profile not found");
    }

    const userRole = userDoc.data().role;
    if (!["cpo", "team"].includes(userRole)) {
      throw new HttpsError("permission-denied", "Insufficient permissions");
    }

    const { currentContext, derivedContext } = request.data;

    const systemPrompt = `You are a strategic business analyst helping a product team articulate their company context for strategic planning purposes.

Your task is to take the basic company information provided and expand it into a rich, comprehensive company context that would help AI systems provide better strategic analysis.

## What to Include in Enriched Company Context

1. **Company Overview**: What the company does, its core value proposition
2. **Target Market**: Who they serve, market segments, customer profiles
3. **Business Model**: How they create and capture value
4. **Key Differentiators**: What makes them unique, competitive advantages
5. **Current Stage**: Where they are in their journey (startup, growth, scale, etc.)
6. **Strategic Priorities**: What they're focused on achieving
7. **Market Position**: Where they sit in the competitive landscape
8. **Challenges & Opportunities**: Key dynamics they're navigating

## Guidelines

- Expand on the provided information, don't contradict it
- Be specific rather than generic
- Use clear, professional language
- Keep the total length reasonable (300-500 words)
- Format with clear sections for readability
- If information is missing, make reasonable inferences based on context but don't fabricate specific numbers or claims

Return ONLY the enriched company context text, no additional commentary.`;

    const userPrompt = `Please enrich the following company context for strategic planning purposes.

${derivedContext ? `=== AUTO-POPULATED FROM VISION & PRINCIPLES ===\n${derivedContext}\n\n` : ""}${currentContext ? `=== CURRENT ADDITIONAL CONTEXT ===\n${currentContext}\n\n` : ""}${!derivedContext && !currentContext ? "No context provided yet. Please provide a template that the user can fill in with their company information." : ""}

Expand this into a comprehensive company context that covers: company overview, target market, business model, key differentiators, current stage, and strategic priorities. Keep the tone professional and strategic.`;

    try {
      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new HttpsError("internal", "Unexpected response format");
      }

      return {
        enrichedContent: content.text,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error("Claude API error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to enrich company context: " + error.message
      );
    }
  }
);

/**
 * Generates a journey map draft using Claude AI based on a Job to be Done
 */
exports.generateJourneyMap = onCall(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    // Verify user has team or cpo role
    const userDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (!userDoc.exists) {
      throw new HttpsError("permission-denied", "User profile not found");
    }

    const userRole = userDoc.data().role;
    if (!["cpo", "team"].includes(userRole)) {
      throw new HttpsError("permission-denied", "Insufficient permissions");
    }

    const { job, ideaTitle, ideaDescription } = request.data;

    if (!job || !job.customer || !job.progress || !job.circumstance) {
      throw new HttpsError(
        "invalid-argument",
        "Complete Job to be Done information is required"
      );
    }

    // Fetch Vision & Principles for context
    const visionDoc = await admin
      .firestore()
      .collection("vision")
      .doc("main")
      .get();

    let visionContext = "";
    if (visionDoc.exists) {
      const visionData = visionDoc.data();
      if (visionData.vision) {
        visionContext += `Product Vision: ${visionData.vision}\n\n`;
      }
      if (visionData.coreBusinessModel) {
        visionContext += `Business Model: ${visionData.coreBusinessModel}\n\n`;
      }
    }

    const systemPrompt = `You are an expert in Jobs to be Done (JTBD) methodology and customer journey mapping. Your task is to create a detailed journey map that shows the steps a customer takes to accomplish a specific job, along with their emotional experience at each stage.

## Journey Map Components

For each step in the journey, you need to provide:
1. **Title**: A short name for the step (2-4 words)
2. **Description**: What the customer is trying to do at this stage
3. **Outcome**: What success looks like for this step
4. **Timeline Day**: Cumulative days from the start (e.g., 0, 2, 5, 10, 30, 90)
5. **Negative Experience (1-5)**: Current pain level WITHOUT a solution (5 = most painful)
6. **Positive Experience (1-5)**: Potential satisfaction WITH a new solution (5 = most positive)
7. **Pain Point Note** (optional): A brief description of why this step is painful today

## Guidelines

- Create 5-8 meaningful steps that cover the full journey
- Steps should be sequential and build on each other
- Timeline should be realistic for the type of job
- Negative experience should be higher where pain is greatest
- Positive experience shows the opportunity for improvement
- Include at least 2-3 pain point notes for the most painful steps
- Focus on the CURRENT state pain, not the solution

## Response Format

Return a JSON object with this structure:
{
  "title": "Journey map title",
  "subtitle": "Brief description of the journey",
  "steps": [
    {
      "order": 1,
      "title": "Step Title",
      "description": "What the customer does",
      "outcome": "What success looks like",
      "timelineDay": 0,
      "negativeExperience": 3,
      "positiveExperience": 4,
      "painPointNote": "Why this is painful (optional)"
    }
  ]
}

Return ONLY the JSON object, no additional text.`;

    const userPrompt = `Create a customer journey map for the following Job to be Done:

**Customer:** ${job.customer}
**Progress they want:** ${job.progress}
**Circumstance:** ${job.circumstance}
**Job Type:** ${job.type} (${job.type === 'functional' ? 'getting something done' : job.type === 'social' ? 'how others perceive them' : 'how they want to feel'})

${ideaTitle ? `**Idea Title:** ${ideaTitle}` : ''}
${ideaDescription ? `**Idea Description:** ${ideaDescription}` : ''}

${visionContext ? `**Company Context:**\n${visionContext}` : ''}

Generate a journey map showing:
1. The steps this customer takes to accomplish this job today
2. The pain they experience at each step (without a solution)
3. The opportunity for improvement (with a new solution)
4. Realistic timelines for each step
5. Pain point annotations for the most frustrating steps

Return ONLY a valid JSON object with the journey map data.`;

    try {
      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new HttpsError("internal", "Unexpected response format");
      }

      // Parse the JSON from the response
      let journeyMap;
      try {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          journeyMap = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON object found in response");
        }
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError(
          "internal",
          "Failed to parse journey map data"
        );
      }

      if (!journeyMap.title || !journeyMap.steps || !Array.isArray(journeyMap.steps)) {
        throw new HttpsError("internal", "Invalid journey map format");
      }

      return {
        journeyMap,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error("Claude API error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to generate journey map: " + error.message
      );
    }
  }
);
