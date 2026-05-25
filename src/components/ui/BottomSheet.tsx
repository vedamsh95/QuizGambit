import { type ReactNode, useEffect, useRef } from "react";
import clsx from "clsx";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  height?: number;
  dragHandle?: boolean;
  className?: string;
}

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  height = 50,
  dragHandle = true,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentTranslateRef = useRef(0);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Lock body scroll + focus trap when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      // Focus trap: move focus into the sheet
      requestAnimationFrame(() => {
        sheetRef.current?.focus();
      });
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentTranslateRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      currentTranslateRef.current = delta;
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translateY(${delta}px)`;
      }
    }
  };

  const handleTouchEnd = () => {
    if (currentTranslateRef.current > 120) {
      onClose();
    }
    if (sheetRef.current) {
      sheetRef.current.style.transform = "translateY(0)";
    }
    currentTranslateRef.current = 0;
  };

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-plum/20 backdrop-blur-sm animate-clay-pop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={clsx(
          "absolute bottom-0 left-0 right-0 clay-elevated rounded-t-[32px] transition-transform duration-300",
          "animate-clay-pop",
          "pb-[env(safe-area-inset-bottom,16px)]",
          className,
        )}
        style={{ maxHeight: `${height}vh`, height: "auto" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Bottom sheet"}
        tabIndex={-1}
      >
        {/* Drag handle */}
        {dragHandle && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1.5 rounded-full bg-warm-gray/30" />
          </div>
        )}

        {/* Title */}
        {title && (
          <div className="px-6 pb-3">
            <h3 className="font-outfit font-extrabold text-lg text-plum text-center">
              {title}
            </h3>
          </div>
        )}

        {/* Content */}
        <div className="px-6 pb-6 overflow-y-auto" style={{ maxHeight: `calc(${height}vh - 72px)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
