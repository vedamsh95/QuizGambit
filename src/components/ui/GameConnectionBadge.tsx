import { Wifi, WifiOff } from "lucide-react";
import clsx from "clsx";

export interface GameConnectionBadgeProps {
  isConnected: boolean;
  onlineCount?: number;
  /** Whether to show the "online" text label */
  showLabel?: boolean;
  className?: string;
}

export default function GameConnectionBadge({
  isConnected,
  onlineCount,
  showLabel = true,
  className,
}: GameConnectionBadgeProps) {
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold uppercase tracking-wider transition-colors",
        isConnected ? "text-white/80" : "text-white/80",
        className,
      )}
    >
      {isConnected ? (
        <Wifi className="w-3.5 h-3.5 text-neon-emerald" />
      ) : (
        <WifiOff className="w-3.5 h-3.5 text-red-500 animate-pulse" />
      )}
      {showLabel && (
        <span>
          {isConnected
            ? onlineCount !== undefined
              ? `${onlineCount} online`
              : "Connected"
            : "Reconnecting..."}
        </span>
      )}
    </div>
  );
}
