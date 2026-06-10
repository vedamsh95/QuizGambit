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
  CustomLLMParams,
  AdminGeneratorConfig,
  SolverResult,
  FactCheckResult,
} from './types';
import { buildSystemPrompt, buildGridSystemPrompt, buildCustomSystemPrompt } from './prompts/system';
import { casualExplorerInjection } from './prompts/personas/casual-explorer';
import { competitiveDuelistInjection } from './prompts/personas/competitive-duelist';
import { partyGroupInjection } from './prompts/personas/party-group';
import { speedRunnerInjection } from './prompts/personas/speed-runner';
import { deepLearnerInjection } from './prompts/personas/deep-learner';
import { validateQuestion, validateAnswersNotInQuestions } from './parser';
import { auditDiversity, formatAuditReport, suggestAssignments } from './auditor';

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
  max_tokens: 50000,
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
    // Standard path: persona injection
    const personaInjection = PERSONA_INJECTIONS[config.persona] || casualExplorerInjection;

    userMessage = `${personaInjection}

TOPIC: ${topic}
NUMBER OF QUESTIONS: ${config.questionCount}
GAME MODE: ${config.mode}

STRATEGY: Pick the absolute best Lens and Form for each question based on the topic. Do not just blindly rotate them. Choose the ones that naturally fit the trivia you want to share.

Output exactly one JSON object as instructed.
Remember: ${config.questionCount} questions, all lenses unique. Use all 10 forms at least once across the set, no consecutive form repeats. Backdoors are free choice.`;
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
  customParams?: CustomLLMParams,
): Promise<string> {
  const { provider, apiKey, model } = config;

  const params = { ...CALIBRATED_PARAMS, ...customParams };

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
        temperature: params.temperature,
        top_p: params.top_p,
        presence_penalty: params.presence_penalty,
        frequency_penalty: params.frequency_penalty,
        max_tokens: params.max_tokens,
        response_format: { type: "json_object" },
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
          temperature: params.temperature,
          topP: params.top_p,
          maxOutputTokens: params.max_tokens,
          responseMimeType: "application/json",
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

export function parseAndValidate(
  rawOutput: string,
  questionCount: number,
): ParsedGeneration {
  // Extract top-level JSON
  let parsed: any;
  try {
    let cleanOutput = rawOutput.trim();
    if (cleanOutput.startsWith('```json')) {
      cleanOutput = cleanOutput.replace(/^```json\s*/, '');
    } else if (cleanOutput.startsWith('```')) {
      cleanOutput = cleanOutput.replace(/^```\s*/, '');
    }
    if (cleanOutput.endsWith('```')) {
      cleanOutput = cleanOutput.replace(/\s*```$/, '');
    }
    parsed = JSON.parse(cleanOutput);
  } catch (err) {
    console.error('[Generator] Failed to parse top-level JSON:', err);
    parsed = { questions: [] };
  }

  const questions: QuizGambitQuestion[] = [];
  const analyses: QuestionAnalysis[] = [];

  if (Array.isArray(parsed.questions)) {
    for (const q of parsed.questions) {
      questions.push({
        lens: q.lens,
        form: q.form,
        tag: q.tag,
        question_text: q.question_text,
        answer_text: q.answer_text,
        options: q.options,
        backdoor_type: q.backdoor_type,
        backdoor_explanation: q.backdoor_explanation,
        points: q.points,
        difficulty_tier: q.difficulty_tier,
      });

      const p = q.planning || {};
      analyses.push({
        lens: p.lens || q.lens,
        form: p.form || q.form,
        backdoor_type: p.backdoor_type || q.backdoor_type,
        backdoor_logic: p.backdoor_logic || {},
        constraint_check: p.constraint_check || {},
        draft: q.question_text || '',
      });
    }
  }

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
- 🔴 CRITICAL: The answer_text must NEVER appear anywhere in the question_text!
  If the answer is "Nintendo", the word "Nintendo" is strictly banned from the question.
- Use the SAME lens (${instruction.previous_lens}) but choose a better form if needed

Output exactly one JSON object with a "questions" array containing ONLY this one regenerated question.
The JSON object MUST match the exact schema defined in the system prompt.`;
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
    // Check for answer-in-question violations from the JSON questions
    const answerViolations = validateAnswersNotInQuestions(parsed.questions);
    const failures = identifyFailures(parsed.analysis);

    // Merge answer violations into failures, creating RegenerationInstructions
    for (const idx of answerViolations) {
      const existing = failures.find(f => f.question_index === idx);
      if (existing) {
        existing.failures.push(
          `Answer text "${parsed.questions[idx].answer_text}" appears in the question text — this is strictly forbidden`,
        );
      } else if (idx < parsed.analysis.length) {
        failures.push({
          question_index: idx,
          failures: [
            `Answer text "${parsed.questions[idx].answer_text}" appears in the question text — this is strictly forbidden`,
          ],
          previous_lens: parsed.analysis[idx].lens,
          previous_form: parsed.analysis[idx].form,
        });
      }
    }

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
        const regenParsed = parseAndValidate(regenOutput, 1);

        if (regenParsed.analysis.length > 0) {
          parsed.analysis[failure.question_index] = regenParsed.analysis[0];
        }
        if (regenParsed.questions.length > 0) {
          parsed.questions[failure.question_index] = regenParsed.questions[0];
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

ALL 5 LENSES UNIQUE. ALL 5 FORMS USED (you choose which form→which question). EVERY QUESTION TAGGED.
Output exactly one JSON object as instructed.`;

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
    // Check for answer-in-question violations from the JSON questions
    const answerViolations = validateAnswersNotInQuestions(parsed.questions);
    const failures = identifyFailures(parsed.analysis);

    // Merge answer violations into failures
    for (const idx of answerViolations) {
      const existing = failures.find(f => f.question_index === idx);
      if (existing) {
        existing.failures.push(
          `Answer text "${parsed.questions[idx].answer_text}" appears in the question text — this is strictly forbidden`,
        );
      } else if (idx < parsed.analysis.length) {
        failures.push({
          question_index: idx,
          failures: [
            `Answer text "${parsed.questions[idx].answer_text}" appears in the question text — this is strictly forbidden`,
          ],
          previous_lens: parsed.analysis[idx].lens,
          previous_form: parsed.analysis[idx].form,
        });
      }
    }

    if (failures.length === 0 && parsed.questions.length === 5) {
      console.log('[Grid Generator] All questions passed validation!');
      break;
    }

    if (parsed.questions.length === 0) {
      console.log(`[Grid Generator] Catastrophic parse failure (0 questions). Retrying entire batch...`);
      const newOutput = await callLLM(config, systemPrompt, userMessage + "\n\nCRITICAL NOTE: Your previous response failed to output valid JSON. Please ensure you output EXACTLY a valid JSON array of objects in <JSON_OUTPUT>.");
      parsed = parseAndValidate(newOutput, 5);
      retryCount++;
      continue;
    }

    if (parsed.questions.length < 5) {
       for (let i = parsed.questions.length; i < 5; i++) {
         failures.push({
            question_index: i,
            failures: [`Question missing from output. Generate a new question.`],
            previous_lens: 'Origin Story',
            previous_form: 'Form 1 (Action-First)'
         });
       }
    }

    console.log(`[Grid Generator] ${failures.length} failed, regenerating...`);
    regenerations += failures.length;

    for (const failure of failures) {
      try {
        const regenPrompt = buildRegenerationPrompt(failure, gridConfig.topics[0] || '');
        const regenOutput = await callLLM(gridConfig, systemPrompt, regenPrompt);
        totalApiCalls++;

        const regenParsed = parseAndValidate(regenOutput, 1);

        if (regenParsed.analysis.length > 0) parsed.analysis[failure.question_index] = regenParsed.analysis[0];
        if (regenParsed.questions.length > 0) parsed.questions[failure.question_index] = regenParsed.questions[0];
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

// ─── Admin Custom Mode ──────────────────────────────────────────────

/**
 * Assemble context for admin-controlled generation using selected
 * lens/form/backdoor subsets and optional custom LLM parameters.
 */
export function assembleCustomContext(config: AdminGeneratorConfig): {
  systemPrompt: string;
  userMessage: string;
} {
  const topic = config.topics.join(', ');

  const systemPrompt = buildCustomSystemPrompt(
    config.persona,
    config.mode,
    topic,
    config.questionCount,
    config.selectedLenses,
    config.selectedForms,
    config.selectedBackdoors,
    config.customLLMParams,
  );

  let userMessage: string;

  if (config.customPrompt) {
    userMessage = config.customPrompt
      .replace(/{topic}/g, topic)
      .replace(/{questionCount}/g, String(config.questionCount));
  } else {
    const personaInjection = PERSONA_INJECTIONS[config.persona] || casualExplorerInjection;
    const dedupeInjection = config.existingAnswers && config.existingAnswers.length > 0
      ? `\n🔴 DEDUPLICATION (DO NOT USE THESE ANSWERS):\nPreviously used answers: ${config.existingAnswers.join(', ')}\nPreviously used lenses (try to avoid): ${config.existingLenses?.join(', ')}\n`
      : '';

    userMessage = `${personaInjection}${dedupeInjection}

TOPIC: ${topic}
NUMBER OF QUESTIONS: ${config.questionCount}
GAME MODE: ${config.mode}

🔴 ONLY use lenses from: ${config.selectedLenses.length > 0 ? config.selectedLenses.join(', ') : 'all available'}
🔴 ONLY use forms from: ${config.selectedForms.length > 0 ? config.selectedForms.join(', ') : 'all available'}
🔴 ONLY use backdoors from: ${config.selectedBackdoors.length > 0 ? config.selectedBackdoors.join(', ') : 'all available'}

STRATEGY: Pick the absolute best Lens and Form for each question based on the topic. Do not just blindly rotate them. Choose the ones that naturally fit the trivia you want to share.

Output exactly one JSON object as instructed.
Remember: ${config.questionCount} questions, all lenses unique. Use all 10 forms at least once across the set, no consecutive form repeats. Backdoors are free choice.`;
  }

  return { systemPrompt, userMessage };
}

/**
 * Generate questions using admin-controlled lens/form/backdoor subsets.
 * Optionally runs solver and fact-checker automatically after generation.
 * 
 * This is the most powerful generation function — admins pick exactly
 * which lenses, forms, and backdoors to use, and can override LLM params.
 */
export async function generateCustomQuestions(
  config: AdminGeneratorConfig,
  maxRetries: number = 2,
): Promise<GenerationResult> {
  let totalApiCalls = 0;
  let regenerations = 0;

  // Stage 0: Assemble context with custom lens/form/backdoor subsets
  // Pick a random persona from the multi-select array, or fall back to the singular persona
  const effectivePersona = config.personas?.length
    ? config.personas[Math.floor(Math.random() * config.personas.length)]
    : config.persona;
  const effectiveConfig = { ...config, persona: effectivePersona };

  const { systemPrompt, userMessage } = assembleCustomContext(effectiveConfig);

  // Stage 1: Initial LLM call with optional custom params
  const rawOutput = await callLLM(effectiveConfig, systemPrompt, userMessage, config.customLLMParams);
  totalApiCalls++;

  // Stage 2: Parse and validate
  let parsed = parseAndValidate(rawOutput, config.questionCount);

  console.log(`[Custom Generator] Initial: ${parsed.analysis.length} analyses, ${parsed.questions.length} questions`);
  console.log(formatAuditReport(parsed.diversity_audit));

  // Stage 3: Regenerate failures (up to maxRetries)
  let retryCount = 0;
  while (retryCount < maxRetries) {
    const answerViolations = validateAnswersNotInQuestions(parsed.questions);
    const failures = identifyFailures(parsed.analysis);

    for (const idx of answerViolations) {
      const existing = failures.find(f => f.question_index === idx);
      if (existing) {
        existing.failures.push(
          `Answer text "${parsed.questions[idx].answer_text}" appears in the question text — this is strictly forbidden`,
        );
      } else if (idx < parsed.analysis.length) {
        failures.push({
          question_index: idx,
          failures: [
            `Answer text "${parsed.questions[idx].answer_text}" appears in the question text — this is strictly forbidden`,
          ],
          previous_lens: parsed.analysis[idx].lens,
          previous_form: parsed.analysis[idx].form,
        });
      }
    }

    if (failures.length === 0 && parsed.questions.length === config.questionCount) {
      console.log('[Custom Generator] All questions passed validation!');
      break;
    }

    if (parsed.questions.length === 0) {
      console.log(`[Custom Generator] Catastrophic parse failure (0 questions). Retrying entire batch...`);
      const newOutput = await callLLM(effectiveConfig, systemPrompt, userMessage + "\n\nCRITICAL NOTE: Your previous response failed to output valid JSON. Please ensure you output EXACTLY a valid JSON array of objects in <JSON_OUTPUT>.", config.customLLMParams);
      parsed = parseAndValidate(newOutput, config.questionCount);
      retryCount++;
      continue;
    }

    if (parsed.questions.length < config.questionCount) {
       // Fill in the missing questions with synthetic failures so the single-question regenerator can handle them
       for (let i = parsed.questions.length; i < config.questionCount; i++) {
         failures.push({
            question_index: i,
            failures: [`Question missing from output. Generate a new question.`],
            previous_lens: 'Origin Story',
            previous_form: 'Form 1 (Action-First)'
         });
       }
    }

    console.log(`[Custom Generator] ${failures.length} failed, regenerating...`);
    regenerations += failures.length;

    for (const failure of failures) {
      try {
        const regenPrompt = buildRegenerationPrompt(failure, effectiveConfig.topics[0] || '');
        const regenOutput = await callLLM(effectiveConfig, systemPrompt, regenPrompt, config.customLLMParams);
        totalApiCalls++;

        const regenParsed = parseAndValidate(regenOutput, 1);

        if (regenParsed.analysis.length > 0) {
          parsed.analysis[failure.question_index] = regenParsed.analysis[0];
        }
        if (regenParsed.questions.length > 0) {
          parsed.questions[failure.question_index] = regenParsed.questions[0];
        }
      } catch (err) {
        console.warn(`[Custom Generator] Failed to regenerate Q${failure.question_index + 1}`, err);
      }
    }
    retryCount++;
  }

  const finalAudit = auditDiversity(
    parsed.analysis.slice(0, config.questionCount),
    config.questionCount,
  );

  const result: GenerationResult = {
    questions: parsed.questions.slice(0, config.questionCount),
    analysis: parsed.analysis.slice(0, config.questionCount),
    audit: finalAudit,
    regenerations,
    total_api_calls: totalApiCalls,
  };

  // Stage 4: Auto solver + fact-check (runQualityChecks checks flags internally)
  const qualityResult = await runQualityChecks(result, effectiveConfig);
  return qualityResult;
}

/**
 * Run solver and/or fact-checker on generated questions.
 * Returns a new GenerationResult with solver_results and/or fact_check populated.
 * 
 * This runs synchronously — the caller awaits the results. For non-blocking
 * use, call this function separately after generation.
 */
export async function runQualityChecks(
  result: GenerationResult,
  config: GenerationConfig | AdminGeneratorConfig,
): Promise<GenerationResult> {
  const updated = { ...result };
  const solverConfig = { provider: config.provider, apiKey: config.apiKey, model: config.model };

  const adminConfig = config as AdminGeneratorConfig;

  // Run solver if requested
  if (adminConfig.runSolver && result.questions.length > 0) {
    try {
      console.log(`[Quality] Running solver on ${result.questions.length} questions...`);
      // Dynamic import to avoid circular deps at module level
      const { solveQuestionBatch } = await import('./solver');
      updated.solver_results = await solveQuestionBatch(result.questions, solverConfig);
      const solved = updated.solver_results.filter(r => r.solved_correctly).length;
      console.log(`[Quality] Solver complete: ${solved}/${result.questions.length} solvable`);
    } catch (err) {
      console.warn('[Quality] Solver failed:', err);
    }
  }

  // Run fact-checker if requested
  if (adminConfig.runFactCheck && result.questions.length > 0) {
    try {
      console.log(`[Quality] Running fact-check on ${result.questions.length} questions...`);
      const { verifyQuestionBatch } = await import('./fact-checker');
      const factChecks = await verifyQuestionBatch(result.questions, solverConfig);
      const allPassed = factChecks.every(fc => fc.all_verified);
      const passedCount = factChecks.filter(fc => fc.all_verified).length;
      
      // Merge individual fact checks into a single FactCheckResult
      updated.fact_check = {
        all_verified: allPassed,
        claims: factChecks.flatMap(fc => fc.claims),
      };
      
      console.log(`[Quality] Fact-check complete: ${passedCount}/${result.questions.length} verified`);
    } catch (err) {
      console.warn('[Quality] Fact-check failed:', err);
    }
  }

  return updated;
}
