/**
 * QuizGambit Generation Orchestrator
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 9
 * 
 * The 4-stage pipeline:
 *   Stage 0: Context Assembly — select persona, build prompt, determine lens/form assignments
 *   Stage 1: LLM Generation — send unified SYSTEM prompt, receive <analysis> + <JSON_OUTPUT>
 *   Stage 2: Parse & Extract — parse XML, validate constraints, audit diversity
 *   Stage 3: Regenerate Failures — re-send failed questions back to LLM with fix instructions
 */

import type {
  GenerationConfig,
  GenerationResult,
  QuizGambitQuestion,
  QuestionAnalysis,
  ParsedGeneration,
  RegenerationInstruction,
  PlayerPersona,
} from './types';
import { buildSystemPrompt } from './prompts/system';
import { casualExplorerInjection } from './prompts/personas/casual-explorer';
import { competitiveDuelistInjection } from './prompts/personas/competitive-duelist';
import { partyGroupInjection } from './prompts/personas/party-group';
import { speedRunnerInjection } from './prompts/personas/speed-runner';
import { deepLearnerInjection } from './prompts/personas/deep-learner';
import { parseAnalysisBlocks, validateQuestion, parseJsonOutput } from './parser';
import { auditDiversity, formatAuditReport, suggestAssignments } from './auditor';
import { buildGridSystemPrompt } from './prompts/system';

// ─── Persona Injection Map ──────────────────────────────────────────

const PERSONA_INJECTIONS: Record<PlayerPersona, string> = {
  'Casual Explorer': casualExplorerInjection,
  'Competitive Duelist': competitiveDuelistInjection,
  'Party Group': partyGroupInjection,
  'Speed Runner': speedRunnerInjection,
  'Deep Learner': deepLearnerInjection,
};

// ─── LLM Parameter Calibration ──────────────────────────────────────

/**
 * LLM Parameter Calibration — Production-Optimized
 * 
 * Temperature: 0.72 — Natural creative flair. High enough to avoid robotic
 *   phrasing under constraint pressure, low enough that facts stay accurate.
 * 
 * Presence Penalty: 0.35 — Gently encourages thematic variety across questions
 *   without forcing bizarre synonym substitutions.
 * 
 * Frequency Penalty: 0.18 — Subtle discouragement of repetition. Prevents the
 *   topic word from dominating WITHOUT forcing "willow-wielding pastime" for "cricket."
 * 
 * Top-P: 0.90 — Phrasing diversity while maintaining coherence.
 */
export const CALIBRATED_PARAMS = {
  temperature: 0.72,
  presence_penalty: 0.35,
  frequency_penalty: 0.18,
  top_p: 0.90,
  max_tokens: 4096,
};

// ─── Stage 0: Context Assembly ──────────────────────────────────────

/**
 * Assemble the full prompt context for the LLM.
 * Includes: unified system prompt + persona injection + lens/form pre-assignments.
 */
export function assembleContext(config: GenerationConfig): {
  systemPrompt: string;
  userMessage: string;
} {
  const topic = config.topics.join(', ');

  // Build the unified system prompt
  const systemPrompt = buildSystemPrompt(
    config.persona,
    config.mode,
    topic,
    config.questionCount,
  );

  let userMessage: string;

  if (config.customPrompt) {
    // Admin-provided custom prompt replaces the user message
    userMessage = config.customPrompt
      .replace(/{topic}/g, topic)
      .replace(/{questionCount}/g, String(config.questionCount));
  } else {
    // Standard path: persona injection + lens/form pre-assignments
    const personaInjection = PERSONA_INJECTIONS[config.persona] || casualExplorerInjection;
    const assignments = suggestAssignments(config.questionCount);
    const assignmentGuide = assignments
      .map((a, i) => `Q${i + 1}: Lens=${a.lens}, Form=${a.form}`)
      .join('\n');

    userMessage = `${personaInjection}

TOPIC: ${topic}
NUMBER OF QUESTIONS: ${config.questionCount}
GAME MODE: ${config.mode}

SUGGESTED LENS/FORM ASSIGNMENTS (you may adjust for better creative fit):
${assignmentGuide}

Begin with the <analysis> block, then the <diversity_audit>, and finally the <JSON_OUTPUT>.
Remember: ${config.questionCount} questions, all 10 lenses unique, all 5 forms used.`;
  }

  return { systemPrompt, userMessage };
}

// ─── Stage 1: LLM Call ─────────────────────────────────────────────

/**
 * Send the prompt to the LLM and get raw response text.
 * Supports OpenAI, Gemini, and Groq providers.
 */
export async function callLLM(
  config: GenerationConfig,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const { provider, apiKey, model } = config;

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}`);
  }

  if (provider === 'openai' || provider === 'groq') {
    const endpoint = provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://api.groq.com/openai/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: CALIBRATED_PARAMS.temperature,
        top_p: CALIBRATED_PARAMS.top_p,
        presence_penalty: CALIBRATED_PARAMS.presence_penalty,
        frequency_penalty: CALIBRATED_PARAMS.frequency_penalty,
        max_tokens: CALIBRATED_PARAMS.max_tokens,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  if (provider === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
        }],
        generationConfig: {
          temperature: CALIBRATED_PARAMS.temperature,
          topP: CALIBRATED_PARAMS.top_p,
          maxOutputTokens: CALIBRATED_PARAMS.max_tokens,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new Error(`Gemini API Auth Error (${response.status}): Check your API Key. The key might be invalid or expired. Details: ${err}`);
      }
      throw new Error(`Gemini API Error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// ─── Stage 2: Parse & Extract ───────────────────────────────────────

/**
 * Parse the raw LLM output into structured data.
 * Extracts <analysis> blocks, validates constraints, and audits diversity.
 */
export function parseAndValidate(
  rawOutput: string,
  questionCount: number,
): ParsedGeneration {
  const analyses = parseAnalysisBlocks(rawOutput);
  const questions = parseJsonOutput(rawOutput) as QuizGambitQuestion[];

  // Build diversity audit from parsed analyses (programmatic, not from LLM self-report)
  const audit = auditDiversity(analyses, questionCount);

  return {
    analysis: analyses,
    diversity_audit: audit,
    questions,
    raw_output: rawOutput,
  };
}

// ─── Stage 3: Regenerate Failures ───────────────────────────────────

/**
 * Identify which questions failed validation and need regeneration.
 */
export function identifyFailures(
  analyses: QuestionAnalysis[],
): RegenerationInstruction[] {
  return analyses
    .map((analysis, index) => {
      const validation = validateQuestion(analysis);
      if (validation.valid) return null;
      return {
        question_index: index,
        failures: validation.failures,
        previous_lens: analysis.lens,
        previous_form: analysis.form,
      };
    })
    .filter(Boolean) as RegenerationInstruction[];
}

/**
 * Build a regeneration prompt for failed questions.
 */
export function buildRegenerationPrompt(
  instruction: RegenerationInstruction,
  topic: string,
): string {
  return `FIX THIS FAILED QUESTION:

Question #${instruction.question_index + 1}
Previous Lens: ${instruction.previous_lens}
Previous Form: ${instruction.previous_form}
Topic: ${topic}

The question FAILED because:
${instruction.failures.map(f => `  - ${f}`).join('\n')}

Please regenerate ONLY this one question. Follow all the hard constraints:
- One sentence, aim for ~25 words (hard max 30)
- No banned starters (Which, What, Who, Where, When, Name the)
- Micro-pyramidal flow: opening hook → bridge → giveaway near the end
- Include a backdoor secondary logical pathway
- Use the SAME lens (${instruction.previous_lens}) but choose a better form if needed

Output only the <q${instruction.question_index + 1}>...</q${instruction.question_index + 1}> block.
Include the complete <JSON_OUTPUT> entry for just this question.`;
}

// ─── Full Pipeline ──────────────────────────────────────────────────

/**
 * Run the complete 4-stage generation pipeline.
 * 
 * Returns a GenerationResult with all questions, analysis, and quality metrics.
 */
export async function generateQuestions(
  config: GenerationConfig,
  maxRetries: number = 2,
): Promise<GenerationResult> {
  let totalApiCalls = 0;
  let regenerations = 0;

  // Stage 0: Assemble context
  const { systemPrompt, userMessage } = assembleContext(config);

  // Stage 1: Initial LLM call
  const rawOutput = await callLLM(config, systemPrompt, userMessage);
  totalApiCalls++;

  // Stage 2: Parse and validate
  let parsed = parseAndValidate(rawOutput, config.questionCount);

  console.log(`[Generator] Initial generation: ${parsed.analysis.length} analyses, ${parsed.questions.length} questions`);
  console.log(formatAuditReport(parsed.diversity_audit));

  // Stage 3: Regenerate failures (up to maxRetries)
  let retryCount = 0;
  while (retryCount < maxRetries) {
    const failures = identifyFailures(parsed.analysis);

    if (failures.length === 0) {
      console.log('[Generator] All questions passed validation!');
      break;
    }

    console.log(`[Generator] ${failures.length} question(s) failed. Regenerating...`);
    regenerations += failures.length;

    for (const failure of failures) {
      try {
        const regenPrompt = buildRegenerationPrompt(failure, config.topics[0] || '');
        const regenOutput = await callLLM(config, systemPrompt, regenPrompt);
        totalApiCalls++;

        // Parse the regenerated question and replace the failed one
        const regenAnalyses = parseAnalysisBlocks(regenOutput);
        const regenQuestions = parseJsonOutput(regenOutput);

        if (regenAnalyses.length > 0) {
          parsed.analysis[failure.question_index] = regenAnalyses[0];
        }
        if (regenQuestions.length > 0) {
          parsed.questions[failure.question_index] = regenQuestions[0];
        }

        console.log(`[Generator] Regenerated Q${failure.question_index + 1}`);
      } catch (err) {
        console.warn(`[Generator] Failed to regenerate Q${failure.question_index + 1}:`, err);
      }
    }

    retryCount++;
  }

  // Final audit
  const finalAudit = auditDiversity(
    parsed.analysis.slice(0, config.questionCount),
    config.questionCount,
  );

  return {
    questions: parsed.questions.slice(0, config.questionCount),
    analysis: parsed.analysis.slice(0, config.questionCount),
    audit: finalAudit,
    regenerations,
    total_api_calls: totalApiCalls,
  };
}

// ─── 5×5 Grid Mode ─────────────────────────────────────────────────

/**
 * Assemble context for 5×5 grid mode generation.
 * Generates exactly 5 questions at locked [100,200,300,400,500] tiers for a single topic.
 */
export function assembleGridContext(config: GenerationConfig): {
  systemPrompt: string;
  userMessage: string;
} {
  const topic = config.topics[0] || 'General Knowledge';

  const systemPrompt = buildGridSystemPrompt(config.persona, topic);

  const personaInjection = PERSONA_INJECTIONS[config.persona] || casualExplorerInjection;

  const userMessage = `${personaInjection}

TOPIC: ${topic}
GRID MODE: 5×5 — Generate exactly 5 questions at fixed point tiers.

TIER LOCK (DO NOT CHANGE):
  Q1 = 100pts (easy, strong backdoor)
  Q2 = 200pts (easy, strong backdoor)
  Q3 = 300pts (medium, moderate backdoor)
  Q4 = 400pts (challenging, moderate backdoor)
  Q5 = 500pts (expert, subtle backdoor)

ALL 5 LENSES UNIQUE. ALL 5 FORMS USED. EVERY QUESTION TAGGED.
Begin with <analysis>, then <diversity_audit>, then <JSON_OUTPUT>.`;

  return { systemPrompt, userMessage };
}

/**
 * Generate 5×5 grid questions for a single topic.
 * Produces exactly 5 questions at [100, 200, 300, 400, 500] point tiers.
 * 
 * Use this when generating content for the 5×5 grid game mode —
 * one call per category/topic column.
 */
export async function generateGridQuestions(
  config: GenerationConfig,
  maxRetries: number = 2,
): Promise<GenerationResult> {
  // Override questionCount to 5 for grid mode
  const gridConfig: GenerationConfig = {
    ...config,
    questionCount: 5,
    mode: 'GRID',
  };

  let totalApiCalls = 0;
  let regenerations = 0;

  const { systemPrompt, userMessage } = assembleGridContext(gridConfig);

  const rawOutput = await callLLM(gridConfig, systemPrompt, userMessage);
  totalApiCalls++;

  let parsed = parseAndValidate(rawOutput, 5);

  console.log(`[Grid Generator] Initial: ${parsed.analysis.length} analyses, ${parsed.questions.length} questions`);
  console.log(formatAuditReport(parsed.diversity_audit));

  // Regenerate failures
  let retryCount = 0;
  while (retryCount < maxRetries) {
    const failures = identifyFailures(parsed.analysis);
    if (failures.length === 0) break;

    console.log(`[Grid Generator] ${failures.length} failed, regenerating...`);
    regenerations += failures.length;

    for (const failure of failures) {
      try {
        const regenPrompt = buildRegenerationPrompt(failure, gridConfig.topics[0] || '');
        const regenOutput = await callLLM(gridConfig, systemPrompt, regenPrompt);
        totalApiCalls++;

        const regenAnalyses = parseAnalysisBlocks(regenOutput);
        const regenQuestions = parseJsonOutput(regenOutput);

        if (regenAnalyses.length > 0) parsed.analysis[failure.question_index] = regenAnalyses[0];
        if (regenQuestions.length > 0) parsed.questions[failure.question_index] = regenQuestions[0];
      } catch (err) {
        console.warn(`[Grid Generator] Failed to regenerate Q${failure.question_index + 1}`, err);
      }
    }
    retryCount++;
  }

  const finalAudit = auditDiversity(parsed.analysis.slice(0, 5), 5);

  return {
    questions: parsed.questions.slice(0, 5),
    analysis: parsed.analysis.slice(0, 5),
    audit: finalAudit,
    regenerations,
    total_api_calls: totalApiCalls,
  };
}
