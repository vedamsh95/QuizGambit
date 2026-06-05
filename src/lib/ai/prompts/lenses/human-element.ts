/**
 * Lens 3: The Human Element
 * Emotional tone: Empathy, drama
 * Question style: Who's the person behind this? The hero, villain, or underdog?
 */
import type { LensPromptFragment } from '../../types';

export const humanElementLens: LensPromptFragment = {
  lens: 'The Human Element',
  emotional_tone: 'Empathy, drama — a human story behind the fact',
  question_style: 'Who is the person? What did they sacrifice, risk, or overcome?',
  hook_pattern: 'Start with a human action or sacrifice: "Refusing to patent his greatest invention...", "Though born into poverty...", "She spent 40 years in obscurity before..."',
  example: 'Refusing to patent his greatest invention and dying nearly penniless, what device did Nikola Tesla believe would provide free energy to the entire world?',
};
