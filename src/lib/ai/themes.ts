/**
 * QuizGambit Theme → Subtopics Generation
 *
 * Uses a 3D combinatorial matrix (6 Types × 5 Domains × 4 Styles = 120 combos)
 * to generate 5 diverse subtopics from a single theme name.
 * This ensures no two generations of the same theme produce identical subtopics.
 */

import type {
  TopicType,
  KnowledgeDomain,
  QuizStyle,
  ThemeSubtopic,
  ThemeGenerationResult,
} from "./types";

// ─── System Prompt for Theme → Subtopics ─────────────────────────────

function buildThemePrompt(theme: string, excludeNames?: string[], allowedTypes?: TopicType[], allowedDomains?: KnowledgeDomain[], allowedStyles?: QuizStyle[]): string {
  let exclusionBlock = "";
  if (excludeNames && excludeNames.length > 0) {
    exclusionBlock = `\nAVOID THESE PREVIOUSLY GENERATED SUBTOPICS — do NOT generate any of these again:\n${excludeNames.map((n) => `  - ${n}`).join("\n")}\n`;
  }

  // Build the type/domain/style constraints based on selections
  const typeList = allowedTypes && allowedTypes.length > 0 ? allowedTypes : ['Core', 'Niche', 'Human', 'Surprise', 'Scale', 'Mystery'] as TopicType[];
  const domainList = allowedDomains && allowedDomains.length > 0 ? allowedDomains : ['Facts', 'Stories', 'Concepts', 'Data', 'Connections'] as KnowledgeDomain[];
  const styleList = allowedStyles && allowedStyles.length > 0 ? allowedStyles : ['Classic', 'Trick', 'Visual', 'Timeline'] as QuizStyle[];

  // Handle the case where fewer than 5 types are selected — "one each, no repeats" would be impossible
  const canUseUniqueTypes = typeList.length >= 5;
  const reuseNote = canUseUniqueTypes
    ? "one each, no repeats"
    : `only ${typeList.length} types available — you may reuse types as needed (aim for variety)`;

  const typeRule = typeList.length === 6
    ? `1. Use these 5 Topic Types (one each, no repeats):\n   - Core: The obvious, expected subtopic — sets the baseline familiarity\n   - Niche: A specialized, expert-level subtopic for serious quiz players\n   - Human: About people, personalities, rivalries, or dramatic stories\n   - Surprise: An unexpected, surprising angle nobody would think of first\n   - Scale: Mind-bending scope — size, numbers, extremes, or vast comparisons`
    : `1. Use ONLY these Topic Types (${reuseNote}):\n${typeList.map((t) => `   - ${t}`).join("\n")}`;

  const domainRule = domainList.length === 5
    ? `2. Cover at least 3 Knowledge Domains across the 5 subtopics:\n   - Facts: Concrete facts, definitions, names, dates\n   - Stories: Narratives, drama, context, "the real story behind..."\n   - Concepts: Abstract ideas, theories, patterns, "why things happen"\n   - Data: Numbers, statistics, records, comparisons\n   - Connections: Links between ideas, "how X changed Y"`
    : `2. Cover at least ${Math.min(3, domainList.length)} Knowledge Domains from: ${domainList.join(", ")}`;

  const styleRule = styleList.length === 4
    ? `3. Cover at least 3 Quiz Styles across the 5 subtopics:\n   - Classic: Straightforward Q&A, standard trivia\n   - Trick: Common misconceptions busted, "bet you thought..."\n   - Visual: Imagery-rich, descriptive, sensory details\n   - Timeline: Chronological sequence, "before and after"`
    : `3. Cover at least ${Math.min(3, styleList.length)} Quiz Styles from: ${styleList.join(", ")}`;

  return `You are a creative quiz designer. Given a theme, generate 5 subtopics that would make an exciting 5×5 quiz game round.

THEME: "${theme}"
${exclusionBlock}
RULES:
${typeRule}

${domainRule}

${styleRule}

4. CRITICAL: No boring generic names. Every subtopic must sound like a great
   quiz round title that makes people want to play. Think like a professional
   quiz show writer — every title should spark curiosity.

5. No two subtopics should overlap in content. Each must be distinct.

IMPORTANT: Output ONLY valid JSON in this exact format (no markdown, no explanations):
{
  "subtopics": [
    {
      "name": "Quantum Biology",
      "type": "Niche",
      "domain": "Concepts",
      "style": "Visual"
    },
    ...
  ]
}`;
}

// ─── Re-roll Prompt ─────────────────────────────────────────────────

function buildRerollPrompt(
  theme: string,
  existingSubtopics: ThemeSubtopic[],
  indexToReplace: number,
): string {
  const existingNames = existingSubtopics
    .filter((_, i) => i !== indexToReplace)
    .map((s) => s.name);

  const usedTypes = existingSubtopics
    .filter((_, i) => i !== indexToReplace)
    .map((s) => s.type);

  const usedDomains = existingSubtopics
    .filter((_, i) => i !== indexToReplace)
    .map((s) => s.domain);

  const usedStyles = existingSubtopics
    .filter((_, i) => i !== indexToReplace)
    .map((s) => s.style);

  return `You are a creative quiz designer. Replace ONE subtopic in an existing set.

THEME: "${theme}"

EXISTING SUBTOPICS (keep these exactly as-is):
${existingNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

TASK: Generate ONE new subtopic to replace the one being removed.

REQUIREMENTS:
- Must NOT duplicate any of the existing names above
- Should use a Topic Type NOT already used by the remaining 4. Used types: [${usedTypes.join(", ")}]
- Should use a Knowledge Domain underrepresented. Used domains: [${usedDomains.join(", ")}]
- Should use a Quiz Style underrepresented. Used styles: [${usedStyles.join(", ")}]
- Must sound like a great quiz round title — creative, intriguing, not generic

IMPORTANT: Output ONLY valid JSON in this exact format:
{
  "name": "The New Subtopic",
  "type": "Niche",
  "domain": "Concepts",
  "style": "Visual"
}`;
}

// ─── JSON Repair (shared via import from ai.ts) ─────────────────────
// We import aggressiveJsonRepair from ai.ts to avoid duplication.
// The function there has the same logic: strip markdown, extract JSON,
// fix trailing commas, fix newlines-in-strings.
import { aggressiveJsonRepair } from "../ai";

// ─── Core API Call ──────────────────────────────────────────────────

interface ThemeProviderConfig {
  provider: string; // 'openai' | 'gemini' | 'groq'
  apiKey: string;
  model: string;
}

async function callLLM(prompt: string, config: ThemeProviderConfig): Promise<string> {
  const { provider, apiKey, model } = config;

  if (provider === "openai" || provider === "groq") {
    const endpoint =
      provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a strict JSON-only quiz topic generator. Output valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
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

  if (provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Generate 5 subtopics from a theme using the 3D matrix.
 * 1 API call → returns ThemeGenerationResult with 5 diverse subtopics.
 *
 * Each subtopic has a unique Type, and at least 3 Domains and 3 Styles
 * are represented across the 5 results.
 */
export async function generateThemeSubtopics(
  theme: string,
  config: ThemeProviderConfig,
  excludeNames?: string[],
  allowedTypes?: TopicType[],
  allowedDomains?: KnowledgeDomain[],
  allowedStyles?: QuizStyle[],
): Promise<ThemeGenerationResult> {
  console.log(`[Theme Gen] Generating subtopics for theme: "${theme}"`);
  if (excludeNames && excludeNames.length > 0) {
    console.log(`[Theme Gen] Excluding ${excludeNames.length} previously generated names:`, excludeNames.join(", "));
  }
  if (allowedTypes && allowedTypes.length < 6) {
    console.log(`[Theme Gen] Type subset:`, allowedTypes.join(", "));
  }
  if (allowedDomains && allowedDomains.length < 5) {
    console.log(`[Theme Gen] Domain subset:`, allowedDomains.join(", "));
  }
  if (allowedStyles && allowedStyles.length < 4) {
    console.log(`[Theme Gen] Style subset:`, allowedStyles.join(", "));
  }

  const prompt = buildThemePrompt(theme, excludeNames, allowedTypes, allowedDomains, allowedStyles);
  const rawOutput = await callLLM(prompt, config);
  const parsed = aggressiveJsonRepair(rawOutput);

  const subtopics: ThemeSubtopic[] = (parsed.subtopics || []).slice(0, 5).map((s: any) => ({
    name: String(s.name || "").trim(),
    type: (s.type as TopicType) || "Core",
    domain: (s.domain as KnowledgeDomain) || "Facts",
    style: (s.style as QuizStyle) || "Classic",
  })).filter((s: ThemeSubtopic) => s.name.length > 0);

  if (subtopics.length === 0) {
    throw new Error("AI returned no valid subtopics. Please try again.");
  }

  // Ensure exactly 5 — pad with generic fallbacks if needed (should never happen)
  while (subtopics.length < 5) {
    const fallbackTypes: TopicType[] = ["Core", "Niche", "Human", "Surprise", "Scale"];
    const usedTypes = new Set(subtopics.map((s) => s.type));
    const nextType = fallbackTypes.find((t) => !usedTypes.has(t)) || "Core";
    subtopics.push({
      name: `${theme} — Part ${subtopics.length + 1}`,
      type: nextType,
      domain: "Facts",
      style: "Classic",
    });
  }

  console.log(`[Theme Gen] Generated ${subtopics.length} subtopics:`, subtopics.map((s) => s.name).join(", "));

  return { theme, subtopics: subtopics.slice(0, 5) };
}

/**
 * Re-roll a single subtopic keeping the other 4.
 * The new subtopic will use a Type/Domain/Style combination not already used.
 */
export async function rerollSubtopic(
  theme: string,
  existingSubtopics: ThemeSubtopic[],
  indexToReplace: number,
  config: ThemeProviderConfig,
): Promise<ThemeSubtopic> {
  console.log(`[Theme Reroll] Re-rolling subtopic ${indexToReplace} for theme: "${theme}"`);

  const prompt = buildRerollPrompt(theme, existingSubtopics, indexToReplace);
  const rawOutput = await callLLM(prompt, config);
  const parsed = aggressiveJsonRepair(rawOutput);

  const result: ThemeSubtopic = {
    name: String(parsed.name || "").trim(),
    type: (parsed.type as TopicType) || "Core",
    domain: (parsed.domain as KnowledgeDomain) || "Facts",
    style: (parsed.style as QuizStyle) || "Classic",
  };

  if (!result.name) {
    throw new Error("AI returned an empty subtopic name. Please try again.");
  }

  // Ensure uniqueness: if the name matches an existing one, append a suffix
  const existingNames = existingSubtopics
    .filter((_, i) => i !== indexToReplace)
    .map((s) => s.name.toLowerCase());
  if (existingNames.includes(result.name.toLowerCase())) {
    result.name = `${result.name} (alt)`;
  }

  console.log(`[Theme Reroll] New subtopic: "${result.name}" (${result.type} · ${result.domain} · ${result.style})`);

  return result;
}
