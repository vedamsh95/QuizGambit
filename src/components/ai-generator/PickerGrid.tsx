import clsx from "clsx";

export type PickerColor = "purple" | "mint" | "peach" | "sky" | "butter";

export interface PickerItem {
  id: string;
  label: string;
  subtitle: string;
  icon: string;           // emoji
  color: PickerColor;
}

export interface PickerGridProps {
  label: string;
  subtitle?: string;
  items: PickerItem[];
  selected: string[];
  onChange: (selected: string[]) => void;
  maxSelect?: number;
  columns?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

const colorRing: Record<PickerColor, string> = {
  purple: "ring-soft-purple bg-soft-purple-light/20",
  mint: "ring-mint bg-mint-light/20",
  peach: "ring-peach bg-peach-light/20",
  sky: "ring-sky bg-sky-light/20",
  butter: "ring-butter bg-butter-light/20",
};

const colorIconBg: Record<PickerColor, string> = {
  purple: "bg-soft-purple",
  mint: "bg-mint",
  peach: "bg-peach",
  sky: "bg-sky",
  butter: "bg-butter",
};

export default function PickerGrid({
  label,
  subtitle,
  items,
  selected,
  onChange,
  maxSelect,
  columns = 5,
  collapsed = false,
  onToggleCollapse,
  className,
}: PickerGridProps) {
  const handleToggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      if (maxSelect && selected.length >= maxSelect) return;
      onChange([...selected, id]);
    }
  };

  const isAtMax = maxSelect ? selected.length >= maxSelect : false;

  return (
    <div className={clsx("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-outfit font-bold text-sm text-plum">{label}</h4>
          {selected.length > 0 && (
            <span className="clay-badge bg-soft-purple-light text-soft-purple text-[9px]">
              {selected.length} selected
            </span>
          )}
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="text-[10px] font-bold text-plum/50 hover:text-soft-purple uppercase tracking-wider transition-colors"
          >
            {collapsed ? "Customize ▸" : "Collapse ▾"}
          </button>
        )}
      </div>

      {subtitle && (
        <p className="text-[10px] text-plum/50 font-medium">{subtitle}</p>
      )}

      {/* Grid */}
      {!collapsed && (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item) => {
            const isSelected = selected.includes(item.id);
            const isDisabled = !isSelected && isAtMax;

            return (
              <button
                key={item.id}
                onClick={() => !isDisabled && handleToggle(item.id)}
                disabled={isDisabled}
                className={clsx(
                  "clay flex flex-col items-center gap-1.5 p-3 text-center transition-all duration-200",
                  isSelected && `ring-2 ${colorRing[item.color]}`,
                  isSelected && "hover:-translate-y-0",
                  !isSelected && !isDisabled && "hover:-translate-y-0.5 hover:ring-1 hover:ring-soft-purple/20",
                  isDisabled && "opacity-30 cursor-not-allowed",
                )}
                title={item.subtitle}
              >
                {/* Icon */}
                <span
                  className={clsx(
                    "w-8 h-8 rounded-xl flex items-center justify-center text-sm",
                    isSelected ? colorIconBg[item.color] + " text-white" : "bg-clay-border/30 text-plum/60",
                    "transition-colors duration-200",
                  )}
                >
                  {item.icon}
                </span>

                {/* Label */}
                <span className="font-outfit font-bold text-[10px] sm:text-xs text-plum leading-tight">
                  {item.label}
                </span>

                {/* Subtitle */}
                <span className="text-[8px] text-plum/40 font-medium leading-tight hidden sm:block">
                  {item.subtitle}
                </span>

                {/* Selection indicator */}
                <span
                  className={clsx(
                    "text-[8px] font-black uppercase tracking-wider mt-auto",
                    isSelected ? "text-soft-purple" : "text-transparent",
                  )}
                >
                  ✓ Selected
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
