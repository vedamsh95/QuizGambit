/**
 * Backdoor Type: Contrast Pop
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 5
 * 
 * Mechanism: Clue contrasts the answer with something familiar, making the answer stand out.
 * The player deduces the answer by recognizing what's being contrasted.
 * 
 * Example: "Unlike bony fish..." → sharks stand out because they DON'T have swim bladders (they have oil-rich livers instead)
 */
import type { BackdoorType } from '../../types';

export const contrastPop: {
  type: BackdoorType;
  name: string;
  description: string;
  mechanism: string;
  template: string;
} = {
  type: 'Contrast Pop',
  name: 'Contrast Pop',
  description: 'Clue contrasts the answer with something familiar, making the answer pop out',
  mechanism: 'Set up a contrast: "Unlike X which does Y, what does Z do instead?" — the contrast itself is the backdoor, narrowing the field dramatically',
  template: `<backdoor_logic>
  <type>Contrast Pop</type>
  <familiar_contrast>[What most people know or expect: "bony fish have swim bladders"]</familiar_contrast>
  <surprising_difference>[What's different about the answer: "sharks have no swim bladder, they use an oil-rich liver"]</surprising_difference>
  <target_answer>[The actual answer]</target_answer>
  <deduction_path>[Player thinks: "What fish is known for NOT having what bony fish have? Sharks!"]</deduction_path>
</backdoor_logic>`,
};
