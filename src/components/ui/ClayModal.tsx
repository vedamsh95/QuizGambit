import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ClayModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export default function ClayModal({ open, onClose, title, icon, children }: ClayModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

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
        className="relative w-full max-w-lg bg-warm-white rounded-[28px] shadow-xl border border-clay-border/50 animate-clay-pop overflow-hidden flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-clay-border/30 bg-warm-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-soft-purple-light/30 text-soft-purple">
                {icon}
              </div>
            )}
            <h3 className="font-outfit font-extrabold text-xl text-plum">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-warm-gray/50 hover:text-plum hover:bg-warm-gray/5 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
