import { calcPoints } from "../components/LinksBoardPrototype";

// ── Pool Multiplier Helpers ────────────────────────────────────────────────

export function getPoolMultiplier(poolLettersUsed: number): number {
  if (poolLettersUsed >= 6) return 3.0;
  if (poolLettersUsed >= 5) return 2.5;
  if (poolLettersUsed >= 4) return 2.0;
  if (poolLettersUsed >= 3) return 1.5;
  return 1.0;
}

export function calcPointsWithPoolMultiplier(
  wordLength: number,
  poolLettersUsed: number,
): { base: number; multiplier: number; total: number } {
  const base = calcPoints(wordLength);
  const multiplier = getPoolMultiplier(poolLettersUsed);
  return { base, multiplier, total: Math.round(base * multiplier) };
}

export function countPoolLettersInWord(
  word: string,
  poolLetters: string[],
): number {
  const lower = word.toLowerCase();
  return poolLetters.filter((l) => lower.includes(l.toLowerCase())).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── HYBRID LETTER GENERATION ENGINE ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Letter frequency tiers based on how many words CONTAIN each letter.
 * These form the foundation of the anchor+spice system.
 */
const LETTER_TIERS = {
  /** Appear in 50,000+ words — guaranteed to unlock thousands of valid words */
  veryCommon: ["E", "A", "S", "R", "T"],
  /** Appear in 30,000-75,000 words — strong support letters */
  common: ["N", "O", "I", "L", "C"],
  /** Appear in 10,000-35,000 words — add variety and challenge */
  mid: ["D", "P", "M", "H", "G", "U", "B"],
  /** Appear in 5,000-15,000 words — difficulty spikes */
  uncommon: ["F", "Y", "W", "K", "V"],
  /** Appear in 3,000-12,000 words — rare, demanding */
  rare: ["X", "Z", "J", "Q"],
};

/** Letter weights for weighted random selection (higher = more common) */
const LETTER_WEIGHTS: Record<string, number> = {
  E: 92, A: 90, S: 82, R: 81, T: 77, // very common
  N: 86, O: 74, I: 88, L: 61, C: 55, // common
  D: 32, P: 36, M: 29, H: 26, G: 30, U: 30, B: 16, // mid
  F: 11, Y: 8, W: 6, K: 4, V: 5, // uncommon
  X: 3, Z: 2, J: 2, Q: 2, // rare
};

/** All letters sorted by frequency (most common first) */
const ALL_LETTERS = [
  "E", "A", "S", "R", "T", "N", "O", "I", "L", "C",
  "D", "P", "M", "H", "G", "U", "B", "F", "Y", "W",
  "K", "V", "X", "Z", "J", "Q",
];

/** Sets of letters for quick lookup */
const ANCHOR_POOL = [
  ...LETTER_TIERS.veryCommon,
  ...LETTER_TIERS.common,
];
const MID_POOL = [...LETTER_TIERS.mid];
const RARE_POOL = [...LETTER_TIERS.uncommon, ...LETTER_TIERS.rare];

// ── Word file cache (shared with board components) ─────────────────────────

const wordFileCache = new Map<string, string[]>();

/**
 * Fetch and cache a word file for a given letter.
 * Returns an array of lowercase words containing that letter.
 */
export async function fetchWordFile(letter: string): Promise<string[]> {
  const key = letter.toLowerCase();
  if (wordFileCache.has(key)) return wordFileCache.get(key)!;
  try {
    const resp = await fetch(`/words/by_letter/${key}.json`);
    if (!resp.ok) return [];
    const words: string[] = await resp.json();
    wordFileCache.set(key, words);
    return words;
  } catch {
    return [];
  }
}

// ── Counting words with the "at least 2 pool letters" rule ─────────────────

function countValidWords(
  letterWordSets: Map<string, string[]>,
  poolLetters: string[],
  minWordLength: number = 2,
): number {
  // Build union: all words that contain at least 2 pool letters
  const letterSetLower = new Set(poolLetters.map((l) => l.toLowerCase()));
  let count = 0;

  // Get all unique words from all letter files
  const allWords = new Set<string>();
  for (const letter of poolLetters) {
    const words = letterWordSets.get(letter) || [];
    for (const w of words) {
      if (w.length >= minWordLength && w.length <= 15) allWords.add(w);
    }
  }

  // Count words that contain at least 2 pool letters
  for (const word of allWords) {
    const lower = word.toLowerCase();
    let poolHits = 0;
    for (const l of letterSetLower) {
      if (lower.includes(l)) {
        poolHits++;
        if (poolHits >= 2) {
          count++;
          break;
        }
      }
    }
  }

  return count;
}

// ── Weighted random selection ──────────────────────────────────────────────

function weightedRandom(
  pool: string[],
  exclude: Set<string>,
  weights: Record<string, number>,
): string {
  const available = pool.filter((l) => !exclude.has(l));
  if (available.length === 0)
    return pool[Math.floor(Math.random() * pool.length)];

  const totalWeight = available.reduce(
    (sum, l) => sum + (weights[l] || 1),
    0,
  );
  let roll = Math.random() * totalWeight;
  for (const letter of available) {
    roll -= weights[letter] || 1;
    if (roll <= 0) return letter;
  }
  return available[available.length - 1];
}

function pickN(pool: string[], n: number, exclude: Set<string>): string[] {
  const available = pool.filter((l) => !exclude.has(l));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ── Difficulty configuration ──────────────────────────────────────────────

interface DifficultyConfig {
  /** Number of "anchor" letters (very common + common) */
  minAnchors: number;
  maxAnchors: number;
  /** Number of "mid" frequency letters */
  minMid: number;
  maxMid: number;
  /** Number of "rare/uncommon" letters */
  minRare: number;
  maxRare: number;
  /** Target word count range (words with at least 2 pool letters) */
  targetMin: number;
  targetMax: number;
}

/**
 * Difficulty presets for each wave number.
 * Maps wave → difficulty config.
 * 
 * Design philosophy: "Anchor + Spice"
 * - Every wave has at least 1 anchor letter (appears in 30K+ words)
 * - This guarantees players can ALWAYS find something to type
 * - Harder waves add more rare letters, reducing the valid word pool
 * - The multiplier system rewards finding words that use rare letters
 */
const DIFFICULTY_BY_WAVE: Record<number, DifficultyConfig> = {
  1: {
    // EASY: mostly common letters, ~10000+ valid words
    minAnchors: 3,
    maxAnchors: 4,
    minMid: 0,
    maxMid: 2,
    minRare: 0,
    maxRare: 0,
    targetMin: 8000,
    targetMax: Infinity,
  },
  2: {
    // MEDIUM: mix of common + mid, ~4000-8000 valid words
    minAnchors: 2,
    maxAnchors: 3,
    minMid: 1,
    maxMid: 2,
    minRare: 0,
    maxRare: 1,
    targetMin: 3000,
    targetMax: 8000,
  },
  3: {
    // HARD: 2 anchors + spice, ~1500-4000 valid words
    minAnchors: 2,
    maxAnchors: 2,
    minMid: 1,
    maxMid: 2,
    minRare: 0,
    maxRare: 2,
    targetMin: 1500,
    targetMax: 4000,
  },
  4: {
    // EXPERT: 1-2 anchors + lots of spice, ~600-2000 valid words
    minAnchors: 1,
    maxAnchors: 2,
    minMid: 1,
    maxMid: 2,
    minRare: 1,
    maxRare: 3,
    targetMin: 600,
    targetMax: 2000,
  },
  5: {
    // MASTER: 1 anchor + heavy spice, ~300-1000 valid words
    minAnchors: 1,
    maxAnchors: 1,
    minMid: 1,
    maxMid: 2,
    minRare: 2,
    maxRare: 3,
    targetMin: 300,
    targetMax: 1000,
  },
};

// ── Main generation function ──────────────────────────────────────────────

/**
 * Generate a letter pool using the hybrid anchor+spice system.
 * Works for any letter count (2-6) and any wave number (1-5).
 *
 * @param letterCount - Number of letters in the pool (2-6)
 * @param wave - Current wave number (1-based)
 * @param totalWaves - Total number of waves. When provided, difficulty is
 *   remapped so the final wave always hits the hardest config (5).
 *   E.g. 3 waves → configs 1, 3, 5 instead of 1, 2, 3.
 * @returns Array of uppercase letters
 */
export async function generateLetterPool(
  letterCount: number,
  wave: number,
  totalWaves?: number,
): Promise<string[]> {
  // Remap wave → difficulty level across the full 1-5 range
  let difficultyWave = wave;
  if (totalWaves && totalWaves > 1 && totalWaves < 5) {
    // Scale: wave 1 → config 1, wave totalWaves → config 5
    difficultyWave = Math.round(1 + ((wave - 1) / (totalWaves - 1)) * 4);
  }
  const config = DIFFICULTY_BY_WAVE[Math.min(difficultyWave, 5)] || DIFFICULTY_BY_WAVE[1];
  const MAX_ATTEMPTS = 8;

  // Adjust anchor/spice counts to fit the requested letterCount
  let effectiveMinAnchors = Math.min(config.minAnchors, letterCount);
  const effectiveMaxAnchors = Math.min(config.maxAnchors, letterCount);

  // For small pools (2-3 letters), scale anchors by wave position so difficulty
  // is visible instead of always having an anchor every wave.
  // - Wave 1: always anchors (guaranteed playable start)
  // - Middle waves: at least 1 anchor (comfortable challenge)
  // - Final 2 waves: allow 0 anchors (mid+rare or rare+rare combos)
  //   The word count validation ensures there are still playable words.
  if (letterCount <= 3 && difficultyWave >= 2) {
    const isFinalTwoWaves = (totalWaves || 5) > 2 && wave >= (totalWaves || 5) - 1;
    if (isFinalTwoWaves) {
      // Final 2 waves: allow 0 anchors for maximum difficulty
      effectiveMinAnchors = 0;
    } else {
      // Middle waves: guarantee at least 1 spice slot
      effectiveMinAnchors = Math.min(effectiveMinAnchors, letterCount - 1);
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Step 1: Pick anchors (common letters)
    const anchorCount =
      effectiveMinAnchors +
      Math.floor(
        Math.random() * (effectiveMaxAnchors - effectiveMinAnchors + 1),
      );
    const anchors: string[] = [];
    const used = new Set<string>();
    for (let i = 0; i < anchorCount; i++) {
      const letter = weightedRandom(ANCHOR_POOL, used, LETTER_WEIGHTS);
      anchors.push(letter);
      used.add(letter);
    }

    // Step 2: Fill remaining slots with mid + rare "spice"
    const remaining = letterCount - anchors.length;
    const spice: string[] = [];

    // Determine how many mid vs rare
    const maxMid = Math.min(config.maxMid, remaining);
    const midCount = Math.max(
      config.minMid,
      Math.floor(Math.random() * (maxMid + 1)),
    );
    const rareCount = remaining - midCount;

    // Pick mid letters
    const midPicked = pickN(MID_POOL, Math.min(midCount, MID_POOL.length), used);
    for (const l of midPicked) {
      spice.push(l);
      used.add(l);
    }

    // Pick rare letters (if we need more than mid pool provides)
    if (rareCount > 0) {
      const rarePicked = pickN(RARE_POOL, rareCount, used);
      for (const l of rarePicked) {
        spice.push(l);
        used.add(l);
      }
    }

    // If we still don't have enough letters, fill from common pool
    while (spice.length + anchors.length < letterCount) {
      const letter = weightedRandom(ALL_LETTERS, used, LETTER_WEIGHTS);
      spice.push(letter);
      used.add(letter);
    }

    const pool = [...anchors, ...spice];

    // Step 3: Validate word count against actual dictionary
    try {
      const wordSets = new Map<string, string[]>();
      await Promise.all(pool.map(async (l) => { wordSets.set(l, await fetchWordFile(l)); }));
      const wordCount = countValidWords(wordSets, pool);

      // Scale target range down for small pools. With 2 letters, every valid
      // word must contain BOTH letters (at least 2 of 2), which is far more
      // restrictive than larger pools where words need 2 of 4+. Without this,
      // rare combos like [K, V] would always fail validation.
      // Only applies to pools of 3 or fewer letters — larger pools use the
      // original calibrated targets.
      let scaledMin = config.targetMin;
      let scaledMax = config.targetMax;
      if (letterCount <= 3) {
        const poolScale = Math.max(0.05, letterCount / 6);
        scaledMin = Math.round(config.targetMin * poolScale);
        scaledMax = config.targetMax === Infinity ? Infinity : Math.round(config.targetMax * poolScale);
      }

      // Accept if within scaled target range
      if (wordCount >= scaledMin && wordCount <= scaledMax) {
        return pool;
      }

      // If too few words, try again with more common letters
      // If too many words, also retry for better difficulty
    } catch {
      // Word file loading failed — fall through to fallback
    }
  }

  // Fallback: return a pool of very common letters
  return ALL_LETTERS.slice(0, letterCount);
}


