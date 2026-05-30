import clsx from "clsx";
import { Swords } from "lucide-react";

type LogoSize = "sm" | "md" | "lg";

interface FrayLogoProps {
  size?: LogoSize;
  showTagline?: boolean;
  className?: string;
}

const sizeMap: Record<
  LogoSize,
  {
    tile: string;
    letter: string;
    gap: string;
    padding: string;
    radius: string;
    sub: string;
  }
> = {
  sm: {
    tile: "w-10 h-12",
    letter: "text-xl",
    gap: "gap-1.5",
    padding: "p-2.5",
    radius: "14px",
    sub: "text-[9px]",
  },
  md: {
    tile: "w-12 h-14 sm:w-14 sm:h-16",
    letter: "text-2xl sm:text-3xl",
    gap: "gap-2 sm:gap-3",
    padding: "p-3 sm:p-3.5",
    radius: "16px",
    sub: "text-[10px] sm:text-xs",
  },
  lg: {
    tile: "w-16 h-[72px] sm:w-[88px] sm:h-[96px]",
    letter: "text-4xl sm:text-5xl",
    gap: "gap-2 sm:gap-4",
    padding: "p-3 sm:p-4",
    radius: "18px",
    sub: "text-xs sm:text-sm",
  },
};

// Clay-elevated shadow matching the .clay-elevated class in index.css
const clayElevatedShadow =
  "10px 10px 30px rgba(139, 92, 246, 0.28), inset 1px 1px 0px rgba(255, 255, 255, 0.95), inset -2px -2px 0px rgba(255, 107, 138, 0.12)";

const letters = [
  { char: "F", color: "#7C5CFC" },
  { char: "R", color: "#8B6CF6" },
  { char: "A", color: "#A78BFA" },
  { char: "Y", color: "#C4B5FD" },
];

export default function FrayLogo({
  size = "md",
  showTagline = true,
  className,
}: FrayLogoProps) {
  const s = sizeMap[size];

  return (
    <div
      className={clsx(
        "flex flex-col items-center gap-4 sm:gap-5 animate-clay-pop select-none",
        className,
      )}
    >
      {/* ── Purple ambient glow behind the logo ───────────────────── */}
      <div className="relative">
        <div
          className="absolute inset-0 blur-3xl opacity-20 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(139, 92, 246, 0.6) 0%, transparent 70%)",
          }}
        />

        {/* ── FRAY — each letter as a clay card tile ─────────────── */}
        <div className={clsx("relative flex items-center", s.gap)}>
          {letters.map(({ char, color }) => (
            <div
              key={char}
              className={clsx(
                "relative flex items-center justify-center",
                "bg-white border border-white/80",
                "transition-all duration-200",
                "hover:-translate-y-1 hover:scale-105",
                "active:scale-95",
                "cursor-default",
                s.tile,
                s.padding,
              )}
              style={{
                borderRadius: s.radius,
                boxShadow: clayElevatedShadow,
                transition:
                  "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {/* Top-left white shine overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  borderRadius: s.radius,
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, transparent 50%)",
                }}
              />

              {/* Letter */}
              <span
                className={clsx(
                  "font-outfit font-black leading-none relative z-10",
                  s.letter,
                )}
                style={{ color }}
              >
                {char}
              </span>
            </div>
          ))}
        </div>

        {/* ── Underline accent ─────────────────────────────────────── */}
        <div
          className="absolute -bottom-2 sm:-bottom-3 left-1/2 -translate-x-1/2 h-1 rounded-full"
          style={{
            width: "50%",
            background:
              "linear-gradient(90deg, transparent, rgba(139,92,246,0.3), rgba(167,139,250,0.5), rgba(139,92,246,0.3), transparent)",
          }}
        />
      </div>

      {/* ── Tagline ───────────────────────────────────────────────── */}
      {showTagline && (
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-px w-6 sm:w-10 bg-gradient-to-r from-transparent to-soft-purple/20" />
          <div
            className={clsx(
              "font-outfit font-bold tracking-[0.15em] uppercase text-plum/45",
              s.sub,
              "flex items-center gap-1.5",
            )}
          >
            <Swords className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-soft-purple/30" />
            <span>P L A Y F R A Y</span>
            <Swords className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-soft-purple/30" />
          </div>
          <div className="h-px w-6 sm:w-10 bg-gradient-to-r from-soft-purple/20 to-transparent" />
        </div>
      )}
    </div>
  );
}
