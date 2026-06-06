import { useState } from "react";
import clsx from "clsx";
import type { QuizGambitQuestion } from "../../lib/ai/types";

export interface QuestionPreviewProps {
  question: QuizGambitQuestion;
  index: number;
  solverResult?: { solved_correctly: boolean; confidence: number };
  factCheckResult?: { verified: boolean };
  onReverify?: () => void;
  className?: string;
}

const lensColor: Record<string, string> = {
  "Origin Story": "purple",
  "The Unexpected": "purple",
  "The Human Element": "purple",
  "Numbers & Scale": "purple",
  "The Rivalry": "purple",
  "The Oddity": "purple",
  "Behind the Scenes": "purple",
  "The Connection": "purple",
  "What If?": "purple",
  "The Legacy": "purple",
};

const formColor: Record<string, string> = {
  "Form 1 (Action-First)": "sky",
  "Form 2 (Parenthetical Hook)": "sky",
  "Form 3 (Sensory Clue)": "sky",
  "Form 4 (Active Quote)": "sky",
  "Form 5 (Direct Narrative)": "sky",
};

const backdoorColor: Record<string, string> = {
  "Synonym Bridge": "mint",
  "Contrast Pop": "mint",
  "Everyday Link": "mint",
  "Anagram-Wordplay": "mint",
  "Sequence Pattern": "mint",
  "Sensory Logic": "mint",
  "Category Elimination": "mint",
};

export default function QuestionPreview({
  question,
  index,
  solverResult,
  factCheckResult,
  onReverify,
  className,
}: QuestionPreviewProps) {
  const [showBackdoor, setShowBackdoor] = useState(false);

  // Defensive defaults — questions loaded from DB may be missing properties
  const questionText = question?.question_text || "";
  const options = question?.options || [];
  const answerText = question?.answer_text || "";
  const points = question?.points ?? 0;
  const lens = question?.lens || "Unknown";
  const form = question?.form || "Unknown";
  const backdoorType = question?.backdoor_type || "Unknown";
  const backdoorExplanation = question?.backdoor_explanation || "";
  const tag = question?.tag || "";

  const correctIndex = options.indexOf(answerText);

  return (
    <div className={clsx("clay-elevated p-5 space-y-3 animate-slide-up-fade", className)}>
      {/* Top row: Q number + points */}
      <div className="flex items-center justify-between">
        <span className="font-outfit font-black text-lg text-plum">Q{index + 1}</span>
        <span className="clay-badge bg-soft-purple-light text-soft-purple text-[10px]">
          {points} pts
        </span>
      </div>

      {/* Badge row: lens, form, backdoor, tag */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="clay-badge bg-soft-purple-light text-soft-purple text-[9px]">
          {lens}
        </span>
        <span className="clay-badge bg-sky-light text-sky text-[9px]">
          {form}
        </span>
        <span className="clay-badge bg-mint-light text-mint text-[9px]">
          {backdoorType}
        </span>
        {tag && (
          <span className="clay-badge bg-butter-light text-butter text-[9px] dot">
            {tag}
          </span>
        )}
      </div>

      {/* Question text */}
      <div className="bg-cream/50 rounded-xl p-3 border border-clay-border/50">
        <p className="font-outfit font-bold text-sm leading-relaxed italic text-plum/80">
          &ldquo;{questionText}&rdquo;
        </p>
      </div>

      {/* Options grid */}
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt, i) => {
          const isCorrect = i === correctIndex;
          return (
            <div
              key={i}
              className={clsx(
                "clay p-2.5 text-center",
                isCorrect
                  ? "ring-2 ring-mint bg-mint-light/20"
                  : "bg-clay-border/5",
              )}
            >
              <span
                className={clsx(
                  "text-xs font-bold",
                  isCorrect ? "text-mint" : "text-plum/60",
                )}
              >
                {opt}
              </span>
            </div>
          );
        })}
      </div>

      {/* Backdoor explanation (collapsible) */}
      <div>
        <button
          onClick={() => setShowBackdoor(!showBackdoor)}
          className="flex items-center gap-1 text-[10px] font-bold text-plum/40 hover:text-plum/60 uppercase tracking-wider transition-colors"
        >
          {showBackdoor ? "▾" : "▸"} Backdoor
        </button>
        {showBackdoor && (
          <p className="text-[10px] text-plum/60 leading-relaxed mt-1 ml-4 border-l-2 border-soft-purple/20 pl-3 py-1">
            {backdoorExplanation}
          </p>
        )}
      </div>

      {/* Quality check badges */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-clay-border/50">
        {/* Word count */}
        <span className="text-[9px] font-medium text-plum/40">
          ✓ {questionText.trim().split(/\s+/).filter(Boolean).length} words
        </span>

        {/* Solver badge */}
        {solverResult ? (
          <span
            className={clsx(
              "clay-badge text-[9px]",
              solverResult.solved_correctly
                ? "bg-mint-light text-mint"
                : "bg-peach-light text-peach",
            )}
          >
            {solverResult.solved_correctly ? "✅ Solvable" : "❌ Unsolvable"}
          </span>
        ) : null}

        {/* Fact-check badge */}
        {factCheckResult ? (
          <span
            className={clsx(
              "clay-badge text-[9px]",
              factCheckResult.verified
                ? "bg-mint-light text-mint"
                : "bg-butter-light text-butter",
            )}
          >
            {factCheckResult.verified ? "✅ Verified" : "⚠️ Unverified"}
          </span>
        ) : null}

        {/* Re-verify button */}
        {onReverify && (
          <button
            onClick={onReverify}
            className="text-[8px] font-bold text-plum/30 hover:text-soft-purple uppercase tracking-wider ml-auto transition-colors"
          >
            Re-Verify
          </button>
        )}
      </div>
    </div>
  );
}
