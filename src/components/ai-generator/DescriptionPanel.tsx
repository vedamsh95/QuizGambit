import { type ReactNode } from "react";
import clsx from "clsx";
import type { PickerColor } from "./PickerGrid";

export interface DescriptionItem {
  id: string;
  label: string;
  subtitle: string;
  description: string;
  icon?: string;
  color?: PickerColor;
}

export interface DescriptionPanelProps {
  title: string;
  icon?: ReactNode;
  color?: PickerColor;
  items: DescriptionItem[];
  emptyMessage?: string;
  maxHeight?: string;
  className?: string;
}

const colorAccent: Record<PickerColor, string> = {
  purple: "text-soft-purple",
  mint: "text-mint",
  peach: "text-peach",
  sky: "text-sky",
  butter: "text-butter",
};

const colorBorder: Record<PickerColor, string> = {
  purple: "border-soft-purple/20",
  mint: "border-mint/20",
  peach: "border-peach/20",
  sky: "border-sky/20",
  butter: "border-butter/20",
};

export default function DescriptionPanel({
  title,
  icon,
  color = "purple",
  items,
  emptyMessage = "Select items above to see their descriptions.",
  maxHeight = "max-h-80",
  className,
}: DescriptionPanelProps) {
  return (
    <div className={clsx("clay p-5 space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {icon && <span className="text-sm">{icon}</span>}
        <h4 className="font-outfit font-bold text-sm text-plum">{title}</h4>
        {items.length > 0 && (
          <span className="clay-badge bg-soft-purple-light text-soft-purple text-[9px]">
            {items.length} selected
          </span>
        )}
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <p className="text-xs text-plum/40 font-medium italic py-4 text-center">
          {emptyMessage}
        </p>
      ) : (
        <div className={clsx("overflow-y-auto space-y-0", maxHeight)}>
          {items.map((item, i) => (
            <div
              key={item.id}
              className={clsx(
                "py-3 px-1",
                i < items.length - 1 && "border-b border-clay-border",
              )}
            >
              <div className="flex items-start gap-2">
                {item.icon && (
                  <span className="text-sm mt-0.5 flex-shrink-0">{item.icon}</span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-outfit font-bold text-sm text-plum">
                      {item.label}
                    </span>
                    <span
                      className={clsx(
                        "text-[10px] font-black uppercase tracking-wider",
                        item.color ? colorAccent[item.color] : "text-plum/40",
                      )}
                    >
                      {item.subtitle}
                    </span>
                  </div>
                  <p className="text-xs text-plum/60 leading-relaxed mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
