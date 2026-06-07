/**
 * Smart Matcher 2.0 — Quality-first scoring across ALL dimensions.
 * 
 * Scores lenses, forms, backdoors, AND personas with quality weights.
 * Soft diminishing returns instead of hard bans.
 * Quality can override repetition — great combos CAN repeat.
 * 
 * Usage:
 *   import { recommendFullLoadout, recommendFocusedLens, scoreAndSelectLoadout } from './smart_matcher';
 */

import {
  LensType, FormType, BackdoorType, PlayerPersona,
  ALL_LENSES, ALL_FORMS, ALL_BACKDOORS, ALL_PERSONAS,
} from '../../src/lib/ai/types.js';

// ═══════════════════════════════════════════════════════════════════
// LENS REGISTRY (unchanged — already quality-scored)
// ═══════════════════════════════════════════════════════════════════

export interface LensConfig {
  lens: LensType;
  funScore: number;
  addictionScore: number;
  answerability: number;
  bestDomains: string[];
  magnetExample: string;
}

export const LENS_REGISTRY: Record<LensType, LensConfig> = {
  'Origin Story': {
    lens: 'Origin Story', funScore: 7, addictionScore: 7, answerability: 8,
    bestDomains: ['history', 'brands', 'food', 'inventions', 'business'],
    magnetExample: 'How the microwave was accidentally invented thanks to a melted peanut cluster bar in a radar lab.'
  },
  'The Unexpected': {
    lens: 'The Unexpected', funScore: 9, addictionScore: 9, answerability: 7,
    bestDomains: ['science', 'nature', 'geography', 'medicine', 'space'],
    magnetExample: 'Why strawberries are not technically berries, but bananas and watermelons are.'
  },
  'The Human Element': {
    lens: 'The Human Element', funScore: 8, addictionScore: 8, answerability: 9,
    bestDomains: ['history', 'sports', 'art', 'music', 'literature'],
    magnetExample: 'The insane 12,000-calorie daily diet Michael Phelps ate during the 2008 Beijing Olympics.'
  },
  'Numbers & Scale': {
    lens: 'Numbers & Scale', funScore: 7, addictionScore: 6, answerability: 6,
    bestDomains: ['space', 'astronomy', 'economics', 'geography', 'tech'],
    magnetExample: 'If you could fold a standard piece of paper 42 times, it would reach the moon.'
  },
  'The Rivalry': {
    lens: 'The Rivalry', funScore: 9, addictionScore: 8, answerability: 8,
    bestDomains: ['sports', 'business', 'politics', 'tech', 'art'],
    magnetExample: 'How the ferocious Coke vs. Pepsi war pushed both companies to launch soda cans into space.'
  },
  'The Oddity': {
    lens: 'The Oddity', funScore: 10, addictionScore: 9, answerability: 7,
    bestDomains: ['nature', 'animals', 'history', 'law', 'culture'],
    magnetExample: 'How wombats produce perfectly cube-shaped poop to mark their territory without it rolling away.'
  },
  'Behind the Scenes': {
    lens: 'Behind the Scenes', funScore: 8, addictionScore: 8, answerability: 7,
    bestDomains: ['movies', 'music', 'video games', 'politics', 'theater'],
    magnetExample: 'The terrifying roar of the T-Rex in Jurassic Park was a mix of baby elephants, tigers, and alligators.'
  },
  'The Connection': {
    lens: 'The Connection', funScore: 9, addictionScore: 9, answerability: 6,
    bestDomains: ['science', 'history', 'language', 'pop culture'],
    magnetExample: 'How the invention of the printing press directly led to the mass production of reading glasses.'
  },
  'What If?': {
    lens: 'What If?', funScore: 8, addictionScore: 7, answerability: 5,
    bestDomains: ['history', 'geopolitics', 'science', 'sports'],
    magnetExample: 'What the global climate would look like if Doggerland had never sunk beneath the North Sea.'
  },
  'The Legacy': {
    lens: 'The Legacy', funScore: 6, addictionScore: 6, answerability: 9,
    bestDomains: ['history', 'biography', 'tech', 'literature'],
    magnetExample: 'How Alexander the Great\'s conquests established trade routes that still dictate Middle Eastern borders.'
  },
  'The Butterfly Effect': {
    lens: 'The Butterfly Effect', funScore: 9, addictionScore: 10, answerability: 7,
    bestDomains: ['history', 'politics', 'science', 'everyday life'],
    magnetExample: 'How a driver taking a single wrong turn in Sarajevo inadvertently sparked World War I.'
  },
  'The Evolution': {
    lens: 'The Evolution', funScore: 7, addictionScore: 7, answerability: 8,
    bestDomains: ['biology', 'tech', 'fashion', 'language', 'architecture'],
    magnetExample: 'How high heels were originally designed for Persian cavalrymen, not women.'
  },
  'The Cultural Impact': {
    lens: 'The Cultural Impact', funScore: 8, addictionScore: 7, answerability: 9,
    bestDomains: ['pop culture', 'internet', 'music', 'food', 'media'],
    magnetExample: 'How the summer release of Jaws single-handedly created the modern Hollywood "Blockbuster."'
  },
};

// ═══════════════════════════════════════════════════════════════════
// FORM REGISTRY — quality scores for all 10 forms
// ═══════════════════════════════════════════════════════════════════

export interface FormConfig {
  form: FormType;
  qualityScore: number;      // 1-10: how crisp/effective this form is
  readabilityScore: number;  // 1-10: how easy to parse immediately
  varietyPotential: number;  // 1-10: how much variety within this one form
  bestPairedLenses: LensType[];
  emotionalTone: string;
  example: string;
}

export const FORM_REGISTRY: Record<FormType, FormConfig> = {
  'Form 1 (Action-First)': {
    form: 'Form 1 (Action-First)',
    qualityScore: 8, readabilityScore: 9, varietyPotential: 7,
    bestPairedLenses: ['The Human Element', 'The Rivalry', 'Origin Story'],
    emotionalTone: 'energetic, immediate, bold',
    example: '"Defying gravity, this athlete cleared 8.95m in a single bound..."',
  },
  'Form 2 (Parenthetical Hook)': {
    form: 'Form 2 (Parenthetical Hook)',
    qualityScore: 9, readabilityScore: 8, varietyPotential: 8,
    bestPairedLenses: ['The Unexpected', 'The Oddity', 'The Rivalry', 'Behind the Scenes'],
    emotionalTone: 'curious, surprising, "wait, what?"',
    example: '"Unlike every other mammal, this creature lays eggs and detects electricity..."',
  },
  'Form 3 (Sensory Clue)': {
    form: 'Form 3 (Sensory Clue)',
    qualityScore: 8, readabilityScore: 9, varietyPotential: 6,
    bestPairedLenses: ['Numbers & Scale', 'The Oddity', 'What If?'],
    emotionalTone: 'vivid, immersive, visual',
    example: '"Vibrant crimson with a metallic sheen, this mineral has been prized since antiquity..."',
  },
  'Form 4 (Active Quote)': {
    form: 'Form 4 (Active Quote)',
    qualityScore: 9, readabilityScore: 8, varietyPotential: 7,
    bestPairedLenses: ['The Human Element', 'The Rivalry', 'The Cultural Impact'],
    emotionalTone: 'dramatic, personal, iconic',
    example: '"I have a dream," declared this leader from the steps of the Lincoln Memorial..."',
  },
  'Form 5 (Direct Narrative)': {
    form: 'Form 5 (Direct Narrative)',
    qualityScore: 8, readabilityScore: 10, varietyPotential: 9,
    bestPairedLenses: ['Origin Story', 'The Human Element', 'The Legacy', 'Behind the Scenes', 'The Evolution'],
    emotionalTone: 'storytelling, flowing, accessible',
    example: '"In 1928, a moldy petri dish in Alexander Fleming\'s lab changed medicine forever..."',
  },
  'Form 6 (The Contradiction)': {
    form: 'Form 6 (The Contradiction)',
    qualityScore: 9, readabilityScore: 7, varietyPotential: 8,
    bestPairedLenses: ['The Unexpected', 'The Rivalry', 'The Connection', 'The Butterfly Effect', 'The Evolution'],
    emotionalTone: 'mind-bending, provocative, "no way"',
    example: '"Despite having no vocal cords, this fish produces sounds louder than a rock concert..."',
  },
  'Form 7 (The Question Lead)': {
    form: 'Form 7 (The Question Lead)',
    qualityScore: 7, readabilityScore: 9, varietyPotential: 7,
    bestPairedLenses: ['What If?', 'The Connection', 'Numbers & Scale'],
    emotionalTone: 'inquisitive, playful, "let me think"',
    example: '"What happens when you heat a diamond to 763°C in pure oxygen? It doesn\'t melt..."',
  },
  'Form 8 (The Timeline)': {
    form: 'Form 8 (The Timeline)',
    qualityScore: 8, readabilityScore: 8, varietyPotential: 8,
    bestPairedLenses: ['Origin Story', 'The Legacy', 'The Butterfly Effect', 'The Evolution', 'Behind the Scenes'],
    emotionalTone: 'chronological, "how it unfolded", epic',
    example: '"First theorized in 1915, confirmed in 2016, this phenomenon took 101 years to prove..."',
  },
  'Form 9 (The Misdirection)': {
    form: 'Form 9 (The Misdirection)',
    qualityScore: 8, readabilityScore: 7, varietyPotential: 6,
    bestPairedLenses: ['The Oddity', 'The Unexpected'],
    emotionalTone: 'playful, deceptive, "gotcha!"',
    example: '"It sounds like a medieval torture device, but this kitchen tool is found in every home..."',
  },
  'Form 10 (Defining Trait)': {
    form: 'Form 10 (Defining Trait)',
    qualityScore: 7, readabilityScore: 8, varietyPotential: 6,
    bestPairedLenses: ['Numbers & Scale', 'The Legacy', 'The Cultural Impact'],
    emotionalTone: 'descriptive, definitive, "here\'s what matters"',
    example: '"Nocturnal, solitary, and capable of rotating its head 270 degrees, this bird..."',
  },
};

// ═══════════════════════════════════════════════════════════════════
// BACKDOOR REGISTRY — quality scores for all 10 backdoors
// ═══════════════════════════════════════════════════════════════════

export interface BackdoorConfig {
  backdoor: BackdoorType;
  qualityScore: number;        // 1-10: how effective this backdoor is
  funScore: number;            // 1-10: how satisfying the "aha!" moment is
  answerabilityBoost: number;  // 1-10: how much it helps someone with zero domain knowledge
  bestPairedForms: FormType[];
  cognitiveStyle: string;
}

export const BACKDOOR_REGISTRY: Record<BackdoorType, BackdoorConfig> = {
  'Synonym Bridge': {
    backdoor: 'Synonym Bridge',
    qualityScore: 8, funScore: 7, answerabilityBoost: 8,
    bestPairedForms: ['Form 3 (Sensory Clue)', 'Form 10 (Defining Trait)', 'Form 8 (The Timeline)', 'Form 1 (Action-First)'],
    cognitiveStyle: 'vocabulary / rephrasing',
  },
  'Contrast Pop': {
    backdoor: 'Contrast Pop',
    qualityScore: 9, funScore: 9, answerabilityBoost: 7,
    bestPairedForms: ['Form 2 (Parenthetical Hook)', 'Form 6 (The Contradiction)', 'Form 9 (The Misdirection)'],
    cognitiveStyle: 'comparison / elimination',
  },
  'Everyday Link': {
    backdoor: 'Everyday Link',
    qualityScore: 8, funScore: 8, answerabilityBoost: 10,
    bestPairedForms: ['Form 5 (Direct Narrative)', 'Form 1 (Action-First)', 'Form 7 (The Question Lead)'],
    cognitiveStyle: 'real-world connection',
  },
  'Anagram-Wordplay': {
    backdoor: 'Anagram-Wordplay',
    qualityScore: 6, funScore: 9, answerabilityBoost: 4,
    bestPairedForms: ['Form 7 (The Question Lead)', 'Form 9 (The Misdirection)'],
    cognitiveStyle: 'pattern recognition / wordplay',
  },
  'Sequence Pattern': {
    backdoor: 'Sequence Pattern',
    qualityScore: 8, funScore: 7, answerabilityBoost: 7,
    bestPairedForms: ['Form 5 (Direct Narrative)', 'Form 8 (The Timeline)', 'Form 4 (Active Quote)'],
    cognitiveStyle: 'logical progression / ordering',
  },
  'Sensory Logic': {
    backdoor: 'Sensory Logic',
    qualityScore: 8, funScore: 8, answerabilityBoost: 7,
    bestPairedForms: ['Form 3 (Sensory Clue)', 'Form 10 (Defining Trait)'],
    cognitiveStyle: 'sensory intuition / physical properties',
  },
  'Category Elimination': {
    backdoor: 'Category Elimination',
    qualityScore: 7, funScore: 6, answerabilityBoost: 9,
    bestPairedForms: ['Form 2 (Parenthetical Hook)', 'Form 6 (The Contradiction)', 'Form 10 (Defining Trait)'],
    cognitiveStyle: 'logical filtering / narrowing',
  },
  'Etymology / Name Logic': {
    backdoor: 'Etymology / Name Logic',
    qualityScore: 8, funScore: 8, answerabilityBoost: 6,
    bestPairedForms: ['Form 5 (Direct Narrative)', 'Form 8 (The Timeline)', 'Form 4 (Active Quote)'],
    cognitiveStyle: 'language / word origin',
  },
  'Functional Logic': {
    backdoor: 'Functional Logic',
    qualityScore: 9, funScore: 8, answerabilityBoost: 7,
    bestPairedForms: ['Form 6 (The Contradiction)', 'Form 2 (Parenthetical Hook)', 'Form 9 (The Misdirection)'],
    cognitiveStyle: 'cause-and-effect / how things work',
  },
  'Pop Culture Hook': {
    backdoor: 'Pop Culture Hook',
    qualityScore: 7, funScore: 10, answerabilityBoost: 8,
    bestPairedForms: ['Form 4 (Active Quote)', 'Form 1 (Action-First)', 'Form 7 (The Question Lead)'],
    cognitiveStyle: 'cultural memory / reference recognition',
  },
};

// ═══════════════════════════════════════════════════════════════════
// PERSONA REGISTRY — quality scores for all 5 personas
// ═══════════════════════════════════════════════════════════════════

export interface PersonaConfigExtended {
  persona: PlayerPersona;
  qualityScore: number;
  funScore: number;
  answerabilityFocus: number;
  bestPairedLenses: LensType[];
  bestPairedBackdoors: BackdoorType[];
  difficultyBias: 'easier' | 'neutral' | 'harder';
  vibe: string;
}

export const PERSONA_REGISTRY: Record<PlayerPersona, PersonaConfigExtended> = {
  'Casual Explorer': {
    persona: 'Casual Explorer',
    qualityScore: 8, funScore: 8, answerabilityFocus: 10,
    bestPairedLenses: ['Origin Story', 'The Human Element'],
    bestPairedBackdoors: ['Everyday Link', 'Synonym Bridge'],
    difficultyBias: 'easier',
    vibe: 'warm, welcoming, "anyone can play"',
  },
  'Competitive Duelist': {
    persona: 'Competitive Duelist',
    qualityScore: 8, funScore: 7, answerabilityFocus: 5,
    bestPairedLenses: ['The Rivalry', 'Numbers & Scale'],
    bestPairedBackdoors: ['Sequence Pattern', 'Contrast Pop'],
    difficultyBias: 'harder',
    vibe: 'intense, strategic, "prove yourself"',
  },
  'Party Group': {
    persona: 'Party Group',
    qualityScore: 9, funScore: 10, answerabilityFocus: 8,
    bestPairedLenses: ['The Oddity', 'The Unexpected'],
    bestPairedBackdoors: ['Pop Culture Hook', 'Anagram-Wordplay'],
    difficultyBias: 'neutral',
    vibe: 'playful, social, "laugh out loud"',
  },
  'Speed Runner': {
    persona: 'Speed Runner',
    qualityScore: 7, funScore: 7, answerabilityFocus: 6,
    bestPairedLenses: ['Numbers & Scale'],
    bestPairedBackdoors: ['Category Elimination', 'Functional Logic'],
    difficultyBias: 'neutral',
    vibe: 'fast, snappy, "blink and you miss it"',
  },
  'Deep Learner': {
    persona: 'Deep Learner',
    qualityScore: 9, funScore: 7, answerabilityFocus: 4,
    bestPairedLenses: ['Behind the Scenes', 'The Evolution', 'The Connection'],
    bestPairedBackdoors: ['Functional Logic', 'Etymology / Name Logic'],
    difficultyBias: 'harder',
    vibe: 'curious, deep, "I want to learn something"',
  },
};

// ═══════════════════════════════════════════════════════════════════
// SCORING CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** Soft diminishing return — quality can override this */
const REPEAT_PENALTY = -1.5;   // was -5 (too aggressive)

/** Base quality weights for composite scoring */
const QUALITY_BASE = 0.35;     // raw quality score
const FUN_BASE = 0.30;         // fun/addiction
const ANSWERABILITY_BASE = 0.20; // accessibility
const SYNERGY_BASE = 0.15;     // domain/form compatibility

/** Bonus for matching the domain */
const DOMAIN_MATCH_BONUS = 2.5;

/** Bonus for matching lens↔form or form↔backdoor */
const PAIRING_BONUS = 3.0;

/** Random noise range to break ties */
const NOISE_RANGE = 1.0;

// ═══════════════════════════════════════════════════════════════════
// UNIFIED FULL LOADOUT RECOMMENDER
// ═══════════════════════════════════════════════════════════════════

export interface FullLoadoutRecommendation {
  lens: LensType;
  form: FormType;
  backdoor: BackdoorType;
  persona: PlayerPersona;
  score: number;
  breakdown: {
    lensQuality: number;
    formQuality: number;
    backdoorQuality: number;
    personaBonus: number;
    synergy: number;
    repeatPenalty: number;
  };
  explanation: string;
}

export interface LoadoutRequest {
  domain: string;
  dbLensStats: Record<LensType, number>;
  dbFormStats: Record<FormType, number>;
  dbBackdoorStats: Record<BackdoorType, number>;
  recentlyUsed: {
    lenses: LensType[];
    forms: FormType[];
    backdoors: BackdoorType[];
  };
}

/**
 * Recommend the top-N full loadouts (lens + form + backdoor + persona)
 * for a focused topic. Scores ALL 4 dimensions together using quality-first,
 * soft-constraint scoring.
 */
export function recommendFullLoadout(
  request: LoadoutRequest,
  topN: number = 5,
): FullLoadoutRecommendation[] {
  const { domain, dbLensStats, dbFormStats, dbBackdoorStats, recentlyUsed } = request;
  const normalized = domain.toLowerCase().trim();

  const results: FullLoadoutRecommendation[] = [];

  // Iterate ALL valid combos: lens × form × backdoor × persona
  for (const lens of ALL_LENSES) {
    const lConfig = LENS_REGISTRY[lens];
    const lensBase = lConfig.funScore * FUN_BASE + lConfig.addictionScore * FUN_BASE * 0.5 + lConfig.answerability * ANSWERABILITY_BASE;

    for (const form of ALL_FORMS) {
      const fConfig = FORM_REGISTRY[form];
      const formBase = fConfig.qualityScore * QUALITY_BASE + fConfig.readabilityScore * ANSWERABILITY_BASE * 0.5 + fConfig.varietyPotential * SYNERGY_BASE * 0.5;

      const lensFormSynergy = fConfig.bestPairedLenses.includes(lens) ? PAIRING_BONUS : 0;

      for (const backdoor of ALL_BACKDOORS) {
        const bConfig = BACKDOOR_REGISTRY[backdoor];
        const bdBase = bConfig.qualityScore * QUALITY_BASE + bConfig.funScore * FUN_BASE + bConfig.answerabilityBoost * ANSWERABILITY_BASE;

        const formBdSynergy = bConfig.bestPairedForms.includes(form) ? PAIRING_BONUS * 0.7 : 0;

        for (const persona of ALL_PERSONAS) {
          const pConfig = PERSONA_REGISTRY[persona];
          const personaBonus = pConfig.qualityScore * 0.4 + pConfig.funScore * 0.3 + pConfig.answerabilityFocus * 0.2;

          // ─── COMPOSITE SCORE ───
          let score = lensBase + formBase + bdBase + personaBonus + lensFormSynergy + formBdSynergy;

          // Domain match for lens
          if (lConfig.bestDomains.some(d => normalized.includes(d) || d.includes(normalized))) {
            score += DOMAIN_MATCH_BONUS;
          }

          // Persona synergy with lens and backdoor
          if (pConfig.bestPairedLenses.includes(lens)) score += 1.0;
          if (pConfig.bestPairedBackdoors.includes(backdoor)) score += 1.0;

          // ─── SOFT REPETITION PENALTIES (not hard bans) ───
          let repeatPenalty = 0;
          if (recentlyUsed.lenses.includes(lens)) repeatPenalty += REPEAT_PENALTY;
          if (recentlyUsed.forms.includes(form)) repeatPenalty += REPEAT_PENALTY;
          if (recentlyUsed.backdoors.includes(backdoor)) repeatPenalty += REPEAT_PENALTY;
          score += repeatPenalty;

          // Random noise to break ties naturally
          score += Math.random() * NOISE_RANGE;

          // Build explanation
          const parts: string[] = [];
          parts.push(`${lens} + ${form} + ${backdoor} + ${persona}`);
          if (lensFormSynergy > 0) parts.push('lens↔form');
          if (formBdSynergy > 0) parts.push('form↔backdoor');
          if (lConfig.bestDomains.some(d => normalized.includes(d) || d.includes(normalized))) parts.push('domain match');
          if (repeatPenalty < 0) parts.push(`soft repeat (${repeatPenalty.toFixed(1)})`);

          results.push({
            lens,
            form,
            backdoor,
            persona,
            score: Math.round(score * 100) / 100,
            breakdown: {
              lensQuality: Math.round(lensBase * 100) / 100,
              formQuality: Math.round(formBase * 100) / 100,
              backdoorQuality: Math.round(bdBase * 100) / 100,
              personaBonus: Math.round(personaBonus * 100) / 100,
              synergy: Math.round((lensFormSynergy + formBdSynergy) * 100) / 100,
              repeatPenalty: Math.round(repeatPenalty * 100) / 100,
            },
            explanation: parts.join(' | '),
          });
        }
      }
    }
  }

  // Sort by score descending, return top N
  return results.sort((a, b) => b.score - a.score).slice(0, topN);
}

// ═══════════════════════════════════════════════════════════════════
// LEGACY: FOCUSED MODE LENS RECOMMENDER (kept for backward compat)
// ═══════════════════════════════════════════════════════════════════

export type LensStats = Record<LensType, number>;

export interface LensRecommendation {
  lens: LensType;
  score: number;
  recommendedForm?: FormType;
  recommendedBackdoor?: BackdoorType;
  recommendedPersona?: PlayerPersona;
  explanation: string;
}

export function recommendFocusedLens(
  domain: string,
  dbStats: LensStats,
  alreadyUsedInTheme: LensType[] = [],
  topN: number = 3,
): LensRecommendation[] {
  const normalized = domain.toLowerCase().trim();
  const usageCounts = Object.values(dbStats);
  const maxUsage = usageCounts.length > 0 ? Math.max(...usageCounts, 1) : 1;

  const scored = (Object.entries(LENS_REGISTRY) as [LensType, LensConfig][]).map(([lens, config]) => {
    let score = config.funScore * 0.40 + config.addictionScore * 0.35 + config.answerability * 0.25;
    const parts: string[] = [`base ${score.toFixed(1)}`];

    if (config.bestDomains.some(d => normalized.includes(d) || d.includes(normalized))) {
      score += DOMAIN_MATCH_BONUS;
      parts.push('domain match');
    }

    const usage = dbStats[lens] || 0;
    const scarcity = ((maxUsage - usage) / maxUsage) * 2.0;
    score += scarcity;
    if (scarcity > 1.0) parts.push(`scarce +${scarcity.toFixed(1)}`);

    if (alreadyUsedInTheme.includes(lens)) {
      score += REPEAT_PENALTY * 2; // slightly stronger for lenses already in theme
      parts.push('already in theme');
    }

    // Also recommend best form + backdoor for this lens
    const bestForm = (LENS_FORM_MAP[lens] || [])[0];
    const bestBd = (FORM_BACKDOOR_MAP[bestForm] || [])[0];

    return {
      lens,
      recommendedForm: bestForm,
      recommendedBackdoor: bestBd,
      recommendedPersona: ALL_PERSONAS[0],
      score: Math.round(score * 100) / 100,
      explanation: `${lens} (${parts.join(', ')}) — ${config.magnetExample}`,
    } as LensRecommendation;
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}

// ═══════════════════════════════════════════════════════════════════
// DIVERSE MODE: 3-LAYER SCORING (now with soft penalties)
// ═══════════════════════════════════════════════════════════════════

export interface QuestionLoadout {
  lens: LensType;
  form: FormType;
  backdoor: BackdoorType;
}

export interface LoadoutContext {
  topicName: string;
  persona: PlayerPersona;
  recentForms: FormType[];
  lensStats: LensStats;
}

export function classifyTopicDomain(topicName: string): string {
  const lower = topicName.toLowerCase();
  const domainKeywords: [string, string[]][] = [
    ['history', ['history', 'war', 'ancient', 'empire', 'civilization', 'medieval', 'revolution']],
    ['science', ['science', 'quantum', 'physics', 'chemistry', 'biology', 'genetic', 'evolution']],
    ['space', ['space', 'astronomy', 'planet', 'galaxy', 'mars', 'moon', 'star', 'rocket']],
    ['technology', ['tech', 'internet', 'ai', 'code', 'computer', 'software', 'digital']],
    ['nature', ['nature', 'ocean', 'animal', 'wildlife', 'environment', 'forest']],
    ['food', ['food', 'culinary', 'coffee', 'tea', 'chocolate', 'drink', 'cuisine']],
    ['arts', ['art', 'renaissance', 'painting', 'sculpture', 'master']],
    ['sports', ['sport', 'athlete', 'olympic', 'football', 'soccer', 'basketball']],
    ['business', ['business', 'company', 'startup', 'brand', 'industry', 'corporation']],
    ['music', ['music', 'song', 'band', 'instrument', 'concert', 'album', 'sound']],
    ['movies', ['movie', 'film', 'cinema', 'actor', 'director', 'hollywood']],
    ['medicine', ['medicine', 'medical', 'disease', 'health', 'doctor', 'therapy']],
    ['politics', ['politic', 'government', 'president', 'democracy', 'republic']],
  ];
  for (const [domain, keywords] of domainKeywords) {
    if (keywords.some(kw => lower.includes(kw))) return domain;
  }
  return 'general';
}

export const TOPIC_LENS_MAP: Record<string, LensType[]> = {
  history: ['Origin Story', 'The Human Element', 'The Rivalry', 'The Legacy', 'The Butterfly Effect'],
  science: ['Numbers & Scale', 'The Evolution', 'The Connection', 'Behind the Scenes', 'The Unexpected'],
  technology: ['Origin Story', 'The Evolution', 'Behind the Scenes', 'The Connection', 'The Rivalry'],
  nature: ['The Oddity', 'The Unexpected', 'Numbers & Scale', 'The Evolution', 'The Connection'],
  wildlife: ['The Oddity', 'The Unexpected', 'Numbers & Scale', 'The Evolution'],
  food: ['Origin Story', 'The Oddity', 'The Cultural Impact', 'The Connection', 'The Evolution'],
  arts: ['The Cultural Impact', 'The Human Element', 'Behind the Scenes', 'The Legacy', 'The Rivalry'],
  culture: ['The Cultural Impact', 'The Human Element', 'Behind the Scenes', 'The Legacy'],
  sports: ['The Rivalry', 'The Human Element', 'Numbers & Scale', 'Origin Story', 'What If?'],
  business: ['The Rivalry', 'Origin Story', 'The Human Element', 'Numbers & Scale', 'The Butterfly Effect'],
  music: ['The Cultural Impact', 'The Human Element', 'Behind the Scenes', 'The Evolution', 'Origin Story'],
  movies: ['Behind the Scenes', 'The Cultural Impact', 'The Human Element', 'Origin Story'],
  space: ['Numbers & Scale', 'The Unexpected', 'Origin Story', 'The Connection', 'What If?'],
  medicine: ['The Unexpected', 'Behind the Scenes', 'The Evolution', 'The Human Element', 'The Legacy'],
  geography: ['Numbers & Scale', 'The Oddity', 'The Unexpected', 'The Connection'],
  politics: ['The Rivalry', 'The Human Element', 'The Butterfly Effect', 'The Legacy'],
  general: ['Origin Story', 'The Unexpected', 'The Oddity', 'The Connection', 'Numbers & Scale'],
};

export const LENS_FORM_MAP: Record<LensType, FormType[]> = {
  'Origin Story': ['Form 5 (Direct Narrative)', 'Form 8 (The Timeline)', 'Form 1 (Action-First)'],
  'The Unexpected': ['Form 2 (Parenthetical Hook)', 'Form 6 (The Contradiction)', 'Form 9 (The Misdirection)'],
  'The Human Element': ['Form 1 (Action-First)', 'Form 4 (Active Quote)', 'Form 5 (Direct Narrative)'],
  'Numbers & Scale': ['Form 3 (Sensory Clue)', 'Form 7 (The Question Lead)', 'Form 10 (Defining Trait)'],
  'The Rivalry': ['Form 2 (Parenthetical Hook)', 'Form 4 (Active Quote)', 'Form 6 (The Contradiction)'],
  'The Oddity': ['Form 2 (Parenthetical Hook)', 'Form 9 (The Misdirection)', 'Form 3 (Sensory Clue)'],
  'Behind the Scenes': ['Form 2 (Parenthetical Hook)', 'Form 5 (Direct Narrative)', 'Form 8 (The Timeline)'],
  'The Connection': ['Form 7 (The Question Lead)', 'Form 6 (The Contradiction)', 'Form 10 (Defining Trait)'],
  'What If?': ['Form 7 (The Question Lead)', 'Form 6 (The Contradiction)', 'Form 3 (Sensory Clue)'],
  'The Legacy': ['Form 5 (Direct Narrative)', 'Form 8 (The Timeline)', 'Form 10 (Defining Trait)'],
  'The Butterfly Effect': ['Form 6 (The Contradiction)', 'Form 8 (The Timeline)', 'Form 7 (The Question Lead)'],
  'The Evolution': ['Form 8 (The Timeline)', 'Form 5 (Direct Narrative)', 'Form 6 (The Contradiction)'],
  'The Cultural Impact': ['Form 4 (Active Quote)', 'Form 10 (Defining Trait)', 'Form 7 (The Question Lead)'],
};

export const FORM_BACKDOOR_MAP: Record<FormType, BackdoorType[]> = {
  'Form 1 (Action-First)': ['Pop Culture Hook', 'Everyday Link', 'Synonym Bridge'],
  'Form 2 (Parenthetical Hook)': ['Contrast Pop', 'Category Elimination', 'Functional Logic'],
  'Form 3 (Sensory Clue)': ['Sensory Logic', 'Synonym Bridge', 'Everyday Link'],
  'Form 4 (Active Quote)': ['Pop Culture Hook', 'Everyday Link', 'Etymology / Name Logic'],
  'Form 5 (Direct Narrative)': ['Sequence Pattern', 'Etymology / Name Logic', 'Everyday Link'],
  'Form 6 (The Contradiction)': ['Contrast Pop', 'Category Elimination', 'Functional Logic'],
  'Form 7 (The Question Lead)': ['Anagram-Wordplay', 'Everyday Link', 'Pop Culture Hook'],
  'Form 8 (The Timeline)': ['Sequence Pattern', 'Etymology / Name Logic', 'Synonym Bridge'],
  'Form 9 (The Misdirection)': ['Contrast Pop', 'Functional Logic', 'Category Elimination'],
  'Form 10 (Defining Trait)': ['Sensory Logic', 'Synonym Bridge', 'Category Elimination'],
};

export function scoreAndSelectLoadout(ctx: LoadoutContext): QuestionLoadout {
  const domain = classifyTopicDomain(ctx.topicName);
  const pConfig = PERSONA_REGISTRY[ctx.persona];
  const compatibleLenses = TOPIC_LENS_MAP[domain] ?? TOPIC_LENS_MAP.general;

  // Layer 1: Score lenses (with quality + persona synergy)
  let bestLens: LensType = 'Origin Story';
  let bestLensScore = -999;
  for (const lens of ALL_LENSES) {
    const lConfig = LENS_REGISTRY[lens];
    let score = Math.random() * NOISE_RANGE;
    // Domain compatibility
    if (compatibleLenses.includes(lens)) score += PAIRING_BONUS;
    // Lens quality
    score += lConfig.funScore * 0.2 + lConfig.answerability * 0.15;
    // Scarcity
    const usage = ctx.lensStats[lens] || 0;
    const maxUsage = Math.max(...Object.values(ctx.lensStats), 1);
    score += ((maxUsage - usage) / maxUsage) * 1.5;
    // Persona synergy
    if (pConfig.bestPairedLenses.includes(lens)) score += 1.5;
    if (score > bestLensScore) { bestLensScore = score; bestLens = lens; }
  }

  // Layer 2: Score forms (quality + lens pairing + persona synergy)
  let bestForm: FormType = 'Form 5 (Direct Narrative)';
  let bestFormScore = -999;
  const compatibleForms = LENS_FORM_MAP[bestLens] ?? ALL_FORMS;
  for (const form of ALL_FORMS) {
    const fConfig = FORM_REGISTRY[form];
    let score = Math.random() * NOISE_RANGE;
    // Lens pairing
    if (compatibleForms.includes(form)) score += PAIRING_BONUS;
    // Form quality + readability
    score += fConfig.qualityScore * 0.2 + fConfig.readabilityScore * 0.15;
    // Soft repeat penalty
    if (ctx.recentForms.includes(form)) score += REPEAT_PENALTY;
    if (score > bestFormScore) { bestFormScore = score; bestForm = form; }
  }

  // Layer 3: Score backdoors (quality + form pairing + persona synergy)
  let bestBackdoor: BackdoorType = 'Everyday Link';
  let bestBackdoorScore = -999;
  const compatibleBackdoors = FORM_BACKDOOR_MAP[bestForm] ?? ALL_BACKDOORS;
  for (const bd of ALL_BACKDOORS) {
    const bConfig = BACKDOOR_REGISTRY[bd];
    let score = Math.random() * NOISE_RANGE;
    if (compatibleBackdoors.includes(bd)) score += PAIRING_BONUS;
    // Backdoor quality
    score += bConfig.qualityScore * 0.2 + bConfig.answerabilityBoost * 0.15;
    // Persona synergy
    if (pConfig.bestPairedBackdoors.includes(bd)) score += 1.5;
    if (score > bestBackdoorScore) { bestBackdoorScore = score; bestBackdoor = bd; }
  }

  return { lens: bestLens, form: bestForm, backdoor: bestBackdoor };
}
