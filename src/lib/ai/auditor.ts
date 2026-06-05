/**
 * QuizGambit Diversity Auditor
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 3 (Phase 2: Self-Validation)
 * 
 * Checks that the generated question set has proper diversity across lenses,
 * forms, difficulty tiers, and syntactic patterns. This enforces the "no two 
 * questions feel the same" principle from the 10×5 matrix.
 */

import type {
  QuestionAnalysis,
  DiversityAudit,
  LensType,
  FormType,
  DifficultyTier,
} from './types';
import { ALL_LENSES, ALL_FORMS } from './types';

// ─── Core Audit ─────────────────────────────────────────────────────

/**
 * Run a full diversity audit on a set of question analyses.
 */
export function auditDiversity(
  analyses: QuestionAnalysis[],
  questionCount: number,
): DiversityAudit {
  const lenses = analyses.map(a => a.lens);
  const forms = analyses.map(a => a.form);
  const issues: string[] = [];

  // 1. All lenses unique?
  const uniqueLenses = [...new Set(lenses)];
  const allLensesUnique = uniqueLenses.length === lenses.length && lenses.length === questionCount;
  if (!allLensesUnique) {
    const duplicates = findDuplicates(lenses);
    if (duplicates.length > 0) {
      issues.push(`Duplicate lenses: ${duplicates.join(', ')}`);
    }
  }

  // 2. All 5 forms represented (for sets >= 5)?
  const uniqueForms = [...new Set(forms)];
  const allFormsRepresented = questionCount >= 5
    ? ALL_FORMS.every((f: FormType) => forms.includes(f))
    : uniqueForms.length >= Math.min(questionCount, ALL_FORMS.length);
  if (questionCount >= 5 && !allFormsRepresented) {
    const missing = ALL_FORMS.filter((f: FormType) => !forms.includes(f));
    issues.push(`Missing forms: ${missing.join(', ')}`);
  }

  // 3. No consecutive form repeats?
  let noConsecutiveRepeats = true;
  for (let i = 1; i < forms.length; i++) {
    if (forms[i] === forms[i - 1]) {
      noConsecutiveRepeats = false;
      issues.push(`Form ${forms[i]} repeated at positions ${i} and ${i + 1}`);
    }
  }

  // 4. No duplicate grammatical patterns?
  // Check that no two questions start with the same first 3 words
  const starters = analyses.map(a => {
    const words = a.draft.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
    return words;
  });
  const uniqueStarters = new Set(starters);
  const noDuplicateGrammaticalPatterns = uniqueStarters.size === starters.length;
  if (!noDuplicateGrammaticalPatterns) {
    const dupes = findDuplicates(starters);
    issues.push(`Duplicate sentence starters: ${dupes.join(', ')}`);
  }

  // 5. Difficulty ramp valid?
  // Simplified check: analyses are ordered Q1...QN and should progress in difficulty
  const difficultyRampValid = checkDifficultyRamp(analyses);
  if (!difficultyRampValid) {
    issues.push('Difficulty ramp may not be properly ascending (easy → expert)');
  }

  return {
    lenses_used: uniqueLenses,
    forms_used: uniqueForms,
    all_lenses_unique: allLensesUnique,
    all_forms_represented: allFormsRepresented,
    no_consecutive_form_repeats: noConsecutiveRepeats,
    no_duplicate_grammatical_patterns: noDuplicateGrammaticalPatterns,
    difficulty_ramp_valid: difficultyRampValid,
    issues,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Find duplicate values in an array.
 */
function findDuplicates<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const duplicates = new Set<T>();
  for (const item of arr) {
    if (seen.has(item)) {
      duplicates.add(item);
    }
    seen.add(item);
  }
  return [...duplicates];
}

/**
 * Check that difficulty ramps from easy to expert across the question set.
 * Uses a sliding window approach: the first 25% should be easier than the last 25%.
 */
function checkDifficultyRamp(analyses: QuestionAnalysis[]): boolean {
  if (analyses.length < 3) return true; // Too few to judge

  // Map lenses to approximate difficulty tiers
  const lensDifficulty: Record<string, DifficultyTier> = {
    'Origin Story': 'easy',
    'Behind the Scenes': 'easy',
    'The Unexpected': 'medium',
    'Numbers & Scale': 'medium',
    'The Oddity': 'medium',
    'The Rivalry': 'challenging',
    'The Human Element': 'medium',
    'The Connection': 'challenging',
    'What If?': 'challenging',
    'The Legacy': 'expert',
  };

  const tierValues: Record<DifficultyTier, number> = {
    'easy': 1,
    'medium': 2,
    'challenging': 3,
    'expert': 4,
  };

  const firstThird = analyses.slice(0, Math.ceil(analyses.length / 3));
  const lastThird = analyses.slice(-Math.ceil(analyses.length / 3));

  const firstAvg = firstThird.reduce((sum, a) => {
    const tier = lensDifficulty[a.lens] || 'medium';
    return sum + (tierValues[tier] || 2);
  }, 0) / firstThird.length;

  const lastAvg = lastThird.reduce((sum, a) => {
    const tier = lensDifficulty[a.lens] || 'medium';
    return sum + (tierValues[tier] || 2);
  }, 0) / lastThird.length;

  // The last third should be at least as hard as the first third
  return lastAvg >= firstAvg;
}

// ─── Lens/Form Assignment Suggestion ────────────────────────────────

/**
 * Suggest a lens→form assignment for a given question count.
 * Uses all lenses once and rotates through all 5 forms.
 * This is used in Stage 0 (Context Assembly) to pre-assign before LLM generation.
 */
export function suggestAssignments(
  questionCount: number,
): Array<{ lens: LensType; form: FormType }> {
  const assignments: Array<{ lens: LensType; form: FormType }> = [];
  const availableLenses = [...ALL_LENSES]; // shallow copy

  // Shuffle lenses for variety
  shuffleArray(availableLenses);

  for (let i = 0; i < questionCount; i++) {
    // Use a unique lens if available, otherwise cycle
    const lensIndex = i % availableLenses.length;
    const lens = i < availableLenses.length
      ? availableLenses[i]
      : availableLenses[lensIndex];

    // Cycle through forms 1-5
    const formIndex = i % ALL_FORMS.length;
    const form = ALL_FORMS[formIndex];

    assignments.push({ lens, form });
  }

  // Ensure no consecutive forms match
  for (let i = 1; i < assignments.length; i++) {
    if (assignments[i].form === assignments[i - 1].form) {
      // Swap with next available form
      const nextFormIndex = (ALL_FORMS.indexOf(assignments[i].form) + 1) % ALL_FORMS.length;
      assignments[i].form = ALL_FORMS[nextFormIndex];
    }
  }

  return assignments;
}

/**
 * Fisher-Yates shuffle (in-place).
 */
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ─── Format Audit Report ────────────────────────────────────────────

/**
 * Format the diversity audit into a human-readable report.
 */
export function formatAuditReport(audit: DiversityAudit): string {
  const lines: string[] = [];
  lines.push('═══ DIVERSITY AUDIT ═══');

  const pass = (cond: boolean) => cond ? '✓' : '✗';

  lines.push(`${pass(audit.all_lenses_unique)} Lenses unique: ${audit.lenses_used.join(', ')}`);
  lines.push(`${pass(audit.all_forms_represented)} All 5 forms represented: ${audit.forms_used.join(', ')}`);
  lines.push(`${pass(audit.no_consecutive_form_repeats)} No consecutive form repeats`);
  lines.push(`${pass(audit.no_duplicate_grammatical_patterns)} No duplicate sentence starters`);
  lines.push(`${pass(audit.difficulty_ramp_valid)} Difficulty ramp valid`);

  if (audit.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of audit.issues) {
      lines.push(`  ⚠ ${issue}`);
    }
  }

  return lines.join('\n');
}
