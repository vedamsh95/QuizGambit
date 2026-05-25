export { default as ClayButton } from "./ClayButton";
export { default as ClayCard } from "./ClayCard";
export { default as ClayInput } from "./ClayInput";
export { default as ClayBadge } from "./ClayBadge";
export { default as ClayAvatar } from "./ClayAvatar";
export { default as ClayBuzzer } from "./ClayBuzzer";
export { default as ClayTile } from "./ClayTile";
export { default as ClayToggle } from "./ClayToggle";
export { ToastProvider, useToast } from "./ClayToast";

// ── Mobile Components ──────────────────────────────────────────────────────
export { default as BottomSheet } from "./BottomSheet";
export { default as SwipeableCard } from "./SwipeableCard";

// ── i18n ────────────────────────────────────────────────────────────────────
export { default as LanguageSwitcher } from "./LanguageSwitcher";

// ── Theme ───────────────────────────────────────────────────────────────────
export { ThemeProvider, useTheme, type Theme } from "./ThemeProvider";
export { default as ThemeSwitcher } from "./ThemeSwitcher";

// ── V2 Components ───────────────────────────────────────────────────────────
export { default as AvatarPicker } from "./AvatarPicker";
export { default as CodeInput } from "./CodeInput";

// ── Re-export types for consumers ───────────────────────────────────────────
export type { ClayButtonProps } from "./ClayButton";
export type { ClayCardProps } from "./ClayCard";
export type { ClayInputProps } from "./ClayInput";
export type { ClayBadgeProps } from "./ClayBadge";
export type { ClayAvatarProps } from "./ClayAvatar";
export type { ClayBuzzerProps } from "./ClayBuzzer";
export type { ClayTileProps } from "./ClayTile";
export type { ClayToggleProps } from "./ClayToggle";
export type { LanguageSwitcherProps } from "./LanguageSwitcher";
export type { ThemeSwitcherProps } from "./ThemeSwitcher";
export type { AvatarPickerProps } from "./AvatarPicker";
export type { CodeInputProps } from "./CodeInput";
