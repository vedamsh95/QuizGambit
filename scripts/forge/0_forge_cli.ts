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
 *
 * Run: npx tsx scripts/forge/0_forge_cli.ts <command> [options]
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LensType } from '../../src/lib/ai/types.js';
import { ALL_LENSES } from '../../src/lib/ai/types.js';

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
  generate "Name"      Analyze + write CURRENT_BRIEF.md for a topic

➕ CREATE:
  create-theme "Music"             Register a new theme
  create-topic "Name" --theme "X"  Create new topic
    [--mode focused|diverse] [--lens "The Unexpected"]

✏️ EDIT:
  rename-topic "Old" --to "New"   Rename a topic
  delete-topic "Name"             Delete with safety confirmation

🔍 REVIEW:
  review "Topic Name"             Audit questions for answer leaks, banned starters, score

💡 Tips:
  • Use 'pick' to browse and select — fastest workflow
  • 'generate' after 'create-topic' to start writing questions
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
