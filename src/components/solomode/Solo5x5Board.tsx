import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { store } from "../../lib/storage";
import {
  ArrowLeft, Zap, Flame, Timer, Star, Settings, SkipForward,
  Shuffle, Eye, XCircle, CheckCircle,
} from "lucide-react";
import ClayButton from "../ui/ClayButton";
import ClayTile, { type TileColor } from "../ui/ClayTile";
import ClayCard from "../ui/ClayCard";
import ClayBadge from "../ui/ClayBadge";
import SoloEndScreen from "./SoloEndScreen";

// ── Types ───────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  points: number;
  category?: string;
}

interface GridTile {
  id: string;
  points: number;
  color: TileColor;
  question: Question | null;
  state: "unrevealed" | "revealed" | "disabled";
  answer?: string;
  isEliminator: boolean;
  categoryName?: string;
}

interface GameSettings {
  rounds: number;
  timer: number;
  randomPicker: boolean;
  categories: any[];
  roundCategories: Record<number, any[]>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TILE_COLORS: TileColor[] = ["purple", "sky", "peach", "mint", "butter"];
const POINT_VALUES = [100, 200, 300, 400, 500];

const CAT_EMOJI_MAP: Record<string, string> = {
  literature: "📚", books: "📚", reading: "📚", writing: "📚",
  science: "🔬", biology: "🧬", chemistry: "🧪", physics: "⚛️", astronomy: "🔭",
  history: "🏛️", geography: "🌍", countries: "🌍", world: "🌍",
  movies: "🎬", film: "🎬", cinema: "🎬", tv: "📺", television: "📺",
  music: "🎵", songs: "🎵", bands: "🎸", artists: "🎤",
  sports: "⚽", football: "⚽", basketball: "🏀", cricket: "🏏",
  technology: "💻", tech: "💻", computers: "💻", programming: "💻",
  art: "🎨", painting: "🎨",
  mythology: "🏺", religion: "🕊️", philosophy: "🤔",
  math: "🔢", mathematics: "🔢", numbers: "🔢",
  nature: "🌿", animals: "🐾", plants: "🌱",
  food: "🍕", cooking: "👨‍🍳", cuisine: "🍽️",
  space: "🚀", nasa: "🚀", planets: "🪐",
  gaming: "🎮", games: "🎮", video_games: "🎮",
};

function getCategoryEmoji(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9_]/g, "").trim();
  for (const [kw, emoji] of Object.entries(CAT_EMOJI_MAP)) {
    if (key.includes(kw)) return emoji;
  }
  return "📖";
}

function getCategoryDisplayName(name: string): string {
  return (name || "").replace(" (Arena)", "").trim();
}

function getCatFontSize(name: string): string {
  const len = name.length;
  if (len <= 4) return "text-[11px]";
  if (len <= 7) return "text-[10px]";
  if (len <= 10) return "text-[9px]";
  return "text-[8px]";
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Solo5x5Board() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── State ────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [grid, setGrid] = useState<GridTile[][]>([]);
  const [categoryColumns, setCategoryColumns] = useState<{ name: string; emoji: string; color: TileColor }[]>([]);
  const [activeTile, setActiveTile] = useState<GridTile | null>(null);
  const [activeCoords, setActiveCoords] = useState<{ row: number; col: number } | null>(null);
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(1);
  const [eliminatorCleared, setEliminatorCleared] = useState(false);
  const [randomPicker, setRandomPicker] = useState(true);
  const [showOptions, setShowOptions] = useState(false);

  // Stats for end screen
  const [answerTimes, setAnswerTimes] = useState<number[]>([]);
  const lastAnswerTime = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load settings & build grid ──────────────────────────────────────
  useEffect(() => {
    const s = store.getLocalGameSettings();
    if (!s || !s.roundCategories) {
      navigate("/solo/5x5");
      return;
    }
    setSettings(s);
    setRandomPicker(s.randomPicker);
    buildGrid(s, 1);
    setLoading(false);
  }, []);

  const buildGrid = useCallback((s: GameSettings, roundNum: number) => {
    const roundCats = s.roundCategories[roundNum] || [];
    const newGrid: GridTile[][] = [];
    const allQuestions: { catName: string; data: any[] }[] = roundCats;

    // Build category column headers
    const catHeaders = roundCats.map((cat: any, idx: number) => ({
      name: getCategoryDisplayName(cat.name || cat.catName || ""),
      emoji: getCategoryEmoji(cat.name || cat.catName || ""),
      color: TILE_COLORS[idx % TILE_COLORS.length],
    }));
    setCategoryColumns(catHeaders);

    // Select one random tile as eliminator
    const elimRow = Math.floor(Math.random() * 5);
    const elimCol = Math.floor(Math.random() * 5);

    for (let row = 0; row < 5; row++) {
      const gridRow: GridTile[] = [];
      for (let col = 0; col < 5; col++) {
        const points = POINT_VALUES[row];
        const colorIdx = col % 5;
        let question: Question | null = null;
        let catName = "";
        for (const catData of allQuestions) {
          const q = (catData.data || []).find(
            (q: any) => q.points === points
          );
          if (q) {
            question = {
              id: q.id || `${catData.catName}-${points}`,
              question_text: q.question_text || q.question,
              options: q.options || [],
              correct_answer: q.correct_answer,
              points: q.points,
              category: catData.catName || (catData as any).name,
            };
            catName = q.category || catData.catName || (catData as any).name || "";
            break;
          }
        }

        gridRow.push({
          id: `${row}-${col}`,
          points,
          color: TILE_COLORS[colorIdx],
          question,
          state: question ? "unrevealed" : "disabled",
          isEliminator: row === elimRow && col === elimCol,
          categoryName: getCategoryDisplayName(catName),
        });
      }
      newGrid.push(gridRow);
    }
    setGrid(newGrid);
    setEliminatorCleared(false);
  }, []);

  // ── Handle tile click ────────────────────────────────────────────────
  const handleTileClick = useCallback(
    (row: number, col: number) => {
      if (isTimerRunning || activeTile) return;
      const tile = grid[row]?.[col];
      if (!tile || tile.state !== "unrevealed") return;

      setActiveTile(tile);
      setActiveCoords({ row, col });
      setSelectedAnswer(null);
      setIsAnswerRevealed(false);
      setTimer(settings?.timer || 15);
      setIsTimerRunning(true);
      lastAnswerTime.current = Date.now();
      setShowOptions(false);
    },
    [grid, isTimerRunning, activeTile, settings]
  );

  // ── Skip current tile ───────────────────────────────────────────────
  const handleSkipTile = useCallback(() => {
    if (!activeTile || !activeCoords) return;
    setIsTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);

    setGrid((prev) => {
      const newGrid = [...prev.map((r) => [...r])];
      const { row, col } = activeCoords;
      newGrid[row][col] = {
        ...newGrid[row][col],
        state: "revealed",
        answer: "⏭",
      };
      return newGrid;
    });

    setActiveTile(null);
    setActiveCoords(null);
    setSelectedAnswer(null);
    setIsAnswerRevealed(false);
    setShowOptions(false);
  }, [activeTile, activeCoords]);

  // ── Timer logic ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTimerRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimer((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  // ── Timer expiry handler ──────────────────────────────────────────
  useEffect(() => {
    if (isTimerRunning && timer <= 0) {
      setIsTimerRunning(false);
      setIsAnswerRevealed(true);
    }
  }, [timer, isTimerRunning]);

  // ── Handle answer select ─────────────────────────────────────────────
  const handleAnswerSelect = useCallback(
    (answer: string) => {
      if (!isTimerRunning || isAnswerRevealed) return;
      setIsTimerRunning(false);
      setSelectedAnswer(answer);
      setIsAnswerRevealed(true);
    },
    [isTimerRunning, isAnswerRevealed]
  );

  // ── Self-grade ──────────────────────────────────────────────────────
  const handleSelfGrade = useCallback(
    (gotItRight: boolean) => {
      if (!activeTile || !activeCoords) return;

      const actualCorrect = selectedAnswer === activeTile.question?.correct_answer;
      const isCorrect = selectedAnswer !== null
        ? (gotItRight && actualCorrect) || (!gotItRight && !actualCorrect)
        : false;

      const timeSpent = (Date.now() - lastAnswerTime.current) / 1000;
      const basePoints = activeTile.points;
      let earnedPoints = 0;

      if (isCorrect) {
        const newStreak = streak + 1;
        setStreak(newStreak);
        if (newStreak > bestStreak) setBestStreak(newStreak);

        const multiplier = newStreak >= 5 ? 3 : 1 + (newStreak - 1) * 0.5;
        earnedPoints = Math.round(basePoints * multiplier);

        const maxTime = settings?.timer || 15;
        const timeBonus = Math.round(basePoints * 0.5 * Math.max(0, (maxTime - timeSpent) / maxTime));
        earnedPoints += timeBonus;

        if (activeTile.isEliminator && !eliminatorCleared) {
          setEliminatorCleared(true);
          const { row, col } = activeCoords;
          setGrid((prev) => {
            const newGrid = [...prev.map((r) => [...r])];
            for (let c = 0; c < 5; c++) {
              if (newGrid[row][c].state === "unrevealed" && !(row === activeCoords.row && c === activeCoords.col)) {
                earnedPoints += newGrid[row][c].points;
                newGrid[row][c] = { ...newGrid[row][c], state: "revealed", answer: "CLEARED" };
              }
            }
            for (let r = 0; r < 5; r++) {
              if (newGrid[r][col].state === "unrevealed" && !(r === activeCoords.row && col === activeCoords.col)) {
                earnedPoints += newGrid[r][col].points;
                newGrid[r][col] = { ...newGrid[r][col], state: "revealed", answer: "CLEARED" };
              }
            }
            return newGrid;
          });
        }

        setCorrectCount((c) => c + 1);
      } else {
        setStreak(0);
        setWrongCount((c) => c + 1);
      }

      setScore((s) => s + earnedPoints);
      setAnswerTimes((prev) => [...prev, timeSpent]);

      setGrid((prev) => {
        const newGrid = [...prev.map((r) => [...r])];
        const { row, col } = activeCoords;
        newGrid[row][col] = {
          ...newGrid[row][col],
          state: "revealed",
          answer: isCorrect ? "✓" : "✗",
        };
        return newGrid;
      });

      setActiveTile(null);
      setActiveCoords(null);
      setSelectedAnswer(null);
      setIsAnswerRevealed(false);
      setShowOptions(false);
    },
    [activeTile, activeCoords, selectedAnswer, streak, bestStreak, settings, eliminatorCleared]
  );

  // ── Auto-pick next tile (random picker) ──────────────────────────────
  useEffect(() => {
    if (autoPickRef.current) clearTimeout(autoPickRef.current);

    if (!activeTile && randomPicker && !gameOver && !loading) {
      const unrevealed: { row: number; col: number }[] = [];
      grid.forEach((row, rIdx) => {
        row.forEach((tile, cIdx) => {
          if (tile.state === "unrevealed") {
            unrevealed.push({ row: rIdx, col: cIdx });
          }
        });
      });

      if (unrevealed.length > 0) {
        const delay = 600;
        autoPickRef.current = setTimeout(() => {
          const random = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          handleTileClick(random.row, random.col);
        }, delay);
      } else if (!gameOver) {
        if (round < (settings?.rounds || 1)) {
          const nextRound = round + 1;
          setRound(nextRound);
          buildGrid(settings!, nextRound);
        } else {
          setGameOver(true);
        }
      }
    }

    return () => {
      if (autoPickRef.current) clearTimeout(autoPickRef.current);
    };
  }, [activeTile, randomPicker, gameOver, loading, grid, round, settings, handleTileClick, buildGrid]);

  // ── Toggle random picker mid-game ────────────────────────────────────
  const toggleRandomPicker = useCallback(() => {
    setRandomPicker((prev) => !prev);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (isAnswerRevealed && activeTile) {
        if (e.key === "y" || e.key === "Y") {
          handleSelfGrade(true);
        } else if (e.key === "n" || e.key === "N") {
          handleSelfGrade(false);
        } else if (e.key === " ") {
          e.preventDefault();
          handleSkipTile();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswerRevealed, activeTile, handleSelfGrade, handleSkipTile]);

  // ── Derived data ─────────────────────────────────────────────────────
  const unrevealedCount = useMemo(
    () => grid.flat().filter((t) => t.state === "unrevealed").length,
    [grid]
  );

  const timerPercent = settings ? (timer / (settings.timer || 15)) * 100 : 0;
  const timerUrgent = timer <= 5;
  const timerWarn = timer <= 10 && timer > 5;

  // ── Loading state ───────────────────────────────────────────────────
  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Game Over ────────────────────────────────────────────────────────
  if (gameOver) {
    return (
      <SoloEndScreen
        gameType="quiz"
        score={score}
        correctCount={correctCount}
        wrongCount={wrongCount}
        bestStreak={bestStreak}
        answerTimes={answerTimes}
        onPlayAgain={() => {
          try { store.clearLocalGameSettings(); } catch {}
          navigate("/solo/5x5");
        }}
        onHome={() => {
          try { store.clearLocalGameSettings(); } catch {}
          navigate("/");
        }}
      />
    );
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-5 py-2.5 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <button
          onClick={() => {
            try { store.clearLocalGameSettings(); } catch {}
            navigate("/solo/5x5");
          }}
          className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t("common.back")}</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Round tabs */}
          <div className="flex items-center gap-1">
            {Array.from({ length: settings.rounds }).map((_, i) => {
              const rn = i + 1;
              return (
                <button
                  key={rn}
                  disabled={!!activeTile || rn > round}
                  className={`px-2.5 py-1 rounded-lg font-outfit font-black text-[10px] sm:text-xs transition-all ${
                    round === rn
                      ? "bg-soft-purple text-white shadow-[2px_2px_0px_rgba(166,157,145,0.3)]"
                      : rn < round
                        ? "bg-mint/20 text-mint/60"
                        : "bg-warm-gray/5 text-warm-gray/40"
                  }`}
                >
                  R{rn}
                </button>
              );
            })}
          </div>

          {/* Streak combo */}
          {streak >= 2 && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-butter-light text-butter border border-butter/20 animate-pulse">
              <Flame className="w-3 h-3" />
              <span className="text-[10px] font-black">{streak}×</span>
            </div>
          )}

          {/* Score */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-soft-purple-light border border-soft-purple/20">
            <Zap className="w-3 h-3 text-soft-purple" />
            <span className="font-mono font-bold text-sm text-soft-purple tabular-nums">{score}</span>
          </div>

          {/* Options toggle */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className={`p-1.5 rounded-lg transition-all ${
              showOptions ? "bg-soft-purple text-white" : "text-warm-gray/40 hover:text-plum"
            }`}
            title="Game options"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Mid-game options panel ────────────────────────────────── */}
      {showOptions && (
        <div className="shrink-0 px-4 py-3 bg-warm-white/90 border-b border-warm-gray/10 flex items-center gap-4 flex-wrap animate-slide-up-fade">
          {/* Random Picker toggle */}
          <button
            onClick={toggleRandomPicker}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              randomPicker
                ? "bg-soft-purple-light text-soft-purple border-soft-purple/30"
                : "bg-cream text-warm-gray/50 border-clay-border/50"
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            {t("solo.randomPicker")}
            <span className={`w-2 h-2 rounded-full ${randomPicker ? "bg-soft-purple" : "bg-warm-gray/30"}`} />
          </button>

          {/* Skip tile (when question is open) */}
          {activeTile && (
            <button
              onClick={handleSkipTile}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-peach-light text-peach border border-peach/30 hover:bg-peach/20 transition-all"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip Tile
            </button>
          )}

          {/* Tiles remaining */}
          <span className="ml-auto text-[10px] font-bold text-warm-gray/40">
            {t("solo.tilesRemaining", { count: unrevealedCount })}
          </span>
        </div>
      )}

      {/* ── Timer bar ─────────────────────────────────────────────── */}
      {activeTile && (
        <div className="shrink-0 h-1 bg-warm-gray/10">
          <div
            className={`h-full transition-all duration-300 ${
              timerUrgent ? "bg-peach animate-pulse" : timerWarn ? "bg-butter" : "bg-soft-purple"
            }`}
            style={{ width: `${Math.max(0, timerPercent)}%` }}
          />
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center p-3 sm:p-4 gap-3 overflow-y-auto">
        {/* ── Category headers ─────────────────────────────────── */}
        {!activeTile && categoryColumns.length > 0 && (
          <div className="w-full max-w-lg mx-auto grid grid-cols-5 gap-1.5 sm:gap-2 mb-1">
            {categoryColumns.map((cat, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl min-h-[3rem]"
                style={{
                  backgroundColor: `var(--accent-${cat.color === "purple" ? "purple" : cat.color === "sky" ? "sky" : cat.color === "peach" ? "peach" : cat.color === "mint" ? "mint" : "butter"}-light)`,
                }}
              >
                <span className="text-sm leading-none">{cat.emoji}</span>
                <span className={`font-outfit font-extrabold text-plum/70 uppercase text-center leading-tight ${getCatFontSize(cat.name)}`}>
                  {cat.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── 5×5 Grid ─────────────────────────────────────────── */}
        <div className="w-full max-w-lg mx-auto">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {grid.map((row, rIdx) =>
              row.map((tile, cIdx) => (
                <div key={tile.id} className="relative w-full aspect-square">
                  <ClayTile
                    state={tile.state}
                    color={tile.color}
                    points={tile.points}
                    answer={tile.answer}
                    onClick={
                      tile.state === "unrevealed" && !activeTile
                        ? () => handleTileClick(rIdx, cIdx)
                        : undefined
                    }
                    className="w-full h-full"
                  />
                  {/* Eliminator indicator */}
                  {tile.isEliminator && tile.state === "unrevealed" && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-butter flex items-center justify-center shadow-md z-10">
                      <Star className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Question overlay ──────────────────────────────────── */}
        {activeTile && activeTile.question && (
          <div className="w-full max-w-lg animate-clay-pop">
            <ClayCard elevation="elevated" padding="lg" className="space-y-4">
              {/* Close button */}
              <button
                onClick={handleSkipTile}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-warm-gray/40 hover:text-peach transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>

              {/* Category badge */}
              <ClayBadge color={activeTile.color} dot>
                {getCategoryEmoji(activeTile.question.category || "")}{" "}
                {getCategoryDisplayName(activeTile.question.category || "")}{" "}
                · {activeTile.points} PTS
              </ClayBadge>

              {/* Eliminator banner */}
              {activeTile.isEliminator && !isAnswerRevealed && (
                <div className="bg-butter-light border border-butter/20 rounded-xl p-2.5 flex items-center gap-2">
                  <Star className="w-4 h-4 text-butter flex-shrink-0" />
                  <span className="text-[11px] font-bold text-butter">
                    {t("solo.eliminatorDesc")}
                  </span>
                </div>
              )}

              {/* Question text */}
              <h2 className="font-outfit font-extrabold text-lg sm:text-xl text-plum text-center leading-snug">
                {activeTile.question.question_text}
              </h2>

              {/* Timer ring + number */}
              <div className="flex items-center justify-center gap-3">
                <div className="relative w-16 h-16">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                    <circle
                      cx="32" cy="32" r="28"
                      fill="none" stroke="currentColor" strokeWidth="4"
                      className="text-warm-gray/10"
                    />
                    <circle
                      cx="32" cy="32" r="28"
                      fill="none" stroke="currentColor" strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 28}
                      strokeDashoffset={2 * Math.PI * 28 * (1 - Math.max(0, Math.min(100, timerPercent)) / 100)}
                      className={`transition-all duration-1000 ${
                        timerUrgent ? "text-peach animate-pulse" : timerWarn ? "text-butter" : "text-soft-purple"
                      }`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`font-mono font-black text-xl tabular-nums ${
                      timerUrgent ? "text-peach animate-pulse" : "text-plum"
                    }`}>
                      {timer}
                    </span>
                  </div>
                </div>
                {isTimerRunning && (
                  <Timer className="w-5 h-5 text-warm-gray/40 animate-pulse" />
                )}
              </div>

              {/* Answer options */}
              {activeTile.question.options && activeTile.question.options.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {activeTile.question.options.map((opt, idx) => {
                    const isSelected = selectedAnswer === opt;
                    const isCorrectAnswer = opt === activeTile.question?.correct_answer;
                    let optionStyle = "bg-cream border-clay-border/50 text-plum/70";

                    if (isAnswerRevealed) {
                      if (isCorrectAnswer) {
                        optionStyle = "bg-[#D1FAE5] border-[#34D399]/50 text-[#059669] font-extrabold shadow-[0_0_0_3px_rgba(52,211,153,0.25)] scale-[1.02]";
                      } else if (isSelected && !isCorrectAnswer) {
                        optionStyle = "bg-[#FFE5EB] border-[#F43F5E]/40 text-[#E11D48] line-through";
                      } else {
                        optionStyle = "bg-cream/40 border-clay-border/10 text-plum/20";
                      }
                    } else if (isSelected) {
                      optionStyle = "bg-soft-purple-light border-soft-purple/40 text-soft-purple";
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleAnswerSelect(opt)}
                        disabled={isAnswerRevealed}
                        className={`p-3 rounded-xl border font-outfit font-bold text-xs sm:text-sm transition-all text-left ${
                          optionStyle
                        } ${!isAnswerRevealed ? "clay-btn" : ""}`}
                      >
                        <span className="text-[10px] font-black opacity-50 mr-1.5">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        {opt}
                        {isAnswerRevealed && isCorrectAnswer && (
                          <CheckCircle className="w-3.5 h-3.5 inline ml-1.5 text-mint" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* No options - reveal answer */}
              {(!activeTile.question.options || activeTile.question.options.length === 0) && !isAnswerRevealed && (
                <ClayButton
                  variant="success"
                  size="lg"
                  className="w-full"
                  onClick={() => { setIsAnswerRevealed(true); setIsTimerRunning(false); }}
                  icon={<Eye className="w-5 h-5" />}
                >
                  {t("game.revealAnswer")}
                </ClayButton>
              )}

              {/* Revealed answer (no options case) */}
              {(!activeTile.question.options || activeTile.question.options.length === 0) && isAnswerRevealed && (
                <div className="p-4 bg-mint-light rounded-2xl border border-mint/20 text-mint font-bold text-lg text-center">
                  {activeTile.question.correct_answer}
                </div>
              )}

              {/* Self-grade buttons (after reveal) */}
              {isAnswerRevealed && (
                <div className="flex gap-3 animate-slide-up-fade pt-1">
                  <button
                    onClick={() => handleSelfGrade(true)}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-outfit font-black text-base text-white
                      bg-[#10B981] hover:bg-[#059669] active:scale-95 transition-all duration-200
                      shadow-lg shadow-[#10B981]/30 hover:shadow-xl hover:shadow-[#10B981]/40 hover:-translate-y-0.5"
                  >
                    <CheckCircle className="w-5 h-5" />
                    {t("solo.gotItRight")}
                  </button>
                  <button
                    onClick={() => handleSelfGrade(false)}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-outfit font-black text-base text-white
                      bg-[#F43F5E] hover:bg-[#E11D48] active:scale-95 transition-all duration-200
                      shadow-lg shadow-[#F43F5E]/30 hover:shadow-xl hover:shadow-[#F43F5E]/40 hover:-translate-y-0.5"
                  >
                    <XCircle className="w-5 h-5" />
                    {t("solo.missedIt")}
                  </button>
                </div>
              )}

              {/* Skip button */}
              {!isAnswerRevealed && (
                <button
                  onClick={handleSkipTile}
                  className="w-full py-2 text-[10px] font-bold text-warm-gray/30 hover:text-warm-gray/50 transition-colors"
                >
                  Skip this tile
                </button>
              )}
            </ClayCard>
          </div>
        )}

        {/* ── Keyboard hint ──────────────────────────────────────── */}
        {isAnswerRevealed && activeTile && (
          <p className="text-[10px] font-bold text-warm-gray/40 text-center">
            Press <kbd className="px-1 py-0.5 rounded bg-warm-gray/10 text-warm-gray/60 font-mono text-[9px]">Y</kbd> /{" "}
            <kbd className="px-1 py-0.5 rounded bg-warm-gray/10 text-warm-gray/60 font-mono text-[9px]">N</kbd>{" "}
            {t("solo.pressYorN")}
          </p>
        )}

        {/* ── Manual pick hint ───────────────────────────────────── */}
        {!randomPicker && !activeTile && (
          <div className="text-center mt-1 space-y-1">
            <p className="text-[11px] font-bold text-warm-gray/50">
              {t("solo.gridProgress")}
            </p>
            <p className="text-[10px] text-warm-gray/40">
              {t("solo.tilesRemaining", { count: unrevealedCount })}
            </p>
          </div>
        )}

        {/* ── Streak indicator (mobile, always visible) ──────────── */}
        {streak >= 2 && (
          <div className="sm:hidden flex items-center gap-1.5 px-3 py-1 rounded-full bg-butter-light text-butter border border-butter/20 animate-pulse">
            <Flame className="w-3.5 h-3.5" />
            <span className="text-xs font-black">{streak}× Streak!</span>
          </div>
        )}
      </div>
    </div>
  );
}
