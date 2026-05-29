/**
 * LINKS Word Set Builder
 * 
 * Reads the master word.list (one word per line, Scrabble dictionary format)
 * and generates per-letter JSON files in public/words/by_letter/.
 * 
 * Each file contains an array of all words that contain that letter.
 * The client loads the files for the chosen letters and intersects them:
 *   validWords = Set(A) ∩ Set(C) ∩ Set(E)
 * 
 * Usage: npx tsx scripts/build_word_sets.ts
 * 
 * Output: public/words/by_letter/A.json ... Z.json
 *         public/words/by_letter/_meta.json (stats)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORD_LIST_PATH = path.resolve(__dirname, "..", "word.list");
const OUTPUT_DIR = path.resolve(__dirname, "..", "public", "words", "by_letter");

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log("🔤 LINKS Word Set Builder");
console.log("=========================\n");

// Read the master word list
console.log(`📖 Reading ${WORD_LIST_PATH}...`);
const raw = fs.readFileSync(WORD_LIST_PATH, "utf-8");
const allWords = raw
  .split("\n")
  .map((w) => w.trim().toLowerCase())
  .filter((w) => w.length >= 3 && w.length <= 15 && /^[a-z]+$/.test(w));

console.log(`   ✓ ${allWords.length.toLocaleString()} valid words loaded\n`);

// Build per-letter sets
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const byLetter: Record<string, string[]> = {};

for (const letter of LETTERS) {
  byLetter[letter] = allWords.filter((w) => w.includes(letter));
}

// Write output files
console.log("📝 Writing per-letter files...\n");

const stats: Record<string, number> = {};
let totalSize = 0;

for (const letter of LETTERS) {
  const words = byLetter[letter];
  const filePath = path.join(OUTPUT_DIR, `${letter}.json`);
  const json = JSON.stringify(words);
  fs.writeFileSync(filePath, json, "utf-8");
  
  const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
  stats[letter] = words.length;
  totalSize += Buffer.byteLength(json);
  
  console.log(`   ${letter.toUpperCase()}.json → ${words.length.toLocaleString().padStart(8)} words  (${sizeKB.padStart(6)} KB)`);
}

// Write meta file
const metaPath = path.join(OUTPUT_DIR, "_meta.json");
const totalKB = (totalSize / 1024).toFixed(1);
const meta = {
  totalWords: allWords.length,
  perLetter: stats,
  totalSizeKB: totalKB,
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");

console.log(`\n✅ Done!`);
console.log(`   Total output: ${totalKB} KB across ${LETTERS.length} files`);
console.log(`   Output directory: ${OUTPUT_DIR}`);
console.log(`\n   Example: A+B intersection → ~${estimateIntersection("a", "b", byLetter).toLocaleString()} words`);
console.log(`   Example: A+C+E intersection → ~${estimateIntersection("a", "c", "e", byLetter).toLocaleString()} words\n`);

function estimateIntersection(...letters: string[]): number {
  const sets = letters.map((l) => new Set(byLetter[l]));
  const first = sets[0];
  let count = 0;
  for (const word of first) {
    if (sets.every((s) => s.has(word))) count++;
  }
  return count;
}
