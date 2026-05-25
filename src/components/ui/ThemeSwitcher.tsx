import { useTheme, type Theme } from "./ThemeProvider";
import { Sun, Moon, Palette } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ThemeSwitcherProps {
  compact?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────

const THEMES: { key: Theme; label: string; icon: typeof Sun; className: string }[] = [
  { key: "light", label: "Light", icon: Sun, className: "bg-white text-amber-500" },
  { key: "dark", label: "Dark", icon: Moon, className: "bg-gray-800 text-indigo-300" },
  { key: "multi", label: "Candy", icon: Palette, className: "bg-gradient-to-br from-pink-400 via-purple-400 to-cyan-400 text-white" },
];

// ── Component ─────────────────────────────────────────────────────────────

export default function ThemeSwitcher({ compact = false }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {THEMES.map((t) => {
          const Icon = t.icon;
          const isActive = theme === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTheme(t.key)}
              className={`clay-btn p-1.5 transition-all ${
                isActive
                  ? "ring-2 ring-soft-purple scale-105"
                  : "opacity-50 hover:opacity-80"
              }`}
              aria-label={`${t.label} theme`}
              aria-pressed={isActive}
              title={t.label}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
    );
  }

  // Full version with labels
  return (
    <div className="space-y-1">
      {THEMES.map((t) => {
        const Icon = t.icon;
        const isActive = theme === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setTheme(t.key)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-outfit font-bold text-sm ${
              isActive
                ? "bg-soft-purple-light text-soft-purple ring-2 ring-soft-purple/30"
                : "text-plum hover:bg-cream"
            }`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${t.className}`}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="flex-1 text-left">{t.label}</span>
            {isActive && (
              <span className="w-2 h-2 rounded-full bg-soft-purple flex-shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
