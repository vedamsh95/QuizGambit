import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// ── Import locale files ──────────────────────────────────────────────────────
import en from "./locales/en/common.json";
import de from "./locales/de/common.json";
import es from "./locales/es/common.json";
import fr from "./locales/fr/common.json";
import ru from "./locales/ru/common.json";

// ── Resources ────────────────────────────────────────────────────────────────
const resources = {
  en: { common: en },
  de: { common: de },
  es: { common: es },
  fr: { common: fr },
  ru: { common: ru },
};

// ── Supported languages ──────────────────────────────────────────────────────
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

// ── Initialize ───────────────────────────────────────────────────────────────
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "qb_language",
      caches: ["localStorage"],
    },
  });

export default i18n;
