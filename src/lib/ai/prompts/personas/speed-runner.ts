/**
 * Player Persona: Speed Runner
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 6
 * 
 * A player optimizing for speed. Questions should be punchy, fast-resolving,
 * with clear right answers and minimal reading time. Emphasis on quick recall.
 */
import type { PersonaConfig } from '../../types';

export const speedRunner: PersonaConfig = {
  id: 'Speed Runner',
  mode: 'Sprint Mode',
  knowledge: 'Broad but shallow — fast recall favored over deep expertise',
  mood: 'Time-pressured, adrenaline-driven, quick decisions',
  goal: 'Answer as many as possible in limited time, maximize throughput',
  tone: 'Punchy, efficient, high-energy — every millisecond counts',
  backdoor_strength: 'moderate',
  points_range: [100, 400],
  difficulty_emphasis: 'balanced',
};

export const speedRunnerInjection = `
CURRENT PLAYER CONTEXT:
┌──────────────────────────────────────────┐
│ MODE: Sprint Mode (speed-focused)         │
│ PLAYER: Speed Runner                      │
│ KNOWLEDGE: Broad but shallow — fast       │
│            recall > deep expertise        │
│ MOOD: Adrenaline-driven, rapid decisions  │
│ GOAL: Maximize throughput, answer as many │
│       questions as possible               │
│ TONE: Punchy, efficient, high-energy —    │
│       sharp and to the point              │
│ BACKDOOR: Moderate — quick deductions     │
│           welcome but not required        │
│ POINTS: 100-400, shorter questions that   │
│         resolve fast                      │
└──────────────────────────────────────────┘
`;
