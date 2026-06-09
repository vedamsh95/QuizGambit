/**
 * Forge Review Engine CLI — Auto-audit generated questions.
 *
 * Checks:
 *   1. Answer-in-question leaks (substring match, case-insensitive)
 *   2. Banned sentence starters (Which, What, Who, Where, When, Name the...)
 *   3. Form diversity (are all 10 forms used?)
 *   4. Backdoor diversity (are all 10 backdoors used?)
 *   5. Difficulty balance (easy/medium/challenging/expert spread)
 *   6. Overall quality score (0-100)
 *
 * Usage:
 *   npx tsx scripts/forge/3_review_batch.ts --topic "Topic Name"       (fetch from DB)
 *   npx tsx scripts/forge/3_review_batch.ts --file path/to/batch.ts     (read batch file)
 *   npx tsx scripts/forge/3_review_batch.ts --topic "X" --fix           (auto-fix issues in DB)
 */

import { createClient } from '@supabase/supabase-js';
import { reviewQuestions, type ReviewReport } from '../../src/lib/forgeReview.js';

// Re-export for dynamic imports from 0_forge_cli.ts
export { reviewQuestions };

// ─── CONFIG ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars.');
  process.exit(1);
}

const readClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── CLI MAIN ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const topicFlag = args.includes('--topic') ? args[args.indexOf('--topic') + 1] : null;
  const fileFlag = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
  const fixFlag = args.includes('--fix');

  let questions: any[] = [];

  if (topicFlag) {
    // Fetch from DB
    const { data, error } = await readClient
      .from('categories_library')
      .select('data')
      .eq('name', topicFlag)
      .maybeSingle();

    if (error || !data) {
      console.log(`❌ Topic "${topicFlag}" not found.`);
      process.exit(1);
    }
    questions = data.data || [];
    console.log(`📋 Reviewing "${topicFlag}" — ${questions.length} questions\n`);
  } else if (fileFlag) {
    // Load via TypeScript dynamic import (matches 2_import_batch.ts approach).
    // The old regex parser `q\([^)]+\)` truncated on the first `)` it saw, which
    // meant form strings like 'Form 5 (Direct Narrative)' broke extraction for
    // every multi-line batch. Dynamic import gives us the real AST.
    try {
      const path = await import('path');
      const batchPath = fileFlag.startsWith('/') ? fileFlag : path.join(process.cwd(), fileFlag);
      const mod = await import(batchPath);
      const batchData = mod.batch || mod.default?.batch || [];
      const categories = Array.isArray(batchData) ? batchData : [batchData];
      questions = categories.flatMap((cat: any) => cat.data || []);
    } catch (err: any) {
      console.log(`❌ Could not load batch file: ${fileFlag}`);
      console.log(`   ${err.message}`);
      process.exit(1);
    }
    console.log(`📋 Reviewing batch file — ${questions.length} questions\n`);
  } else {
    console.log('Usage: npx tsx scripts/forge/3_review_batch.ts --topic "Topic Name" [--fix]');
    console.log('       npx tsx scripts/forge/3_review_batch.ts --file path/to/batch.ts');
    process.exit(0);
  }

  const report = reviewQuestions(questions);
  printReport(report);
}

// ─── PRINT ───────────────────────────────────────────────────────────

function printReport(report: ReviewReport) {
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
      console.log(`  ${icon} Q${issue.questionIndex + 1}: [${issue.type}] ${issue.detail}`);
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

main().catch(err => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
