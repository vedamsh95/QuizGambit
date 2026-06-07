/**
 * Forge Batch Template
 * 
 * Copy this file to generate a new batch.
 * Replace the question arrays with generated content.
 */

import type { QuizGambitQuestion } from '../../src/lib/ai/types';

// Factory: creates a single question
function q(
  lens: string,
  form: string,
  questionText: string,
  answerText: string,
  options: [string, string, string, string],
  backdoorType: string,
  backdoorExplanation: string,
  points: number,
  difficultyTier: string,
  tag?: string,
): QuizGambitQuestion {
  return {
    lens, form, question_text: questionText, answer_text: answerText,
    options, backdoor_type: backdoorType, backdoor_explanation: backdoorExplanation,
    points, difficulty_tier: difficultyTier, tag,
  } as QuizGambitQuestion;
}

// Factory: creates a category entry
function cat(
  name: string,
  mainCategory: string,
  description: string,
  lensMode: 'diverse' | 'focused',
  targetLens: string | undefined,
  questions: QuizGambitQuestion[],
  tags: string[] = [],
) {
  return { name, main_category: mainCategory, description, lens_mode: lensMode, target_lens: targetLens, data: questions, tags };
}

// ─── BATCH CONTENT ─────────────────────────────────────────────────
// TODO: Replace with generated questions

export const batch = [
  // Example diverse topic:
  cat('Example Topic', 'Science', 'Description here', 'diverse', undefined, [
    q('Origin Story', 'Form 5 (Direct Narrative)',
      'Question text here...', 'Answer',
      ['A', 'B', 'C', 'D'],
      'Everyday Link', 'Backdoor explanation...', 100, 'easy', 'Tag'),
    // ... 4 more questions
  ], ['Grid', 'Example Topic', 'Theme:Science']),
];

export const meta = {
  generatedAt: new Date().toISOString(),
  batchNumber: 0,
  mode: 'diverse',
};
