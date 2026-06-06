import clsx from "clsx";
import { LayoutGrid } from "lucide-react";

export type GeneratorMode = "GRID";

export interface ModeSelectorProps {
  className?: string;
}

export default function ModeSelector({ className }: ModeSelectorProps) {
  return (
    <div className={clsx("space-y-4", className)}>
      <h4 className="font-outfit font-bold text-sm text-plum">Game Mode</h4>

      {/* Grid mode — always selected, informational card */}
      <div className="clay flex flex-col items-center gap-2 p-4 text-center ring-2 ring-soft-purple bg-soft-purple-light/20">
        <div className="w-10 h-10 rounded-xl bg-soft-purple text-white flex items-center justify-center">
          <LayoutGrid className="w-5 h-5" />
        </div>
        <span className="font-outfit font-black text-sm text-plum">Grid (5×5)</span>
        <div className="text-[9px] text-plum/50 font-medium leading-snug space-y-0.5">
          <p>5 locked tiers per topic</p>
          <p>100 → 200 → 300 → 400 → 500 points</p>
          <p>Auto-tagged for grid placement</p>
        </div>
      </div>
    </div>
  );
}
