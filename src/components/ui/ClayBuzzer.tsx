import clsx from "clsx";
import { Zap, Trophy } from "lucide-react";

type BuzzerState = "locked" | "open" | "buzzed";
type BuzzerSize = "sm" | "lg";

export interface ClayBuzzerProps {
  state?: BuzzerState;
  size?: BuzzerSize;
  onClick?: () => void;
  className?: string;
}

const sizeStyles: Record<BuzzerSize, string> = {
  sm: "w-32 h-32 rounded-[28px]",
  lg: "w-44 h-44 rounded-[36px]",
};

const stateConfig: Record<BuzzerState, {
  bg: string;
  text: string;
  border: string;
  shadow: string;
  icon: React.ReactNode;
  label: string;
  animate: string;
}> = {
  locked: {
    bg: "bg-warm-gray/15",
    text: "text-warm-gray",
    border: "border-white/30",
    shadow: "shadow-none",
    icon: <Zap className="w-10 h-10 text-warm-gray/50" />,
    label: "Wait...",
    animate: "opacity-50",
  },
  open: {
    bg: "bg-soft-purple",
    text: "text-white",
    border: "border-white/20",
    shadow: "shadow-[6px_6px_20px_rgba(124,92,252,0.3)]",
    icon: <Zap className="w-14 h-14 text-white fill-white" />,
    label: "BUZZ!",
    animate: "animate-buzzer-pulse",
  },
  buzzed: {
    bg: "bg-mint",
    text: "text-white",
    border: "border-white/20",
    shadow: "shadow-[6px_6px_20px_rgba(52,211,153,0.3)]",
    icon: <Trophy className="w-14 h-14 text-white" />,
    label: "GO!",
    animate: "",
  },
};

export default function ClayBuzzer({
  state = "locked",
  size = "lg",
  onClick,
  className,
}: ClayBuzzerProps) {
  const c = stateConfig[state];

  return (
    <button
      onClick={state === "open" ? onClick : undefined}
      className={clsx(
        "flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200",
        "active:scale-95",
        c.bg,
        c.text,
        sizeStyles[size],
        c.animate,
        state === "locked" && "cursor-not-allowed clay-pressed",
        state !== "locked" && "clay-elevated",
        className,
      )}
      aria-label={`Buzzer: ${state}`}
      style={{
        border: "2px solid rgba(255,255,255,0.2)",
      }}
    >
      {c.icon}
      <span className={clsx(
        "font-outfit font-black",
        size === "sm" ? "text-lg" : "text-2xl",
        c.text,
      )}>
        {c.label}
      </span>
    </button>
  );
}
