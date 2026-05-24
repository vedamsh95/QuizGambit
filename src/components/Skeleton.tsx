import { useMemo, useEffect } from "react";

// Inject shimmer keyframes into the document head (once)
let shimmerInjected = false;
function injectShimmer() {
  if (shimmerInjected) return;
  if (typeof document === 'undefined') return;
  shimmerInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Skeleton — Loading placeholder with shimmer animation.
 *
 * Variants:
 * - "text"   — single line of text
 * - "card"   — rounded card with header + body lines
 * - "circle" — circular (e.g. avatar)
 * - "grid"   — grid of cards (for board/game placeholders)
 * - "block"  — generic rectangle
 */

interface SkeletonProps {
  variant?: "text" | "card" | "circle" | "grid" | "block";
  width?: string | number;
  height?: string | number;
  count?: number;
  className?: string;
}

function ShimmerBar({ width, height, className = "" }: { width?: string | number; height?: string | number; className?: string }) {
  return (
    <div
      className={`bg-white/5 rounded-md overflow-hidden relative ${className}`}
      style={{
        width: width || "100%",
        height: height || 16,
      }}
    >
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

export default function Skeleton({ variant = "text", width, height, count = 1, className = "" }: SkeletonProps) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  // Ensure shimmer keyframes are injected
  useEffect(() => { injectShimmer(); }, []);

  if (variant === "circle") {
    return (
      <div className={`flex gap-3 ${className}`}>
        {items.map((i) => (
          <div
            key={i}
            className="bg-white/5 rounded-full overflow-hidden relative"
            style={{ width: width || 48, height: height || 48 }}
          >
            <div
              className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={`space-y-2 ${className}`}>
        {items.map((i) => (
          <ShimmerBar key={i} width={width} height={height} />
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`space-y-3 ${className}`}>
        {items.map((i) => (
          <div key={i} className="bg-white/5 rounded-xl p-4 border border-white/5 overflow-hidden relative">
            <ShimmerBar height={20} width="60%" />
            <div className="mt-3 space-y-2">
              <ShimmerBar height={12} width="90%" />
              <ShimmerBar height={12} width="75%" />
            </div>
            {/* Shimmer overlay */}
            <div
              className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] pointer-events-none"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className={className}>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
          {items.map((col) => (
            <div key={col} className="flex flex-col gap-2">
              {/* Category header */}
              <div className="h-16 md:h-20 bg-white/5 rounded-lg border border-white/5 overflow-hidden relative">
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
                  style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)" }}
                />
              </div>
              {/* Question cells */}
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="flex-1 min-h-[60px] bg-white/5 rounded border border-white/5 overflow-hidden relative">
                  <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
                    style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)" }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // variant === "block"
  return (
    <div className={className}>
      {items.map((i) => (
        <ShimmerBar key={i} width={width} height={height} />
      ))}
    </div>
  );
}
