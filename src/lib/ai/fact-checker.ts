/**
 * QuizGambit Factual Guard
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 9 (Stage 3: Review)
 * 
 * Verifies factual claims in generated questions. Phase 1 uses LLM verification.
 * Phase 2 (future) will integrate web search API for external fact-checking.
 * Supports OpenAI, Gemini, and Groq providers.
 */

import type { FactCheckResult, QuizGambitQuestion } from './types';

export interface FactCheckerCallConfig {
  provider: string;  // 'openai' | 'gemini' | 'groq'
  apiKey: string;
  model: string;
}

/**
 * Call the LLM with provider-agnostic handling.
 */
async function callLLMForFactChecker(
  config: FactCheckerCallConfig,
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
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Fact checker API error ${response.status}: ${err}`);
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
          temperature: 0.1,
          maxOutputTokens: 800,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Fact checker Gemini API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error(`Unsupported fact checker provider: ${provider}`);
}

/**
 * Verify the factual accuracy of a single question using LLM verification.
 */
export async function verifyQuestion(
  question: QuizGambitQuestion,
  config: FactCheckerCallConfig,
): Promise<FactCheckResult> {
  const prompt = `You are a fact-checker. Verify the factual accuracy of this quiz question.

QUESTION TEXT:
"${question.question_text}"

CORRECT ANSWER (according to the generator):
${question.answer_text}

WRONG OPTIONS:
${question.options.filter(o => o !== question.answer_text).map(o => `- ${o}`).join('\n')}

For each factual claim, determine if it's:
- VERIFIED: Known to be true
- UNCERTAIN: Might be true but you're not sure
- FALSE: Known to be false

Output in this format:
<fact_check>
  <claim verified="true|false|uncertain">[the claim]</claim>
  ...
</fact_check>`;

  try {
    const content = await callLLMForFactChecker(
      config,
      'You are a precise fact-checker. Be accurate and honest about uncertainty.',
      prompt,
    );

    // Parse claims from the response
    const claimRegex = /<claim\s+verified="(true|false|uncertain)"\s*>(.*?)<\/claim>/gi;
    const claims: { claim: string; verified: boolean; correction?: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = claimRegex.exec(content)) !== null) {
      const verified = match[1] === 'true';
      const claimText = match[2].trim();
      claims.push({
        claim: claimText,
        verified,
        correction: verified ? undefined : 'Claim may not be accurate',
      });
    }

    // If no structured claims found, do a simpler check
    if (claims.length === 0) {
      claims.push({
        claim: 'Full question and answer',
        verified: !content.toLowerCase().includes('false'),
        correction: content.includes('false') ? 'Some facts may be inaccurate' : undefined,
      });
    }

    const allVerified = claims.every(c => c.verified);

    return { all_verified: allVerified, claims };
  } catch (err) {
    console.warn('[Fact Checker] Verification failed:', err);
    return {
      all_verified: false,
      claims: [{
        claim: 'Fact check could not be completed',
        verified: false,
        correction: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }],
    };
  }
}

/**
 * Verify a batch of questions in parallel.
 */
export async function verifyQuestionBatch(
  questions: QuizGambitQuestion[],
  config: FactCheckerCallConfig,
): Promise<FactCheckResult[]> {
  return Promise.all(
    questions.map(question => verifyQuestion(question, config)),
  );
}

/**
 * Summarize fact check results.
 */
export function summarizeFactChecks(results: FactCheckResult[]): {
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  flaggedClaims: string[];
} {
  const totalCount = results.length;
  const passedCount = results.filter(r => r.all_verified).length;
  const flaggedClaims: string[] = [];

  for (const result of results) {
    for (const claim of result.claims) {
      if (!claim.verified) {
        flaggedClaims.push(`"${claim.claim}" — ${claim.correction || 'Not verified'}`);
      }
    }
  }

  return {
    allPassed: passedCount === totalCount,
    passedCount,
    totalCount,
    flaggedClaims,
  };
}
