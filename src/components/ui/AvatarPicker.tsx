import { useState } from "react";
import clsx from "clsx";
import { AVATARS, type AvatarMeta } from "../../assets/avatars";

export interface AvatarPickerProps {
  selected: string;
  onSelect: (key: string) => void;
  className?: string;
}

export default function AvatarPicker({
  selected,
  onSelect,
  className,
}: AvatarPickerProps) {
  const [bouncing, setBouncing] = useState<string | null>(null);

  const handleSelect = (avatar: AvatarMeta) => {
    if (avatar.key === selected) return;
    setBouncing(avatar.key);
    onSelect(avatar.key);
    setTimeout(() => setBouncing(null), 300);
  };

  return (
    <div className={clsx("flex flex-col items-center gap-4", className)}>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-plum/40">
        Pick your avatar
      </p>

      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-4 sm:gap-5 px-2">
        {AVATARS.map((avatar) => {
          const isSelected = avatar.key === selected;
          const isBouncing = avatar.key === bouncing;

          return (
            <button
              key={avatar.key}
              onClick={() => handleSelect(avatar)}
              title={avatar.label}
              className={clsx(
                "clay-avatar w-16 h-16 sm:w-[4.25rem] sm:h-[4.25rem] rounded-full flex items-center justify-center cursor-pointer transition-all duration-200",
                "hover:scale-110 hover:shadow-lg",
                isSelected && "ring-[3px] ring-soft-purple ring-offset-2 scale-110",
                isBouncing && "animate-clay-pop",
              )}
              style={{
                background: isSelected
                  ? "linear-gradient(135deg, #7C5CFC 0%, #A78BFA 100%)"
                  : "var(--clay-surface)",
              }}
            >
              <img
                src={avatar.src}
                alt={avatar.label}
                className={clsx(
                  "w-9 h-9 sm:w-10 sm:h-10 transition-opacity",
                  !isSelected && "opacity-70",
                )}
              />
            </button>
          );
        })}
      </div>

      {selected && (
        <p className="text-[10px] font-medium text-plum/50">
          {AVATARS.find((a) => a.key === selected)?.label} ·{" "}
          {AVATARS.find((a) => a.key === selected)?.theme}
        </p>
      )}
    </div>
  );
}
