import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { Heart, Zap, Sparkles, ArrowLeftRight, Palette, Users, List, LayoutGrid, Trophy, Wifi, WifiOff, ArrowLeft, Clock, Shield, Skull } from "lucide-react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { AVATARS } from "../assets/avatars";

// ── Avatar SVG component (black icon, works on any background) ─────────────
const AvatarIcon = memo(function AvatarIcon({ src, size }: { src: string; size: string }) {
  return (
    <img
      src={src}
      alt=""
      className="block"
      style={{ width: size, height: size }}
    />
  );
});

// ── Types ───────────────────────────────────────────────────────────────────

interface WordEntry {
  id: string;
  word: string;
  points: number;
  isPoisoned: boolean;
  claimedAt: Date;
}

interface PlayerColor {
  name: string;
  label: string;
  fill: string;
  fillLight: string;
  pillBg: string;
  pillBorder: string;
  mutedText: string;
}

interface LinksBoardPrototypeProps {
  code?: string;
  playerId?: string;
  playerName?: string;
}

interface ClaimedWord {
  id: string;
  player_id: string;
  player_name: string;
  word: string;
  word_length: number;
  points: number;
  is_poisoned: boolean;
  poison_letter: string | null;
  hearts_remaining: number;
  created_at: string;
}

// ── Color palette ───────────────────────────────────────────────────────────

const PLAYER_COLORS: PlayerColor[] = [
  { name: "purple", label: "Purple", fill: "#7C5CFC", fillLight: "#EDE9FE", pillBg: "#F3EFFF", pillBorder: "#C4B5FD", mutedText: "#8B7EC8" },
  { name: "peach", label: "Peach", fill: "#FF6B8A", fillLight: "#FFE5EB", pillBg: "#FFF0F3", pillBorder: "#FFB8C8", mutedText: "#D48A9A" },
  { name: "sky", label: "Sky", fill: "#60A5FA", fillLight: "#DBEAFE", pillBg: "#EFF6FF", pillBorder: "#93C5FD", mutedText: "#7B9EC8" },
  { name: "mint", label: "Mint", fill: "#34D399", fillLight: "#D1FAE5", pillBg: "#ECFDF5", pillBorder: "#6EE7B7", mutedText: "#5EA884" },
  { name: "butter", label: "Butter", fill: "#FBBF24", fillLight: "#FEF3C7", pillBg: "#FFFBEB", pillBorder: "#FCD34D", mutedText: "#B8952E" },
  { name: "lavender", label: "Lavender", fill: "#A78BFA", fillLight: "#EDE9FE", pillBg: "#F5F3FF", pillBorder: "#C4B5FD", mutedText: "#8B7EC8" },
  { name: "coral", label: "Coral", fill: "#F87171", fillLight: "#FEE2E2", pillBg: "#FEF2F2", pillBorder: "#FCA5A5", mutedText: "#C46A6A" },
  { name: "teal", label: "Teal", fill: "#2DD4BF", fillLight: "#CCFBF1", pillBg: "#F0FDFA", pillBorder: "#5EEAD4", mutedText: "#4DA89A" },
];

// ── Demo data ───────────────────────────────────────────────────────────────

const DEMO_LETTERS = ["A", "K", "R"];

const DEMO_WORDS: WordEntry[][] = [
  [{ id: "w1", word: "SPARK", points: 75, isPoisoned: false, claimedAt: new Date() },
   { id: "w2", word: "REACT", points: 60, isPoisoned: false, claimedAt: new Date() },
   { id: "w3", word: "TRICK", points: 75, isPoisoned: false, claimedAt: new Date() }],
  [{ id: "w4", word: "BLAST", points: 75, isPoisoned: false, claimedAt: new Date() },
   { id: "w5", word: "CRISP", points: 75, isPoisoned: false, claimedAt: new Date() }],
  [{ id: "w6", word: "FLAME", points: 0, isPoisoned: true, claimedAt: new Date() },
   { id: "w7", word: "SHOCK", points: 75, isPoisoned: false, claimedAt: new Date() }],
  [{ id: "w8", word: "BRAKE", points: 75, isPoisoned: false, claimedAt: new Date() }],
  [{ id: "w9", word: "STARK", points: 75, isPoisoned: false, claimedAt: new Date() },
   { id: "w10", word: "TRACK", points: 75, isPoisoned: false, claimedAt: new Date() },
   { id: "w11", word: "CRACK", points: 60, isPoisoned: false, claimedAt: new Date() }],
  [{ id: "w12", word: "PARKA", points: 60, isPoisoned: false, claimedAt: new Date() }],
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const calcPoints = (length: number) =>
  length <= 4 ? 10 * length : length <= 6 ? 15 * length : 20 * length;

const needsDarkText = (fill: string) => fill === "#FBBF24" || fill === "#2DD4BF";

const clayShadow = (fill: string) =>
  `6px 6px 20px ${fill}38, inset 1px 1px 0px rgba(255,255,255,0.30), inset -1px -1px 0px rgba(0,0,0,0.10)`;

const clayShadowElevated = (fill: string) =>
  `4px 4px 14px ${fill}4D, inset 1px 1px 0px rgba(255,255,255,0.35), inset -1px -1px 0px rgba(0,0,0,0.08)`;

const clayShadowPressed = (fill: string) =>
  `inset 2px 2px 6px ${fill}33, inset -1px -1px 0px rgba(255,255,255,0.20)`;

/** Parse arena_state — Supabase may return JSONB as string from realtime */
function parseArenaState(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "string") {
    if (import.meta.env.DEV) console.warn("[LINKS] arena_state is a raw string — parsing", raw.slice(0, 100));
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

function getPlayerColorByIndex(index: number): PlayerColor {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function getPlayerColorByName(playerId: string, players: any[]): PlayerColor {
  const idx = players.findIndex((p: any) => p.id === playerId);
  return getPlayerColorByIndex(idx >= 0 ? idx : 0);
}

// ── Constants ────────────────────────────────────────────────────────────────

const LETTER_SELECT_TIMEOUT = 30;
const SVG_CIRCUMFERENCE = 2 * Math.PI * 34;

// ── ActivePlayerPanel (module-level — fixes input focus bug) ────────────────

const ActivePlayerPanel = memo(function ActivePlayerPanel({
  color,
  input,
  setInput,
  onClaim,
  words,
  score,
  hearts,
  playerLabel,
  avatarSrc,
  clayMode: isClay,
  letters,
  submitting,
  submitStatus,
  timerSeconds = 0,
  timerTotal = 30,
  poisonWarning = null,
  wordFeedback = null,
  shakeKey = 0,
  eliminated = false,
}: {
  color: PlayerColor;
  input: string;
  setInput: (v: string) => void;
  onClaim: (word: string) => void;
  words: WordEntry[];
  score: number;
  hearts: number;
  playerLabel: string;
  avatarSrc: string;
  clayMode: boolean;
  letters: string[];
  submitting?: boolean;
  submitStatus?: string | null;
  timerSeconds?: number;
  timerTotal?: number;
  poisonWarning?: string | null;
  wordFeedback?: { type: string; message?: string } | null;
  shakeKey?: number;
  eliminated?: boolean;
}) {
  const clayText = "#1A1530";
  const clayOverlay = "rgba(255,255,255,0.18)";
  const clayOverlayStrong = "rgba(255,255,255,0.28)";
  const clayOverlayBorder = "rgba(255,255,255,0.30)";
  const clayMuted = "rgba(26,21,48,0.45)";
  const clayDim = "rgba(26,21,48,0.25)";
  const clayInset = "rgba(0,0,0,0.10)";

  const needsDark = needsDarkText(color.fill);
  const clayTextBright = needsDark ? clayText : "#FFFFFF";
  const clayMutedBright = needsDark ? clayMuted : "rgba(255,255,255,0.70)";
  const clayDimBright = needsDark ? clayDim : "rgba(255,255,255,0.45)";
  const clayFaintBright = needsDark ? clayDim : "rgba(255,255,255,0.20)";
  const clayHeartEmptyBright = needsDark ? clayDim : "rgba(255,255,255,0.25)";

  const bgStyle = isClay
    ? { background: color.fill, boxShadow: clayShadow(color.fill), border: "1.5px solid rgba(255,255,255,0.20)" }
    : { background: color.fillLight };

  const textColor = isClay ? clayTextBright : color.fill;
  const textMuted = isClay ? clayMutedBright : color.mutedText;
  const textDim = isClay ? clayDimBright : "#b0a8b8";

  const pillBg = isClay ? clayOverlay : color.pillBg;
  const pillBorder = isClay ? clayOverlayBorder : color.pillBorder;
  const pillText = isClay ? (needsDark ? clayText : "#FFFFFF") : color.fill;

  const letterInactiveBg = isClay ? clayInset : "#e8e4df";
  const letterInactiveText = isClay ? clayFaintBright : "#b0a8b8";
  const letterActiveBg = isClay ? clayOverlayStrong : color.fill;
  const letterActiveText = isClay ? (needsDark ? clayText : "#FFFFFF") : "#fff";

  const claimBg = isClay ? "rgba(255,255,255,0.95)" : color.fill;
  const claimText = isClay ? clayText : (needsDark ? clayText : "#FFFFFF");
  const claimShadow = isClay ? `0 6px 24px rgba(0,0,0,0.20)` : `0 6px 24px color-mix(in srgb, ${color.fill} 35%, transparent)`;

  const wordPillBg = isClay ? clayOverlay : color.pillBg;
  const wordPillBorder = isClay ? clayOverlayBorder : color.pillBorder;
  const wordPillText = isClay ? (needsDark ? clayText : "#FFFFFF") : color.fill;
  const wordPillMuted = isClay ? (needsDark ? clayDim : "rgba(255,255,255,0.65)") : color.mutedText;

  const underlineColor = isClay ? clayOverlayBorder : color.fill;
  const underlineDim = isClay ? clayFaintBright : color.fill;

  const heartGlow = isClay ? `drop-shadow(0 0 4px rgba(255,255,255,0.30))` : `drop-shadow(0 0 4px color-mix(in srgb, ${color.fill} 40%, transparent))`;
  const heartEmpty = isClay ? clayHeartEmptyBright : "#d4d0db";

  const canClaim = input.trim().length >= 3 && !submitting && !eliminated;

  // ── Timer ring ──────────────────────────────────────────────────
  const timerPercent = timerTotal > 0 ? (timerSeconds / timerTotal) * 100 : 100;
  const timerUrgent = timerSeconds <= 10;
  const timerCritical = timerSeconds <= 5;
  const timerStrokeColor = eliminated ? "#9CA3AF" : timerCritical ? "#FF6B8A" : timerUrgent ? "#FBBF24" : color.fill;
  const TIMER_CIRCUMFERENCE = 2 * Math.PI * 20;
  const isUsed = wordFeedback?.type === "used";

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden min-h-0" style={bgStyle}>
      {isClay && (
        <div className="absolute top-0 left-4 right-4 h-[1px] pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
      )}

      {/* Header */}
      <div className="relative shrink-0 z-10 px-4 sm:px-6 pt-4 pb-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-center rounded-full flex-shrink-0 shadow-lg overflow-hidden"
              style={{ background: isClay ? color.fill : color.fillLight, width: "2.25rem", height: "2.25rem", boxShadow: isClay ? `0 4px 14px ${color.fill}80` : `0 4px 14px color-mix(in srgb, ${color.fill} 30%, transparent)` }}>
              <AvatarIcon src={avatarSrc} size="1.35rem" />
            </div>
            <div className="min-w-0">
              <p className="font-outfit font-black text-sm sm:text-base leading-none truncate" style={{ color: isClay ? clayTextBright : color.fill, opacity: isClay ? undefined : 0.8 }}>{playerLabel}</p>
              <p className="text-[9px] font-bold" style={{ color: textMuted }}>{eliminated ? "💀 ELIMINATED" : "⚡ TYPING"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Per-player timer ring */}
            {!eliminated && timerTotal > 0 && timerSeconds !== undefined && timerSeconds > 0 && (
              <div className="relative w-10 h-10 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke={isClay ? "rgba(255,255,255,0.12)" : "#e8e4df"} strokeWidth="4" />
                  <circle cx="24" cy="24" r="20" fill="none" stroke={timerStrokeColor} strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={TIMER_CIRCUMFERENCE}
                    strokeDashoffset={TIMER_CIRCUMFERENCE * (1 - timerPercent / 100)}
                    className={`transition-all duration-300 ${timerCritical ? "animate-pulse" : ""}`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`font-mono font-black text-[10px] tabular-nums leading-none ${timerCritical ? "animate-pulse text-peach" : timerUrgent ? "text-butter" : ""}`}
                    style={{ color: timerCritical ? undefined : timerUrgent ? undefined : textColor }}>
                    {timerSeconds}
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
              style={{ backgroundColor: pillBg, borderColor: pillBorder, boxShadow: isClay ? clayShadowElevated(color.fill) : undefined }}>
              <Zap className="w-3.5 h-3.5" style={{ color: pillText }} />
              <span className="font-mono font-black text-sm sm:text-base tabular-nums" style={{ color: pillText }}>{score}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart key={i} className={`w-4 h-4 sm:w-5 sm:h-5 transition-all duration-300 ${i >= hearts && eliminated ? "animate-life-lost" : ""}`}
              style={{ fill: i < hearts ? textColor : "none", color: i < hearts ? textColor : heartEmpty, filter: i < hearts ? heartGlow : "none" }} />
          ))}
          <span className="text-[10px] font-bold ml-1" style={{ color: textDim }}>· {words.length} word{words.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Poison warning badge */}
      {poisonWarning && (
        <div className="relative z-10 px-4 sm:px-6 mb-1">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-peach-light/80 border border-peach/20 animate-slide-up-fade"
            style={{ maxWidth: "fit-content", margin: "0 auto" }}>
            <Skull className="w-3 h-3 text-peach" />
            <span className="text-[10px] font-black text-peach uppercase tracking-wider">{poisonWarning}</span>
          </div>
        </div>
      )}

      {/* Submit status flash */}
      {submitStatus && (
        <div className="relative z-10 px-4 sm:px-6">
          <div className={`text-center text-xs font-bold animate-clay-pop ${
            submitStatus.includes("+") ? "text-mint" : submitStatus.includes("💀") ? "text-peach" : "text-warm-gray/60"
          }`}>
            {submitStatus}
          </div>
        </div>
      )}

      {/* Input area */}
      <div key={shakeKey} className={`relative flex-1 flex flex-col items-center justify-center z-10 px-4 sm:px-8 gap-3 min-h-0 ${isUsed ? "animate-shake" : ""}`}>
        {/* "Claimed by X" overlay */}
        {isUsed && wordFeedback?.message && (
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-center">
            <div className="px-5 py-2.5 rounded-2xl bg-peach-light border-2 border-peach/40 shadow-lg animate-slide-up-fade flex items-center gap-2">
              <span className="text-lg">😤</span>
              <span className="text-xs font-black text-peach">{wordFeedback.message}</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          {letters.map((l) => (
            <span key={l} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-200"
              style={{
                backgroundColor: input.toLowerCase().includes(l.toLowerCase()) ? letterActiveBg : letterInactiveBg,
                color: input.toLowerCase().includes(l.toLowerCase()) ? letterActiveText : letterInactiveText,
                boxShadow: input.toLowerCase().includes(l.toLowerCase())
                  ? isClay ? clayShadowElevated(color.fill) : `0 2px 10px color-mix(in srgb, ${color.fill} 40%, transparent)`
                  : isClay ? clayShadowPressed(color.fill) : "none",
                transform: input.toLowerCase().includes(l.toLowerCase()) ? "scale(1.08)" : "scale(1)",
              }}>{l}</span>
          ))}
        </div>
        <div className="w-full max-w-lg">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 15).toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && canClaim) onClaim(input.toUpperCase().trim()); }}
            placeholder={eliminated ? "ELIMINATED" : isUsed ? "ALREADY TAKEN!" : "TYPE WORD..."}
            className={`w-full bg-transparent text-center font-outfit font-black outline-none transition-all ${isClay ? "placeholder:text-plum/15" : "placeholder:text-plum/10"}`}
            style={{ fontSize: "clamp(2rem, 6vw, 4rem)", color: eliminated ? textDim : textColor, letterSpacing: "0.04em", lineHeight: 1.1, padding: "0.25rem 0", caretColor: textColor, opacity: eliminated ? 0.5 : 1 }}
            autoComplete="off" autoCapitalize="characters" spellCheck={false}
            disabled={hearts <= 0 || eliminated}
          />
          <div className="mx-auto rounded-full transition-all duration-300 mt-1" style={{
            height: "3px", width: input.length > 0 ? "60%" : "25%", maxWidth: "280px",
            backgroundColor: input.length > 0 ? underlineColor : underlineDim,
          }} />
        </div>
        {canClaim && (
          <button onClick={() => onClaim(input.toUpperCase().trim())}
            className="px-8 py-3 rounded-2xl font-outfit font-black text-sm sm:text-base tracking-widest uppercase transition-all hover:scale-105 active:scale-95 animate-clay-pop"
            style={{ background: claimBg, color: claimText, boxShadow: claimShadow }}>
            ⚡ Claim +{calcPoints(input.length)}
          </button>
        )}
      </div>

      {/* Word history */}
      <div className="relative shrink-0 z-10 px-3 sm:px-6 pb-4 overflow-hidden" style={{ maxHeight: "6rem" }}>
        {words.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 gap-1" style={{ opacity: isClay ? 0.25 : 0.20 }}>
            <Sparkles style={{ color: textColor, width: "1.25rem", height: "1.25rem" }} />
            <p className="text-[10px] font-bold" style={{ color: textMuted }}>No words yet</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-full hide-scrollbar">
            <div className="flex flex-wrap gap-1.5 content-start">
              {words.map((w, i) => (
                <span key={w.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold border animate-clay-pop"
                  style={{
                    animationDelay: `${words.length - 1 - i}ms`,
                    backgroundColor: w.isPoisoned ? (isClay ? "rgba(255,107,138,0.25)" : "#FFE5EB") : wordPillBg,
                    borderColor: w.isPoisoned ? (isClay ? "rgba(255,107,138,0.40)" : "#FFB8C8") : wordPillBorder,
                    color: w.isPoisoned ? "#FF6B8A" : wordPillText,
                    textDecoration: w.isPoisoned ? "line-through" : "none",
                    boxShadow: isClay ? clayShadowElevated(color.fill) : "0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}>
                  {w.word}
                  <span className="text-[8px] sm:text-[9px] font-mono opacity-50" style={{ color: w.isPoisoned ? "#FF6B8A" : wordPillMuted }}>+{w.points}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ── OpponentPanel (module-level — stable identity) ──────────────────────────

const OpponentPanel = memo(function OpponentPanel({
  color,
  playerLabel,
  score,
  hearts,
  words,
  liveInput,
  playerLetter,
  avatarSrc,
  clayMode: isClay,
  timerSeconds,
  eliminated,
}: {
  color: PlayerColor;
  playerLabel: string;
  score: number;
  hearts: number;
  words: WordEntry[];
  liveInput: string;
  playerLetter: string;
  avatarSrc: string;
  clayMode: boolean;
  timerSeconds?: number;
  eliminated?: boolean;
}) {
  const clayText = "#1A1530";
  const clayOverlay = "rgba(255,255,255,0.18)";
  const clayOverlayStrong = "rgba(255,255,255,0.28)";
  const clayOverlayBorder = "rgba(255,255,255,0.30)";
  const clayMuted = "rgba(26,21,48,0.45)";

  const needsDark = needsDarkText(color.fill);
  const clayTextBright = needsDark ? clayText : "#FFFFFF";
  const clayMutedBright = needsDark ? clayMuted : "rgba(255,255,255,0.70)";

  const bgStyle = isClay
    ? { background: color.fill, boxShadow: clayShadow(color.fill), border: "1.5px solid rgba(255,255,255,0.20)" }
    : { background: color.fillLight };

  const textColor = isClay ? clayTextBright : color.fill;
  const textMuted = isClay ? clayMutedBright : color.mutedText;
  const wordPillBg = isClay ? clayOverlay : color.pillBg;
  const wordPillBorder = isClay ? clayOverlayBorder : color.pillBorder;
  const wordPillText = isClay ? (needsDark ? clayText : "#FFFFFF") : color.fill;
  const heartEmpty = isClay ? (needsDark ? "rgba(26,21,48,0.25)" : "rgba(255,255,255,0.25)") : "#d4d0db";

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden min-h-0" style={bgStyle}>
      {isClay && (
        <div className="absolute top-0 left-3 right-3 h-[1px] pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
      )}

      {/* Header */}
      <div className="relative shrink-0 z-10 px-3 sm:px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden"
            style={{ background: isClay ? color.fill : color.fillLight, width: "2rem", height: "2rem", boxShadow: isClay ? `0 3px 12px ${color.fill}80` : `0 3px 12px color-mix(in srgb, ${color.fill} 30%, transparent)` }}>
            <AvatarIcon src={avatarSrc} size="1.15rem" />
          </div>
          <span className="font-outfit font-black text-sm sm:text-base truncate" style={{ color: isClay ? clayTextBright : color.fill, opacity: isClay ? undefined : 0.85 }}>{playerLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Per-player mini timer */}
          {!eliminated && timerSeconds !== undefined && timerSeconds > 0 && (
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${timerSeconds <= 5 ? "animate-pulse text-peach border-peach/30 bg-peach-light/50" : timerSeconds <= 10 ? "text-butter border-butter/30 bg-butter-light/50" : "text-warm-gray/50 border-warm-gray/10 bg-warm-gray/5"}`}>
              ⏱{timerSeconds}
            </span>
          )}
          <div className="flex items-center gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart key={i} className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                style={{ fill: i < hearts ? textColor : "none", color: i < hearts ? textColor : heartEmpty }} />
            ))}
          </div>
        </div>
      </div>

      {/* Center: big score + typing preview */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 sm:px-4 gap-3 min-h-0">
        <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border shadow-lg"
          style={{
            backgroundColor: isClay ? clayOverlayStrong : "rgba(255,255,255,0.85)",
            borderColor: isClay ? clayOverlayBorder : color.pillBorder,
            boxShadow: isClay ? clayShadowElevated(color.fill) : `0 4px 16px color-mix(in srgb, ${color.fill} 18%, transparent)`,
          }}>
          <Zap className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: isClay ? (needsDarkText(color.fill) ? clayText : "#FFFFFF") : color.fill }} />
          <span className="font-mono font-black text-2xl sm:text-3xl tabular-nums leading-none" style={{ color: isClay ? (needsDarkText(color.fill) ? clayText : "#FFFFFF") : color.fill }}>{score}</span>
        </div>

        {/* Live typing preview */}
        <div className="w-full max-w-[240px]">
          {liveInput ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl animate-pulse shadow-sm"
              style={{ backgroundColor: isClay ? "rgba(255,255,255,0.10)" : color.fillLight + "A0", border: `1.5px solid ${isClay ? "rgba(255,255,255,0.15)" : color.pillBorder}` }}>
              <span className="text-xs flex-shrink-0" style={{ color: textMuted }}>✍️</span>
              <span className="font-outfit font-black text-base sm:text-lg tracking-wider truncate" style={{ color: textColor }}>
                {liveInput}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl" style={{ backgroundColor: isClay ? "rgba(0,0,0,0.04)" : color.fillLight + "60" }}>
              <span className="text-lg opacity-30">👀</span>
              <span className="text-[10px] font-bold" style={{ color: textMuted }}>Watching for words...</span>
            </div>
          )}
        </div>
      </div>

      {/* Word pills */}
      <div className="relative shrink-0 z-10 px-3 sm:px-4 overflow-hidden" style={{ maxHeight: "4.5rem" }}>
        <div className="overflow-y-auto max-h-full hide-scrollbar">
          {words.length === 0 ? (
            <p className="text-[10px] py-1.5 text-center" style={{ color: textMuted, opacity: 0.4 }}>No words yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 content-start">
              {words.map((w) => (
                <span key={w.id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold border"
                  style={{
                    backgroundColor: w.isPoisoned ? (isClay ? "rgba(255,107,138,0.25)" : "#FFE5EB") : wordPillBg,
                    borderColor: w.isPoisoned ? (isClay ? "rgba(255,107,138,0.40)" : "#FFB8C8") : wordPillBorder,
                    color: w.isPoisoned ? "#FF6B8A" : wordPillText,
                    textDecoration: w.isPoisoned ? "line-through" : "none",
                    boxShadow: isClay ? clayShadowElevated(color.fill) : "0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}>
                  {w.word}
                  <span className="text-[8px] sm:text-[9px] font-mono opacity-45">+{w.points}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Letter tag — always visible, pinned below pills */}
      {playerLetter && (
        <div className="relative shrink-0 z-10 px-3 sm:px-4 pb-3 pt-1.5 flex justify-center">
          <span className="px-2.5 py-1 rounded-xl text-[9px] font-black border" style={{ backgroundColor: isClay ? clayOverlay : color.pillBg, borderColor: isClay ? clayOverlayBorder : color.pillBorder, color: textMuted, boxShadow: isClay ? clayShadowElevated(color.fill) : "0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)" }}>
            Letter: {playerLetter}
          </span>
        </div>
      )}
      {!playerLetter && <div className="shrink-0 pb-3" />}
    </div>
  );
});

// ── OpponentLeaderboard (compact list view for small screens) ───────────────

const OpponentLeaderboard = memo(function OpponentLeaderboard({
  opponents,
  liveInput,
  clayMode: isClay,
}: {
  opponents: Array<{
    index: number;
    label: string;
    score: number;
    hearts: number;
    wordCount: number;
    words: WordEntry[];
    color: PlayerColor;
    avatarSrc: string;
  }>;
  liveInput: string;
  clayMode: boolean;
}) {
  const sorted = useMemo(() => [...opponents].sort((a, b) => b.score - a.score), [opponents]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-warm-white/40 backdrop-blur-sm">
      <div className="shrink-0 px-3 sm:px-4 py-2 flex items-center gap-2">
        <List className="w-3.5 h-3.5 text-plum/30" />
        <span className="text-[10px] font-black text-plum/30 uppercase tracking-wider">Leaderboard</span>
        {liveInput && (
          <span className="ml-auto text-[9px] font-bold text-plum/20 italic truncate max-w-[120px]">
            Typing: {liveInput}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 sm:px-3 pb-2">
        <div className="flex flex-col gap-1">
          {sorted.map((p, rank) => {
            const c = p.color;
            const isGold = rank === 0;
            const isSilver = rank === 1;
            const isBronze = rank === 2;
            const rankBg = isGold ? "#FBBF24" : isSilver ? "#A8B8C8" : isBronze ? "#D4956B" : "#E8E4DF";
            const rankText = isGold ? "#7C5F00" : isSilver ? "#4A5568" : isBronze ? "#6B3A20" : "#b0a8b8";
            const rankIcon = isGold ? "🥇" : isSilver ? "🥈" : isBronze ? "🥉" : `${rank + 1}`;

            return (
              <div key={p.index}
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl border border-warm-gray/10 bg-warm-white/70 shadow-sm transition-all">
                {/* Rank */}
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black flex-shrink-0"
                  style={{ backgroundColor: rankBg, color: rankText }}>
                  {rankIcon}
                </div>

                {/* Player avatar + label */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                    style={{
                      background: isClay ? "rgba(255,255,255,0.25)" : c.fillLight,
                      boxShadow: isClay ? "0 3px 10px rgba(0,0,0,0.15)" : `0 3px 10px color-mix(in srgb, ${c.fill} 30%, transparent)`,
                    }}>
                    <AvatarIcon src={p.avatarSrc} size="1.1rem" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-outfit font-black text-xs sm:text-sm truncate" style={{ color: isClay ? c.fill : c.fill }}>{p.label}</p>
                    <p className="text-[9px] font-bold" style={{ color: c.mutedText }}>{p.wordCount} word{p.wordCount !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                {/* Hearts */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Heart key={i} className="w-3 h-3 sm:w-3.5 sm:h-3.5"
                      style={{
                        fill: i < p.hearts ? c.fill : "none",
                        color: i < p.hearts ? c.fill : (isClay ? "#C4B8D8" : "#d4d0db"),
                        filter: i < p.hearts && isClay ? `drop-shadow(0 0 3px ${c.fill}60)` : "none",
                      }} />
                  ))}
                </div>

                {/* Score */}
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl border flex-shrink-0"
                  style={{
                    backgroundColor: isClay ? "rgba(255,255,255,0.14)" : c.pillBg,
                    borderColor: isClay ? "rgba(255,255,255,0.22)" : c.pillBorder,
                    boxShadow: isClay ? clayShadowElevated(c.fill) : "0 2px 6px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}>
                  <Zap className="w-3 h-3" style={{ color: c.fill }} />
                  <span className="font-mono font-black text-xs sm:text-sm tabular-nums" style={{ color: c.fill }}>{p.score}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ── Letter Select Phase ──────────────────────────────────────────────────────

const LetterSelectPhase = memo(function LetterSelectPhase({
  letters,
  lettersTimeLeft,
  players,
  playerLetters,
  playerColors,
  selectedLetter,
  error,
  isHost,
  onSelectLetter,
  onForceStart,
}: {
  letters: string[];
  lettersTimeLeft: number;
  players: any[];
  playerLetters: Record<string, string>;
  playerColors: Record<string, PlayerColor>;
  selectedLetter: string | null;
  error: string;
  isHost: boolean;
  onSelectLetter: (l: string) => void;
  onForceStart: () => void;
}) {
  const lsTimerPercent = (lettersTimeLeft / LETTER_SELECT_TIMEOUT) * 100;
  const lsTimerUrgent = lettersTimeLeft <= 10;
  const lsTimerCritical = lettersTimeLeft <= 5;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">
      {/* ⏱ Circular Countdown Timer */}
      <div className="relative w-20 h-20 mb-2">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5" className="text-warm-gray/10" />
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={SVG_CIRCUMFERENCE}
            strokeDashoffset={SVG_CIRCUMFERENCE * (1 - lsTimerPercent / 100)}
            className={`transition-all duration-500 ${lsTimerCritical ? "text-peach animate-pulse" : lsTimerUrgent ? "text-butter" : "text-soft-purple"}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono font-black text-xl tabular-nums leading-none ${lsTimerCritical ? "text-peach animate-pulse" : lsTimerUrgent ? "text-butter" : "text-plum"}`}>
            {lettersTimeLeft}
          </span>
          <span className="text-[9px] font-bold text-warm-gray/40 uppercase tracking-wider">sec</span>
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="font-outfit font-black text-3xl text-plum">Pick Your Letter</h1>
        <p className="text-sm text-warm-gray/60 max-w-sm">
          Choose one letter. Every word you type must contain ALL chosen letters.
          {players.length > 2 && ` ${players.length} players means ${players.length} letters required per word!`}
        </p>
        {lsTimerUrgent && !selectedLetter && (
          <p className={`text-xs font-black mt-1 animate-pulse ${lsTimerCritical ? "text-peach" : "text-butter"}`}>
            <Clock className="w-3 h-3 inline mr-1" />
            {lsTimerCritical ? "HURRY UP! Almost out of time!" : "Time is running out — pick quickly!"}
          </p>
        )}
      </div>

      {error && (
        <div className="text-peach text-xs font-bold bg-peach-light px-4 py-2 rounded-full animate-shake">
          {error}
        </div>
      )}

      {selectedLetter ? (
        <div className="text-center space-y-4">
          <p className="text-warm-gray/60 text-sm">You picked:</p>
          <div className="w-24 h-24 rounded-3xl bg-soft-purple flex items-center justify-center shadow-lg animate-clay-pop mx-auto">
            <span className="text-5xl font-outfit font-black text-white">{selectedLetter}</span>
          </div>
          <p className="text-xs text-warm-gray/50">Waiting for other players...</p>
        </div>
      ) : (
        <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 max-w-lg">
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => {
            const taken = Object.values(playerLetters).includes(l);
            return (
              <button key={l} onClick={() => !taken && onSelectLetter(l)} disabled={taken}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl font-outfit font-black text-lg transition-all duration-150 ${
                  taken
                    ? "bg-warm-gray/10 text-warm-gray/30 cursor-not-allowed"
                    : "bg-warm-white border-2 border-soft-purple/20 text-plum hover:bg-soft-purple-light hover:border-soft-purple hover:text-soft-purple hover:-translate-y-1 hover:shadow-lg active:scale-95"
                }`}>
                {l}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected letters so far */}
      {Object.keys(playerLetters).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 justify-center">
          <span className="text-xs font-bold text-warm-gray/50">Letters:</span>
          {Object.entries(playerLetters).map(([pid, letter], i) => {
            const p = players.find((pl: any) => pl.id === pid);
            const c = playerColors[pid] || PLAYER_COLORS[0];
            return (
              <span key={pid}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border animate-clay-pop`}
                style={{ animationDelay: `${i * 100}ms`, backgroundColor: c.fillLight, borderColor: c.pillBorder, color: c.fill }}>
                {letter}
                <span className="opacity-70">{p?.name || pid.slice(0, 6)}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Force start (host only) */}
      {isHost && (
        <button onClick={onForceStart}
          className="px-4 py-2 rounded-xl bg-soft-purple text-white text-xs font-black hover:opacity-90 transition-opacity">
          Force Start Game
        </button>
      )}
    </div>
  );
});

// ── Poison Setup Phase ──────────────────────────────────────────────────────

const PoisonSetupPhase = memo(function PoisonSetupPhase({
  players,
  effectivePlayerId,
  letters,
  poisonAssignments,
  error,
  otherPlayers,
  playerColors,
  onAssignPoison,
  onSetPoisonLetter,
}: {
  players: any[];
  effectivePlayerId: string;
  letters: string[];
  poisonAssignments: Record<string, string>;
  error: string;
  otherPlayers: any[];
  playerColors: Record<string, PlayerColor>;
  onAssignPoison: () => void;
  onSetPoisonLetter: (targetId: string, letter: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">
      <div className="text-center space-y-2">
        <div className="text-4xl mb-2">☣️</div>
        <h1 className="font-outfit font-black text-2xl text-plum">Poison Phase</h1>
        <p className="text-sm text-warm-gray/60 max-w-md">
          Secretly assign a poison letter to each opponent. If they type a word containing it, they lose a heart.
          <br />
          <span className="text-[10px] text-warm-gray/50">They won't know what you picked!</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-warm-gray/50">Required:</span>
        {letters.map((l) => (
          <span key={l} className="px-3 py-1 rounded-full bg-soft-purple-light text-soft-purple text-sm font-black">
            {l}
          </span>
        ))}
      </div>

      {error && (
        <div className="text-peach text-xs font-bold bg-peach-light px-4 py-2 rounded-full">
          {error}
        </div>
      )}

      <div className="w-full max-w-md space-y-3">
        {otherPlayers.map((op: any) => {
          const c = playerColors[op.id] || PLAYER_COLORS[0];
          const myPoison = poisonAssignments[op.id] || "";

          return (
            <div key={op.id} className="rounded-2xl p-4 space-y-2"
              style={{ backgroundColor: c.fillLight + "80", border: `1.5px solid ${c.pillBorder}` }}>
              <div className="flex items-center gap-2">
                <span className="font-outfit font-bold text-sm" style={{ color: c.fill }}>{op.name}</span>
              </div>
              <p className="text-[10px] text-warm-gray/50">
                Pick a poison letter for {op.name} (not one of the required letters)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => {
                  const isRequired = letters.includes(l);
                  const isSelected = myPoison === l;
                  return (
                    <button key={l}
                      onClick={() => { if (!isRequired) onSetPoisonLetter(op.id, l); }}
                      className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                        isRequired
                          ? "bg-warm-gray/10 text-warm-gray/20 cursor-not-allowed"
                          : isSelected
                            ? "text-white shadow-md scale-110"
                            : "bg-warm-white border border-warm-gray/15 text-warm-gray/60 hover:border-soft-purple/30 hover:text-plum"
                      }`}
                      style={{ backgroundColor: isSelected ? c.fill : undefined }}>
                      {l}
                    </button>
                  );
                })}
              </div>
              {myPoison && (
                <p className="text-[10px] font-bold" style={{ color: c.fill }}>
                  Poison: {myPoison} → {op.name} loses ❤️ when they use it
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={onAssignPoison}
        disabled={otherPlayers.some((op: any) => !poisonAssignments[op.id])}
        className="px-8 py-3 rounded-2xl font-outfit font-black text-sm tracking-widest uppercase transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 flex items-center gap-2"
        style={{ backgroundColor: "#7C5CFC", color: "#fff", boxShadow: "0 6px 24px rgba(124,92,252,0.35)" }}>
        <Shield className="w-4 h-4" />
        Lock In Poisons
      </button>

      <p className="text-[10px] text-warm-gray/50 text-center">
        {Object.keys(poisonAssignments).length} / {otherPlayers.length} opponents assigned
      </p>
    </div>
  );
});

// ── Game Over Screen ─────────────────────────────────────────────────────────

const GameOverScreen = memo(function GameOverScreen({
  players,
  effectivePlayerId,
  claimedWords,
  playerHearts,
  letters,
  poisonEnabled,
  lobbyCode,
  isHost,
  onLeave,
}: {
  players: any[];
  effectivePlayerId: string;
  claimedWords: ClaimedWord[];
  playerHearts: Record<string, number>;
  letters: string[];
  poisonEnabled: boolean;
  lobbyCode: string;
  isHost: boolean;
  onLeave: () => void;
}) {
  const sorted = [...players].sort((a: any, b: any) => {
    const wordsA = claimedWords.filter(w => w.player_id === a.id);
    const wordsB = claimedWords.filter(w => w.player_id === b.id);
    const scoreA = wordsA.reduce((s, w) => s + (w.is_poisoned ? 0 : w.points), 0);
    const scoreB = wordsB.reduce((s, w) => s + (w.is_poisoned ? 0 : w.points), 0);
    return scoreB - scoreA;
  });

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80">
        <button onClick={onLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80">
          <ArrowLeft className="w-3.5 h-3.5" /> Leave
        </button>
        <span className="font-outfit font-black text-lg text-plum">🔗 LINKS</span>
        <span className="text-[10px] font-mono text-warm-gray/50">{lobbyCode}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8 overflow-y-auto">
        <div className="text-center space-y-2">
          <Trophy className="w-16 h-16 mx-auto text-butter" />
          <h1 className="font-outfit font-black text-3xl text-plum">Game Over!</h1>
          <p className="text-sm text-warm-gray/60">
            Letters: {letters.join(" + ")}
            {poisonEnabled && " · Poison Mode"}
          </p>
        </div>

        <div className="w-full max-w-md space-y-2">
          {sorted.map((p: any, idx: number) => {
            const c = getPlayerColorByName(p.id, players);
            const pWords = claimedWords.filter((w) => w.player_id === p.id);
            const totalPoints = pWords.reduce((sum, w) => sum + (w.is_poisoned ? 0 : w.points), 0);
            const hearts = playerHearts[p.id] ?? 3;

            return (
              <div key={p.id}
                className="flex items-center gap-3 p-4 rounded-xl border transition-all"
                style={{
                  backgroundColor: idx === 0 ? "#FEF3C7" : "#fff",
                  borderColor: idx === 0 ? "#FCD34D" : "rgba(0,0,0,0.08)",
                  boxShadow: idx === 0 ? "0 6px 20px rgba(251,191,36,0.25)" : "0 2px 8px rgba(0,0,0,0.04)",
                }}>
                <span className="text-2xl flex-shrink-0">
                  {idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-outfit font-bold text-sm text-plum truncate">{p.name}</p>
                  <p className="text-[10px] text-warm-gray/50">
                    {pWords.length} word{pWords.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono font-bold text-lg" style={{ color: c.fill }}>{totalPoints}</p>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Heart key={i}
                        className={`w-3 h-3 ${i < hearts ? "text-peach fill-peach" : "text-warm-gray/20"}`} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Word cloud */}
        <div className="w-full max-w-md">
          <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest mb-3">All Words</h3>
          <div className="flex flex-wrap gap-2">
            {claimedWords.map((w) => {
              const c = getPlayerColorByName(w.player_id, players);
              return (
                <span key={w.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border"
                  style={{ backgroundColor: c.fillLight, borderColor: c.pillBorder, color: c.fill }}>
                  {w.word}
                  <span className="opacity-60 text-[10px]">{w.is_poisoned ? "☠️" : `+${w.points}`}</span>
                </span>
              );
            })}
          </div>
        </div>

        <button onClick={onLeave}
          className="px-8 py-3 rounded-2xl font-outfit font-black text-sm bg-soft-purple text-white shadow-lg hover:opacity-90 transition-opacity">
          Return to Lobby
        </button>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function LinksBoardPrototype({
  code: gameCode,
  playerId: propPlayerId,
  playerName: propPlayerName,
}: LinksBoardPrototypeProps) {
  // ── Detect mode ──────────────────────────────────────────────────────
  const isRealMode = !!gameCode;

  // ── Stable player identity ───────────────────────────────────────────
  const [effectivePlayerId] = useState<string>(() => {
    if (propPlayerId && UUID_RE.test(propPlayerId)) return propPlayerId;
    return store.ensurePlayerId();
  });

  useEffect(() => {
    if (store.getPlayerId() !== effectivePlayerId) {
      store.setPlayerId(effectivePlayerId);
    }
  }, [effectivePlayerId]);

  const playerName = propPlayerName || store.getPlayerName() || "Player";

  // ── Real backend state ───────────────────────────────────────────────
  const [lobby, setLobby] = useState<any>(null);
  const [realPlayers, setRealPlayers] = useState<any[]>([]);
  const [gameState, setGameState] = useState<any>({
    phase: "LETTER_SELECT",
    letters: [],
    playerLetters: {},
    poisonLetters: {},
    playerHearts: {},
    usedWords: [],
    scores: {},
    timerEndTime: null,
    poisonEnabled: true,
    roundDuration: 60,
    gameStartTime: null,
  });
  const [claimedWords, setClaimedWords] = useState<ClaimedWord[]>([]);
  const [isGameOver, setIsGameOver] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poisonReveal, setPoisonReveal] = useState<{ letter: string; source: string; show: boolean } | null>(null);
  const [letterSelectError, setLetterSelectError] = useState("");
  const [poisonError, setPoisonError] = useState("");
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [poisonAssignments, setPoisonAssignments] = useState<Record<string, string>>({});
  const [letterSelectTimeLeft, setLetterSelectTimeLeft] = useState(LETTER_SELECT_TIMEOUT);

  // ── Connection state ─────────────────────────────────────────────────
  const [showDisconnected, setShowDisconnected] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBroadcastTick = useRef(0);
  const letterSelectStartRef = useRef<number | null>(null);
  const submitGuardRef = useRef(false);

  // ── Refs for latest values ───────────────────────────────────────────
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; });
  const typedWordRef = useRef("");
  const realPlayersMapRef = useRef<Record<string, any>>({});
  useEffect(() => {
    const map: Record<string, any> = {};
    realPlayers.forEach(p => { map[p.id] = p; });
    realPlayersMapRef.current = map;
  }, [realPlayers]);

  // ── Demo mode state ──────────────────────────────────────────────────
  const [playerCount, setPlayerCount] = useState(2);
  const [activePlayer, setActivePlayer] = useState(0);
  const [colorIndices, setColorIndices] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [inputs, setInputs] = useState<string[]>(["", "", "", "", "", ""]);
  const [words, setWords] = useState<WordEntry[][]>([...DEMO_WORDS]);
  const [clayMode, setClayMode] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState<number | null>(null);
  const [leaderboardMode, setLeaderboardMode] = useState(false);

  // ── Derived: real mode ───────────────────────────────────────────────
  const phase = gameState.phase;
  const letters: string[] = gameState.letters || DEMO_LETTERS;
  const playerLettersState: Record<string, string> = gameState.playerLetters || {};
  const poisonLettersState: Record<string, Record<string, string>> = gameState.poisonLetters || {};
  const playerHearts: Record<string, number> = gameState.playerHearts || {};
  const usedWords: string[] = gameState.usedWords || [];
  const poisonEnabled = gameState.poisonEnabled !== false;
  const roundDuration = gameState.roundDuration || 60;

  const effectivePlayers = isRealMode ? realPlayers : [];
  const effectivePlayerCount = isRealMode ? realPlayers.length : playerCount;
  const isHost = lobby?.host_id === effectivePlayerId;
  const otherPlayers = effectivePlayers.filter((p: any) => p.id !== effectivePlayerId);
  const myLetter = playerLettersState[effectivePlayerId] || "";
  const myHearts = playerHearts[effectivePlayerId] ?? 3;
  const myColor = getPlayerColorByName(effectivePlayerId, effectivePlayers);

  // ── My claimed words + opponent words (real mode) ────────────────────
  const myWords = useMemo(
    () => claimedWords.filter((w) => w.player_id === effectivePlayerId),
    [claimedWords, effectivePlayerId]
  );
  const opponentClaimedWords = useMemo(
    () => claimedWords.filter((w) => w.player_id !== effectivePlayerId),
    [claimedWords, effectivePlayerId]
  );

  // Real scores
  const realScores = useMemo(() => {
    const scores: Record<string, number> = {};
    effectivePlayers.forEach((p: any) => {
      scores[p.id] = claimedWords
        .filter(w => w.player_id === p.id)
        .reduce((s, w) => s + (w.is_poisoned ? 0 : w.points), 0);
    });
    return scores;
  }, [effectivePlayers, claimedWords]);

  // ── Realtime channel ─────────────────────────────────────────────────
  const { presences, isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: isRealMode ? `links:${gameCode}` : `links-demo:${Date.now()}`,
    enablePresence: false,
    subscribeLobby: isRealMode ? gameCode : undefined,
    subscribePlayers: isRealMode ? gameCode : undefined,
    subscribeArenaAnswers: isRealMode ? gameCode : undefined,
    answersTableName: "links_words",
    onLobbyChange: isRealMode ? (payload: any) => {
      if (payload.eventType === "DELETE" || !payload.new) {
        window.location.href = "/";
        return;
      }
      const newData = payload.new as any;
      const parsed = parseArenaState(newData.arena_state);
      if (parsed) {
        setGameState(parsed);
        if (parsed.phase === "PLAYING") {
          setSelectedLetter(null);
          setSubmitStatus(null);
          submitGuardRef.current = false;
          setPoisonAssignments({});
        }
        if (parsed.phase === "RESULTS") {
          setIsGameOver(true);
        }
      }
    } : undefined,
    onPlayerChange: isRealMode ? async () => {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", gameCode)
        .order("score", { ascending: false });
      if (data) setRealPlayers(data);
    } : undefined,
    onArenaAnswer: isRealMode ? (payload: any) => {
      const newWord = payload.new as ClaimedWord;
      if (!newWord) return;
      setClaimedWords((prev) => {
        const exists = prev.find((w) => w.id === newWord.id);
        if (exists) return prev;
        return [...prev, newWord];
      });
      if (newWord.is_poisoned && newWord.player_id === effectivePlayerId) {
        setPoisonReveal({
          letter: newWord.poison_letter || "",
          source: newWord.player_name || "",
          show: true,
        });
        setTimeout(() => setPoisonReveal((p) => p && p.show ? { ...p, show: false } : null), 3000);
      }
    } : undefined,
    onReconnect: isRealMode ? async () => {
      const { data: lobbyData } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", gameCode)
        .maybeSingle();
      const parsed = parseArenaState(lobbyData?.arena_state);
      if (parsed) setGameState(parsed);
    } : undefined,
  });

  // ── Connection banner (5s delay) ─────────────────────────────────────
  useEffect(() => {
    if (!isConnected && isRealMode) {
      disconnectTimerRef.current = setTimeout(() => setShowDisconnected(true), 5000);
    } else {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
      setShowDisconnected(false);
    }
    return () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    };
  }, [isConnected, isRealMode]);

  // ── Broadcast listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!isRealMode) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onBroadcast("letter:select", (payload: any) => {
        setGameState((prev: any) => ({
          ...prev,
          playerLetters: { ...prev.playerLetters, [payload.playerId]: payload.letter },
          letters: payload.letters || prev.letters,
          phase: payload.phase || prev.phase,
        }));
      })
    );

    unsubs.push(
      onBroadcast("poison:assign", () => {
        supabase
          .from("lobbies")
          .select("arena_state")
          .eq("code", gameCode)
          .single()
          .then(({ data }) => {
            const parsed = parseArenaState(data?.arena_state);
            if (parsed) setGameState(parsed);
          });
      })
    );

    unsubs.push(
      onBroadcast("word:claim", (payload: any) => {
        setClaimedWords((prev) => {
          if (prev.find((w) => w.id === payload.id)) return prev;
          return [...prev, payload];
        });
      })
    );

    unsubs.push(
      onBroadcast("player:leave", (payload: any) => {
        if (payload.playerId) {
          setRealPlayers((prev) => prev.filter((p) => p.id !== payload.playerId));
        }
      })
    );

    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast, isRealMode, gameCode]);

  // ── Initial fetch (real mode) ────────────────────────────────────────

  const recoveryAttemptedRef = useRef(false);

  useEffect(() => {
    if (!isRealMode || !gameCode) return;
    let cancelled = false;

    const init = async () => {
      const { data: lobbyData } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", gameCode)
        .maybeSingle();

      if (cancelled) return;
      if (lobbyData) {
        setLobby(lobbyData);
        const parsed = parseArenaState(lobbyData.arena_state);
        if (parsed) {
          const validPhases = ["LETTER_SELECT", "POISON_SETUP", "PLAYING", "RESULTS", "GAME_OVER"];
          if (parsed.phase && !validPhases.includes(parsed.phase) && !recoveryAttemptedRef.current) {
            recoveryAttemptedRef.current = true;
            if (import.meta.env.DEV) {
              console.warn("[LINKS] Stale phase detected:", parsed.phase, "— auto-recovering");
            }
            const { error: nullErr } = await supabase.from("lobbies").update({ arena_state: null }).eq("code", gameCode);
            if (nullErr && import.meta.env.DEV) console.warn("[LINKS] Failed to null stale arena_state:", nullErr.message);
            const { data: recovered } = await supabase.rpc("start_links_game", {
              p_lobby_code: gameCode,
              p_settings: {
                poisonEnabled: parsed.poisonEnabled !== false,
                roundDuration: parsed.roundDuration || 60,
              },
            });
            if (recovered?.success && recovered?.phase) {
              const { data: freshLobby } = await supabase
                .from("lobbies")
                .select("*")
                .eq("code", gameCode)
                .maybeSingle();
              if (freshLobby && !cancelled) {
                const freshParsed = parseArenaState(freshLobby.arena_state);
                if (freshParsed) {
                  setGameState(freshParsed);
                  setLobby(freshLobby);
                }
              }
              return;
            }
          }
          setGameState(parsed);
        }
      }

      const { data: playerData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", gameCode)
        .order("score", { ascending: false });

      if (!cancelled && playerData) {
        setRealPlayers(playerData);
        const myRecord = playerData.find((p: any) => p.id === effectivePlayerId);
        if (!myRecord) {
          const existingByName = playerData.find(
            (p: any) => p.name.toLowerCase().trim() === (playerName || "").toLowerCase().trim()
          );
          if (existingByName) {
            store.setPlayerId(existingByName.id);
          } else {
            await supabase.from("players").upsert(
              { id: effectivePlayerId, lobby_code: gameCode, name: playerName || "Player", score: 0, metadata: {} },
              { onConflict: "id" }
            );
          }
        }
      }

      const { data: wordsData } = await supabase
        .from("links_words")
        .select("*")
        .eq("lobby_code", gameCode)
        .order("created_at", { ascending: true });

      if (!cancelled && wordsData) {
        setClaimedWords(wordsData);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [gameCode, isRealMode, effectivePlayerId, playerName]);

  // ── Letter selection timer ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== "LETTER_SELECT") {
      letterSelectStartRef.current = null;
      setLetterSelectTimeLeft(LETTER_SELECT_TIMEOUT);
      return;
    }
    if (!letterSelectStartRef.current) {
      letterSelectStartRef.current = Date.now();
    }
    const interval = setInterval(() => {
      const elapsed = (Date.now() - (letterSelectStartRef.current || Date.now())) / 1000;
      const remaining = Math.max(0, LETTER_SELECT_TIMEOUT - Math.floor(elapsed));
      setLetterSelectTimeLeft(remaining);
    }, 200);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Per-player timer: derive my seconds from playerTimers ────────────
  const playerTimers: Record<string, number> = gameState.playerTimers || {};
  const playerTimersRef = useRef(playerTimers);
  playerTimersRef.current = playerTimers; // sync ref during render (prevents race with interval callbacks)
  const [myTimerSeconds, setMyTimerSeconds] = useState(roundDuration);
  const [shakeKey, setShakeKey] = useState(0);

  // Compute opponent timer seconds (plain function, recomputed each render via Date.now())
  const getOpponentTimer = (playerId: string): number | undefined => {
    const endTime = playerTimers[playerId];
    if (!endTime || typeof endTime !== "number") return undefined;
    return Math.max(0, Math.ceil(endTime - Date.now() / 1000));
  };

  // Derive poison warnings — find letters assigned to ME by opponents
  const poisonWarning = useMemo(() => {
    if (!isRealMode || phase !== "PLAYING") return null;
    const myPoisons: string[] = [];
    for (const [assignerId, assignments] of Object.entries(poisonLettersState)) {
      if (typeof assignments === "object" && assignments[effectivePlayerId]) {
        myPoisons.push(assignments[effectivePlayerId]);
      }
    }
    if (myPoisons.length === 0) return null;
    return `☠️ Avoid: ${myPoisons.join(", ")}`;
  }, [isRealMode, phase, poisonLettersState, effectivePlayerId]);

  // ── Per-player timer tick (PLAYING phase only) ────────────────────
  const playerHeartsRef = useRef(playerHearts);
  useEffect(() => { playerHeartsRef.current = playerHearts; });
  const penaltyCheckRef = useRef(false);
  const penaltyAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (phase !== "PLAYING" || !isRealMode) {
      setMyTimerSeconds(roundDuration);
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now() / 1000;
      const timers = playerTimersRef.current;
      const myEnd = timers[effectivePlayerId];
      if (myEnd) {
        setMyTimerSeconds(Math.max(0, Math.ceil(myEnd - now)));
      }

      // Host: check all player timers and penalize expired ones
      if (isHost && !penaltyCheckRef.current) {
        for (const [pid, endTime] of Object.entries(timers)) {
          if (typeof endTime === "number" && now >= endTime) {
            // Skip if already attempted this player+expiration combo
            const attemptKey = `${pid}:${endTime}`;
            if (penaltyAttemptedRef.current.has(attemptKey)) continue;
            const hearts = playerHeartsRef.current[pid];
            if (hearts !== undefined && hearts > 0) {
              penaltyAttemptedRef.current.add(attemptKey);
              penaltyCheckRef.current = true;
        void (async () => {
          try {
            const { data } = await supabase.rpc("penalize_links_player", {
              p_lobby_code: gameCode,
              p_player_id: pid,
            });
            penaltyCheckRef.current = false;
            if (data?.success) {
              broadcast("player:penalized", { playerId: pid, heartsRemaining: data.hearts_remaining, phase: data.phase });
            }
          } catch {
            penaltyCheckRef.current = false;
          }
        })();
            }
          }
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [phase, isRealMode, effectivePlayerId, isHost, gameCode, broadcast, roundDuration]);

  // ── Listen for player:penalized broadcasts ──────────────────────────
  useEffect(() => {
    if (!isRealMode) return;
    return onBroadcast("player:penalized", (payload: any) => {
      // Re-fetch lobby state for updated hearts/timers
      supabase
        .from("lobbies")
        .select("arena_state")
        .eq("code", gameCode)
        .single()
        .then(({ data }) => {
          const parsed = parseArenaState(data?.arena_state);
          if (parsed) {
            setGameState(parsed);
            if (parsed.phase === "RESULTS") setIsGameOver(true);
          }
        });
    });
  }, [onBroadcast, isRealMode, gameCode]);

  // ── Polling fallback ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isRealMode) return;
    const poll = setInterval(async () => {
      if (isConnected) return;
      try {
        const { data: lobbyData } = await supabase
          .from("lobbies")
          .select("*")
          .eq("code", gameCode)
          .maybeSingle();
        if (lobbyData) {
          setLobby(lobbyData);
          const parsed = parseArenaState(lobbyData.arena_state);
          if (parsed) setGameState(parsed);
        }
        const { data: playerData } = await supabase
          .from("players")
          .select("*")
          .eq("lobby_code", gameCode)
          .order("score", { ascending: false });
        if (playerData) setRealPlayers(playerData);
        const { data: wordsData } = await supabase
          .from("links_words")
          .select("*")
          .eq("lobby_code", gameCode)
          .order("created_at", { ascending: true });
        if (wordsData) setClaimedWords(wordsData);
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, [gameCode, isRealMode, isConnected]);

  // ── Auto-transition to leaderboard on short viewport ─────────────────
  useEffect(() => {
    const checkHeight = () => {
      if (effectivePlayerCount >= 4) {
        setLeaderboardMode(window.innerHeight < 620);
      }
    };
    checkHeight();
    window.addEventListener("resize", checkHeight);
    return () => window.removeEventListener("resize", checkHeight);
  }, [effectivePlayerCount]);

  // ── Word validation (client-side) ────────────────────────────────────
  const validateWord = useCallback(
    (word: string) => {
      if (!word || word.length < 3) return { type: "typing" as const };
      const lower = word.toLowerCase().trim();
      if (!/^[a-z]{3,15}$/.test(lower)) {
        return { type: "invalid" as const, message: "Letters only, 3-15 chars" };
      }
      for (const letter of letters) {
        if (!lower.includes(letter.toLowerCase())) {
          return { type: "missing" as const, message: `Missing "${letter}"` };
        }
      }
      if (usedWords.includes(lower) || claimedWords.some((w) => w.word === lower)) {
        const claimer = claimedWords.find((w) => w.word === lower);
        return {
          type: "used" as const,
          message: claimer ? `${claimer.player_name} already claimed it` : "Already used",
        };
      }
      return { type: "valid" as const };
    },
    [letters, usedWords, claimedWords]
  );

  // ── Typed word state ─────────────────────────────────────────────────
  const [typedWord, setTypedWord] = useState("");
  const [wordFeedback, setWordFeedback] = useState<{ type: string; message?: string }>({ type: "typing" });

  useEffect(() => { typedWordRef.current = typedWord; });

  // ── Adapter for ActivePlayerPanel which calls setInput(string) ──
  const handleSetInput = useCallback((v: string) => {
    setTypedWord(v);
    if (v.length === 0) {
      setWordFeedback({ type: "typing" });
    } else {
      const fb = validateWord(v);
      setWordFeedback(fb);
      if (fb.type === "used") setShakeKey(k => k + 1);
    }
  }, [validateWord]);

  // ── RPC Actions ──────────────────────────────────────────────────────

  const handleSelectLetter = async (letter: string) => {
    if (!isRealMode) return;
    if (phase !== "LETTER_SELECT" || selectedLetter) return;
    setSelectedLetter(letter);
    setLetterSelectError("");

    const { data, error } = await supabase.rpc("select_links_letter", {
      p_lobby_code: gameCode,
      p_player_id: effectivePlayerId,
      p_letter: letter,
    });

    if (error) {
      setLetterSelectError(error.message || "Failed to select letter");
      setSelectedLetter(null);
      return;
    }
    if (data?.success === false) {
      setLetterSelectError(data.error || "Cannot select this letter");
      setSelectedLetter(null);
      return;
    }

    broadcast("letter:select", {
      playerId: effectivePlayerId,
      letter,
      letters: data.letters,
      phase: data.phase,
    });

    setGameState((prev: any) => ({
      ...prev,
      playerLetters: { ...prev.playerLetters, [effectivePlayerId]: letter },
      letters: data.letters || prev.letters,
      phase: data.phase || prev.phase,
    }));
  };

  const handleForceStart = async () => {
    if (!isRealMode || !isHost) return;
    const { data, error } = await supabase.rpc("start_links_game", {
      p_lobby_code: gameCode,
      p_settings: { poisonEnabled, roundDuration },
    });
    if (data?.success) {
      const { data: lobbyData } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", gameCode)
        .maybeSingle();
      if (lobbyData?.arena_state) setGameState(lobbyData.arena_state);
    }
  };

  const handleSetPoisonLetter = (targetId: string, letter: string) => {
    setPoisonAssignments((prev) => {
      const isSelected = prev[targetId] === letter;
      return { ...prev, [targetId]: isSelected ? "" : letter };
    });
  };

  const handleAssignPoison = async () => {
    if (!isRealMode) return;
    if (phase !== "POISON_SETUP") return;
    const targetIds = otherPlayers.map((p: any) => p.id);
    const missing = targetIds.filter((id) => !poisonAssignments[id]);
    if (missing.length > 0) {
      setPoisonError("Assign a poison letter for each opponent");
      return;
    }
    setPoisonError("");

    const { data, error } = await supabase.rpc("assign_links_poison", {
      p_lobby_code: gameCode,
      p_player_id: effectivePlayerId,
      p_poison_map: poisonAssignments,
    });

    if (error) {
      setPoisonError(error.message || "Failed to assign poisons");
      return;
    }
    if (data?.success === false) {
      setPoisonError(data.error || "Cannot assign poisons");
      return;
    }

    broadcast("poison:assign", { playerId: effectivePlayerId });
    if (data?.phase === "PLAYING") {
      setGameState((prev: any) => ({ ...prev, phase: "PLAYING" }));
    }
  };

  const handleSubmitWord = async (wordParam?: string) => {
    if (phase !== "PLAYING" || submitGuardRef.current || isSubmitting) return;
    if (wordFeedback.type !== "valid") return;
    if (myHearts <= 0) return; // eliminated — can't submit

    const word = (wordParam || typedWord).trim().toLowerCase();
    if (!word || word.length < 3) return;

    submitGuardRef.current = true;
    setIsSubmitting(true);
    setSubmitStatus("Claiming...");

    const tempId = `temp-${Date.now()}`;
    const optimisticWord: ClaimedWord = {
      id: tempId,
      player_id: effectivePlayerId,
      player_name: playerName || "You",
      word,
      word_length: word.length,
      points: calcPoints(word.length),
      is_poisoned: false,
      poison_letter: null,
      hearts_remaining: myHearts,
      created_at: new Date().toISOString(),
    };

    setClaimedWords((prev) => [...prev, optimisticWord]);
    setTypedWord("");
    setWordFeedback({ type: "typing" });

    if (!isRealMode) {
      // Demo mode: just add the word
      submitGuardRef.current = false;
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase.rpc("submit_links_word", {
      p_lobby_code: gameCode,
      p_player_id: effectivePlayerId,
      p_word: word,
    });

    submitGuardRef.current = false;
    setIsSubmitting(false);

    if (error) {
      setClaimedWords((prev) => prev.filter((w) => w.id !== tempId));
      setTypedWord(word);
      setSubmitStatus(error.message || "Submit failed");
      setTimeout(() => setSubmitStatus(null), 3000);
      return;
    }

    if (data?.success === false) {
      setClaimedWords((prev) => prev.filter((w) => w.id !== tempId));
      setTypedWord(word);
      if (data.error_code === "ALREADY_USED") {
        setWordFeedback({ type: "used", message: "Already claimed!" });
        setShakeKey(k => k + 1);
        setSubmitStatus("Already taken!");
      } else {
        setSubmitStatus(data.error || "Rejected");
      }
      setTimeout(() => setSubmitStatus(null), 3000);
      return;
    }

    // Remove optimistic — DB will push real record via realtime
    setClaimedWords((prev) => prev.filter((w) => w.id !== tempId));

    if (data.is_poisoned) {
      setPoisonReveal({
        letter: data.poison_letter || "",
        source: "",
        show: true,
      });
      setTimeout(() => setPoisonReveal((p) => p && p.show ? { ...p, show: false } : null), 3000);
    }

    setSubmitStatus(data.eliminated ? "💀 Eliminated!" : `+${data.points} pts`);
    setTimeout(() => setSubmitStatus(null), 2000);

    broadcast("word:claim", {
      id: tempId,
      playerId: effectivePlayerId,
      playerName: playerName || "Player",
      word,
      points: calcPoints(word.length),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmitWord();
    }
  };

  const handleLeave = async () => {
    if (confirm("Leave the game?")) {
      if (isRealMode) {
        broadcast("player:leave", { playerId: effectivePlayerId });
        await supabase.from("players").delete().eq("id", effectivePlayerId).eq("lobby_code", gameCode);
        store.clearArenaHostCode();
        window.location.href = `/lobby/${gameCode}`;
      } else {
        window.location.href = "/";
      }
    }
  };

  // ── Demo mode: active player input ───────────────────────────────────
  const demoActiveInput = inputs[activePlayer] || "";
  const demoAllInputs = inputs;

  const setActiveInput = useCallback((v: string) => {
    setInputs((prev) => {
      const next = [...prev];
      next[activePlayer] = v;
      return next;
    });
  }, [activePlayer]);

  const handleDemoClaim = useCallback((claimedWord: string) => {
    const entry: WordEntry = {
      id: `w${Date.now()}`,
      word: claimedWord,
      points: calcPoints(claimedWord.length),
      isPoisoned: false,
      claimedAt: new Date(),
    };
    setWords((prev) => {
      const next = [...prev];
      while (next.length <= activePlayer) next.push([]);
      next[activePlayer] = [entry, ...(next[activePlayer] || [])];
      return next;
    });
    setInputs((prev) => {
      const next = [...prev];
      next[activePlayer] = "";
      return next;
    });
  }, [activePlayer]);

  const setPlayerColor = useCallback((playerIdx: number, colorIdx: number) => {
    setColorIndices((prev) => {
      const next = [...prev];
      next[playerIdx] = colorIdx;
      return next;
    });
  }, []);

  // ── Demo mode derived ────────────────────────────────────────────────
  const demoAllWords = useMemo(() => {
    const result = [...words];
    while (result.length < effectivePlayerCount) result.push([]);
    return result;
  }, [words, effectivePlayerCount]);

  const demoAllInputsMemo = useMemo(() => {
    const result = [...inputs];
    while (result.length < effectivePlayerCount) result.push("");
    return result;
  }, [inputs, effectivePlayerCount]);

  const demoAllColors = useMemo(() => {
    const result = [...colorIndices];
    while (result.length < effectivePlayerCount) result.push(result.length % PLAYER_COLORS.length);
    return result;
  }, [colorIndices, effectivePlayerCount]);

  const demoScores = useMemo(() =>
    demoAllWords.map((ws) => ws.reduce((s, w) => s + w.points, 0)),
    [demoAllWords]
  );

  const demoHearts = [2, 3, 1, 3, 2, 3];

  const demoLiveInput = isRealMode ? typedWord : demoActiveInput;

  // ── Compute opponent data ────────────────────────────────────────────
  const opponentIndices = Array.from({ length: effectivePlayerCount }, (_, i) => i).filter(
    i => !isRealMode || realPlayers[i]?.id !== effectivePlayerId
  );

  // ── Loading state (real mode) ────────────────────────────────────────
  if (isRealMode && !lobby) {
    return (
      <div className="h-screen bg-clay-cream flex items-center justify-center">
        <div className="text-warm-gray/60 font-medium text-sm animate-pulse">Loading LINKS...</div>
      </div>
    );
  }

  // ── Game Over screen ─────────────────────────────────────────────────
  if (isRealMode && (isGameOver || phase === "RESULTS")) {
    return (
      <GameOverScreen
        players={realPlayers}
        effectivePlayerId={effectivePlayerId}
        claimedWords={claimedWords}
        playerHearts={playerHearts}
        letters={letters}
        poisonEnabled={poisonEnabled}
        lobbyCode={gameCode || ""}
        isHost={isHost}
        onLeave={handleLeave}
      />
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="h-screen bg-clay-cream flex flex-col overflow-hidden">
      {/* ── Disconnected banner ───────────────────────────────────── */}
      {showDisconnected && isRealMode && (
        <div className="sticky top-0 z-50 bg-peach-light border-b border-peach/30 px-4 py-3 flex items-center justify-center gap-3">
          <WifiOff className="w-4 h-4 text-peach animate-pulse" />
          <span className="text-peach text-xs font-bold uppercase tracking-widest">
            Connection lost — reconnecting...
          </span>
        </div>
      )}

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-4 py-2 flex items-center justify-between bg-warm-white/90 backdrop-blur-md border-b border-warm-gray/10 z-20 gap-2 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={handleLeave}
            className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
          <span className="font-outfit font-black text-base text-plum">🔗 LINKS</span>
          {isRealMode && gameCode && (
            <span className="text-[10px] font-mono text-warm-gray/50">{gameCode}</span>
          )}
          {!isRealMode && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-plum/25 hidden sm:inline">Prototype</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
          {/* Connection status (real mode) */}
          {isRealMode && (
            <div className="flex items-center gap-1.5 text-[10px] font-bold mr-1">
              {showDisconnected ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-peach animate-pulse" />
                  <span className="text-peach hidden sm:inline">Reconnecting</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-mint" />
                  <span className="text-mint hidden sm:inline">{Object.keys(presences || {}).length || realPlayers.length} online</span>
                </>
              )}
            </div>
          )}

          {/* Phase badge (real mode) */}
          {isRealMode && (
            <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
              phase === "PLAYING" ? "bg-mint-light text-mint border-mint/30" :
              phase === "LETTER_SELECT" ? "bg-soft-purple-light text-soft-purple border-soft-purple/30" :
              phase === "POISON_SETUP" ? "bg-peach-light text-peach border-peach/30" :
              "bg-warm-gray/10 text-warm-gray/50 border-warm-gray/10"
            }`}>
              {phase === "LETTER_SELECT" ? "Pick Letter" :
               phase === "POISON_SETUP" ? "Set Poison" :
               phase === "PLAYING" ? "Playing" : phase || "—"}
            </div>
          )}

          {/* Playing status (real mode, PLAYING phase) */}
          {(isRealMode && phase === "PLAYING") && (
            <div className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border bg-mint-light text-mint border-mint/30">
              ⚡ Playing
            </div>
          )}

          {/* Dev toggles — always visible */}
          {/* Player count selector (demo only, but shown for debugging in real mode) */}
          {!isRealMode && (
            <div className="flex items-center gap-1 bg-warm-gray/5 rounded-full p-0.5">
              <Users className="w-3 h-3 text-plum/30 ml-1.5" />
              {([2, 3, 4, 5, 6] as const).map((n) => (
                <button key={n} onClick={() => {
                  setPlayerCount(n);
                  if (activePlayer >= n) setActivePlayer(0);
                  setColorPickerOpen(null);
                }}
                  className={`w-6 h-6 rounded-full text-[10px] font-black transition-all ${effectivePlayerCount === n ? "bg-soft-purple text-white shadow-sm" : "text-plum/30 hover:text-plum/60"}`}>
                  {n}
                </button>
              ))}
            </div>
          )}

          {/* Color dots (always visible in demo, visible in real when no color picker for debugging) */}
          <div className="hidden sm:flex items-center gap-1 relative">
            <span className="text-[9px] font-bold text-plum/40 mr-0.5">Colors:</span>
            {Array.from({ length: effectivePlayerCount }).map((_, i) => {
              const colorIdx = isRealMode ? i : demoAllColors[i];
              const c = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
              return (
                <button key={i} onClick={() => setColorPickerOpen(colorPickerOpen === i ? null : i)}
                  className="w-5 h-5 rounded-full border-2 border-white shadow-sm transition-transform hover:scale-110 flex items-center justify-center relative"
                  style={{ backgroundColor: c.fill, boxShadow: `0 2px 6px color-mix(in srgb, ${c.fill} 30%, transparent)` }}>
                  <span className="text-[6px] font-black" style={{ color: needsDarkText(c.fill) ? "#4A3B6B" : "#fff" }}>{i + 1}</span>
                </button>
              );
            })}

            {/* Color picker dropdown */}
            {colorPickerOpen !== null && !isRealMode && (
              <div className="absolute top-full right-0 mt-2 bg-warm-white rounded-2xl shadow-xl border border-warm-gray/10 p-3 z-30 w-48 animate-clay-pop">
                <p className="text-[10px] font-black text-plum/40 uppercase tracking-wider mb-2">Player {colorPickerOpen + 1} color</p>
                <div className="grid grid-cols-4 gap-2">
                  {PLAYER_COLORS.map((c, i) => (
                    <button key={c.name} onClick={() => { setPlayerColor(colorPickerOpen, i); setColorPickerOpen(null); }}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-[8px] font-black transition-all hover:scale-110 active:scale-95 border-2 shadow-sm ${needsDarkText(c.fill) ? "text-[#4A3B6B]" : "text-white"}`}
                      style={{ backgroundColor: c.fill, borderColor: demoAllColors[colorPickerOpen] === i ? "#fff" : "transparent" }}
                      title={c.label}>
                      {demoAllColors[colorPickerOpen] === i ? "✓" : c.label[0]}
                    </button>
                  ))}
                </div>
                <button onClick={() => setColorPickerOpen(null)} className="w-full mt-2 text-[9px] font-bold text-plum/30 hover:text-plum/50 transition-colors">Close</button>
              </div>
            )}
          </div>

          {/* Style toggle */}
          <button onClick={() => setClayMode(!clayMode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] sm:text-xs font-bold transition-all ${clayMode ? "bg-soft-purple border-soft-purple text-white shadow-md" : "bg-warm-gray/5 border-warm-gray/10 text-plum/40 hover:text-plum/70 hover:bg-warm-gray/10"}`}>
            <Palette className="w-3 h-3" />
            <span className="hidden sm:inline">{clayMode ? "Clay" : "Soft"}</span>
          </button>

          {/* View toggle: Grid vs Leaderboard */}
          {effectivePlayerCount >= 4 && (
            <button onClick={() => setLeaderboardMode(!leaderboardMode)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] sm:text-xs font-bold transition-all ${leaderboardMode ? "bg-soft-purple border-soft-purple text-white shadow-md" : "bg-warm-gray/5 border-warm-gray/10 text-plum/40 hover:text-plum/70 hover:bg-warm-gray/10"}`}>
              {leaderboardMode ? <List className="w-3 h-3" /> : <LayoutGrid className="w-3 h-3" />}
              <span className="hidden sm:inline">{leaderboardMode ? "List" : "Grid"}</span>
            </button>
          )}

          {/* Switch active player (demo mode) */}
          {!isRealMode && (
            <button onClick={() => setActivePlayer((prev) => (prev + 1) % effectivePlayerCount)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-warm-gray/5 border border-warm-gray/10 text-[10px] sm:text-xs font-bold text-plum/40 hover:text-plum/70 hover:bg-warm-gray/10 transition-all">
              <ArrowLeftRight className="w-3 h-3" />
              <span className="hidden sm:inline">Switch</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Unknown phase fallback (real mode) */}
        {isRealMode && phase !== "LETTER_SELECT" && phase !== "POISON_SETUP" && phase !== "PLAYING" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 text-center">
            <p className="text-sm text-warm-gray/50">
              Unknown phase: <code className="text-peach font-mono text-xs">{JSON.stringify(phase)}</code>
            </p>
            {isHost && (
              <button onClick={handleForceStart}
                className="px-6 py-3 rounded-2xl bg-soft-purple text-white font-black text-sm shadow-lg hover:opacity-90 transition-opacity">
                Force Restart
              </button>
            )}
          </div>
        )}

        {/* ── LETTER_SELECT phase (real mode) ────────────────────── */}
        {isRealMode && phase === "LETTER_SELECT" && (
          <LetterSelectPhase
            letters={letters}
            lettersTimeLeft={letterSelectTimeLeft}
            players={realPlayers}
            playerLetters={playerLettersState}
            playerColors={Object.fromEntries(
              realPlayers.map((p: any, i: number) => [p.id, getPlayerColorByIndex(i)])
            )}
            selectedLetter={selectedLetter}
            error={letterSelectError}
            isHost={isHost}
            onSelectLetter={handleSelectLetter}
            onForceStart={handleForceStart}
          />
        )}

        {/* ── POISON_SETUP phase (real mode) ─────────────────────── */}
        {isRealMode && phase === "POISON_SETUP" && (
          <PoisonSetupPhase
            players={realPlayers}
            effectivePlayerId={effectivePlayerId}
            letters={letters}
            poisonAssignments={poisonAssignments}
            error={poisonError}
            otherPlayers={otherPlayers}
            playerColors={Object.fromEntries(
              realPlayers.map((p: any, i: number) => [p.id, getPlayerColorByIndex(i)])
            )}
            onAssignPoison={handleAssignPoison}
            onSetPoisonLetter={handleSetPoisonLetter}
          />
        )}

        {/* ── PLAYING phase OR demo mode panels ─────────────────── */}
        {(!isRealMode || phase === "PLAYING") && (
          <>
            {/* 2 PLAYERS */}
            {effectivePlayerCount === 2 && (
              <div className="flex-1 flex flex-col md:flex-row min-h-0">
                <div className="flex-1 min-h-0 flex">
                  {isRealMode ? (
                    <ActivePlayerPanel
                      color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                      input={typedWord} setInput={handleSetInput}
                      onClaim={handleSubmitWord}
                      words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                      score={realScores[effectivePlayerId] || 0}
                      hearts={myHearts}
                      playerLabel={playerName || "You"}
                      avatarSrc={AVATARS[0].src}
                      clayMode={clayMode}
                      letters={letters}
                      submitting={isSubmitting}
                      submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                    />
                  ) : (
                    <ActivePlayerPanel
                      color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                      input={demoActiveInput} setInput={setActiveInput}
                      onClaim={handleDemoClaim}
                      words={demoAllWords[activePlayer]}
                      score={demoScores[activePlayer]}
                      hearts={demoHearts[activePlayer]}
                      playerLabel={`P${activePlayer + 1}`}
                      avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                      clayMode={clayMode}
                      letters={DEMO_LETTERS}
                    />
                  )}
                </div>
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="w-8 h-8 rounded-full bg-warm-white border-2 border-warm-gray/10 shadow-sm flex items-center justify-center">
                      <span className="text-[10px] font-black text-plum/15">VS</span>
                    </div>
                  </div>
                </div>
                <div className="md:hidden h-[3px] bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="w-6 h-6 rounded-full bg-warm-white border border-warm-gray/10 shadow-sm flex items-center justify-center">
                      <span className="text-[8px] font-black text-plum/15">VS</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex">
                  {isRealMode ? (
                    <OpponentPanel
                      color={getPlayerColorByName(otherPlayers[0]?.id, realPlayers)}
                      playerLabel={otherPlayers[0]?.name || "Opponent"}
                      avatarSrc={AVATARS[1 % AVATARS.length].src}
                      score={realScores[otherPlayers[0]?.id] || 0}
                      hearts={playerHearts[otherPlayers[0]?.id] ?? 3}
                      words={opponentClaimedWords.filter(w => w.player_id === otherPlayers[0]?.id).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                      liveInput={""}
                      playerLetter={playerLettersState[otherPlayers[0]?.id] || ""}
                      timerSeconds={getOpponentTimer(otherPlayers[0]?.id || "")}
                      clayMode={clayMode}
                    />
                  ) : (
                    <OpponentPanel
                      color={PLAYER_COLORS[demoAllColors[opponentIndices[0]]]}
                      playerLabel={`P${opponentIndices[0] + 1}`}
                      avatarSrc={AVATARS[opponentIndices[0] % AVATARS.length].src}
                      score={demoScores[opponentIndices[0]]}
                      hearts={demoHearts[opponentIndices[0]]}
                      words={demoAllWords[opponentIndices[0]]}
                      liveInput={demoLiveInput}
                      playerLetter={DEMO_LETTERS[opponentIndices[0] % DEMO_LETTERS.length]}
                      clayMode={clayMode}
                    />
                  )}
                </div>
              </div>
            )}

            {/* 3 PLAYERS */}
            {effectivePlayerCount === 3 && (
              <div className="flex-1 flex flex-col md:flex-row min-h-0">
                <div className="flex-1 min-h-0 flex flex-col md:flex-none md:w-[50%]">
                  {isRealMode ? (
                    <ActivePlayerPanel
                      color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                      input={typedWord} setInput={handleSetInput}
                      onClaim={handleSubmitWord}
                      words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                      score={realScores[effectivePlayerId] || 0}
                      hearts={myHearts}
                      playerLabel={playerName || "You"}
                      avatarSrc={AVATARS[0].src}
                      clayMode={clayMode}
                      letters={letters}
                      submitting={isSubmitting}
                      submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                    />
                  ) : (
                    <ActivePlayerPanel
                      color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                      input={demoActiveInput} setInput={setActiveInput}
                      onClaim={handleDemoClaim}
                      words={demoAllWords[activePlayer]}
                      score={demoScores[activePlayer]}
                      hearts={demoHearts[activePlayer]}
                      playerLabel={`P${activePlayer + 1}`}
                      avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                      clayMode={clayMode}
                      letters={DEMO_LETTERS}
                    />
                  )}
                </div>
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 relative shrink-0">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="w-6 h-6 rounded-full bg-warm-white border-2 border-warm-gray/10 shadow-sm flex items-center justify-center">
                      <span className="text-[8px] font-black text-plum/15">VS</span>
                    </div>
                  </div>
                </div>
                <div className="md:hidden h-[2px] bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80 relative shrink-0" />
                <div className="flex-1 min-h-0 flex flex-col md:flex-none md:w-[50%]">
                  {(() => {
                    const opps = isRealMode ? otherPlayers : opponentIndices.map(i => ({ id: `demo-${i}`, name: `P${i + 1}` }));
                    return opps.map((op: any, idx: number) => {
                      const oi = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : opponentIndices[idx];
                      return (
                        <div key={op.id} className="flex-shrink-0 min-h-[130px] md:flex-1 md:min-h-0 flex border-b border-warm-gray/10 last:border-b-0 md:border-b-0">
                          {isRealMode ? (
                            <OpponentPanel
                              color={getPlayerColorByName(op.id, realPlayers)}
                              playerLabel={op.name || "Opponent"}
                              avatarSrc={AVATARS[(oi + 1) % AVATARS.length].src}
                              score={realScores[op.id] || 0}
                              hearts={playerHearts[op.id] ?? 3}
                              words={opponentClaimedWords.filter(w => w.player_id === op.id).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                              liveInput={typedWord}
                              playerLetter={playerLettersState[op.id] || ""}
                      timerSeconds={getOpponentTimer(op.id)}
                              clayMode={clayMode}
                            />
                          ) : (
                            <OpponentPanel
                              color={PLAYER_COLORS[demoAllColors[oi]]}
                              playerLabel={`P${oi + 1}`}
                              avatarSrc={AVATARS[oi % AVATARS.length].src}
                              score={demoScores[oi]}
                              hearts={demoHearts[oi]}
                              words={demoAllWords[oi]}
                              liveInput={demoLiveInput}
                              playerLetter={DEMO_LETTERS[oi % DEMO_LETTERS.length]}
                              clayMode={clayMode}
                            />
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* 4 PLAYERS */}
            {effectivePlayerCount === 4 && (leaderboardMode ? (
              <div className="flex-1 flex flex-col md:flex-row min-h-0">
                <div className="flex-[3] md:flex-[11] min-h-0 flex">
                  {isRealMode ? (
                    <ActivePlayerPanel
                      color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                      input={typedWord} setInput={handleSetInput}
                      onClaim={handleSubmitWord}
                      words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                      score={realScores[effectivePlayerId] || 0}
                      hearts={myHearts}
                      playerLabel={playerName || "You"}
                      avatarSrc={AVATARS[0].src}
                      clayMode={clayMode}
                      letters={letters}
                      submitting={isSubmitting}
                      submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                    />
                  ) : (
                    <ActivePlayerPanel
                      color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                      input={demoActiveInput} setInput={setActiveInput}
                      onClaim={handleDemoClaim}
                      words={demoAllWords[activePlayer]}
                      score={demoScores[activePlayer]}
                      hearts={demoHearts[activePlayer]}
                      playerLabel={`P${activePlayer + 1}`}
                      avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                      clayMode={clayMode}
                      letters={DEMO_LETTERS}
                    />
                  )}
                </div>
                <div className="h-[3px] md:hidden bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                <div className="flex-[2] md:flex-[9] min-h-0 flex">
                  <OpponentLeaderboard
                    opponents={(() => {
                      const opps = isRealMode ? otherPlayers : opponentIndices;
                      return opps.map((op: any) => {
                        const idx = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : op;
                        const pid = isRealMode ? op.id : `demo-${op}`;
                        return {
                          index: idx,
                          label: isRealMode ? (op.name || "Opponent") : `P${idx + 1}`,
                          score: isRealMode ? (realScores[pid] || 0) : demoScores[idx],
                          hearts: isRealMode ? (playerHearts[pid] ?? 3) : demoHearts[idx],
                          wordCount: isRealMode ? (opponentClaimedWords.filter(w => w.player_id === pid).length) : (demoAllWords[idx]?.length || 0),
                          words: isRealMode ? opponentClaimedWords.filter(w => w.player_id === pid).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) })) : (demoAllWords[idx] || []),
                          color: isRealMode ? getPlayerColorByName(pid, realPlayers) : PLAYER_COLORS[demoAllColors[idx]],
                          avatarSrc: AVATARS[(idx + 1) % AVATARS.length].src,
                        };
                      });
                    })()}
                    liveInput={demoLiveInput}
                    clayMode={clayMode}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col sm:hidden min-h-0">
                  <div className="flex-[3] min-h-0 flex">
                    {isRealMode ? (
                      <ActivePlayerPanel
                        color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                        input={typedWord} setInput={handleSetInput}
                        onClaim={handleSubmitWord}
                        words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                        score={realScores[effectivePlayerId] || 0}
                        hearts={myHearts}
                        playerLabel={playerName || "You"}
                        avatarSrc={AVATARS[0].src}
                        clayMode={clayMode}
                        letters={letters}
                        submitting={isSubmitting}
                        submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                      />
                    ) : (
                      <ActivePlayerPanel
                        color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                        input={demoActiveInput} setInput={setActiveInput}
                        onClaim={handleDemoClaim}
                        words={demoAllWords[activePlayer]}
                        score={demoScores[activePlayer]}
                        hearts={demoHearts[activePlayer]}
                        playerLabel={`P${activePlayer + 1}`}
                        avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                        clayMode={clayMode}
                        letters={DEMO_LETTERS}
                      />
                    )}
                  </div>
                  <div className="flex-[2] min-h-0 overflow-y-auto hide-scrollbar border-t border-warm-gray/10">
                    <div className="flex flex-col min-h-0">
                      {(isRealMode ? otherPlayers : opponentIndices).map((op: any) => {
                        const idx = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : op;
                        const pid = isRealMode ? op.id : `demo-${op}`;
                        return (
                          <div key={pid} className="flex-shrink-0 min-h-[130px] flex border-b border-warm-gray/10 last:border-b-0">
                            {isRealMode ? (
                              <OpponentPanel
                                color={getPlayerColorByName(pid, realPlayers)}
                                playerLabel={op.name || "Opponent"}
                                avatarSrc={AVATARS[(idx + 1) % AVATARS.length].src}
                                score={realScores[pid] || 0}
                                hearts={playerHearts[pid] ?? 3}
                                words={opponentClaimedWords.filter(w => w.player_id === pid).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                                liveInput={typedWord}
                                playerLetter={playerLettersState[pid] || ""}
                      timerSeconds={getOpponentTimer(pid)}
                                clayMode={clayMode}
                              />
                            ) : (
                              <OpponentPanel
                                color={PLAYER_COLORS[demoAllColors[idx]]}
                                playerLabel={`P${idx + 1}`}
                                avatarSrc={AVATARS[idx % AVATARS.length].src}
                                score={demoScores[idx]}
                                hearts={demoHearts[idx]}
                                words={demoAllWords[idx]}
                                liveInput={demoLiveInput}
                                playerLetter={DEMO_LETTERS[idx % DEMO_LETTERS.length]}
                                clayMode={clayMode}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:grid sm:grid-cols-2 flex-1 min-h-0">
                  {Array.from({ length: effectivePlayerCount }).map((_, i) => {
                    const isLeftCol = i % 2 === 0;
                    const isTopRow = i < 2;
                    const borderClass = [
                      i > 0 ? "border-t sm:border-t-0 border-warm-gray/10" : "",
                      isLeftCol && i < effectivePlayerCount - 1 ? "sm:border-r border-warm-gray/10" : "",
                      !isTopRow ? "sm:border-t border-warm-gray/10" : "",
                    ].filter(Boolean).join(" ");
                    const pid = isRealMode ? (realPlayers[i]?.id) : `demo-${i}`;
                    const isMe = isRealMode && realPlayers[i]?.id === effectivePlayerId;

                    return (
                      <div key={i} className={`min-h-[200px] flex overflow-hidden ${borderClass}`}>
                        {isMe ? (
                          <ActivePlayerPanel
                            color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                            input={typedWord} setInput={handleSetInput}
                            onClaim={handleSubmitWord}
                            words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                            score={realScores[effectivePlayerId] || 0}
                            hearts={myHearts}
                            playerLabel={playerName || "You"}
                            avatarSrc={AVATARS[i % AVATARS.length].src}
                            clayMode={clayMode}
                            letters={letters}
                            submitting={isSubmitting}
                            submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                          />
                        ) : isRealMode ? (
                          <OpponentPanel
                            color={getPlayerColorByName(realPlayers[i]?.id, realPlayers)}
                            playerLabel={realPlayers[i]?.name || "Opponent"}
                            avatarSrc={AVATARS[(i + 1) % AVATARS.length].src}
                            score={realScores[realPlayers[i]?.id] || 0}
                            hearts={playerHearts[realPlayers[i]?.id] ?? 3}
                            words={opponentClaimedWords.filter(w => w.player_id === realPlayers[i]?.id).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                            liveInput={typedWord}
                            playerLetter={playerLettersState[realPlayers[i]?.id] || ""}
                      timerSeconds={getOpponentTimer(realPlayers[i]?.id || "")}
                            clayMode={clayMode}
                          />
                        ) : (
                          <>
                            {i === activePlayer ? (
                              <ActivePlayerPanel
                                color={PLAYER_COLORS[demoAllColors[i]]}
                                input={demoAllInputsMemo[i]} setInput={setActiveInput}
                                onClaim={handleDemoClaim}
                                words={demoAllWords[i]}
                                score={demoScores[i]}
                                hearts={demoHearts[i]}
                                playerLabel={`P${i + 1}`}
                                avatarSrc={AVATARS[i % AVATARS.length].src}
                                clayMode={clayMode}
                                letters={DEMO_LETTERS}
                              />
                            ) : (
                              <OpponentPanel
                                color={PLAYER_COLORS[demoAllColors[i]]}
                                playerLabel={`P${i + 1}`}
                                avatarSrc={AVATARS[i % AVATARS.length].src}
                                score={demoScores[i]}
                                hearts={demoHearts[i]}
                                words={demoAllWords[i]}
                                liveInput={demoLiveInput}
                                playerLetter={DEMO_LETTERS[i % DEMO_LETTERS.length]}
                                clayMode={clayMode}
                              />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ))}

            {/* 5 PLAYERS */}
            {effectivePlayerCount === 5 && (leaderboardMode ? (
              <div className="flex-1 flex flex-col md:flex-row min-h-0">
                <div className="flex-[3] md:flex-[11] min-h-0 flex">
                  {isRealMode ? (
                    <ActivePlayerPanel
                      color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                      input={typedWord} setInput={handleSetInput}
                      onClaim={handleSubmitWord}
                      words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                      score={realScores[effectivePlayerId] || 0}
                      hearts={myHearts}
                      playerLabel={playerName || "You"}
                      avatarSrc={AVATARS[0].src}
                      clayMode={clayMode}
                      letters={letters}
                      submitting={isSubmitting}
                      submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                    />
                  ) : (
                    <ActivePlayerPanel
                      color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                      input={demoActiveInput} setInput={setActiveInput}
                      onClaim={handleDemoClaim}
                      words={demoAllWords[activePlayer]}
                      score={demoScores[activePlayer]}
                      hearts={demoHearts[activePlayer]}
                      playerLabel={`P${activePlayer + 1}`}
                      avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                      clayMode={clayMode}
                      letters={DEMO_LETTERS}
                    />
                  )}
                </div>
                <div className="h-[3px] md:hidden bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                <div className="flex-[2] md:flex-[9] min-h-0 flex">
                  <OpponentLeaderboard
                    opponents={(() => {
                      const opps = isRealMode ? otherPlayers : opponentIndices;
                      return opps.map((op: any) => {
                        const idx = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : op;
                        const pid = isRealMode ? op.id : `demo-${op}`;
                        return {
                          index: idx,
                          label: isRealMode ? (op.name || "Opponent") : `P${idx + 1}`,
                          score: isRealMode ? (realScores[pid] || 0) : demoScores[idx],
                          hearts: isRealMode ? (playerHearts[pid] ?? 3) : demoHearts[idx],
                          wordCount: isRealMode ? (opponentClaimedWords.filter(w => w.player_id === pid).length) : (demoAllWords[idx]?.length || 0),
                          words: isRealMode ? opponentClaimedWords.filter(w => w.player_id === pid).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) })) : (demoAllWords[idx] || []),
                          color: isRealMode ? getPlayerColorByName(pid, realPlayers) : PLAYER_COLORS[demoAllColors[idx]],
                          avatarSrc: AVATARS[(idx + 1) % AVATARS.length].src,
                        };
                      });
                    })()}
                    liveInput={demoLiveInput}
                    clayMode={clayMode}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col sm:hidden min-h-0">
                  <div className="flex-[3] min-h-0 flex">
                    {isRealMode ? (
                      <ActivePlayerPanel
                        color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                        input={typedWord} setInput={handleSetInput}
                        onClaim={handleSubmitWord}
                        words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                        score={realScores[effectivePlayerId] || 0}
                        hearts={myHearts}
                        playerLabel={playerName || "You"}
                        avatarSrc={AVATARS[0].src}
                        clayMode={clayMode}
                        letters={letters}
                        submitting={isSubmitting}
                        submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                      />
                    ) : (
                      <ActivePlayerPanel
                        color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                        input={demoActiveInput} setInput={setActiveInput}
                        onClaim={handleDemoClaim}
                        words={demoAllWords[activePlayer]}
                        score={demoScores[activePlayer]}
                        hearts={demoHearts[activePlayer]}
                        playerLabel={`P${activePlayer + 1}`}
                        avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                        clayMode={clayMode}
                        letters={DEMO_LETTERS}
                      />
                    )}
                  </div>
                  <div className="flex-[2] min-h-0 overflow-y-auto hide-scrollbar border-t border-warm-gray/10">
                    <div className="flex flex-col min-h-0">
                      {(isRealMode ? otherPlayers : opponentIndices).map((op: any) => {
                        const idx = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : op;
                        const pid = isRealMode ? op.id : `demo-${op}`;
                        return (
                          <div key={pid} className="flex-shrink-0 min-h-[130px] flex border-b border-warm-gray/10 last:border-b-0">
                            {isRealMode ? (
                              <OpponentPanel
                                color={getPlayerColorByName(pid, realPlayers)}
                                playerLabel={op.name || "Opponent"}
                                avatarSrc={AVATARS[(idx + 1) % AVATARS.length].src}
                                score={realScores[pid] || 0}
                                hearts={playerHearts[pid] ?? 3}
                                words={opponentClaimedWords.filter(w => w.player_id === pid).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                                liveInput={typedWord}
                                playerLetter={playerLettersState[pid] || ""}
                      timerSeconds={getOpponentTimer(pid)}
                                clayMode={clayMode}
                              />
                            ) : (
                              <OpponentPanel
                                color={PLAYER_COLORS[demoAllColors[idx]]}
                                playerLabel={`P${idx + 1}`}
                                avatarSrc={AVATARS[idx % AVATARS.length].src}
                                score={demoScores[idx]}
                                hearts={demoHearts[idx]}
                                words={demoAllWords[idx]}
                                liveInput={demoLiveInput}
                                playerLetter={DEMO_LETTERS[idx % DEMO_LETTERS.length]}
                                clayMode={clayMode}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex sm:flex-row flex-1 min-h-0">
                  <div className="flex-[1.1] min-h-0 flex">
                    {isRealMode ? (
                      <ActivePlayerPanel
                        color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                        input={typedWord} setInput={handleSetInput}
                        onClaim={handleSubmitWord}
                        words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                        score={realScores[effectivePlayerId] || 0}
                        hearts={myHearts}
                        playerLabel={playerName || "You"}
                        avatarSrc={AVATARS[0].src}
                        clayMode={clayMode}
                        letters={letters}
                        submitting={isSubmitting}
                        submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                      />
                    ) : (
                      <ActivePlayerPanel
                        color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                        input={demoActiveInput} setInput={setActiveInput}
                        onClaim={handleDemoClaim}
                        words={demoAllWords[activePlayer]}
                        score={demoScores[activePlayer]}
                        hearts={demoHearts[activePlayer]}
                        playerLabel={`P${activePlayer + 1}`}
                        avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                        clayMode={clayMode}
                        letters={DEMO_LETTERS}
                      />
                    )}
                  </div>
                  <div className="w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                  <div className="flex-1 min-h-0 grid grid-cols-2">
                    {(isRealMode ? otherPlayers : opponentIndices).map((op: any, idx: number) => {
                      const oi = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : opponentIndices[idx];
                      const pid = isRealMode ? op.id : `demo-${oi}`;
                      const borderClass = [
                        idx > 1 ? "border-t border-warm-gray/10" : "",
                        idx % 2 === 0 && idx < (isRealMode ? otherPlayers.length : opponentIndices.length) - 1 ? "border-r border-warm-gray/10" : "",
                      ].filter(Boolean).join(" ");
                      return (
                        <div key={pid} className={`min-h-[160px] flex overflow-hidden ${borderClass}`}>
                          {isRealMode ? (
                            <OpponentPanel
                              color={getPlayerColorByName(pid, realPlayers)}
                              playerLabel={op.name || "Opponent"}
                              avatarSrc={AVATARS[(oi + 1) % AVATARS.length].src}
                              score={realScores[pid] || 0}
                              hearts={playerHearts[pid] ?? 3}
                              words={opponentClaimedWords.filter(w => w.player_id === pid).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                              liveInput={typedWord}
                              playerLetter={playerLettersState[pid] || ""}
                      timerSeconds={getOpponentTimer(pid)}
                              clayMode={clayMode}
                            />
                          ) : (
                            <OpponentPanel
                              color={PLAYER_COLORS[demoAllColors[oi]]}
                              playerLabel={`P${oi + 1}`}
                              avatarSrc={AVATARS[oi % AVATARS.length].src}
                              score={demoScores[oi]}
                              hearts={demoHearts[oi]}
                              words={demoAllWords[oi]}
                              liveInput={demoLiveInput}
                              playerLetter={DEMO_LETTERS[oi % DEMO_LETTERS.length]}
                              clayMode={clayMode}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ))}

            {/* 6 PLAYERS */}
            {effectivePlayerCount === 6 && (leaderboardMode ? (
              <div className="flex-1 flex flex-col md:flex-row min-h-0">
                <div className="flex-[5] md:flex-[11] min-h-0 flex">
                  {isRealMode ? (
                    <ActivePlayerPanel
                      color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                      input={typedWord} setInput={handleSetInput}
                      onClaim={handleSubmitWord}
                      words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                      score={realScores[effectivePlayerId] || 0}
                      hearts={myHearts}
                      playerLabel={playerName || "You"}
                      avatarSrc={AVATARS[0].src}
                      clayMode={clayMode}
                      letters={letters}
                      submitting={isSubmitting}
                      submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                    />
                  ) : (
                    <ActivePlayerPanel
                      color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                      input={demoActiveInput} setInput={setActiveInput}
                      onClaim={handleDemoClaim}
                      words={demoAllWords[activePlayer]}
                      score={demoScores[activePlayer]}
                      hearts={demoHearts[activePlayer]}
                      playerLabel={`P${activePlayer + 1}`}
                      avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                      clayMode={clayMode}
                      letters={DEMO_LETTERS}
                    />
                  )}
                </div>
                <div className="h-[3px] md:hidden bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                <div className="flex-[4] md:flex-[9] min-h-0 flex">
                  <OpponentLeaderboard
                    opponents={(() => {
                      const opps = isRealMode ? otherPlayers : opponentIndices;
                      return opps.map((op: any) => {
                        const idx = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : op;
                        const pid = isRealMode ? op.id : `demo-${op}`;
                        return {
                          index: idx,
                          label: isRealMode ? (op.name || "Opponent") : `P${idx + 1}`,
                          score: isRealMode ? (realScores[pid] || 0) : demoScores[idx],
                          hearts: isRealMode ? (playerHearts[pid] ?? 3) : demoHearts[idx],
                          wordCount: isRealMode ? (opponentClaimedWords.filter(w => w.player_id === pid).length) : (demoAllWords[idx]?.length || 0),
                          words: isRealMode ? opponentClaimedWords.filter(w => w.player_id === pid).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) })) : (demoAllWords[idx] || []),
                          color: isRealMode ? getPlayerColorByName(pid, realPlayers) : PLAYER_COLORS[demoAllColors[idx]],
                          avatarSrc: AVATARS[(idx + 1) % AVATARS.length].src,
                        };
                      });
                    })()}
                    liveInput={demoLiveInput}
                    clayMode={clayMode}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col sm:hidden min-h-0">
                  <div className="flex-[3] min-h-0 flex">
                    {isRealMode ? (
                      <ActivePlayerPanel
                        color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                        input={typedWord} setInput={handleSetInput}
                        onClaim={handleSubmitWord}
                        words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                        score={realScores[effectivePlayerId] || 0}
                        hearts={myHearts}
                        playerLabel={playerName || "You"}
                        avatarSrc={AVATARS[0].src}
                        clayMode={clayMode}
                        letters={letters}
                        submitting={isSubmitting}
                        submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                      />
                    ) : (
                      <ActivePlayerPanel
                        color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                        input={demoActiveInput} setInput={setActiveInput}
                        onClaim={handleDemoClaim}
                        words={demoAllWords[activePlayer]}
                        score={demoScores[activePlayer]}
                        hearts={demoHearts[activePlayer]}
                        playerLabel={`P${activePlayer + 1}`}
                        avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                        clayMode={clayMode}
                        letters={DEMO_LETTERS}
                      />
                    )}
                  </div>
                  <div className="flex-[2] min-h-0 overflow-y-auto hide-scrollbar border-t border-warm-gray/10">
                    <div className="flex flex-col min-h-0">
                      {(isRealMode ? otherPlayers : opponentIndices).map((op: any) => {
                        const idx = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : op;
                        const pid = isRealMode ? op.id : `demo-${op}`;
                        return (
                          <div key={pid} className="flex-shrink-0 min-h-[130px] flex border-b border-warm-gray/10 last:border-b-0">
                            {isRealMode ? (
                              <OpponentPanel
                                color={getPlayerColorByName(pid, realPlayers)}
                                playerLabel={op.name || "Opponent"}
                                avatarSrc={AVATARS[(idx + 1) % AVATARS.length].src}
                                score={realScores[pid] || 0}
                                hearts={playerHearts[pid] ?? 3}
                                words={opponentClaimedWords.filter(w => w.player_id === pid).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                                liveInput={typedWord}
                                playerLetter={playerLettersState[pid] || ""}
                      timerSeconds={getOpponentTimer(pid)}
                                clayMode={clayMode}
                              />
                            ) : (
                              <OpponentPanel
                                color={PLAYER_COLORS[demoAllColors[idx]]}
                                playerLabel={`P${idx + 1}`}
                                avatarSrc={AVATARS[idx % AVATARS.length].src}
                                score={demoScores[idx]}
                                hearts={demoHearts[idx]}
                                words={demoAllWords[idx]}
                                liveInput={demoLiveInput}
                                playerLetter={DEMO_LETTERS[idx % DEMO_LETTERS.length]}
                                clayMode={clayMode}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex sm:flex-row flex-1 min-h-0">
                  <div className="flex-[1.1] min-h-0 flex">
                    {isRealMode ? (
                      <ActivePlayerPanel
                        color={getPlayerColorByName(effectivePlayerId, realPlayers)}
                        input={typedWord} setInput={handleSetInput}
                        onClaim={handleSubmitWord}
                        words={myWords.map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                        score={realScores[effectivePlayerId] || 0}
                        hearts={myHearts}
                        playerLabel={playerName || "You"}
                        avatarSrc={AVATARS[0].src}
                        clayMode={clayMode}
                        letters={letters}
                        submitting={isSubmitting}
                        submitStatus={submitStatus}
                      timerSeconds={myTimerSeconds} timerTotal={roundDuration} poisonWarning={poisonWarning} wordFeedback={wordFeedback} shakeKey={shakeKey} eliminated={myHearts <= 0}
                      />
                    ) : (
                      <ActivePlayerPanel
                        color={PLAYER_COLORS[demoAllColors[activePlayer]]}
                        input={demoActiveInput} setInput={setActiveInput}
                        onClaim={handleDemoClaim}
                        words={demoAllWords[activePlayer]}
                        score={demoScores[activePlayer]}
                        hearts={demoHearts[activePlayer]}
                        playerLabel={`P${activePlayer + 1}`}
                        avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
                        clayMode={clayMode}
                        letters={DEMO_LETTERS}
                      />
                    )}
                  </div>
                  <div className="w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                  <div className="flex-1 min-h-0 grid grid-cols-2 auto-rows-fr">
                    {(isRealMode ? otherPlayers : opponentIndices).map((op: any, idx: number) => {
                      const oi = isRealMode ? realPlayers.findIndex((p: any) => p.id === op.id) : opponentIndices[idx];
                      const pid = isRealMode ? op.id : `demo-${oi}`;
                      const isLast = idx === (isRealMode ? otherPlayers.length : opponentIndices.length) - 1;
                      const borderClass = [
                        idx > 1 && !isLast ? "border-t border-warm-gray/10" : "",
                        idx % 2 === 0 && idx < (isRealMode ? otherPlayers.length : opponentIndices.length) - 1 && !isLast ? "border-r border-warm-gray/10" : "",
                      ].filter(Boolean).join(" ");
                      return (
                        <div key={pid} className={`min-h-[160px] flex overflow-hidden ${borderClass} ${isLast ? "col-span-2 max-w-[70%] mx-auto w-full" : ""}`}>
                          {isRealMode ? (
                            <OpponentPanel
                              color={getPlayerColorByName(pid, realPlayers)}
                              playerLabel={op.name || "Opponent"}
                              avatarSrc={AVATARS[(oi + 1) % AVATARS.length].src}
                              score={realScores[pid] || 0}
                              hearts={playerHearts[pid] ?? 3}
                              words={opponentClaimedWords.filter(w => w.player_id === pid).map(w => ({ id: w.id, word: w.word, points: w.points, isPoisoned: w.is_poisoned, claimedAt: new Date(w.created_at) }))}
                              liveInput={typedWord}
                              playerLetter={playerLettersState[pid] || ""}
                      timerSeconds={getOpponentTimer(pid)}
                              clayMode={clayMode}
                            />
                          ) : (
                            <OpponentPanel
                              color={PLAYER_COLORS[demoAllColors[oi]]}
                              playerLabel={`P${oi + 1}`}
                              avatarSrc={AVATARS[oi % AVATARS.length].src}
                              score={demoScores[oi]}
                              hearts={demoHearts[oi]}
                              words={demoAllWords[oi]}
                              liveInput={demoLiveInput}
                              playerLetter={DEMO_LETTERS[oi % DEMO_LETTERS.length]}
                              clayMode={clayMode}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ))}
          </>
        )}
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 bg-warm-white/90 backdrop-blur-md border-t border-warm-gray/10 flex items-center justify-between text-[10px] text-plum/25 font-bold z-20">
        <span>Required: {letters.join(" + ") || "—"}</span>
        <span>{phase === "PLAYING" ? `⏱ ${claimedWords.length} word${claimedWords.length !== 1 ? "s" : ""} claimed` : `📋 ${claimedWords.length} words claimed`}</span>
        {!isRealMode && <span>Active: P{activePlayer + 1} of {effectivePlayerCount}</span>}
      </div>
    </div>
  );
}
