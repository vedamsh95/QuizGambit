import { SYSTEM_PROMPT_STANDARD } from './prompts';
import { generateQuestions, generateGridQuestions, generateCustomQuestions, runQualityChecks } from './ai/generator';
import { formatAuditReport } from './ai/auditor';
import type { GenerationConfig, GenerationResult, QuizGambitQuestion, PlayerPersona, GameMode, AdminGeneratorConfig, CompactGeneratorConfig, LensType, FormType, BackdoorType } from './ai/types';

// Aggressive Client-Side JSON Repair
export function aggressiveJsonRepair(raw: string): any {
    // 1. Strip Markdown Wrappers
    let clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    // 2. Extract JSON Object (Find first '{' and last '}')
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.substring(firstBrace, lastBrace + 1);
    } else {
        throw new Error("No JSON object found in response");
    }

    try {
        // Attempt 1: Direct Parse
        return JSON.parse(clean);
    } catch (e) {
        // Attempt 2: Fix Common AI Errors
        console.warn("[JSON Repair] Direct parse failed, attempting repairs...");

        // A. Fix Trailing Commas
        clean = clean.replace(/,(\s*[}\]])/g, '$1');

        // B. Fix Unescaped Quotes (Basic heuristic: Quotes not preceded by \ or : and not followed by , or } or ] are likely internal)
        // This is risky but often works for simple text. 
        // Better strategy: Fix keys vs values.

        try {
            return JSON.parse(clean);
        } catch (e2) {
            // Attempt 3: "Newlines in strings" fix (AI sometimes breaks lines)
            clean = clean.replace(/\n/g, ' ');
            try {
                return JSON.parse(clean);
            } catch (e3) {
                throw new Error("Local repair failed: " + (e as Error).message);
            }
        }
    }
}

export async function generateQuizQuestions(topics: string | string[], config: AIConfig) {
    const topicList = Array.isArray(topics) ? topics : [topics];
    const isSingle = topicList.length === 1;

    // 1. Select Base Template
    let rawTemplate = config.customPrompt
        ? config.customPrompt
        : SYSTEM_PROMPT_STANDARD;

    // 2. Hydrate Variables
    const topicStr = topicList.map(t => `"${t}"`).join(', ');

    const prompt = rawTemplate
        .replace(/{topic}/g, topicStr)
        .replace(/{difficulty}/g, config.difficulty || "General")
        .replace(/{questionCount}/g, (config.questionCount || 5).toString())
        .replace(/{maxPoints}/g, ((config.questionCount || 5) * 100).toString());


    if (!config.apiKey) {
        console.warn(`No API Key found for ${config.provider}. Using mock data.`);
        return [] // mockData(topicList); // Mock data not implemented yet
    }

    try {
        let resultText = '';

        if (config.provider === 'openai' || config.provider === 'groq') {
            const endpoint = config.provider === 'openai'
                ? "https://api.openai.com/v1/chat/completions"
                : "https://api.groq.com/openai/v1/chat/completions";

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: "system", content: "You are a strict JSON-only quiz generator. Output valid JSON only." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`API Error ${response.status}: ${err}`);
            }

            const data = await response.json();
            resultText = data.choices[0].message.content;
        }
        else if (config.provider === 'gemini') {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        responseMimeType: "application/json",
                    },
                })
            });

            if (!response.ok) {
                const err = await response.text();
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    throw new Error(`API Auth Error (${response.status}): Check your API Key. The key might be invalid or expired. Details: ${err}`);
                }
                throw new Error(`API Error ${response.status}: ${err}`);
            }

            const data = await response.json();
            resultText = data.candidates[0].content.parts[0].text;
        }

        // --- COST SAVING LOGIC ---
        // We attempt to repair LOCALLY first. We only retry via API if local repair is impossible.
        try {
            const parsed = aggressiveJsonRepair(resultText);

            // Validate Structure
            let finalOutput: any[] = [];
            if (parsed.categories && Array.isArray(parsed.categories)) {
                finalOutput = parsed.categories;
            } else if (parsed.name && parsed.questions) {
                finalOutput = [parsed];
            } else {
                // If it's an array root
                if (Array.isArray(parsed)) finalOutput = parsed;
                else throw new Error("JSON is valid but structure is incorrect (missing categories)");
            }

            // --- USER SAFETY: Topic Validation ---
            // Ensure we only return what was asked for. AI sometimes hallucinates random topics.
            const requestedTopicsLower = topicList.map(t => t.toLowerCase().trim());

            const validatedOutput = finalOutput.filter(cat => {
                const catName = (cat.name || "").toLowerCase().trim();
                // We check if the category name contains the requested topic OR the requested topic contains the category name
                // This allows for "History" -> "World History" matches
                const matches = requestedTopicsLower.some(req => catName.includes(req) || req.includes(catName));

                if (!matches) {
                    console.warn(`[AI Safety] Filtered out hallucinated topic: "${cat.name}" (Requested: ${topicList.join(', ')})`);
                }
                return matches;
            });

            // --- RECOVERY STRATEGY: Count Match ---
            // If the AI generated exactly the right number of topics, but names didn't match perfectly,
            // we assume the AI just used slightly different names (e.g. "Space" vs "Astronomy") and ACCEPT it.
            // This prevents "0/3 generated" errors when the AI is actually working but being creative with titles.
            if (validatedOutput.length === 0 && finalOutput.length === topicList.length) {
                console.warn("[AI Safety] Strict name match failed, but count matches. Accepting all generated topics as valid.");
                return finalOutput;
            }

            if (validatedOutput.length === 0 && finalOutput.length > 0) {
                console.warn("[AI Safety] All generated topics were filtered out. Returning empty. Full AI Response for debugging:", JSON.stringify(finalOutput));
                return [];
            }

            return validatedOutput;

        } catch (repairError) {
            console.error(`[AI] Repair Failed:`, repairError);
            throw repairError;
        }

    } catch (err) {
        console.error(`AI Error (${config.provider}):`, err);
        throw err;
    }
}


export interface AIConfig {
    provider: string;
    apiKey: string;
    model: string;
    questionCount: number;
    mode?: 'STANDARD';
    difficulty?: string;
    customPrompt?: string; // Allow Admin to inject raw prompt
}

// ─── New Unified Architecture (V2) ──────────────────────────────────

/**
 * Generate quiz questions using the unified PICCO prompt architecture.
 * This uses the 10×5 lens/form matrix, backdoor engineering,
 * micro-pyramidal pacing, and the 4-stage pipeline with calibrated LLM params.
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md
 */
export async function generateQuizQuestionsV2(
    topics: string | string[],
    config: AIConfig,
    persona: PlayerPersona = 'Casual Explorer',
): Promise<GenerationResult> {
    const topicList = Array.isArray(topics) ? topics : [topics];

    const genConfig: GenerationConfig = {
        topics: topicList,
        questionCount: config.questionCount || 5,
        persona,
        mode: (config.mode || 'STANDARD') as GameMode,
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        difficulty: config.difficulty,
        customPrompt: config.customPrompt,
    };

    console.log(`[AI V2] Starting unified generation for ${topicList.length} topic(s)...`);
    console.log(`[AI V2] Persona: ${persona}, Mode: ${config.mode}, Count: ${config.questionCount}`);

    const result = await generateQuestions(genConfig);

    console.log(`[AI V2] Generation complete:`);
    console.log(`  Questions: ${result.questions.length}`);
    console.log(`  API Calls: ${result.total_api_calls}`);
    console.log(`  Regenerations: ${result.regenerations}`);
    console.log(formatAuditReport(result.audit));

    return result;
}

/**
 * Convert V2 GenerationResult to the legacy category format.
 * This enables gradual migration of existing code.
 */
export function v2ToLegacyFormat(
    result: GenerationResult,
    topicName: string,
): Array<{
    name: string;
    main_category: string;
    description: string;
    data: QuizGambitQuestion[];
    tags: string[];
}> {
    return [{
        name: topicName,
        main_category: topicName,
        description: `AI Generated: ${topicName}`,
        data: result.questions,
        tags: [topicName],
    }];
}

export type { GenerationResult, QuizGambitQuestion, PlayerPersona, GameMode };

// ─── 5×5 Grid Mode Generation (V2) ─────────────────────────────────

/**
 * Generate 5×5 grid questions for a single topic.
 * Produces exactly 5 questions at locked point tiers [100, 200, 300, 400, 500].
 * Each question includes a "tag" for betting/intuition grid mode.
 * 
 * Use once per category/topic column for the 5×5 grid game.
 */
export async function generateGridQuizQuestions(
    topic: string,
    config: AIConfig,
    persona: PlayerPersona = 'Casual Explorer',
): Promise<GenerationResult> {
    const genConfig: GenerationConfig = {
        topics: [topic],
        questionCount: 5,
        persona,
        mode: 'GRID' as GameMode,
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        difficulty: config.difficulty,
    };

    console.log(`[AI Grid] Generating 5×5 grid questions for: ${topic}`);
    console.log(`[AI Grid] Persona: ${persona}, Provider: ${config.provider}`);

    const result = await generateGridQuestions(genConfig);

    console.log(`[AI Grid] Complete: ${result.questions.length} questions generated`);
    console.log(`[AI Grid] API Calls: ${result.total_api_calls}, Regenerations: ${result.regenerations}`);
    console.log(formatAuditReport(result.audit));

    return result;
}

// ─── Compact Generator (User-Facing) ───────────────────────────────

/**
 * Compact generator — the user-facing "quick generate" entry point.
 * 
 * Generates questions for a 5×5 grid (one topic per category column)
 * or flexible mode. Personas are randomly assigned across topics for variety.
 * Optionally accepts lens/form/backdoor subsets for advanced users.
 */
export async function generateCompactQuizQuestions(
    config: CompactGeneratorConfig,
): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];

    console.log(`[Compact] Starting generation for ${config.topics.length} topic(s)`);
    console.log(`[Compact] Personas: ${config.personas.join(', ')}`);

    // Check if user provided lens/form/backdoor subsets via advanced options
    const hasCustomSubsets = config.selectedLenses?.length || config.selectedForms?.length || config.selectedBackdoors?.length;

    const targetQ = config.questionCount || 5;
    const BATCH_SIZE = 5;

    // Grid mode: one call per topic, generating up to targetQ questions
    for (let i = 0; i < config.topics.length; i++) {
        const topic = config.topics[i];
        const persona = config.personas[i % config.personas.length] || 'Casual Explorer';

        console.log(`[Compact] Topic ${i + 1}/${config.topics.length}: "${topic}" → persona: ${persona}`);

        const topicResults: GenerationResult = {
            questions: [],
            analysis: [],
            audit: {
                lenses_used: [], forms_used: [],
                all_lenses_unique: true, all_forms_represented: true,
                no_consecutive_form_repeats: true, no_duplicate_grammatical_patterns: true,
                difficulty_ramp_valid: true, issues: []
            },
            total_api_calls: 0,
            regenerations: 0
        };

        const batches = Math.ceil(targetQ / BATCH_SIZE);
        for (let b = 1; b <= batches; b++) {
            const needed = Math.min(BATCH_SIZE, targetQ - topicResults.questions.length);
            if (needed <= 0) break;

            if (config.onProgress) {
                config.onProgress(`Batch ${b}/${batches}: generating ${needed} questions...`);
            }

            // Deduplication tracking across batches
            const currentAnswers = topicResults.questions.map(q => q.answer_text).filter(Boolean);
            const currentLenses = topicResults.questions.map(q => q.lens).filter(Boolean);
            
            const existingAnswers = [...(config.existingAnswers || []), ...currentAnswers];
            const existingLenses = [...(config.existingLenses || []), ...currentLenses];

            let batchResult: GenerationResult;
            
            // If the lens mode is focused, we clear selectedLenses so the system targets standard fallback (or we can implement targeted lens logic here)
            // But if the user didn't select custom subsets, we just pass the default config
            const baseConfig = {
                topics: [topic],
                questionCount: needed,
                persona,
                personas: config.personas,
                mode: 'STANDARD' as GameMode, // Using STANDARD to support deduplication and variable sizes properly, or GRID if enforced
                provider: config.provider,
                apiKey: config.apiKey,
                model: config.model,
                existingAnswers,
                existingLenses,
            };

            if (hasCustomSubsets) {
                batchResult = await generateCustomQuestions({
                    ...baseConfig,
                    selectedLenses: config.selectedLenses || [],
                    selectedForms: config.selectedForms || [],
                    selectedBackdoors: config.selectedBackdoors || [],
                } as AdminGeneratorConfig);
            } else {
                // If diverse mode, pass empty selectedLenses, if focused use ALL_LENSES
                const activeLenses = config.lensMode === 'diverse' ? [] : ALL_LENSES as LensType[];
                
                batchResult = await generateCustomQuestions({
                    ...baseConfig,
                    selectedLenses: activeLenses,
                    selectedForms: ALL_FORMS,
                    selectedBackdoors: ALL_BACKDOORS,
                } as AdminGeneratorConfig);
            }

            topicResults.questions.push(...batchResult.questions);
            topicResults.analysis.push(...batchResult.analysis);
            topicResults.total_api_calls += batchResult.total_api_calls;
            topicResults.regenerations += batchResult.regenerations;
            
            // Merge audit issues
            topicResults.audit.issues.push(...batchResult.audit.issues);
        }

        results.push(topicResults);
        console.log(`[Compact] Finished topic ${i + 1}`);
    }

    console.log(`[Compact] Complete: ${results.length} topic(s) generated`);
    return results;
}

// ─── Admin Generator (Full Control) ─────────────────────────────────

/**
 * Admin generator — full surgical control over every generation parameter.
 * 
 * Accepts subsets of lenses, forms, backdoors, custom LLM params,
 * and optionally runs solver + fact-checker automatically.
 */
export async function generateAdminQuizQuestions(
    config: AdminGeneratorConfig,
): Promise<GenerationResult> {
    console.log(`[Admin] Starting custom generation for: ${config.topics.join(', ')}`);
    console.log(`[Admin] Lenses: ${config.selectedLenses.length}, Forms: ${config.selectedForms.length}, Backdoors: ${config.selectedBackdoors.length}`);

    if (config.runSolver) console.log('[Admin] Auto-solver enabled');
    if (config.runFactCheck) console.log('[Admin] Auto-fact-check enabled');
    if (config.customLLMParams) {
        console.log(`[Admin] Custom LLM params: T=${config.customLLMParams.temperature}, P=${config.customLLMParams.presence_penalty}, F=${config.customLLMParams.frequency_penalty}`);
    }

    const result = await generateCustomQuestions(config);

    console.log(`[Admin] Complete: ${result.questions.length} questions`);
    console.log(`[Admin] API Calls: ${result.total_api_calls}, Regenerations: ${result.regenerations}`);
    console.log(formatAuditReport(result.audit));

    if (result.solver_results) {
        const solved = result.solver_results.filter(r => r.solved_correctly).length;
        console.log(`[Admin] Solver: ${solved}/${result.solver_results.length} solvable`);
    }
    if (result.fact_check) {
        console.log(`[Admin] Fact-check: ${result.fact_check.all_verified ? 'All verified' : 'Issues found'}`);
    }

    return result;
}

/**
 * Re-verify a single question with solver + fact-checker.
 * Used by admin for manual curation — click "Re-Verify" on any question.
 */
export async function reverifyQuestion(
    question: QuizGambitQuestion,
    provider: string,
    apiKey: string,
    model: string,
): Promise<{ solver?: { solved_correctly: boolean; confidence: number }; factCheck?: { verified: boolean } }> {
    const solverConfig = { provider, apiKey, model };
    const { solveQuestion } = await import('./ai/solver');
    const { verifyQuestion } = await import('./ai/fact-checker');

    const [solverResult, factCheckResult] = await Promise.all([
        solveQuestion(question, solverConfig),
        verifyQuestion(question, solverConfig),
    ]);

    return {
        solver: { solved_correctly: solverResult.solved_correctly, confidence: solverResult.confidence },
        factCheck: { verified: factCheckResult.all_verified },
    };
}

export type { AdminGeneratorConfig, CompactGeneratorConfig };
