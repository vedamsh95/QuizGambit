/**
 * Form 5: Direct Narrative (Story-Driven)
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 4
 * 
 * PATTERN: "[Action/process description], [what/who + punchline]?"
 * 
 * STRUCTURE:
 *   Words 1-4: Action/process starter
 *   Words 5-12: The mechanism or narrative detail
 *   Words 13-17: Bridge to the conclusion
 *   Words 18-22: The satisfying reveal
 */
import type { FormBlueprint } from '../../types';

export const directNarrativeForm: FormBlueprint = {
  form: 'Form 5 (Direct Narrative)',
  pattern: '[Action/process description], [what/who + punchline]?',
  structure: `Words 1-4: Action/process starter (Scrambling..., Counting backwards..., Reversing the polarity..., Folding precisely seven times..., Boiling for exactly 3 minutes...)
Words 5-12: The mechanism or narrative detail (how it works, what happens)
Words 13-17: Bridge to the conclusion (connecting the action to the result)
Words 18-22: The satisfying reveal (the name, answer, or identity)`,
  example: 'Scrambling the geometric letters of the everyday phrase "At an angle" reveals the name of which southern Indian cricketing state?',
  best_lens_pairings: ['The Connection', 'The Legacy', 'Origin Story'],
};
