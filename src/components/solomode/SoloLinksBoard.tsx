import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { store } from "../../lib/storage";
import {
  ArrowLeft, Zap, Flame, Clock, Shuffle, Sparkles, Play, Pause,
  RefreshCw, Send,
} from "lucide-react";
import ClayButton from "../ui/ClayButton";
import ClayCard from "../ui/ClayCard";
import ClayBadge from "../ui/ClayBadge";
import SoloEndScreen from "./SoloEndScreen";
import { fetchWordFile, countPoolLettersInWord, generateLetterPool } from "../../lib/linksHelpers";

// ── Types ───────────────────────────────────────────────────────────────────

interface GameSettings {
  letterCount: number;
  waveTimer: number;
  totalWaves: number;
  letterShifts: number;
  targetMode: boolean;
}

interface FoundWord {
  word: string;
  points: number;
  bonus: "power" | "freeze" | "target" | null;
}

interface WaveStats {
  words: FoundWord[];
  longestWord: string;
  totalPoints: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

// TOTAL_WAVES is now dynamic from settings

function calculatePoints(wordLength: number): number {
  if (wordLength <= 4) return 10 * wordLength;
  if (wordLength <= 6) return 15 * wordLength;
  if (wordLength <= 8) return 20 * wordLength;
  return 30 * wordLength;
}

// ── Letter Tile Colors (clay accent palette) ────────────────────────────────

const LETTER_COLORS = [
  { accent: "purple", bg: "bg-soft-purple-light", border: "border-soft-purple/30", text: "text-soft-purple", shadow: "shadow-soft-purple/20" },
  { accent: "sky", bg: "bg-sky-light", border: "border-sky/30", text: "text-sky", shadow: "shadow-sky/20" },
  { accent: "mint", bg: "bg-mint-light", border: "border-mint/30", text: "text-mint", shadow: "shadow-mint/20" },
  { accent: "peach", bg: "bg-peach-light", border: "border-peach/30", text: "text-peach", shadow: "shadow-peach/20" },
  { accent: "butter", bg: "bg-butter-light", border: "border-butter/30", text: "text-butter", shadow: "shadow-butter/20" },
];

// ── Shared helper: build valid word set (union + ≥2 pool letters) ───────────

async function buildValidWordSet(poolLetters: string[]): Promise<Set<string>> {
  const allWords = new Set<string>();
  for (const letter of poolLetters) {
    const words = await fetchWordFile(letter);
    for (const w of words) { if (w.length >= 2 && w.length <= 15) allWords.add(w); }
  }
  const poolLower = poolLetters.map((l) => l.toLowerCase());
  const valid = new Set<string>();
  for (const word of allWords) {
    const lower = word.toLowerCase();
    let hits = 0;
    for (const l of poolLower) { if (lower.includes(l)) { hits++; if (hits >= 2) break; } }
    if (hits >= 2) valid.add(word);
  }
  return valid;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SoloLinksBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── Settings ─────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Letter state ─────────────────────────────────────────────────────
  const [letters, setLetters] = useState<string[]>([]);
  const [validWordsSet, setValidWordsSet] = useState<Set<string>>(new Set());
  const [letterLoadStatus, setLetterLoadStatus] = useState("");

  // ── Game state ───────────────────────────────────────────────────────
  const [currentWave, setCurrentWave] = useState(1);
  const [waveTimer, setWaveTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [isBetweenWaves, setIsBetweenWaves] = useState(false);

  // ── Word state ───────────────────────────────────────────────────────
  const [typedWord, setTypedWord] = useState("");
  const [wordFeedback, setWordFeedback] = useState<{
    type: "typing" | "valid" | "missing" | "used" | "invalid";
    message?: string;
  }>({ type: "typing" });
  const [currentWaveWords, setCurrentWaveWords] = useState<FoundWord[]>([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [allWaveStats, setAllWaveStats] = useState<WaveStats[]>([]);
  const [targetWord, setTargetWord] = useState<string | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const [usedWords, setUsedWords] = useState<Set<string>>(new Set());
  const [showFreeze, setShowFreeze] = useState(false);
  const [freezeTimer, setFreezeTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // ── Segment (letter shift) state ────────────────────────────────────
  const [segmentTimer, setSegmentTimer] = useState(0);
  const [currentSegment, setCurrentSegment] = useState(1);
  const shiftFiredRef = useRef(false);
  const handleShiftLettersRef = useRef<() => void>(() => {});
  const letterShifts = settings?.letterShifts || 1;
  const hasSegments = letterShifts > 1;
  const segmentsPerWave = letterShifts;
  // Segment duration based on ACTUAL wave time (shorter waves = shorter segments)
  const actualWaveTime = settings ? Math.floor(settings.waveTimer * (1 - (currentWave - 1) * 0.25)) : 60;
  const segmentDuration = hasSegments ? Math.floor(actualWaveTime / segmentsPerWave) : 0;

  // ── Refs ─────────────────────────────────────────────────────────────
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishWaveRef = useRef<() => void>(() => {});

  // ── Load settings & generate letters ────────────────────────────────
  useEffect(() => {
    const s = store.getLocalGameSettings();
    if (!s || !s.letterCount) {
      navigate("/solo/links");
      return;
    }
    setSettings(s);
    generateLetters(s);
  }, []);

  const generateLetters = async (s: GameSettings, waveNum?: number) => {
    setLetterLoadStatus("Loading word lists...");

    try {
      // Use hybrid anchor+spice generation from linksHelpers
      const selected = await generateLetterPool(s.letterCount, waveNum || currentWave);

      const validSet = await buildValidWordSet(selected);
      setValidWordsSet(validSet);

      if (validSet.size > 0) {
        if (s.targetMode) {
          const longWords = Array.from(validSet).filter((w) => w.length >= 7);
          if (longWords.length > 0) {
            setTargetWord(longWords[Math.floor(Math.random() * longWords.length)].toUpperCase());
          }
        }
      }

      setLetters(selected);
      setWaveTimer(s.waveTimer);
      setLoading(false);
      setLetterLoadStatus("");
    } catch (err) {
      console.error("Failed to load word lists:", err);
      setLetterLoadStatus("Using fallback letters...");
      const fallback = "AEIOURSTNLC".split("").slice(0, s.letterCount);
      setLetters(fallback);
      setLoading(false);
    }
  };

  // ── Word validation ──────────────────────────────────────────────────
  const validateWord = useCallback(
    (word: string) => {
      if (!word || word.length < 3) return { type: "typing" as const };
      const lower = word.toLowerCase().trim();
      if (!/^[a-z]{3,15}$/.test(lower)) {
        return { type: "invalid" as const, message: t("links.lettersOnly") };
      }
      // Require at least 2 pool letters (matching Classic/Sprint)
      const poolCount = countPoolLettersInWord(lower, letters);
      if (poolCount < 2) {
        return { type: "missing" as const, message: t("links.missingLetter", { letter: letters.find((l) => !lower.includes(l.toLowerCase())) || "" }) };
      }
      if (usedWords.has(lower)) {
        return { type: "used" as const, message: t("links.alreadyUsed") };
      }
      if (validWordsSet.size > 0 && !validWordsSet.has(lower)) {
        return { type: "invalid" as const, message: "Not in dictionary" };
      }
      return { type: "valid" as const };
    },
    [letters, usedWords, validWordsSet, t]
  );

  // ── Handle typed word changes ────────────────────────────────────────
  const handleWordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 15);
    setTypedWord(val);
    if (val.length === 0) {
      setWordFeedback({ type: "typing" });
    } else {
      setWordFeedback(validateWord(val));
    }
  };

  // ── Submit word ───────────────────────────────────────────────────────
  const handleSubmitWord = useCallback(() => {
    if (wordFeedback.type !== "valid" || !isTimerRunning || isPaused) return;

    const word = typedWord.trim().toLowerCase();
    if (!word) return;

    const wordLength = word.length;
    let points = calculatePoints(wordLength);
    let bonus: FoundWord["bonus"] = null;

    // Combo multiplier
    const newCombo = combo + 1;
    setCombo(newCombo);
    if (newCombo > bestCombo) setBestCombo(newCombo);
    const multiplier = newCombo >= 10 ? 4 : newCombo >= 7 ? 3 : newCombo >= 4 ? 2 : 1;
    points *= multiplier;

    // Power word: using ALL letters
    const usesAllLetters = letters.every((l) => word.includes(l.toLowerCase()));
    if (usesAllLetters) {
      points *= 2;
      bonus = "power";
    }

    // Freeze word: 8+ letters
    if (wordLength >= 8) {
      bonus = bonus || "freeze";
      setShowFreeze(true);
      if (freezeTimer) clearTimeout(freezeTimer);
      const ft = setTimeout(() => setShowFreeze(false), 2000);
      setFreezeTimer(ft);
      setIsPaused(true);
      setTimeout(() => setIsPaused(false), 3000);
    }

    // Target word
    if (targetWord && word === targetWord.toLowerCase() && !targetFound) {
      points += 500;
      bonus = "target";
      setTargetFound(true);
    }

    const newWord: FoundWord = { word: word.toUpperCase(), points, bonus };
    setCurrentWaveWords((prev) => [...prev, newWord]);
    setUsedWords((prev) => new Set(prev).add(word));
    setTypedWord("");
    setWordFeedback({ type: "typing" });
    inputRef.current?.focus();
  }, [
    wordFeedback, isTimerRunning, isPaused, typedWord, combo, bestCombo,
    letters, targetWord, targetFound, freezeTimer,
  ]);

  // ── Key handler ──────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmitWord();
    }
  };

  // ── Timer logic ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTimerRunning || isPaused || gameOver) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setWaveTimer((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          finishWaveRef.current(); // Always use latest finishWave via ref
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning, isPaused, gameOver]);

  // ── Segment timer logic (letter shifts) ────────────────────────────
  useEffect(() => {
    if (!isTimerRunning || isPaused || gameOver || !hasSegments) {
      setSegmentTimer(0);
      shiftFiredRef.current = false;
      return;
    }

    // Initialize segment timer when wave starts or segment changes
    setSegmentTimer(segmentDuration);
    shiftFiredRef.current = false;

    const interval = setInterval(() => {
      setSegmentTimer((prev) => {
        if (prev <= 1) {
          // Time to shift — only host-like logic (solo = always host)
          if (!shiftFiredRef.current) {
            shiftFiredRef.current = true;
            handleShiftLettersRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, isPaused, gameOver, hasSegments, currentSegment, segmentDuration]);

  // ── Start wave ───────────────────────────────────────────────────────
  // ── Handle letter shift (segment change) ───────────────────────────
  const handleShiftLetters = useCallback(async () => {
    if (!settings) return;
    const nextSegment = currentSegment + 1;
    if (nextSegment > segmentsPerWave) return;

    setCurrentSegment(nextSegment);
    const newLetters = await generateLetterPool(settings.letterCount, currentWave);
    setLetters(newLetters);
    const validSet = await buildValidWordSet(newLetters);
    setValidWordsSet(validSet);
    setTypedWord("");
    setWordFeedback({ type: "typing" });
    setCombo(0);
    inputRef.current?.focus();
  }, [settings, currentWave, currentSegment, segmentsPerWave]);

  // Keep ref in sync with latest handleShiftLetters
  handleShiftLettersRef.current = handleShiftLetters;

  const startWave = useCallback((waveNum?: number) => {
    if (!settings) return;
    const wave = waveNum ?? currentWave;
    const waveTime = Math.floor(settings.waveTimer * (1 - (wave - 1) * 0.25));
    setWaveTimer(waveTime);
    setIsTimerRunning(true);
    setIsPaused(false);
    setIsBetweenWaves(false);
    setCurrentWaveWords([]);
    setCombo(0);
    setCurrentSegment(1);
    setSegmentTimer(0);
    shiftFiredRef.current = false;
    inputRef.current?.focus();
  }, [settings, currentWave]);

  // ── Finish wave (ref to avoid stale closure in timer interval) ──────
  const finishWave = useCallback(() => {
    setAllWaveStats((prev) => [
      ...prev,
      {
        words: [...currentWaveWords],
        longestWord: currentWaveWords.reduce(
          (longest, w) => (w.word.length > longest.length ? w.word : longest), ""
        ),
        totalPoints: currentWaveWords.reduce((sum, w) => sum + w.points, 0),
      },
    ]);

    if (currentWave >= (settings?.totalWaves || 3)) {
      setGameOver(true);
    } else {
      setIsBetweenWaves(true);
      // Generate new letters using hybrid system + auto-advance
      const nextWave = currentWave + 1;
      (async () => {
        const newLetters = await generateLetterPool(settings?.letterCount || 3, nextWave);
        setLetters(newLetters);
        const validSet = await buildValidWordSet(newLetters);
        setValidWordsSet(validSet);

        if (settings?.targetMode) {
          const longWords = Array.from(validSet).filter((w) => w.length >= 7);
          if (longWords.length > 0) {
            setTargetWord(longWords[Math.floor(Math.random() * longWords.length)].toUpperCase());
          }
          setTargetFound(false);
        }

        setUsedWords(new Set());
        setCurrentWave(nextWave);
        // Auto-start next wave with a brief pause for results visibility
        setTimeout(() => {
          startWave(nextWave);
        }, 2000);
      })();
      setIsBetweenWaves(true);
    }
  }, [currentWave, currentWaveWords, letters, settings]);

  // Always keep ref in sync with latest finishWave for timer interval
  finishWaveRef.current = finishWave;

  // ── Swap single letter ──────────────────────────────────────────────
  const swapLetter = useCallback(
    (idx: number) => {
      if (!isTimerRunning || isPaused) return;
      setWaveTimer((prev) => Math.max(0, prev - 3));
      setCombo(0);

      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const available = alphabet.filter((l) => !letters.includes(l));
      const newLetter = available[Math.floor(Math.random() * available.length)];

      setLetters((prev) => {
        const next = [...prev];
        next[idx] = newLetter;
        return next;
      });

      // Rebuild valid set using shared helper with updated pool
      const updatedLetters = [...letters];
      updatedLetters[idx] = newLetter;
      buildValidWordSet(updatedLetters).then((valid) => setValidWordsSet(valid)).catch(() => {});

      setUsedWords(new Set());
      inputRef.current?.focus();
    },
    [isTimerRunning, isPaused, letters]
  );

  // ── Shuffle all letters ──────────────────────────────────────────────
  const shuffleAllLetters = useCallback(async () => {
    if (!isTimerRunning || isPaused) return;
    setWaveTimer((prev) => Math.max(0, prev - 5));
    setCombo(0);

    const newLetters = await generateLetterPool(settings?.letterCount || 3, currentWave);
    setLetters(newLetters);

    buildValidWordSet(newLetters).then((valid) => setValidWordsSet(valid)).catch(() => {});
    setUsedWords(new Set());
    inputRef.current?.focus();
  }, [isTimerRunning, isPaused, settings, currentWave]);

  // ── Derived data ─────────────────────────────────────────────────────
  const totalScore = useMemo(
    () => allWaveStats.reduce((sum, ws) => sum + ws.totalPoints, 0) +
      currentWaveWords.reduce((sum, w) => sum + w.points, 0),
    [allWaveStats, currentWaveWords]
  );

  const totalWords = useMemo(
    () => allWaveStats.reduce((sum, ws) => sum + ws.words.length, 0) + currentWaveWords.length,
    [allWaveStats, currentWaveWords]
  );

  const waveBaseTime = settings ? Math.floor(settings.waveTimer * (1 - (currentWave - 1) * 0.25)) : 60;
  const timerPercent = waveBaseTime > 0 ? (waveTimer / waveBaseTime) * 100 : 0;
  const timerUrgent = waveTimer <= 10;
  const timerCritical = waveTimer <= 5;

  // ── Loading state ────────────────────────────────────────────────────
  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" />
          {letterLoadStatus && (
            <p className="text-xs text-warm-gray/50">{letterLoadStatus}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Game Over ────────────────────────────────────────────────────────
  if (gameOver) {
    const allWords = allWaveStats.flatMap((ws) => ws.words);
    const finalLongestWord = allWords.reduce(
      (longest, w) => (w.word.length > longest.length ? w.word : longest), ""
    );

    return (
      <SoloEndScreen
        gameType="links"
        score={totalScore}
        totalWords={totalWords}
        longestWord={finalLongestWord || "—"}
        bestCombo={bestCombo}
        totalTime={settings.waveTimer * (settings.totalWaves || 3)}
        targetFound={targetFound}
        onPlayAgain={() => {
          store.clearLocalGameSettings();
          navigate("/solo/links");
        }}
        onHome={() => navigate("/")}
      />
    );
  }

  // ── Between waves: brief results overlay (auto-advances) ──────────
  if (isBetweenWaves) {
    const lastWaveStats = allWaveStats[allWaveStats.length - 1];
    return (
      <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-6 gap-5">
        <div className="text-center space-y-2 animate-clay-pop">
          <div className="text-5xl">🌊</div>
          <h2 className="font-outfit font-black text-2xl text-plum">
            {t("solo.waveClear", { n: currentWave })}
          </h2>
          <p className="text-sm text-plum/60">
            {lastWaveStats?.words.length || 0} {t("links.wordsClaimed")} · <span className="font-mono font-bold text-soft-purple">{lastWaveStats?.totalPoints || 0}</span> {t("links.pts")}
          </p>
        </div>

        {/* Quick word cloud */}
        <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
          {(lastWaveStats?.words || []).slice(0, 12).map((w, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                w.bonus === "power"
                  ? "bg-butter-light text-butter border-butter/30"
                  : w.bonus === "freeze"
                    ? "bg-sky-light text-sky border-sky/30"
                    : w.bonus === "target"
                      ? "bg-mint-light text-mint border-mint/30"
                      : "clay px-2.5 py-1 rounded-full"
              }`}
            >
              {w.word}
              <span className="text-[9px] opacity-60 font-mono">+{w.points}</span>
            </span>
          ))}
        </div>

        <p className="text-xs text-plum/40 animate-pulse">{t("solo.nextWaveStarting")}</p>

        <ClayButton
          variant="secondary"
          size="sm"
          onClick={() => { store.clearLocalGameSettings(); navigate("/solo/links"); }}
        >
          {t("common.back")}
        </ClayButton>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── MAIN GAME RENDER ─────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <button
          onClick={() => {
            store.clearLocalGameSettings();
            navigate("/solo/links");
          }}
          className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t("common.back")}</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Wave badge */}
          <ClayBadge color="purple" dot>
            🌊 {t("solo.wave")} {currentWave}/{settings?.totalWaves || 3}
          </ClayBadge>

          {/* Segment indicator */}
          {hasSegments && isTimerRunning && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-soft-purple-light border border-soft-purple/20">
              <span className="text-[10px] font-black text-soft-purple">
                Seg {currentSegment}/{segmentsPerWave}
              </span>
              {segmentTimer > 0 && (
                <span className="text-[10px] font-mono font-bold text-plum/50">
                  · {segmentTimer}s
                </span>
              )}
            </div>
          )}

          {/* Combo */}
          {combo >= 3 && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-butter-light text-butter border border-butter/20 animate-pulse">
              <Flame className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black">{combo}×</span>
            </div>
          )}

          {/* Freeze flash */}
          {showFreeze && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-light text-sky border border-sky/30 animate-clay-pop">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black">+3s</span>
            </div>
          )}

          {/* Score */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-soft-purple-light border border-soft-purple/20">
            <Zap className="w-3.5 h-3.5 text-soft-purple" />
            <span className="font-mono font-bold text-sm text-soft-purple tabular-nums">{totalScore}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center p-3 sm:p-5 gap-4 sm:gap-5 overflow-y-auto">
        {/* ── Timer ring ────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
        <div className="relative w-22 h-22 sm:w-24 sm:h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
            <circle
              cx="44" cy="44" r="38"
              fill="none" stroke="currentColor" strokeWidth="5"
              className="text-warm-gray/10"
            />
            <circle
              cx="44" cy="44" r="38"
              fill="none" stroke="currentColor" strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 38}
              strokeDashoffset={2 * Math.PI * 38 * (1 - Math.max(0, Math.min(100, timerPercent)) / 100)}
              className={`transition-all duration-500 ${
                timerCritical ? "text-peach animate-pulse" : timerUrgent ? "text-butter" : "text-soft-purple"
              }`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-mono font-black text-2xl sm:text-3xl tabular-nums leading-none ${
              timerCritical ? "text-peach animate-pulse" : timerUrgent ? "text-butter" : "text-plum"
            }`}>
              {waveTimer}
            </span>
            <span className="text-[9px] font-bold text-warm-gray/40 uppercase mt-0.5">
              {t("links.sec")}
            </span>
          </div>
          </div>
          {/* Play/Pause button — beside the timer ring */}
          {isTimerRunning && (
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="w-8 h-8 rounded-full bg-warm-white border border-warm-gray/15 flex items-center justify-center shadow-sm hover:shadow-md transition-all"
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? (
                <Play className="w-3.5 h-3.5 text-mint" />
              ) : (
                <Pause className="w-3.5 h-3.5 text-warm-gray/50" />
              )}
            </button>
          )}
        </div>

        {/* Target word */}
        {targetWord && !targetFound && (
          <div className="animate-slide-up-fade">
            <ClayBadge color="butter">
              🎯 {t("solo.targetWord")}: <span className="font-outfit font-black">{targetWord}</span>
            </ClayBadge>
          </div>
        )}

        {/* ── Letters display ───────────────────────────────────── */}
        <ClayCard elevation="flat" padding="md" className="w-full max-w-md space-y-3">
          {/* Letter tiles */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
            {letters.map((letter, idx) => {
              const isUsed = typedWord.toLowerCase().includes(letter.toLowerCase());
              const lc = LETTER_COLORS[idx % LETTER_COLORS.length];
              return (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  {/* Letter tile */}
                  <button
                    onClick={() => swapLetter(idx)}
                    disabled={!isTimerRunning || isPaused}
                    className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center
                      font-outfit font-black text-2xl sm:text-3xl transition-all duration-200
                      ${isUsed
                        ? `bg-soft-purple text-white shadow-lg shadow-soft-purple/30 scale-105`
                        : `bg-cream border-2 border-warm-gray/15 text-plum/40 hover:border-warm-gray/30`
                      }
                      disabled:opacity-60 disabled:cursor-not-allowed
                    `}
                    title={`Swap ${letter} (-3s)`}
                  >
                    {letter}
                  </button>
                  {/* Swap button */}
                  <button
                    onClick={() => swapLetter(idx)}
                    disabled={!isTimerRunning || isPaused}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold
                      text-warm-gray/50 hover:text-peach hover:bg-peach-light/50
                      transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t("solo.swapLetterCost", { cost: 3 })}
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t("solo.swapLetter")}
                    <span className="text-[9px] text-peach/70">-3s</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Shuffle all + wave info bar */}
          <div className="flex items-center justify-center gap-3 pt-1 border-t border-warm-gray/10">
            {/* Shuffle button */}
            <button
              onClick={shuffleAllLetters}
              disabled={!isTimerRunning || isPaused}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
                bg-soft-purple-light text-soft-purple border border-soft-purple/30
                hover:bg-soft-purple hover:text-white transition-all duration-200
                disabled:opacity-30 disabled:cursor-not-allowed
                shadow-sm hover:shadow-md"
              title={t("solo.shuffleAllCost", { cost: 5 })}
            >
              <Shuffle className="w-4 h-4" />
              {t("solo.shuffleAll")}
              <span className="text-[10px] opacity-70">-5s</span>
            </button>

            {/* Combo (mobile) */}
            {combo >= 3 && (
              <span className="sm:hidden flex items-center gap-1 px-2.5 py-1 rounded-full bg-butter-light text-butter border border-butter/20">
                <Flame className="w-3.5 h-3.5" />
                <span className="text-xs font-black">{combo}×</span>
              </span>
            )}

            {/* End round */}
            {isTimerRunning && (
              <button
                onClick={finishWave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold
                  bg-peach-light text-peach border border-peach/30
                  hover:bg-peach hover:text-white transition-all duration-200
                  shadow-sm hover:shadow-md"
              >
                {t("solo.endRound")}
              </button>
            )}
          </div>
        </ClayCard>

        {/* ── Word input ────────────────────────────────────────── */}
        <div className="w-full max-w-md space-y-2">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={typedWord}
              onChange={handleWordChange}
              onKeyDown={handleKeyDown}
              placeholder={t("solo.typeWord")}
              className={`w-full px-5 py-4 rounded-2xl border-2 bg-warm-white font-outfit font-bold text-lg sm:text-xl
                text-plum placeholder:text-warm-gray/40 outline-none transition-all
                ${wordFeedback.type === "valid"
                  ? "border-mint ring-2 ring-mint/20"
                  : wordFeedback.type === "missing" || wordFeedback.type === "used" || wordFeedback.type === "invalid"
                    ? "border-peach/30 ring-2 ring-peach/20"
                    : "border-warm-gray/15 focus:border-soft-purple/40 focus:ring-2 focus:ring-soft-purple/20"
                }`}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={!isTimerRunning || isPaused}
            />

            {/* Submit button */}
            {wordFeedback.type === "valid" && isTimerRunning && !isPaused && (
              <button
                onClick={handleSubmitWord}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-xl
                  bg-mint text-white font-outfit font-black text-sm
                  hover:bg-mint/90 active:scale-95 transition-all
                  shadow-lg shadow-mint/20 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                +{calculatePoints(typedWord.length)}
              </button>
            )}
          </div>

          {/* Feedback */}
          <div className="h-5 flex items-center justify-center">
            {wordFeedback.type === "valid" && (
              <p className="text-xs font-bold text-mint animate-clay-pop">
                Press Enter · +{calculatePoints(typedWord.length)} pts
              </p>
            )}
            {wordFeedback.type === "missing" && (
              <p className="text-xs font-bold text-peach/80">{wordFeedback.message}</p>
            )}
            {wordFeedback.type === "used" && (
              <p className="text-xs font-bold text-butter">{wordFeedback.message}</p>
            )}
            {wordFeedback.type === "invalid" && (
              <p className="text-xs font-bold text-peach/60">{wordFeedback.message}</p>
            )}
          </div>
        </div>

        {/* ── Start button (if timer not running) ───────────────── */}
        {!isTimerRunning && (
          <ClayButton
            variant="primary"
            size="lg"
            icon={<Play className="w-5 h-5" />}
            onClick={() => startWave()}
            className="bg-soft-purple hover:bg-soft-purple/90"
          >
            {t("solo.startSprint")}
          </ClayButton>
        )}

        {/* ── Word history ──────────────────────────────────────── */}
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-black text-warm-gray/50 uppercase tracking-wider">
              {t("links.yourWords", { count: currentWaveWords.length })}
            </h4>
            <span className="text-[10px] font-bold text-warm-gray/40">
              {totalWords} {t("links.wordsClaimed")}
            </span>
          </div>

          {currentWaveWords.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <Sparkles className="w-6 h-6 text-warm-gray/20" />
              <p className="text-xs text-warm-gray/40">{t("links.noWordsStart")}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-[18vh] overflow-y-auto smooth-scroll">
              {currentWaveWords.map((w, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border animate-clay-pop ${
                    w.bonus === "power"
                      ? "bg-butter-light text-butter border-butter/30 shadow-sm"
                      : w.bonus === "freeze"
                        ? "bg-sky-light text-sky border-sky/30 shadow-sm"
                        : w.bonus === "target"
                          ? "bg-mint-light text-mint border-mint/30 shadow-sm"
                          : "clay px-3 py-1.5 rounded-full"
                  }`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {w.word}
                  <span className="text-[9px] opacity-60 font-mono">+{w.points}</span>
                  {w.bonus === "power" && <Sparkles className="w-3 h-3" />}
                  {w.bonus === "freeze" && <Clock className="w-3 h-3" />}
                  {w.bonus === "target" && <span>🎯</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Live stats ────────────────────────────────────────── */}
        {currentWaveWords.length > 0 && (
          <div className="flex gap-4 text-[10px] font-bold text-warm-gray/40">
            <span>{currentWaveWords.length} words</span>
            <span>
              {waveBaseTime > 0 && waveTimer >= 0
                ? Math.round(currentWaveWords.length / (Math.max(1, waveBaseTime - waveTimer) / 60))
                : 0} wpm
            </span>
            <span>
              {currentWaveWords.length > 0
                ? `${Math.round((currentWaveWords.filter((w) => w.bonus === null).length / currentWaveWords.length) * 100)}% basic`
                : "—"}
            </span>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 border-t border-warm-gray/10 bg-warm-white/80 text-center text-[10px] text-warm-gray/50">
        🔤 {letters.join(" + ")} · 🌊 {currentWave}/{settings?.totalWaves || 3} · {totalWords} {t("links.words")}
      </div>
    </div>
  );
}
