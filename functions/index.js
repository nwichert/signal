const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk").default;
const OpenAI = require("openai").default;

admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const openaiApiKey = defineSecret("OPENAI_API_KEY");

/**
 * Helper function to parse JSON from AI response, handling markdown code fences
 */
function parseJsonFromAiResponse(text) {
  // First, try to remove markdown code fences if present
  let cleanText = text;

  // Remove ```json or ``` at the start
  cleanText = cleanText.replace(/^```(?:json)?\s*\n?/i, '');
  // Remove ``` at the end
  cleanText = cleanText.replace(/\n?```\s*$/i, '');

  // Try to extract JSON object
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error("No JSON object found in response");
}

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

/**
 * Challenges vague or marketing-speak inputs for Customer Archetypes
 * Helps users refine their hypotheses to be more specific and testable
 */
exports.challengeArchetypeInput = onCall(
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

    const { input, inputType, archetypeContext } = request.data;

    if (!input || !input.trim()) {
      throw new HttpsError("invalid-argument", "Input text is required");
    }

    const validInputTypes = [
      "painPoint",
      "solution",
      "goal",
      "metric",
      "buyingCriteria",
      "objection",
      "general",
    ];

    if (inputType && !validInputTypes.includes(inputType)) {
      throw new HttpsError("invalid-argument", "Invalid input type");
    }

    const systemPrompt = `You are Steve Blank's critical thinking assistant, trained to challenge vague assumptions and marketing-speak in customer discovery.

## Your Role
Help product teams identify when their customer hypotheses are too vague, contain untested assumptions, or use marketing language instead of customer language.

## What You're Looking For

### Red Flags to Challenge:
1. **Vague quantifiers**: "many", "most", "some", "often", "significant"
2. **Marketing speak**: "innovative", "seamless", "best-in-class", "cutting-edge", "world-class"
3. **Assumed causation**: "which leads to", "results in", "because" without evidence
4. **Internal jargon**: Product names, feature names, company-specific terms
5. **Solution-first thinking**: Describing solutions rather than problems
6. **Composite personas**: Mixing multiple customer types into one
7. **Unobservable states**: "They feel frustrated" vs "They click away within 5 seconds"

### Good Patterns to Encourage:
1. **Specific numbers**: "3 out of 5 interviews mentioned..."
2. **Observable behaviors**: "They currently use spreadsheets to track..."
3. **Quoted customer language**: "One customer said, 'I hate when...'"
4. **Testable statements**: Can be proven true or false through interviews

## Response Format
Return a JSON object:
{
  "isValid": boolean,
  "concerns": ["Array of specific concerns if invalid"],
  "suggestions": ["Array of specific improvements"],
  "improvedVersion": "A rewritten version that's more specific and testable (only if isValid is false)"
}

Be direct and specific in your feedback. Don't sugarcoat - product teams need honest challenge to build products customers actually want.`;

    let userPrompt = `Please review this ${inputType || "general"} input for a customer archetype:

"${input}"`;

    if (archetypeContext) {
      userPrompt += `

Context about this archetype:
- Name: ${archetypeContext.name || "Not specified"}
- Role: ${archetypeContext.stakeholderRole || "Not specified"}
- Job Title: ${archetypeContext.jobTitle || "Not specified"}
- Phase: ${archetypeContext.phase || "Not specified"}`;
    }

    userPrompt += `

Analyze this input for vague language, marketing speak, untested assumptions, or other issues that would make it hard to validate through customer interviews.

Return ONLY a valid JSON object with your analysis.`;

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

      let analysis;
      try {
        analysis = parseJsonFromAiResponse(content.text);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError("internal", "Failed to parse analysis");
      }

      return {
        analysis,
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
        "Failed to analyze input: " + error.message
      );
    }
  }
);

/**
 * Identifies assumptions in an archetype that need validation
 */
exports.identifyArchetypeAssumptions = onCall(
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

    const { archetype } = request.data;

    if (!archetype) {
      throw new HttpsError("invalid-argument", "Archetype data is required");
    }

    const systemPrompt = `You are an expert in Steve Blank's Customer Development methodology, specifically focused on identifying hidden assumptions that need validation through customer interviews.

## Your Role
Analyze a customer archetype profile and identify the riskiest assumptions - the beliefs about the customer that, if wrong, would invalidate the entire archetype or product strategy.

## Types of Assumptions to Identify

### 1. Problem Assumptions
- Does this problem actually exist?
- Is it painful enough to pay for a solution?
- Do customers recognize they have this problem?

### 2. Customer Assumptions
- Does this customer segment exist in meaningful numbers?
- Can we reach them?
- Do they have budget and authority to buy?

### 3. Solution Assumptions
- Would our solution actually solve the problem?
- Would they switch from their current solution?
- Is the value proposition compelling enough?

### 4. Business Model Assumptions
- Will they pay the price we need?
- Through the channel we want to use?
- With acceptable acquisition cost?

## Risk Assessment
For each assumption, assess:
- **Impact** (1-5): How much would being wrong about this hurt the business?
- **Uncertainty** (1-5): How confident are we this is actually true?
- **Risk Score**: Impact × Uncertainty (higher = validate first)

## Response Format
Return a JSON object:
{
  "assumptions": [
    {
      "category": "problem|customer|solution|business_model",
      "assumption": "The specific assumption stated clearly",
      "whyItMatters": "What happens if this is wrong",
      "currentEvidence": "What evidence supports this (if any)",
      "impact": 1-5,
      "uncertainty": 1-5,
      "riskScore": 1-25,
      "validationApproach": "How to test this assumption"
    }
  ],
  "topRisks": ["Top 3 assumptions to validate first, by risk score"],
  "overallReadiness": "not_ready|needs_work|almost_ready|ready_for_interviews"
}`;

    // Build archetype context
    let archetypeContext = `
Customer Archetype: ${archetype.name || "Unnamed"}
Stakeholder Role: ${archetype.stakeholderRole || "Not specified"}
Job Title: ${archetype.jobTitle || "Not specified"}
Phase: ${archetype.phase || "Not specified"}

Background: ${archetype.background || "Not provided"}
Daily Reality: ${archetype.dailyReality || "Not provided"}
Problem Statement: ${archetype.problemStatement || "Not provided"}
`;

    if (archetype.specificPainPoints && archetype.specificPainPoints.length > 0) {
      archetypeContext += "\nSpecific Pain Points:\n";
      archetype.specificPainPoints.forEach((p, i) => {
        archetypeContext += `${i + 1}. ${p.content} (${p.status})\n`;
      });
    }

    if (archetype.currentSolutions && archetype.currentSolutions.length > 0) {
      archetypeContext += "\nCurrent Solutions/Workarounds:\n";
      archetype.currentSolutions.forEach((s, i) => {
        archetypeContext += `${i + 1}. ${s.content} (${s.status})\n`;
      });
    }

    if (archetype.primaryGoals && archetype.primaryGoals.length > 0) {
      archetypeContext += "\nPrimary Goals:\n";
      archetype.primaryGoals.forEach((g, i) => {
        archetypeContext += `${i + 1}. ${g.content} (${g.status})\n`;
      });
    }

    if (archetype.buyingCriteria && archetype.buyingCriteria.length > 0) {
      archetypeContext += "\nBuying Criteria:\n";
      archetype.buyingCriteria.forEach((c, i) => {
        archetypeContext += `${i + 1}. ${c.content} (${c.status})\n`;
      });
    }

    const userPrompt = `Analyze this customer archetype and identify the key assumptions that need validation:

${archetypeContext}

Identify 5-10 key assumptions, prioritize by risk, and assess overall readiness for customer interviews.

Return ONLY a valid JSON object with your analysis.`;

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

      let analysis;
      try {
        analysis = parseJsonFromAiResponse(content.text);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError("internal", "Failed to parse assumptions analysis");
      }

      return {
        analysis,
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
        "Failed to identify assumptions: " + error.message
      );
    }
  }
);

/**
 * Generates interview questions based on archetype hypotheses
 */
exports.generateInterviewQuestions = onCall(
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

    const { archetype, focusAreas } = request.data;

    if (!archetype) {
      throw new HttpsError("invalid-argument", "Archetype data is required");
    }

    const systemPrompt = `You are an expert customer interviewer trained in Steve Blank's Customer Development and Jobs to be Done methodologies. Your job is to generate interview questions that will validate or invalidate hypotheses about a customer archetype.

## Interview Question Principles

### The Mom Test (Rob Fitzpatrick)
- Ask about their life, not your idea
- Ask about specifics in the past, not generics or opinions about the future
- Talk less, listen more

### Good Questions:
- "Tell me about the last time you..."
- "Walk me through how you currently..."
- "What happened after that?"
- "Why was that important?"
- "What did you try before that?"
- "How much time/money does that cost you?"

### Bad Questions (Avoid):
- "Would you use a product that..."
- "Do you think X is a problem?"
- "How much would you pay for..."
- "Would you buy this?"

## Question Categories

1. **Problem Discovery**: Understand if the problem exists and how painful it is
2. **Current Solutions**: Learn what they do today and why
3. **Decision Process**: Understand how they buy and who's involved
4. **Value Assessment**: Learn what matters most to them
5. **Past Behavior**: Specific stories that reveal true priorities

## Response Format
Return a JSON object:
{
  "questions": [
    {
      "category": "problem_discovery|current_solutions|decision_process|value_assessment|past_behavior",
      "question": "The interview question",
      "purpose": "What this question helps validate",
      "followUps": ["2-3 follow-up questions to go deeper"],
      "redFlags": ["Answers that would invalidate your hypothesis"],
      "greenFlags": ["Answers that would validate your hypothesis"],
      "relatedHypothesis": "Which hypothesis this tests (if applicable)"
    }
  ],
  "interviewFlow": {
    "opening": "How to start the interview",
    "warmUp": ["1-2 warm-up questions"],
    "core": ["Ordered list of the most important questions to ask"],
    "closing": "How to end and ask for referrals"
  },
  "tips": ["3-5 tips for conducting this specific interview"]
}`;

    // Build archetype context
    let archetypeContext = `
Customer Archetype: ${archetype.name || "Unnamed"}
Stakeholder Role: ${archetype.stakeholderRole || "Not specified"}
Job Title: ${archetype.jobTitle || "Not specified"}

Background: ${archetype.background || "Not provided"}
Daily Reality: ${archetype.dailyReality || "Not provided"}
Problem Statement: ${archetype.problemStatement || "Not provided"}
`;

    if (archetype.specificPainPoints && archetype.specificPainPoints.length > 0) {
      archetypeContext += "\nHypothesized Pain Points to Validate:\n";
      archetype.specificPainPoints.forEach((p, i) => {
        archetypeContext += `${i + 1}. ${p.content} (Status: ${p.status})\n`;
      });
    }

    if (archetype.currentSolutions && archetype.currentSolutions.length > 0) {
      archetypeContext += "\nHypothesized Current Solutions:\n";
      archetype.currentSolutions.forEach((s, i) => {
        archetypeContext += `${i + 1}. ${s.content} (Status: ${s.status})\n`;
      });
    }

    if (archetype.primaryGoals && archetype.primaryGoals.length > 0) {
      archetypeContext += "\nHypothesized Goals:\n";
      archetype.primaryGoals.forEach((g, i) => {
        archetypeContext += `${i + 1}. ${g.content} (Status: ${g.status})\n`;
      });
    }

    if (archetype.buyingCriteria && archetype.buyingCriteria.length > 0) {
      archetypeContext += "\nHypothesized Buying Criteria:\n";
      archetype.buyingCriteria.forEach((c, i) => {
        archetypeContext += `${i + 1}. ${c.content} (Status: ${c.status})\n`;
      });
    }

    let userPrompt = `Generate customer interview questions for this archetype:

${archetypeContext}`;

    if (focusAreas && focusAreas.length > 0) {
      userPrompt += `\n\nFocus especially on validating these areas: ${focusAreas.join(", ")}`;
    }

    userPrompt += `

Generate 8-12 interview questions following The Mom Test principles. Include a suggested interview flow and tips.

Return ONLY a valid JSON object with your questions.`;

    try {
      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
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

      let result;
      try {
        result = parseJsonFromAiResponse(content.text);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError("internal", "Failed to parse interview questions");
      }

      return {
        result,
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
        "Failed to generate interview questions: " + error.message
      );
    }
  }
);

/**
 * Synthesizes interview notes to extract patterns and update hypothesis validation status
 */
exports.synthesizeInterviews = onCall(
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

    const { archetype, interviewNotes } = request.data;

    if (!archetype) {
      throw new HttpsError("invalid-argument", "Archetype data is required");
    }

    if (!interviewNotes || interviewNotes.length === 0) {
      throw new HttpsError("invalid-argument", "Interview notes are required");
    }

    const systemPrompt = `You are an expert at synthesizing customer interview data using Steve Blank's Customer Development methodology. Your job is to analyze interview notes and identify patterns that validate or invalidate hypotheses about a customer archetype.

## Your Role
- Extract key patterns across multiple interviews
- Identify which hypotheses are validated, partially validated, or invalidated
- Surface contradictions between what customers say vs. do
- Recommend which hypotheses need more validation
- Suggest new hypotheses based on interview insights

## Analysis Framework

### Pattern Detection
- Look for themes mentioned by 3+ customers
- Note specific language/phrases customers use
- Identify emotional triggers and pain intensity
- Compare stated vs. revealed preferences

### Validation Rules
- **Validated**: 4+ customers confirm with specific examples/stories
- **Partially Validated**: 2-3 customers confirm, or confirmed with caveats
- **Needs More Data**: <2 customers asked, or conflicting signals
- **Invalidated**: Multiple customers contradict, or no evidence after 5+ interviews

### Contradiction Detection
- What customers say they want vs. what they actually do
- Stated priorities vs. where they spend time/money
- "I would definitely use that" vs. actual past behavior

## Response Format
Return a JSON object:
{
  "summary": {
    "totalInterviews": number,
    "keyInsight": "The most important thing learned",
    "confidenceLevel": "low|medium|high",
    "recommendedNextSteps": ["What to do next"]
  },
  "patterns": [
    {
      "pattern": "Description of the pattern",
      "evidence": ["Specific quotes or examples from interviews"],
      "frequency": "X out of Y interviews",
      "significance": "high|medium|low"
    }
  ],
  "hypothesisUpdates": [
    {
      "hypothesis": "The original hypothesis",
      "category": "painPoint|solution|goal|metric|buyingCriteria|objection",
      "previousStatus": "hypothesis|partially_validated|validated|invalidated",
      "newStatus": "hypothesis|partially_validated|validated|invalidated",
      "evidence": "Why the status should change",
      "confidence": "low|medium|high"
    }
  ],
  "contradictions": [
    {
      "stated": "What customers say",
      "revealed": "What their behavior shows",
      "implication": "What this means for the product"
    }
  ],
  "newHypotheses": [
    {
      "hypothesis": "A new hypothesis based on interview data",
      "category": "painPoint|solution|goal|metric|buyingCriteria|objection",
      "source": "Where this came from in the interviews"
    }
  ],
  "quotableInsights": ["Direct quotes that capture key insights"]
}`;

    // Build archetype context
    let archetypeContext = `
Customer Archetype: ${archetype.name || "Unnamed"}
Stakeholder Role: ${archetype.stakeholderRole || "Not specified"}
Job Title: ${archetype.jobTitle || "Not specified"}

Current Hypotheses:
`;

    if (archetype.specificPainPoints && archetype.specificPainPoints.length > 0) {
      archetypeContext += "\nPain Points:\n";
      archetype.specificPainPoints.forEach((p, i) => {
        archetypeContext += `${i + 1}. ${p.content} (${p.status})\n`;
      });
    }

    if (archetype.currentSolutions && archetype.currentSolutions.length > 0) {
      archetypeContext += "\nCurrent Solutions:\n";
      archetype.currentSolutions.forEach((s, i) => {
        archetypeContext += `${i + 1}. ${s.content} (${s.status})\n`;
      });
    }

    if (archetype.primaryGoals && archetype.primaryGoals.length > 0) {
      archetypeContext += "\nGoals:\n";
      archetype.primaryGoals.forEach((g, i) => {
        archetypeContext += `${i + 1}. ${g.content} (${g.status})\n`;
      });
    }

    if (archetype.buyingCriteria && archetype.buyingCriteria.length > 0) {
      archetypeContext += "\nBuying Criteria:\n";
      archetype.buyingCriteria.forEach((c, i) => {
        archetypeContext += `${i + 1}. ${c.content} (${c.status})\n`;
      });
    }

    // Format interview notes
    let notesContext = "\n\nInterview Notes:\n";
    interviewNotes.forEach((note, i) => {
      notesContext += `\n--- Interview ${i + 1} ---\n`;
      if (note.interviewee) notesContext += `Interviewee: ${note.interviewee}\n`;
      if (note.date) notesContext += `Date: ${note.date}\n`;
      notesContext += `Notes:\n${note.content}\n`;
      if (note.keyInsights && note.keyInsights.length > 0) {
        notesContext += `Key Insights: ${note.keyInsights.join(", ")}\n`;
      }
    });

    const userPrompt = `Synthesize these customer interview notes to validate/invalidate hypotheses:

${archetypeContext}
${notesContext}

Analyze patterns across all interviews, identify which hypotheses should be updated, flag any contradictions, and suggest new hypotheses.

Return ONLY a valid JSON object with your synthesis.`;

    try {
      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
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

      let synthesis;
      try {
        synthesis = parseJsonFromAiResponse(content.text);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError("internal", "Failed to parse interview synthesis");
      }

      return {
        synthesis,
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
        "Failed to synthesize interviews: " + error.message
      );
    }
  }
);

/**
 * Analyzes an interview transcript against the archetype's interview questions
 * and extracts structured insights to update the archetype
 */
exports.analyzeTranscript = onCall(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 180,
    memory: "1GiB",
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

    const { transcript, archetype, interviewee, role } = request.data;

    if (!transcript || !transcript.trim()) {
      throw new HttpsError("invalid-argument", "Transcript is required");
    }

    if (!archetype) {
      throw new HttpsError("invalid-argument", "Archetype data is required");
    }

    const systemPrompt = `You are an expert customer researcher trained in Steve Blank's Customer Development methodology. Your job is to analyze an interview transcript and extract insights that validate, invalidate, or add to the customer archetype hypotheses.

## Your Role
Analyze the interview transcript thoroughly and:
1. Match responses to the prepared interview questions
2. Identify which hypotheses are validated, partially validated, or invalidated
3. Extract key insights and direct quotes
4. Identify surprises or contradictions
5. Suggest new hypotheses based on unexpected findings
6. Propose updates to the archetype profile

## Analysis Framework

### For Each Interview Question:
- Did they answer it directly or indirectly?
- What did their answer reveal?
- Any follow-up information that emerged?

### Hypothesis Validation:
- **Validated**: Clear evidence supporting the hypothesis with specific examples
- **Partially Validated**: Some evidence, but with caveats or variations
- **Invalidated**: Evidence contradicting the hypothesis
- **Needs More Data**: Not enough information from this interview

### Watch For:
- Specific numbers, frequencies, timeframes mentioned
- Emotional language indicating pain intensity
- Stories about past behavior (most reliable)
- Workarounds they've built (shows pain is real)
- Money/time they've spent on the problem
- Contradictions between what they say vs. do

## Response Format
Return a JSON object:
{
  "interviewSummary": {
    "keyTakeaway": "The single most important insight",
    "interviewQuality": "high|medium|low",
    "customerFit": "strong_match|partial_match|poor_match|not_target",
    "recommendFollowUp": boolean,
    "followUpTopics": ["Topics to explore in future interviews"]
  },
  "questionResponses": [
    {
      "questionId": "ID of the interview question if provided",
      "question": "The question asked",
      "wasAnswered": boolean,
      "response": "Summary of their response",
      "directQuote": "Most relevant direct quote if available",
      "insight": "What this reveals"
    }
  ],
  "hypothesisValidations": [
    {
      "hypothesisId": "ID if provided",
      "hypothesisContent": "The hypothesis being tested",
      "category": "specificPainPoints|currentSolutions|primaryGoals|successMetrics|buyingCriteria|objections",
      "previousStatus": "hypothesis|partially_validated|validated|invalidated",
      "newStatus": "hypothesis|partially_validated|validated|invalidated",
      "evidence": "What in the transcript supports this status",
      "confidence": "high|medium|low",
      "directQuote": "Supporting quote if available"
    }
  ],
  "extractedInsights": {
    "keyInsights": ["Major insights from this interview"],
    "surprises": ["Unexpected findings"],
    "contradictions": ["Things that contradict our assumptions"],
    "quotableLines": ["Direct quotes worth saving"]
  },
  "suggestedProfileUpdates": {
    "dailyReality": "Suggested update based on interview (or null)",
    "problemStatement": "Refined problem statement (or null)",
    "background": "Additional context learned (or null)"
  },
  "newHypotheses": [
    {
      "content": "A new hypothesis based on this interview",
      "category": "specificPainPoints|currentSolutions|primaryGoals|successMetrics|buyingCriteria|objections",
      "source": "What in the interview led to this hypothesis"
    }
  ],
  "actionItems": ["Recommended next steps based on this interview"]
}`;

    // Build context about the archetype
    let archetypeContext = `
## Customer Archetype Being Validated
Name: ${archetype.name || "Unnamed"}
Stakeholder Role: ${archetype.stakeholderRole || "Not specified"}
Job Title: ${archetype.jobTitle || "Not specified"}

Background: ${archetype.background || "Not provided"}
Daily Reality: ${archetype.dailyReality || "Not provided"}
Problem Statement: ${archetype.problemStatement || "Not provided"}
`;

    // Add current hypotheses
    if (archetype.specificPainPoints && archetype.specificPainPoints.length > 0) {
      archetypeContext += "\n### Pain Point Hypotheses:\n";
      archetype.specificPainPoints.forEach((p, i) => {
        archetypeContext += `- [ID: ${p.id}] ${p.content} (Status: ${p.status})\n`;
      });
    }

    if (archetype.currentSolutions && archetype.currentSolutions.length > 0) {
      archetypeContext += "\n### Current Solutions Hypotheses:\n";
      archetype.currentSolutions.forEach((s, i) => {
        archetypeContext += `- [ID: ${s.id}] ${s.content} (Status: ${s.status})\n`;
      });
    }

    if (archetype.primaryGoals && archetype.primaryGoals.length > 0) {
      archetypeContext += "\n### Goal Hypotheses:\n";
      archetype.primaryGoals.forEach((g, i) => {
        archetypeContext += `- [ID: ${g.id}] ${g.content} (Status: ${g.status})\n`;
      });
    }

    if (archetype.successMetrics && archetype.successMetrics.length > 0) {
      archetypeContext += "\n### Success Metric Hypotheses:\n";
      archetype.successMetrics.forEach((m, i) => {
        archetypeContext += `- [ID: ${m.id}] ${m.content} (Status: ${m.status})\n`;
      });
    }

    if (archetype.buyingCriteria && archetype.buyingCriteria.length > 0) {
      archetypeContext += "\n### Buying Criteria Hypotheses:\n";
      archetype.buyingCriteria.forEach((c, i) => {
        archetypeContext += `- [ID: ${c.id}] ${c.content} (Status: ${c.status})\n`;
      });
    }

    if (archetype.objections && archetype.objections.length > 0) {
      archetypeContext += "\n### Objection Hypotheses:\n";
      archetype.objections.forEach((o, i) => {
        archetypeContext += `- [ID: ${o.id}] ${o.content} (Status: ${o.status})\n`;
      });
    }

    // Add interview questions
    if (archetype.interviewQuestions && archetype.interviewQuestions.length > 0) {
      archetypeContext += "\n### Interview Questions We Wanted to Ask:\n";
      archetype.interviewQuestions.forEach((q, i) => {
        archetypeContext += `${i + 1}. [ID: ${q.id}] ${q.question}\n   Purpose: ${q.purpose}\n`;
      });
    }

    let userPrompt = `Analyze this interview transcript for the customer archetype described below.

${archetypeContext}

## Interview Details
Interviewee: ${interviewee || "Not specified"}
Role: ${role || "Not specified"}

## Transcript
---
${transcript}
---

Analyze this transcript thoroughly. Match responses to our interview questions, validate/invalidate hypotheses with evidence, extract key insights and quotes, and suggest any updates to the archetype profile.

Return ONLY a valid JSON object with your analysis.`;

    try {
      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
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

      let analysis;
      try {
        analysis = parseJsonFromAiResponse(content.text);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError("internal", "Failed to parse transcript analysis");
      }

      return {
        analysis,
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
        "Failed to analyze transcript: " + error.message
      );
    }
  }
);

/**
 * Transcribes audio using OpenAI Whisper API
 * Accepts base64-encoded audio data and returns transcribed text
 */
exports.transcribeAudio = onCall(
  {
    secrets: [openaiApiKey],
    timeoutSeconds: 300,
    memory: "1GiB",
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

    const { audioBase64, mimeType, fileName } = request.data;

    if (!audioBase64) {
      throw new HttpsError("invalid-argument", "Audio data is required");
    }

    // Validate mime type
    const supportedTypes = [
      "audio/webm",
      "audio/mp3",
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "audio/m4a",
      "audio/ogg",
    ];
    const actualMimeType = mimeType || "audio/webm";
    if (!supportedTypes.some((t) => actualMimeType.includes(t.split("/")[1]))) {
      throw new HttpsError(
        "invalid-argument",
        `Unsupported audio format: ${actualMimeType}. Supported: ${supportedTypes.join(", ")}`
      );
    }

    try {
      const openai = new OpenAI({
        apiKey: openaiApiKey.value(),
      });

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioBase64, "base64");

      // Determine file extension from mime type
      const extMap = {
        "audio/webm": "webm",
        "audio/mp3": "mp3",
        "audio/mpeg": "mp3",
        "audio/mp4": "mp4",
        "audio/wav": "wav",
        "audio/m4a": "m4a",
        "audio/ogg": "ogg",
      };
      const ext = extMap[actualMimeType] || "webm";
      const audioFileName = fileName || `recording.${ext}`;

      // Create a File-like object for the OpenAI API
      const file = new File([audioBuffer], audioFileName, {
        type: actualMimeType,
      });

      // Call Whisper API
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      });

      return {
        text: transcription.text,
        segments: transcription.segments || [],
        language: transcription.language,
        duration: transcription.duration,
      };
    } catch (error) {
      console.error("Whisper API error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to transcribe audio: " + error.message
      );
    }
  }
);

/**
 * Generates hypothesis suggestions from cross-feature data
 * Analyzes archetypes, ideas, journey maps, focus areas, and feedback
 * to suggest hypotheses for the Discovery Hub
 */
exports.generateHypothesisSuggestions = onCall(
  {
    secrets: [anthropicApiKey],
    timeoutSeconds: 180,  // Increased for web search
    memory: "1GiB",
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

    // Option to enable/disable web search (can be passed from frontend)
    const enableWebSearch = request.data?.enableWebSearch !== false;

    try {
      const db = admin.firestore();

      // Fetch all relevant data in parallel
      const [
        archetypesSnapshot,
        ideasSnapshot,
        journeyMapsSnapshot,
        focusAreasSnapshot,
        feedbackSnapshot,
        hypothesesSnapshot,
        visionDoc,
        knowledgeDocsSnapshot,
        strategicContextDoc,
      ] = await Promise.all([
        db.collection("customerArchetypes").where("status", "in", ["draft", "active"]).get(),
        db.collection("ideas").where("status", "in", ["new", "exploring"]).get(),
        db.collection("journeyMaps").get(),
        db.collection("focusAreas").where("status", "==", "active").get(),
        db.collection("feedback").orderBy("createdAt", "desc").limit(50).get(),
        db.collection("hypotheses").where("status", "==", "active").get(),
        db.collection("vision").doc("main").get(),
        // Fetch high-priority knowledge documents with summaries
        db.collection("documents")
          .where("documentType", "==", "knowledge")
          .where("priority", "in", [1, 2])
          .orderBy("priority")
          .limit(20)
          .get(),
        // Fetch strategic context
        db.collection("strategicContext").doc("main").get(),
      ]);

      // Build context for AI
      let contextParts = [];

      // Vision context
      if (visionDoc.exists) {
        const vision = visionDoc.data();
        if (vision.vision || vision.mission) {
          contextParts.push(`## Company Vision & Mission
Vision: ${vision.vision || "Not set"}
Mission: ${vision.mission || "Not set"}`);
        }
      }

      // Customer Archetypes with rich detail
      if (!archetypesSnapshot.empty) {
        const archetypes = archetypesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let archetypeContext = "## Customer Archetypes\n";
        archetypes.forEach(a => {
          archetypeContext += `\n### ${a.name} (${a.stakeholderRole || 'user'})\n`;
          archetypeContext += `Job Title: ${a.jobTitle || 'Not specified'}\n`;
          archetypeContext += `Problem: ${a.problemStatement || 'Not specified'}\n`;

          if (a.specificPainPoints && a.specificPainPoints.length > 0) {
            archetypeContext += `Pain Points:\n`;
            a.specificPainPoints.forEach(p => {
              archetypeContext += `  - ${p.content} [${p.status}]\n`;
            });
          }

          if (a.primaryGoals && a.primaryGoals.length > 0) {
            archetypeContext += `Goals:\n`;
            a.primaryGoals.forEach(g => {
              archetypeContext += `  - ${g.content} [${g.status}]\n`;
            });
          }

          if (a.buyingCriteria && a.buyingCriteria.length > 0) {
            archetypeContext += `Buying Criteria:\n`;
            a.buyingCriteria.forEach(c => {
              archetypeContext += `  - ${c.content} [${c.status}]\n`;
            });
          }
        });
        contextParts.push(archetypeContext);
      }

      // Ideas from Idea Hopper
      if (!ideasSnapshot.empty) {
        const ideas = ideasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let ideasContext = "## Ideas (Jobs to be Done)\n";
        ideas.forEach(idea => {
          ideasContext += `\n### ${idea.title} [${idea.status}]\n`;
          ideasContext += `Description: ${idea.description || 'Not specified'}\n`;
          if (idea.job) {
            ideasContext += `JTBD: When ${idea.job.customer || 'a customer'} wants to ${idea.job.progress || 'accomplish something'} in ${idea.job.circumstance || 'a situation'}\n`;
            ideasContext += `Job Type: ${idea.job.type || 'functional'}\n`;
          }
        });
        contextParts.push(ideasContext);
      }

      // Journey Maps with pain points
      if (!journeyMapsSnapshot.empty) {
        const journeyMaps = journeyMapsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let journeyContext = "## Journey Maps\n";
        journeyMaps.forEach(jm => {
          journeyContext += `\n### ${jm.title}\n`;
          if (jm.steps && jm.steps.length > 0) {
            const painfulSteps = jm.steps.filter(s => s.negativeExperience >= 4 || s.painPointNote);
            if (painfulSteps.length > 0) {
              journeyContext += `High-Pain Steps:\n`;
              painfulSteps.forEach(s => {
                journeyContext += `  - ${s.title}: ${s.painPointNote || s.description} (Pain: ${s.negativeExperience}/5)\n`;
              });
            }
          }
        });
        contextParts.push(journeyContext);
      }

      // Focus Areas
      if (!focusAreasSnapshot.empty) {
        const focusAreas = focusAreasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let focusContext = "## Active Focus Areas\n";
        focusAreas.forEach(fa => {
          focusContext += `\n### ${fa.title} [${fa.confidenceLevel} confidence]\n`;
          focusContext += `Problem: ${fa.problemStatement || 'Not specified'}\n`;
          if (fa.successCriteria && fa.successCriteria.length > 0) {
            focusContext += `Success Criteria: ${fa.successCriteria.join(', ')}\n`;
          }
        });
        contextParts.push(focusContext);
      }

      // Recent Feedback themes
      if (!feedbackSnapshot.empty) {
        const feedback = feedbackSnapshot.docs.map(doc => doc.data());
        const themes = [...new Set(feedback.map(f => f.theme).filter(Boolean))];
        if (themes.length > 0) {
          let feedbackContext = "## Recent Feedback Themes\n";
          feedbackContext += themes.slice(0, 10).join(', ');
          contextParts.push(feedbackContext);
        }
      }

      // Knowledge Documents (high priority with summaries)
      if (!knowledgeDocsSnapshot.empty) {
        const docs = knowledgeDocsSnapshot.docs.map(doc => doc.data());
        // Filter to docs that have summaries or descriptions
        const usefulDocs = docs.filter(d => d.summary || d.description);
        if (usefulDocs.length > 0) {
          let knowledgeContext = "## Knowledge Base (Key Documents)\n";
          usefulDocs.forEach(d => {
            const priorityLabel = d.priority === 1 ? 'HIGH' : 'MEDIUM';
            knowledgeContext += `\n### ${d.name} [${d.category}] (${priorityLabel} priority)\n`;
            if (d.summary) {
              knowledgeContext += `Summary: ${d.summary}\n`;
            } else if (d.description) {
              knowledgeContext += `Description: ${d.description}\n`;
            }
            if (d.tags && d.tags.length > 0) {
              knowledgeContext += `Tags: ${d.tags.join(', ')}\n`;
            }
          });
          contextParts.push(knowledgeContext);
        }
      }

      // Strategic Context (market dynamics, competitive landscape, etc.)
      if (strategicContextDoc.exists) {
        const ctx = strategicContextDoc.data();
        let strategicContext = "## Strategic Context\n";

        if (ctx.marketDynamics) {
          strategicContext += `\n### Market Dynamics\n${ctx.marketDynamics}\n`;
        }
        if (ctx.competitiveLandscape) {
          strategicContext += `\n### Competitive Landscape\n${ctx.competitiveLandscape}\n`;
        }
        if (ctx.customerPainEvolution) {
          strategicContext += `\n### Customer Pain Evolution\n${ctx.customerPainEvolution}\n`;
        }
        if (ctx.keyInsights) {
          strategicContext += `\n### Key Strategic Insights\n${ctx.keyInsights}\n`;
        }
        if (ctx.companyContext) {
          strategicContext += `\n### Company Context\n${ctx.companyContext}\n`;
        }

        // Only add if there's actual content
        if (strategicContext !== "## Strategic Context\n") {
          contextParts.push(strategicContext);
        }
      }

      // Existing hypotheses to avoid duplicates
      const existingHypotheses = hypothesesSnapshot.docs.map(doc => doc.data().belief);
      let existingContext = "";
      if (existingHypotheses.length > 0) {
        existingContext = `\n\n## Existing Hypotheses (DO NOT duplicate these)\n${existingHypotheses.slice(0, 20).map(h => `- ${h}`).join('\n')}`;
      }

      // Build full context
      const fullContext = contextParts.join('\n\n') + existingContext;

      // Prepare metadata for linking suggestions
      const archetypeIds = archetypesSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      const focusAreaIds = focusAreasSnapshot.docs.map(doc => ({ id: doc.id, title: doc.data().title }));

      const systemPrompt = `You are an expert product discovery strategist trained in the 3-Risk Framework (Desirable, Feasible, Viable).

## Your Role
Analyze cross-feature product data and generate hypothesis suggestions that the team should validate. These hypotheses help de-risk product decisions.

## Data Sources You Have Access To
- **Customer Archetypes**: Who the customers are, their pain points, goals, and buying criteria
- **Ideas (JTBD)**: Jobs to be done that customers want to accomplish
- **Journey Maps**: Step-by-step customer experiences with pain points
- **Focus Areas**: Current strategic priorities and problem statements
- **Feedback**: Themes from design partner conversations
- **Knowledge Base**: Key documents including research, strategy docs, and reference materials
- **Strategic Context**: Market dynamics, competitive landscape, and company context

## 3-Risk Framework
Each hypothesis should address one or more risks:
- **Desirable**: Do customers want this? Will they use it? Does it solve a real problem?
- **Feasible**: Can we build it? Do we have the technical capability? What's the complexity?
- **Viable**: Does it work for the business? Can we afford it? Will it generate value?

## Hypothesis Format
Each hypothesis should follow this structure:
- **Belief**: "We believe that [specific testable statement]..."
- **Test**: "We will test this by [concrete action]..."
- **Risk**: Which risk(s) this addresses (desirable, feasible, viable)

## Guidelines
1. Generate 3-6 high-value hypotheses based on the data provided
2. Prioritize hypotheses that:
   - Connect multiple data sources (e.g., archetype pain + knowledge doc insight + journey pain point)
   - Leverage insights from knowledge documents and strategic context
   - Address unvalidated assumptions
   - Have high impact if wrong
3. Each hypothesis should be:
   - Specific and testable (not vague)
   - Actionable (clear how to test)
   - Connected to real data from the context
4. Include rationale explaining WHY this hypothesis matters
5. Suggest which archetype and/or focus area to link to
6. When knowledge documents or strategic context inform a hypothesis, mention them in the source field

## Response Format
Return a JSON object:
{
  "suggestions": [
    {
      "belief": "We believe that...",
      "test": "We will test this by...",
      "risks": ["desirable", "feasible", "viable"],
      "rationale": "Why this matters and what data supports it",
      "source": "Brief description of which data led to this suggestion",
      "suggestedArchetypeId": "ID if applicable, null otherwise",
      "suggestedFocusAreaId": "ID if applicable, null otherwise",
      "priority": "high" | "medium" | "low",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "insights": ["Any meta-observations about gaps or patterns in the data"]
}`;

      const userPrompt = `Based on the following product data, generate hypothesis suggestions for Discovery Hub:

${fullContext}

## Available IDs for Linking
Archetypes: ${JSON.stringify(archetypeIds)}
Focus Areas: ${JSON.stringify(focusAreaIds)}

Generate 3-6 hypotheses that would help the team validate their assumptions. Focus on high-impact, testable beliefs.

Return ONLY valid JSON.`;

      const client = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      // Build search context from company data for web search queries
      let searchContext = "";
      if (visionDoc.exists) {
        const vision = visionDoc.data();
        if (vision.coreBusinessModel) {
          searchContext = vision.coreBusinessModel;
        }
      }

      // If web search is enabled and we have context, use agentic loop with web search
      let webSearchResults = "";
      if (enableWebSearch && searchContext) {
        try {
          // First, ask Claude to generate search queries based on the product context
          const searchQueryPrompt = `Based on this product context, generate 2-3 focused web search queries to find relevant market trends, competitor insights, or customer pain points that would help generate product hypotheses.

Product context: ${searchContext}

${contextParts.length > 0 ? `Key focus areas: ${focusAreasSnapshot.docs.slice(0, 3).map(d => d.data().title).join(", ")}` : ""}

Return ONLY a JSON array of search query strings, e.g.: ["query 1", "query 2"]`;

          const queryResponse = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 256,
            messages: [{ role: "user", content: searchQueryPrompt }],
          });

          let searchQueries = [];
          try {
            const queryText = queryResponse.content[0].type === "text" ? queryResponse.content[0].text : "";
            searchQueries = parseJsonFromAiResponse(queryText);
          } catch (e) {
            console.log("Could not parse search queries, skipping web search");
          }

          // Execute web searches using Claude's web search tool
          if (searchQueries.length > 0) {
            const searchMessages = [
              {
                role: "user",
                content: `Search the web for the following queries and summarize the key findings relevant to product strategy and customer needs. Focus on market trends, competitor offerings, and customer pain points.

Queries to search:
${searchQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

After searching, provide a brief summary of the most relevant findings.`,
              },
            ];

            // Agentic loop for web search
            let searchResponse = await client.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 2048,
              tools: [{ type: "web_search_20250305" }],
              messages: searchMessages,
            });

            // Process tool use in a loop
            while (searchResponse.stop_reason === "tool_use") {
              const toolUseBlocks = searchResponse.content.filter(
                (block) => block.type === "tool_use"
              );
              const toolResults = [];

              for (const toolUse of toolUseBlocks) {
                // Web search tool is handled automatically by the API
                // We just need to continue the conversation
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: "Search completed",
                });
              }

              searchMessages.push({ role: "assistant", content: searchResponse.content });
              searchMessages.push({ role: "user", content: toolResults });

              searchResponse = await client.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 2048,
                tools: [{ type: "web_search_20250305" }],
                messages: searchMessages,
              });
            }

            // Extract text from final response
            const searchTextBlocks = searchResponse.content.filter(
              (block) => block.type === "text"
            );
            if (searchTextBlocks.length > 0) {
              webSearchResults = searchTextBlocks.map((b) => b.text).join("\n");
            }
          }
        } catch (searchError) {
          console.log("Web search failed, continuing without:", searchError.message);
        }
      }

      // Add web search results to the prompt if available
      const enrichedUserPrompt = webSearchResults
        ? `${userPrompt}\n\n## Recent Web Research\nThe following insights were gathered from web searches about the market, competitors, and customer trends:\n\n${webSearchResults}`
        : userPrompt;

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: enrichedUserPrompt,
          },
        ],
        system: systemPrompt,
      });

      const content = message.content[0];
      if (content.type !== "text") {
        throw new HttpsError("internal", "Unexpected response format");
      }

      let result;
      try {
        result = parseJsonFromAiResponse(content.text);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content.text);
        throw new HttpsError("internal", "Failed to parse hypothesis suggestions");
      }

      return {
        suggestions: result.suggestions || [],
        insights: result.insights || [],
        webSearchUsed: !!webSearchResults,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      console.error("Hypothesis generation error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to generate hypothesis suggestions: " + error.message
      );
    }
  }
);

/**
 * Analyzes an interview transcript to detect journey maps
 * Returns structured journey map data if detected, or null if not
 */
exports.analyzeTranscriptForJourneyMap = onCall(
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

    const { transcript, availableIdeas } = request.data;

    if (!transcript) {
      throw new HttpsError("invalid-argument", "Transcript is required");
    }

    try {
      const anthropic = new Anthropic({
        apiKey: anthropicApiKey.value(),
      });

      // Format available ideas for context
      const ideasContext = availableIdeas && availableIdeas.length > 0
        ? `\n\nAvailable Ideas to associate with (choose the most relevant one):\n${availableIdeas.map(idea =>
            `- ID: "${idea.id}" | Title: "${idea.title}" | Job: When ${idea.job?.customer || 'a user'} wants to ${idea.job?.progress || idea.title}`
          ).join('\n')}`
        : '\n\nNo existing ideas available - suggest creating a new idea if a journey is detected.';

      const systemPrompt = `You are an expert product researcher analyzing interview transcripts for Signal, a B2B SaaS product management tool.

Your task is to analyze the transcript and determine if the interviewee described a customer journey - a series of steps they go through to accomplish a goal or solve a problem.

A journey map should have:
1. A clear goal or job-to-be-done the customer is trying to accomplish
2. Multiple distinct steps or phases they go through
3. Emotional experiences (frustrations, satisfactions) at different points
4. A timeline or sequence of events

Analyze the transcript carefully. If you detect a journey being described, extract it into a structured format.
${ideasContext}

IMPORTANT: Only return a journey map if there is CLEAR evidence of a multi-step process being described. Do not fabricate journeys from vague mentions.`;

      const userPrompt = `Analyze this interview transcript and determine if the interviewee described a customer journey:

<transcript>
${transcript}
</transcript>

If a journey is detected, respond with JSON in this exact format:
{
  "detected": true,
  "confidence": "high" | "medium" | "low",
  "journeyTitle": "Brief title for the journey",
  "journeySubtitle": "One sentence describing what this journey covers",
  "suggestedIdeaId": "ID of the most relevant existing idea, or null if none fit",
  "suggestedNewIdea": {
    "title": "Title if a new idea should be created",
    "description": "Description of the idea",
    "job": {
      "progress": "What the customer is trying to accomplish",
      "customer": "Who the customer is",
      "circumstance": "When/where they need this",
      "type": "functional" | "social" | "emotional"
    }
  } | null,
  "steps": [
    {
      "order": 1,
      "title": "Step title",
      "description": "What happens in this step",
      "outcome": "What the customer achieves or experiences",
      "timelineDay": 0,
      "negativeExperience": 1-5,
      "positiveExperience": 1-5,
      "painPointNote": "Optional note about frustrations"
    }
  ],
  "summary": "Brief explanation of why this journey was detected"
}

If NO journey is detected, respond with:
{
  "detected": false,
  "reason": "Brief explanation of why no journey was found"
}

Respond ONLY with valid JSON, no other text.`;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      const responseText = message.content[0].text;
      const result = parseJsonFromAiResponse(responseText);

      return result;
    } catch (error) {
      console.error("Journey map analysis error:", error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to analyze transcript: " + error.message
      );
    }
  }
);
