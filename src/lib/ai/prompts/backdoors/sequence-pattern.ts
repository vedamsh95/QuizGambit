/**
 * Backdoor Type: Sequence Pattern
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 5
 * 
 * Mechanism: Names or facts in the clue form a recognizable sequence that points to the answer.
 * The player deduces by recognizing the pattern across items.
 * 
 * Example: "Lee... Harvey..." → Oswald (completing the "Lee Harvey Oswald" pattern)
 */
import type { BackdoorType } from '../../types';

export const sequencePattern: {
  type: BackdoorType;
  name: string;
  description: string;
  mechanism: string;
  template: string;
} = {
  type: 'Sequence Pattern',
  name: 'Sequence Pattern',
  description: 'Names or facts in the clue form a recognizable sequence that points to the answer',
  mechanism: 'Present partial elements of a known sequence, pair, or group. The player completes the pattern by recognizing what belongs: "Lee, Harvey..." → Oswald; "Earth, Wind..." → Fire; "Snap, Crackle..." → Pop',
  template: `<backdoor_logic>
  <type>Sequence Pattern</type>
  <sequence_given>[The partial sequence in the clue: "Lee, Harvey"]</sequence_given>
  <pattern_type>[What kind of pattern: completion / pairing / famous trio / chronological order]</pattern_type>
  <target_answer>[The completing element: "Oswald"]</target_answer>
  <deduction_path>[Player thinks: "Lee, Harvey... that's Lee Harvey Oswald. It's Oswald!"]</deduction_path>
</backdoor_logic>`,
};
