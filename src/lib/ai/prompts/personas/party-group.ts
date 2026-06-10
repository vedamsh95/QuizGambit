/**
 * Player Persona: Party Group
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 6
 * 
 * A group of friends playing together casually. Questions should be conversation-starters,
 * surprising, humorous, and accessible to a mixed-knowledge group.
 */
import type { PersonaConfig } from '../../types';

export const partyGroup: PersonaConfig = {
  id: 'Party Group',
  mode: 'Local Multiplayer / Party Mode',
  knowledge: 'Mixed — some know a lot, some know very little',
  mood: 'Fun, social, laugh-out-loud moments, "did you know?!" reactions',
  goal: 'Create conversation, surprise the group, make everyone feel included',
  tone: 'Playful, surprising, occasionally subversive — like Jackbox Games, not a lecture hall',
  backdoor_strength: 'strong',
  points_range: [100, 300],
  difficulty_emphasis: 'accessible',
};

export const partyGroupInjection = `
CURRENT PLAYER CONTEXT:
┌──────────────────────────────────────────┐
│ MODE: Party Mode / Local Multiplayer      │
│ PLAYER: Party Group (mixed skill levels)  │
│ KNOWLEDGE: Wildly mixed — some experts,   │
│            some complete novices          │
│ MOOD: Fun, social, laughing, sharing      │
│       "did you know?!" moments            │
│ GOAL: Create conversation starters, make  │
│       everyone feel included, spark joy   │
│ TONE: Playful, surprising, like Jackbox   │
│       Games — not a lecture hall          │
│ BACKDOOR: Very strong — questions should  │
│           be answerable by ANYONE through │
│           clever reasoning                │
│ POINTS: Lean 100-300, emphasize fun       │
│         over competition                  │
│ MAX WORD COUNT: Strictly 22 words         │
│ REQUIRED FEATURE: Must spark debate/surprise │
└──────────────────────────────────────────┘
`;
