/**
 * Backdoor Type: Category Elimination
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 5
 * 
 * Mechanism: The clue narrows the field so dramatically that deduction works.
 * The player deduces by eliminating everything that doesn't fit the constraints.
 * 
 * Example: "Southern Indian cricketing state" → narrows India's 28 states to ~5 southern states that play cricket
 */
import type { BackdoorType } from '../../types';

export const categoryElimination: {
  type: BackdoorType;
  name: string;
  description: string;
  mechanism: string;
  template: string;
} = {
  type: 'Category Elimination',
  name: 'Category Elimination',
  description: 'The clue narrows the field so dramatically that deduction works',
  mechanism: 'Provide modifiers that progressively eliminate possibilities: geographic + domain + specific detail = small candidate set the player can reason through, e.g., "Southern Indian + cricketing + state name" → ~5 options, one of which is the answer',
  template: `<backdoor_logic>
  <type>Category Elimination</type>
  <category_modifiers>[List the narrowing modifiers: "Southern Indian", "cricketing", "state with a palindrome-like name"]</category_modifiers>
  <candidate_set_size>[How many plausible options remain: ~3-5]</candidate_set_size>
  <distinguishing_clue>[The detail that picks the right one: "AT AN ANGLE rearranged"]</distinguishing_clue>
  <target_answer>[The actual answer]</target_answer>
  <deduction_path>[Player thinks: "Southern Indian states that play cricket — Tamil Nadu, Karnataka, Kerala, Telangana, Andhra. Which one sounds like 'AT AN ANGLE' scrambled? Telangana!"]</deduction_path>
</backdoor_logic>`,
};
