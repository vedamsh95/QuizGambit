import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Trophy, RotateCcw, Home, Flame, Target, Clock, Star,
  Sparkles, Zap, ChevronDown, ChevronUp, Medal, TrendingUp,
  Swords, Shield, Eye, EyeOff, Anchor, Ghost,
  BarChart3, Brain, Smile, Frown, Layers, Hash,
} from "lucide-react";
import ClayButton from "../ui/ClayButton";
import ClayCard from "../ui/ClayCard";
import ClayBadge from "../ui/ClayBadge";

// ── Types ───────────────────────────────────────────────────────────────────

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

interface SoloEndScreenProps {
  gameType: "quiz" | "links";
  score: number;
  // Quiz-specific
  correctCount?: number;
  wrongCount?: number;
  bestStreak?: number;
  answerTimes?: number[];
  tierStats?: Record<number, { correct: number; wrong: number; times: number[] }>;
  categoryStats?: Record<string, { correct: number; wrong: number; points: number; times: number[] }>;
  starRowBonusEarned?: boolean;
  starColBonusEarned?: boolean;
  totalRounds?: number;
  // Links-specific
  totalWords?: number;
  longestWord?: string;
  bestCombo?: number;
  totalTime?: number;
  targetFound?: boolean;
  allWaveStats?: WaveStats[];
  letterCount?: number;
  totalWaves?: number;
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
    mostRounds: number;
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
    quiz: { highScore: 0, bestStreak: 0, bestAccuracy: 0, fastestAvg: 999, mostRounds: 0 },
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

// ── Roast/Banter messages generator ─────────────────────────────────────────

function getRoasts(stats: {
  weakestLetter: string;
  weakestCount: number;
  strongestLetter: string;
  strongestCount: number;
  powerCount: number;
  bestCombo: number;
  totalWords: number;
  targetFound: boolean;
  wpm: number;
}) {
  const roasts: { icon: React.ReactNode; text: string; color: string }[] = [];

  if (stats.bestCombo >= 7) {
    roasts.push({
      icon: <Flame className="w-4 h-4" />,
      text: `Combo addict! Hit ${stats.bestCombo}× streak! 🔥`,
      color: "butter",
    });
  }

  if (stats.powerCount >= 3) {
    roasts.push({
      icon: <Sparkles className="w-4 h-4" />,
      text: `Power word spammer! ${stats.powerCount} full-pool words 💪`,
      color: "purple",
    });
  }

  if (stats.targetFound) {
    roasts.push({
      icon: <Target className="w-4 h-4" />,
      text: "Bullseye! Target word acquired 🎯",
      color: "mint",
    });
  }

  if (stats.totalWords >= 20) {
    roasts.push({
      icon: <Zap className="w-4 h-4" />,
      text: `Word factory! ${stats.totalWords} words churned out 🏭`,
      color: "sky",
    });
  }

  if (stats.wpm >= 10) {
    roasts.push({
      icon: <TrendingUp className="w-4 h-4" />,
      text: `Speed demon! ${stats.wpm} words per minute ⚡`,
      color: "peach",
    });
  }

  if (stats.weakestCount >= stats.totalWords * 0.6) {
    roasts.push({
      icon: <Anchor className="w-4 h-4" />,
      text: `"${stats.weakestLetter.toUpperCase()}" was in ${stats.weakestCount} words — your security blanket! 🧸`,
      color: "gray",
    });
  }

  if (stats.strongestCount <= 2 && stats.totalWords > 5) {
    roasts.push({
      icon: <Ghost className="w-4 h-4" />,
      text: `"${stats.strongestLetter.toUpperCase()}" only appeared ${stats.strongestCount}× — did you forget it existed? 👻`,
      color: "gray",
    });
  }

  return roasts;
}

// ── Quiz Roasts generator ───────────────────────────────────────────────────

function getQuizRoasts(stats: {
  accuracy: number;
  bestStreak: number;
  avgTime: number;
  totalAnswered: number;
  tierStats?: Record<number, { correct: number; wrong: number; times: number[] }>;
  categoryStats?: Record<string, { correct: number; wrong: number; points: number }>;
  starBonusEarned: boolean;
}) {
  const roasts: { icon: React.ReactNode; text: string; color: string }[] = [];

  if (stats.bestStreak >= 5) {
    roasts.push({ icon: <Flame className="w-4 h-4" />, text: `${stats.bestStreak}× streak — you were on fire! 🔥`, color: "butter" });
  }
  if (stats.avgTime < 3 && stats.totalAnswered > 0) {
    roasts.push({ icon: <Zap className="w-4 h-4" />, text: `Speed demon! ${stats.avgTime.toFixed(1)}s average ⚡`, color: "peach" });
  }
  if (stats.avgTime > 10 && stats.totalAnswered > 0) {
    roasts.push({ icon: <Clock className="w-4 h-4" />, text: `Slow & steady at ${stats.avgTime.toFixed(1)}s — are you reading every word? 🐢`, color: "gray" });
  }
  if (stats.accuracy >= 90 && stats.totalAnswered >= 5) {
    roasts.push({ icon: <Brain className="w-4 h-4" />, text: `${stats.accuracy}% accuracy — big brain energy 🧠`, color: "mint" });
  }
  if (stats.accuracy < 40 && stats.totalAnswered >= 5) {
    roasts.push({ icon: <Frown className="w-4 h-4" />, text: `${stats.accuracy}%... maybe it's just not your day 😅`, color: "gray" });
  }
  // Tier analysis
  if (stats.tierStats) {
    const tiers = [100, 200, 300, 400, 500];
    const tierAccuracies = tiers.map(t => {
      const ts = stats.tierStats![t];
      if (!ts || ts.correct + ts.wrong === 0) return null;
      return { tier: t, acc: Math.round((ts.correct / (ts.correct + ts.wrong)) * 100), total: ts.correct + ts.wrong };
    }).filter(Boolean) as { tier: number; acc: number; total: number }[];

    if (tierAccuracies.length >= 2) {
      const best = tierAccuracies.reduce((a, b) => a.acc > b.acc ? a : b);
      const worst = tierAccuracies.reduce((a, b) => a.acc < b.acc ? a : b);
      if (best.acc === 100 && best.total >= 2) {
        roasts.push({ icon: <Star className="w-4 h-4" />, text: `Perfect on ${best.tier}pt tier — flawless! 💯`, color: "purple" });
      }
      if (worst.tier > best.tier && worst.acc < best.acc - 30) {
        roasts.push({ icon: <TrendingUp className="w-4 h-4" />, text: `Better at ${best.tier}pt than ${worst.tier}pt... overthinking the easy ones? 🤔`, color: "sky" });
      }
    }
  }
  // Star bonus
  if (stats.starBonusEarned) {
    roasts.push({ icon: <Star className="w-4 h-4" />, text: "Star bonus earned! Row/column completion king 👑", color: "butter" });
  }
  // Category mastery
  if (stats.categoryStats) {
    const cats = Object.entries(stats.categoryStats).filter(([, s]) => s.correct + s.wrong >= 2);
    if (cats.length >= 2) {
      const bestCat = cats.reduce((a, b) => {
        const accA = a[1].correct / (a[1].correct + a[1].wrong);
        const accB = b[1].correct / (b[1].correct + b[1].wrong);
        return accA > accB ? a : b;
      });
      const worstCat = cats.reduce((a, b) => {
        const accA = a[1].correct / (a[1].correct + a[1].wrong);
        const accB = b[1].correct / (b[1].correct + b[1].wrong);
        return accA < accB ? a : b;
      });
      if (bestCat[0] !== worstCat[0]) {
        roasts.push({ icon: <Layers className="w-4 h-4" />, text: `"${bestCat[0]}" is your jam — "${worstCat[0]}" not so much 📊`, color: "mint" });
      }
    }
  }
  // Default if nothing else matched
  if (roasts.length === 0 && stats.totalAnswered > 0) {
    roasts.push({ icon: <Smile className="w-4 h-4" />, text: "Solid effort! Every quiz makes you smarter 🧠", color: "purple" });
  }
  return roasts;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SoloEndScreen({
  gameType,
  score,
  correctCount = 0,
  wrongCount = 0,
  bestStreak = 0,
  answerTimes = [],
  tierStats,
  categoryStats,
  starRowBonusEarned = false,
  starColBonusEarned = false,
  totalRounds = 1,
  totalWords = 0,
  longestWord = "",
  bestCombo = 0,
  totalTime = 0,
  targetFound = false,
  allWaveStats = [],
  letterCount = 3,
  totalWaves = 3,
  onPlayAgain,
  onHome,
}: SoloEndScreenProps) {
  const { t } = useTranslation();
  const [bests, setBests] = useState<PersonalBests>(loadBests);
  const [newRecords, setNewRecords] = useState<string[]>([]);
  const [expandedWave, setExpandedWave] = useState<number | null>(null);
  const [showRoasts, setShowRoasts] = useState(true);

  // ── Quiz stats ─────────────────────────────────────────────────────
  const totalAnswered = correctCount + wrongCount;
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const avgTimeNum = answerTimes.length > 0 ? answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length : 0;
  const avgTime = answerTimes.length > 0 ? avgTimeNum.toFixed(1) : "—";

  // ── Quiz tier mastery ──────────────────────────────────────────────
  const tierMastery = useMemo(() => {
    if (gameType !== "quiz" || !tierStats) return null;
    const tiers = [100, 200, 300, 400, 500];
    return tiers.map(t => {
      const ts = tierStats[t];
      if (!ts || ts.correct + ts.wrong === 0) return { tier: t, correct: 0, wrong: 0, total: 0, accuracy: 0, avgTime: 0 };
      const total = ts.correct + ts.wrong;
      return {
        tier: t,
        correct: ts.correct,
        wrong: ts.wrong,
        total,
        accuracy: Math.round((ts.correct / total) * 100),
        avgTime: ts.times.length > 0 ? ts.times.reduce((a, b) => a + b, 0) / ts.times.length : 0,
      };
    }).filter(t => t.total > 0);
  }, [gameType, tierStats]);

  // ── Quiz category mastery ──────────────────────────────────────────
  const catMastery = useMemo(() => {
    if (gameType !== "quiz" || !categoryStats) return null;
    const entries = Object.entries(categoryStats)
      .filter(([, s]) => s.correct + s.wrong > 0)
      .map(([name, s]) => ({
        name,
        correct: s.correct,
        wrong: s.wrong,
        total: s.correct + s.wrong,
        accuracy: Math.round((s.correct / (s.correct + s.wrong)) * 100),
        points: s.points,
        avgTime: s.times.length > 0 ? s.times.reduce((a, b) => a + b, 0) / s.times.length : 0,
      }))
      .sort((a, b) => b.accuracy - a.accuracy);
    return entries;
  }, [gameType, categoryStats]);

  // ── Quiz roasts ────────────────────────────────────────────────────
  const quizRoasts = useMemo(() => {
    if (gameType !== "quiz") return [];
    return getQuizRoasts({
      accuracy,
      bestStreak,
      avgTime: avgTimeNum,
      totalAnswered,
      tierStats,
      categoryStats,
      starBonusEarned: starRowBonusEarned || starColBonusEarned,
    });
  }, [gameType, accuracy, bestStreak, avgTimeNum, totalAnswered, tierStats, categoryStats, starRowBonusEarned, starColBonusEarned]);

  // ── Links stats ─────────────────────────────────────────────────────
  const wpm = totalTime > 0 ? Math.round((totalWords / (totalTime / 60)) * 10) / 10 : 0;
  const allWords = useMemo(
    () => allWaveStats.flatMap((ws) => ws.words),
    [allWaveStats],
  );

  // ── Letter mastery (frequency analysis) ─────────────────────────────
  const letterMastery = useMemo(() => {
    if (gameType !== "links" || allWords.length === 0) return null;

    const poolLetterSet = new Set<string>();
    for (const ws of allWaveStats) {
      for (const w of ws.words) {
        for (const ch of w.word.toLowerCase()) poolLetterSet.add(ch);
      }
    }

    const freq: Record<string, number> = {};
    for (const letter of poolLetterSet) {
      freq[letter] = 0;
    }
    for (const w of allWords) {
      const seen = new Set<string>();
      for (const ch of w.word.toLowerCase()) {
        if (poolLetterSet.has(ch) && !seen.has(ch)) {
          freq[ch] = (freq[ch] || 0) + 1;
          seen.add(ch);
        }
      }
    }

    const sorted = Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);

    const maxCount = sorted[0]?.[1] || 1;
    const weakest = sorted[0];
    const strongest = sorted[sorted.length - 1];
    const hasVariance = weakest && strongest && weakest[1] !== strongest[1];

    return { sorted, maxCount, weakest, strongest: hasVariance ? strongest : null, freq };
  }, [gameType, allWaveStats, allWords]);

  // ── Additional stats ────────────────────────────────────────────────
  const powerCount = useMemo(
    () => allWords.filter((w) => w.bonus === "power").length,
    [allWords],
  );
  const avgWordLength = useMemo(
    () =>
      allWords.length > 0
        ? (allWords.reduce((sum, w) => sum + w.word.length, 0) / allWords.length).toFixed(1)
        : "—",
    [allWords],
  );
  const bestWave = useMemo(() => {
    if (allWaveStats.length === 0) return null;
    let maxIdx = 0;
    allWaveStats.forEach((ws, i) => {
      if (ws.totalPoints > allWaveStats[maxIdx].totalPoints) maxIdx = i;
    });
    return { index: maxIdx + 1, points: allWaveStats[maxIdx].totalPoints };
  }, [allWaveStats]);

  // ── Roasts ──────────────────────────────────────────────────────────
  const roasts = useMemo(() => {
    if (!letterMastery) return [];
    return getRoasts({
      weakestLetter: letterMastery.weakest?.[0] || "?",
      weakestCount: letterMastery.weakest?.[1] || 0,
      strongestLetter: letterMastery.strongest?.[0] || "?",
      strongestCount: letterMastery.strongest?.[1] || 0,
      powerCount,
      bestCombo,
      totalWords,
      targetFound,
      wpm,
    });
  }, [letterMastery, powerCount, bestCombo, totalWords, targetFound, wpm]);

  // ── Title/results text ──────────────────────────────────────────────
  const getTitle = () => {
    if (gameType === "quiz") {
      if (score >= 5000) return "Quiz Legend";
      if (score >= 3000) return "Quiz Master";
      if (score >= 2000) return "Quiz Expert";
      if (score >= 1000) return "Quiz Apprentice";
      if (score >= 500) return "Quiz Rookie";
      return "Quiz Beginner";
    }
    if (score >= 3000) return "Link Legend";
    if (score >= 2000) return "Link Maestro";
    if (score >= 1000) return "Link Master";
    if (score >= 500) return "Link Apprentice";
    return "Link Rookie";
  };

  const getQuizEmoji = () => {
    if (accuracy >= 90 && totalAnswered >= 5) return "🧠";
    if (bestStreak >= 7) return "🔥";
    if (score >= 5000) return "👑";
    if (score >= 3000) return "🌟";
    if (score >= 2000) return "💪";
    if (score >= 1000) return "🎯";
    return "📝";
  };

  const getEmoji = () => {
    if (gameType === "quiz") return getQuizEmoji();
    if (score >= 3000) return "👑";
    if (score >= 2000) return "🌟";
    if (score >= 1000) return "🔥";
    if (score >= 500) return "💡";
    return "🔗";
  };

  // ── Update personal bests ───────────────────────────────────────────
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
      const currentAvg =
        answerTimes.length > 0
          ? answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length
          : 999;
      if (currentAvg < prev.quiz.fastestAvg && answerTimes.length > 0) {
        updated.quiz.fastestAvg = currentAvg;
        records.push("Fastest Avg");
      }
      if (totalRounds > prev.quiz.mostRounds) {
        updated.quiz.mostRounds = totalRounds;
        records.push("Most Rounds");
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
  }, [gameType, score, bestStreak, accuracy, answerTimes, totalRounds, totalWords, longestWord, bestCombo, t]);

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col items-center p-4 sm:p-6 gap-4 sm:gap-5 pb-24 overflow-y-auto">
      {/* ── Hero Section ────────────────────────────────────────────── */}
      <div className="text-center space-y-2 mt-2">
        <div className="text-5xl sm:text-6xl animate-clay-pop">{getEmoji()}</div>
        <h1 className="font-outfit font-black text-3xl sm:text-4xl text-plum tracking-tight">
          {t("gameOver.title")}
        </h1>
        <ClayBadge color={score >= 3000 ? "purple" : score >= 1000 ? "mint" : "gray"}>
          {getTitle()}
        </ClayBadge>

        {/* New records badge */}
        {newRecords.length > 0 && (
          <div className="animate-clay-pop mt-1">
            <ClayBadge color="butter">
              <Star className="w-3 h-3 inline mr-1" />
              {t("solo.newPersonalBest")}
            </ClayBadge>
            <div className="flex flex-wrap justify-center gap-1 mt-1">
              {newRecords.map((r, i) => (
                <span
                  key={i}
                  className="text-[10px] font-bold text-butter/70 bg-butter-light/30 px-2 py-0.5 rounded-full"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Links-specific layout ───────────────────────────────────── */}
      {gameType === "links" && (
        <>
          {/* Score Card */}
          <ClayCard elevation="elevated" padding="lg" className="w-full max-w-sm text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-warm-gray/40 mb-1">
              {t("solo.yourScore")}
            </p>
            <p className="font-outfit font-black text-5xl sm:text-6xl text-soft-purple tracking-tight tabular-nums">
              {score.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-warm-gray/40 mt-1">
              {t("solo.personalBest")}: {bests.links.highScore.toLocaleString()}
            </p>

            <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-warm-gray/10">
              <div className="text-center">
                <p className="text-lg font-outfit font-black text-plum">{totalWords}</p>
                <p className="text-[9px] font-bold text-warm-gray/40 uppercase">{t("solo.wordsFound")}</p>
              </div>
              <div className="w-px h-8 bg-warm-gray/10" />
              <div className="text-center">
                <p className="text-lg font-outfit font-black text-plum">{wpm}</p>
                <p className="text-[9px] font-bold text-warm-gray/40 uppercase">WPM</p>
              </div>
              <div className="w-px h-8 bg-warm-gray/10" />
              <div className="text-center">
                <p className="text-lg font-outfit font-black text-plum">{bestCombo}×</p>
                <p className="text-[9px] font-bold text-warm-gray/40 uppercase">{t("solo.combo")}</p>
              </div>
            </div>
          </ClayCard>

          {/* Link Analysis — Roast Card */}
          {letterMastery && (
            <ClayCard elevation="flat" padding="md" className="w-full max-w-sm border-soft-purple/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-soft-purple/60 flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5" />
                  Link Analysis
                </h3>
                <button
                  onClick={() => setShowRoasts(!showRoasts)}
                  className="text-warm-gray/30 hover:text-warm-gray/50 transition-colors"
                  title={showRoasts ? "Hide roasts" : "Show roasts"}
                >
                  {showRoasts ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Weakest Link */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-peach-light/30 border border-peach/10 mb-2">
                <div className="w-8 h-8 rounded-full bg-peach-light flex items-center justify-center shrink-0">
                  <Anchor className="w-4 h-4 text-peach" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-peach/70">
                    Weakest Link 🔗
                  </p>
                  <p className="text-sm font-outfit font-black text-plum mt-0.5">
                    "{letterMastery.weakest?.[0]?.toUpperCase() || "?"}"{" "}
                    <span className="text-plum/60 font-bold text-xs">
                      appeared in {letterMastery.weakest?.[1] || 0} of {totalWords} words
                    </span>
                  </p>
                  <p className="text-[10px] text-warm-gray/50 italic mt-0.5">
                    The letter that carried you 😅
                  </p>
                </div>
              </div>

              {/* Strongest Link */}
              {letterMastery.strongest && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-sky-light/30 border border-sky/10 mb-2">
                  <div className="w-8 h-8 rounded-full bg-sky-light flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-sky" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-sky/70">
                      Strongest Link 💪
                    </p>
                    <p className="text-sm font-outfit font-black text-plum mt-0.5">
                      "{letterMastery.strongest?.[0]?.toUpperCase() || "?"}"{" "}
                      <span className="text-plum/60 font-bold text-xs">
                        only used in {letterMastery.strongest?.[1] || 0} of {totalWords} words
                      </span>
                    </p>
                    <p className="text-[10px] text-warm-gray/50 italic mt-0.5">
                      The forgotten soldier — barely acknowledged 🥲
                    </p>
                  </div>
                </div>
              )}

              {/* Roast banter */}
              {showRoasts && roasts.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {roasts.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                        r.color === "butter"
                          ? "bg-butter-light/20 text-butter"
                          : r.color === "purple"
                            ? "bg-soft-purple-light/20 text-soft-purple"
                            : r.color === "mint"
                              ? "bg-mint-light/20 text-mint"
                              : r.color === "sky"
                                ? "bg-sky-light/20 text-sky"
                                : r.color === "peach"
                                  ? "bg-peach-light/20 text-peach"
                                  : "bg-cream text-warm-gray"
                      }`}
                    >
                      {r.icon}
                      <span>{r.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </ClayCard>
          )}

          {/* Stats Grid */}
          <div className="w-full max-w-sm grid grid-cols-2 gap-2.5">
            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Medal className="w-3 h-3 text-butter" />
                {t("solo.longestWord")}
              </p>
              <p className="font-outfit font-black text-lg text-plum truncate px-1">
                {longestWord || "—"}
              </p>
              <p className="text-[9px] text-warm-gray/40">{longestWord?.length || 0} letters</p>
            </ClayCard>
            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Flame className="w-3 h-3 text-butter" />
                {t("solo.combo")}
              </p>
              <p className="font-outfit font-black text-lg text-plum">{bestCombo}×</p>
              <p className="text-[9px] text-warm-gray/40">PB: {bests.links.bestCombo}×</p>
            </ClayCard>
            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3 text-soft-purple" />
                Power Words
              </p>
              <p className="font-outfit font-black text-lg text-plum">{powerCount}</p>
              <p className="text-[9px] text-warm-gray/40">all {letterCount} letters used</p>
            </ClayCard>
            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Target className="w-3 h-3 text-mint" />
                Target Word
              </p>
              <p className={`font-outfit font-black text-lg ${targetFound ? "text-mint" : "text-warm-gray/40"}`}>
                {targetFound ? "✓ +500" : "—"}
              </p>
              <p className="text-[9px] text-warm-gray/40">bonus</p>
            </ClayCard>
            {bestWave && (
              <ClayCard elevation="flat" padding="sm" className="text-center col-span-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3 text-soft-purple" />
                  Best Wave
                </p>
                <p className="font-outfit font-black text-lg text-plum">
                  🌊 Wave {bestWave.index} · {bestWave.points.toLocaleString()} pts
                </p>
              </ClayCard>
            )}
            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1">Avg Length</p>
              <p className="font-outfit font-black text-lg text-plum">{avgWordLength}</p>
              <p className="text-[9px] text-warm-gray/40">letters per word</p>
            </ClayCard>
            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3 text-sky" />
                Words/Min
              </p>
              <p className="font-outfit font-black text-lg text-plum">{wpm}</p>
              <p className="text-[9px] text-warm-gray/40">{totalTime}s total</p>
            </ClayCard>
          </div>

          {/* Letter Mastery — Bar Chart */}
          {letterMastery && letterMastery.sorted.length > 0 && (
            <ClayCard elevation="flat" padding="md" className="w-full max-w-sm">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-warm-gray/50 mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Letter Mastery
              </h3>
              <div className="space-y-1.5">
                {letterMastery.sorted.map(([letter, count]) => {
                  const barWidth = Math.max(4, Math.round((count / letterMastery.maxCount) * 100));
                  const isWeakest = letter === letterMastery.weakest?.[0];
                  const isStrongest = !!(letterMastery.strongest && letter === letterMastery.strongest[0]);
                  return (
                    <div key={letter} className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-outfit font-black shrink-0 ${
                        isWeakest ? "bg-peach-light text-peach" : isStrongest ? "bg-sky-light text-sky" : "bg-warm-white text-plum/70 border border-warm-gray/10"
                      }`}>
                        {letter.toUpperCase()}
                      </span>
                      <div className="flex-1 h-5 bg-warm-gray/5 rounded-full overflow-hidden relative">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          isWeakest ? "bg-peach/30" : isStrongest ? "bg-sky/30" : "bg-soft-purple/20"
                        }`} style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className="w-5 text-right text-[10px] font-mono font-bold text-warm-gray/50">{count}</span>
                      {isWeakest && <span className="text-[8px] font-black text-peach/60 uppercase w-12 text-right">weakest</span>}
                      {isStrongest && <span className="text-[8px] font-black text-sky/60 uppercase w-12 text-right">strongest</span>}
                    </div>
                  );
                })}
              </div>
            </ClayCard>
          )}

          {/* Wave Breakdowns */}
          {allWaveStats.length > 0 && (
            <ClayCard elevation="flat" padding="md" className="w-full max-w-sm">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-warm-gray/50 mb-3 flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5" />
                Wave Breakdown · {totalWaves} waves
              </h3>
              <div className="space-y-2">
                {allWaveStats.map((ws, i) => {
                  const isExpanded = expandedWave === i;
                  return (
                    <div key={i}>
                      <button
                        onClick={() => setExpandedWave(isExpanded ? null : i)}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-warm-white border border-warm-gray/10 hover:border-soft-purple/20 transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-full bg-soft-purple-light flex items-center justify-center text-[10px] font-black text-soft-purple">{i + 1}</span>
                          <div className="text-left">
                            <p className="text-sm font-outfit font-black text-plum">🌊 Wave {i + 1}</p>
                            <p className="text-[10px] text-warm-gray/40">{ws.words.length} words · {ws.totalPoints.toLocaleString()} pts</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {ws.longestWord && <span className="text-[10px] font-bold text-soft-purple/60 bg-soft-purple-light/30 px-2 py-0.5 rounded-full hidden sm:inline">{ws.longestWord}</span>}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-warm-gray/30" /> : <ChevronDown className="w-4 h-4 text-warm-gray/30" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="mt-1.5 ml-2 pl-8 pr-2 py-2 space-y-1 animate-slide-up-fade">
                          {ws.words.length === 0 ? (
                            <p className="text-xs text-warm-gray/40 italic">No words in this wave</p>
                          ) : (
                            ws.words.map((w, j) => (
                              <div key={j} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-warm-white/50 transition-colors">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className={`font-bold truncate ${
                                    w.bonus === "power" ? "text-butter" : w.bonus === "freeze" ? "text-sky" : w.bonus === "target" ? "text-mint" : "text-plum/80"
                                  }`}>{w.word}</span>
                                  {w.bonus && <span className="text-[9px] shrink-0">{w.bonus === "power" && "⚡"}{w.bonus === "freeze" && "❄️"}{w.bonus === "target" && "🎯"}</span>}
                                </div>
                                <span className="text-[10px] font-mono font-bold text-soft-purple shrink-0 ml-2">+{w.points}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ClayCard>
          )}
        </>
      )}

      {/* ── Quiz-specific layout ──────────────────────────────────── */}
      {gameType === "quiz" && (
        <>
          {/* Score Card */}
          <ClayCard elevation="elevated" padding="lg" className="w-full max-w-sm text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-warm-gray/40 mb-1">
              {t("solo.yourScore")}
            </p>
            <p className="font-outfit font-black text-5xl sm:text-6xl text-soft-purple tracking-tight tabular-nums">
              {score.toLocaleString()}
            </p>
            <p className="text-[10px] font-bold text-warm-gray/40 mt-1">
              {t("solo.personalBest")}: {bests.quiz.highScore.toLocaleString()}
            </p>

            <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-warm-gray/10">
              <div className="text-center">
                <p className="text-lg font-outfit font-black text-plum">{accuracy}%</p>
                <p className="text-[9px] font-bold text-warm-gray/40 uppercase">{t("solo.accuracy")}</p>
              </div>
              <div className="w-px h-8 bg-warm-gray/10" />
              <div className="text-center">
                <p className="text-lg font-outfit font-black text-plum">{bestStreak}&times;</p>
                <p className="text-[9px] font-bold text-warm-gray/40 uppercase">Best Streak</p>
              </div>
              <div className="w-px h-8 bg-warm-gray/10" />
              <div className="text-center">
                <p className="text-lg font-outfit font-black text-plum">{totalAnswered}</p>
                <p className="text-[9px] font-bold text-warm-gray/40 uppercase">Answered</p>
              </div>
            </div>
          </ClayCard>

          {/* Core Stats Grid */}
          <div className="w-full max-w-sm grid grid-cols-2 gap-2.5">
            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Target className="w-3 h-3 text-mint" />
                {t("solo.accuracy")}
              </p>
              <p className="font-outfit font-black text-lg text-plum">{accuracy}%</p>
              <p className="text-[9px] text-warm-gray/40">{correctCount} ✓ · {wrongCount} ✗</p>
            </ClayCard>

            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Flame className="w-3 h-3 text-butter" />
                {t("solo.longestStreak")}
              </p>
              <p className="font-outfit font-black text-lg text-plum">{bestStreak}&times;</p>
              <p className="text-[9px] text-warm-gray/40">PB: {bests.quiz.bestStreak}&times;</p>
            </ClayCard>

            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3 text-sky" />
                Avg Time
              </p>
              <p className="font-mono font-bold text-lg text-plum">{avgTime}s</p>
              <p className="text-[9px] text-warm-gray/40">
                {bests.quiz.fastestAvg < 999 ? `PB: ${bests.quiz.fastestAvg.toFixed(1)}s` : ""}
              </p>
            </ClayCard>

            <ClayCard elevation="flat" padding="sm" className="text-center">
              <p className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40 mb-1 flex items-center justify-center gap-1">
                <Layers className="w-3 h-3 text-soft-purple" />
                Rounds
              </p>
              <p className="font-outfit font-black text-lg text-plum">{totalRounds}</p>
              <p className="text-[9px] text-warm-gray/40">PB: {bests.quiz.mostRounds}</p>
            </ClayCard>
          </div>

          {/* Tier Mastery */}
          {tierMastery && tierMastery.length > 0 && (
            <ClayCard elevation="flat" padding="md" className="w-full max-w-sm">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-warm-gray/50 mb-3 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" />
                Tier Mastery
              </h3>
              <div className="space-y-2">
                {tierMastery.map((tm) => {
                  const barPct = Math.max(5, tm.accuracy);
                  const barColor = tm.accuracy >= 80 ? "bg-mint" : tm.accuracy >= 50 ? "bg-butter" : "bg-peach";
                  const emoji = tm.accuracy >= 80 ? "🔥" : tm.accuracy >= 50 ? "👍" : "💀";
                  return (
                    <div key={tm.tier} className="flex items-center gap-2">
                      <span className="w-10 text-right text-[10px] font-outfit font-black text-plum/70 shrink-0">
                        {tm.tier}pt
                      </span>
                      <div className="flex-1 h-6 bg-warm-gray/5 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                          style={{ width: `${barPct}%`, opacity: 0.25 + (barPct / 200) }}
                        />
                        <div className="absolute inset-0 flex items-center px-2 justify-between text-[9px] font-bold">
                          <span className="text-plum/70">{tm.correct}/{tm.total}</span>
                          <span className="text-plum/50">{tm.avgTime > 0 ? `${tm.avgTime.toFixed(1)}s` : ""}</span>
                        </div>
                      </div>
                      <span className={`w-6 text-center text-xs shrink-0 ${tm.accuracy >= 80 ? "text-mint" : tm.accuracy >= 50 ? "text-butter" : "text-peach"}`}>
                        {emoji}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ClayCard>
          )}

          {/* Category Mastery */}
          {catMastery && catMastery.length > 0 && (
            <ClayCard elevation="flat" padding="md" className="w-full max-w-sm">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-warm-gray/50 mb-3 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                Category Mastery
              </h3>
              <div className="space-y-1.5">
                {catMastery.map((cm) => {
                  const barPct = Math.max(5, cm.accuracy);
                  const barColor = cm.accuracy >= 80 ? "bg-mint" : cm.accuracy >= 50 ? "bg-butter" : "bg-peach";
                  return (
                    <div key={cm.name} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-plum/70 truncate w-24 shrink-0 text-right">
                        {cm.name}
                      </span>
                      <div className="flex-1 h-5 bg-warm-gray/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                          style={{ width: `${barPct}%`, opacity: 0.2 + (barPct / 250) }}
                        />
                      </div>
                      <span className="w-10 text-right text-[10px] font-mono font-bold text-plum/50 shrink-0">
                        {cm.accuracy}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </ClayCard>
          )}

          {/* Roasts */}
          {quizRoasts.length > 0 && (
            <ClayCard elevation="flat" padding="md" className="w-full max-w-sm border-soft-purple/10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-soft-purple/60 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  Analysis
                </h3>
                <button
                  onClick={() => setShowRoasts(!showRoasts)}
                  className="text-warm-gray/30 hover:text-warm-gray/50 transition-colors"
                  title={showRoasts ? "Hide" : "Show"}
                >
                  {showRoasts ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {showRoasts && (
                <div className="space-y-1.5">
                  {quizRoasts.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                        r.color === "butter" ? "bg-butter-light/20 text-butter"
                        : r.color === "purple" ? "bg-soft-purple-light/20 text-soft-purple"
                        : r.color === "mint" ? "bg-mint-light/20 text-mint"
                        : r.color === "sky" ? "bg-sky-light/20 text-sky"
                        : r.color === "peach" ? "bg-peach-light/20 text-peach"
                        : "bg-cream text-warm-gray"
                      }`}
                    >
                      {r.icon}
                      <span>{r.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </ClayCard>
          )}

          {/* Star Bonus Earned */}
          {(starRowBonusEarned || starColBonusEarned) && (
            <ClayCard elevation="flat" padding="sm" className="w-full max-w-sm text-center border-butter/20 bg-butter-light/10">
              <div className="flex items-center justify-center gap-2">
                <Star className="w-5 h-5 text-butter" />
                <span className="text-sm font-outfit font-black text-butter">
                  {starRowBonusEarned && starColBonusEarned
                    ? "Row + Column bonus earned! ⭐⭐"
                    : starRowBonusEarned
                      ? "Row bonus earned! ⭐"
                      : "Column bonus earned! ⭐"}
                </span>
              </div>
            </ClayCard>
          )}
        </>
      )}

      {/* ── Action Buttons ─────────────────────────────────────────────── */}
      <div className="w-full max-w-sm flex gap-3 mt-2">
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

      {/* ── Subtle footer ──────────────────────────────────────────────── */}
      {gameType === "links" && (
        <p className="text-[10px] text-warm-gray/30 tracking-[0.2em] uppercase text-center">
          {letterCount} letters · {totalWaves} waves · {totalWords} words
        </p>
      )}
      {gameType === "quiz" && (
        <p className="text-[10px] text-warm-gray/30 tracking-[0.2em] uppercase text-center">
          {totalRounds} round{totalRounds !== 1 ? "s" : ""} · {totalAnswered} questions · {accuracy}% accuracy
        </p>
      )}
    </div>
  );
}
