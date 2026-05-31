import { type ReactNode, useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  children?: ReactNode;
  loading?: boolean;
}

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  children,
  loading = false,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Lock body scroll + auto-focus confirm button
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => confirmBtnRef.current?.focus());
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const variantColors = {
    danger: {
      icon: "text-peach bg-peach-light/30",
      confirm: "bg-peach hover:bg-peach/90 text-white",
      ring: "ring-peach/30",
    },
    warning: {
      icon: "text-butter bg-butter-light/30",
      confirm: "bg-butter hover:bg-butter/90 text-plum",
      ring: "ring-butter/30",
    },
    default: {
      icon: "text-soft-purple bg-soft-purple-light/30",
      confirm: "bg-soft-purple hover:bg-soft-purple/90 text-white",
      ring: "ring-soft-purple/30",
    },
  };

  const colors = variantColors[variant];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-plum/20 backdrop-blur-sm animate-clay-pop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        className="relative w-full max-w-sm bg-warm-white rounded-[28px] shadow-xl border border-clay-border/50 animate-clay-pop overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.icon}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-outfit font-extrabold text-lg text-plum">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-warm-gray/50 hover:text-plum hover:bg-warm-gray/5 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-3">
          {message && (
            <p className="text-sm text-warm-gray/60 font-medium leading-relaxed">
              {message}
            </p>
          )}
          {children}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-5 py-2.5 rounded-xl border border-warm-gray/15 bg-warm-gray/5 text-sm font-bold text-warm-gray/60 hover:text-plum hover:bg-warm-gray/10 hover:border-warm-gray/25 transition-all disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${colors.ring} disabled:opacity-50 flex items-center justify-center gap-2 ${colors.confirm}`}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
