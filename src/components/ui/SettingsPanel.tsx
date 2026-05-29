import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { useTheme, type Theme } from "./ThemeProvider";
import { SUPPORTED_LANGUAGES } from "../../i18n/i18n";
import { Sun, Moon, Palette } from "lucide-react";

export interface SettingsPanelProps {
  variant?: "clay" | "dark";
}

const THEMES: { key: Theme; icon: typeof Sun; className: string }[] = [
  { key: "light", icon: Sun, className: "text-amber-500" },
  { key: "dark", icon: Moon, className: "text-indigo-300" },
  { key: "multi", icon: Palette, className: "text-pink-400" },
];

export default function SettingsPanel({ variant = "clay" }: SettingsPanelProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isDark = variant === "dark";
  const currentLang = i18n.language?.split("-")[0] || "en";

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const toggle = useCallback(() => setOpen((p) => !p), []);

  return (
    <div className="relative">
      {/* ── Trigger ────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-label={t("common.settings")}
        aria-expanded={open}
        className={`
          p-2 rounded-xl transition-all duration-200
          ${
            isDark
              ? `text-white/60 hover:text-white hover:bg-white/10 ${
                  open ? "bg-white/15 text-white ring-1 ring-white/20" : ""
                }`
              : `text-plum/60 hover:text-plum hover:bg-cream ${
                  open
                    ? "bg-soft-purple-light text-soft-purple ring-2 ring-soft-purple/20"
                    : ""
                }`
          }
        `}
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* ── Dropdown ───────────────────────────────────────────────── */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />

          <div
            ref={panelRef}
            className={`
              absolute top-full right-0 mt-2 z-50
              rounded-2xl p-3 space-y-3
              shadow-2xl
              animate-in fade-in slide-in-from-top-2 duration-200
              ${
                isDark
                  ? "bg-deep-void/95 backdrop-blur-xl border border-white/10"
                  : "clay-elevated"
              }
            `}
          >
            {/* ── Theme row ─────────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-1">
              {THEMES.map((t) => {
                const Icon = t.icon;
                const isActive = theme === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTheme(t.key)}
                    className={`
                      p-1.5 rounded-lg transition-all
                      ${isActive ? "scale-105" : "opacity-50 hover:opacity-80"}
                      ${
                        isDark
                          ? isActive
                            ? "bg-white/15 ring-1 ring-white/20"
                            : "hover:bg-white/10"
                          : isActive
                            ? "bg-soft-purple-light ring-2 ring-soft-purple/20"
                            : "hover:bg-cream"
                      }
                    `}
                    aria-label={t.key}
                    title={t.key.charAt(0).toUpperCase() + t.key.slice(1)}
                  >
                    <Icon className={`w-4 h-4 ${t.className}`} />
                  </button>
                );
              })}
            </div>

            {/* ── Divider ───────────────────────────────────────────── */}
            <div
              className={`h-px ${
                isDark ? "bg-white/10" : "bg-clay-border"
              }`}
            />

            {/* ── Language row ──────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-1">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => i18n.changeLanguage(lang.code)}
                  className={`
                    px-2 py-1 rounded-lg text-sm leading-none transition-all
                    ${
                      currentLang === lang.code
                        ? isDark
                          ? "bg-white/15 ring-1 ring-white/20"
                          : "bg-soft-purple-light scale-105"
                        : isDark
                          ? "hover:bg-white/10"
                          : "hover:bg-cream opacity-70 hover:opacity-100"
                    }
                  `}
                  aria-label={lang.label}
                  title={lang.label}
                >
                  {lang.flag}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
