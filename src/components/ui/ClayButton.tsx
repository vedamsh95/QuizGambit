import { type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "destructive" | "success" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ClayButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary: "bg-soft-purple text-white",
  secondary: "text-plum",
  destructive: "bg-peach-light text-peach",
  success: "bg-mint-light text-mint",
  ghost: "bg-transparent text-plum",
};

const variantBorders: Record<Variant, string> = {
  primary: "rgba(124,92,252,0.3)",
  secondary: "rgba(255,255,255,0.7)",
  destructive: "rgba(255,107,138,0.3)",
  success: "rgba(52,211,153,0.3)",
  ghost: "transparent",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-4 py-2 text-sm rounded-xl",
  md: "px-6 py-3 text-base rounded-2xl",
  lg: "px-8 py-4 text-lg rounded-2xl",
};

export default function ClayButton({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  icon,
  children,
  className,
  ...props
}: ClayButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      className={clsx(
        "clay-btn font-outfit font-bold inline-flex items-center justify-center gap-2",
        variantStyles[variant],
        sizeStyles[size],
        isDisabled && "clay-btn-disabled",
        className,
      )}
      style={{
        borderColor: variantBorders[variant],
        borderWidth: variant === "ghost" ? "0px" : "1.5px",
        borderStyle: variant === "ghost" ? "none" : "solid",
        boxShadow: variant === "ghost" ? "none" : undefined,
      }}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
