import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Zap } from "lucide-react";
import { ClayAvatar } from "./ui";

// ── Player color palette ────────────────────────────────────────────────────

const PLAYER_COLORS = [
  { bg: "bg-soft-purple", bgLight: "bg-soft-purple-light", text: "text-soft-purple", ring: "ring-soft-purple/40", border: "border-soft-purple/30" },
  { bg: "bg-peach", bgLight: "bg-peach-light", text: "text-peach", ring: "ring-peach/40", border: "border-peach/30" },
  { bg: "bg-sky", bgLight: "bg-sky-light", text: "text-sky", ring: "ring-sky/40", border: "border-sky/30" },
  { bg: "bg-mint", bgLight: "bg-mint-light", text: "text-mint", ring: "ring-mint/40", border: "border-mint/30" },
];

function getColor(index: number) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

// ── Types ───────────────────────────────────────────────────────────────────

interface PlayerScore {
  id: string;
  name: string;
  score: number;
  hearts: number;
  wordCount: number;
  isYou: boolean;
}

interface LinksStickyScoreboardProps {
  players: PlayerScore[];
  compact?: boolean;
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function LinksStickyScoreboard({
  players,
  compact = false,
  className = "",
}: LinksStickyScoreboardProps) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  if (sorted.length === 0) return null;

  return (
    <div
      className={`w-full bg-warm-white/90 backdrop-blur-md border-b border-warm-gray/10 px-2 sm:px-4 py-2 flex items-center gap-1 sm:gap-2 overflow-x-auto hide-scrollbar ${className}`}
    >
      {/* Label */}
      <span className="text-[9px] font-black text-warm-gray/40 uppercase tracking-widest flex-shrink-0 mr-1">
        {t('links.live')}
      </span>

      {/* Player chips */}
      <div className="flex items-center gap-1.5 sm:gap-3 flex-1 min-w-0">
        {sorted.map((p, idx) => {
          const color = getColor(idx);

          return (
            <div
              key={p.id}
              className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full border flex-shrink-0 transition-all duration-300 ${
                p.isYou ? `${color.ring} ring-2 ${color.bgLight} ${color.border}` : "border-warm-gray/10 bg-warm-white"
              }`}
              title={`${p.name}: ${p.score} pts · ${p.wordCount} words · ${p.hearts} hearts`}
            >
              {/* Rank */}
              {!compact && sorted.length > 1 && (
                <span className="text-[10px] font-black text-warm-gray/40 w-3 text-center">
                  {idx === 0 ? "👑" : `#${idx + 1}`}
                </span>
              )}

              {/* Avatar */}
              <ClayAvatar
                name={p.name}
                size="sm"
                color={color.bg}
              />

              {/* Name (hidden on small screens if compact) */}
              {!compact && (
                <span className={`font-outfit font-bold text-xs truncate max-w-[60px] sm:max-w-[80px] ${
                  p.isYou ? color.text : "text-plum"
                }`}>
                  {p.isYou ? "YOU" : p.name}
                </span>
              )}

              {/* Score */}
              <span className={`font-mono font-black text-xs sm:text-sm ${color.text}`}>
                {p.score}
              </span>

              {/* Hearts (animated mini) */}
              <div className="flex gap-px">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Heart
                    key={i}
                    className={`w-2.5 h-2.5 sm:w-3 sm:h-3 transition-all duration-500 ${
                      i < p.hearts
                        ? "text-peach fill-peach"
                        : "text-warm-gray/20"
                    }`}
                  />
                ))}
              </div>

              {/* Word count pill */}
              {!compact && (
                <span className="text-[9px] font-bold text-warm-gray/40 bg-warm-gray/5 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Zap className="w-2 h-2" />
                  {p.wordCount}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
