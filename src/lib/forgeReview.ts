/**
 * Forge Review Engine — Shared library for both CLI and GUI.
 * Pure functions: no Supabase, no filesystem, no Node dependencies.
 */

// ─── TYPES ───────────────────────────────────────────────────────────

export interface ReviewIssue {
  questionIndex: number;
  questionText: string;
  answerText: string;
  type: 'answer_leak' | 'banned_starter' | 'factual_flag' | 'duplicate';
  detail: string;
  severity: 'critical' | 'warning';
}

export interface ReviewReport {
  totalQuestions: number;
  score: number;                      // 0-100
  grade: string;                       // A+, A, B+, B, C, D, F
  passes: number;
  failures: number;
  warnings: number;
  issues: ReviewIssue[];
  diversity: {
    formsUsed: number;
    formsMissing: string[];
    backdoorsUsed: number;
    backdoorsMissing: string[];
    difficultySpread: { easy: number; medium: number; challenging: number; expert: number };
  };
  summary: string;
}

// ─── CONSTANTS ───────────────────────────────────────────────────────

export const ALL_FORMS_REVIEW = [
  'Form 1 (Action-First)', 'Form 2 (Parenthetical Hook)', 'Form 3 (Sensory Clue)',
  'Form 4 (Active Quote)', 'Form 5 (Direct Narrative)', 'Form 6 (The Contradiction)',
  'Form 7 (The Question Lead)', 'Form 8 (The Timeline)', 'Form 9 (The Misdirection)',
  'Form 10 (Defining Trait)',
];

export const ALL_BACKDOORS_REVIEW = [
  'Synonym Bridge', 'Contrast Pop', 'Everyday Link', 'Anagram-Wordplay',
  'Sequence Pattern', 'Sensory Logic', 'Category Elimination',
  'Etymology / Name Logic', 'Functional Logic', 'Pop Culture Hook',
];

// ─── REVIEW ENGINE ───────────────────────────────────────────────────

/**
 * Review a set of questions and return a detailed report.
 * Pure function — works in browser and Node.js.
 */
export function reviewQuestions(
  questions: Array<{
    question_text?: string;
    answer_text?: string;
    lens?: string;
    form?: string;
    backdoor_type?: string;
    points?: number;
    difficulty_tier?: string;
  }>,
): ReviewReport {
  const issues: ReviewIssue[] = [];
  const total = questions.length;

  if (total === 0) {
    return {
      totalQuestions: 0, score: 0, grade: 'N/A',
      passes: 0, failures: 0, warnings: 0, issues: [],
      diversity: { formsUsed: 0, formsMissing: ALL_FORMS_REVIEW, backdoorsUsed: 0, backdoorsMissing: ALL_BACKDOORS_REVIEW, difficultySpread: { easy: 0, medium: 0, challenging: 0, expert: 0 } },
      summary: 'No questions to review.',
    };
  }

  let answerLeaks = 0;

  const formsUsed = new Set<string>();
  const backdoorsUsed = new Set<string>();
  const difficultySpread = { easy: 0, medium: 0, challenging: 0, expert: 0 };

  questions.forEach((q, i) => {
    const qText = (q.question_text || '').trim();
    const ansText = (q.answer_text || '').trim();
    const form = q.form || '';
    const bd = q.backdoor_type || '';
    const diff = q.difficulty_tier || 'easy';

    // ── Check 1: Answer-in-question leak ──
    if (ansText && qText) {
      // Check if answer text (or its initials/parenthetical parts) appears verbatim in question
      const qLower = qText.toLowerCase();
      const answerLower = ansText.toLowerCase();
      if (qLower.includes(answerLower) && answerLower.length > 3) {
        issues.push({
          questionIndex: i, questionText: qText, answerText: ansText,
          type: 'answer_leak',
          detail: `Answer "${ansText}" appears verbatim in question text`,
          severity: 'critical',
        });
        answerLeaks++;
      }
    }

    // Track forms and backdoors
    if (form) formsUsed.add(form);
    if (bd) backdoorsUsed.add(bd);

    // Track difficulty
    if (diff === 'easy') difficultySpread.easy++;
    else if (diff === 'medium') difficultySpread.medium++;
    else if (diff === 'challenging') difficultySpread.challenging++;
    else if (diff === 'expert') difficultySpread.expert++;
    else difficultySpread.easy++;
  });

  const formsMissing = ALL_FORMS_REVIEW.filter(f => !formsUsed.has(f));
  const backdoorsMissing = ALL_BACKDOORS_REVIEW.filter(b => !backdoorsUsed.has(b));

  // ── Score calculation ──
  // Only answer leaks are critical — clues and WH-questions are fine
  const criticalIssues = answerLeaks;
  const scoreBreakdown = {
    answerLeaks: Math.max(0, 30 - answerLeaks * 15),
    formDiversity: Math.min(25, formsUsed.size * 2.5),
    backdoorDiversity: Math.min(20, backdoorsUsed.size * 2),
    difficultyBalance: (() => {
      const ideal = total / 4;
      const variance = Math.abs(difficultySpread.easy - ideal) + Math.abs(difficultySpread.medium - ideal) + Math.abs(difficultySpread.challenging - ideal) + Math.abs(difficultySpread.expert - ideal);
      return Math.max(0, 25 - (variance / total) * 25);
    })(),
  };

  const score = Math.round(
    scoreBreakdown.answerLeaks +
    scoreBreakdown.formDiversity +
    scoreBreakdown.backdoorDiversity +
    scoreBreakdown.difficultyBalance
  );

  let grade: string;
  if (score >= 95) grade = 'A+';
  else if (score >= 85) grade = 'A';
  else if (score >= 80) grade = 'B+';
  else if (score >= 70) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  // ── Summary ──
  const parts: string[] = [];
  if (answerLeaks > 0) parts.push(`🔴 ${answerLeaks} answer-in-question leak(s)`);
  parts.push(`📋 ${formsUsed.size}/10 forms used`);
  parts.push(`🔐 ${backdoorsUsed.size}/10 backdoors used`);
  parts.push(`📊 Difficulty: ${difficultySpread.easy}E/${difficultySpread.medium}M/${difficultySpread.challenging}C/${difficultySpread.expert}X`);

  return {
    totalQuestions: total,
    score,
    grade,
    passes: total - criticalIssues,
    failures: criticalIssues,
    warnings: 0,
    issues,
    diversity: {
      formsUsed: formsUsed.size,
      formsMissing,
      backdoorsUsed: backdoorsUsed.size,
      backdoorsMissing,
      difficultySpread,
    },
    summary: parts.join(' | '),
  };
}
