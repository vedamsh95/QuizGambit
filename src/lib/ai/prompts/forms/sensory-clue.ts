/**
 * Form 3: Sensory Clue (Color/Texture/Shape)
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 4
 * 
 * PATTERN: "[Color/texture/shape descriptor], [what/who + physical detail]?"
 * 
 * STRUCTURE:
 *   Words 1-4: Sensory opener (Vibrant pink..., Rough as sandstone..., Spherical yet hollow...)
 *   Words 5-12: Context-setting environment
 *   Words 13-17: Physical/functional connection
 *   Words 18-22: Practical giveaway
 */
import type { FormBlueprint } from '../../types';

export const sensoryClueForm: FormBlueprint = {
  form: 'Form 3 (Sensory Clue)',
  pattern: '[Color/texture/shape descriptor], [what/who + physical detail]?',
  structure: `Words 1-4: Sensory opener (Vibrant pink..., Rough as sandstone..., Spherical yet hollow..., Translucent and gelatinous..., Needle-sharp and venom-tipped...)
Words 5-12: Context-setting environment (where it's found, when it appears)
Words 13-17: Physical/functional connection (what it does or how it works)
Words 18-22: Practical giveaway (the recognizable name or application)`,
  example: 'Vibrant pink under stadium floodlights, what specialized leather sphere was introduced to make Day-Night Test matches visible?',
  best_lens_pairings: ['The Oddity', 'Numbers & Scale', 'The Connection'],
};
