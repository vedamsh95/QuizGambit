/**
 * LINKS Sprint Letter Sets Builder v2
 * Intentionally generates letter combinations by letter count per difficulty tier:
 *   Easy   → 2-letter combos (tons of valid words)
 *   Medium → 3-letter combos (many words)
 *   Hard   → 3-4 letter combos
 *   Expert → 4-letter combos
 *   Master → 4-5 letter combos (fewest words)
 *
 * Usage: npx tsx scripts/build_letter_sets.ts
 * Output: public/words/letter_sets.json
 */

import * as fs from "fs";
import * as path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const INPUT_DIR = path.resolve(__dirname, "..", "public", "words", "by_letter");
const OUTPUT_FILE = path.resolve(__dirname, "..", "public", "words", "letter_sets.json");

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// ── Difficulty tier config ─────────────────────────────────────────────────

type Tier = "easy" | "medium" | "hard" | "expert" | "master";

interface TierConfig {
  label: string;
  minWords: number;
  maxWords: number;
  letterCounts: number[];      // which letter counts to use for this tier
  targetSets: number;          // how many sets to include
}

const TIER_CONFIG: Record<Tier, TierConfig> = {
  easy:   { label: "Easy",   minWords: 400, maxWords: Infinity, letterCounts: [2],                  targetSets: 100 },
  medium: { label: "Medium", minWords: 200, maxWords: 399,     letterCounts: [3],                  targetSets: 100 },
  hard:   { label: "Hard",   minWords: 50,  maxWords: 199,     letterCounts: [3, 4],              targetSets: 100 },
  expert: { label: "Expert", minWords: 10,  maxWords: 49,      letterCounts: [4],                  targetSets: 100 },
  master: { label: "Master", minWords: 3,   maxWords: 9,       letterCounts: [4, 5],              targetSets: 100 },
};

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔤 LINKS Sprint Letter Sets Builder v2\n");

  // 1. Load all by_letter word sets
  console.log("📖 Loading per-letter word sets...");
  const byLetter: Record<string, Set<string>> = {};

  for (const letter of LETTERS) {
    const filePath = path.join(INPUT_DIR, `${letter.toLowerCase()}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`   ⚠️  Missing ${letter.toLowerCase()}.json — skipping`);
      byLetter[letter] = new Set();
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const words: string[] = JSON.parse(raw);
    byLetter[letter] = new Set(words);
  }

  console.log(`   ✓ All ${LETTERS.length} letter sets loaded\n`);

  // 2. Precompute all 2-letter combos (there are only 325 — do them all)
  console.log("🧮 Computing 2-letter combos (all 325)...");
  const allTwoLetter: { combo: string[]; wordCount: number }[] = [];
  for (let i = 0; i < LETTERS.length; i++) {
    for (let j = i + 1; j < LETTERS.length; j++) {
      const combo = [LETTERS[i], LETTERS[j]];
      const wc = intersectSize(combo, byLetter);
      if (wc >= 3) allTwoLetter.push({ combo, wordCount: wc });
    }
  }
  allTwoLetter.sort((a, b) => a.wordCount - b.wordCount);
  console.log(`   → ${allTwoLetter.length} viable 2-letter combos (range: ${allTwoLetter[0]?.wordCount || "?"}-${allTwoLetter[allTwoLetter.length-1]?.wordCount || "?"} words)\n`);

  // 3. Sample 3-letter combos (many more combinations — sample 3000)
  console.log("🧮 Sampling 3-letter combos (3000 random)...");
  const allThreeLetter = sampleCombos(3, 3000, LETTERS, byLetter);
  allThreeLetter.sort((a, b) => a.wordCount - b.wordCount);
  console.log(`   → ${allThreeLetter.length} viable 3-letter combos (range: ${allThreeLetter[0]?.wordCount || "?"}-${allThreeLetter[allThreeLetter.length-1]?.wordCount || "?"} words)\n`);

  // 4. Sample 4-letter combos
  console.log("🧮 Sampling 4-letter combos (2000 random)...");
  const allFourLetter = sampleCombos(4, 2000, LETTERS, byLetter);
  allFourLetter.sort((a, b) => a.wordCount - b.wordCount);
  console.log(`   → ${allFourLetter.length} viable 4-letter combos (range: ${allFourLetter[0]?.wordCount || "?"}-${allFourLetter[allFourLetter.length-1]?.wordCount || "?"} words)\n`);

  // 5. Sample 5-letter combos
  console.log("🧮 Sampling 5-letter combos (1000 random)...");
  const allFiveLetter = sampleCombos(5, 1000, LETTERS, byLetter);
  allFiveLetter.sort((a, b) => a.wordCount - b.wordCount);
  console.log(`   → ${allFiveLetter.length} viable 5-letter combos (range: ${allFiveLetter[0]?.wordCount || "?"}-${allFiveLetter[allFiveLetter.length-1]?.wordCount || "?"} words)\n`);

  // 6. Assign to tiers by letter count
  const result: Record<Tier, { letters: string[]; wordCount: number }[]> = {
    easy: [], medium: [], hard: [], expert: [], master: [],
  };
  const usedKeys = new Set<string>();

  function addToTier(combo: string[], wordCount: number, tier: Tier) {
    const key = [...combo].sort().join("+");
    if (usedKeys.has(key)) return false;
    usedKeys.add(key);
    result[tier].push({ letters: [...combo].sort(), wordCount });
    return true;
  }

  for (const tier of Object.keys(TIER_CONFIG) as Tier[]) {
    const cfg = TIER_CONFIG[tier];
    const needed = cfg.targetSets;

    // For each allowed letter count, gather candidates from the precomputed pools
    for (const lc of cfg.letterCounts) {
      const pool = lc === 2 ? allTwoLetter
        : lc === 3 ? allThreeLetter
        : lc === 4 ? allFourLetter
        : allFiveLetter;

      const candidates = pool.filter(c =>
        c.wordCount >= cfg.minWords && c.wordCount <= cfg.maxWords &&
        !usedKeys.has([...c.combo].sort().join("+"))
      );

      // Shuffle and take what we need
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const maxTake = lc === cfg.letterCounts[cfg.letterCounts.length - 1]
        ? needed - result[tier].length  // last letter count: fill remaining
        : Math.ceil(needed / cfg.letterCounts.length); // spread evenly

      let taken = 0;
      for (const c of shuffled) {
        if (taken >= maxTake) break;
        if (addToTier(c.combo, c.wordCount, tier)) taken++;
      }
      console.log(`   ${tier}: ${taken} sets from ${lc}-letter pool`);
    }

    // If we still need more, relax the min/max and grab from any pool
    if (result[tier].length < needed) {
      console.log(`   ⚠️  ${tier}: only ${result[tier].length} sets — relaxing constraints...`);
      const allPools = lc => lc === 2 ? allTwoLetter : lc === 3 ? allThreeLetter : lc === 4 ? allFourLetter : allFiveLetter;
      for (const lc of cfg.letterCounts) {
        const candidates = allPools(lc).filter(c =>
          c.wordCount >= TIER_CONFIG.expert.minWords &&
          !usedKeys.has([...c.combo].sort().join("+"))
        );
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        for (const c of shuffled) {
          if (result[tier].length >= needed) break;
          // Allow a broader range if we're short
          if (c.wordCount >= 3 && c.wordCount <= 9999) {
            addToTier(c.combo, c.wordCount, tier);
          }
        }
      }
    }

    result[tier].sort((a, b) => a.wordCount - b.wordCount);
    const r = cfg;
    console.log(`   ✓ ${tier}: ${result[tier].length} sets (${result[tier][0]?.wordCount || "?"}-${result[tier][result[tier].length-1]?.wordCount || "?"} words)`);
    // Show sample
    const sample = result[tier].slice(0, 5).map(c =>
      c.letters.join("+") + "(" + c.wordCount + ")"
    ).join(", ");
    console.log(`     sample: ${sample}`);
    console.log("");
  }

  // 7. Write output
  let grandTotal = 0;
  for (const tier of Object.keys(result) as Tier[]) {
    grandTotal += result[tier].length;
  }

  const output = {
    easy: result.easy,
    medium: result.medium,
    hard: result.hard,
    expert: result.expert,
    master: result.master,
    _meta: {
      generatedAt: new Date().toISOString(),
      tiers: Object.fromEntries(
        (Object.keys(TIER_CONFIG) as Tier[]).map(tier => [
          tier,
          {
            min: TIER_CONFIG[tier].minWords,
            max: TIER_CONFIG[tier].maxWords === Infinity ? null : TIER_CONFIG[tier].maxWords,
            label: `${TIER_CONFIG[tier].label} (${TIER_CONFIG[tier].letterCounts.map(l => l + " letters").join("/")})`,
            letterCounts: TIER_CONFIG[tier].letterCounts,
            count: result[tier].length,
          },
        ])
      ),
      totalCombinations: grandTotal,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output), "utf-8");
  const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1);
  console.log(`✅ Done! Wrote ${OUTPUT_FILE} (${sizeKB} KB)`);
  console.log(`   Total: ${grandTotal} precomputed letter combinations`);
  console.log(`   Letter set distribution:`);
  for (const tier of Object.keys(result) as Tier[]) {
    const byLc: Record<number, number> = {};
    result[tier].forEach(s => { const n = s.letters.length; byLc[n] = (byLc[n] || 0) + 1; });
    console.log(`   ${tier.padEnd(8)}: ${
      Object.entries(byLc).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${v}×${k}-letter`).join(", ")
    }`);
  }
  console.log("");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sampleCombos(
  letterCount: number,
  maxSamples: number,
  letters: string[],
  byLetter: Record<string, Set<string>>,
): { combo: string[]; wordCount: number }[] {
  const seen = new Set<string>();
  const results: { combo: string[]; wordCount: number }[] = [];
  let attempts = 0;
  const maxAttempts = maxSamples * 10;

  while (attempts < maxAttempts && results.length < maxSamples) {
    attempts++;
    const shuffled = [...letters].sort(() => Math.random() - 0.5);
    const combo = shuffled.slice(0, letterCount).sort();
    const key = combo.join("+");
    if (seen.has(key)) continue;
    seen.add(key);

    const wc = intersectSize(combo, byLetter);
    if (wc < 3) continue;
    results.push({ combo, wordCount: wc });
  }
  return results;
}

function intersectSize(combo: string[], byLetter: Record<string, Set<string>>): number {
  if (combo.length === 0) return 0;

  const sorted = [...combo].sort((a, b) => byLetter[a].size - byLetter[b].size);
  const base = byLetter[sorted[0]];
  const others = sorted.slice(1).map(l => byLetter[l]);

  let count = 0;
  for (const word of base) {
    if (others.every(s => s.has(word))) count++;
  }
  return count;
}

main().catch(console.error);
