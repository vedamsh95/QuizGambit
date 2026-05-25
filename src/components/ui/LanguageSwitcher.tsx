import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../../i18n/i18n";
import { Check } from "lucide-react";

export interface LanguageSwitcherProps {
  compact?: boolean;
  onClose?: () => void;
}

export default function LanguageSwitcher({ compact = false, onClose }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language?.split("-")[0] || "en";

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    onClose?.();
  };

  if (compact) {
    // Compact version: just the current flag + dropdown trigger
    const current = SUPPORTED_LANGUAGES.find((l) => l.code === currentLang);
    return (
      <div className="flex items-center gap-1">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`clay-btn px-2.5 py-1.5 font-outfit font-bold text-xs transition-all ${
              currentLang === lang.code
                ? "bg-soft-purple-light text-soft-purple"
                : "text-warm-gray hover:bg-cream"
            }`}
            aria-label={lang.label}
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
              ? "bg-soft-purple-light text-soft-purple"
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
