/**
 * QuizGambit AI Module — Barrel Export
 * 
 * This is the public API for the unified prompt engineering system.
 * Import from here instead of individual files.
 */

// ─── Types ──────────────────────────────────────────────────────────
export type {
  LensType,
  FormType,
  BackdoorType,
  PlayerPersona,
  DifficultyTier,
  GameMode,
  GridPointTier,
  QuizGambitQuestion,
  QuestionAnalysis,
  BackdoorLogic,
  ConstraintCheck,
  DiversityAudit,
  ValidationResult,
  ParsedGeneration,
  SolverResult,
  FactCheckResult,
  GenerationConfig,
  GenerationResult,
  RegenerationInstruction,
  PersonaConfig,
  LensPromptFragment,
  FormBlueprint,
  CustomLLMParams,
  CompactGeneratorConfig,
  AdminGeneratorConfig,
} from './types';

export {
  ALL_LENSES,
  ALL_FORMS,
  ALL_BACKDOORS,
  ALL_PERSONAS,
  BANNED_STARTERS,
  GRID_POINT_VALUES,
  GRID_TIER_CONFIG,
  hasBannedStarter,
  countWords,
  isSingleSentence,
  getWordRanges,
} from './types';

// ─── Prompt Building ────────────────────────────────────────────────
export { buildSystemPrompt, buildGridSystemPrompt, buildCustomSystemPrompt } from './prompts/system';

// ─── Persona Injections ─────────────────────────────────────────────
export { casualExplorerInjection } from './prompts/personas/casual-explorer';
export { competitiveDuelistInjection } from './prompts/personas/competitive-duelist';
export { partyGroupInjection } from './prompts/personas/party-group';
export { speedRunnerInjection } from './prompts/personas/speed-runner';
export { deepLearnerInjection } from './prompts/personas/deep-learner';

// ─── Lens Templates ─────────────────────────────────────────────────
export { originStoryLens } from './prompts/lenses/origin-story';
export { theUnexpectedLens } from './prompts/lenses/the-unexpected';
export { humanElementLens } from './prompts/lenses/human-element';
export { numbersScaleLens } from './prompts/lenses/numbers-scale';
export { theRivalryLens } from './prompts/lenses/the-rivalry';
export { theOddityLens } from './prompts/lenses/the-oddity';
export { behindTheScenesLens } from './prompts/lenses/behind-the-scenes';
export { theConnectionLens } from './prompts/lenses/the-connection';
export { whatIfLens } from './prompts/lenses/what-if';
export { theLegacyLens } from './prompts/lenses/the-legacy';

// ─── Form Blueprints ────────────────────────────────────────────────
export { actionFirstForm } from './prompts/forms/action-first';
export { parentheticalHookForm } from './prompts/forms/parenthetical-hook';
export { sensoryClueForm } from './prompts/forms/sensory-clue';
export { activeQuoteForm } from './prompts/forms/active-quote';
export { directNarrativeForm } from './prompts/forms/direct-narrative';

// ─── Backdoor Templates ─────────────────────────────────────────────
export { synonymBridge } from './prompts/backdoors/synonym-bridge';
export { contrastPop } from './prompts/backdoors/contrast-pop';
export { everydayLink } from './prompts/backdoors/everyday-link';
export { anagramWordplay } from './prompts/backdoors/anagram-wordplay';
export { sequencePattern } from './prompts/backdoors/sequence-pattern';
export { sensoryLogic } from './prompts/backdoors/sensory-logic';
export { categoryElimination } from './prompts/backdoors/category-elimination';

// ─── Generation Pipeline ────────────────────────────────────────────
export {
  generateQuestions,
  generateGridQuestions,
  generateCustomQuestions,
  assembleContext,
  assembleGridContext,
  assembleCustomContext,
  callLLM,
  parseAndValidate,
  identifyFailures,
  buildRegenerationPrompt,
  runQualityChecks,
  CALIBRATED_PARAMS,
} from './generator';

// ─── Parser & Validator ─────────────────────────────────────────────
export {

  validateQuestion,
  validateAllQuestions,


} from './parser';

// ─── Diversity Auditor ──────────────────────────────────────────────
export {
  auditDiversity,
  suggestAssignments,
  formatAuditReport,
} from './auditor';

// ─── Solver Agent ───────────────────────────────────────────────────
export {
  solveQuestion,
  solveQuestionBatch,
  summarizeSolverResults,
} from './solver';
export type { SolverCallConfig } from './solver';

// ─── Fact Checker ───────────────────────────────────────────────────
export {
  verifyQuestion,
  verifyQuestionBatch,
  summarizeFactChecks,
} from './fact-checker';
export type { FactCheckerCallConfig } from './fact-checker';

// ─── Entry Points (public API from ai.ts) ───────────────────────────
// These are the main functions UI components should call.
// They re-export from ../ai.ts but the barrel keeps everything in one place.
export {
  generateCompactQuizQuestions,
  generateAdminQuizQuestions,
  generateGridQuizQuestions,
  generateQuizQuestionsV2,
  reverifyQuestion,
  v2ToLegacyFormat,
} from '../ai';
export type { AIConfig } from '../ai';
