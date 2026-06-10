/**
 * QuizGambit Parser & Constraint Validator
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Parts 2 & 3
 * 
 * Validates constraints.
 * This is Phase 2 (Self-Validation) from the 3-phase execution chain.
 */

import type {
  QuestionAnalysis,
  ValidationResult,
} from './types';
import { ALL_LENSES, ALL_FORMS, ALL_BACKDOORS } from './types';

// ─── Constraint Validation ──────────────────────────────────────────

/**
 * Validate a single question against all constraints.
 * Returns a detailed validation result.
 */
export function validateQuestion(analysis: QuestionAnalysis): ValidationResult {
  const failures: string[] = [];
  const { constraint_check, draft, backdoor_logic, lens, form, backdoor_type } = analysis;

  // 1. Word count check — soft warn at >25, hard fail at >35
  const actualWordCount = draft ? draft.trim().split(/\s+/).length : 0;
  if (actualWordCount > 35) {
    failures.push(`Actual word count: ${actualWordCount} words (hard max 35 exceeded)`);
  }

  // 2. Banned starter check
  if (constraint_check.banned_starter_avoided === false) {
    failures.push(`Question might start with a banned starter.`);
  }

  // 3. Single sentence check
  if (constraint_check.one_sentence === false) {
    failures.push('Question is not a single sentence');
  }

  // 4. Backdoor presence check
  if (constraint_check.backdoor_present === false) {
    failures.push('No backdoor/secondary logical pathway present');
  }

  // 5. Backdoor logic completeness
  if (!backdoor_logic.opening_hook && !backdoor_logic.expert_clue) {
    failures.push('Backdoor logic incomplete: missing opening hook or expert clue');
  }

  if (!backdoor_logic.deduction_path) {
    failures.push('Backdoor logic incomplete: missing deduction path');
  }

  // 6. Lens validity
  if (!ALL_LENSES.includes(lens as any)) {
    failures.push(`Invalid lens: "${lens}"`);
  }

  // 7. Form validity
  if (!ALL_FORMS.includes(form as any)) {
    failures.push(`Invalid form: "${form}"`);
  }

  // 8. Backdoor type validity
  if (!ALL_BACKDOORS.includes(backdoor_type as any)) {
    failures.push(`Invalid backdoor type: "${backdoor_type}"`);
  }

  // 9. Draft emptiness check
  if (!draft || draft.trim().length === 0) {
    failures.push('Question draft is empty');
  }

  // 10. Question ends with punctuation
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

// ─── Answer-Not-In-Question Guardrail ───────────────────────────────

/**
 * Validate that answer_text does NOT appear as a substring in question_text.
 */
export function validateAnswerNotInQuestion(
  question_text: string,
  answer_text: string,
): ValidationResult {
  const failures: string[] = [];

  if (!answer_text || !question_text) {
    return { valid: true, failures: [] };
  }

  const escaped = answer_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');

  if (regex.test(question_text)) {
    failures.push(
      `Answer text "${answer_text}" appears in the question text — this is strictly forbidden`,
    );
  }

  return { valid: failures.length === 0, failures };
}

/**
 * Validate all questions for answer-in-question violations.
 * Returns indices of violating questions.
 */
export function validateAnswersNotInQuestions(
  questions: Array<{ question_text: string; answer_text: string }>,
): number[] {
  const violations: number[] = [];

  for (let i = 0; i < questions.length; i++) {
    const result = validateAnswerNotInQuestion(
      questions[i].question_text,
      questions[i].answer_text,
    );
    if (!result.valid) {
      violations.push(i);
    }
  }

  return violations;
}
