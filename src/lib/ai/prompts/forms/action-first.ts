/**
 * Form 1: Action-First (Dynamic Participle)
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 4
 * 
 * PATTERN: [Present participle verb phrase], [what/who + core fact]?
 * 
 * STRUCTURE:
 *   Words 1-4: Participle opener (Pioneering..., Fleeing..., Perfected by..., Born from...)
 *   Words 5-12: Contextual flourish (the year, the field, the stakes)
 *   Words 13-17: Pivot connection (what/who + transition)
 *   Words 18-22: Common giveaway (the recognizable anchor)
 */
import type { FormBlueprint } from '../../types';

export const actionFirstForm: FormBlueprint = {
  form: 'Form 1 (Action-First)',
  pattern: '[Dynamic participle verb phrase], [what/who + core fact]?',
  structure: `Words 1-4: Participle opener (Pioneering..., Fleeing..., Perfected by..., Born from..., Defying..., Refusing..., Transforming...)
Words 5-12: Contextual flourish (the year, the field, the stakes, the setting)
Words 13-17: Pivot connection (what/who + transition word)
Words 18-22: Common giveaway (the recognizable anchor that confirms the answer)`,
  example: 'Pioneering the 1879 electrical age, what household item was perfected by Thomas Edison using a charred piece of sewing thread?',
  best_lens_pairings: ['Origin Story', 'The Legacy', 'The Rivalry'],
};
