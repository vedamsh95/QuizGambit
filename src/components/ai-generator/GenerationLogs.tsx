import { useEffect, useRef } from "react";
import clsx from "clsx";

export interface LogEntry {
  timestamp: string;
  message: string;
  type?: "info" | "success" | "error" | "warning";
}

export interface GenerationLogsProps {
  logs: LogEntry[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClear?: () => void;
  maxHeight?: string;
  className?: string;
}

const typeColors: Record<string, string> = {
  info: "text-plum/60",
  success: "text-mint",
  error: "text-peach",
  warning: "text-butter",
};

const typeIcons: Record<string, string> = {
  info: "",
  success: "✅",
  error: "❌",
  warning: "⚠️",
};

export default function GenerationLogs({
  logs,
  collapsed = false,
  onToggleCollapse,
  onClear,
  maxHeight = "max-h-60",
  className,
}: GenerationLogsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className={clsx("clay-pressed p-4 bg-cream/30 space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-outfit font-bold text-[10px] text-plum/60 uppercase tracking-wider">
          🖥️ Generation Log
        </h4>
        <div className="flex items-center gap-2">
          {onClear && logs.length > 0 && (
            <button
              onClick={onClear}
              className="text-[8px] font-bold text-plum/30 hover:text-plum/60 uppercase tracking-wider transition-colors"
            >
              Clear
            </button>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="text-[8px] font-bold text-plum/30 hover:text-plum/60 uppercase tracking-wider transition-colors"
            >
              {collapsed ? "▸" : "▾"}
            </button>
          )}
        </div>
      </div>

      {/* Log lines */}
      {!collapsed && (
        <div
          ref={containerRef}
          className={clsx("overflow-y-auto space-y-0.5", maxHeight)}
        >
          {logs.length === 0 ? (
            <p className="text-[10px] font-mono text-plum/20 italic py-2 text-center">
              System Ready. Waiting for input...
            </p>
          ) : (
            logs.map((entry, i) => (
              <div
                key={i}
                className={clsx(
                  "text-[10px] font-mono leading-relaxed animate-slide-up-fade",
                  typeColors[entry.type || "info"],
                )}
                style={{ animationDelay: `${i * 10}ms` }}
              >
                <span className="text-plum/30">[{entry.timestamp}]</span>{" "}
                {typeIcons[entry.type || "info"] && (
                  <span>{typeIcons[entry.type || "info"]} </span>
                )}
                {entry.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
