import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, RotateCcw, Home, Flame, Target, Clock, Star } from "lucide-react";
import ClayButton from "../ui/ClayButton";

// ── Types ───────────────────────────────────────────────────────────────────

interface SoloEndScreenProps {
  gameType: "quiz" | "links";
  score: number;
  // Quiz-specific
  correctCount?: number;
  wrongCount?: number;
  bestStreak?: number;
  answerTimes?: number[];
  // Links-specific
  totalWords?: number;
  longestWord?: string;
  bestCombo?: number;
  totalTime?: number;
  targetFound?: boolean;
  // Actions
  onPlayAgain: () => void;
  onHome: () => void;
}

// ── Personal bests ──────────────────────────────────────────────────────────

interface PersonalBests {
  quiz: {
    highScore: number;
    bestStreak: number;
    bestAccuracy: number;
    fastestAvg: number;
  };
  links: {
    highScore: number;
    mostWords: number;
    longestWord: string;
    bestCombo: number;
  };
}

const STORAGE_KEY = "qb_solo_bests";

function loadBests(): PersonalBests {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {
    quiz: { highScore: 0, bestStreak: 0, bestAccuracy: 0, fastestAvg: 999 },
    links: { highScore: 0, mostWords: 0, longestWord: "", bestCombo: 0 },
  };
}

function saveBests(bests: PersonalBests) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bests));
  } catch {
    // Storage full or unavailable — ignore
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SoloEndScreen({
  gameType,
  score,
  correctCount = 0,
  wrongCount = 0,
  bestStreak = 0,
  answerTimes = [],
  totalWords = 0,
  longestWord = "",
  bestCombo = 0,
  totalTime = 0,
  targetFound = false,
  onPlayAgain,
  onHome,
}: SoloEndScreenProps) {
  const { t } = useTranslation();
  const [bests, setBests] = useState<PersonalBests>(loadBests);
  const [newRecords, setNewRecords] = useState<string[]>([]);

  // Calculate stats
  const totalAnswered = correctCount + wrongCount;
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const avgTime = answerTimes.length > 0
    ? (answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length).toFixed(1)
    : "—";
  const wordsPerMin = totalTime > 0 ? Math.round((totalWords / (totalTime / 60)) * 10) / 10 : 0;

  // Update personal bests
  useEffect(() => {
    const prev = loadBests();
    const updated = { ...prev };
    const records: string[] = [];

    if (gameType === "quiz") {
      if (score > prev.quiz.highScore) {
        updated.quiz.highScore = score;
        records.push(t("solo.personalBest"));
      }
      if (bestStreak > prev.quiz.bestStreak) {
        updated.quiz.bestStreak = bestStreak;
        records.push(t("gameOver.stats_bestStreak"));
      }
      if (accuracy > prev.quiz.bestAccuracy) {
        updated.quiz.bestAccuracy = accuracy;
        records.push(t("solo.accuracy"));
      }
      const currentAvg = answerTimes.length > 0
        ? answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length
        : 999;
      if (currentAvg < prev.quiz.fastestAvg && answerTimes.length > 0) {
        updated.quiz.fastestAvg = currentAvg;
        records.push("Fastest Avg");
      }
    } else {
      if (score > prev.links.highScore) {
        updated.links.highScore = score;
        records.push(t("solo.personalBest"));
      }
      if (totalWords > prev.links.mostWords) {
        updated.links.mostWords = totalWords;
        records.push(t("solo.wordsFound"));
      }
      if (longestWord && longestWord.length > (prev.links.longestWord?.length || 0)) {
        updated.links.longestWord = longestWord;
        records.push(t("solo.longestWord"));
      }
      if (bestCombo > prev.links.bestCombo) {
        updated.links.bestCombo = bestCombo;
        records.push(t("solo.combo"));
      }
    }

    saveBests(updated);
    setBests(updated);
    setNewRecords(records);
  }, [gameType, score, bestStreak, accuracy, answerTimes, totalWords, longestWord, bestCombo, t]);

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-6 gap-6">
      {/* Trophy & title */}
      <div className="text-center space-y-3">
        <div className="text-6xl animate-clay-pop">
          {gameType === "quiz" ? "🏆" : "🔗"}
        </div>
        <h1 className="font-outfit font-black text-4xl text-plum">
          {t("gameOver.title")}
        </h1>
        {newRecords.length > 0 && (
          <div className="bg-butter-light border border-butter/30 rounded-2xl px-4 py-2 animate-clay-pop">
            <p className="text-butter text-sm font-black flex items-center gap-2 justify-center">
              <Star className="w-4 h-4" />
              {t("solo.newPersonalBest")}
            </p>
            {newRecords.map((r, i) => (
              <p key={i} className="text-butter/70 text-xs font-bold">{r}</p>
            ))}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="w-full max-w-sm grid grid-cols-2 gap-3">
        {/* Score */}
        <div className="clay-elevated p-4 text-center col-span-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-warm-gray/50">
            {t("solo.yourScore")}
          </p>
          <p className="font-outfit font-black text-3xl text-soft-purple">{score}</p>
          {gameType === "quiz" && (
            <p className="text-[10px] text-warm-gray/40">
              {t("solo.personalBest")}: {bests.quiz.highScore}
            </p>
          )}
          {gameType === "links" && (
            <p className="text-[10px] text-warm-gray/40">
              {t("solo.personalBest")}: {bests.links.highScore}
            </p>
          )}
        </div>

        {gameType === "quiz" && (
          <>
            {/* Accuracy */}
            <div className="clay p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                {t("solo.accuracy")}
              </p>
              <p className="font-outfit font-black text-xl text-plum">{accuracy}%</p>
              <p className="text-[9px] text-warm-gray/40">
                {correctCount}/{totalAnswered}
              </p>
            </div>

            {/* Best streak */}
            <div className="clay p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                {t("solo.longestStreak")}
              </p>
              <div className="flex items-center justify-center gap-1">
                <Flame className="w-4 h-4 text-butter" />
                <span className="font-outfit font-black text-xl text-plum">{bestStreak}</span>
              </div>
              <p className="text-[9px] text-warm-gray/40">
                {t("solo.personalBest")}: {bests.quiz.bestStreak}
              </p>
            </div>

            {/* Avg time */}
            <div className="clay p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                Avg Time
              </p>
              <div className="flex items-center justify-center gap-1">
                <Clock className="w-4 h-4 text-sky" />
                <span className="font-mono font-bold text-lg text-plum">{avgTime}s</span>
              </div>
            </div>

            {/* Fast avg best */}
            <div className="clay p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                Fastest Avg
              </p>
              <p className="font-mono font-bold text-lg text-mint">
                {bests.quiz.fastestAvg < 999 ? `${bests.quiz.fastestAvg.toFixed(1)}s` : "—"}
              </p>
            </div>
          </>
        )}

        {gameType === "links" && (
          <>
            {/* Total words */}
            <div className="clay p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                {t("solo.wordsFound")}
              </p>
              <p className="font-outfit font-black text-xl text-plum">{totalWords}</p>
              <p className="text-[9px] text-warm-gray/40">
                {t("solo.personalBest")}: {bests.links.mostWords}
              </p>
            </div>

            {/* Longest word */}
            <div className="clay p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                {t("solo.longestWord")}
              </p>
              <p className="font-outfit font-black text-lg text-plum truncate">{longestWord || "—"}</p>
              <p className="text-[9px] text-warm-gray/40">
                {longestWord?.length || 0} letters
              </p>
            </div>

            {/* Best combo */}
            <div className="clay p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                {t("solo.combo")}
              </p>
              <div className="flex items-center justify-center gap-1">
                <Flame className="w-4 h-4 text-butter" />
                <span className="font-outfit font-black text-xl text-plum">{bestCombo}</span>
              </div>
            </div>

            {/* Target found */}
            <div className="clay p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                {t("solo.targetWord")}
              </p>
              <div className="flex items-center justify-center gap-1">
                <Target className="w-4 h-4 text-mint" />
                <span className={`font-outfit font-black text-lg ${targetFound ? "text-mint" : "text-warm-gray/40"}`}>
                  {targetFound ? "✓" : "—"}
                </span>
              </div>
            </div>

            {/* Words per minute */}
            <div className="clay p-3 text-center col-span-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/50">
                {t("solo.wordsPerMin")}
              </p>
              <p className="font-outfit font-black text-xl text-plum">{wordsPerMin}</p>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 w-full max-w-sm">
        <ClayButton
          variant="secondary"
          size="lg"
          className="flex-1"
          icon={<Home className="w-4 h-4" />}
          onClick={onHome}
        >
          {t("gameOver.home")}
        </ClayButton>
        <ClayButton
          variant="primary"
          size="lg"
          className="flex-1"
          icon={<RotateCcw className="w-4 h-4" />}
          onClick={onPlayAgain}
        >
          {t("gameOver.playAgain")}
        </ClayButton>
      </div>
    </div>
  );
}
