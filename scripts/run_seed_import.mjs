/**
 * Run Seed Import
 *
 * Reads seed_questions.json and inserts/merges into Supabase categories_library.
 *
 * Usage: node scripts/run_seed_import.mjs
 *        or: node scripts/run_seed_import.mjs --sql-only
 *        (generates a SQL file you can run in Supabase dashboard SQL editor)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xurxuikgxnrzmrgkwkhy.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PsO6bN7zjtun5gP7rFfxYg_ZoaQF9dL';
const SEED_FILE = join(__dirname, '..', 'seed_questions.json');
const SQL_OUTPUT = join(__dirname, '..', 'supabase', 'migrations', '20260607000000_seed_questions.sql');

const SQL_ONLY = process.argv.includes('--sql-only');

function escapeSQL(val) {
  if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val)}'`;
}

function escapeTextArray(arr) {
  // Output a PostgreSQL text[] array: ARRAY['a','b','c']
  const elements = arr.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
  return `ARRAY[${elements}]`;
}

async function main() {
  const raw = readFileSync(SEED_FILE, 'utf-8');
  const data = JSON.parse(raw);
  const categories = data.categories || data;
  const items = Array.isArray(categories) ? categories : [categories];
  console.log(`Loaded ${items.length} categories from seed_questions.json`);

  if (SQL_ONLY) return generateSQL(items);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { count, error: countError } = await supabase
    .from('categories_library')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.log('Cannot write directly to DB (RLS). Generating SQL fallback...');
    return generateSQL(items);
  }

  console.log(`Existing records in DB: ${count}`);
  let saved = 0, skipped = 0, errors = [];

  for (const item of items) {
    const { name, main_category, description, data: questions, tags } = item;
    if (!name || !main_category) { errors.push(`Skipping: ${name || 'unnamed'}`); continue; }
    if (!Array.isArray(questions) || questions.length === 0) { errors.push(`Skipping "${name}" — no questions`); continue; }

    process.stdout.write(`  ${name} (${questions.length} questions)... `);
    const { data: existing, error: fetchError } = await supabase
      .from('categories_library').select('id, data').eq('name', name).maybeSingle();

    if (fetchError) { errors.push(`"${name}": fetch error — ${fetchError.message}`); console.log('X'); continue; }

    const payload = { name, main_category, description: description || `AI Generated: ${name}`, data: questions, is_global: true, tags: tags || ['Grid', name, `Theme:${main_category}`] };

    try {
      if (existing) {
        const existingQs = existing.data || [];
        const newQs = questions.filter(nq => !existingQs.some(eq => (eq.question_text || eq.question) === (nq.question_text || nq.question)));
        if (newQs.length > 0) {
          const { error: updateErr } = await supabase.from('categories_library').update({ data: [...existingQs, ...newQs] }).eq('id', existing.id);
          if (updateErr) throw updateErr;
          console.log(`OK (+${newQs.length} new)`); saved++;
        } else { console.log('skip (up to date)'); skipped++; }
      } else {
        const { error: insertErr } = await supabase.from('categories_library').insert([payload]);
        if (insertErr) throw insertErr;
        console.log('OK (new)'); saved++;
      }
    } catch (err) {
      if (err.message && err.message.includes('row-level security')) {
        console.log('RLS BLOCKED — generating SQL instead');
        return generateSQL(items);
      }
      errors.push(`"${name}": ${err.message}`); console.log('X');
    }
  }

  console.log(`\nDone: ${saved} saved, ${skipped} skipped`);
  if (errors.length) { console.log(`\n${errors.length} error(s):`); errors.forEach(e => console.log(`  ${e}`)); }
}

function generateSQL(items) {
  let sql = `-- Seed questions for categories_library
-- Generated from seed_questions.json
-- Run in Supabase Dashboard (SQL Editor)
--

`;

  for (const item of items) {
    const { name, main_category, description, data: questions, tags } = item;
    if (!name || !main_category) continue;

    const tagArray = tags || ['Grid', name, `Theme:${main_category}`];
    const desc = description || `AI Generated: ${name}`;

    sql += `-- ${name} (${main_category}) — ${questions?.length || 0} questions\n`;
    sql += `DO $$\nDECLARE\n  v_uid uuid;\nBEGIN\n  SELECT id INTO v_uid FROM auth.users LIMIT 1;\n  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = ${escapeSQL(name)}) THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, created_by)
    VALUES (
      ${escapeSQL(name)},
      ${escapeSQL(main_category)},
      ${escapeSQL(desc)},
      ${escapeSQL(questions)}::jsonb,
      ${escapeTextArray(tagArray)},
      true,
      v_uid
    );
  END IF;
END $$;\n\n`;
  }

  writeFileSync(SQL_OUTPUT, sql);
  console.log(`\nSQL migration generated at: ${SQL_OUTPUT}`);
  console.log(`Run in Supabase Dashboard -> SQL Editor`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
