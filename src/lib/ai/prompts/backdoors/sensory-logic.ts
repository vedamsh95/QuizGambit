/**
 * Backdoor Type: Sensory Logic
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 5
 * 
 * Mechanism: Physical properties described lead naturally to the answer.
 * The player deduces by reasoning from sensory descriptors.
 * 
 * Example: "Vibrant pink under stadium floodlights" → Pink Ball (for night cricket visibility)
 */
import type { BackdoorType } from '../../types';

export const sensoryLogic: {
  type: BackdoorType;
  name: string;
  description: string;
  mechanism: string;
  template: string;
} = {
  type: 'Sensory Logic',
  name: 'Sensory Logic',
  description: 'Physical properties described (color, texture, smell, sound) lead naturally to the answer',
  mechanism: 'Describe a sensory property that is uniquely associated with the answer: color + context = identification. "Vibrant pink + stadium + night = pink cricket ball"; "Sulfur smell + lightning strike = ozone"',
  template: `<backdoor_logic>
  <type>Sensory Logic</type>
  <sensory_descriptor>[The sensory detail: "Vibrant pink under stadium floodlights"]</sensory_descriptor>
  <context>[Where/when this occurs: "Day-Night Test matches"]</context>
  <target_answer>[The actual answer: "Pink cricket ball"]</target_answer>
  <deduction_path>[Player thinks: "What's pink and used at night in cricket? Must be the pink ball they use for day-night Tests."]</deduction_path>
</backdoor_logic>`,
};
