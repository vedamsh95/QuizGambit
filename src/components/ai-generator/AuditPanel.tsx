import clsx from "clsx";
import type { DiversityAudit } from "../../lib/ai/types";

export interface AuditPanelProps {
  audit: DiversityAudit;
  apiCalls?: number;
  regenerations?: number;
  solverSummary?: {
    accuracy: number;
    solvableCount: number;
    totalCount: number;
  };
  factCheckSummary?: {
    allPassed: boolean;
    passedCount: number;
    totalCount: number;
    flaggedClaims: string[];
  };
  className?: string;
}

/** Convert a value to a percentage bar width (0-100) */
function barPercent(current: number, max: number): string {
  if (max === 0) return "0%";
  return `${Math.round((current / max) * 100)}%`;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return (
    <span className={clsx("text-xs", ok ? "text-mint" : "text-peach")}>
      {ok ? "✅" : "❌"}
    </span>
  );
}

export default function AuditPanel({
  audit,
  apiCalls,
  regenerations,
  solverSummary,
  factCheckSummary,
  className,
}: AuditPanelProps) {
  const lensCount = audit.lenses_used.length;
  const formCount = audit.forms_used.length;

  return (
    <div className={clsx("clay p-5 space-y-4", className)}>
      {/* Header */}
      <h4 className="font-outfit font-bold text-sm text-plum flex items-center gap-2">
        📊 Generation Audit
      </h4>

      {/* Lenses */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-plum/60 uppercase tracking-wider">
            Lenses ({lensCount}/{10} unique)
          </span>
          <StatusIcon ok={audit.all_lenses_unique} />
        </div>
        <div className="h-1.5 rounded-full bg-clay-border/50 overflow-hidden">
          <div
            className="h-full bg-soft-purple rounded-full transition-all duration-500"
            style={{ width: barPercent(lensCount, 10) }}
          />
        </div>
        <p className="text-[9px] text-plum/40 font-medium truncate">
          {audit.lenses_used.slice(0, 5).join(" · ")}
          {lensCount > 5 && ` · +${lensCount - 5} more`}
        </p>
      </div>

      {/* Forms */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-plum/60 uppercase tracking-wider">
            Forms ({formCount}/5 used)
          </span>
          <StatusIcon ok={audit.all_forms_represented} />
        </div>
        <div className="h-1.5 rounded-full bg-clay-border/50 overflow-hidden">
          <div
            className="h-full bg-sky rounded-full transition-all duration-500"
            style={{ width: barPercent(formCount, 5) }}
          />
        </div>
        <p className="text-[9px] text-plum/40 font-medium">
          {audit.all_forms_represented ? "All forms represented" : "Missing some forms"}
          {audit.no_consecutive_form_repeats && " · No consecutive repeats"}
        </p>
      </div>

      {/* Backdoors */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-plum/60 uppercase tracking-wider">
            Backdoors used
          </span>
          <span className="text-[9px] text-plum/40">
            {audit.lenses_used.length} questions
          </span>
        </div>
        <p className="text-[9px] text-plum/40 font-medium">
          Each question has a backdoor pathway
        </p>
      </div>

      {/* Difficulty ramp */}
      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-clay-border/50">
        <span className="font-bold text-plum/60 uppercase tracking-wider">
          Difficulty Ramp
        </span>
        <StatusIcon ok={audit.difficulty_ramp_valid} />
      </div>

      {/* Issues */}
      {audit.issues.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-peach uppercase tracking-wider">
            Issues
          </span>
          {audit.issues.map((issue, i) => (
            <p key={i} className="text-[9px] text-peach/70 font-medium">
              ⚠ {issue}
            </p>
          ))}
        </div>
      )}

      {/* Quality checks summary */}
      {(solverSummary || factCheckSummary) && (
        <div className="space-y-2 pt-2 border-t border-clay-border/50">
          {solverSummary && (
            <div className="text-[10px] text-plum/50 font-medium">
              🧠 Solver: {solverSummary.solvableCount}/{solverSummary.totalCount} solvable
              <span className="text-plum/30 ml-1">
                ({Math.round(solverSummary.accuracy * 100)}% accuracy)
              </span>
            </div>
          )}
          {factCheckSummary && (
            <div className="text-[10px] text-plum/50 font-medium">
              🔍 Fact-check: {factCheckSummary.passedCount}/{factCheckSummary.totalCount} verified
              {factCheckSummary.flaggedClaims.length > 0 && (
                <span className="text-peach/70">
                  {" "}· {factCheckSummary.flaggedClaims.length} flagged
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats footer */}
      {(apiCalls !== undefined || regenerations !== undefined) && (
        <div className="flex items-center gap-3 pt-2 border-t border-clay-border/50 text-[9px] font-mono text-plum/30">
          {apiCalls !== undefined && <span>API Calls: {apiCalls}</span>}
          {regenerations !== undefined && (
            <span>· Regenerations: {regenerations}</span>
          )}
        </div>
      )}
    </div>
  );
}
