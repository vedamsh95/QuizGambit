/**
 * Backdoor Type: Synonym Bridge
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 5
 * 
 * Mechanism: Clue contains a synonym or descriptive phrase pointing to the answer.
 * The player deduces the answer from the descriptive language, not from prior knowledge.
 * 
 * Example: "Leather sphere" → cricket ball, "Massive oil-rich organ" → liver
 */
import type { BackdoorType } from '../../types';

export const synonymBridge: {
  type: BackdoorType;
  name: string;
  description: string;
  mechanism: string;
  template: string;
} = {
  type: 'Synonym Bridge',
  name: 'Synonym Bridge',
  description: 'Clue contains a synonym or descriptive phrase pointing to the answer',
  mechanism: 'Replace the direct noun with a descriptive phrase: "leather sphere" = cricket ball, "massive oil-rich organ" = liver, "charred piece of sewing thread" = carbon filament',
  template: `<backdoor_logic>
  <type>Synonym Bridge</type>
  <expert_clue>[Descriptive phrase that replaces the target noun — e.g., "charred piece of sewing thread"]</expert_clue>
  <everyday_link>[What everyday object or concept this describes]</everyday_link>
  <target_answer>[The actual answer]</target_answer>
  <deduction_path>[Player thinks: "What uses a charred thread? Something that glows? A bulb!"]</deduction_path>
</backdoor_logic>`,
};
