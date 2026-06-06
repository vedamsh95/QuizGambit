/**
 * QuizGambit AI Question Generation — TypeScript Types
 * 
 * Source: AI_QUESTION_UNIFIED_ARCHITECTURE.md Part 8
 * These types encode the 10×5 lens/form matrix, 7 backdoor types,
 * 5 player personas, and the 3-phase XML execution chain.
 */

// ─── Lens Types (10) ────────────────────────────────────────────────
// The 10 conceptual lenses — each answers: "What kind of story are we telling?"

export type LensType =
  | 'Origin Story'         // Wonder, discovery — how did this begin?
  | 'The Unexpected'       // Surprise, shock — what contradicts common belief?
  | 'The Human Element'    // Empathy, drama — who's the person behind this?
  | 'Numbers & Scale'      // Awe, scale — how big/fast/many?
  | 'The Rivalry'          // Tension, drama — what's the conflict?
  | 'The Oddity'           // Amusement, curiosity — what's the weird detail?
  | 'Behind the Scenes'    // Insider-feeling — what's hidden from view?
  | 'The Connection'       // Mind-blown — how does this link unexpectedly?
  | 'What If?'             // Imagination, play — alternative history
  | 'The Legacy';          // Significance, meaning — how did this change everything?

export const ALL_LENSES: LensType[] = [
  'Origin Story', 'The Unexpected', 'The Human Element', 'Numbers & Scale',
  'The Rivalry', 'The Oddity', 'Behind the Scenes', 'The Connection',
  'What If?', 'The Legacy',
];

// ─── Form Types (5) ─────────────────────────────────────────────────
// The 5 syntactic forms — each answers: "How do we structure the first sentence?"

export type FormType =
  | 'Form 1 (Action-First)'         // Dynamic participle: "Pioneering..."
  | 'Form 2 (Parenthetical Hook)'   // Dramatic contrast: "Unlike..."
  | 'Form 3 (Sensory Clue)'         // Color/texture: "Vibrant pink..."
  | 'Form 4 (Active Quote)'         // Iconic phrase: "Mockingly..."
  | 'Form 5 (Direct Narrative)';    // Story-driven: "Scrambling..."

export const ALL_FORMS: FormType[] = [
  'Form 1 (Action-First)',
  'Form 2 (Parenthetical Hook)',
  'Form 3 (Sensory Clue)',
  'Form 4 (Active Quote)',
  'Form 5 (Direct Narrative)',
];

// ─── Backdoor Types (7) ─────────────────────────────────────────────
// The 7 secondary logical pathways that let players deduce the answer

export type BackdoorType =
  | 'Synonym Bridge'         // Descriptive phrase pointing to answer: "leather sphere" → cricket ball
  | 'Contrast Pop'           // Contrast with familiar: "Unlike bony fish..." → sharks
  | 'Everyday Link'          // Connects obscure to daily life: "charred sewing thread" → light bulb
  | 'Anagram-Wordplay'       // Answer embedded in text structure: "At an angle" → TELANGANA
  | 'Sequence Pattern'       // Names/facts form recognizable sequence: "Lee... Harvey..." → Oswald
  | 'Sensory Logic'          // Physical properties lead to answer: "Vibrant pink" → Pink Ball
  | 'Category Elimination';  // Narrows field dramatically: "Southern Indian cricketing state"

export const ALL_BACKDOORS: BackdoorType[] = [
  'Synonym Bridge', 'Contrast Pop', 'Everyday Link',
  'Anagram-Wordplay', 'Sequence Pattern', 'Sensory Logic',
  'Category Elimination',
];

// ─── Player Personas (5) ────────────────────────────────────────────

export type PlayerPersona =
  | 'Casual Explorer'
  | 'Competitive Duelist'
  | 'Party Group'
  | 'Speed Runner'
  | 'Deep Learner';

export const ALL_PERSONAS: PlayerPersona[] = [
  'Casual Explorer', 'Competitive Duelist', 'Party Group',
  'Speed Runner', 'Deep Learner',
];

// ─── Difficulty Tiers (4) ───────────────────────────────────────────

export type DifficultyTier = 'easy' | 'medium' | 'challenging' | 'expert';

// ─── Game Modes ─────────────────────────────────────────────────────

export type GameMode = 'STANDARD' | 'ARENA' | 'LINKS' | 'SPRINT' | 'SOLO' | 'GRID';

// ─── Grid Point Tiers (5) ──────────────────────────────────────────

/** Exact point values for 5×5 grid rows */
export type GridPointTier = 100 | 200 | 300 | 400 | 500;

export const GRID_POINT_VALUES: GridPointTier[] = [100, 200, 300, 400, 500];

/** Maps each grid point tier to its difficulty tier and characteristics */
export const GRID_TIER_CONFIG: Record<GridPointTier, {
  difficulty_tier: DifficultyTier;
  backdoor_strength: 'strong' | 'moderate' | 'subtle';
  description: string;
}> = {
  100: {
    difficulty_tier: 'easy',
    backdoor_strength: 'strong',
    description: 'Accessible entry point — anyone can answer through the backdoor',
  },
  200: {
    difficulty_tier: 'easy',
    backdoor_strength: 'strong',
    description: 'Slightly more specific but still strongly backdoor-accessible',
  },
  300: {
    difficulty_tier: 'medium',
    backdoor_strength: 'moderate',
    description: 'Requires some familiarity — backdoor rewards attentive readers',
  },
  400: {
    difficulty_tier: 'challenging',
    backdoor_strength: 'moderate',
    description: 'Deeper cut — backdoor subtle but present for careful deduction',
  },
  500: {
    difficulty_tier: 'expert',
    backdoor_strength: 'subtle',
    description: 'The capstone — rewards genuine expertise, backdoor is clever and subtle',
  },
};

// ─── Core Question Type ─────────────────────────────────────────────

/** A single fully-generated quiz question */
export interface QuizGambitQuestion {
  lens: LensType;
  form: FormType;
  question_text: string;                   // 1 sentence, aim ~25 words, hard max 30
  answer_text: string;                     // The correct answer
  options: [string, string, string, string]; // Exactly 4, one is correct
  backdoor_type: BackdoorType;
  backdoor_explanation: string;            // How to deduce the answer without prior knowledge
  points: number;                          // 100–500
  difficulty_tier: DifficultyTier;
  tag?: string;                            // 1-2 word thematic hint for betting/intuition grid (grid mode only)
}

// ─── XML Analysis Block Types ───────────────────────────────────────

/** Backdoor logic section within the XML <analysis> block */
export interface BackdoorLogic {
  type: BackdoorType;
  expert_clue: string;       // Words 1-8
  bridge: string;             // Words 9-17
  giveaway: string;           // Words 18-22
  deduction_path: string;     // How a player figures this out without prior knowledge
}

/** Constraint check section within the XML <analysis> block */
export interface ConstraintCheck {
  one_sentence: boolean;
  under_word_limit: boolean;   // hard max 30 words (ideal ~25)
  word_count: number;
  banned_starter_avoided: boolean;
  micro_pyramidal: boolean;
  backdoor_present: boolean;
  backdoor_pathway?: string;
}

/** Per-question analysis extracted from LLM <analysis> XML block */
export interface QuestionAnalysis {
  lens: LensType;
  form: FormType;
  backdoor_type: BackdoorType;
  backdoor_logic: BackdoorLogic;
  constraint_check: ConstraintCheck;
  draft: string;
}

/** The full <diversity_audit> block extracted from LLM output */
export interface DiversityAudit {
  lenses_used: LensType[];
  forms_used: FormType[];
  all_lenses_unique: boolean;
  all_forms_represented: boolean;
  no_consecutive_form_repeats: boolean;
  no_duplicate_grammatical_patterns: boolean;
  difficulty_ramp_valid: boolean;
  issues: string[];
}

// ─── Validation Types ───────────────────────────────────────────────

/** Result of validating a single question's constraints */
export interface ValidationResult {
  valid: boolean;
  failures: string[];
}

/** Parsed generation output from the LLM */
export interface ParsedGeneration {
  analysis: QuestionAnalysis[];
  diversity_audit: DiversityAudit;
  questions: QuizGambitQuestion[];
  raw_output: string;
}

// ─── Solver Agent Types ─────────────────────────────────────────────

/** Result from the blind solver agent */
export interface SolverResult {
  solved_correctly: boolean;
  confidence: number;        // 0–1
  reasoning: string;
  selected_option?: string;
}

// ─── Fact Checker Types ─────────────────────────────────────────────

/** Result from the factual guard */
export interface FactCheckResult {
  all_verified: boolean;
  claims: {
    claim: string;
    verified: boolean;
    correction?: string;
    source?: string;
  }[];
}

// ─── Generation Pipeline Types ──────────────────────────────────────

/** Configuration for a generation run */
export interface GenerationConfig {
  topics: string[];
  questionCount: number;
  persona: PlayerPersona;
  mode: GameMode;
  provider: string;          // 'openai' | 'gemini' | 'groq'
  apiKey: string;
  model: string;
  difficulty?: string;       // Legacy compatibility
  customPrompt?: string;     // Allow admin to inject raw prompt
}

// ─── Custom LLM Parameters ──────────────────────────────────────────

/** Override calibrated LLM defaults for admin-controlled generation */
export interface CustomLLMParams {
  temperature: number;
  presence_penalty: number;
  frequency_penalty: number;
  top_p: number;
}

// ─── Theme Generation Types ───────────────────────────────────────
// The 3D matrix for theme → subtopic generation.
// 6 Types × 5 Domains × 4 Styles = 120 unique subtopic combinations.
// This ensures no two generations of the same theme produce identical subtopics.

/** What kind of topic? (Dimension 1 of the 3D matrix) */
export type TopicType =
  | 'Core'       // The obvious, expected subtopic — sets the baseline
  | 'Niche'      // Specialized deep dive for experts
  | 'Human'      // People, personalities, rivalries, drama
  | 'Surprise'   // Unexpected angle, hidden side, "I never thought of that"
  | 'Scale'      // Mind-bending scope, numbers, extremes
  | 'Mystery';   // Unsolved, controversial, debated, "we still don't know"

export const ALL_TOPIC_TYPES: TopicType[] = [
  'Core', 'Niche', 'Human', 'Surprise', 'Scale', 'Mystery',
];

/** What kind of knowledge? (Dimension 2 of the 3D matrix) */
export type KnowledgeDomain =
  | 'Facts'        // Concrete facts, definitions, names, dates
  | 'Stories'      // Narratives, drama, context, "the real story behind..."
  | 'Concepts'     // Abstract ideas, theories, patterns, "why things happen"
  | 'Data'         // Numbers, statistics, records, comparisons
  | 'Connections'; // Links between ideas, "how X changed Y"

export const ALL_KNOWLEDGE_DOMAINS: KnowledgeDomain[] = [
  'Facts', 'Stories', 'Concepts', 'Data', 'Connections',
];

/** How will it play on the board? (Dimension 3 of the 3D matrix) */
export type QuizStyle =
  | 'Classic'   // Straightforward Q&A, standard trivia
  | 'Trick'     // Common misconceptions busted, "bet you thought..."
  | 'Visual'    // Imagery-rich, descriptive, sensory details
  | 'Timeline'; // Chronological sequence, "before and after"

export const ALL_QUIZ_STYLES: QuizStyle[] = [
  'Classic', 'Trick', 'Visual', 'Timeline',
];

/** A single subtopic generated from a theme */
export interface ThemeSubtopic {
  name: string;              // The subtopic name, e.g. "Quantum Biology"
  type: TopicType;           // Which of the 6 Types
  domain: KnowledgeDomain;   // Which of the 5 Domains
  style: QuizStyle;          // Which of the 4 Styles
}

/** Result from theme → subtopics generation */
export interface ThemeGenerationResult {
  theme: string;                 // The original theme input, e.g. "Science"
  subtopics: ThemeSubtopic[];    // Always 5 subtopics
}

// ─── Compact Generator Config ───────────────────────────────────────

/** Configuration for the user-facing compact generator */
export interface CompactGeneratorConfig {
  topics: string[];
  personas: PlayerPersona[];   // multi-select, randomly assigned per topic
  provider: string;
  apiKey: string;
  model: string;
  selectedLenses?: LensType[];        // if omitted, uses ALL_LENSES
  selectedForms?: FormType[];          // if omitted, uses ALL_FORMS
  selectedBackdoors?: BackdoorType[];  // if omitted, uses ALL_BACKDOORS
  /** Themed mode: the theme name that generated these topics */
  theme?: string;
  /** Themed mode: the 3D matrix metadata for each subtopic (used for saving tags) */
  subtopics?: ThemeSubtopic[];
}

// ─── Admin Generator Config ─────────────────────────────────────────

/** Configuration for the admin advanced forge — full surgical control */
export interface AdminGeneratorConfig extends GenerationConfig {
  selectedLenses: LensType[];
  selectedForms: FormType[];
  selectedBackdoors: BackdoorType[];
  personas: PlayerPersona[];          // multi-select, randomly assigned
  customLLMParams?: CustomLLMParams;  // if omitted, uses CALIBRATED_PARAMS
  runSolver?: boolean;                // auto-run solver after generation
  runFactCheck?: boolean;             // auto-run fact-check after generation
}

/** Per-question fix instruction for regeneration */
export interface RegenerationInstruction {
  question_index: number;
  failures: string[];
  previous_lens: LensType;
  previous_form: FormType;
}

/** The overall result from a full generation run */
export interface GenerationResult {
  questions: QuizGambitQuestion[];
  analysis: QuestionAnalysis[];
  audit: DiversityAudit;
  solver_results?: SolverResult[];
  fact_check?: FactCheckResult;
  regenerations: number;
  total_api_calls: number;
}

// ─── Persona Configuration ──────────────────────────────────────────

/** Full persona definition used for context injection */
export interface PersonaConfig {
  id: PlayerPersona;
  mode: string;
  knowledge: string;
  mood: string;
  goal: string;
  tone: string;
  backdoor_strength: 'strong' | 'moderate' | 'subtle';
  points_range: [number, number];  // [min, max] typical points
  difficulty_emphasis: 'accessible' | 'balanced' | 'challenging';
}

// ─── Lens Prompt Fragment ───────────────────────────────────────────

export interface LensPromptFragment {
  lens: LensType;
  emotional_tone: string;
  question_style: string;
  hook_pattern: string;
  example: string;
}

// ─── Form Blueprint ─────────────────────────────────────────────────

export interface FormBlueprint {
  form: FormType;
  pattern: string;
  structure: string;          // Word 1-4 / 5-12 / 13-17 / 18-22 breakdown
  example: string;
  best_lens_pairings: LensType[];
}

// ─── Banned Sentence Starters ───────────────────────────────────────

export const BANNED_STARTERS = [
  'which', 'what', 'who', 'where', 'when',
  'name the', 'identify the', 'how many',
  'in what year', 'what year',
];

/**
 * Check if a question text starts with any banned starter.
 * Case-insensitive check.
 */
export function hasBannedStarter(questionText: string): boolean {
  const lower = questionText.trim().toLowerCase();
  return BANNED_STARTERS.some(starter => lower.startsWith(starter));
}

/**
 * Count words in a string. Handles hyphenated words and contractions.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Check if text is a single sentence.
 * Allows abbreviations (Dr., Mr., St., U.S., etc.) and decimal numbers.
 */
export function isSingleSentence(text: string): boolean {
  const trimmed = text.trim();
  // Must end with ? or . or !
  if (!/[.?!]$/.test(trimmed)) return false;
  // Remove trailing punctuation
  const withoutLast = trimmed.slice(0, -1);
  // Temporarily mask common abbreviations and decimal numbers before checking for mid-sentence stops
  const masked = withoutLast
    .replace(/\b(Dr|Mr|Mrs|Ms|St|Prof|Capt|Col|Gen|Lt|Sgt|Maj|Gov|Sen|Rep|Rev)\./gi, '$1<ABBR>')
    .replace(/\b([A-Z])\./g, '$1<INIT>')
    .replace(/\d+\.\d+/g, '<DEC>');
  return !/[.?!]/.test(masked);
}

/**
 * Compute proportional word ranges for micro-pyramidal pacing check.
 * Uses ~40% / ~40% / ~20% proportions (opening hook / bridge / giveaway).
 * Note: this is a rough proxy; micro-pyramidal is a SHOULD, not a MUST.
 */
export function getWordRanges(text: string): [string, string, string] {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const total = words.length;
  const split1 = Math.round(total * 0.40);
  const split2 = Math.round(total * 0.80);
  const range1 = words.slice(0, split1).join(' ');
  const range2 = words.slice(split1, split2).join(' ');
  const range3 = words.slice(split2).join(' ');
  return [range1, range2, range3];
}
