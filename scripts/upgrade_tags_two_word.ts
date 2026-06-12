/**
 * Upgrade all question tags in seed_questions.json from single-word to two-word
 * meaningful hints. Each tag should give a "feel" of the question topic without
 * revealing the answer or using distinctive words from the question text.
 */

const replacements: Record<string, string> = {
  // ── Quantum Mechanics ──────────────────────────────────────────────
  "Wave": "Wave Rebel",
  "Duality": "Split Life",
  "Spooky": "Distant Bond",
  "Dice": "Cosmic Gambit",
  "Shortcut": "Space Tunnel",

  // ── Genetics and DNA ───────────────────────────────────────────────
  "Helix": "Twisted Ladder",
  "Photo 51": "Hidden Proof",
  "Fossil": "Ancient Code",
  "Blueprint": "Human Map",
  "Scissors": "Precision Cut",

  // ── Space Exploration ──────────────────────────────────────────────
  "Beep": "Orbit Pioneer",
  "Step": "Lunar Footprint",
  "Rust": "Red Wanderer",
  "Moon race": "Rival Rocket",
  "Golden": "Star Record",

  // ── Evolution and Natural Selection ────────────────────────────────
  "Origin": "Island Voyage",
  "Dodo": "Silent Wings",
  "Flask": "Glass Evolution",
  "Forgotten": "Shadow Genius",
  "Tree": "Branching Roots",

  // ── The Periodic Table ─────────────────────────────────────────────
  "Dream": "Visionary Sleep",
  "Strange": "Alien Element",
  "Twice": "Double Prize",
  "Poison": "Silent Metal",
  "Pink": "Pepto Metal",

  // ── Ancient Civilizations ──────────────────────────────────────────
  "Cradle": "Twin Rivers",
  "Wall": "Quiet Genius",
  "Warriors": "Iron Society",
  "Laws": "Carved Justice",
  "Library": "Clay Archive",

  // ── World War II ───────────────────────────────────────────────────
  "Invasion": "Opening Strike",
  "Defiance": "Lion Voice",
  "Bombed": "Steel Target",
  "Enigma": "Hidden Breakers",
  "D-Day": "Final Shore",

  // ── Renaissance Masters ────────────────────────────────────────────
  "Sistine": "Painted Heaven",
  "Madonna": "Gentle Grace",
  "Sketch": "Curious Hand",
  "Color": "Living Hue",
  "Birthplace": "Golden Hearth",

  // ── The Internet Revolution ────────────────────────────────────────
  "Login": "First Crash",
  "Web": "Open Gift",
  "Packets": "Traffic Rules",
  "Network": "Dorm Project",
  "Search": "Infinite Name",

  // ── Artificial Intelligence ────────────────────────────────────────
  "Imitation": "Thinking Game",
  "AlphaGo": "Ancient Board",
  "Robots": "Mechanical Dance",
  "Brain": "Silicon Pattern",
  "Birth": "Fateful Summer",

  // ── Ocean Life ─────────────────────────────────────────────────────
  "Blue": "Living Breath",
  "Immortal": "Age Reversal",
  "Giant": "Ocean Mountain",
  "Lure": "Glowing Trap",
  "Reef": "Rainbow City",

  // ── Animal Kingdom Records ─────────────────────────────────────────
  "Dive": "Sky Bullet",
  "Water bear": "Tiny Survivor",
  "Simple": "Pore Body",
  "Gorilla": "Mist Guardian",
  "Saved": "Legal Shield",

  // ── Extreme Environments ───────────────────────────────────────────
  "Dark": "Dark Alchemy",
  "Smokers": "Boiling Towers",
  "Taq": "Heat Key",
  "Deepest": "Abyss Visitors",
  "Bubble": "Glass World",

  // ── Culinary Origins ───────────────────────────────────────────────
  "Crisp": "Salty Revenge",
  "Orange": "Chain Creation",
  "Cola": "Fizz Rival",
  "Gold": "Earth Diamond",
  "Umami": "Aged Elixir",

  // ── Coffee and Tea Culture ─────────────────────────────────────────
  "Kaldi": "Dancing Goats",
  "Dark": "Deep Leaf",
  "Instant": "War Powder",
  "Patriot": "Rebel Cup",
  "Civet": "Wild Ferment",

  // ── Chocolate and Confectionery ────────────────────────────────────
  "Bitter": "Bitter Coin",
  "Surprise": "Hidden Center",
  "Quaker": "Sweet Utopia",
  "Rare": "Pale Treasure",
  "Shell": "Glossy Armor",
};

import * as fs from "fs";
import { fileURLToPath } from "url";
import * as path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedPath = path.join(__dirname, "..", "seed_questions.json");
let raw = fs.readFileSync(seedPath, "utf-8");

let changed = 0;
for (const [oldTag, newTag] of Object.entries(replacements)) {
  const pattern = `"tag": "${oldTag}"`;
  const replacement = `"tag": "${newTag}"`;
  if (raw.includes(pattern)) {
    raw = raw.replace(pattern, replacement);
    changed++;
    console.log(`✅ "${oldTag}" → "${newTag}"`);
  } else {
    console.warn(`⚠️  NOT FOUND: "${oldTag}"`);
  }
}

fs.writeFileSync(seedPath, raw, "utf-8");
console.log(`\n🎉 Done! ${changed}/${Object.keys(replacements).length} tags replaced.`);
