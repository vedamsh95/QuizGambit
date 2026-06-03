import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { store } from "../../lib/storage";
import {
  ArrowLeft, Zap, Flame, Clock, Sparkles, Play, Pause, Send,
} from "lucide-react";
import ClayButton from "../ui/ClayButton";
import ClayCard from "../ui/ClayCard";
import ClayBadge from "../ui/ClayBadge";
import SoloEndScreen from "./SoloEndScreen";
import LetterPool from "../ui/LetterPool";
import { fetchWordFile, countPoolLettersInWord, generateLetterPool, getPoolMultiplier, calcPointsWithPoolMultiplier } from "../../lib/linksHelpers";

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
  basePoints: number;
  poolMultiplier: number;
  poolLettersUsed: number;
  comboMultiplier: number;
}

interface WaveStats {
  words: FoundWord[];
  longestWord: string;
  totalPoints: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

function calculatePoints(wordLength: number): number {
  // Classic Links scoring: 10× up to 4, 15× up to 6, 20× 7+
  if (wordLength <= 4) return 10 * wordLength;
  if (wordLength <= 6) return 15 * wordLength;
  return 20 * wordLength;
}

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
  const [expandedWord, setExpandedWord] = useState<string | null>(null);

  // ── Segment (letter shift) state ────────────────────────────────────
  const [segmentTimer, setSegmentTimer] = useState(0);
  const [currentSegment, setCurrentSegment] = useState(1);
  const shiftFiredRef = useRef(false);
  const handleShiftLettersRef = useRef<() => void>(() => {});
  const isLetterAnimatingRef = useRef(false);
  const letterShifts = settings?.letterShifts || 1;
  const hasSegments = letterShifts > 1;
  const segmentsPerWave = letterShifts;
  // Segment duration based on ACTUAL wave time (shorter waves = shorter segments)
  const actualWaveTime = settings ? Math.floor(settings.waveTimer * (1 - (currentWave - 1) * 0.25)) : 60;
  const segmentDuration = hasSegments ? Math.floor(actualWaveTime / segmentsPerWave) : 0;

  // ── Letter animation key: triggers slot-machine reel on segment/wave changes
  const letterAnimateKey = currentWave * 100 + currentSegment;

  // ── Callback for LetterPool to pause timers during animation
  const handleLetterAnimationState = useCallback((animating: boolean) => {
    isLetterAnimatingRef.current = animating;
  }, []);

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
    generateLetters(s, 1);
  }, []);

  const generateLetters = async (s: GameSettings, waveNum: number) => {
    setLetterLoadStatus("Loading word lists...");

    try {
      const selected = await generateLetterPool(s.letterCount, waveNum, s.totalWaves);

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
    // Pool multiplier scoring (matching classic/sprint)
    const poolUsed = countPoolLettersInWord(word, letters);
    const { base: basePoints, multiplier: poolMult, total: poolPoints } = calcPointsWithPoolMultiplier(wordLength, poolUsed);
    let points = poolPoints;
    let bonus: FoundWord["bonus"] = null;

    // Combo multiplier
    const newCombo = combo + 1;
    setCombo(newCombo);
    if (newCombo > bestCombo) setBestCombo(newCombo);
    const comboMult = newCombo >= 10 ? 4 : newCombo >= 7 ? 3 : newCombo >= 4 ? 2 : 1;
    points *= comboMult;

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

    const newWord: FoundWord = {
      word: word.toUpperCase(), points, bonus,
      basePoints, poolMultiplier: poolMult, poolLettersUsed: poolUsed, comboMultiplier: comboMult,
    };
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
        if (isLetterAnimatingRef.current) return prev; // pause during animation
        if (prev <= 1) {
          setIsTimerRunning(false);
          finishWaveRef.current();
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

    setSegmentTimer(segmentDuration);
    shiftFiredRef.current = false;

    const interval = setInterval(() => {
      setSegmentTimer((prev) => {
        if (isLetterAnimatingRef.current) return prev; // pause during animation
        if (prev <= 1) {
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

  // ── Handle letter shift (segment change) ───────────────────────────
  const handleShiftLetters = useCallback(async () => {
    if (!settings) return;
    const nextSegment = currentSegment + 1;
    if (nextSegment > segmentsPerWave) return;

    // Generate new letters first, then update segment so UI stays in sync
    const newLetters = await generateLetterPool(settings.letterCount, currentWave, settings.totalWaves);
    setCurrentSegment(nextSegment);
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
    setCurrentWave(wave);
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
    // Snapshot all closure values to avoid stale references
    const waveWords = [...currentWaveWords];
    const waveNum = currentWave;
    const s = settings;

    setAllWaveStats((prev) => [
      ...prev,
      {
        words: waveWords,
        longestWord: waveWords.reduce(
          (longest, w) => (w.word.length > longest.length ? w.word : longest), ""
        ),
        totalPoints: waveWords.reduce((sum, w) => sum + w.points, 0),
      },
    ]);

    if (waveNum >= (s?.totalWaves || 3)) {
      setGameOver(true);
    } else {
      const nextWave = waveNum + 1;
      // Update wave number immediately so between-waves screen shows correct wave
      setCurrentWave(nextWave);
      setIsBetweenWaves(true);

      // Generate new letters for the next wave
      (async () => {
        const newLetters = await generateLetterPool(s?.letterCount || 3, nextWave, s?.totalWaves);
        setLetters(newLetters);
        const validSet = await buildValidWordSet(newLetters);
        setValidWordsSet(validSet);

        if (s?.targetMode) {
          const longWords = Array.from(validSet).filter((w) => w.length >= 7);
          if (longWords.length > 0) {
            setTargetWord(longWords[Math.floor(Math.random() * longWords.length)].toUpperCase());
          }
          setTargetFound(false);
        }

        // NOTE: usedWords is NOT reset between waves — words are globally unique across all waves
        // Auto-start next wave after brief pause for results visibility
        setTimeout(() => {
          startWave(nextWave);
        }, 2000);
      })();
    }
  }, [currentWave, currentWaveWords, letters, settings]);

  // Always keep ref in sync with latest finishWave for timer interval
  finishWaveRef.current = finishWave;

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
        allWaveStats={allWaveStats}
        letterCount={settings.letterCount}
        totalWaves={settings.totalWaves || 3}
        onPlayAgain={() => {
          try { store.clearLocalGameSettings(); } catch {}
          navigate("/solo/links");
        }}
        onHome={() => {
          try { store.clearLocalGameSettings(); } catch {}
          navigate("/");
        }}
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
            {t("solo.waveClear", { n: currentWave - 1 })}
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
          onClick={() => { try { store.clearLocalGameSettings(); } catch {} navigate("/solo/links"); }}
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
            try { store.clearLocalGameSettings(); } catch {}
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
                <span className="text-[10px] font-mono font-bold text-soft-purple/70">
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

        {/* ── Letters display (LetterPool with slot-machine animation) ── */}
        <ClayCard elevation="flat" padding="md" className="w-full max-w-md space-y-3">
          <LetterPool
            letters={letters}
            inputText={typedWord}
            animateKey={letterAnimateKey}
            onAnimationChange={handleLetterAnimationState}
            title=""
            subtitle="These letters must be included in your word"
          />

          {/* Segment shift warning */}
          {hasSegments && isTimerRunning && segmentTimer <= 5 && segmentTimer > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-soft-purple-light/60 border border-soft-purple/20 animate-pulse">
              <Zap className="w-3.5 h-3.5 text-soft-purple" />
              <span className="text-[11px] font-bold text-soft-purple">Letters changing in {segmentTimer}s — type fast!</span>
            </div>
          )}

          {/* Bottom bar: combo (mobile) + End round */}
          <div className="flex items-center justify-center gap-3 pt-1 border-t border-warm-gray/10">
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
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={typedWord}
              onChange={handleWordChange}
              onKeyDown={handleKeyDown}
              placeholder={t("solo.typeWord")}
              className={`flex-1 px-5 py-4 rounded-2xl border-2 bg-warm-white font-outfit font-bold text-lg sm:text-xl
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

            {/* Enter button for mobile */}
            <button
              onClick={handleSubmitWord}
              disabled={wordFeedback.type !== "valid" || !isTimerRunning || isPaused}
              className={`shrink-0 px-5 rounded-2xl font-outfit font-black text-sm uppercase tracking-wider transition-all ${
                wordFeedback.type === "valid" && isTimerRunning && !isPaused
                  ? "bg-soft-purple text-white shadow-lg shadow-soft-purple/30 hover:bg-soft-purple/90 active:scale-95"
                  : "bg-warm-gray/15 text-warm-gray/40 cursor-not-allowed"
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Feedback with breakdown */}
          <div className="flex flex-col items-center justify-center gap-1">
            {wordFeedback.type === "valid" && (() => {
              const poolUsed = countPoolLettersInWord(typedWord, letters);
              const poolMult = getPoolMultiplier(poolUsed);
              const basePt = calculatePoints(typedWord.length);
              const newCombo = combo + 1;
              const comboMult = newCombo >= 10 ? 4 : newCombo >= 7 ? 3 : newCombo >= 4 ? 2 : 1;
              const total = Math.round(basePt * poolMult * comboMult);
              return (
                <>
                  <p className="text-xs font-bold text-mint animate-clay-pop">
                    Press Enter · +{total} pts
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-warm-gray/50">
                    <span>{basePt}</span>
                    <span className="text-soft-purple">×{poolMult}</span>
                    <span className="text-[8px]">({poolUsed} letters)</span>
                    {comboMult > 1 && <><span className="text-butter">×{comboMult}</span><span className="text-[8px]">combo</span></>}
                    <span>= {total}</span>
                  </div>
                </>
              );
            })()}
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
        {!isTimerRunning && !isBetweenWaves && (
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
              {currentWaveWords.map((w, i) => {
                const isExpanded = expandedWord === w.word;
                const pillBaseCls = w.bonus === "power"
                  ? "bg-butter-light text-butter border-butter/30 shadow-sm"
                  : w.bonus === "freeze"
                    ? "bg-sky-light text-sky border-sky/30 shadow-sm"
                    : w.bonus === "target"
                      ? "bg-mint-light text-mint border-mint/30 shadow-sm"
                      : "clay";
                return (
                  <button
                    key={i}
                    onClick={() => setExpandedWord(isExpanded ? null : w.word)}
                    className={`inline-flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-full text-xs font-bold border animate-clay-pop hover:scale-105 active:scale-95 transition-all ${isExpanded ? 'ring-2 ring-soft-purple/30 shadow-md' : ''} ${pillBaseCls}`}
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {w.word}
                      <span className="text-[9px] opacity-60 font-mono">+{w.points}</span>
                      {w.bonus === "power" && <Sparkles className="w-3 h-3" />}
                      {w.bonus === "freeze" && <Clock className="w-3 h-3" />}
                      {w.bonus === "target" && <span>🎯</span>}
                    </span>
                    {isExpanded && (
                      <span className="text-[9px] font-medium opacity-70 whitespace-nowrap text-warm-gray/50">
                        {w.basePoints} base · {w.poolLettersUsed} letters (×{w.poolMultiplier}) · ×{w.comboMultiplier} combo{w.bonus === "power" ? " · ×2 power" : ""}{w.bonus === "target" ? " · +500" : ""} = {w.points}
                      </span>
                    )}
                  </button>
                );
              })}
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
