import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────

export type Theme = "light" | "dark" | "multi";

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "qb_theme";
const THEME_CLASSES: Record<Theme, string | null> = {
  light: null,          // no class = default :root
  dark: "theme-dark",
  multi: "theme-multi",
};

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "multi" || stored === "light") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "light";
}

function writeStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable
  }
}

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  // Remove all theme classes
  root.classList.remove("theme-dark", "theme-multi");
  // Add the new one (if not light)
  const cls = THEME_CLASSES[theme];
  if (cls) {
    root.classList.add(cls);
  }
}

// ── Context ───────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Apply theme class to <html> on mount + every change
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeStoredTheme(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}
