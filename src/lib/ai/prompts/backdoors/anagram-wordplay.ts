/**
 * Backdoor Type: Anagram-Wordplay
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 5
 * 
 * Mechanism: The answer is embedded in the clue's text structure as an anagram.
 * The player deduces by rearranging letters from the clue.
 * 
 * Example: "AT AN ANGLE" → rearrange to get TELANGANA
 */
import type { BackdoorType } from '../../types';

export const anagramWordplay: {
  type: BackdoorType;
  name: string;
  description: string;
  mechanism: string;
  template: string;
} = {
  type: 'Anagram-Wordplay',
  name: 'Anagram-Wordplay',
  description: 'The answer is embedded in the clue text as an anagram or wordplay puzzle',
  mechanism: 'Provide a phrase whose letters can be rearranged into the answer. Signal it with words like "scrambling", "rearranging", "mixing up", "jumbling"',
  template: `<backdoor_logic>
  <type>Anagram-Wordplay</type>
  <source_phrase>[The phrase given in the clue: "AT AN ANGLE"]</source_phrase>
  <target_answer>[The rearranged answer: "TELANGANA"]</target_answer>
  <deduction_path>[Player thinks: "Let me rearrange the letters... AT AN ANGLE... TELANGANA! That's a state in India."]</deduction_path>
</backdoor_logic>`,
};
