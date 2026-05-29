import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../../i18n/i18n";
import { Check } from "lucide-react";

export interface LanguageSwitcherProps {
  compact?: boolean;
  variant?: "clay" | "dark";
  onClose?: () => void;
}

export default function LanguageSwitcher({ compact = false, variant = "clay", onClose }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language?.split("-")[0] || "en";

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    onClose?.();
  };

  const isDark = variant === "dark";

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`px-2.5 py-1.5 font-outfit font-bold text-xs rounded-lg transition-all ${
              currentLang === lang.code
                ? isDark
                  ? "bg-white/15 text-white ring-1 ring-white/20"
                  : "bg-soft-purple-light text-soft-purple"
                : isDark
                  ? "text-white/60 hover:text-white hover:bg-white/10"
                  : "text-warm-gray/60 hover:text-plum hover:bg-cream"
            }`}
            aria-label={lang.label}
            title={lang.label}
          >
            <span className="text-sm leading-none">{lang.flag}</span>
          </button>
        ))}
      </div>
    );
  }

  // Full version: list with labels and checkmark
  return (
    <div className="space-y-1">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => changeLanguage(lang.code)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-outfit font-bold text-sm ${
            currentLang === lang.code
              ? isDark
                ? "bg-white/10 text-white ring-1 ring-white/20"
                : "bg-soft-purple-light text-soft-purple"
              : isDark
                ? "text-white/60 hover:text-white hover:bg-white/10"
                : "text-plum hover:bg-cream"
          }`}
        >
          <span className="text-lg">{lang.flag}</span>
          <span className="flex-1 text-left">{lang.label}</span>
          {currentLang === lang.code && <Check className="w-4 h-4 flex-shrink-0" />}
        </button>
      ))}
    </div>
  );
}
