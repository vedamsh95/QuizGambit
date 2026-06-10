/**
 * Player Persona: Competitive Duelist
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 6
 * 
 * A player in head-to-head competition who wants to prove their expertise.
 * Deeper cuts allowed, subtler backdoors, rewarding genuine knowledge.
 */
import type { PersonaConfig } from '../../types';

export const competitiveDuelist: PersonaConfig = {
  id: 'Competitive Duelist',
  mode: 'Arena PvP / Duel',
  knowledge: 'Claims expertise in this domain — deeper cuts are welcome',
  mood: 'Focused, competitive, wants to prove they know more than their opponent',
  goal: 'Win through genuine knowledge — no cheap questions, reward real expertise',
  tone: 'Tense, high-stakes, intellectual — every question should feel like a worthy challenge',
  backdoor_strength: 'subtle',
  points_range: [100, 500],
  difficulty_emphasis: 'challenging',
};

export const competitiveDuelistInjection = `
CURRENT PLAYER CONTEXT:
┌──────────────────────────────────────────┐
│ MODE: Arena PvP / Head-to-Head Duel      │
│ PLAYER: Competitive Duelist              │
│ KNOWLEDGE: Claims expertise, expects      │
│            genuine challenges             │
│ MOOD: Focused, competitive, high stakes   │
│ GOAL: Win, prove knowledge, earn          │
│       bragging rights                     │
│ TONE: Tense, intellectual — questions     │
│       should feel like worthy challenges  │
│ BACKDOOR: Subtle — expert should feel     │
│           the advantage of knowing        │
│ POINTS: Full 100-500 range with           │
│         steeper difficulty curve          │
│ MAX WORD COUNT: Strictly 25 words         │
│ REQUIRED FEATURE: Must have genuine depth │
└──────────────────────────────────────────┘
`;
