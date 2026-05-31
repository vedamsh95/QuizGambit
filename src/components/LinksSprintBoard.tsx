import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { Zap, Sparkles, ArrowLeft, Clock, Trophy, Target, Wifi, WifiOff, ChevronRight, Shuffle, RotateCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { AVATARS } from "../assets/avatars";

// ── Letter Sets (precomputed difficulty tiers) ──────────────────────────────
interface LetterSet {
  letters: string[];
  wordCount: number;
}
interface LetterSetsTiers {
  easy: LetterSet[];
  medium: LetterSet[];
  hard: LetterSet[];
  expert: LetterSet[];
  master: LetterSet[];
  _meta: any;
}
let letterSetsCache: LetterSetsTiers | null = null;
async function loadLetterSets(): Promise<LetterSetsTiers> {
  if (letterSetsCache) return letterSetsCache;
  const resp = await fetch("/words/letter_sets.json");
  letterSetsCache = await resp.json();
  return letterSetsCache!;
}
const WAVE_TIER: Record<number, keyof LetterSetsTiers> = {
  1: "easy",
  2: "medium",
  3: "hard",
  4: "expert",
  5: "master",
};

// ── Word file cache (avoid re-fetching same letter's word list) ─────────────
const wordFileCache = new Map<string, string[]>();
async function fetchWordFile(letter: string): Promise<string[]> {
  const key = letter.toLowerCase();
  if (wordFileCache.has(key)) return wordFileCache.get(key)!;
  try {
    const resp = await fetch(`/words/by_letter/${key}.json`);
    if (!resp.ok) return [];
    const words: string[] = await resp.json();
    wordFileCache.set(key, words);
    return words;
  } catch {
    return [];
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface PlayerColor {
  name: string;
  label: string;
  fill: string;
  fillLight: string;
  pillBg: string;
  pillBorder: string;
  mutedText: string;
}

interface SprintWord {
  id: string;
  player_id: string;
  player_name: string;
  word: string;
  word_length: number;
  points: number;
  is_target: boolean;
  target_level: number | null;
  wave: number;
  created_at: string;
}

interface TargetWord {
  word: string;
  level: number;
  bonus: number;
  label: string;
}

interface LinksSprintBoardProps {
  code: string;
  playerId: string;
  playerName: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

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

const TARGET_LEVELS: Record<number, TargetWord> = {
  1: { word: "", level: 1, bonus: 100, label: "Common" },
  2: { word: "", level: 2, bonus: 200, label: "Uncommon" },
  3: { word: "", level: 3, bonus: 350, label: "Rare" },
  4: { word: "", level: 4, bonus: 500, label: "Epic" },
  5: { word: "", level: 5, bonus: 750, label: "Legendary" },
};

const LEVEL_COLORS: Record<number, string> = {
  1: "#A8A8A8",
  2: "#34D399",
  3: "#60A5FA",
  4: "#A78BFA",
  5: "#FBBF24",
};

const LEVEL_GLOW: Record<number, string> = {
  1: "0 0 8px rgba(168,168,168,0.3)",
  2: "0 0 12px rgba(52,211,153,0.4)",
  3: "0 0 16px rgba(96,165,250,0.5)",
  4: "0 0 20px rgba(167,139,250,0.5)",
  5: "0 0 24px rgba(251,191,36,0.6)",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const calcPoints = (length: number) =>
  length <= 4 ? 10 * length : length <= 6 ? 15 * length : length <= 8 ? 20 * length : 30 * length;

const needsDarkText = (fill: string) => fill === "#FBBF24" || fill === "#2DD4BF";

const clayShadow = (fill: string) =>
  `6px 6px 20px ${fill}38, inset 1px 1px 0px rgba(255,255,255,0.30), inset -1px -1px 0px rgba(0,0,0,0.10)`;

const clayShadowElevated = (fill: string) =>
  `4px 4px 14px ${fill}4D, inset 1px 1px 0px rgba(255,255,255,0.35), inset -1px -1px 0px rgba(0,0,0,0.08)`;

function parseArenaState(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "string") {
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

// ── AvatarIcon ──────────────────────────────────────────────────────────────

const AvatarIcon = memo(function AvatarIcon({ src, size }: { src: string; size: string }) {
  return <img src={src} alt="" className="block" style={{ width: size, height: size }} />;
});

// ── WaveIntroPhase ──────────────────────────────────────────────────────────

const WaveIntroPhase = memo(function WaveIntroPhase({
  wave,
  totalWaves,
  letters,
  countdown,
  playerCount,
}: {
  wave: number;
  totalWaves: number;
  letters: string[];
  countdown: number;
  playerCount: number;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8 overflow-y-auto">
      {/* Wave badge */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-mint-light text-mint border border-mint/20">
          <Zap className="w-4 h-4" />
          <span className="text-sm font-black uppercase tracking-widest">Wave {wave} of {totalWaves}</span>
        </div>
        <h1 className="font-outfit font-black text-4xl text-plum mt-4">Get Ready!</h1>
        <p className="text-sm text-warm-gray/60 max-w-sm">
          {playerCount} players · Type words containing ALL letters below
        </p>
      </div>

      {/* Countdown */}
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-warm-gray/10" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="#34D399" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 42}
            strokeDashoffset={2 * Math.PI * 42 * (1 - countdown / 3)}
            className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono font-black text-3xl text-mint tabular-nums">{countdown}</span>
        </div>
      </div>

      {/* Letters */}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        {letters.map((l) => (
          <span key={l} className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-2xl font-outfit font-black shadow-lg animate-clay-pop"
            style={{ backgroundColor: "#34D399", color: "#fff", boxShadow: "0 6px 24px rgba(52,211,153,0.35)" }}>
            {l}
          </span>
        ))}
      </div>

      <p className="text-xs text-warm-gray/50 font-bold">Every word must contain {letters.join(" + ")}</p>
    </div>
  );
});

// ── SprintPlayerPanel (active player) ───────────────────────────────────────

const SprintPlayerPanel = memo(function SprintPlayerPanel({
  color,
  input,
  setInput,
  onClaim,
  words,
  score,
  playerLabel,
  avatarSrc,
  letters,
  submitting,
  submitStatus,
  timerSeconds = 0,
  timerTotal = 30,
  wordFeedback = null,
  shakeKey = 0,
  targetHitFlash = null,
  shuffleAllCount = 0,
  shuffleSingleCount = 0,
  onShuffleAll,
  onShuffleSingle,
  shufflePenaltyFlash = null,
}: {
  color: PlayerColor;
  input: string;
  setInput: (v: string) => void;
  onClaim: (word: string) => void;
  words: SprintWord[];
  score: number;
  playerLabel: string;
  avatarSrc: string;
  letters: string[];
  submitting?: boolean;
  submitStatus?: string | null;
  timerSeconds?: number;
  timerTotal?: number;
  wordFeedback?: { type: string; message?: string } | null;
  shakeKey?: number;
  targetHitFlash?: { word: string; level: number } | null;
  shuffleAllCount?: number;
  shuffleSingleCount?: number;
  onShuffleAll?: () => void;
  onShuffleSingle?: (index: number) => void;
  shufflePenaltyFlash?: { message: string; type: "warning" | "danger" } | null;
}) {
  // ── Soft theme (like classic Links mode) ───────────────────────────
  const clayText = "#1A1530";
  const clayOverlay = "rgba(26,21,48,0.06)";
  const clayOverlayStrong = "rgba(26,21,48,0.12)";
  const clayOverlayBorder = "rgba(26,21,48,0.10)";
  const clayMuted = "rgba(26,21,48,0.45)";

  const textColor = clayText;
  const textMuted = clayMuted;

  const bgStyle = {
    background: color.fillLight,
    boxShadow: `4px 4px 16px rgba(26,21,48,0.08), inset 1px 1px 0px rgba(255,255,255,0.60), inset -1px -1px 0px rgba(0,0,0,0.05)`,
    border: `1.5px solid ${color.pillBorder}`,
  };

  const pillBg = "#FFFFFF";
  const pillBorder = color.pillBorder;
  const pillText = color.fill;

  const letterActiveBg = color.fillLight;
  const letterActiveText = color.fill;
  const letterInactiveBg = "rgba(26,21,48,0.05)";
  const letterInactiveText = "rgba(26,21,48,0.18)";

  const needsDark = needsDarkText(color.fill);

  const claimBg = color.fill;
  const claimText = "#FFFFFF";

  const wordPillBg = "rgba(255,255,255,0.80)";
  const wordPillBorder = color.pillBorder;
  const wordPillText = color.fill;

  // ── Timer (centered, bigger, tension animation) ────────────────────
  const TIMER_CIRC = 2 * Math.PI * 38;
  const timerPercent = timerTotal > 0 ? (timerSeconds / timerTotal) * 100 : 100;
  const timerCritical = timerSeconds <= 5;
  const timerUrgent = timerSeconds <= 10 && !timerCritical;
  const timerStrokeColor = timerCritical ? "#FF6B8A" : timerUrgent ? "#FBBF24" : "#7C5CFC";
  const timerBgTrack = "rgba(26,21,48,0.06)";

  const canClaim = input.trim().length >= 3 && !submitting;
  const isUsed = wordFeedback?.type === "used";

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden min-h-0" style={bgStyle}>
      {/* Top highlight line */}
      <div className="absolute top-0 left-4 right-4 h-[1px] pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.40), transparent)" }} />

      {/* Target hit flash */}
      {targetHitFlash && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 animate-slide-up-fade">
          <div className="px-5 py-2.5 rounded-2xl border-2 shadow-2xl flex items-center gap-2"
            style={{ backgroundColor: LEVEL_COLORS[targetHitFlash.level] + "20", borderColor: LEVEL_COLORS[targetHitFlash.level], boxShadow: LEVEL_GLOW[targetHitFlash.level] }}>
            <Target className="w-4 h-4" style={{ color: LEVEL_COLORS[targetHitFlash.level] }} />
            <span className="text-sm font-black" style={{ color: LEVEL_COLORS[targetHitFlash.level] }}>
              TARGET! +{TARGET_LEVELS[targetHitFlash.level]?.bonus || 0}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="relative shrink-0 z-10 px-4 sm:px-6 pt-4 pb-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-center rounded-full flex-shrink-0 shadow-lg overflow-hidden"
              style={{ background: color.fill, width: "2.25rem", height: "2.25rem", boxShadow: `0 4px 14px ${color.fill}80` }}>
              <AvatarIcon src={avatarSrc} size="1.35rem" />
            </div>
            <div>
              <p className="font-outfit font-black text-sm sm:text-base leading-none truncate" style={{ color: textColor }}>{playerLabel}</p>
              <p className="text-[9px] font-bold" style={{ color: textMuted }}>⚡ SPRINTING</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Score pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm"
              style={{ backgroundColor: pillBg, borderColor: pillBorder }}>
              <Zap className="w-3.5 h-3.5" style={{ color: pillText }} />
              <span className="font-mono font-black text-sm sm:text-base tabular-nums" style={{ color: pillText }}>{score}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Submit status flash */}
      {submitStatus && (
        <div className="relative z-10 px-4 sm:px-6">
          <div className={`text-center text-xs font-bold animate-clay-pop ${submitStatus.includes("+") ? "text-mint" : "text-peach"}`}>
            {submitStatus}
          </div>
        </div>
      )}

      {/* Input area */}
      <div key={shakeKey} className={`relative flex-1 flex flex-col items-center justify-center z-10 px-4 sm:px-8 gap-3 min-h-0 ${isUsed ? "animate-shake" : ""}`}>
        {/* "Already claimed" overlay */}
        {isUsed && wordFeedback?.message && (
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-center">
            <div className="px-5 py-2.5 rounded-2xl bg-peach-light border-2 border-peach/40 shadow-lg animate-slide-up-fade flex items-center gap-2">
              <span className="text-lg">😤</span>
              <span className="text-xs font-black text-peach">{wordFeedback.message}</span>
            </div>
          </div>
        )}

        {/* ── Timer: centered, big, tension animation ────────────── */}
        {timerTotal > 0 && timerSeconds > 0 && (
          <div className={`relative w-20 h-20 ${timerCritical ? "animate-pulse" : ""}`}>
            <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="38" fill="none" stroke={timerBgTrack} strokeWidth="5" />
              <circle cx="44" cy="44" r="38" fill="none" stroke={timerStrokeColor} strokeWidth="5" strokeLinecap="round"
                strokeDasharray={TIMER_CIRC}
                strokeDashoffset={TIMER_CIRC * (1 - timerPercent / 100)}
                className="transition-all duration-500"
                style={{ filter: timerCritical ? `drop-shadow(0 0 8px ${timerStrokeColor})` : timerUrgent ? `drop-shadow(0 0 4px ${timerStrokeColor})` : "none" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-mono font-black text-2xl tabular-nums leading-none ${
                timerCritical ? "text-peach animate-pulse" : timerUrgent ? "text-butter" : "text-soft-purple"
              }`}>{timerSeconds}</span>
              <span className={`text-[9px] font-bold uppercase tracking-widest ${
                timerCritical ? "text-peach/70" : timerUrgent ? "text-butter/70" : "text-warm-gray/40"
              }`}>SEC</span>
            </div>
          </div>
        )}

        {/* Letters */}
        <div className="flex items-center gap-2">
          {letters.map((l) => (
            <span key={l} className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-200"
              style={{
                backgroundColor: input.toLowerCase().includes(l.toLowerCase()) ? letterActiveBg : letterInactiveBg,
                color: input.toLowerCase().includes(l.toLowerCase()) ? letterActiveText : letterInactiveText,
                boxShadow: input.toLowerCase().includes(l.toLowerCase()) ? clayShadowElevated(color.fill) : "none",
                transform: input.toLowerCase().includes(l.toLowerCase()) ? "scale(1.08)" : "scale(1)",
              }}>{l}</span>
          ))}
        </div>

        {/* Word input */}
        <div className="w-full max-w-lg">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 15).toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && canClaim) onClaim(input.toUpperCase().trim()); }}
            placeholder="TYPE WORD..."
            className="w-full bg-transparent text-center font-outfit font-black outline-none placeholder:text-plum/15"
            style={{ fontSize: "clamp(2rem, 6vw, 4rem)", color: textColor, letterSpacing: "0.04em", lineHeight: 1.1, padding: "0.25rem 0", caretColor: textColor }}
            autoComplete="off" autoCapitalize="characters" spellCheck={false}
          />
          <div className="mx-auto rounded-full transition-all duration-300 mt-1" style={{
            height: "3px", width: input.length > 0 ? "60%" : "25%", maxWidth: "280px",
            backgroundColor: input.length > 0 ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.15)",
          }} />
        </div>

        {/* Claim button */}
        {canClaim && (
          <button onClick={() => onClaim(input.toUpperCase().trim())}
            className="px-8 py-3 rounded-2xl font-outfit font-black text-sm sm:text-base tracking-widest uppercase transition-all hover:scale-105 active:scale-95 animate-clay-pop"
            style={{ background: claimBg, color: claimText, boxShadow: "0 6px 24px rgba(0,0,0,0.20)" }}>
            ⚡ Claim +{calcPoints(input.length)}
          </button>
        )}

        {/* Shuffle buttons */}
        {onShuffleAll && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* Shuffle All */}
            <button
              onClick={onShuffleAll}
              title={shuffleAllCount === 0 ? "Shuffle all letters (-5s, -25% pts, forfeit target words)" : shuffleAllCount === 1 ? "Shuffle all letters (-5s, -50% pts, forfeit target words)" : `Shuffle all letters (-5s, -50% pts, forfeit target words) — ${shuffleAllCount} shuffles`}
              className="flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black border transition-all hover:scale-105 active:scale-95 hover:shadow-md"
              style={{
                backgroundColor: shuffleAllCount >= 1 ? "rgba(255,107,138,0.12)" : "rgba(255,255,255,0.60)",
                borderColor: shuffleAllCount >= 1 ? "rgba(255,107,138,0.40)" : clayOverlayBorder,
                color: clayText,
                boxShadow: shuffleAllCount >= 1 ? "0 2px 8px rgba(255,107,138,0.20)" : "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: shuffleAllCount >= 1 ? "#FF6B8A" : "#7C5CFC" }} />
              <span style={{ color: clayText }}>Shuffle All</span>
              <span className="font-black" style={{ color: shuffleAllCount >= 1 ? "#EF4444" : "#F59E0B", fontSize: "11px" }}>
                -5s {shuffleAllCount === 0 ? "-25%" : "-50%"}
              </span>
            </button>

            {/* Shuffle single letters */}
            {onShuffleSingle && letters.map((l, i) => (
              <button
                key={i}
                onClick={() => onShuffleSingle(i)}
                title={`Shuffle "${l}" (-3s, -25% pts, forfeit target words)`}
                className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all hover:scale-105 active:scale-95 hover:shadow-md"
                style={{
                  backgroundColor: "rgba(255,255,255,0.55)",
                  borderColor: clayOverlayBorder,
                  color: clayText,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                <RotateCw className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: "#7C5CFC" }} />
                <span style={{ color: clayText }}>{l}</span>
                <span className="font-black" style={{ color: "#F59E0B", fontSize: "10px" }}>-3s -25%</span>
              </button>
            ))}
          </div>
        )}

        {/* Penalty flash */}
        {shufflePenaltyFlash && (
          <div className={`px-3 py-1.5 rounded-xl text-[10px] font-bold animate-slide-up-fade ${
            shufflePenaltyFlash.type === "danger" ? "bg-peach-light text-peach border border-peach/30" : "bg-butter-light text-butter border border-butter/30"
          }`}>
            {shufflePenaltyFlash.message}
          </div>
        )}
      </div>

      {/* Word history */}
      <div className="relative shrink-0 z-10 px-3 sm:px-6 pb-4 overflow-hidden" style={{ maxHeight: "7rem" }}>
        {words.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 gap-1" style={{ opacity: 0.25 }}>
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
                    backgroundColor: w.is_target ? (LEVEL_COLORS[w.target_level || 1] + "25") : wordPillBg,
                    borderColor: w.is_target ? LEVEL_COLORS[w.target_level || 1] : wordPillBorder,
                    color: w.is_target ? LEVEL_COLORS[w.target_level || 1] : wordPillText,
                    boxShadow: w.is_target ? LEVEL_GLOW[w.target_level || 1] : clayShadowElevated(color.fill),
                  }}>
                  {w.word}
                  <span className="text-[8px] sm:text-[9px] font-mono opacity-50">+{w.points}</span>
                  {w.is_target && (
                    <Target className="w-2.5 h-2.5" style={{ color: LEVEL_COLORS[w.target_level || 1] }} />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ── SprintOpponentPanel ─────────────────────────────────────────────────────

const SprintOpponentPanel = memo(function SprintOpponentPanel({
  color,
  playerLabel,
  score,
  words,
  avatarSrc,
  timerSeconds,
  timerTotal = 60,
}: {
  color: PlayerColor;
  playerLabel: string;
  score: number;
  words: SprintWord[];
  avatarSrc: string;
  timerSeconds?: number;
  timerTotal?: number;
}) {
  const clayText = "#1A1530";
  const clayOverlay = "rgba(26,21,48,0.06)";
  const clayOverlayBorder = "rgba(26,21,48,0.10)";
  const clayMuted = "rgba(26,21,48,0.45)";

  const needsDark = needsDarkText(color.fill);
  const textColor = clayText;
  const textMuted = clayMuted;

  const bgStyle = {
    background: color.fillLight,
    boxShadow: `4px 4px 16px rgba(26,21,48,0.08), inset 1px 1px 0px rgba(255,255,255,0.60), inset -1px -1px 0px rgba(0,0,0,0.05)`,
    border: `1.5px solid ${color.pillBorder}`,
  };
  const wordPillBg = "rgba(255,255,255,0.70)";
  const wordPillBorder = color.pillBorder;
  const wordPillText = color.fill;

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden min-h-0" style={bgStyle}>
      <div className="absolute top-0 left-3 right-3 h-[1px] pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.40), transparent)" }} />

      {/* Header */}
      <div className="relative shrink-0 z-10 px-3 sm:px-4 pt-3 pb-2 flex items-center gap-2">
        <div className="flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden"
          style={{ background: color.fill, width: "2rem", height: "2rem", boxShadow: `0 3px 12px ${color.fill}80` }}>
          <AvatarIcon src={avatarSrc} size="1.15rem" />
        </div>
        <span className="font-outfit font-black text-sm sm:text-base truncate" style={{ color: textColor }}>{playerLabel}</span>
      </div>

      {/* Center: Timer + Score */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 sm:px-4 gap-3 min-h-0">
        {/* Timer ring (centered, tension animation) */}
        {timerSeconds !== undefined && timerSeconds > 0 && (
          <div className={`relative w-16 h-16 ${timerSeconds <= 5 ? "animate-pulse" : ""}`}>
            <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(26,21,48,0.06)" strokeWidth="4" />
              <circle cx="36" cy="36" r="30" fill="none"
                stroke={timerSeconds <= 5 ? "#FF6B8A" : timerSeconds <= 10 ? "#FBBF24" : "#7C5CFC"}
                strokeWidth="4" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 30}
                strokeDashoffset={2 * Math.PI * 30 * (1 - timerSeconds / (timerTotal || 60))}
                className="transition-all duration-500"
                style={{ filter: timerSeconds <= 5 ? "drop-shadow(0 0 6px #FF6B8A)" : timerSeconds <= 10 ? "drop-shadow(0 0 3px #FBBF24)" : "none" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-mono font-black text-lg tabular-nums leading-none ${
                timerSeconds <= 5 ? "text-peach" : timerSeconds <= 10 ? "text-butter" : "text-soft-purple"
              }`}>{timerSeconds}</span>
              <span className={`text-[8px] font-bold uppercase tracking-widest ${
                timerSeconds <= 5 ? "text-peach/70" : timerSeconds <= 10 ? "text-butter/70" : "text-warm-gray/40"
              }`}>SEC</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border shadow-lg"
          style={{ backgroundColor: "rgba(255,255,255,0.28)", borderColor: "rgba(255,255,255,0.30)", boxShadow: clayShadowElevated(color.fill) }}>
          <Zap className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: needsDark ? clayText : "#FFFFFF" }} />
          <span className="font-mono font-black text-2xl sm:text-3xl tabular-nums" style={{ color: needsDark ? clayText : "#FFFFFF" }}>{score}</span>
        </div>
        <p className="text-[10px] font-bold" style={{ color: textMuted, opacity: 0.5 }}>
          {words.length} word{words.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Word pills */}
      <div className="relative shrink-0 z-10 px-3 sm:px-4 overflow-hidden" style={{ maxHeight: "4.5rem" }}>
        <div className="overflow-y-auto max-h-full hide-scrollbar">
          {words.length === 0 ? (
            <p className="text-[10px] py-1.5 text-center" style={{ color: textMuted, opacity: 0.3 }}>No words yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 content-start">
              {words.map((w) => (
                <span key={w.id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold border"
                  style={{
                    backgroundColor: w.is_target ? (LEVEL_COLORS[w.target_level || 1] + "25") : wordPillBg,
                    borderColor: w.is_target ? LEVEL_COLORS[w.target_level || 1] : wordPillBorder,
                    color: w.is_target ? LEVEL_COLORS[w.target_level || 1] : wordPillText,
                    boxShadow: w.is_target ? LEVEL_GLOW[w.target_level || 1] : clayShadowElevated(color.fill),
                  }}>
                  {w.word}
                  <span className="text-[8px] sm:text-[9px] font-mono opacity-45">+{w.points}</span>
                  {w.is_target && <Target className="w-2.5 h-2.5" style={{ color: LEVEL_COLORS[w.target_level || 1] }} />}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── WaveResultsPhase ────────────────────────────────────────────────────────

const WaveResultsPhase = memo(function WaveResultsPhase({
  wave,
  totalWaves,
  players,
  allWords,
  targets,
  scores,
  playerColors,
  isHost,
  onNextWave,
  shuffleDeductions = {},
  isStartingWave,
}: {
  wave: number;
  totalWaves: number;
  players: any[];
  allWords: SprintWord[];
  targets: any[];
  scores: Record<string, number>;
  playerColors: Record<string, PlayerColor>;
  isHost: boolean;
  onNextWave: () => void;
  shuffleDeductions?: Record<string, number>;
  isStartingWave?: boolean;
}) {
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [waveTab, setWaveTab] = useState<"wave" | "all">("wave");

  const sorted = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const isLastWave = wave >= totalWaves;

  // Filter words by selected wave tab
  const filteredWords = waveTab === "wave"
    ? allWords.filter(w => w.wave === wave)
    : allWords;

  const toggleExpanded = (id: string) => {
    setExpandedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 gap-6 overflow-y-auto">
      {/* Wave complete header */}
      <div className="text-center space-y-2">
        <div className="text-4xl mb-2">🎯</div>
        <h1 className="font-outfit font-black text-3xl text-plum">Wave {wave} Complete!</h1>
        <p className="text-sm text-warm-gray/60">
          {isLastWave ? "Final wave finished!" : `Wave ${wave + 1} of ${totalWaves} coming up`}
        </p>
      </div>

      {/* Target words revealed */}
      <div className="w-full max-w-md space-y-2">
        <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest text-center">Target Words Revealed</h3>
        <div className="flex flex-wrap gap-2 justify-center">
          {targets.map((t: any, i: number) => {
            const level = t.level || 1;
            const wasHit = allWords.some(w => w.is_target && w.word.toLowerCase() === (t.word || "").toLowerCase());
            return (
              <span key={i} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                style={{
                  backgroundColor: wasHit ? LEVEL_COLORS[level] + "25" : "rgba(0,0,0,0.03)",
                  borderColor: wasHit ? LEVEL_COLORS[level] : "rgba(0,0,0,0.08)",
                  color: wasHit ? LEVEL_COLORS[level] : "#9CA3AF",
                  textDecoration: wasHit ? "none" : "line-through",
                  boxShadow: wasHit ? LEVEL_GLOW[level] : "none",
                }}>
                {wasHit ? "✓" : "✗"} {t.word || "???"}
                <span className="text-[9px] opacity-60">+{t.bonus || 0}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Per-wave tab selector */}
      <div className="w-full max-w-md">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-warm-gray/5 border border-warm-gray/10">
          <button onClick={() => setWaveTab("wave")}
            className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              waveTab === "wave" ? "bg-white shadow-sm text-plum" : "text-warm-gray/50 hover:text-warm-gray/70"
            }`}>
            Wave {wave}
          </button>
          <button onClick={() => setWaveTab("all")}
            className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              waveTab === "all" ? "bg-white shadow-sm text-plum" : "text-warm-gray/50 hover:text-warm-gray/70"
            }`}>
            All Waves
          </button>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="w-full max-w-md space-y-2">
        <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest text-center">
          {waveTab === "wave" ? "Standings" : "Overall Standings"}
        </h3>
        {sorted.map((p: any, idx: number) => {
          const c = playerColors[p.id] || PLAYER_COLORS[0];
          const pWords = filteredWords.filter(w => w.player_id === p.id);
          const score = scores[p.id] || 0;
          const rankIcons = ["👑", "🥈", "🥉"];
          const isExpanded = expandedPlayers.has(p.id);

          // ── Score breakdown ───────────────────────────────────────────
          const isAllTab = waveTab === "all";
          const totalWordPoints = filteredWords.filter(w => w.player_id === p.id).reduce((s, w) => s + w.points, 0);
          const dbPlayer = players.find(pl => pl.id === p.id);
          const shufflePenalty = isAllTab ? (shuffleDeductions[p.id] || 0) : 0;
          const actualScore = isAllTab ? (dbPlayer?.score ?? score) : totalWordPoints;
          const showBreakdown = isAllTab && shufflePenalty > 0;

          return (
            <div key={p.id} className="p-4 rounded-xl border transition-all"
              style={{
                backgroundColor: idx === 0 ? "#FEF3C7" : "#fff",
                borderColor: idx === 0 ? "#FCD34D" : "rgba(0,0,0,0.08)",
                boxShadow: idx === 0 ? "0 6px 20px rgba(251,191,36,0.25)" : "0 2px 8px rgba(0,0,0,0.04)",
              }}>
              {/* Main row: always visible */}
              <div
                className="flex items-center gap-3 cursor-pointer select-none"
                onClick={() => toggleExpanded(p.id)}
              >
                <span className="text-xl flex-shrink-0">{rankIcons[idx] || `#${idx + 1}`}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-outfit font-bold text-sm text-plum truncate">{p.name}</p>
                  <p className="text-[10px] text-warm-gray/50">{pWords.length} word{pWords.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-bold text-lg" style={{ color: c.fill }}>{actualScore}</p>
                    <p className="text-[9px] font-bold" style={{ color: c.mutedText }}>pts</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-warm-gray/40 transition-transform duration-300 ${
                    isExpanded ? "rotate-90" : ""
                  }`} />
                </div>
              </div>
              {/* Expandable breakdown: smooth max-height transition */}
              <div className="overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: isExpanded ? '60px' : '0',
                  opacity: isExpanded ? 1 : 0,
                  paddingTop: isExpanded ? '8px' : '0',
                }}>
                <div className="flex items-center gap-3 pl-8 text-[10px] font-bold">
                  <span className="text-mint">+{totalWordPoints} earned</span>
                  {showBreakdown && (
                    <span className="text-peach">-{shufflePenalty} penalty</span>
                  )}
                  <span className="text-warm-gray/40">=</span>
                  <span className="font-mono" style={{ color: c.fill }}>{actualScore}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Next wave / game over button */}
      {isHost && (
        <button
          onClick={onNextWave}
          disabled={isStartingWave}
          className="px-8 py-3 rounded-2xl font-outfit font-black text-sm text-white shadow-lg transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            backgroundColor: isLastWave ? "#7C5CFC" : "#34D399",
            boxShadow: isLastWave ? "0 6px 24px rgba(124,92,252,0.35)" : "0 6px 24px rgba(52,211,153,0.35)",
            transform: isStartingWave ? "scale(0.97)" : undefined,
          }}
        >
          {isStartingWave ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Starting...
            </>
          ) : (
            <>
              {isLastWave ? "View Final Results" : `Start Wave ${wave + 1}`}
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      )}
      {!isHost && (
        <p className="text-xs text-warm-gray/50 font-bold animate-pulse">Waiting for host...</p>
      )}
    </div>
  );
});

// ── GameOverScreen ───────────────────────────────────────────────────────────

const SprintGameOverScreen = memo(function SprintGameOverScreen({
  players,
  allWords,
  scores,
  targetReveals,
  playerColors,
  lobbyCode,
  onLeave,
  shuffleDeductions = {},
}: {
  players: any[];
  allWords: SprintWord[];
  scores: Record<string, number>;
  targetReveals: any[];
  playerColors: Record<string, PlayerColor>;
  lobbyCode: string;
  onLeave: () => void;
  shuffleDeductions?: Record<string, number>;
}) {
  const [waveTab, setWaveTab] = useState<number | "overall">("overall");

  // Derive available wave numbers from allWords
  const waveNumbers = useMemo(() => {
    const waves = new Set(allWords.map(w => w.wave));
    return Array.from(waves).sort((a, b) => a - b);
  }, [allWords]);

  // Filter words by selected wave tab
  const filteredWords = waveTab === "overall"
    ? allWords
    : allWords.filter(w => w.wave === waveTab);

  const sorted = [...players].sort((a: any, b: any) => {
    if (waveTab === "overall") return (scores[b.id] || 0) - (scores[a.id] || 0);
    const aPts = filteredWords.filter((w: SprintWord) => w.player_id === a.id).reduce((s: number, w: SprintWord) => s + w.points, 0);
    const bPts = filteredWords.filter((w: SprintWord) => w.player_id === b.id).reduce((s: number, w: SprintWord) => s + w.points, 0);
    return bPts - aPts;
  });

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80">
        <button onClick={onLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80">
          <ArrowLeft className="w-3.5 h-3.5" /> Leave
        </button>
        <span className="font-outfit font-black text-lg text-plum">⚡ LINKS SPRINT</span>
        <span className="text-[10px] font-mono text-warm-gray/50">{lobbyCode}</span>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 gap-6 overflow-y-auto">
        {/* Winner */}
        <div className="text-center space-y-2">
          <Trophy className="w-16 h-16 mx-auto text-butter" />
          <h1 className="font-outfit font-black text-3xl text-plum">Game Over!</h1>
          {sorted[0] && (
            <p className="text-lg font-bold" style={{ color: (playerColors[sorted[0].id] || PLAYER_COLORS[0]).fill }}>
              🏆 {sorted[0].name} wins!
            </p>
          )}
        </div>

        {/* Per-wave tab selector */}
        <div className="w-full max-w-md">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-warm-gray/5 border border-warm-gray/10">
            <button onClick={() => setWaveTab("overall")}
              className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                waveTab === "overall" ? "bg-white shadow-sm text-plum" : "text-warm-gray/50 hover:text-warm-gray/70"
              }`}>
              Overall
            </button>
            {waveNumbers.map(n => (
              <button key={n} onClick={() => setWaveTab(n)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  waveTab === n ? "bg-white shadow-sm text-plum" : "text-warm-gray/50 hover:text-warm-gray/70"
                }`}>
                Wave {n}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="w-full max-w-md space-y-2">
          <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest text-center">
            {waveTab === "overall" ? "Final Standings" : `Wave ${waveTab} Standings`}
          </h3>
          {sorted.map((p: any, idx: number) => {
            const c = playerColors[p.id] || PLAYER_COLORS[0];
            const pWords = filteredWords.filter((w: SprintWord) => w.player_id === p.id);
            const totalWordPoints = pWords.reduce((s: number, w: SprintWord) => s + w.points, 0);
            const dbPlayer = players.find(pl => pl.id === p.id);
            const isOverall = waveTab === "overall";
            const shufflePenalty = isOverall ? (shuffleDeductions[p.id] || 0) : 0;
            const actualScore = isOverall ? (dbPlayer?.score ?? totalWordPoints) : totalWordPoints;
            const showBreakdown = isOverall && shufflePenalty > 0;

            return (
              <div key={p.id} className="p-4 rounded-xl border"
                style={{
                  backgroundColor: idx === 0 ? "#FEF3C7" : "#fff",
                  borderColor: idx === 0 ? "#FCD34D" : "rgba(0,0,0,0.08)",
                  boxShadow: idx === 0 ? "0 6px 20px rgba(251,191,36,0.25)" : "0 2px 8px rgba(0,0,0,0.04)",
                }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}</span>
                  <div className="flex-1">
                    <p className="font-outfit font-bold text-sm text-plum">{p.name}</p>
                    <p className="text-[10px] text-warm-gray/50">{pWords.length} word{pWords.length !== 1 ? "s" : ""}</p>
                  </div>
                  <p className="font-mono font-bold text-lg" style={{ color: c.fill }}>{actualScore}</p>
                </div>
                {/* Score breakdown (only for Overall tab, only when shuffled) */}
                <div className="overflow-hidden transition-all duration-300"
                  style={{
                    maxHeight: showBreakdown ? '30px' : '0',
                    opacity: showBreakdown ? 1 : 0,
                    paddingTop: showBreakdown ? '8px' : '0',
                  }}>
                  <div className="flex items-center gap-3 pl-10 text-[10px] font-bold">
                    <span className="text-mint">+{totalWordPoints} earned</span>
                    <span className="text-peach">-{shufflePenalty} penalty</span>
                    <span className="text-warm-gray/40">=</span>
                    <span className="font-mono" style={{ color: c.fill }}>{actualScore}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* All targets revealed */}
        {targetReveals.length > 0 && (
          <div className="w-full max-w-md space-y-3">
            <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest text-center">All Target Words</h3>
            {targetReveals.map((reveal: any, wi: number) => (
              <div key={wi} className="space-y-1.5">
                <p className="text-[10px] font-bold text-warm-gray/50 text-center">Wave {reveal.wave}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {(reveal.targets || []).map((t: any, ti: number) => {
                    const level = t.level || 1;
                    const wasHit = allWords.some(w => w.is_target && w.word.toLowerCase() === (t.word || "").toLowerCase());
                    return (
                      <span key={ti} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold border"
                        style={{
                          backgroundColor: wasHit ? LEVEL_COLORS[level] + "25" : "rgba(0,0,0,0.03)",
                          borderColor: wasHit ? LEVEL_COLORS[level] : "rgba(0,0,0,0.08)",
                          color: wasHit ? LEVEL_COLORS[level] : "#9CA3AF",
                          textDecoration: wasHit ? "none" : "line-through",
                        }}>
                        {t.word || "???"}
                        <span className="opacity-50 text-[9px]">+{t.bonus || 0}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Word cloud */}
        <div className="w-full max-w-md">
          <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest mb-3 text-center">
            {waveTab === "overall" ? "All Words" : `Wave ${waveTab} Words`}
          </h3>
          <div className="flex flex-wrap gap-2 justify-center">
            {filteredWords.map((w: SprintWord) => {
              const c = playerColors[w.player_id] || PLAYER_COLORS[0];
              return (
                <span key={w.id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border"
                  style={{
                    backgroundColor: w.is_target ? LEVEL_COLORS[w.target_level || 1] + "25" : c.fillLight,
                    borderColor: w.is_target ? LEVEL_COLORS[w.target_level || 1] : c.pillBorder,
                    color: w.is_target ? LEVEL_COLORS[w.target_level || 1] : c.fill,
                  }}>
                  {w.word}
                  {w.is_target ? <Target className="w-2.5 h-2.5" /> : <span className="opacity-60 text-[10px]">+{w.points}</span>}
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

export default function LinksSprintBoard({ code, playerId, playerName }: LinksSprintBoardProps) {
  // ── State ────────────────────────────────────────────────────────────
  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [gameState, setGameState] = useState<any>({
    phase: "WAVE_INTRO",
    currentWave: 1,
    totalWaves: 3,
    letters: [],
    targetWords: [],
    usedWords: [],
    scores: {},
    waveTimer: 60,
    waveDuration: 60,
    targetReveals: [],
    gameStartTime: null,
  });
  const [sprintWords, setSprintWords] = useState<SprintWord[]>([]);
  const [isGameOver, setIsGameOver] = useState(false);
  const [typedWord, setTypedWord] = useState("");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingWave, setIsStartingWave] = useState(false);
  const isStartingWaveRef = useRef(false);
  const [wordFeedback, setWordFeedback] = useState<{ type: string; message?: string }>({ type: "typing" });
  const [shakeKey, setShakeKey] = useState(0);
  const [targetHitFlash, setTargetHitFlash] = useState<{ word: string; level: number } | null>(null);
  const [waveTimer, setWaveTimer] = useState(60);
  const [waveIntroCountdown, setWaveIntroCountdown] = useState(3);
  const [showDisconnected, setShowDisconnected] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitGuardRef = useRef(false);
  const waveStartFiredRef = useRef(false);
  const waveEndFiredRef = useRef(false);
  const shuffleGuardRef = useRef(false);
  const playersLenRef = useRef(players.length);
  const isHost = lobby?.host_id === playerId;
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { playersLenRef.current = players.length; }, [players.length]);

  // ── Shuffle state ────────────────────────────────────────────────────
  const [shuffleAllCount, setShuffleAllCount] = useState(0);
  const [shuffleSingleCount, setShuffleSingleCount] = useState(0);
  const [shufflePenaltyFlash, setShufflePenaltyFlash] = useState<{ message: string; type: "warning" | "danger" } | null>(null);
  const shufflePenaltyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived state ────────────────────────────────────────────────────
  const phase = gameState.phase;
  // Per-player shuffle: each player has their own letters in arena_state.playerLetters[playerId].
  // When a player shuffles, only their entry changes — opponents keep their letters.
  // Fall back to shared letters for backward compatibility with in-progress games.
  const letters: string[] = (gameState.playerLetters?.[playerId] || gameState.letters) || [];
  const usedWords: string[] = gameState.usedWords || [];
  const playerTimers: Record<string, number> = gameState.playerTimers || {};
  const myTimer = playerTimers[playerId] ?? waveTimer;
  const shuffleCounts: Record<string, { all?: number; single?: number }> = gameState.shuffleCounts || {};
  const shuffleDeductions: Record<string, number> = gameState.shuffleDeductions || {};
  const myShuffles = shuffleCounts[playerId] || {};

  // Sync shuffle counts from arena_state on reconnect
  useEffect(() => {
    if (myShuffles.all !== undefined) setShuffleAllCount(myShuffles.all);
    if (myShuffles.single !== undefined) setShuffleSingleCount(myShuffles.single);
  }, [myShuffles.all, myShuffles.single]);

  // ── My words + opponent words ────────────────────────────────────────
  const myWords = useMemo(() => sprintWords.filter(w => w.player_id === playerId), [sprintWords, playerId]);
  const opponentWords = useMemo(() => sprintWords.filter(w => w.player_id !== playerId), [sprintWords, playerId]);

  // ── Realtime channel ─────────────────────────────────────────────────
  const { presences, isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: `links-sprint:${code}`,
    enablePresence: false,
    subscribeLobby: code,
    subscribePlayers: code,
    subscribeArenaAnswers: code,
    answersTableName: "links_sprint_words",
    onLobbyChange: (payload: any) => {
      if (payload.eventType === "DELETE" || !payload.new) {
        window.location.href = "/";
        return;
      }
      const newData = payload.new as any;
      const parsed = parseArenaState(newData.arena_state);
      if (parsed) {
        setGameState(parsed);
        if (parsed.phase === "GAME_OVER") setIsGameOver(true);
      }
    },
    onPlayerChange: async () => {
      const { data } = await supabase.from("players").select("*").eq("lobby_code", code).order("score", { ascending: false });
      if (data) setPlayers(data);
    },
    onArenaAnswer: (payload: any) => {
      const newWord = payload.new as SprintWord;
      if (!newWord) return;
      setSprintWords((prev) => {
        const exists = prev.find(w => w.id === newWord.id);
        if (exists) return prev;
        return [...prev, newWord];
      });
      // Target hit flash for own words
      if (newWord.is_target && newWord.player_id === playerId) {
        setTargetHitFlash({ word: newWord.word, level: newWord.target_level || 1 });
        setTimeout(() => setTargetHitFlash(null), 2500);
      }
    },
    onReconnect: async () => {
      const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", code).maybeSingle();
      const parsed = parseArenaState(lobbyData?.arena_state);
      if (parsed) setGameState(parsed);
    },
  });

  // ── Disconnect banner ────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) {
      disconnectTimerRef.current = setTimeout(() => setShowDisconnected(true), 5000);
    } else {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
      setShowDisconnected(false);
    }
    return () => { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); };
  }, [isConnected]);

  // ── Cleanup timers on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      if (shufflePenaltyTimerRef.current) clearTimeout(shufflePenaltyTimerRef.current);
    };
  }, []);

  // ── Initial fetch ────────────────────────────────────────────────────
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    let cancelled = false;

    const init = async () => {
      const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", code).maybeSingle();
      if (cancelled) return;
      if (lobbyData) {
        setLobby(lobbyData);
        const parsed = parseArenaState(lobbyData.arena_state);
        if (parsed) {
          setGameState(parsed);
          if (parsed.phase === "GAME_OVER") setIsGameOver(true);
        }
      }

      const { data: playerData } = await supabase.from("players").select("*").eq("lobby_code", code).order("score", { ascending: false });
      if (!cancelled && playerData) {
        setPlayers(playerData);
      }

      const { data: wordsData } = await supabase.from("links_sprint_words").select("*").eq("lobby_code", code).order("created_at", { ascending: true });
      if (!cancelled && wordsData) {
        setSprintWords(wordsData);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [code]);

  // ── Clear typed word when wave changes ──────────────────────────────
  // When a player is typing and the wave ends, the text should not carry
  // over to the next wave — they'd have to delete and retype.
  useEffect(() => {
    setTypedWord("");
    setWordFeedback({ type: "typing" });
  }, [gameState.currentWave]);

  // ── Wave intro countdown ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "WAVE_INTRO") {
      setWaveIntroCountdown(3);
      waveStartFiredRef.current = false;
      // Reset the starting-wave guard when we leave WAVE_RESULTS
      isStartingWaveRef.current = false;
      setIsStartingWave(false);
      return;
    }
    waveStartFiredRef.current = false;
    const interval = setInterval(() => {
      setWaveIntroCountdown(prev => {
        const next = prev - 1;
        if (next <= 0 && isHostRef.current && !waveStartFiredRef.current) {
          waveStartFiredRef.current = true;
          handleStartWave();
        }
        return next > 0 ? next : 0;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Wave timer ───────────────────────────────────────────────────────
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; });

  useEffect(() => {
    if (phase !== "PLAYING") {
      setWaveTimer(gameState.waveDuration || 60);
      waveEndFiredRef.current = false;
      return;
    }
    setWaveTimer(gameState.waveDuration || 60);
    waveEndFiredRef.current = false;
    const interval = setInterval(() => {
      setWaveTimer(prev => {
        const next = prev - 1;
        if (next <= 0 && isHostRef.current && !waveEndFiredRef.current) {
          waveEndFiredRef.current = true;
          handleEndWave();
        }
        return next > 0 ? next : 0;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, gameState.currentWave]);

  // ── Polling fallback ─────────────────────────────────────────────────
  useEffect(() => {
    const poll = setInterval(async () => {
      if (isConnected) return;
      try {
        const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", code).maybeSingle();
        if (lobbyData) {
          setLobby(lobbyData);
          const parsed = parseArenaState(lobbyData.arena_state);
          if (parsed) {
            setGameState(parsed);
            if (parsed.phase === "GAME_OVER") setIsGameOver(true);
          }
        }
        const { data: playerData } = await supabase.from("players").select("*").eq("lobby_code", code).order("score", { ascending: false });
        if (playerData) setPlayers(playerData);
        const { data: wordsData } = await supabase.from("links_sprint_words").select("*").eq("lobby_code", code).order("created_at", { ascending: true });
        if (wordsData) setSprintWords(wordsData);
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, [code, isConnected]);

  // ── Word validation (with dictionary lookup) ─────────────────────────
  const [validWordCache, setValidWordCache] = useState<Set<string> | null>(null);

  // Pre-fetch the intersection of all letter word lists (the valid dictionary pool for this wave)
  useEffect(() => {
    if (letters.length === 0) return;
    // Reset cache immediately so we don't use stale data from prior wave during fetch
    setValidWordCache(null);
    let cancelled = false;
    const init = async () => {
      const wordSets: Set<string>[] = [];
      for (const letter of letters) {
        const words = await fetchWordFile(letter);
        if (words.length > 0) wordSets.push(new Set(words));
      }
      if (cancelled) return;
      if (wordSets.length === 0) {
        setValidWordCache(null);
        return;
      }
      const first = wordSets[0];
      const intersection = new Set<string>();
      for (const word of first) {
        if (word.length >= 3 && word.length <= 15 && wordSets.every(s => s.has(word))) {
          intersection.add(word);
        }
      }
      if (!cancelled) setValidWordCache(intersection);
    };
    init();
    return () => { cancelled = true; };
  }, [letters]);

  const validateWord = useCallback((word: string) => {
    if (!word || word.length < 3) return { type: "typing" as const };
    const lower = word.toLowerCase().trim();
    if (!/^[a-z]{3,15}$/.test(lower)) return { type: "invalid" as const, message: "Letters only, 3-15 chars" };
    for (const letter of letters) {
      if (!lower.includes(letter.toLowerCase())) return { type: "missing" as const, message: `Missing "${letter}"` };
    }
    // Dictionary check (word must exist in our 264k-word list)
    if (validWordCache && !validWordCache.has(lower)) {
      return { type: "invalid" as const, message: "Not a real word" };
    }
    if (usedWords.includes(lower) || sprintWords.some(w => w.word === lower)) {
      const claimer = sprintWords.find(w => w.word === lower);
      return { type: "used" as const, message: claimer ? `${claimer.player_name} already claimed it` : "Already used" };
    }
    return { type: "valid" as const };
  }, [letters, usedWords, sprintWords, validWordCache]);

  // ── Input handling ───────────────────────────────────────────────────
  const handleSetInput = useCallback((v: string) => {
    setTypedWord(v);
    if (v.length === 0) {
      setWordFeedback({ type: "typing" });
    } else {
      const fb = validateWord(v);
      setWordFeedback(fb);
      // NOTE: We intentionally do NOT shake on fb.type === "used" here.
      // Shaking mid-typing breaks flow — if player A claimed "cat" and
      // player B is typing "cats", shaking at "cat" loses keyboard focus.
      // The shake only fires on Enter-submit (see handleSubmitWord).
    }
  }, [validateWord]);

  // ── Start wave (host only) ───────────────────────────────────────────
  const handleStartWave = useCallback(async () => {
    if (!isHostRef.current) return;
    // Double-click guard: ref-based to prevent stale-closure race
    if (isStartingWaveRef.current) return;
    isStartingWaveRef.current = true;
    setIsStartingWave(true);
    const gs = gameStateRef.current;
    const wave = gs.currentWave || 1;
    const playerCount = playersLenRef.current || 2;
    const tierKey = (WAVE_TIER[wave] || "easy") as keyof LetterSetsTiers;

    // Load letter sets and pick from difficulty tier
    let newLetters: string[];
    try {
      const sets = await loadLetterSets();
      const tier = sets[tierKey] || sets.easy;
      const picked = tier[Math.floor(Math.random() * tier.length)];
      // Use letter count from lobby settings, or default to player count (2-4)
      const settingLetterCount = lobby?.settings?.sprintLetterCount;
      const letterCount = settingLetterCount
        ? Math.min(settingLetterCount, picked.letters.length)
        : Math.min(Math.max(2, playerCount), picked.letters.length);
      newLetters = picked.letters.slice(0, letterCount);
    } catch {
      // Fallback: random letters if letter_sets.json fails to load
      const allLetters = ['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q'];
      newLetters = [...allLetters].sort(() => Math.random() - 0.5).slice(0, Math.min(playerCount, 4));
    }

    // ── Generate target words from actual dictionary (intersection of letter word lists) ──
    const targets: any[] = [];
    const usedTargetWords = new Set<string>();
    let allValidWords: string[] = [];

    // Fetch word files for each letter, intersect to find all valid words
    try {
      const wordSets: Set<string>[] = [];
      for (const letter of newLetters) {
        const words = await fetchWordFile(letter);
        if (words.length > 0) wordSets.push(new Set(words));
      }
      if (wordSets.length > 0) {
        const first = wordSets[0];
        const intersection = new Set<string>();
        for (const word of first) {
          if (wordSets.every((s) => s.has(word))) intersection.add(word);
        }
        // Only keep words 3-15 chars to match game rules
        allValidWords = Array.from(intersection).filter(w => w.length >= 3 && w.length <= 15);
      }
    } catch {
      // Will fall through to hardcoded template fallback below
    }

    if (allValidWords.length > 0) {
      // Sort by length so we can group into difficulty tiers
      allValidWords.sort((a, b) => a.length - b.length);

      // Tier by word length: level 1 = 3-4, level 2 = 5-6, level 3 = 7-8, level 4 = 9-10, level 5 = 11+
      const tierRanges: [number, number][] = [[3, 4], [5, 6], [7, 8], [9, 10], [11, 15]];
      for (let level = 1; level <= 5; level++) {
        const [min, max] = tierRanges[level - 1];
        const pool = allValidWords.filter(w => w.length >= min && w.length <= max);
        if (pool.length === 0) continue;

        let word = pool[Math.floor(Math.random() * pool.length)];
        let attempts = 0;
        while (usedTargetWords.has(word) && attempts < 20) {
          word = pool[Math.floor(Math.random() * pool.length)];
          attempts++;
        }
        if (!usedTargetWords.has(word)) {
          usedTargetWords.add(word);
          targets.push({ word, level, bonus: TARGET_LEVELS[level]?.bonus || level * 100 });
        }
      }

      // Fallback within dictionary: if no tier had matching words, grab any valid word
      if (targets.length === 0) {
        for (const word of allValidWords.slice(0, 5)) {
          if (!usedTargetWords.has(word)) {
            usedTargetWords.add(word);
            targets.push({ word, level: 1, bonus: TARGET_LEVELS[1]?.bonus || 100 });
          }
        }
      }
    } else {
      // ── Hardcoded template fallback (when dictionary fetch fails entirely) ──
      const targetWordTemplates: Record<number, string[]> = {
        1: ["ARE", "ART", "RAT", "TAR", "TEA", "EAT", "EAR", "ERA", "NET", "TEN", "ANT", "TAN", "RAN", "SAT", "SET"],
        2: ["RATE", "TEAR", "NEAR", "EARN", "RENT", "TENT", "NEST", "SENT", "REST", "STAR", "ARTS", "EAST"],
        3: ["STARE", "RATES", "TEARS", "NEARS", "RENTS", "STERN", "TASER", "RANTS", "EARNS", "SNAKE"],
        4: ["EASTERN", "NEAREST", "SENATOR", "RESTATE", "TENSEST", "RATTLES", "STARTLE", "RENTALS"],
        5: ["TRANSLATE", "ALTERNATE", "RELEVANT", "TOLERATE", "SENTIMENT", "REINSTATES"],
      };

      for (let level = 1; level <= 5; level++) {
        const pool = targetWordTemplates[level] || targetWordTemplates[1];
        if (pool.length === 0) continue;
        const validPool = pool.filter(w => newLetters.every(l => w.toLowerCase().includes(l.toLowerCase())));
        if (validPool.length === 0) continue;
        let word = validPool[Math.floor(Math.random() * validPool.length)].toLowerCase();
        let attempts = 0;
        while (usedTargetWords.has(word) && attempts < 10) {
          word = validPool[Math.floor(Math.random() * validPool.length)].toLowerCase();
          attempts++;
        }
        if (!usedTargetWords.has(word)) {
          usedTargetWords.add(word);
          targets.push({ word, level, bonus: TARGET_LEVELS[level]?.bonus || level * 100 });
        }
      }

      // If no targets matched hardcoded either (unlikely but guard)
      if (targets.length === 0) {
        const commonPool = targetWordTemplates[1].filter(w => newLetters.every(l => w.toLowerCase().includes(l.toLowerCase())));
        for (const word of commonPool.slice(0, 5)) {
          if (!usedTargetWords.has(word.toLowerCase())) {
            usedTargetWords.add(word.toLowerCase());
            targets.push({ word: word.toLowerCase(), level: 1, bonus: TARGET_LEVELS[1]?.bonus || 100 });
          }
        }
      }
    }

    // Reset shuffle counts for new wave
    setShuffleAllCount(0);
    setShuffleSingleCount(0);

    const { error } = await supabase.rpc("start_links_sprint_wave", {
      p_lobby_code: code,
      p_letters: newLetters,
      p_target_words: targets,
    });

    if (error) console.error("[SPRINT] start_links_sprint_wave error:", error);
    // Reset guard after RPC completes — no race with double-clicks
    isStartingWaveRef.current = false;
    setIsStartingWave(false);
  }, [code]);

  // ── End wave (host only) ─────────────────────────────────────────────
  const handleEndWave = useCallback(async () => {
    if (!isHostRef.current) return;
    // Idempotency guard: only end wave if we're still in PLAYING phase.
    // Prevents double-ending if realtime update arrives during the RPC call.
    if (gameStateRef.current.phase !== "PLAYING") return;
    const { error } = await supabase.rpc("end_links_sprint_wave", { p_lobby_code: code });
    if (error) console.error("[SPRINT] end_links_sprint_wave error:", error);
  }, [code]);

  // ── Shuffle handlers ─────────────────────────────────────────────────
  const handleShuffleAll = useCallback(async () => {
    if (phase !== "PLAYING" || shuffleGuardRef.current) return;
    shuffleGuardRef.current = true;

    const allLetters = ['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q'];
    const newLetters = [...allLetters].sort(() => Math.random() - 0.5).slice(0, letters.length);

    const { data, error } = await supabase.rpc("shuffle_links_sprint_letters", {
      p_lobby_code: code,
      p_player_id: playerId,
      p_shuffle_type: "all",
      p_new_letters: newLetters,
    });

    shuffleGuardRef.current = false;

    if (!error && data?.success) {
      const newCount = data.newAllShuffles || 1;
      setShuffleAllCount(newCount);
      setWaveTimer(prev => Math.max(0, prev - (data.timePenalty || 5)));
      const flash = {
        message: newCount <= 1
          ? `-5s ⏱ · -${data.pointsDeduction || 0} pts (-25%)`
          : `-5s ⏱ · -${data.pointsDeduction || 0} pts (-50%)`,
        type: (newCount <= 1 ? "warning" : "danger") as "warning" | "danger",
      };
      setShufflePenaltyFlash(flash);
      if (shufflePenaltyTimerRef.current) clearTimeout(shufflePenaltyTimerRef.current);
      shufflePenaltyTimerRef.current = setTimeout(() => setShufflePenaltyFlash(null), 3000);
    }
  }, [code, playerId, phase, letters.length]);

  const handleShuffleSingle = useCallback(async (index: number) => {
    if (phase !== "PLAYING" || shuffleGuardRef.current) return;
    shuffleGuardRef.current = true;

    const allLetters = ['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q'];
    const currentLetter = letters[index]?.toLowerCase();
    const available = allLetters.filter(l => l.toLowerCase() !== currentLetter);
    const newLetter = available[Math.floor(Math.random() * available.length)];
    const newLetters = [...letters];
    newLetters[index] = newLetter;

    const { data, error } = await supabase.rpc("shuffle_links_sprint_letters", {
      p_lobby_code: code,
      p_player_id: playerId,
      p_shuffle_type: "single",
      p_new_letters: newLetters,
    });

    shuffleGuardRef.current = false;

    if (!error && data?.success) {
      setShuffleSingleCount(prev => prev + 1);
      setWaveTimer(prev => Math.max(0, prev - (data.timePenalty || 3)));
      const flash = {
        message: `-3s ⏱ · -${data.pointsDeduction || 0} pts (-25%)`,
        type: "warning" as const,
      };
      setShufflePenaltyFlash(flash);
      if (shufflePenaltyTimerRef.current) clearTimeout(shufflePenaltyTimerRef.current);
      shufflePenaltyTimerRef.current = setTimeout(() => setShufflePenaltyFlash(null), 3000);
    }
  }, [code, playerId, phase, letters]);

  // ── Submit word ──────────────────────────────────────────────────────
  const handleSubmitWord = useCallback(async (wordParam?: string) => {
    if (phase !== "PLAYING" || submitGuardRef.current || isSubmitting) return;
    if (wordFeedback.type !== "valid") return;

    const word = (wordParam || typedWord).trim();
    if (!word || word.length < 3) return;

    submitGuardRef.current = true;
    setIsSubmitting(true);
    setSubmitStatus("Claiming...");

    const { data, error } = await supabase.rpc("submit_links_sprint_word", {
      p_lobby_code: code,
      p_player_id: playerId,
      p_word: word.toLowerCase(),
    });

    submitGuardRef.current = false;
    setIsSubmitting(false);

    if (error || data?.success === false) {
      const errMsg = data?.error || error?.message || "Submit failed";
      setSubmitStatus(errMsg);
      if (data?.error_code === "ALREADY_USED") {
        setWordFeedback({ type: "used", message: "Already claimed!" });
        setShakeKey(k => k + 1);
      }
      setTimeout(() => setSubmitStatus(null), 2500);
      return;
    }

    setTypedWord("");
    setWordFeedback({ type: "typing" });

    if (data.is_target) {
      setTargetHitFlash({ word: data.word, level: data.target_level || 1 });
      setTimeout(() => setTargetHitFlash(null), 2500);
      setSubmitStatus(`🎯 TARGET! +${data.points} pts`);
    } else {
      setSubmitStatus(`+${data.points} pts`);
    }
    setTimeout(() => setSubmitStatus(null), 2000);
  }, [code, playerId, phase, typedWord, wordFeedback.type, isSubmitting]);

  // ── Leave ────────────────────────────────────────────────────────────
  const handleLeave = async () => {
    if (confirm("Leave the game?")) {
      broadcast("player:leave", { playerId });
      await supabase.from("players").delete().eq("id", playerId).eq("lobby_code", code);
      // Reset lobby so mode selection shows fresh when returning
      if (isHost) {
        await supabase.from("lobbies").update({ mode: null, status: "LOBBY", arena_state: null }).eq("code", code);
      }
      store.clearArenaHostCode();
      window.location.href = `/lobby/${code}?from=game`;
    }
  };

  // ── Stable player colors (assigned in render, persisted via ref) ─────
  const playerColorMapRef = useRef<Record<string, PlayerColor>>({});
  const playerColors = useMemo(() => {
    const map = { ...playerColorMapRef.current };
    let changed = false;
    // Assign colors to any new players not yet in the map
    for (const p of players) {
      if (!map[p.id]) {
        const usedNames = new Set(Object.values(map).map(c => c.name));
        let colorIdx = 0;
        while (usedNames.has(PLAYER_COLORS[colorIdx % PLAYER_COLORS.length].name) && colorIdx < PLAYER_COLORS.length * 2) {
          colorIdx++;
        }
        map[p.id] = getPlayerColorByIndex(colorIdx);
        changed = true;
      }
    }
    if (changed) playerColorMapRef.current = map;
    return map;
  }, [players]);

  // ── Scores ───────────────────────────────────────────────────────────
  const scores = useMemo(() => {
    const s: Record<string, number> = {};
    players.forEach(p => {
      s[p.id] = sprintWords.filter(w => w.player_id === p.id).reduce((sum, w) => sum + w.points, 0);
    });
    return s;
  }, [players, sprintWords]);

  const otherPlayers = players.filter((p: any) => p.id !== playerId);

  // ── Loading ──────────────────────────────────────────────────────────
  if (!lobby) {
    return (
      <div className="h-screen bg-clay-cream flex items-center justify-center">
        <div className="text-warm-gray/60 font-medium text-sm animate-pulse">Loading LINKS Sprint...</div>
      </div>
    );
  }

  // ── Game Over ────────────────────────────────────────────────────────
  if (isGameOver || phase === "GAME_OVER") {
    return (
      <SprintGameOverScreen
        players={players}
        allWords={sprintWords}
        scores={scores}
        targetReveals={gameState.targetReveals || []}
        playerColors={playerColors}
        lobbyCode={code}
        onLeave={handleLeave}
        shuffleDeductions={shuffleDeductions}
      />
    );
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-clay-cream flex flex-col overflow-hidden">
      {/* Disconnected banner */}
      {showDisconnected && (
        <div className="sticky top-0 z-50 bg-peach-light border-b border-peach/30 px-4 py-3 flex items-center justify-center gap-3">
          <WifiOff className="w-4 h-4 text-peach animate-pulse" />
          <span className="text-peach text-xs font-bold uppercase tracking-widest">Connection lost — reconnecting...</span>
        </div>
      )}

      {/* Top bar */}
      <div className="shrink-0 px-3 sm:px-4 py-2 flex items-center justify-between bg-warm-white/90 backdrop-blur-md border-b border-warm-gray/10 z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={handleLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
          <span className="font-outfit font-black text-base text-plum">⚡ LINKS SPRINT</span>
          <span className="text-[10px] font-mono text-warm-gray/50">{code}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            {showDisconnected ? (
              <WifiOff className="w-3.5 h-3.5 text-peach animate-pulse" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-mint" />
            )}
          </div>
          {/* Wave badge */}
          <div className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border bg-mint-light text-mint border-mint/30">
            Wave {gameState.currentWave}/{gameState.totalWaves}
          </div>
          {/* Phase badge */}
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
            phase === "PLAYING" ? "bg-mint-light text-mint border-mint/30" :
            phase === "WAVE_INTRO" ? "bg-butter-light text-butter border-butter/30" :
            phase === "WAVE_RESULTS" ? "bg-soft-purple-light text-soft-purple border-soft-purple/30" :
            "bg-warm-gray/10 text-warm-gray/50 border-warm-gray/10"
          }`}>
            {phase === "WAVE_INTRO" ? "Get Ready" : phase === "PLAYING" ? "Playing" : phase === "WAVE_RESULTS" ? "Results" : phase}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* WAVE_INTRO phase */}
        {phase === "WAVE_INTRO" && (
          <WaveIntroPhase
            wave={gameState.currentWave}
            totalWaves={gameState.totalWaves}
            letters={letters}
            countdown={waveIntroCountdown}
            playerCount={players.length}
          />
        )}

        {/* WAVE_RESULTS phase */}
        {phase === "WAVE_RESULTS" && (
          <WaveResultsPhase
            wave={gameState.currentWave}
            totalWaves={gameState.totalWaves}
            players={players}
            allWords={sprintWords}
            targets={gameState.targetWords || []}
            scores={scores}
            playerColors={playerColors}
            isHost={isHost}
            onNextWave={handleStartWave}
            shuffleDeductions={shuffleDeductions}
            isStartingWave={isStartingWave}
          />
        )}

        {/* PLAYING phase */}
        {phase === "PLAYING" && (
          <>
            {/* 2 players: side by side */}
            {players.length === 2 && (
              <div className="flex-1 flex flex-col md:flex-row min-h-0">
                <div className="flex-1 min-h-0 flex">
                  <SprintPlayerPanel
                    color={playerColors[playerId] || PLAYER_COLORS[0]}
                    input={typedWord} setInput={handleSetInput}
                    onClaim={handleSubmitWord}
                    words={myWords}
                    score={scores[playerId] || 0}
                    playerLabel={playerName || "You"}
                    avatarSrc={AVATARS[0].src}
                    letters={letters}
                    submitting={isSubmitting}
                    submitStatus={submitStatus}
                    timerSeconds={myTimer} timerTotal={gameState.waveDuration || 60}
                    wordFeedback={wordFeedback} shakeKey={shakeKey}
                    targetHitFlash={targetHitFlash}
                    shuffleAllCount={shuffleAllCount}
                    shuffleSingleCount={shuffleSingleCount}
                    onShuffleAll={handleShuffleAll}
                    onShuffleSingle={handleShuffleSingle}
                    shufflePenaltyFlash={shufflePenaltyFlash}
                  />
                </div>
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80" />
                <div className="md:hidden h-[3px] bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80" />
                <div className="flex-1 min-h-0 flex">
                  {otherPlayers[0] && (
                    <SprintOpponentPanel
                      color={playerColors[otherPlayers[0].id] || PLAYER_COLORS[1]}
                      playerLabel={otherPlayers[0].name || "Opponent"}
                      avatarSrc={AVATARS[1 % AVATARS.length].src}
                      score={scores[otherPlayers[0].id] || 0}
                      words={opponentWords.filter(w => w.player_id === otherPlayers[0].id)}
                      timerSeconds={waveTimer}
                      timerTotal={gameState.waveDuration || 60}
                    />
                  )}
                </div>
              </div>
            )}

            {/* 3+ players: active player takes half, opponents stacked */}
            {players.length >= 3 && (
              <div className="flex-1 flex flex-col md:flex-row min-h-0">
                <div className="flex-1 min-h-0 flex md:flex-none md:w-[50%]">
                  <SprintPlayerPanel
                    color={playerColors[playerId] || PLAYER_COLORS[0]}
                    input={typedWord} setInput={handleSetInput}
                    onClaim={handleSubmitWord}
                    words={myWords}
                    score={scores[playerId] || 0}
                    playerLabel={playerName || "You"}
                    avatarSrc={AVATARS[0].src}
                    letters={letters}
                    submitting={isSubmitting}
                    submitStatus={submitStatus}
                    timerSeconds={myTimer} timerTotal={gameState.waveDuration || 60}
                    wordFeedback={wordFeedback} shakeKey={shakeKey}
                    targetHitFlash={targetHitFlash}
                    shuffleAllCount={shuffleAllCount}
                    shuffleSingleCount={shuffleSingleCount}
                    onShuffleAll={handleShuffleAll}
                    onShuffleSingle={handleShuffleSingle}
                    shufflePenaltyFlash={shufflePenaltyFlash}
                  />
                </div>
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                <div className="md:hidden h-[2px] bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80 shrink-0" />
                <div className="flex-1 min-h-0 flex flex-col md:flex-none md:w-[50%]">
                  {otherPlayers.map((op: any, idx: number) => (
                    <div key={op.id} className="flex-shrink-0 min-h-[110px] md:flex-1 md:min-h-0 flex border-b border-warm-gray/10 last:border-b-0">
                      <SprintOpponentPanel
                        color={playerColors[op.id] || PLAYER_COLORS[(idx + 1) % PLAYER_COLORS.length]}
                        playerLabel={op.name || "Opponent"}
                        avatarSrc={AVATARS[(idx + 1) % AVATARS.length].src}
                        score={scores[op.id] || 0}
                        words={opponentWords.filter(w => w.player_id === op.id)}
                        timerSeconds={waveTimer}
                        timerTotal={gameState.waveDuration || 60}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
