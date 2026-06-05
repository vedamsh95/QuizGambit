/**
 * Player Persona: Casual Explorer
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 6
 * 
 * A relaxed player who wants to be entertained and learn, not tested.
 * Strong backdoors needed since they may lack domain knowledge.
 */
import type { PersonaConfig } from '../../types';

export const casualExplorer: PersonaConfig = {
  id: 'Casual Explorer',
  mode: 'Solo Practice',
  knowledge: 'General trivia, no domain expertise assumed',
  mood: 'Relaxed, curious afternoon session — wants to be entertained, not tested',
  goal: 'Learn something fascinating without feeling tested or inadequate',
  tone: 'Like a great documentary narrator — informative, warm, surprising, never condescending',
  backdoor_strength: 'strong',
  points_range: [100, 400],
  difficulty_emphasis: 'accessible',
};

export const casualExplorerInjection = `
CURRENT PLAYER CONTEXT:
┌──────────────────────────────────────────┐
│ MODE: Solo Practice                       │
│ PLAYER: Casual Explorer                   │
│ KNOWLEDGE: General trivia, no domain      │
│            expertise assumed              │
│ MOOD: Relaxed, curious afternoon session  │
│ GOAL: Learn something fascinating about   │
│       the topic without feeling tested    │
│ TONE: Like a great documentary narrator   │
│       — informative, warm, surprising     │
│ BACKDOOR: Strong — make sure ANY player   │
│           can figure out the answer       │
│ POINTS: Lean toward 100-300 range         │
└──────────────────────────────────────────┘
`;
