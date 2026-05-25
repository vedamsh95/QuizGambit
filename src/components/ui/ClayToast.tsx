import { useState, useCallback, useEffect, useRef, createContext, useContext, type ReactNode } from "react";
import clsx from "clsx";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  exiting?: boolean;
}

const typeConfig: Record<ToastType, { icon: ReactNode; bg: string; text: string }> = {
  success: { icon: <CheckCircle className="w-5 h-5" />, bg: "bg-mint-light", text: "text-mint" },
  error: { icon: <AlertCircle className="w-5 h-5" />, bg: "bg-peach-light", text: "text-peach" },
  warning: { icon: <AlertTriangle className="w-5 h-5" />, bg: "bg-butter-light", text: "text-butter" },
  info: { icon: <Info className="w-5 h-5" />, bg: "bg-sky-light", text: "text-sky" },
};

// ── Toast Context ──────────────────────────────────────────────────────────

interface ToastContextValue {
  addToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

// ── Toast Provider ─────────────────────────────────────────────────────────

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto-dismiss after 3.5s
    const dismissTimer = setTimeout(() => {
      // Start exit animation
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
      // Remove after animation
      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 200);
      timersRef.current.push(removeTimer);
    }, 3500);
    timersRef.current.push(dismissTimer);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
    timersRef.current.push(removeTimer);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const config = typeConfig[toast.type];
          return (
            <div
              key={toast.id}
              className={clsx(
                "pointer-events-auto clay px-4 py-3 flex items-center gap-3 min-w-[280px] max-w-[380px]",
                "shadow-[4px_4px_12px_rgba(166,157,145,0.25)]",
                toast.exiting ? "animate-toast-out" : "animate-toast-in",
              )}
            >
              <span className={clsx("flex-shrink-0", config.text)}>
                {config.icon}
              </span>
              <p className={clsx("flex-1 font-outfit font-bold text-sm", config.text)}>
                {toast.message}
              </p>
              <button
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 text-warm-gray/50 hover:text-warm-gray transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
