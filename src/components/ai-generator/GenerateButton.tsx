import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export interface GenerateButtonProps {
  /** Button label or children */
  children: ReactNode;
  /** Click handler */
  onClick: () => void;
  /** Whether the button is in a loading state */
  loading?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional icon (shown when not loading) */
  icon?: ReactNode;
  /** Additional className */
  className?: string;
  /** Make the button full-width */
  fullWidth?: boolean;
  /** Use bigger text/padding for main CTA */
  large?: boolean;
}

export default function GenerateButton({
  children,
  onClick,
  loading = false,
  disabled = false,
  icon,
  className = "",
  fullWidth = false,
  large = false,
}: GenerateButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`clay-btn bg-soft-purple text-white font-outfit font-bold
        ${large ? "py-4 text-base font-black" : "py-3 text-sm"}
        rounded-xl hover:bg-soft-purple/90 transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${fullWidth ? "flex w-full" : "inline-flex px-5"}
        items-center justify-center gap-2
        ${className}`}
    >
      {loading ? (
        <Loader2 className={large ? "w-5 h-5 animate-spin" : "w-4 h-4 animate-spin"} />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
