/**
 * QuizGambit Blind Solver Agent
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 9 (Stage 3: Review)
 * 
 * A separate LLM call that attempts to answer each question blindly.
 * This verifies solvability: a good question should be answerable through 
 * either knowledge or deduction. Supports OpenAI, Gemini, and Groq.
 */

import type { SolverResult, QuizGambitQuestion } from './types';

export interface SolverCallConfig {
  provider: string;  // 'openai' | 'gemini' | 'groq'
  apiKey: string;
  model: string;
}

/**
 * Call the LLM with provider-agnostic handling.
 */
async function callLLMForSolver(
  config: SolverCallConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const { provider, apiKey, model } = config;

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
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Solver API error ${response.status}: ${err}`);
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
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Solver Gemini API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error(`Unsupported solver provider: ${provider}`);
}

/**
 * Solve a single question blindly.
 * The solver sees only the question_text and options (not the answer).
 */
export async function solveQuestion(
  question: QuizGambitQuestion,
  config: SolverCallConfig,
): Promise<SolverResult> {
  const prompt = `You are a quiz solver. Your job is to answer this trivia question.

QUESTION:
${question.question_text}

OPTIONS:
${question.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}

Think step by step:
1. What clues are present in the question text?
2. Can the answer be deduced from contextual clues, synonyms, patterns, or logic?
3. What do you already know about this topic?
4. Based on your reasoning, which option is correct?

Output your answer in this exact format:
<answer>LETTER</answer>
<confidence>0.0 to 1.0</confidence>
<reasoning>Your step-by-step reasoning here</reasoning>`;

  try {
    const content = await callLLMForSolver(
      config,
      'You are a precise quiz solver. Answer concisely.',
      prompt,
    );

    // Parse the response
    const answerMatch = /<answer>([A-D])<\/answer>/i.exec(content);
    const confidenceMatch = /<confidence>([\d.]+)<\/confidence>/i.exec(content);
    const reasoningMatch = /<reasoning>([\s\S]*?)<\/reasoning>/i.exec(content);

    const selectedLetter = answerMatch ? answerMatch[1].toUpperCase() : undefined;
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';

    // Map letter to option text
    const optionIndex = selectedLetter ? selectedLetter.charCodeAt(0) - 65 : -1;
    const selectedOption = optionIndex >= 0 && optionIndex < question.options.length
      ? question.options[optionIndex]
      : undefined;

    // Check if correct
    const solvedCorrectly = selectedOption === question.answer_text;

    return {
      solved_correctly: solvedCorrectly,
      confidence,
      reasoning,
      selected_option: selectedOption,
    };
  } catch (err) {
    console.warn('[Solver] Failed to solve question:', err);
    return {
      solved_correctly: false,
      confidence: 0,
      reasoning: `Solver error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Solve a batch of questions in parallel and return aggregate results.
 */
export async function solveQuestionBatch(
  questions: QuizGambitQuestion[],
  config: SolverCallConfig,
): Promise<SolverResult[]> {
  return Promise.all(
    questions.map(question => solveQuestion(question, config)),
  );
}

/**
 * Summarize solver results for reporting.
 */
export function summarizeSolverResults(results: SolverResult[]): {
  accuracy: number;
  averageConfidence: number;
  solvableCount: number;
  totalCount: number;
} {
  const totalCount = results.length;
  const solvableCount = results.filter(r => r.solved_correctly).length;
  const accuracy = totalCount > 0 ? solvableCount / totalCount : 0;
  const averageConfidence = totalCount > 0
    ? results.reduce((sum, r) => sum + r.confidence, 0) / totalCount
    : 0;

  return { accuracy, averageConfidence, solvableCount, totalCount };
}
