import clsx from "clsx";
import type { PlayerPersona } from "../../lib/ai/types";

export interface PersonaPickerProps {
  selected: PlayerPersona[];
  onChange: (selected: PlayerPersona[]) => void;
  className?: string;
}

interface PersonaMeta {
  id: PlayerPersona;
  label: string;
  icon: string;
  subtitle: string;
  tone: string;
  description: string;
  color: "purple" | "mint" | "peach" | "sky" | "butter";
}

const PERSONA_META: PersonaMeta[] = [
  {
    id: "Casual Explorer",
    label: "Casual Explorer",
    icon: "🧘",
    subtitle: "Warm, inviting",
    tone: "Accessible",
    description:
      "Questions written for someone with general interest but no deep expertise. Strong backdoors, hospitable difficulty, and engaging storytelling that welcomes everyone.",
    color: "mint",
  },
  {
    id: "Competitive Duelist",
    label: "Competitive Duelist",
    icon: "⚔️",
    subtitle: "Sharp, edgy",
    tone: "Challenging",
    description:
      "Questions with a competitive edge — tighter clues, moderate backdoors, and satisfying difficulty for experienced trivia players who want to test their limits.",
    color: "purple",
  },
  {
    id: "Party Group",
    label: "Party Group",
    icon: "🎉",
    subtitle: "Fun, chaotic",
    tone: "Lively",
    description:
      "Questions optimized for group play — strong backdoors, crowd-pleasing topics, and a fun, energetic tone that keeps everyone engaged regardless of skill level.",
    color: "peach",
  },
  {
    id: "Speed Runner",
    label: "Speed Runner",
    icon: "⚡",
    subtitle: "Rapid, punchy",
    tone: "Fast-paced",
    description:
      "Short, punchy questions designed for rapid-fire play. Quick comprehension, subtle backdoors, and minimal reading time for maximum adrenaline.",
    color: "butter",
  },
  {
    id: "Deep Learner",
    label: "Deep Learner",
    icon: "📚",
    subtitle: "Scholarly, rich",
    tone: "Expert",
    description:
      "Rich, nuanced questions for knowledge enthusiasts. Moderate backdoors reward genuine expertise, with sophisticated vocabulary and layered clues that deepen understanding.",
    color: "sky",
  },
];

const colorRing: Record<string, string> = {
  purple: "ring-soft-purple bg-soft-purple-light/20",
  mint: "ring-mint bg-mint-light/20",
  peach: "ring-peach bg-peach-light/20",
  sky: "ring-sky bg-sky-light/20",
  butter: "ring-butter bg-butter-light/20",
};

const colorIconBg: Record<string, string> = {
  purple: "bg-soft-purple",
  mint: "bg-mint",
  peach: "bg-peach",
  sky: "bg-sky",
  butter: "bg-butter",
};

export default function PersonaPicker({
  selected,
  onChange,
  className,
}: PersonaPickerProps) {
  const handleToggle = (persona: PlayerPersona) => {
    if (selected.includes(persona)) {
      if (selected.length <= 1) return; // minimum 1
      onChange(selected.filter((s) => s !== persona));
    } else {
      onChange([...selected, persona]);
    }
  };

  return (
    <div className={clsx("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-outfit font-bold text-sm text-plum">Player Persona</h4>
          {selected.length > 0 && (
            <span className="clay-badge bg-soft-purple-light text-soft-purple text-[9px]">
              {selected.length} selected
            </span>
          )}
        </div>
      </div>

      <p className="text-[10px] text-plum/50 font-medium">
        Questions adapt tone, difficulty, and backdoor strength based on who
        {" you're"} writing for. Pick one or more.
      </p>

      {/* Persona cards — 2 columns */}
      <div className="grid grid-cols-2 gap-2">
        {PERSONA_META.map((p) => {
          const isSelected = selected.includes(p.id);

          return (
            <button
              key={p.id}
              onClick={() => handleToggle(p.id)}
              className={clsx(
                "clay flex flex-col items-start gap-1.5 p-3 text-left transition-all duration-200",
                isSelected && `ring-2 ${colorRing[p.color]}`,
                isSelected && "hover:-translate-y-0",
                !isSelected && "hover:-translate-y-0.5 hover:ring-1 hover:ring-soft-purple/20",
              )}
              title={p.description}
            >
              {/* Icon + Label row */}
              <div className="flex items-center gap-2 w-full">
                <span
                  className={clsx(
                    "w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 transition-colors",
                    isSelected ? colorIconBg[p.color] + " text-white" : "bg-clay-border/30",
                  )}
                >
                  {p.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-outfit font-bold text-[10px] sm:text-xs text-plum block truncate">
                    {p.label}
                  </span>
                  <span className="text-[8px] text-plum/40 font-medium">{p.subtitle}</span>
                </div>
              </div>

              {/* Selection indicator */}
              <span
                className={clsx(
                  "text-[8px] font-black uppercase tracking-wider w-full",
                  isSelected ? "text-soft-purple" : "text-transparent",
                )}
              >
                ✓ Selected
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { PERSONA_META };
