import { type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

type Variant = "danger" | "ghost" | "primary" | "subtle";

export interface GameHeaderButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
  children?: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  danger:
    "bg-red-500/15 hover:bg-red-500/30 border-red-500/30 hover:border-red-500/50",
  ghost:
    "bg-white/5 hover:bg-white/10 border-white/10 hover:border-neon-emerald/30",
  primary:
    "bg-neon-emerald/15 hover:bg-neon-emerald/25 border-neon-emerald/30 hover:border-neon-emerald/50",
  subtle:
    "bg-white/5 hover:bg-white/10 border-white/5",
};

export default function GameHeaderButton({
  variant = "ghost",
  icon,
  children,
  className,
  ...props
}: GameHeaderButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold uppercase tracking-wider transition-all",
        "text-white",
        "active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed",
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
