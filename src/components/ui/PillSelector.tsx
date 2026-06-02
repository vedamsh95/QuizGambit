import { type ReactNode } from "react";
import clsx from "clsx";

export interface PillOption {
  value: string | number;
  label: string;
  sublabel?: string;
  description?: string;
  disabled?: boolean;
}

interface PillSelectorProps {
  label: string;
  sublabel?: string;
  options: PillOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  variant?: "purple" | "mint";
  columns?: number;
  className?: string;
}

const selectedStyles = {
  purple: "bg-soft-purple text-white border-soft-purple shadow-md shadow-soft-purple/20",
  mint: "bg-mint text-white border-mint shadow-md shadow-mint/20",
};

const unselectedStyles =
  "bg-warm-white border-warm-gray/15 text-plum/70 hover:border-soft-purple/30 hover:bg-soft-purple-light/30";

const disabledStyles = "bg-warm-gray/5 text-warm-gray/30 border-warm-gray/10 cursor-not-allowed";

export default function PillSelector({
  label,
  sublabel,
  options,
  value,
  onChange,
  disabled = false,
  variant = "purple",
  columns,
  className,
}: PillSelectorProps) {
  const selectedOpt = options.find((o) => o.value === value);

  return (
    <div className={clsx("space-y-2.5", className)}>
      <div>
        <h4 className="font-outfit font-bold text-sm text-plum">{label}</h4>
        {sublabel && (
          <p className="text-xs text-plum/50 mt-0.5">{sublabel}</p>
        )}
      </div>

      <div
        className="grid gap-1.5 sm:gap-2"
        style={
          columns
            ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
            : { gridTemplateColumns: "repeat(auto-fill, minmax(3.5rem, 1fr))" }
        }
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
          const isDisabled = disabled || opt.disabled;

          return (
            <button
              key={opt.value}
              onClick={() => !isDisabled && onChange(opt.value)}
              disabled={isDisabled}
              className={clsx(
                "relative flex flex-col items-center justify-center gap-0.5 px-1.5 py-2 sm:px-3 sm:py-2.5 rounded-lg sm:rounded-xl border-2 text-xs sm:text-sm font-outfit font-bold transition-all duration-200 min-w-0",
                isDisabled
                  ? disabledStyles
                  : isSelected
                    ? selectedStyles[variant]
                    : unselectedStyles
              )}
            >
              <span className="text-xs sm:text-sm font-black truncate">{opt.label}</span>
              {opt.sublabel && (
                <span
                  className={clsx(
                    "text-[8px] sm:text-[10px] font-medium leading-tight truncate",
                    isSelected ? "text-white/80" : "text-plum/40"
                  )}
                >
                  {opt.sublabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected option description */}
      {selectedOpt?.description && (
        <p className="text-xs text-plum/60 font-medium leading-relaxed">
          {selectedOpt.description}
        </p>
      )}
    </div>
  );
}
