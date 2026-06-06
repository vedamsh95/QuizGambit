import { type HTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

type BadgeColor = "purple" | "mint" | "peach" | "sky" | "butter" | "gray";

export interface ClayBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

const colorMap: Record<BadgeColor, { bg: string; text: string; dotColor: string }> = {
  purple: { bg: "bg-soft-purple-light", text: "text-soft-purple", dotColor: "bg-soft-purple" },
  mint: { bg: "bg-mint-light", text: "text-mint", dotColor: "bg-mint" },
  peach: { bg: "bg-peach-light", text: "text-peach", dotColor: "bg-peach" },
  sky: { bg: "bg-sky-light", text: "text-sky", dotColor: "bg-sky" },
  butter: { bg: "bg-butter-light", text: "text-butter", dotColor: "bg-butter" },
  gray: { bg: "bg-cream", text: "text-warm-gray", dotColor: "bg-warm-gray" },
};

export default function ClayBadge({
  color = "purple",
  dot = false,
  children,
  className,
  ...props
}: ClayBadgeProps) {
  const c = colorMap[color];

  return (
    <span className={clsx("clay-badge", c.bg, c.text, className)} {...props}>
      {dot && <span className={clsx("inline-block w-2 h-2 rounded-full", c.dotColor)} />}
      {children}
    </span>
  );
}
