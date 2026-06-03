import { useState, useRef, type KeyboardEvent, type ClipboardEvent, type ChangeEvent } from "react";
import clsx from "clsx";

export interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  onSubmit?: () => void;
  length?: number;
  disabled?: boolean;
  className?: string;
}

/** Valid characters for room codes (A-Z, 2-9; no 0/1 for readability) */
const VALID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";

export default function CodeInput({
  value,
  onChange,
  onSubmit,
  length = 6,
  disabled = false,
  className,
}: CodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState(false);

  const chars = value
    .toUpperCase()
    .split("")
    .filter((c) => VALID_CHARS.includes(c))
    .slice(0, length)
    .join("")
    .padEnd(length, "");

  const insertChar = (idx: number, char: string) => {
    const newChars = chars.split("");
    newChars[idx] = char;
    onChange(newChars.join("").replace(/\s/g, ""));
    if (idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  // Handle onChange — needed for mobile virtual keyboards that don't fire keydown
  const handleChange = (idx: number, e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase();
    if (!raw) return;
    // maxLength={1} so the value is a single character
    const char = raw[raw.length - 1]; // take the last char in case of any edge case
    if (char && VALID_CHARS.includes(char)) {
      insertChar(idx, char);
    }
  };

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    const current = chars[idx];

    // Allow Cmd/Ctrl shortcuts (paste, copy, select-all, etc.) to pass through
    if (e.metaKey || e.ctrlKey) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      if (current) {
        const newChars = chars.split("");
        newChars[idx] = "";
        onChange(newChars.join("").replace(/\s/g, ""));
      } else if (idx > 0) {
        const newChars = chars.split("");
        newChars[idx - 1] = "";
        onChange(newChars.join("").replace(/\s/g, ""));
        inputRefs.current[idx - 1]?.focus();
      }
      return;
    }

    if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
      return;
    }

    if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
      return;
    }

    const key = e.key.toUpperCase();
    if (key.length === 1 && VALID_CHARS.includes(key)) {
      e.preventDefault();
      insertChar(idx, key);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text/plain")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, length);

    const filtered = pasted
      .split("")
      .filter((c) => VALID_CHARS.includes(c))
      .join("");

    if (filtered.length === length) {
      onChange(filtered);
      inputRefs.current[length - 1]?.focus();
    } else {
      onChange(filtered);
      const nextIdx = Math.min(filtered.length, length - 1);
      inputRefs.current[nextIdx]?.focus();
    }
  };

  const inputProps = (i: number) => ({
    ref: (el: HTMLInputElement | null) => { inputRefs.current[i] = el; },
    type: "text" as const,
    maxLength: 1,
    value: chars[i] || "",
    disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onChange: (e: ChangeEvent<HTMLInputElement>) => handleChange(i, e),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => handleKeyDown(i, e),
    onPaste: handlePaste,
    className: clsx(
      "clay-input w-8 h-10 sm:w-10 sm:h-12 text-center text-lg sm:text-xl font-black p-0",
      "uppercase tracking-widest font-outfit",
      "select-none caret-transparent",
      focused && "ring-2 ring-soft-purple/20",
    ),
    inputMode: "text" as const,
    autoCapitalize: "characters" as const,
    autoComplete: "off" as const,
    spellCheck: false,
  });

  return (
    <div className={clsx("flex flex-col items-center gap-4", className)}>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-plum/40">
        Enter room code
      </p>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* First chunk: ABC */}
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <input key={i} {...inputProps(i)} />
          ))}
        </div>

        {/* Second chunk: DEF */}
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <input key={i + 3} {...inputProps(i + 3)} />
          ))}
        </div>
      </div>
    </div>
  );
}
