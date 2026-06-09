/**
 * Forge CLI — Interactive command center for QuizGambit content management.
 *
 * Commands:
 *   list-themes                           Show all themes with topic/question counts
 *   list-topics [--theme "Science"]       Show topics in a theme
 *   pick [--theme "Science"]              Interactive: select topic → auto-generate brief
 *   show-topic "Topic Name"               Full detail for one topic
 *   search-topics "term"                  Fuzzy search topic names
 *   stats                                 Quick overview (no full brief)
 *   create-theme "Music"                  Register a new theme (creates empty topic)
 *   create-topic "Name" --theme "X"       Create new topic with smart defaults
 *             [--mode focused|diverse] [--lens "The Unexpected"]
 *   rename-topic "Old" --to "New"         Rename a topic
 *   delete-topic "Topic Name"             Delete with safety confirmation
 *   generate "Topic Name"                 Direct: analyze + write brief for one topic
 *   review "Topic Name"                   Audit questions for answer leaks, banned starters, diversity, score
 *   suggest-topics "Theme"                AI-suggest 5 subtopics for a theme (like Themed Mode in GUI)
 *             [--provider openai|gemini] [--model "..."] [--count 5]
 *             [--types "Core,Niche"] [--domains "Facts"] [--styles "Classic"]
 *   suggest-topics --matrix               Show the 3D theme matrix (Types/Domains/Styles)
 *
 * Run: npx tsx scripts/forge/0_forge_cli.ts <command> [options]
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LensType, TopicType, KnowledgeDomain, QuizStyle, FormType, BackdoorType, PlayerPersona, GameMode } from '../../src/lib/ai/types.js';
import { ALL_LENSES, ALL_FORMS, ALL_BACKDOORS, ALL_PERSONAS, ALL_TOPIC_TYPES, ALL_KNOWLEDGE_DOMAINS, ALL_QUIZ_STYLES } from '../../src/lib/ai/types.js';
import { generateThemeSubtopics } from '../../src/lib/ai/themes.js';
import { generateAdminQuizQuestions } from '../../src/lib/ai.js';
import { determinePhase, PHASE_ICONS } from '../../src/lib/phaseDiscovery.js';

// ─── CONFIG ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYZER_PATH = join(__dirname, '1_analyze_state.ts');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_WRITE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars.');
  process.exit(1);
}

const readClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const writeClient = createClient(SUPABASE_URL, SUPABASE_WRITE_KEY || SUPABASE_ANON_KEY);

const MAX_FOCUSED_Q = 30;
const MAX_DIVERSE_Q = 5;

// ─── TYPES ───────────────────────────────────────────────────────────

interface DBRow {
  id: string;
  name: string;
  main_category: string;
  description: string;
  data: any[];
  tags: string[];
  is_global: boolean;
  lens_mode: 'diverse' | 'focused';
  target_lens?: LensType;
}

interface ThemeStats {
  topics: number;
  questions: number;
  diverse: number;
  focused: number;
}

// ─── ARGS ────────────────────────────────────────────────────────────

const ARGS = process.argv.slice(2);

// ─── MAIN ────────────────────────────────────────────────────────────

async function main() {
  const command = ARGS[0];

  if (!command) {
    showHelp();
    return;
  }

  switch (command) {
    case 'list-themes':
    case 'themes':
      await cmdListThemes();
      break;

    case 'list-topics':
    case 'topics':
      await cmdListTopics();
      break;

    case 'pick':
      await cmdPick();
      break;

    case 'show-topic':
    case 'show':
      await cmdShowTopic(ARGS[1]);
      break;

    case 'search-topics':
    case 'search':
      await cmdSearchTopics(ARGS[1]);
      break;

    case 'stats':
      await cmdStats();
      break;

    case 'generate':
      await cmdGenerate(ARGS[1]);
      break;

    case 'create-theme':
      await cmdCreateTheme(ARGS[1]);
      break;

    case 'create-topic':
    case 'create':
      await cmdCreateTopic(ARGS[1]);
      break;

    case 'rename-topic':
    case 'rename':
      await cmdRenameTopic(ARGS[1]);
      break;

    case 'delete-topic':
    case 'delete':
      await cmdDeleteTopic(ARGS[1]);
      break;

    case 'review':
    case 'audit':
      await cmdReview(ARGS[1]);
      break;

    case 'suggest-topics':
    case 'suggest':
      await cmdSuggestTopics(ARGS[1]);
      break;

    case 'generate-theme':
    case 'gen-theme':
      await cmdGenerateTheme(ARGS[1]);
      break;

    default:
      console.log(`❌ Unknown command: ${command}\n`);
      showHelp();
  }
}

// ─── HELP ────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
🏗️  Forge CLI — Content Management Commands
${'─'.repeat(50)}

📊 BROWSE:
  list-themes          Show all themes with topic/question counts
  list-topics          Show topics (--theme "Science" to filter)
  pick --theme "X"     Interactive: numbered list → select → generate brief
  show-topic "Name"    Full detail for one topic
  search-topics "term" Fuzzy search topic names
  stats                Quick overview (no full brief)

⚡ GENERATE:
  generate "Name"               Analyze + write CURRENT_BRIEF.md for a topic
  generate-theme "Theme"        AI-generate questions for ALL topics in a theme
    [--provider openai|gemini] [--model "..."] [--max 30] [--batch 5]

➕ CREATE:
  create-theme "Music"             Register a new theme
  create-topic "Name" --theme "X"  Create new topic
    [--mode focused|diverse] [--lens "The Unexpected"]

✏️ EDIT:
  rename-topic "Old" --to "New"   Rename a topic
  delete-topic "Name"             Delete with safety confirmation

🔍 REVIEW:
  review "Topic Name"             Audit questions for answer leaks, banned starters, score

🧩 THEME MATRIX (suggest-topics):
  --types "Core,Niche,Human"     6 available: Core Niche Human Surprise Scale Mystery
  --domains "Facts,Stories"      5 available: Facts Stories Concepts Data Connections
  --styles "Classic,Trick"       4 available: Classic Trick Visual Timeline
  --matrix                        Show the full 3D matrix with descriptions

💡 Tips:
  • Use 'pick' to browse and select — fastest workflow
  • 'generate' after 'create-topic' to start writing questions
  • 'suggest-topics "Science"' to get AI-suggested subtopics from a theme
  • 'generate-theme "Indian Premier League"' to fill ALL topics in a theme
  • All commands auto-detect focused (30q max) vs diverse (5q max)
`);
}

// ─── OPT PARSER ──────────────────────────────────────────────────────

function getOpt(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  const val = args[idx + 1];
  if (!val || val.startsWith('--')) return null;
  return val;
}

// ─── FETCH HELPERS ───────────────────────────────────────────────────

async function fetchAllRows(): Promise<DBRow[]> {
  const { data, error } = await readClient
    .from('categories_library')
    .select('id, name, main_category, description, data, tags, is_global, lens_mode, target_lens');

  if (error) {
    console.error('❌ DB read error:', error.message);
    return [];
  }
  return (data || []) as unknown as DBRow[];
}

async function fetchTopicsByTheme(theme: string): Promise<DBRow[]> {
  const { data, error } = await readClient
    .from('categories_library')
    .select('id, name, main_category, description, data, tags, is_global, lens_mode, target_lens')
    .ilike('main_category', `%${theme}%`);

  if (error) {
    console.error('❌ DB read error:', error.message);
    return [];
  }
  return (data || []) as unknown as DBRow[];
}

async function fetchTopicByName(name: string): Promise<DBRow | null> {
  const { data, error } = await readClient
    .from('categories_library')
    .select('*')
    .eq('name', name)
    .maybeSingle();

  if (error) {
    console.error('❌ DB read error:', error.message);
    return null;
  }
  return data as unknown as DBRow | null;
}

// ─── COMMAND: list-themes ────────────────────────────────────────────

async function cmdListThemes() {
  const rows = await fetchAllRows();
  if (rows.length === 0) {
    console.log('📭 No categories found in database.');
    return;
  }

  const themeMap: Record<string, ThemeStats> = {};
  for (const row of rows) {
    const theme = row.main_category || 'Uncategorized';
    if (!themeMap[theme]) {
      themeMap[theme] = { topics: 0, questions: 0, diverse: 0, focused: 0 };
    }
    themeMap[theme].topics++;
    themeMap[theme].questions += (row.data || []).length;
    if (row.lens_mode === 'focused') themeMap[theme].focused++;
    else themeMap[theme].diverse++;
  }

  console.log(`\n📊 ${Object.keys(themeMap).length} themes | ${rows.length} topics | ${rows.reduce((s, r) => s + (r.data || []).length, 0)} questions\n`);
  console.log(
    'Theme'.padEnd(25) +
    'Topics'.padStart(8) +
    'Questions'.padStart(12) +
    'Diverse'.padStart(9) +
    'Focused'.padStart(9)
  );
  console.log('─'.repeat(65));

  const sorted = Object.entries(themeMap).sort(([, a], [, b]) => b.topics - a.topics);
  for (const [theme, stats] of sorted) {
    console.log(
      theme.slice(0, 24).padEnd(25) +
      String(stats.topics).padStart(8) +
      String(stats.questions).padStart(12) +
      String(stats.diverse).padStart(9) +
      String(stats.focused).padStart(9)
    );
  }
  console.log('');
}

// ─── COMMAND: list-topics ────────────────────────────────────────────

async function cmdListTopics() {
  const theme = getOpt(ARGS, '--theme');
  const rows = theme ? await fetchTopicsByTheme(theme) : await fetchAllRows();

  if (rows.length === 0) {
    console.log(`📭 No topics found${theme ? ` in "${theme}"` : ''}.`);
    return;
  }

  const headerMsg = theme ? `Topics in "${theme}"` : 'All topics';
  console.log(`\n📋 ${headerMsg} — ${rows.length} topics\n`);

  console.log(
    '#'.padStart(4) +
    'Topic'.padEnd(30) +
    'Theme'.padEnd(20) +
    'Mode'.padStart(10) +
    'Questions'.padStart(12) +
    'Status'.padStart(10)
  );
  console.log('─'.repeat(88));

  rows.forEach((row, i) => {
    const qCount = (row.data || []).length;
    const maxQ = row.lens_mode === 'focused' ? MAX_FOCUSED_Q : MAX_DIVERSE_Q;
    const status = qCount >= maxQ ? '✅ FULL' : qCount > 0 ? '✏️ FILL' : '🆕 EMPTY';
    console.log(
      String(i + 1).padStart(4) +
      row.name.slice(0, 29).padEnd(30) +
      (row.main_category || '-').slice(0, 19).padEnd(20) +
      row.lens_mode.padStart(10) +
      `${qCount}/${maxQ}`.padStart(12) +
      status.padStart(10)
    );
  });
  console.log('');
}

// ─── COMMAND: pick (interactive) ─────────────────────────────────────

async function cmdPick() {
  const theme = getOpt(ARGS, '--theme');
  const rows = theme ? await fetchTopicsByTheme(theme) : await fetchAllRows();

  if (rows.length === 0) {
    console.log(`📭 No topics found${theme ? ` in "${theme}"` : ''}.`);
    return;
  }

  const headerMsg = theme ? `"${theme}"` : 'all themes';
  console.log(`\n🔍 Topics in ${headerMsg}:\n`);

  rows.forEach((row, i) => {
    const qCount = (row.data || []).length;
    const maxQ = row.lens_mode === 'focused' ? MAX_FOCUSED_Q : MAX_DIVERSE_Q;
    const icon = qCount >= maxQ ? '✅' : qCount > 0 ? '📝' : '🆕';
    console.log(`  ${String(i + 1).padStart(2)}. ${icon} [${row.lens_mode}] ${row.name} (${qCount}/${maxQ} questions)`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await rl.question('\n👉 Pick a number (or q to quit): ');
  rl.close();

  if (answer.toLowerCase() === 'q') {
    console.log('👋 Bye!');
    return;
  }

  const index = parseInt(answer) - 1;
  if (isNaN(index) || index < 0 || index >= rows.length) {
    console.log('❌ Invalid selection.');
    return;
  }

  const selected = rows[index];
  const qCount = (selected.data || []).length;
  const maxQ = selected.lens_mode === 'focused' ? MAX_FOCUSED_Q : MAX_DIVERSE_Q;

  // Show detail
  console.log(`\n📋 ${selected.name}`);
  console.log(`   Theme:      ${selected.main_category}`);
  console.log(`   Mode:       ${selected.lens_mode}${selected.target_lens ? ` → ${selected.target_lens}` : ''}`);
  console.log(`   Questions:  ${qCount}/${maxQ}`);
  console.log(`   Description: ${selected.description || '(none)'}`);

  if (qCount >= maxQ) {
    console.log(`\n   ⚠️  This topic is FULL. Generate a new sibling topic instead.`);
    console.log(`   💡 Run: npx tsx scripts/forge/0_forge_cli.ts create-topic "New Name" --theme "${selected.main_category}"`);
    return;
  }

  // Confirm
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = await rl2.question(`\n🖊️  Generate ${maxQ - qCount} questions for "${selected.name}"? (y/N): `);
  rl2.close();

  if (confirm.toLowerCase() !== 'y') {
    console.log('👋 Cancelled.');
    return;
  }

  // Spin up the analyzer for this topic
  // For diverse topics, use 'focused' mode to trigger smart routing (loadout recommendations)
  // For focused topics, use their actual mode
  const analyzerMode = selected.lens_mode === 'focused' ? 'focused' : 'focused';
  console.log(`\n🚀 Running analyzer for "${selected.name}" (${analyzerMode} mode)...\n`);

  const result = spawnSync('npx', [
    'tsx', ANALYZER_PATH,
    '--topic', selected.name,
    '--mode', analyzerMode,
  ], { stdio: 'inherit', cwd: join(__dirname, '..', '..') });

  if (result.status !== 0) {
    console.log('\n⚠️  Analyzer had an issue. Check the output above.');
  } else {
    console.log('\n✅ Brief generated! Paste CURRENT_BRIEF.md into Codebuff chat to write questions.');
    console.log('   Then run: npx tsx scripts/forge/2_import_batch.ts scripts/forge/batches/batch_XXX.ts');
  }
}

// ─── COMMAND: show-topic ─────────────────────────────────────────────

async function cmdShowTopic(name?: string) {
  if (!name) {
    console.log('❌ Usage: forge show-topic "Topic Name"');
    return;
  }

  const row = await fetchTopicByName(name);
  if (!row) {
    console.log(`❌ Topic not found: "${name}"`);
    return;
  }

  const qCount = (row.data || []).length;
  const maxQ = row.lens_mode === 'focused' ? MAX_FOCUSED_Q : MAX_DIVERSE_Q;

  // Compute diversity stats
  const lensCount: Record<string, number> = {};
  const formCount: Record<string, number> = {};
  const bdCount: Record<string, number> = {};
  (row.data || []).forEach((q: any) => {
    if (q.lens) lensCount[q.lens] = (lensCount[q.lens] || 0) + 1;
    if (q.form) formCount[q.form] = (formCount[q.form] || 0) + 1;
    if (q.backdoor_type) bdCount[q.backdoor_type] = (bdCount[q.backdoor_type] || 0) + 1;
  });

  console.log(`\n📋 ${row.name}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  ID:          ${row.id}`);
  console.log(`  Theme:       ${row.main_category}`);
  console.log(`  Mode:        ${row.lens_mode}`);
  console.log(`  Target Lens: ${row.target_lens || '(none — diverse)'}`);
  console.log(`  Questions:   ${qCount}/${maxQ} (${((qCount / maxQ) * 100).toFixed(0)}% full)`);
  console.log(`  Description: ${row.description || '(none)'}`);
  console.log(`  Tags:        ${(row.tags || []).join(', ') || '(none)'}`);
  console.log(`  Is Global:   ${row.is_global ? 'Yes' : 'No'}`);

  if (qCount > 0) {
    console.log(`\n  📊 Diversity:`);
    console.log(`     Lenses:    ${Object.keys(lensCount).length} unique`);
    Object.entries(lensCount).sort(([, a], [, b]) => b - a).forEach(([l, n]) => {
      console.log(`       ${l}: ${n}`);
    });
    console.log(`     Forms:     ${Object.keys(formCount).length} unique`);
    Object.entries(formCount).sort(([, a], [, b]) => b - a).forEach(([f, n]) => {
      console.log(`       ${f}: ${n}`);
    });
    console.log(`     Backdoors: ${Object.keys(bdCount).length} unique`);
    Object.entries(bdCount).sort(([, a], [, b]) => b - a).forEach(([b, n]) => {
      console.log(`       ${b}: ${n}`);
    });
  }

  if (qCount < maxQ) {
    console.log(`\n  💡 Still has ${maxQ - qCount} slots. Run: forge generate "${row.name}"`);
  }
  console.log('');
}

// ─── COMMAND: search-topics ──────────────────────────────────────────

async function cmdSearchTopics(term?: string) {
  if (!term) {
    console.log('❌ Usage: forge search-topics "search term"');
    return;
  }

  const { data, error } = await readClient
    .from('categories_library')
    .select('id, name, main_category, data, lens_mode')
    .ilike('name', `%${term}%`);

  if (error) {
    console.error('❌ Search error:', error.message);
    return;
  }

  const rows = (data || []) as any[];
  if (rows.length === 0) {
    console.log(`📭 No topics matching "${term}".`);
    return;
  }

  console.log(`\n🔍 ${rows.length} results for "${term}":\n`);
  console.log('Topic'.padEnd(35) + 'Theme'.padEnd(22) + 'Mode'.padStart(10) + 'Qs'.padStart(6));
  console.log('─'.repeat(75));

  rows.forEach((row: any) => {
    const qCount = (row.data || []).length;
    console.log(
      row.name.slice(0, 34).padEnd(35) +
      (row.main_category || '-').slice(0, 21).padEnd(22) +
      (row.lens_mode || 'diverse').padStart(10) +
      String(qCount).padStart(6)
    );
  });
  console.log('');
}

// ─── COMMAND: stats ──────────────────────────────────────────────────

async function cmdStats() {
  const rows = await fetchAllRows();
  if (rows.length === 0) {
    console.log('📭 No data.');
    return;
  }

  const allQs = rows.flatMap(r => r.data || []);
  const themes = new Set(rows.map(r => r.main_category));
  const diverseTopics = rows.filter(r => r.lens_mode !== 'focused').length;
  const focusedTopics = rows.filter(r => r.lens_mode === 'focused').length;
  const fullTopics = rows.filter(r => {
    const max = r.lens_mode === 'focused' ? MAX_FOCUSED_Q : MAX_DIVERSE_Q;
    return (r.data || []).length >= max;
  }).length;
  const emptyTopics = rows.filter(r => (r.data || []).length === 0).length;
  const fillableTopics = rows.length - fullTopics - emptyTopics;

  // Lens/form/backdoor counts
  const lensCount: Record<string, number> = {};
  const formCount: Record<string, number> = {};
  const bdCount: Record<string, number> = {};
  allQs.forEach((q: any) => {
    if (q.lens) lensCount[q.lens] = (lensCount[q.lens] || 0) + 1;
    if (q.form) formCount[q.form] = (formCount[q.form] || 0) + 1;
    if (q.backdoor_type) bdCount[q.backdoor_type] = (bdCount[q.backdoor_type] || 0) + 1;
  });

  console.log(`\n📊 Forge Stats`);
  console.log(`${'─'.repeat(50)}`);
  console.log(`  Questions:     ${allQs.length}`);
  console.log(`  Topics:        ${rows.length} (${diverseTopics} diverse + ${focusedTopics} focused)`);
  console.log(`  Themes:        ${themes.size}`);
  console.log(`  Full topics:   ${fullTopics}`);
  console.log(`  Fillable:      ${fillableTopics}`);
  console.log(`  Empty:         ${emptyTopics}`);
  console.log(`  Lens types:    ${Object.keys(lensCount).length}/13 used`);
  console.log(`  Form types:    ${Object.keys(formCount).length}/10 used`);
  console.log(`  Backdoor types: ${Object.keys(bdCount).length}/10 used`);
  console.log('');
}

// ─── COMMAND: generate ───────────────────────────────────────────────

async function cmdGenerate(name?: string) {
  if (!name) {
    console.log('❌ Usage: forge generate "Topic Name"');
    return;
  }

  const row = await fetchTopicByName(name);
  if (!row) {
    console.log(`❌ Topic not found: "${name}"`);
    console.log(`💡 Create it first: forge create-topic "${name}" --theme "General"`);
    return;
  }

  const qCount = (row.data || []).length;
  const maxQ = row.lens_mode === 'focused' ? MAX_FOCUSED_Q : MAX_DIVERSE_Q;

  if (qCount >= maxQ) {
    console.log(`⚠️  "${name}" is already full (${qCount}/${maxQ}).`);
    console.log(`💡 Create a sibling: forge create-topic "New Name" --theme "${row.main_category}"`);
    return;
  }

  const analyzerMode = row.lens_mode === 'focused' ? 'focused' : 'focused';
  console.log(`🚀 Generating ${maxQ - qCount} questions for "${name}" (${analyzerMode})...\n`);

  const result = spawnSync('npx', [
    'tsx', ANALYZER_PATH,
    '--topic', name,
    '--mode', analyzerMode,
  ], { stdio: 'inherit', cwd: join(__dirname, '..', '..') });

  if (result.status === 0) {
    console.log('\n✅ Brief ready! Paste CURRENT_BRIEF.md into Codebuff chat.');
  }
}

// ─── COMMAND: create-theme ───────────────────────────────────────────

async function cmdCreateTheme(name?: string) {
  if (!name) {
    console.log('❌ Usage: forge create-theme "Music"');
    return;
  }

  // Check if theme already exists (any topic with this main_category)
  const { count: existingCount } = await readClient
    .from('categories_library')
    .select('*', { count: 'exact', head: true })
    .eq('main_category', name);

  if (existingCount && existingCount > 0) {
    console.log(`⚠️  Theme "${name}" already exists (${existingCount} topics).`);
    console.log(`💡 Add more topics: forge create-topic "Cool Topic" --theme "${name}"`);
    return;
  }

  // A "theme" is really just a main_category value.
  // We create an empty placeholder topic so the theme shows up in lists.
  const { error } = await writeClient
    .from('categories_library')
    .insert({
      name: `${name} (Placeholder)`,
      main_category: name,
      description: `Auto-created theme: ${name}`,
      data: [],
      tags: ['Grid', name, 'Theme:Placeholder'],
      is_global: true,
      lens_mode: 'diverse',
      target_lens: null,
    } as any);

  if (error) {
    // If RLS blocks the write, tell the user
    if (error.message.includes('row-level security')) {
      console.log('⚠️  Write blocked by RLS. Set VITE_SUPABASE_SERVICE_ROLE_KEY to create topics.');
      console.log(`   Or manually add a topic with main_category="${name}" via Supabase dashboard.`);
    } else {
      console.error('❌ Error:', error.message);
    }
    return;
  }

  console.log(`✅ Theme "${name}" created (with placeholder topic).`);
  console.log(`💡 Now add real topics: forge create-topic "Cool Topic" --theme "${name}"`);
}

// ─── COMMAND: create-topic ───────────────────────────────────────────

async function cmdCreateTopic(name?: string) {
  if (!name) {
    console.log('❌ Usage: forge create-topic "Topic Name" --theme "Science" [--mode focused] [--lens "The Unexpected"]');
    return;
  }

  const theme = getOpt(ARGS, '--theme') || 'General';
  const mode = (getOpt(ARGS, '--mode') || 'diverse') as 'diverse' | 'focused';
  const lens = getOpt(ARGS, '--lens') as LensType | null;

  // Validate lens for focused mode
  if (mode === 'focused' && lens && !ALL_LENSES.includes(lens)) {
    console.log(`❌ Invalid lens: "${lens}"`);
    console.log(`   Valid: ${ALL_LENSES.join(', ')}`);
    return;
  }

  // Check for duplicate name
  const existing = await fetchTopicByName(name);
  if (existing) {
    console.log(`⚠️  Topic "${name}" already exists (${existing.lens_mode}, ${(existing.data || []).length} questions).`);
    console.log(`💡 To add questions: forge generate "${name}"`);
    console.log(`💡 To create a sibling with a different name: forge create-topic "New Name" --theme "${theme}"`);
    return;
  }

  // Smart tag generation
  const tags = ['Grid', theme, name];
  if (mode === 'focused') {
    if (lens) tags.push(`Lens:${lens}`);
    tags.push('Mode:Focused');
  } else {
    tags.push('Mode:Diverse');
  }

  const payload = {
    name,
    main_category: theme,
    description: `${mode === 'focused' && lens ? `Focused on ${lens}` : 'Diverse topic'} — ${theme}`,
    data: [],
    tags,
    is_global: true,
    lens_mode: mode,
    target_lens: lens || null,
  };

  const { error } = await writeClient
    .from('categories_library')
    .insert(payload as any);

  if (error) {
    if (error.message.includes('row-level security')) {
      console.log('⚠️  Write blocked by RLS. Set VITE_SUPABASE_SERVICE_ROLE_KEY env variable.');
      console.log('   You can also create this topic manually in the Supabase dashboard.');
      console.log(`\n   📋 Payload to paste:\n   ${JSON.stringify(payload, null, 2)}`);
    } else {
      console.error('❌ Error:', error.message);
    }
    return;
  }

  const maxQ = mode === 'focused' ? MAX_FOCUSED_Q : MAX_DIVERSE_Q;
  console.log(`✅ Created ${mode} topic: "${name}" in "${theme}"` +
    (lens ? ` (lens: ${lens})` : ''));
  console.log(`💡 Now generate questions: forge generate "${name}"`);
  console.log(`   (Will create ${maxQ} ${mode === 'focused' ? `questions all using "${lens}" lens` : 'diverse questions'})`);
}

// ─── COMMAND: rename-topic ───────────────────────────────────────────

async function cmdRenameTopic(oldName?: string) {
  if (!oldName) {
    console.log('❌ Usage: forge rename-topic "Old Name" --to "New Name"');
    return;
  }

  const newName = getOpt(ARGS, '--to');
  if (!newName) {
    console.log('❌ Missing --to flag. Usage: forge rename-topic "Old Name" --to "New Name"');
    return;
  }

  // Verify old topic exists
  const existing = await fetchTopicByName(oldName);
  if (!existing) {
    console.log(`❌ Topic not found: "${oldName}"`);
    return;
  }

  // Verify new name doesn't already exist
  const conflict = await fetchTopicByName(newName);
  if (conflict) {
    console.log(`❌ "${newName}" already exists. Choose a different name.`);
    return;
  }

  const qCount = (existing.data || []).length;
  console.log(`Renaming "${oldName}" → "${newName}" (${qCount} questions will be preserved)`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = await rl.question('Proceed? (y/N): ');
  rl.close();

  if (confirm.toLowerCase() !== 'y') {
    console.log('👋 Cancelled.');
    return;
  }

  // Update name AND tags (replace old name with new name in tags array)
  const updatedTags = (existing.tags || []).map(t => t === oldName ? newName : t);

  const { error } = await writeClient
    .from('categories_library')
    .update({ name: newName, tags: updatedTags })
    .eq('name', oldName);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`✅ Renamed to "${newName}" (tags updated).`);
}

// ─── COMMAND: delete-topic ───────────────────────────────────────────

async function cmdDeleteTopic(name?: string) {
  if (!name) {
    console.log('❌ Usage: forge delete-topic "Topic Name"');
    return;
  }

  const existing = await fetchTopicByName(name);
  if (!existing) {
    console.log(`❌ Topic not found: "${name}"`);
    return;
  }

  const qCount = (existing.data || []).length;

  console.log(`\n⚠️  About to delete: "${name}"`);
  console.log(`   Theme: ${existing.main_category}`);
  console.log(`   Questions: ${qCount}`);

  if (qCount > 0) {
    console.log(`\n   🔴 WARNING: This topic has ${qCount} questions that will be PERMANENTLY DELETED!`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = await rl.question(
    qCount > 0
      ? `\nType "DELETE ${name}" to confirm: `
      : '\nDelete this empty topic? (y/N): '
  );
  rl.close();

  if (qCount > 0) {
    if (confirm !== `DELETE ${name}`) {
      console.log('👋 Cancelled. (You must type the exact confirmation phrase)');
      return;
    }
  } else {
    if (confirm.toLowerCase() !== 'y') {
      console.log('👋 Cancelled.');
      return;
    }
  }

  const { error } = await writeClient
    .from('categories_library')
    .delete()
    .eq('name', name);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`✅ Deleted "${name}".`);
}

// ─── COMMAND: suggest-topics ────────────────────────────────────────

async function cmdSuggestTopics(theme?: string) {
  // --matrix flag: show the 3D matrix without generating
  if (ARGS.includes('--matrix')) {
    showThemeMatrix();
    return;
  }

  if (!theme) {
    console.log('❌ Usage: forge suggest-topics "Science"');
    console.log('   AI generates 5 diverse subtopic suggestions from a theme.');
    console.log('   Use --matrix to see all available Types/Domains/Styles.');
    return;
  }

  // Read AI config from env vars
  const provider = getOpt(ARGS, '--provider') || process.env.AI_PROVIDER || process.env.VITE_AI_PROVIDER || 'gemini';
  const apiKey = process.env.AI_API_KEY || process.env.VITE_AI_API_KEY || '';
  const model = getOpt(ARGS, '--model') || process.env.AI_MODEL || process.env.VITE_AI_MODEL || 'gemini-1.5-pro';

  // Fetch existing topics for this theme FIRST (needed for both exclusion and phase detection)
  const existingRows = await fetchTopicsByTheme(theme);
  const excludeNames = existingRows.map(r => r.name).filter(n => !n.includes('(Placeholder)'));

  // Parse Theme Matrix filters (comma-separated, validated against known values)
  const typesRaw = getOpt(ARGS, '--types');
  const domainsRaw = getOpt(ARGS, '--domains');
  const stylesRaw = getOpt(ARGS, '--styles');

  const hasExplicitMatrix = !!(typesRaw || domainsRaw || stylesRaw);

  let allowedTypes: TopicType[] | undefined;
  let allowedDomains: KnowledgeDomain[] | undefined;
  let allowedStyles: QuizStyle[] | undefined;
  let phase: PhaseConfig | null = null;

  if (hasExplicitMatrix) {
    // User explicitly chose matrix — use their selection
    allowedTypes = typesRaw
      ? parseMatrixArg<TopicType>(typesRaw, ALL_TOPIC_TYPES, 'Types')
      : undefined;
    allowedDomains = domainsRaw
      ? parseMatrixArg<KnowledgeDomain>(domainsRaw, ALL_KNOWLEDGE_DOMAINS, 'Domains')
      : undefined;
    allowedStyles = stylesRaw
      ? parseMatrixArg<QuizStyle>(stylesRaw, ALL_QUIZ_STYLES, 'Styles')
      : undefined;
  } else {
    // Auto-select matrix based on progressive discovery phase
    phase = determinePhase(existingRows);
    allowedTypes = phase.types;
    allowedDomains = phase.domains;
    allowedStyles = phase.styles;
  }

  // Show phase info + existing topics
  if (phase && !hasExplicitMatrix) {
    const phaseIcon = PHASE_ICONS[phase.phase] || '🎯';
    console.log(`\n${phaseIcon} Phase ${phase.phase}/4 — ${phase.label}`);
    console.log(`   ${phase.rationale}`);
  }

  // Show existing topics (if any)
  if (existingRows.length > 0) {
    console.log(`📚 Found ${existingRows.length} existing topics for "${theme}":`);
    existingRows.slice(0, 20).forEach(r => {
      const qCount = (r.data || []).length;
      const typeTag = r.tags?.find(t => ALL_TOPIC_TYPES.includes(t as TopicType)) || '?';
      console.log(`   • ${r.name} (${typeTag}, ${qCount} questions)`);
    });
    if (existingRows.length > 20) console.log(`   ... and ${existingRows.length - 20} more`);
  } else {
    console.log(`📭 "${theme}" has no topics yet — this is a fresh theme.`);
  }

  // Show active matrix
  const matrixInfo = [
    `Types: ${allowedTypes ? allowedTypes.join(',') : 'ALL 6'}`,
    `Domains: ${allowedDomains ? allowedDomains.join(',') : 'ALL 5'}`,
    `Styles: ${allowedStyles ? allowedStyles.join(',') : 'ALL 4'}`,
  ].join(' | ');

  const modeLabel = hasExplicitMatrix ? ' (manual matrix)' : ' (auto-phase)';
  console.log(`\n🎯 Recommended Matrix${modeLabel}:`);
  console.log(`   ${matrixInfo}`);

  // ─── API key check: graceful fallback if missing ──────────────────
  if (!apiKey) {
    console.log(`\n📝 No AI API key set — skipping AI generation.`);
    console.log(`   Set AI_API_KEY or VITE_AI_API_KEY to generate AI-subtopic suggestions.`);
    console.log(`   Example: export AI_API_KEY="sk-..."`);
    console.log(`\n💡 In the meantime, you can create topics manually:`);
    console.log(`   forge create-topic "Basic ${theme} Facts" --theme "${theme}"`);
    console.log(`   forge create-topic "Famous ${theme} Moments" --theme "${theme}"`);
    console.log(`   forge create-topic "${theme} Legends" --theme "${theme}"`);
    return;
  }

  // ─── AI Generation ────────────────────────────────────────────────
  const count = Math.max(1, Math.min(10, parseInt(getOpt(ARGS, '--count') || '5') || 5));
  console.log(`\n🧠 Generating ${count} subtopics for theme: "${theme}"...`);
  console.log(`   Provider: ${provider} | Model: ${model}\n`);

  let result;
  try {
    result = await generateThemeSubtopics(
      theme,
      { provider, apiKey, model },
      excludeNames,
      allowedTypes,
      allowedDomains,
      allowedStyles,
    );
  } catch (err: any) {
    console.error(`❌ AI call failed: ${err.message}`);
    return;
  }

  const subtopics = result.subtopics.slice(0, count);
  console.log(`✅ Generated ${subtopics.length} subtopics:\n`);
  console.log(
    '#'.padStart(4) +
    'SubTopic'.padEnd(30) +
    'Type'.padStart(12) +
    'Domain'.padStart(14) +
    'Style'.padStart(12)
  );
  console.log('─'.repeat(74));

  subtopics.forEach((s, i) => {
    console.log(
      String(i + 1).padStart(4) +
      s.name.slice(0, 29).padEnd(30) +
      s.type.padStart(12) +
      s.domain.padStart(14) +
      s.style.padStart(12)
    );
  });
  console.log('');

  // Ask to create topics
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('👉 Create these as topics in the database? (y/N, or a number like "1,3,5" to pick specific ones): ');
  rl.close();

  if (answer.toLowerCase() === 'y') {
    // Create all
    let created = 0;
    for (const s of subtopics) {
      const ok = await createSubtopicFromSuggestion(s, theme);
      if (ok) created++;
    }
    console.log(`✅ Created ${created}/${subtopics.length} topics in "${theme}".`);
    if (created > 0) {
      const nextCount = existingRows.length + created;
      console.log(`💡 Theme now has ${nextCount} topics. Run forge suggest-topics again for the next phase.`);
    }
  } else if (/^[\d,\s]+$/.test(answer)) {
    // Pick specific numbers
    const indices = answer.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < subtopics.length);
    let created = 0;
    for (const idx of indices) {
      const ok = await createSubtopicFromSuggestion(subtopics[idx], theme);
      if (ok) created++;
    }
    console.log(`✅ Created ${created}/${indices.length} selected topics in "${theme}".`);
  } else {
    console.log('👋 Skipped. You can create them manually with:');
    subtopics.forEach(s => {
      console.log(`   forge create-topic "${s.name}" --theme "${theme}"`);
    });
  }
}

/**
 * Create a single topic from an AI-suggested subtopic.
 * Tags encode type/domain/style for later retrieval in the GUI.
 */
async function createSubtopicFromSuggestion(
  s: { name: string; type: string; domain: string; style: string },
  theme: string,
): Promise<boolean> {
  const existing = await fetchTopicByName(s.name);
  if (existing) {
    console.log(`   ⚠️  "${s.name}" already exists — skipped.`);
    return false;
  }

  const payload = {
    name: s.name,
    main_category: theme,
    description: `AI-suggested ${s.type} · ${s.domain} · ${s.style} — ${theme}`,
    data: [],
    tags: ['Grid', s.name, `Theme:${theme}`, s.type, s.domain, s.style, 'Mode:Diverse', 'AI:Suggested'],
    is_global: true,
    lens_mode: 'diverse',
    target_lens: null,
  };

  const { error } = await writeClient
    .from('categories_library')
    .insert(payload as any);

  if (error) {
    if (error.message.includes('row-level security')) {
      console.log(`   ⚠️  "${s.name}" — RLS blocked. Use VITE_SUPABASE_SERVICE_ROLE_KEY or create manually.`);
    } else {
      console.log(`   ❌ "${s.name}" — ${error.message}`);
    }
    return false;
  }

  console.log(`   ✅ "${s.name}" created (${s.type} · ${s.domain} · ${s.style})`);
  return true;
}

// ─── THEME MATRIX HELPERS ───────────────────────────────────────────

/**
 * Display the full 3D theme matrix with descriptions.
 * Called by: forge suggest-topics --matrix
 */
function showThemeMatrix() {
  console.log(`\n🧩 Theme Matrix — 3D Combinatorial Grid`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`  6 Types × 5 Domains × 4 Styles = 120 unique subtopic combinations`);
  console.log(`  Use --types, --domains, --styles to restrict which combos the AI can use.\n`);

  // Types
  console.log(`📐 TOPIC TYPES (--types "Core,Niche,...")`);
  console.log(`${'─'.repeat(60)}`);
  const typeDescs: [string, string, string][] = [
    ['Core',     '🎯', 'The obvious, expected subtopic — sets the baseline'],
    ['Niche',    '🔬', 'Specialized deep dive for experts'],
    ['Human',    '👤', 'People, personalities, rivalries, drama'],
    ['Surprise', '💡', 'Unexpected angle, hidden side, "I never thought of that"'],
    ['Scale',    '🌌', 'Mind-bending scope, numbers, extremes'],
    ['Mystery',  '❓', 'Unsolved, controversial, debated, "we still don\'t know"'],
  ];
  typeDescs.forEach(([name, icon, desc]) => {
    console.log(`  ${icon} ${name.padEnd(12)} ${desc}`);
  });

  // Domains
  console.log(`\n📚 KNOWLEDGE DOMAINS (--domains "Facts,Stories,...")`);
  console.log(`${'─'.repeat(60)}`);
  const domainDescs: [string, string, string][] = [
    ['Facts',       '📋', 'Concrete facts, definitions, names, dates'],
    ['Stories',     '📖', 'Narratives, drama, context, "the real story behind..."'],
    ['Concepts',    '💭', 'Abstract ideas, theories, patterns, "why things happen"'],
    ['Data',        '📊', 'Numbers, statistics, records, comparisons'],
    ['Connections', '🔗', 'Links between ideas, "how X changed Y"'],
  ];
  domainDescs.forEach(([name, icon, desc]) => {
    console.log(`  ${icon} ${name.padEnd(12)} ${desc}`);
  });

  // Styles
  console.log(`\n🎮 QUIZ STYLES (--styles "Classic,Trick,...")`);
  console.log(`${'─'.repeat(60)}`);
  const styleDescs: [string, string, string][] = [
    ['Classic',  '📋', 'Straightforward Q&A, standard trivia'],
    ['Trick',    '🎭', 'Common misconceptions busted, "bet you thought..."'],
    ['Visual',   '👁️', 'Imagery-rich, descriptive, sensory details'],
    ['Timeline', '⏳', 'Chronological sequence, "before and after"'],
  ];
  styleDescs.forEach(([name, icon, desc]) => {
    console.log(`  ${icon} ${name.padEnd(12)} ${desc}`);
  });

  console.log(`\n💡 Usage: forge suggest-topics "Science" --types "Core,Niche,Scale" --styles "Classic,Visual"`);
  console.log('');
}

/**
 * Parse a comma-separated CLI arg string into a validated array.
 * Prints warnings for invalid values (typos, unknown names).
 * Returns undefined if the raw string is empty/undefined after trimming.
 */
function parseMatrixArg<T extends string>(
  raw: string | null,
  validValues: readonly T[],
  label: string,
): T[] | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const parts = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
  const valid: T[] = [];
  const invalid: string[] = [];

  for (const p of parts) {
    if ((validValues as readonly string[]).includes(p)) {
      valid.push(p as T);
    } else {
      invalid.push(p);
    }
  }

  if (invalid.length > 0) {
    console.log(`⚠️  Unknown ${label}: ${invalid.join(', ')} — ignored.`);
    console.log(`   Valid ${label}: ${(validValues as readonly string[]).join(', ')}`);
  }

  return valid.length > 0 ? valid : undefined;
}

// ─── COMMAND: generate-theme ────────────────────────────────────────

/**
 * Generate questions for ALL topics in a theme — batch-by-batch (default 5 at a time).
 * Mirrors generate_theme.mjs but integrated into the forge CLI.
 *
 * Usage: forge generate-theme "Indian Premier League"
 * Options: --provider openai|gemini|groq  --model "..."  --max 30  --batch 5
 */
async function cmdGenerateTheme(theme?: string) {
  if (!theme) {
    console.log('❌ Usage: forge generate-theme "Theme Name" [--provider openai] [--model "..."] [--max 30] [--batch 5]');
    return;
  }

  // AI config
  const provider = getOpt(ARGS, '--provider') || process.env.AI_PROVIDER || process.env.VITE_AI_PROVIDER || 'gemini';
  const apiKey = process.env.AI_API_KEY || process.env.VITE_AI_API_KEY || '';
  const model = getOpt(ARGS, '--model') || (provider === 'openai' ? 'gpt-4o' : provider === 'groq' ? 'llama3-70b-8192' : 'gemini-1.5-pro');
  const MAX_Q = Math.max(1, parseInt(getOpt(ARGS, '--max') || '30') || 30);
  const BATCH_SIZE = Math.max(1, Math.min(10, parseInt(getOpt(ARGS, '--batch') || '5') || 5));

  if (!apiKey) {
    console.log('❌ No AI API key set. Set AI_API_KEY or VITE_AI_API_KEY.');
    return;
  }

  console.log(`⚙️  Provider: ${provider} | Model: ${model} | Target: ${MAX_Q}q/topic | Batch: ${BATCH_SIZE}q/call\n`);

  // Fetch all topics for this theme
  const rows = await fetchTopicsByTheme(theme);
  const realTopics = rows.filter(r => !r.name.includes('(Placeholder)'));

  if (realTopics.length === 0) {
    console.log(`📭 No topics found for theme "${theme}".`);
    console.log(`💡 Create them first: forge suggest-topics "${theme}"`);
    return;
  }

  console.log(`📋 Found ${realTopics.length} topics for "${theme}":\n`);
  realTopics.forEach((t, i) => {
    const q = (t.data || []).length;
    const icon = q >= MAX_Q ? '✅' : q > 0 ? '📝' : '🆕';
    console.log(`  ${icon} ${i + 1}. ${t.name} (${q}/${MAX_Q})`);
  });
  console.log('');

  // Use shared constants from types

  let grandTotal = 0;
  let totalApiCalls = 0;

  for (let ti = 0; ti < realTopics.length; ti++) {
    const topic = realTopics[ti];
    let existing = topic.data || [];
    const totalNeeded = MAX_Q - existing.length;
    if (totalNeeded <= 0) {
      console.log(`✅ [${ti + 1}/${realTopics.length}] ${topic.name}: already FULL (${existing.length}q) — skipped\n`);
      continue;
    }

    const batches = Math.ceil(totalNeeded / BATCH_SIZE);
    console.log(`🧠 [${ti + 1}/${realTopics.length}] ${topic.name} — ${totalNeeded}q needed, ${batches} batch(es)...`);

    let topicAdded = 0;
    for (let b = 1; b <= batches; b++) {
      // Re-fetch from DB to get accurate existing count
      const { data: refreshed } = await readClient
        .from('categories_library')
        .select('data')
        .eq('id', topic.id)
        .single();
      if (refreshed) existing = (refreshed as any).data || [];

      const needed = Math.min(BATCH_SIZE, MAX_Q - existing.length);
      if (needed <= 0) break;

      process.stdout.write(`   Batch ${b}/${batches}: generating ${needed}q... `);

      try {
        const result = await generateAdminQuizQuestions({
          topics: [topic.name],
          questionCount: needed,
          persona: 'Casual Explorer',
          personas: ALL_PERSONAS,
          mode: 'STANDARD' as GameMode,
          provider,
          apiKey,
          model,
          selectedLenses: ALL_LENSES as LensType[],
          selectedForms: ALL_FORMS,
          selectedBackdoors: ALL_BACKDOORS,
        });

        if (!result.questions || result.questions.length === 0) {
          console.log('❌ No questions returned');
          break;
        }

        // Save to DB
        const updatedData = [...existing, ...result.questions];
        const { error } = await writeClient
          .from('categories_library')
          .update({ data: updatedData })
          .eq('id', topic.id);

        if (error) {
          console.log(`❌ DB save: ${error.message}`);
          break;
        }

        topicAdded += result.questions.length;
        grandTotal += result.questions.length;
        totalApiCalls += result.total_api_calls;
        existing = updatedData;
        console.log(`✅ +${result.questions.length} (total: ${existing.length}/${MAX_Q}, ${result.total_api_calls} API)`);
      } catch (err: any) {
        console.log(`❌ ${err.message}`);
        break;
      }
    }
    console.log(`   📊 Done: +${topicAdded}q → ${existing.length}/${MAX_Q}\n`);
  }

  console.log(`🎉 Complete! ${grandTotal} new questions across ${realTopics.length} topics in "${theme}" (${totalApiCalls} total API calls).`);
}

// ─── COMMAND: review ────────────────────────────────────────────────

async function cmdReview(name?: string) {
  if (!name) {
    console.log('❌ Usage: forge review "Topic Name"');
    return;
  }

  const row = await fetchTopicByName(name);
  if (!row) {
    console.log(`❌ Topic not found: "${name}"`);
    return;
  }

  const questions = row.data || [];
  if (questions.length === 0) {
    console.log(`📭 "${name}" has no questions to review.`);
    return;
  }

  console.log(`\n🔍 Reviewing "${name}" — ${questions.length} questions\n`);

  // Import from shared review library
  const { reviewQuestions } = await import('../../src/lib/forgeReview.js');
  const report = reviewQuestions(questions);

  const gradeColor = report.grade.startsWith('A') ? '🟢' : report.grade.startsWith('B') ? '🟡' : '🔴';

  console.log(`${'─'.repeat(60)}`);
  console.log(`  📊 Quality Report`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Score:     ${report.score}/100   ${gradeColor} Grade: ${report.grade}`);
  console.log(`  Questions: ${report.totalQuestions} total, ${report.passes} passed, ${report.failures} failed`);
  console.log(`${'─'.repeat(60)}`);

  if (report.issues.length === 0) {
    console.log(`\n  ✅ All clear — no issues found!`);
  } else {
    console.log(`\n  🔍 Issues Found:\n`);
    report.issues.forEach(issue => {
      const icon = issue.severity === 'critical' ? '🔴' : '🟠';
      const preview = issue.questionText.slice(0, 60);
      console.log(`  ${icon} Q${issue.questionIndex + 1}: [${issue.type}] ${issue.detail}`);
      console.log(`     "${preview}..."`);
    });
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  📋 Diversity`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Forms:     ${report.diversity.formsUsed}/10 used`);
  if (report.diversity.formsMissing.length > 0) console.log(`    Missing: ${report.diversity.formsMissing.join(', ')}`);
  console.log(`  Backdoors: ${report.diversity.backdoorsUsed}/10 used`);
  if (report.diversity.backdoorsMissing.length > 0) console.log(`    Missing: ${report.diversity.backdoorsMissing.join(', ')}`);
  console.log(`  Difficulty: E:${report.diversity.difficultySpread.easy} M:${report.diversity.difficultySpread.medium} C:${report.diversity.difficultySpread.challenging} X:${report.diversity.difficultySpread.expert}`);
  console.log(`\n  Summary: ${report.summary}`);
  console.log(`${'─'.repeat(60)}\n`);
}

// ─── RUN ─────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
