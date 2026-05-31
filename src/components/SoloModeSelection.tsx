import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Grid3X3, Link, Zap } from "lucide-react";
import clsx from "clsx";

interface SoloGameConfig {
  id: string;
  label: string;
  tagline: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  cardAccent: string;
  glowColor: string;
  route: string;
  features: string[];
}

const SOLO_GAMES: SoloGameConfig[] = [
  {
    id: "5x5",
    label: "5×5 Quiz",
    tagline: "The flagship trivia board",
    description:
      "Answer questions across a 5×5 grid of categories and point values. Build streaks, clear eliminator tiles, and maximize your score.",
    icon: Grid3X3,
    gradient: "from-purple-600 via-violet-500 to-indigo-500",
    cardAccent: "bg-gradient-to-br from-soft-purple-light/40 to-transparent",
    glowColor: "shadow-purple-500/25",
    route: "/solo/5x5",
    features: ["5×5 Board", "Point Values", "Streak Bonuses", "Eliminator Tiles"],
  },
  {
    id: "links",
    label: "Links",
    tagline: "Word-building against the clock",
    description:
      "Type words containing given letters before the timer runs out. Three waves of increasing difficulty. Power words, combos, and target bonuses.",
    icon: Link,
    gradient: "from-emerald-600 via-teal-500 to-cyan-400",
    cardAccent: "bg-gradient-to-br from-mint-light/40 to-transparent",
    glowColor: "shadow-emerald-500/20",
    route: "/solo/links",
    features: ["Word Building", "Wave Timer", "Combo System", "Target Word"],
  },
];

export default function SoloModeSelection() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 flex items-center gap-3 border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t("common.back")}</span>
        </button>
        <span className="font-outfit font-black text-lg text-plum">
          {t("home.playSolo")}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center p-4 sm:p-6 max-w-2xl mx-auto w-full gap-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-mint-light text-mint text-[10px] font-black tracking-[0.2em] uppercase">
            <Zap className="w-3 h-3" />
            {t("solo.modePicker")}
          </div>
          <h1 className="font-outfit font-black text-2xl sm:text-3xl text-plum">
            {t("home.playSolo")}
          </h1>
          <p className="text-xs text-warm-gray/70 font-medium max-w-md mx-auto">
            Practice by yourself with these solo game modes
          </p>
        </div>

        {/* Available Solo Games */}
        <div className="w-full space-y-3">
          <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest">
            Available Now
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SOLO_GAMES.map((game) => (
              <button
                key={game.id}
                onClick={() => navigate(game.route)}
                className={clsx(
                  "clay text-left w-full transition-all duration-300 overflow-hidden group",
                  game.cardAccent,
                  "cursor-pointer hover:-translate-y-1",
                )}
              >
                <div className="p-5">
                  {/* Top row: icon */}
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${game.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}
                    >
                      <game.icon className="w-5 h-5 text-white" />
                    </div>
                  </div>

                  {/* Title + tagline */}
                  <h3 className="font-outfit font-black text-lg mb-0.5 text-plum">
                    {game.label}
                  </h3>
                  <p className="text-xs font-semibold text-warm-gray/50 mb-3">
                    {game.tagline}
                  </p>

                  {/* Description */}
                  <p className="text-[11px] leading-relaxed text-warm-gray/60 mb-3 line-clamp-3">
                    {game.description}
                  </p>

                  {/* Feature chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {game.features.map((feat) => (
                      <span
                        key={feat}
                        className="text-[10px] font-bold text-warm-gray/70 bg-warm-gray/5 px-2 py-0.5 rounded-full border border-warm-gray/10"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>

                  {/* Play button */}
                  <div className="mt-4 pt-3 border-t border-warm-gray/10">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-warm-gray/40 uppercase tracking-wider">
                        Solo Play
                      </span>
                      <span className="flex items-center gap-1 text-xs font-bold text-soft-purple group-hover:translate-x-1 transition-transform">
                        Play →
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
