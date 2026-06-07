/**
 * Forge Importer — Validates & imports a batch file into Supabase.
 * 
 * Reads scripts/forge/batches/batch_XXX.ts, validates against
 * the QuizGambitQuestion schema, deduplicates, and imports.
 * 
 * Run: npm run forge:import scripts/forge/batches/batch_001.ts
 *   or: npx tsx scripts/forge/2_import_batch.ts scripts/forge/batches/batch_001.ts
 *   or: npx tsx scripts/forge/2_import_batch.ts --all  (imports all batches)
 *   or: npx tsx scripts/forge/2_import_batch.ts batch_001.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

import type { QuizGambitQuestion, LensType } from '../../src/lib/ai/types.js';
import { ALL_LENSES, ALL_FORMS, ALL_BACKDOORS } from '../../src/lib/ai/types.js';

// ─── CONFIG ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_WRITE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars.');
  process.exit(1);
}
const BATCHES_DIR = join(__dirname, 'batches');
const SQL_OUTPUT = join(__dirname, '..', '..', 'supabase', 'migrations', '20260607000001_forge_import.sql');

// ─── TYPES ───────────────────────────────────────────────────────────

interface BatchCategory {
  name: string;
  main_category: string;
  description: string;
  lens_mode: 'diverse' | 'focused';
  target_lens?: LensType;
  data: QuizGambitQuestion[];
  tags: string[];
}

interface BatchExport {
  batch: BatchCategory[];
  meta: {
    generatedAt: string;
    batchNumber: number;
    mode: string;
  };
}

interface ValidationError {
  category: string;
  questionIndex: number;
  field: string;
  message: string;
}

interface ImportResult {
  category: string;
  action: 'INSERTED' | 'UPDATED' | 'SKIPPED' | 'ERROR';
  questionsAdded: number;
  totalQuestions: number;
  error?: string;
}

// ─── MAIN ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allFlag = args.includes('--all');
  const sqlOnly = args.includes('--sql');

  // Determine which batch files to import
  let batchFiles: string[] = [];

  if (allFlag) {
    batchFiles = readdirSync(BATCHES_DIR)
      .filter(f => extname(f) === '.ts' && f !== 'template.ts')
      .map(f => join(BATCHES_DIR, f));
    console.log(`📦 Found ${batchFiles.length} batch files\n`);
  } else {
    const batchArg = args.find(a => a.endsWith('.ts'));
    if (!batchArg) {
      console.error('❌ Usage: npx tsx scripts/forge/2_import_batch.ts <batch_file.ts> [--dry-run] [--sql]');
      process.exit(1);
    }
    const batchPath = batchArg.startsWith('/') ? batchArg : join(process.cwd(), batchArg);
    if (!existsSync(batchPath)) {
      console.error(`❌ Batch file not found: ${batchPath}`);
      process.exit(1);
    }
    batchFiles = [batchPath];
  }

  let allResults: ImportResult[] = [];
  let allErrors: ValidationError[] = [];
  let allSQL = `-- Forge Import — Generated ${new Date().toISOString()}\n\n`;

  for (const batchPath of batchFiles) {
    console.log(`📝 Processing: ${batchPath}`);
    const { categories, errors: valErrors } = await loadAndValidate(batchPath);
    allErrors.push(...valErrors);

    if (valErrors.length > 0) {
      console.log(`   ⚠️  ${valErrors.length} validation errors (will still try to import valid entries)\n`);
    }

    if (dryRun) {
      console.log('   🔍 DRY RUN — would import:');
      categories.forEach(c => console.log(`      ${c.name} (${c.lens_mode}, ${c.data.length} questions)`));
      console.log('');
      continue;
    }

    if (sqlOnly) {
      categories.forEach(c => {
        allSQL += buildSQLInsert(c);
      });
      continue;
    }

    // Import each category
    for (const cat of categories) {
      const result = await importCategory(cat);
      allResults.push(result);
      console.log(`   ${result.action}: ${result.category} (+${result.questionsAdded} questions, total: ${result.totalQuestions})`);
    }
    console.log('');
  }

  // Write SQL if needed
  if (sqlOnly && allSQL.length > 0) {
    writeFileSync(SQL_OUTPUT, allSQL);
    console.log(`\n📄 SQL migration written to: ${SQL_OUTPUT}`);
  }

  // Summary
  if (!dryRun && !sqlOnly) {
    const inserted = allResults.filter(r => r.action === 'INSERTED').length;
    const updated = allResults.filter(r => r.action === 'UPDATED').length;
    const skipped = allResults.filter(r => r.action === 'SKIPPED').length;
    const errored = allResults.filter(r => r.action === 'ERROR').length;
    console.log('═'.repeat(60));
    console.log(`✅ Inserted: ${inserted} | 📝 Updated: ${updated} | ⏭️ Skipped: ${skipped} | ❌ Errors: ${errored}`);
    if (allErrors.length > 0) {
      console.log(`\n⚠️  ${allErrors.length} validation warning(s):`);
      allErrors.slice(0, 10).forEach(e => console.log(`   [${e.category}:Q${e.questionIndex}] ${e.field}: ${e.message}`));
      if (allErrors.length > 10) console.log(`   ... and ${allErrors.length - 10} more`);
    }
    console.log('═'.repeat(60));
  }
}

// ─── LOAD & VALIDATE ─────────────────────────────────────────────────

async function loadAndValidate(batchPath: string): Promise<{ categories: BatchCategory[]; errors: ValidationError[] }> {
  // Use dynamic import (tsx handles this)
  const mod = await import(batchPath);
  const batchData = mod.batch || mod.default?.batch || [];
  const categories: BatchCategory[] = Array.isArray(batchData) ? batchData : [batchData];
  const errors: ValidationError[] = [];

  for (const cat of categories) {
    // Validate category fields
    if (!cat.name) errors.push({ category: cat.name || 'unnamed', questionIndex: -1, field: 'name', message: 'Missing name' });
    if (!cat.main_category) errors.push({ category: cat.name, questionIndex: -1, field: 'main_category', message: 'Missing main_category' });
    if (!cat.lens_mode) cat.lens_mode = 'diverse';

    // Validate questions
    (cat.data || []).forEach((q: any, i: number) => {
      if (!q.lens || !ALL_LENSES.includes(q.lens)) {
        errors.push({ category: cat.name, questionIndex: i, field: 'lens', message: `Invalid or missing lens: "${q.lens}"` });
      }
      if (!q.form || !ALL_FORMS.includes(q.form)) {
        errors.push({ category: cat.name, questionIndex: i, field: 'form', message: `Invalid or missing form: "${q.form}"` });
      }
      if (!q.backdoor_type || !ALL_BACKDOORS.includes(q.backdoor_type)) {
        errors.push({ category: cat.name, questionIndex: i, field: 'backdoor_type', message: `Invalid or missing backdoor: "${q.backdoor_type}"` });
      }
      if (!q.question_text || q.question_text.trim().length < 10) {
        errors.push({ category: cat.name, questionIndex: i, field: 'question_text', message: 'Too short (min 10 chars)' });
      }
      if (!q.answer_text) {
        errors.push({ category: cat.name, questionIndex: i, field: 'answer_text', message: 'Missing answer' });
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push({ category: cat.name, questionIndex: i, field: 'options', message: 'Must be exactly 4 options' });
      }
      if (!q.backdoor_explanation) {
        errors.push({ category: cat.name, questionIndex: i, field: 'backdoor_explanation', message: 'Missing backdoor explanation' });
      }
      if (!q.points || q.points < 100 || q.points > 500) {
        errors.push({ category: cat.name, questionIndex: i, field: 'points', message: `Invalid points: ${q.points}` });
      }
      if (!q.difficulty_tier) {
        errors.push({ category: cat.name, questionIndex: i, field: 'difficulty_tier', message: 'Missing difficulty tier' });
      }
    });
  }

  return { categories, errors };
}

// ─── IMPORT CATEGORY ─────────────────────────────────────────────────

async function importCategory(cat: BatchCategory): Promise<ImportResult> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_WRITE_KEY || SUPABASE_ANON_KEY);

  try {
    // Check if this topic already exists
    const { data: existing, error: fetchError } = await supabase
      .from('categories_library')
      .select('id, data')
      .eq('name', cat.name)
      .maybeSingle();

    if (fetchError) {
      return { category: cat.name, action: 'ERROR', questionsAdded: 0, totalQuestions: 0, error: fetchError.message };
    }

    const payload = {
      name: cat.name,
      main_category: cat.main_category,
      description: cat.description || `Forge Generated: ${cat.name}`,
      data: cat.data,
      is_global: true,
      tags: cat.tags || ['Grid', cat.name, `Theme:${cat.main_category}`],
      lens_mode: cat.lens_mode,
      target_lens: cat.target_lens,
    };

    if (existing) {
      // Merge questions (dedup by question_text)
      const existingQs = (existing.data || []) as any[];
      const newQs = cat.data.filter(
        nq => !existingQs.some(eq => (eq.question_text || '') === (nq.question_text || ''))
      );

      if (newQs.length > 0) {
        const { error: updateErr } = await supabase
          .from('categories_library')
          .update({
            data: [...existingQs, ...newQs],
            lens_mode: cat.lens_mode,
            target_lens: cat.target_lens,
          })
          .eq('id', existing.id);

        if (updateErr) {
          // RLS fallback → generate SQL
          if (updateErr.message.includes('row-level security')) {
            writeSQLFallback(cat);
            return { category: cat.name, action: 'ERROR', questionsAdded: 0, totalQuestions: existingQs.length + newQs.length, error: 'RLS blocked — SQL fallback generated' };
          }
          return { category: cat.name, action: 'ERROR', questionsAdded: 0, totalQuestions: existingQs.length, error: updateErr.message };
        }
        return { category: cat.name, action: 'UPDATED', questionsAdded: newQs.length, totalQuestions: existingQs.length + newQs.length };
      } else {
        return { category: cat.name, action: 'SKIPPED', questionsAdded: 0, totalQuestions: existingQs.length };
      }
    } else {
      // Insert new
      const { error: insertErr } = await supabase
        .from('categories_library')
        .insert([payload as any]);

      if (insertErr) {
        if (insertErr.message.includes('row-level security')) {
          writeSQLFallback(cat);
          return { category: cat.name, action: 'ERROR', questionsAdded: 0, totalQuestions: cat.data.length, error: 'RLS blocked — SQL fallback generated' };
        }
        return { category: cat.name, action: 'ERROR', questionsAdded: 0, totalQuestions: 0, error: insertErr.message };
      }
      return { category: cat.name, action: 'INSERTED', questionsAdded: cat.data.length, totalQuestions: cat.data.length };
    }
  } catch (err: any) {
    return { category: cat.name, action: 'ERROR', questionsAdded: 0, totalQuestions: 0, error: err.message };
  }
}

// ─── SQL FALLBACK ────────────────────────────────────────────────────

function writeSQLFallback(cat: BatchCategory) {
  const escapeStr = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const escapeJSON = (v: any) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  const escapeTextArr = (arr: string[]) => `ARRAY[${arr.map(a => `'${a.replace(/'/g, "''")}'`).join(', ')}]`;

  const sql = `
-- ${cat.name} (${cat.lens_mode}${cat.target_lens ? `, lens: ${cat.target_lens}` : ''})
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = ${escapeStr(cat.name)}) THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, lens_mode, target_lens, created_by)
    VALUES (
      ${escapeStr(cat.name)},
      ${escapeStr(cat.main_category)},
      ${escapeStr(cat.description || '')},
      ${escapeJSON(cat.data)},
      ${escapeTextArr(cat.tags || [])},
      true,
      ${escapeStr(cat.lens_mode)},
      ${cat.target_lens ? escapeStr(cat.target_lens) : 'NULL'},
      v_uid
    );
  END IF;
END $$;
`;

  // Append to SQL output file
  const existing = existsSync(SQL_OUTPUT) ? readFileSync(SQL_OUTPUT, 'utf-8') : '';
  writeFileSync(SQL_OUTPUT, existing + sql);
}

// ─── BUILD SQL INSERT ─────────────────────────────────────────────────

function buildSQLInsert(cat: BatchCategory): string {
  const escapeStr = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const escapeJSON = (v: any) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  const escapeTextArr = (arr: string[]) => `ARRAY[${arr.map(a => `'${a.replace(/'/g, "''")}'`).join(', ')}]`;

  return `
-- ${cat.name} (${cat.lens_mode}${cat.target_lens ? `, lens: ${cat.target_lens}` : ''}) — ${cat.data.length} questions
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM categories_library WHERE name = ${escapeStr(cat.name)}) THEN
    INSERT INTO categories_library (name, main_category, description, data, tags, is_global, lens_mode, target_lens, created_by)
    VALUES (
      ${escapeStr(cat.name)},
      ${escapeStr(cat.main_category)},
      ${escapeStr(cat.description || '')},
      ${escapeJSON(cat.data)},
      ${escapeTextArr(cat.tags || [])},
      true,
      ${escapeStr(cat.lens_mode)},
      ${cat.target_lens ? escapeStr(cat.target_lens) : 'NULL'},
      v_uid
    );
  END IF;
END $$;
`;
}

// ─── RUN ─────────────────────────────────────────────────────────────

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
