/**
 * Forge Analyzer v2 — Optimized, all-dimension tracking.
 * 
 * Key improvements:
 * 1. Stats cache (.forge_cache.json) — avoids re-reading all questions every run
 * 2. Tracks lens, form, backdoor, AND persona distributions
 * 3. Focused mode uses recommendFullLoadout for full 4D recommendations
 * 4. Brief shows gaps in ALL dimensions, not just lenses
 * 
 * Run: npx tsx scripts/forge/1_analyze_state.ts
 *      npx tsx scripts/forge/1_analyze_state.ts --mode focused --domain science
 *      npx tsx scripts/forge/1_analyze_state.ts --force  (skip cache)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import type { LensType, FormType, BackdoorType } from '../../src/lib/ai/types.js';
import {
  ALL_LENSES, ALL_FORMS, ALL_BACKDOORS, ALL_PERSONAS,
} from '../../src/lib/ai/types.js';
import {
  recommendFullLoadout,
  type FullLoadoutRecommendation,
} from './smart_matcher.js';

// ─── CONFIG ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars.');
  process.exit(1);
}

const BRIEF_PATH = join(__dirname, 'CURRENT_BRIEF.md');
const CACHE_PATH = join(__dirname, '.forge_cache.json');
const BATCH_TEMPLATE_PATH = join(__dirname, 'template.ts');

// ─── TYPES ───────────────────────────────────────────────────────────

interface DBCategory {
  id: string; name: string; main_category: string; description: string;
  data: any[]; tags: string[]; is_global: boolean;
  created_by?: string; lens_mode?: 'diverse' | 'focused'; target_lens?: LensType;
}

interface AllStats {
  totalQuestions: number;
  totalCategories: number;
  lensStats: Record<string, number>;
  formStats: Record<string, number>;
  backdoorStats: Record<string, number>;
  personaStats: Record<string, number>;
  themes: Record<string, number>;
  diverseCount: number;
  focusedCount: number;
}

interface CacheEntry {
  dbFingerprint: string;       // `${totalCategories}-${totalQuestions}`
  computedAt: string;
  stats: AllStats;
}

interface TopicStatus {
  name: string; theme: string; mode: 'diverse' | 'focused';
  targetLens?: LensType; questionCount: number; maxQuestions: number;
  fullness: number; action: 'FILL' | 'FULL' | 'NEW_SUBTOPIC';
  diversity: { lenses: Record<string, number>; forms: Record<string, number>; backdoors: Record<string, number>; repeatedLenses: boolean };
}

interface ForgeBrief {
  header: string;
  globalStats: AllStats;
  dimensionGaps: { lenses: string[]; forms: string[]; backdoors: string[]; personas: string[] };
  recommendations: {
    existingMatches: { name: string; theme: string; mode: string; questionCount: number; maxQuestions: number; willAppend: boolean }[];
    fillExisting: TopicStatus[];
    newFocusedTopics: { domain: string; suggestedName: string; loadouts: FullLoadoutRecommendation[] }[];
    newDiverseTopics: { theme: string; suggestion: string; suggestedNames: string[] }[];
    underutilized: { dimension: string; items: string; suggestion: string }[];
  };
  customTopicName?: string;
  commandAliases: string[];
}

// ─── MAIN ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const modeFlag = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : null;
  const domainFlag = args.includes('--domain') ? args[args.indexOf('--domain') + 1] : null;
  const topicFlag = args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null;
  const topicNameFlag = args.includes('--topic-name') ? args[args.indexOf('--topic-name') + 1] : null;
  const forceFlag = args.includes('--force');

  console.log('🔍 Forge Analyzer v2 — scanning...\n');

  // ─── CACHE CHECK ───
  let allCategories: DBCategory[];
  let stats: AllStats;

  if (!forceFlag) {
    const cached = loadCache();
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Single lightweight query: just count categories
    const { count: catCount, error: countErr } = await supabase
      .from('categories_library')
      .select('*', { count: 'exact', head: true });

    if (countErr || !catCount) {
      return analyzeFromSeed(modeFlag, domainFlag, topicFlag);
    }

    const fingerprint = String(catCount);
    if (cached && cached.dbFingerprint === fingerprint && !domainFlag && !topicFlag) {
      console.log('📦 Cache hit (unchanged since ' + cached.computedAt + ')\n');
      stats = cached.stats;
      // Need categories for brief — do lightweight metadata fetch (no data field)
      const { data: briefRows } = await supabase
        .from('categories_library')
        .select('id, name, main_category, description');
      allCategories = (briefRows || []).map((r: any) => ({ ...r, data: [], tags: [], is_global: true }));
      const brief = analyze(allCategories, stats, modeFlag, domainFlag, topicFlag, topicNameFlag);
      writeBrief(brief);
      ensureTemplate();
      return;
    }
  }

  // Full data fetch (only when cache miss or filtered request)
  console.log('📡 Fetching full data from DB...\n');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: rows, error } = await supabase
    .from('categories_library')
    .select('id, name, main_category, description, data, tags, is_global, lens_mode, target_lens');

  if (error || !rows) {
    console.log('DB read failed, using seed...');
    return analyzeFromSeed(modeFlag, domainFlag, topicFlag);
  }

  allCategories = rows as unknown as DBCategory[];
  console.log(`📊 Loaded ${allCategories.length} categories`);

  stats = computeAllStats(allCategories);

  // Save cache
  const fingerprint = `${allCategories.length}-${stats.totalQuestions}`;
  writeFileSync(CACHE_PATH, JSON.stringify({
    dbFingerprint: fingerprint,
    computedAt: new Date().toISOString(),
    stats,
  }, null, 2));

  const brief = analyze(allCategories, stats, modeFlag, domainFlag, topicFlag, topicNameFlag);
  writeBrief(brief);
  ensureTemplate();
}

// ─── COMPUTE ALL STATS ───────────────────────────────────────────────

function computeAllStats(categories: DBCategory[]): AllStats {
  const allQs = categories.flatMap(c => c.data || []);
  const stats: AllStats = {
    totalQuestions: allQs.length,
    totalCategories: categories.length,
    lensStats: countField(allQs, 'lens'),
    formStats: countField(allQs, 'form'),
    backdoorStats: countField(allQs, 'backdoor_type'),
    personaStats: {},
    themes: {},
    diverseCount: 0,
    focusedCount: 0,
  };

  // Persona detection: question data may have a 'persona' field, or we infer from tags
  allQs.forEach((q: any) => {
    if (q.persona) stats.personaStats[q.persona] = (stats.personaStats[q.persona] || 0) + 1;
  });

  categories.forEach(c => {
    stats.themes[c.main_category] = (stats.themes[c.main_category] || 0) + 1;
    if (c.lens_mode === 'focused') stats.focusedCount++;
    else stats.diverseCount++;
  });

  return stats;
}

// ─── ANALYZE ─────────────────────────────────────────────────────────

function analyze(
  categories: DBCategory[],
  stats: AllStats,
  modeFilter?: string | null,
  domainFilter?: string | null,
  topicFilter?: string | null,
  customTopicName?: string | null,
): ForgeBrief {
  // Per-topic status
  const topics: TopicStatus[] = categories.map(c => {
    const data = c.data || [];
    const mode = c.lens_mode ?? 'diverse';
    const maxQ = mode === 'focused' ? 30 : 5;
    const lensCount: Record<string, number> = {};
    const formCount: Record<string, number> = {};
    const bdCount: Record<string, number> = {};
    data.forEach((q: any) => {
      lensCount[q.lens] = (lensCount[q.lens] || 0) + 1;
      formCount[q.form] = (formCount[q.form] || 0) + 1;
      bdCount[q.backdoor_type] = (bdCount[q.backdoor_type] || 0) + 1;
    });
    const hasRepeat = Object.values(lensCount).some(n => n > 1);
    const fullness = data.length / maxQ;

    return {
      name: c.name, theme: c.main_category, mode: mode as 'diverse' | 'focused',
      targetLens: c.target_lens as LensType | undefined,
      questionCount: data.length, maxQuestions: maxQ, fullness,
      action: fullness >= 1 ? 'FULL' : fullness >= 0.5 ? 'FILL' : 'NEW_SUBTOPIC',
      diversity: { lenses: lensCount, forms: formCount, backdoors: bdCount, repeatedLenses: hasRepeat },
    };
  });

  // Dimension gaps
  const dimensionGaps = {
    lenses: ALL_LENSES.filter(l => !stats.lensStats[l]),
    forms: ALL_FORMS.filter(l => !stats.formStats[l]),
    backdoors: ALL_BACKDOORS.filter(l => !stats.backdoorStats[l]),
    personas: ALL_PERSONAS.filter(l => !stats.personaStats[l]),
  };

  // Smart routing
  let modeMismatchWarning = '';
  if (modeFilter && topicFilter) {
    const exactMatch = topics.find(t => t.name.toLowerCase() === topicFilter.toLowerCase());
    if (exactMatch && exactMatch.mode !== modeFilter) {
      modeMismatchWarning = `\n> ⚠️ "${topicFilter}" exists as **${exactMatch.mode}** mode. Creating **${modeFilter}** sibling below.`;
    }
  }

  // Filter
  let filteredTopics = topics;
  if (domainFilter) filteredTopics = topics.filter(t => t.theme.toLowerCase().includes(domainFilter.toLowerCase()));
  if (topicFilter && modeFilter === 'fill') {
    filteredTopics = topics.filter(t => t.name.toLowerCase().includes(topicFilter.toLowerCase()) && t.action === 'FILL');
  } else if (topicFilter) {
    filteredTopics = topics.filter(t => t.name.toLowerCase().includes(topicFilter.toLowerCase()));
  }

  const fillExisting = filteredTopics.filter(t => t.action === 'FILL');
  const themesNeedingDiverse = findThemesNeedingDiverse(topics, stats);

  // ─── DUPLICATE DETECTION: exact name matches ───
  let existingMatches: ForgeBrief['recommendations']['existingMatches'] = [];
  if (topicFilter) {
    existingMatches = topics
      .filter(t => t.name.toLowerCase().includes(topicFilter.toLowerCase()))
      .map(t => ({
        name: t.name, theme: t.theme, mode: t.mode,
        questionCount: t.questionCount, maxQuestions: t.maxQuestions,
        willAppend: t.questionCount < t.maxQuestions,
      }));
  }

  // Focused mode: use recommendFullLoadout for 4D recommendations
  let newFocusedTopics: ForgeBrief['recommendations']['newFocusedTopics'] = [];
  if (domainFilter) {
    const loadouts = recommendFullLoadout({
      domain: domainFilter,
      dbLensStats: stats.lensStats as any,
      dbFormStats: stats.formStats as any,
      dbBackdoorStats: stats.backdoorStats as any,
      recentlyUsed: { lenses: [], forms: [], backdoors: [] },
    }, 5);
    const bestLens = loadouts[0]?.lens || 'The Unexpected';
    // Suggest a topic name from domain + lens
    const suggestedName = customTopicName
      || generateTopicName(domainFilter, 'focused', bestLens);
    newFocusedTopics = [{ domain: domainFilter, suggestedName, loadouts }];
  }

  // Underutilized across ALL dimensions
  const underutilized: ForgeBrief['recommendations']['underutilized'] = [];
  const underRepLenses = Object.entries(stats.lensStats).filter(([, n]) => n < 3).map(([l]) => l);
  const underRepForms = Object.entries(stats.formStats).filter(([, n]) => n < 3).map(([l]) => l);
  const underRepBds = Object.entries(stats.backdoorStats).filter(([, n]) => n < 3).map(([l]) => l);
  if (underRepLenses.length) underutilized.push({ dimension: 'Lenses', items: underRepLenses.join(', '), suggestion: 'Consider focused topics for these' });
  if (underRepForms.length) underutilized.push({ dimension: 'Forms', items: underRepForms.join(', '), suggestion: 'Prioritize in next batch generation' });
  if (underRepBds.length) underutilized.push({ dimension: 'Backdoors', items: underRepBds.join(', '), suggestion: 'Prioritize in next batch generation' });

  return {
    header: buildHeader(modeFilter, domainFilter, topicFilter, customTopicName) + modeMismatchWarning,
    globalStats: stats,
    dimensionGaps,
    recommendations: {
      existingMatches, fillExisting, newFocusedTopics,
      newDiverseTopics: themesNeedingDiverse, underutilized,
    },
    customTopicName: customTopicName || undefined,
    commandAliases: buildAliases(),
  };
}

// ─── SEED FALLBACK ───────────────────────────────────────────────────

function analyzeFromSeed(modeFilter?: string | null, domainFilter?: string | null, topicFilter?: string | null, topicNameFilter?: string | null) {
  const seed = JSON.parse(readFileSync(join(__dirname, '..', '..', 'seed_questions.json'), 'utf-8'));
  const cats = seed.categories.map((c: any) => ({
    id: 'seed', name: c.name, main_category: c.main_category, description: c.description,
    data: c.data || [], tags: c.tags || [], is_global: true,
    lens_mode: 'diverse' as const, target_lens: undefined,
  }));
  const stats = computeAllStats(cats);
  const brief = analyze(cats, stats, modeFilter, domainFilter, topicFilter, topicNameFilter);
  writeBrief(brief);
  ensureTemplate();
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function loadCache(): CacheEntry | null {
  if (!existsSync(CACHE_PATH)) return null;
  try { return JSON.parse(readFileSync(CACHE_PATH, 'utf-8')); }
  catch { return null; }
}

function countField(questions: any[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  questions.forEach((q: any) => { const val = q[field]; if (val) counts[val] = (counts[val] || 0) + 1; });
  return counts;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function findThemesNeedingDiverse(topics: TopicStatus[], stats: AllStats) {
  const suggestions: { theme: string; suggestion: string; suggestedNames: string[] }[] = [];
  const diverseByTheme: Record<string, number> = {};
  topics.forEach(t => { if (t.mode === 'diverse') diverseByTheme[t.theme] = (diverseByTheme[t.theme] || 0) + 1; });
  for (const [theme, count] of Object.entries(stats.themes)) {
    if ((diverseByTheme[theme] || 0) < 3 && count < 5) {
      suggestions.push({
        theme,
        suggestion: `Add diverse topic under "${theme}" (${diverseByTheme[theme] || 0} diverse, ${count} total)`,
        suggestedNames: [
          `${capitalize(theme)} Curiosities`,
          `${capitalize(theme)} Mixed Bag`,
          `${capitalize(theme)} Grab Bag`,
        ],
      });
    }
  }
  return suggestions;
}

function buildHeader(mode?: string | null, domain?: string | null, topic?: string | null, topicName?: string | null): string {
  if (topicName) return `# FORGE BRIEF — Topic: **${topicName}** (${mode || 'auto'})`;
  if (topic) return `# FORGE BRIEF — Topic: ${topic} (${mode || 'auto'})`;
  if (domain && mode) return `# FORGE BRIEF — ${mode.toUpperCase()} | Domain: ${domain}`;
  if (domain) return `# FORGE BRIEF — Domain: ${domain}`;
  return '# FORGE BRIEF — Full System Scan';
}

/** Generate a human-readable topic name from domain + mode + lens */
function generateTopicName(domain: string, mode: string, lens?: string): string {
  const domainCap = capitalize(domain);
  if (mode === 'focused' && lens) {
    // Map lens to a shorter, punchy name suffix
    const suffixMap: Record<string, string> = {
      'Origin Story': 'Origins', 'The Unexpected': 'Surprises',
      'The Human Element': 'Stories', 'Numbers & Scale': 'By The Numbers',
      'The Rivalry': 'Rivalries', 'The Oddity': 'Oddities',
      'Behind the Scenes': 'Behind The Scenes', 'The Connection': 'Connections',
      'What If?': 'What If', 'The Legacy': 'Legacies',
      'The Butterfly Effect': 'Butterfly Effects', 'The Evolution': 'Evolutions',
      'The Cultural Impact': 'Cultural Impact',
    };
    const suffix = suffixMap[lens] || lens;
    return `${domainCap} ${suffix}`;
  }
  return `${domainCap} Deep Dive`;
}

function buildAliases(): string[] {
  return [
    '```bash',
    "alias forge='npx tsx scripts/forge/1_analyze_state.ts'",
    "alias forge-focused='npx tsx scripts/forge/1_analyze_state.ts --mode focused --domain'",
    "alias forge-diverse='npx tsx scripts/forge/1_analyze_state.ts --mode diverse --topic'",
    "alias forge-fill='npx tsx scripts/forge/1_analyze_state.ts --mode fill --topic'",
    "alias forge-import='npx tsx scripts/forge/2_import_batch.ts'",
    '```',
  ];
}

// ─── WRITE BRIEF ─────────────────────────────────────────────────────

function writeBrief(brief: ForgeBrief) {
  let md = brief.header + '\n\n';
  md += `> Generated: ${new Date().toISOString()}\n\n---\n\n`;

  // ── GLOBAL STATS ──
  md += '## 📊 Database State\n\n';
  md += `**${brief.globalStats.totalQuestions}** questions | **${brief.globalStats.totalCategories}** categories | **${Object.keys(brief.globalStats.themes).length}** themes | **${brief.globalStats.diverseCount}** diverse + **${brief.globalStats.focusedCount}** focused\n\n`;

  // ── ALL 4 DIMENSIONS ──
  md += '### Lens Distribution\n';
  Object.entries(brief.globalStats.lensStats).sort(([,a], [,b]) => b - a).forEach(([l, n]) => md += `- ${l}: ${n}\n`);
  if (brief.dimensionGaps.lenses.length) md += `\n⚠️ **Missing:** ${brief.dimensionGaps.lenses.join(', ')}\n`;

  md += '\n### Form Distribution\n';
  Object.entries(brief.globalStats.formStats).sort(([,a], [,b]) => b - a).forEach(([l, n]) => md += `- ${l}: ${n}\n`);
  if (brief.dimensionGaps.forms.length) md += `\n⚠️ **Missing:** ${brief.dimensionGaps.forms.join(', ')}\n`;

  md += '\n### Backdoor Distribution\n';
  Object.entries(brief.globalStats.backdoorStats).sort(([,a], [,b]) => b - a).forEach(([l, n]) => md += `- ${l}: ${n}\n`);
  if (brief.dimensionGaps.backdoors.length) md += `\n⚠️ **Missing:** ${brief.dimensionGaps.backdoors.join(', ')}\n`;

  if (Object.keys(brief.globalStats.personaStats).length > 0) {
    md += '\n### Persona Distribution\n';
    Object.entries(brief.globalStats.personaStats).sort(([,a], [,b]) => b - a).forEach(([l, n]) => md += `- ${l}: ${n}\n`);
  }

  // ── UNDERUTILIZED ──
  const { underutilized } = brief.recommendations;
  if (underutilized.length > 0) {
    md += '\n---\n\n## ⚡ Underutilized Dimensions\n\n';
    underutilized.forEach(u => md += `- **${u.dimension}:** ${u.items} → ${u.suggestion}\n`);
  }

  // ── EXISTING MATCHES (duplicate detection) ──
  const { existingMatches, fillExisting, newFocusedTopics, newDiverseTopics } = brief.recommendations;
  if (existingMatches.length > 0) {
    md += '\n---\n\n## 📋 Existing Topic Matches\n\n';
    md += '| Topic | Theme | Mode | Questions | Action |\n';
    md += '|-------|-------|------|-----------|--------|\n';
    existingMatches.forEach(m => {
      const action = m.willAppend ? `➕ APPEND (+${m.maxQuestions - m.questionCount} slots)` : '✅ FULL';
      md += `| **${m.name}** | ${m.theme} | ${m.mode} | ${m.questionCount}/${m.maxQuestions} | ${action} |\n`;
    });      const hasAppendable = existingMatches.some(m => m.willAppend);
      if (hasAppendable) {
        md += '\n> 💡 To append to an existing topic, re-run with `--topic "Topic Name" --mode fill`\n';
      } else {
        md += '\n> ⚠️ All matching topics are full. Create a new sibling topic instead.\n';
      }
  }

  // ── CUSTOM TOPIC NAME ──
  if (brief.customTopicName) {
    md += '\n---\n\n## ✏️ Custom Topic Name\n\n';
    md += `Using: **${brief.customTopicName}**\n\n`;
    md += '> The dimensions, lens recommendation, and loadout below are recalculated for this topic.\n';
  }

  // ── FILL EXISTING ──
  if (fillExisting.length > 0) {
    md += '\n---\n\n## 📝 Fill Existing Topics\n\n';
    fillExisting.forEach(t => md += `- **${t.name}** (${t.theme}, ${t.mode}) — ${t.questionCount}/${t.maxQuestions}, +${t.maxQuestions - t.questionCount} needed\n`);
  }

  // ── NEW FOCUSED (with full 4D loadouts) ──
  if (newFocusedTopics.length > 0) {
    md += '\n---\n\n## 🎯 New Focused Topics\n\n';
    newFocusedTopics.forEach(ft => {
      md += `**Domain: ${ft.domain}**\n\n`;
      md += `🏷️ Suggested name: **${ft.suggestedName}**`;
      if (!brief.customTopicName) {
        md += `\n> 💡 Re-run with \`--topic-name "Your Name"\` to customize\n`;
      }
      md += '\n\n| # | Lens | Form | Backdoor | Persona | Score |\n';
      md += '|---|------|------|----------|---------|-------|\n';
      ft.loadouts.forEach((l, i) => {
        md += `| ${i + 1} | ${l.lens} | ${l.form} | ${l.backdoor} | ${l.persona} | ${l.score.toFixed(1)} |\n`;
      });
      md += '\n';
    });
  }

  // ── NEW DIVERSE ──
  if (newDiverseTopics.length > 0) {
    md += '\n---\n\n## 🔀 New Diverse Topics\n\n';
    newDiverseTopics.forEach(dt => {
      md += `- ${dt.suggestion}\n`;
      if (dt.suggestedNames?.length) {
        md += `  Suggested names: ${dt.suggestedNames.map(n => `"${n}"`).join(', ')}\n`;
      }
    });
  }

  // ── COMMANDS ──
  md += '\n---\n\n## 💻 Commands\n\n';
  md += brief.commandAliases.join('\n') + '\n';

  writeFileSync(BRIEF_PATH, md);
  console.log(`✅ Brief: ${BRIEF_PATH}`);
}

// ─── TEMPLATE ────────────────────────────────────────────────────────

function ensureTemplate() {
  if (existsSync(BATCH_TEMPLATE_PATH)) return;
  writeFileSync(BATCH_TEMPLATE_PATH, `/**
 * Forge Batch Template
 */
import type { QuizGambitQuestion } from '../../src/lib/ai/types';

function q(lens: string, form: string, questionText: string, answerText: string,
  options: [string, string, string, string], backdoorType: string, backdoorExplanation: string,
  points: number, difficultyTier: string, tag?: string): QuizGambitQuestion {
  return { lens, form, question_text: questionText, answer_text: answerText,
    options, backdoor_type: backdoorType, backdoor_explanation: backdoorExplanation,
    points, difficulty_tier: difficultyTier, tag } as QuizGambitQuestion;
}

function cat(name: string, mainCategory: string, description: string,
  lensMode: 'diverse' | 'focused', targetLens: string | undefined,
  questions: QuizGambitQuestion[], tags: string[] = []) {
  return { name, main_category: mainCategory, description,
    lens_mode: lensMode, target_lens: targetLens, data: questions, tags };
}

// TODO: Replace with generated content
export const batch = [ cat('Example', 'General', '', 'diverse', undefined, [
  q('Origin Story', 'Form 5 (Direct Narrative)', '...', 'Answer',
    ['A','B','C','D'], 'Everyday Link', '...', 100, 'easy'),
], []) ];
export const meta = { generatedAt: '', batchNumber: 0, mode: 'diverse' };
`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
