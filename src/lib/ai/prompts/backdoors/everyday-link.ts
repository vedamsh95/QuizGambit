/**
 * Backdoor Type: Everyday Link
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 5
 * 
 * Mechanism: Connects the obscure fact to something from daily life.
 * The player deduces the answer by bridging the obscure detail with common experience.
 * 
 * Example: "A charred piece of sewing thread" → anyone who's seen a light bulb filament can connect it to Edison's invention
 */
import type { BackdoorType } from '../../types';

export const everydayLink: {
  type: BackdoorType;
  name: string;
  description: string;
  mechanism: string;
  template: string;
} = {
  type: 'Everyday Link',
  name: 'Everyday Link',
  description: 'Connects the obscure fact to something from daily life',
  mechanism: 'Take an obscure historical or scientific detail and describe it using everyday objects or experiences: "a charred sewing thread" → light bulb filament, "a dented can of beans" → first tin can opener',
  template: `<backdoor_logic>
  <type>Everyday Link</type>
  <obscure_fact>[The technical or historical detail: "carbonized bamboo filament"]</obscure_fact>
  <everyday_bridge>[The everyday description: "a charred piece of sewing thread"]</everyday_bridge>
  <target_answer>[The actual answer]</target_answer>
  <deduction_path>[Player thinks: "What everyday object uses a piece of charred thread that glows? A light bulb!"]</deduction_path>
</backdoor_logic>`,
};
