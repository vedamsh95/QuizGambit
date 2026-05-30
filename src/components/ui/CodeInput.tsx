import { useState, useRef, type KeyboardEvent, type ClipboardEvent } from "react";
import clsx from "clsx";

export interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  disabled?: boolean;
  className?: string;
}

/** Valid characters for room codes (no O/I/0/1 for readability) */
const VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export default function CodeInput({
  value,
  onChange,
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

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    const current = chars[idx];

    if (e.key === "Backspace") {
      e.preventDefault();
      if (current) {
        // Clear this cell
        const newChars = chars.split("");
        newChars[idx] = "";
        onChange(newChars.join("").replace(/\s/g, ""));
      } else if (idx > 0) {
        // Move to previous cell and clear it
        const newChars = chars.split("");
        newChars[idx - 1] = "";
        onChange(newChars.join("").replace(/\s/g, ""));
        inputRefs.current[idx - 1]?.focus();
      }
      // If idx === 0 and cell is already empty, do nothing
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

    const key = e.key.toUpperCase();
    if (key.length === 1 && VALID_CHARS.includes(key)) {
      e.preventDefault();
      const newChars = chars.split("");
      newChars[idx] = key;
      onChange(newChars.join("").replace(/\s/g, ""));

      // Auto-advance
      if (idx < length - 1) {
        inputRefs.current[idx + 1]?.focus();
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text/plain")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/[O0]/g, "Q")
      .replace(/[I1]/g, "L")
      .slice(0, length);

    // Filter to valid chars
    const filtered = pasted
      .split("")
      .filter((c) => VALID_CHARS.includes(c))
      .join("");

    // If pasted code is exactly 6 chars, fill all cells starting from 0
    if (filtered.length === length) {
      onChange(filtered);
      // Focus the last cell
      inputRefs.current[length - 1]?.focus();
    } else {
      onChange(filtered);
      // Focus the next empty cell or the last cell
      const nextIdx = Math.min(filtered.length, length - 1);
      inputRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <div className={clsx("flex flex-col items-center gap-4", className)}>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-plum/40">
        Enter room code
      </p>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* First chunk: ABC */}
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              maxLength={1}
              value={chars[i] || ""}
              readOnly
              disabled={disabled}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className={clsx(
                "clay-input w-8 h-10 sm:w-10 sm:h-12 text-center text-lg sm:text-xl font-black p-0",
                "uppercase tracking-widest font-outfit",
                "select-none caret-transparent",
                focused && "ring-2 ring-soft-purple/20",
              )}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
            />
          ))}
        </div>

        {/* Separator */}
        <span className="text-2xl font-black text-plum/20 select-none">-</span>

        {/* Second chunk: DEF */}
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <input
              key={i + 3}
              ref={(el) => {
                inputRefs.current[i + 3] = el;
              }}
              type="text"
              maxLength={1}
              value={chars[i + 3] || ""}
              readOnly
              disabled={disabled}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => handleKeyDown(i + 3, e)}
              onPaste={handlePaste}
              className={clsx(
                "clay-input w-8 h-10 sm:w-10 sm:h-12 text-center text-lg sm:text-xl font-black p-0",
                "uppercase tracking-widest font-outfit",
                "select-none caret-transparent",
                focused && "ring-2 ring-soft-purple/20",
              )}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
