/**
 * Audit Engine — Analyzes seed_questions.json for patterns, quality & diversity.
 * 
 * Run: npx tsx scripts/forge/audit_seed.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SEED = join(import.meta.dirname ?? '.', '..', '..', 'seed_questions.json');

interface Question {
  lens: string;
  form: string;
  question_text: string;
  answer_text: string;
  options: string[];
  backdoor_type: string;
  backdoor_explanation: string;
  points: number;
  difficulty_tier: string;
  tag: string;
}

interface Category {
  name: string;
  main_category: string;
  description: string;
  data: Question[];
  tags: string[];
}

const raw = JSON.parse(readFileSync(SEED, 'utf-8'));
const cats: Category[] = raw.categories;

const allQs = cats.flatMap(c => c.data);
const total = allQs.length;

// ─── 1. LENS DISTRIBUTION ──────────────────────────────────────────
const lensCounts: Record<string, number> = {};
allQs.forEach(q => { lensCounts[q.lens] = (lensCounts[q.lens] || 0) + 1; });

// ─── 2. FORM DISTRIBUTION ─────────────────────────────────────────
const formCounts: Record<string, number> = {};
allQs.forEach(q => { formCounts[q.form] = (formCounts[q.form] || 0) + 1; });

// ─── 3. BACKDOOR DISTRIBUTION ─────────────────────────────────────
const backdoorCounts: Record<string, number> = {};
allQs.forEach(q => { backdoorCounts[q.backdoor_type] = (backdoorCounts[q.backdoor_type] || 0) + 1; });

// ─── 4. DIFFICULTY DISTRIBUTION ───────────────────────────────────
const diffCounts: Record<string, number> = {};
allQs.forEach(q => { diffCounts[q.difficulty_tier] = (diffCounts[q.difficulty_tier] || 0) + 1; });

// ─── 5. LENS x FORM COMBINATIONS ─────────────────────────────────
const lensFormCombo: Record<string, number> = {};
allQs.forEach(q => {
  const key = `${q.lens} + ${q.form}`;
  lensFormCombo[key] = (lensFormCombo[key] || 0) + 1;
});

// ─── 6. LENS x BACKDOOR COMBINATIONS ─────────────────────────────
const lensBackdoorCombo: Record<string, number> = {};
allQs.forEach(q => {
  const key = `${q.lens} ≫ ${q.backdoor_type}`;
  lensBackdoorCombo[key] = (lensBackdoorCombo[key] || 0) + 1;
});

// ─── 7. FORM x BACKDOOR COMBINATIONS ─────────────────────────────
const formBackdoorCombo: Record<string, number> = {};
allQs.forEach(q => {
  const key = `${q.form} ≫ ${q.backdoor_type}`;
  formBackdoorCombo[key] = (formBackdoorCombo[key] || 0) + 1;
});

// ─── 8. PER-CATEGORY LENS VARIETY ─────────────────────────────────
const catLensVariety: Record<string, { total: number; uniqueLenses: number }> = {};
cats.forEach(c => {
  const lenses = new Set(c.data.map(q => q.lens));
  catLensVariety[c.name] = { total: c.data.length, uniqueLenses: lenses.size };
});

// ─── 9. PER-THEME DISTRIBUTION ────────────────────────────────────
const themeCounts: Record<string, number> = {};
cats.forEach(c => {
  themeCounts[c.main_category] = (themeCounts[c.main_category] || 0) + 1;
});

// ─── 10. MISSING LENSES / FORMS / BACKDOORS ──────────────────────
const ALL_LENSES = [
  'Origin Story', 'The Unexpected', 'The Human Element', 'Numbers & Scale',
  'The Rivalry', 'The Oddity', 'Behind the Scenes', 'The Connection',
  'What If?', 'The Legacy', 'The Butterfly Effect', 'The Evolution', 'The Cultural Impact',
];
const ALL_FORMS = [
  'Form 1 (Action-First)', 'Form 2 (Parenthetical Hook)', 'Form 3 (Sensory Clue)',
  'Form 4 (Active Quote)', 'Form 5 (Direct Narrative)', 'Form 6 (The Contradiction)',
  'Form 7 (The Question Lead)', 'Form 8 (The Timeline)', 'Form 9 (The Misdirection)',
  'Form 10 (Defining Trait)',
];
const ALL_BACKDOORS = [
  'Synonym Bridge', 'Contrast Pop', 'Everyday Link', 'Anagram-Wordplay',
  'Sequence Pattern', 'Sensory Logic', 'Category Elimination',
  'Etymology / Name Logic', 'Functional Logic', 'Pop Culture Hook',
];

const missingLenses = ALL_LENSES.filter(l => !lensCounts[l]);
const missingForms = ALL_FORMS.filter(l => !formCounts[l]);
const missingBackdoors = ALL_BACKDOORS.filter(l => !backdoorCounts[l]);

// ─── 11. REPEATED LENSES WITHIN A SINGLE CATEGORY ─────────────────
const repeatedLensCategories: string[] = [];
cats.forEach(c => {
  const lensSet = new Set<string>();
  c.data.forEach(q => {
    if (lensSet.has(q.lens)) {
      repeatedLensCategories.push(`${c.name}: ${q.lens} used twice+`);
    }
    lensSet.add(q.lens);
  });
});

// ─── 12. QUESTION LENGTH ANALYSIS ─────────────────────────────────
const lengths = allQs.map(q => q.question_text.split(/\s+/).length);
const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
const minLen = Math.min(...lengths);
const maxLen = Math.max(...lengths);

// ─── 13. MOST OVERUSED COMBINATIONS ───────────────────────────────
const topCombos = Object.entries(lensFormCombo)
  .sort(([,a], [,b]) => b - a)
  .filter(([,n]) => n > 1);

const topBackdoorCombos = Object.entries(lensBackdoorCombo)
  .sort(([,a], [,b]) => b - a)
  .filter(([,n]) => n > 1);

// ─── PRINT REPORT ─────────────────────────────────────────────────
console.log('═'.repeat(70));
console.log('   QUIZGAMBIT CONTENT AUDIT — seed_questions.json');
console.log('═'.repeat(70));
console.log(`   Questions: ${total} | Categories: ${cats.length} | Themes: ${Object.keys(themeCounts).length}`);
console.log('');

console.log('▌ 1. LENS DISTRIBUTION (13 available)');
Object.entries(lensCounts)
  .sort(([,a], [,b]) => b - a)
  .forEach(([lens, n]) => {
    const pct = ((n / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(n));
    console.log(`   ${lens.padEnd(26)} ${String(n).padStart(2)} (${pct}%) ${bar}`);
  });
if (missingLenses.length) console.log(`   ⚠️ MISSING: ${missingLenses.join(', ')}`);

console.log('');
console.log('▌ 2. FORM DISTRIBUTION (10 available)');
Object.entries(formCounts)
  .sort(([,a], [,b]) => b - a)
  .forEach(([form, n]) => {
    const pct = ((n / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(n));
    console.log(`   ${form.padEnd(30)} ${String(n).padStart(2)} (${pct}%) ${bar}`);
  });
if (missingForms.length) console.log(`   ⚠️ MISSING: ${missingForms.join(', ')}`);

console.log('');
console.log('▌ 3. BACKDOOR DISTRIBUTION (10 available)');
Object.entries(backdoorCounts)
  .sort(([,a], [,b]) => b - a)
  .forEach(([bd, n]) => {
    const pct = ((n / total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(n));
    console.log(`   ${bd.padEnd(26)} ${String(n).padStart(2)} (${pct}%) ${bar}`);
  });
if (missingBackdoors.length) console.log(`   ⚠️ MISSING: ${missingBackdoors.join(', ')}`);

console.log('');
console.log('▌ 4. DIFFICULTY TIER DISTRIBUTION');
Object.entries(diffCounts)
  .sort(([,a], [,b]) => b - a)
  .forEach(([d, n]) => {
    const pct = ((n / total) * 100).toFixed(1);
    console.log(`   ${d.padEnd(16)} ${String(n).padStart(2)} (${pct}%)`);
  });

console.log('');
console.log('▌ 5. PER-THEME CATEGORIES');
Object.entries(themeCounts)
  .sort(([,a], [,b]) => b - a)
  .forEach(([t, n]) => console.log(`   ${t.padEnd(30)} ${n} categories (${n * 5} questions)`));

console.log('');
console.log('▌ 6. LENS VARIETY PER CATEGORY (aim: all 5 unique)');
Object.entries(catLensVariety)
  .sort(([,a], [,b]) => b.total - a.total)
  .forEach(([name, { total: t, uniqueLenses: u }]) => {
    const icon = u === t ? '✅' : u >= 4 ? '⚠️' : '❌';
    console.log(`   ${icon} ${name.padEnd(38)} ${u}/${t} unique lenses`);
  });

console.log('');
console.log('▌ 7. TOP OVERUSED LENS x FORM COMBINATIONS (>1 use)');
topCombos.forEach(([combo, n]) => console.log(`   ${combo.padEnd(48)} ${n}x`));

console.log('');
console.log('▌ 8. TOP OVERUSED LENS x BACKDOOR COMBINATIONS (>1 use)');
topBackdoorCombos.forEach(([combo, n]) => console.log(`   ${combo.padEnd(48)} ${n}x`));

console.log('');
console.log('▌ 9. QUESTION LENGTH ANALYSIS');
console.log(`   Average: ${avgLen.toFixed(1)} words | Min: ${minLen} | Max: ${maxLen}`);
console.log(`   Ideal range: 20-30 words`);

console.log('');
console.log('▌ 10. REPEATED LENSES WITHIN A SINGLE CATEGORY');
if (repeatedLensCategories.length) {
  repeatedLensCategories.forEach(r => console.log(`   ⚠️ ${r}`));
} else {
  console.log('   ✅ All categories have unique lenses (no repeats)');
}

console.log('');
console.log('▌ 11. QUALITY SCORE SUMMARY');
const uniqueLensCount = Object.keys(lensCounts).length;
const uniqueFormCount = Object.keys(formCounts).length;
const uniqueBackdoorCount = Object.keys(backdoorCounts).length;
const lensScore = (uniqueLensCount / ALL_LENSES.length) * 100;
const formScore = (uniqueFormCount / ALL_FORMS.length) * 100;
const bdScore = (uniqueBackdoorCount / ALL_BACKDOORS.length) * 100;
const overall = ((lensScore + formScore + bdScore) / 3).toFixed(1);
console.log(`   Lens coverage: ${uniqueLensCount}/${ALL_LENSES.length} (${lensScore.toFixed(0)}%)`);
console.log(`   Form coverage: ${uniqueFormCount}/${ALL_FORMS.length} (${formScore.toFixed(0)}%)`);
console.log(`   Backdoor coverage: ${uniqueBackdoorCount}/${ALL_BACKDOORS.length} (${bdScore.toFixed(0)}%)`);
console.log(`   Overall diversity: ${overall}%`);
console.log(`   Repeated lenses in categories: ${repeatedLensCategories.length === 0 ? '✅ NONE' : repeatedLensCategories.length + ' instances'}`);
console.log('');
console.log('═'.repeat(70));
