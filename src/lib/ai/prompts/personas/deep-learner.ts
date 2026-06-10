/**
 * Player Persona: Deep Learner
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 6
 * 
 * A player who wants to deeply understand a subject. Questions should build
 * a learning arc with rich explanations and connected concepts.
 */
import type { PersonaConfig } from '../../types';

export const deepLearner: PersonaConfig = {
  id: 'Deep Learner',
  mode: 'Solo Practice / Study Mode',
  knowledge: 'Curious, willing to invest time — playing to build genuine understanding',
  mood: 'Focused, studious, intellectually hungry — the joy is in the learning',
  goal: 'Achieve genuine understanding, connect concepts, build a mental model',
  tone: 'Thoughtful, thorough, connected — questions should form a coherent narrative arc',
  backdoor_strength: 'moderate',
  points_range: [200, 500],
  difficulty_emphasis: 'challenging',
};

export const deepLearnerInjection = `
CURRENT PLAYER CONTEXT:
┌──────────────────────────────────────────┐
│ MODE: Solo Study / Learning Mode          │
│ PLAYER: Deep Learner                      │
│ KNOWLEDGE: Curious, willing to invest     │
│            time — here to understand      │
│ MOOD: Focused, studious, intellectually   │
│       hungry                              │
│ GOAL: Build genuine understanding,        │
│       connect concepts, build mental map  │
│ TONE: Thoughtful, thorough — questions    │
│       should form a coherent learning arc │
│ BACKDOOR: Moderate — reward connecting    │
│           concepts and building on        │
│           previous questions              │
│ POINTS: 200-500, emphasis on the          │
│         difficulty of connecting concepts │
│ MAX WORD COUNT: Strictly 28 words         │
│ REQUIRED FEATURE: Must teach something    │
└──────────────────────────────────────────┘
`;
