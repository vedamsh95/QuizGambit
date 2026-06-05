/**
 * QuizGambit XML Parser & Constraint Validator
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Parts 2 & 3
 * 
 * Parses <analysis> XML blocks from LLM output and validates all constraints.
 * This is Phase 2 (Self-Validation) from the 3-phase execution chain.
 */

import type {
  QuestionAnalysis,
  BackdoorLogic,
  ConstraintCheck,
  ValidationResult,
  BackdoorType,
  LensType,
  FormType,
} from './types';
import { ALL_LENSES, ALL_FORMS, ALL_BACKDOORS, hasBannedStarter, countWords, isSingleSentence, getWordRanges } from './types';

// ─── XML Parsing ────────────────────────────────────────────────────

/**
 * Parse the raw LLM output and extract <analysis> blocks for each question.
 */
export function parseAnalysisBlocks(rawOutput: string): QuestionAnalysis[] {
  const results: QuestionAnalysis[] = [];

  // Find all <q{n}> blocks using regex
  const qBlockRegex = /<q\d+>([\s\S]*?)<\/q\d+>/g;
  let qMatch: RegExpExecArray | null;

  while ((qMatch = qBlockRegex.exec(rawOutput)) !== null) {
    const blockContent = qMatch[1];
    const analysis = parseSingleAnalysisBlock(blockContent);
    if (analysis) {
      results.push(analysis);
    }
  }

  return results;
}

/**
 * Parse a single <q{n}>...</q{n}> block into a QuestionAnalysis object.
 */
function parseSingleAnalysisBlock(blockContent: string): QuestionAnalysis | null {
  try {
    const lens = extractTag(blockContent, 'lens') as LensType | null;
    const form = extractTag(blockContent, 'form') as FormType | null;
    const backdoor_type = extractTag(blockContent, 'backdoor_type') as BackdoorType | null;

    if (!lens || !form || !backdoor_type) {
      console.warn('[Parser] Missing required fields: lens/form/backdoor_type');
      return null;
    }

    const backdoorLogicRaw = extractTag(blockContent, 'backdoor_logic', true);
    const constraintCheckRaw = extractTag(blockContent, 'constraint_check', true);
    const draft = extractTag(blockContent, 'draft');

    const backdoor_logic = parseBackdoorLogic(backdoorLogicRaw, backdoor_type);
    const constraint_check = parseConstraintCheck(constraintCheckRaw, draft);

    return {
      lens,
      form,
      backdoor_type,
      backdoor_logic,
      constraint_check,
      draft: draft || '',
    };
  } catch (err) {
    console.warn('[Parser] Failed to parse analysis block:', err);
    return null;
  }
}

/**
 * Extract the content of a named XML tag.
 * If multiline=true, preserves newlines and inner tags.
 */
function extractTag(content: string, tagName: string, multiline = false): string {
  if (multiline) {
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = regex.exec(content);
    return match ? match[1].trim() : '';
  }
  const regex = new RegExp(`<${tagName}>([^<]*)<\\/${tagName}>`, 'i');
  const match = regex.exec(content);
  return match ? match[1].trim() : '';
}

/**
 * Parse the <backdoor_logic> block into structured data.
 */
function parseBackdoorLogic(raw: string, backdoorType: BackdoorType): BackdoorLogic {
  const expertClue = extractTag(raw, 'expert_clue', true) || extractTag(raw, 'Expert clue', true) || '';
  const bridge = extractTag(raw, 'bridge', true) || extractTag(raw, 'Bridge', true) || '';
  const giveaway = extractTag(raw, 'giveaway', true) || extractTag(raw, 'Giveaway', true) || '';
  const deductionPath = extractTag(raw, 'deduction_path', true) || extractTag(raw, 'Deduction path', true) || '';

  return {
    type: backdoorType,
    expert_clue: expertClue,
    bridge: bridge,
    giveaway: giveaway,
    deduction_path: deductionPath,
  };
}

/**
 * Parse the <constraint_check> block into structured data.
 */
function parseConstraintCheck(raw: string, draft: string): ConstraintCheck {
  const wordCount = countWords(draft);
  const isSingle = isSingleSentence(draft);
  const noBanned = !hasBannedStarter(draft);
  const [range1, range2, range3] = getWordRanges(draft);
  const isPyramidal = range1.length > 0 && range3.length > 0; // Both opening hook and giveaway present

  return {
    one_sentence: isSingle,
    under_word_limit: wordCount <= 30,  // Hard max at 30, ideal ~25
    word_count: wordCount,
    banned_starter_avoided: noBanned,
    micro_pyramidal: isPyramidal,
    backdoor_present: raw.includes('backdoor') || raw.includes('Backdoor') || raw.includes('deduction'),
  };
}

// ─── Constraint Validation ──────────────────────────────────────────

/**
 * Validate a single question against all constraints.
 * Returns a detailed validation result.
 */
export function validateQuestion(analysis: QuestionAnalysis): ValidationResult {
  const failures: string[] = [];
  const { constraint_check, draft, backdoor_logic, lens, form, backdoor_type } = analysis;

  // 1. Word count check — soft warn at >25, hard fail at >30
  if (constraint_check.word_count > 30) {
    failures.push(`Word count: ${constraint_check.word_count} words (hard max 30 exceeded)`);
  } else if (constraint_check.word_count > 25) {
    // Soft warning — not a failure, just informative
    console.log(`[Parser] Q word count ${constraint_check.word_count} is above ideal ~25 but within tolerance`);
  }

  // 2. Banned starter check
  if (!constraint_check.banned_starter_avoided) {
    failures.push(`Question starts with a banned starter: "${draft.slice(0, 15)}..."`);
  }

  // 3. Single sentence check
  if (!constraint_check.one_sentence) {
    failures.push('Question is not a single sentence');
  }

  // 4. Micro-pyramidal flow check — soft: only fail if completely absent
  if (!constraint_check.micro_pyramidal) {
    // Warn but don't fail — the flow is a SHOULD, not a MUST
    console.log(`[Parser] Q micro-pyramidal flow not detected — may still be fine`);
  }

  // 5. Backdoor presence check
  if (!constraint_check.backdoor_present) {
    failures.push('No backdoor/secondary logical pathway present');
  }

  // 6. Backdoor logic completeness
  if (!backdoor_logic.expert_clue || !backdoor_logic.giveaway) {
    failures.push('Backdoor logic incomplete: missing expert clue or giveaway');
  }

  if (!backdoor_logic.deduction_path) {
    failures.push('Backdoor logic incomplete: missing deduction path');
  }

  // 7. Lens validity
  if (!ALL_LENSES.includes(lens)) {
    failures.push(`Invalid lens: "${lens}"`);
  }

  // 8. Form validity
  if (!ALL_FORMS.includes(form)) {
    failures.push(`Invalid form: "${form}"`);
  }

  // 9. Backdoor type validity
  if (!ALL_BACKDOORS.includes(backdoor_type)) {
    failures.push(`Invalid backdoor type: "${backdoor_type}"`);
  }

  // 10. Draft emptiness check
  if (!draft || draft.trim().length === 0) {
    failures.push('Question draft is empty');
  }

  // 11. Question ends with punctuation
  if (draft && !/[.?!]$/.test(draft.trim())) {
    failures.push('Question does not end with punctuation (. ? !)');
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}

/**
 * Validate all questions in a parsed generation.
 * Returns pass/fail/fixable classification for each question.
 */
export function validateAllQuestions(
  analyses: QuestionAnalysis[],
): { results: ValidationResult[]; passCount: number; failCount: number } {
  const results = analyses.map(a => validateQuestion(a));
  const passCount = results.filter(r => r.valid).length;
  const failCount = results.filter(r => !r.valid).length;

  return { results, passCount, failCount };
}

// ─── JSON Parsing ───────────────────────────────────────────────────

/**
 * Parse the <JSON_OUTPUT> block from the LLM output.
 * Handles both properly tagged and bare JSON outputs.
 */
export function parseJsonOutput(rawOutput: string): any[] {
  // Try to extract from <JSON_OUTPUT> tags first
  const jsonBlockMatch = /<JSON_OUTPUT>([\s\S]*?)<\/JSON_OUTPUT>/i.exec(rawOutput);
  let jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : rawOutput;

  // Strip markdown code blocks if present
  jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // Find the JSON array
  const arrayStart = jsonStr.indexOf('[');
  const arrayEnd = jsonStr.lastIndexOf(']');

  if (arrayStart === -1 || arrayEnd === -1) {
    console.warn('[Parser] No JSON array found in output');
    return [];
  }

  jsonStr = jsonStr.substring(arrayStart, arrayEnd + 1);

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Attempt repair: trailing commas
    const repaired = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      console.error('[Parser] Failed to parse JSON output:', e2);
      return [];
    }
  }
}

/**
 * Extract the <diversity_audit> block from LLM output.
 */
export function parseDiversityAudit(rawOutput: string): {
  raw: string;
  lensesUsed: string[];
  hasAllForms: boolean;
  noConsecutiveRepeats: boolean;
} {
  const auditMatch = /<diversity_audit>([\s\S]*?)<\/diversity_audit>/i.exec(rawOutput);
  const raw = auditMatch ? auditMatch[1].trim() : '';

  const lensesUsed: string[] = [];
  for (const lens of ALL_LENSES) {
    if (raw.toLowerCase().includes(lens.toLowerCase())) {
      lensesUsed.push(lens);
    }
  }

  const hasAllForms = ALL_FORMS.every(f => {
    const shortName = f.replace(/^Form \d \(/, '').replace(/\)$/, '').toLowerCase();
    return raw.toLowerCase().includes(shortName.substring(0, 4));
  });

  // Simplified check: look for "no consecutive" or "no two" in the audit
  const noConsecutiveRepeats =
    raw.toLowerCase().includes('no consecutive') ||
    raw.toLowerCase().includes('no repeat');

  return { raw, lensesUsed, hasAllForms, noConsecutiveRepeats };
}
