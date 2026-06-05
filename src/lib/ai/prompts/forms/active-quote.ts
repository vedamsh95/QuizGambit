/**
 * Form 4: Active Quote (Iconic Phrase/Nickname)
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 4
 * 
 * PATTERN: "[Action verb + quote/nickname], [what/who + resolution]?"
 * 
 * STRUCTURE:
 *   Words 1-4: Quote/nickname/action setup
 *   Words 5-12: Context about who said it or why
 *   Words 13-17: The twist or tension
 *   Words 18-22: The identity reveal
 */
import type { FormBlueprint } from '../../types';

export const activeQuoteForm: FormBlueprint = {
  form: 'Form 4 (Active Quote)',
  pattern: '[Action verb + quote/nickname/title context], [what/who + resolution]?',
  structure: `Words 1-4: Quote/nickname/action opener (Mockingly..., Dubbed the "..." ..., "I have not failed..." ..., Christened the "..." ...)
Words 5-12: Context — who said it, when, under what circumstances
Words 13-17: The twist or unexpected tension
Words 18-22: The identity reveal (person, place, thing being described)`,
  example: 'Mockingly completing a batting line-up containing Shane Lee and Ian Harvey, what infamous historical surname did Steve Waugh assign to a struggling teammate?',
  best_lens_pairings: ['The Human Element', 'The Rivalry', 'What If?'],
};
