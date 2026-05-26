import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import {
  XCircle, Zap, Unlock, Lock, RotateCcw, Trophy, Timer,
  Play, Pause, Plus, Minus, Eye, Wifi, WifiOff, ArrowLeft
} from "lucide-react";
import confetti from "canvas-confetti";
import { ClayTile, ClayCard, ClayBadge, ClayButton, ClayAvatar } from "./ui";
import type { TileColor } from "./ui/ClayTile";

// ── Types ───────────────────────────────────────────────────────────────────

interface GameBoardV2Props {
  lobbyCode: string;
  settings: any;
  isLocal?: boolean;
  initialCategories?: any;
  onExit?: () => void;
  onReturnToLobby?: () => void;
}

type GamePhase = "LOBBY" | "READING" | "BUZZING" | "ANSWERING";

// ── Category colors ─────────────────────────────────────────────────────────

const CAT_TILE_COLORS: TileColor[] = ["purple", "sky", "peach", "mint", "butter"];

const CAT_EMOJI_MAP: Record<string, string> = {
  literature: "📚", books: "📚", reading: "📚", writing: "📚",
  science: "🔬", biology: "🧬", chemistry: "🧪", physics: "⚛️", astronomy: "🔭",
  history: "🏛️", geography: "🌍", countries: "🌍", world: "🌍",
  movies: "🎬", film: "🎬", cinema: "🎬", tv: "📺", television: "📺",
  music: "🎵", songs: "🎵", bands: "🎸", artists: "🎤",
  sports: "⚽", football: "⚽", basketball: "🏀", cricket: "🏏",
  technology: "💻", tech: "💻", computers: "💻", programming: "💻",
  art: "🎨", painting: "🎨", artists_art: "🎨",
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

/** Auto-scale font size for mobile category headers based on name length */
function getCatFontSize(name: string): string {
  const len = name.length;
  if (len <= 4) return "text-sm";
  if (len <= 7) return "text-[13px]";
  if (len <= 10) return "text-xs";
  return "text-[11px]";
}

// ── GameBoardV2 ─────────────────────────────────────────────────────────────

export default function GameBoardV2({
  lobbyCode,
  settings,
  isLocal = false,
  initialCategories,
  onExit,
  onReturnToLobby,
}: GameBoardV2Props) {
  // ── State ──────────────────────────────────────────────────────────────

  const [currentRound, setCurrentRound] = useState(1);
  const [status, setStatus] = useState<GamePhase>("LOBBY");
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [revealedQuestions, setRevealedQuestions] = useState<string[]>([]);
  const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null);
  const [gradedPlayers, setGradedPlayers] = useState<Record<string, "correct" | "wrong">>({});
  const [timer, setTimer] = useState(settings?.timer || 15);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [players, setPlayers] = useState<any[]>(
    isLocal && settings?.players ? settings.players : []
  );
  const [remoteCategories, setRemoteCategories] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const totalRounds = settings?.rounds || 1;

  // ── Fetch remote categories (multiplayer) ──────────────────────────────

  useEffect(() => {
    if (!isLocal && lobbyCode && lobbyCode !== "LOCAL") {
      supabase
        .from("questions")
        .select("*")
        .eq("lobby_code", lobbyCode)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const grouped: Record<string, any> = {};
            data.forEach((q: any) => {
              if (!grouped[q.category]) {
                grouped[q.category] = { id: q.category, name: q.category, data: [] };
              }
              grouped[q.category].data.push(q);
            });
            Object.values(grouped).forEach((cat: any) => {
              cat.data.sort((a: any, b: any) => (a.points || 0) - (b.points || 0));
            });
            setRemoteCategories(Object.values(grouped));
          }
        });
    }
  }, [lobbyCode, isLocal]);

  // ── Realtime channel ──────────────────────────────────────────────────

  const { broadcast, onBroadcast, presences, isConnected } = useRealtimeChannel({
    channelName: `standard:${lobbyCode}`,
    enablePresence: !isLocal && !!lobbyCode && lobbyCode !== "LOCAL",
    presenceData: !isLocal && lobbyCode !== "LOCAL"
      ? { playerId: store.ensurePlayerId(), name: store.getPlayerName(), status: "connected" as const }
      : undefined,
    subscribeLobby: !isLocal && lobbyCode !== "LOCAL" ? lobbyCode : undefined,
    subscribePlayers: !isLocal && lobbyCode !== "LOCAL" ? lobbyCode : undefined,
    onLobbyChange: (payload: any) => {
      const newLobby = payload.new;
      if (newLobby.status) setStatus(newLobby.status);
      if (newLobby.buzzed_player_id !== undefined) setBuzzedPlayerId(newLobby.buzzed_player_id);
    },
    onPlayerChange: async () => {
      const { data } = await supabase.from("players").select("*").eq("lobby_code", lobbyCode);
      if (data) setPlayers(data.sort((a: any, b: any) => b.score - a.score));
    },
  });

  // ── Broadcast listeners (multiplayer only) ─────────────────────────────

  useEffect(() => {
    if (isLocal || lobbyCode === "LOCAL") return;

    const unsubs: (() => void)[] = [];

    unsubs.push(
      onBroadcast("buzzer:press", (payload: any) => {
        if (payload.playerId) setBuzzedPlayerId(payload.playerId);
      })
    );

    unsubs.push(
      onBroadcast("timer:tick", (payload: any) => {
        if (payload.remainingSec !== undefined) {
          setTimer(payload.remainingSec);
          setIsTimerRunning(payload.remainingSec > 0);
          if (payload.isAnswerRevealed) setIsAnswerRevealed(true);
        }
      })
    );

    unsubs.push(
      onBroadcast("score:update", (payload: any) => {
        if (payload.playerId && payload.score !== undefined) {
          setPlayers((prev) =>
            prev
              .map((p) => (p.id === payload.playerId ? { ...p, score: payload.score } : p))
              .sort((a: any, b: any) => b.score - a.score)
          );
        }
      })
    );

    unsubs.push(
      onBroadcast("question:open", () => {
        setStatus("READING");
        setBuzzedPlayerId(null);
      })
    );

    unsubs.push(
      onBroadcast("question:close", () => {
        setActiveQuestion(null);
        setIsAnswerRevealed(false);
        setGradedPlayers({});
        setStatus("LOBBY");
        setBuzzedPlayerId(null);
      })
    );

    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast, isLocal, lobbyCode]);

  // ── Timer (host only; clients sync via broadcast) ──────────────────────

  // Only host runs the timer interval; clients sync via broadcast
  useEffect(() => {
    let interval: any;
    if (isTimerRunning && timer > 0 && (isLocal || lobbyCode === "LOCAL")) {
      interval = setInterval(() => {
        setTimer((t: number) => {
          const next = t - 1;
          if (!isLocal && lobbyCode !== "LOCAL") {
            broadcast("timer:tick", { remainingSec: next });
          }
          return next;
        });
      }, 1000);
    } else if (timer <= 0 && isTimerRunning) {
      setIsTimerRunning(false);
      setIsAnswerRevealed(true);
      if (!isLocal && lobbyCode !== "LOCAL") {
        broadcast("timer:tick", { remainingSec: 0, isAnswerRevealed: true });
      }
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timer, isLocal, lobbyCode, broadcast]);

  // ── Derived: categories for current round ──────────────────────────────

  const currentRoundCats = useMemo(() => {
    // Local play: categories provided via initialCategories prop
    if (initialCategories && initialCategories[currentRound]) {
      return initialCategories[currentRound].map((cat: any) => ({
        ...cat,
        data: [...(cat.data || [])].sort((a: any, b: any) => (a.points || 0) - (b.points || 0)),
      }));
    }
    // Multiplayer: check settings.round_categories (category objects with embedded questions)
    const roundCats = settings?.round_categories?.[currentRound];
    if (roundCats && Array.isArray(roundCats) && roundCats.length > 0) {
      // round_categories stores full category objects: { id, name, data: [questions] }
      return roundCats.map((cat: any) => ({
        id: cat.id || cat.name,
        name: cat.name || "Category",
        data: [...(cat.data || [])].sort((a: any, b: any) => (a.points || 0) - (b.points || 0)),
      }));
    }
    // Fallback: legacy questions table (remoteCategories)
    return remoteCategories.map((c) => ({
      ...c,
      data: [...(c.data || [])].sort((a: any, b: any) => (a.points || 0) - (b.points || 0)),
    }));
  }, [initialCategories, currentRound, remoteCategories, settings]);

  const onlineCount = useMemo(() => {
    if (isLocal) return players.length;
    return Object.keys(presences).length || players.length;
  }, [presences, players.length, isLocal]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleReturnToLobby = useCallback(() => {
    if (!isLocal && lobbyCode !== "LOCAL") {
      broadcast("game:end", {});
    }
    onReturnToLobby?.();
  }, [isLocal, lobbyCode, broadcast, onReturnToLobby]);

  const handleRevealQuestion = useCallback(
    async (q: any) => {
      setActiveQuestion(q);
      setIsAnswerRevealed(false);
      setGradedPlayers({});
      setTimer(settings?.timer || 15);
      setIsTimerRunning(false);
      setStatus("READING");
      setBuzzedPlayerId(null);

      if (!isLocal && lobbyCode !== "LOCAL") {
        broadcast("question:open", { questionId: q.id, category: q.category, points: q.points });
        await supabase
          .from("lobbies")
          .update({ status: "READING", current_question_id: q.id, buzzed_player_id: null })
          .eq("code", lobbyCode);
      }
    },
    [isLocal, lobbyCode, settings, broadcast]
  );

  const handleCloseQuestion = useCallback(async () => {
    if (!activeQuestion) return;

    if (isAnswerRevealed) {
      setRevealedQuestions((prev) => [...prev, activeQuestion.id]);
    }

    setActiveQuestion(null);
    setIsAnswerRevealed(false);
    setGradedPlayers({});
    setStatus("LOBBY");
    setBuzzedPlayerId(null);
    setIsTimerRunning(false);

    if (!isLocal && lobbyCode !== "LOCAL") {
      broadcast("question:close", { questionId: activeQuestion.id });
      await supabase
        .from("lobbies")
        .update({ status: "LOBBY", buzzed_player_id: null })
        .eq("code", lobbyCode);
    }
  }, [activeQuestion, isAnswerRevealed, isLocal, lobbyCode, broadcast]);

  const handleOpenBuzzers = useCallback(async () => {
    setStatus("BUZZING");
    if (!isLocal && lobbyCode !== "LOCAL") {
      broadcast("phase:change", { phase: "BUZZING" });
      await supabase.from("lobbies").update({ status: "BUZZING" }).eq("code", lobbyCode);
    }
  }, [isLocal, lobbyCode, broadcast]);

  const handleCloseBuzzers = useCallback(async () => {
    setStatus("READING");
    if (!isLocal && lobbyCode !== "LOCAL") {
      broadcast("phase:change", { phase: "READING" });
      await supabase.from("lobbies").update({ status: "READING" }).eq("code", lobbyCode);
    }
  }, [isLocal, lobbyCode, broadcast]);

  const handleClearBuzzer = useCallback(async () => {
    setBuzzedPlayerId(null);
    setStatus("BUZZING");
    if (!isLocal && lobbyCode !== "LOCAL") {
      broadcast("buzzer:clear", {});
      await supabase.from("lobbies").update({ buzzed_player_id: null, status: "BUZZING" }).eq("code", lobbyCode);
    }
  }, [isLocal, lobbyCode, broadcast]);

  const handleAdjustTimer = useCallback((delta: number) => {
    setTimer((t: number) => Math.max(0, t + delta));
  }, []);

  const handleResetTimer = useCallback(() => {
    setTimer(settings?.timer || 15);
    setIsTimerRunning(false);
  }, [settings?.timer]);

  // Manual score override (editable leaderboard)
  const handleEditScore = useCallback(
    async (playerId: string, newScore: number) => {
      setPlayers((prev) =>
        prev
          .map((p) => (p.id === playerId ? { ...p, score: newScore } : p))
          .sort((a: any, b: any) => b.score - a.score)
      );
      if (!isLocal && lobbyCode !== "LOCAL") {
        broadcast("score:update", { playerId, score: newScore });
        await supabase.from("players").update({ score: newScore }).eq("id", playerId);
      }
    },
    [isLocal, lobbyCode, broadcast]
  );

  // State-machine grading: ungraded ↔ correct ↔ wrong (toggleable, undoable)
  const handleGrade = useCallback(
    async (playerId: string, action: "correct" | "wrong") => {
      if (!activeQuestion) return;
      const player = players.find((p) => p.id === playerId);
      if (!player) return;

      const basePoints = activeQuestion.points || 100;
      const currentGrade = gradedPlayers[playerId];

      let delta = 0;
      let newGrade: "correct" | "wrong" | undefined;

      // State machine: ungraded → correct/wrong, toggle between, click again to undo
      if (action === "correct") {
        if (currentGrade === "correct")       { newGrade = undefined; delta = -basePoints; }
        else if (currentGrade === "wrong")     { newGrade = "correct";  delta = basePoints * 2; }
        else                                   { newGrade = "correct";  delta = basePoints; }
      } else {
        if (currentGrade === "wrong")          { newGrade = undefined; delta = basePoints; }
        else if (currentGrade === "correct")   { newGrade = "wrong";    delta = -(basePoints * 2); }
        else                                   { newGrade = "wrong";    delta = -basePoints; }
      }

      const newScore = (player.score || 0) + delta;

      setPlayers((prev) =>
        prev
          .map((p) => (p.id === playerId ? { ...p, score: newScore } : p))
          .sort((a: any, b: any) => b.score - a.score)
      );

      setGradedPlayers((prev) => {
        const next = { ...prev };
        if (newGrade) next[playerId] = newGrade;
        else delete next[playerId];
        return next;
      });

      if (newGrade === "correct") {
        confetti({ particleCount: 50, spread: 60, origin: { x: 0.8, y: 0.5 }, colors: ["#8CD7C4", "#A3D9C8"] });
      }

      if (!isLocal && lobbyCode !== "LOCAL") {
        broadcast("score:update", { playerId, score: newScore });
        await supabase.from("players").update({ score: newScore }).eq("id", playerId);
      }
    },
    [players, gradedPlayers, activeQuestion, isLocal, lobbyCode, broadcast]
  );

  // ── Refs for keyboard handlers ─────────────────────────────────────────

  const closeRef = useRef(handleCloseQuestion);
  const openBuzzersRef = useRef(handleOpenBuzzers);
  const closeBuzzersRef = useRef(handleCloseBuzzers);
  const statusRef = useRef(status);
  const activeQRef = useRef(activeQuestion);
  const revealedRef = useRef(isAnswerRevealed);
  const roundRef = useRef(currentRound);

  useEffect(() => { closeRef.current = handleCloseQuestion; });
  useEffect(() => { openBuzzersRef.current = handleOpenBuzzers; });
  useEffect(() => { closeBuzzersRef.current = handleCloseBuzzers; });
  useEffect(() => { statusRef.current = status; });
  useEffect(() => { activeQRef.current = activeQuestion; });
  useEffect(() => { revealedRef.current = isAnswerRevealed; });
  useEffect(() => { roundRef.current = currentRound; });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const aq = activeQRef.current;
      const revealed = revealedRef.current;
      const st = statusRef.current;
      const cr = roundRef.current;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (aq) {
            if (!revealed) {
              setIsAnswerRevealed(true);
            } else if (st !== "BUZZING") {
              openBuzzersRef.current();
            } else {
              closeBuzzersRef.current();
            }
          }
          break;
        case "Escape":
          if (aq) {
            e.preventDefault();
            closeRef.current();
          }
          break;
        case "ArrowLeft":
          if (!aq && cr > 1) setCurrentRound((r) => r - 1);
          break;
        case "ArrowRight":
          if (!aq && cr < totalRounds) setCurrentRound((r) => r + 1);
          break;
        case "r":
        case "R":
          if (!e.ctrlKey && !e.metaKey && aq && !revealed) setIsAnswerRevealed(true);
          break;
        case "c":
        case "C":
          if (!e.ctrlKey && !e.metaKey && aq && revealed) closeRef.current();
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [totalRounds]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 sm:gap-4">
          {onExit && (
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 text-xs font-bold text-warm-gray/60 hover:text-plum transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}

          {/* Round tabs */}
          <div className="flex items-center gap-1">
            {Array.from({ length: totalRounds }).map((_, i) => {
              const rn = i + 1;
              return (
                <button
                  key={rn}
                  onClick={() => !activeQuestion && setCurrentRound(rn)}
                  disabled={!!activeQuestion}
                  className={`px-3 py-1.5 rounded-lg font-outfit font-black text-xs transition-all ${
                    currentRound === rn
                      ? "bg-soft-purple text-white shadow-[2px_2px_0px_rgba(166,157,145,0.3)]"
                      : "bg-warm-gray/5 text-warm-gray/50 hover:bg-warm-gray/10"
                  } ${activeQuestion ? "opacity-50" : ""}`}
                >
                  R{rn}
                </button>
              );
            })}
          </div>

          {onReturnToLobby && (
            <button
              onClick={handleReturnToLobby}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mint-light text-mint font-bold text-xs hover:bg-mint/20 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lobby</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          {!isLocal && lobbyCode !== "LOCAL" && (
            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              {isConnected ? (
                <Wifi className="w-3.5 h-3.5 text-mint" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-peach animate-pulse" />
              )}
              <span className={isConnected ? "text-mint" : "text-peach"}>
                {isConnected ? `${onlineCount} online` : "Reconnecting"}
              </span>
            </div>
          )}

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="text-xs font-bold text-warm-gray/60 hover:text-plum"
          >
            {sidebarOpen ? "Hide Scores" : "Scores"}
          </button>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
        {/* Category Grid */}
        <div className="flex-[0_0_65%] sm:flex-1 p-1.5 sm:p-4 overflow-y-auto">
          {activeQuestion ? (
            <QuestionOverlay
              question={activeQuestion}
              isAnswerRevealed={isAnswerRevealed}
              onRevealAnswer={() => setIsAnswerRevealed(true)}
              onClose={handleCloseQuestion}
              status={status}
              buzzedPlayerId={buzzedPlayerId}
              players={players}
              gradedPlayers={gradedPlayers}
              isLocal={isLocal}
              lobbyCode={lobbyCode}
              onOpenBuzzers={handleOpenBuzzers}
              onCloseBuzzers={handleCloseBuzzers}
              onClearBuzzer={handleClearBuzzer}
              onGrade={handleGrade}
              timer={timer}
              isTimerRunning={isTimerRunning}
              onToggleTimer={() => setIsTimerRunning((r) => !r)}
              onAdjustTimer={handleAdjustTimer}
              onResetTimer={handleResetTimer}
            />
          ) : currentRoundCats.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <div className="space-y-3">
                <Trophy className="w-12 h-12 mx-auto text-warm-gray/30" />
                <p className="text-warm-gray/60 font-medium text-sm">
                  {isLocal
                    ? "No categories selected for this round"
                    : "Waiting for categories..."}
                </p>
              </div>
            </div>
          ) : (
            <QuestionGrid
              categories={currentRoundCats}
              revealedQuestions={revealedQuestions}
              onSelect={handleRevealQuestion}
              colCount={Math.min(currentRoundCats.length, 6)}
            />
          )}
        </div>

        {/* Score Sidebar */}
        {sidebarOpen && (
          <ScoreSidebar
            players={players}
            status={status}
            buzzedPlayerId={buzzedPlayerId}
            onOpenBuzzers={handleOpenBuzzers}
            onCloseBuzzers={handleCloseBuzzers}
            onClearBuzzer={handleClearBuzzer}
            onEditScore={handleEditScore}
            isLocal={isLocal}
            lobbyCode={lobbyCode}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

// ── QuestionGrid (ClayTile-based, simple column layout) ───────────────

function QuestionGrid({
  categories,
  revealedQuestions,
  onSelect,
  colCount,
}: {
  categories: any[];
  revealedQuestions: string[];
  onSelect: (q: any) => void;
  colCount: number;
}) {
  const cols = Math.min(colCount, 6);
  // Mobile: tap category header to expand full name
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  return (
    <div
      className="grid gap-1 sm:gap-3 h-full overflow-x-auto"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {categories.map((cat, colIdx) => {
        const color = CAT_TILE_COLORS[colIdx % CAT_TILE_COLORS.length];
        const questions = cat.data || [];
        const displayName = getCategoryDisplayName(cat.name);
        const emoji = getCategoryEmoji(cat.name);
        const isExpanded = expandedCat === (cat.id || cat.name);

        return (
          <div key={cat.id || cat.name} className="flex flex-col gap-1 sm:gap-2 min-h-0 h-full">
            {/* Category header — flex-column centering, emoji on top, name below */}
            <ClayCard
              elevation="flat"
              padding="sm"
              className="cursor-pointer sm:cursor-default min-h-[110px] sm:min-h-[5rem] md:min-h-[5.5rem] min-w-[68px] sm:min-w-0 flex flex-col items-center justify-center hover:ring-2 hover:ring-soft-purple/20 sm:hover:ring-0 transition-all flex-shrink-0"
              onClick={() => {
                if (window.innerWidth < 640) {
                  setExpandedCat(isExpanded ? null : (cat.id || cat.name));
                }
              }}
              title={displayName}
            >
              {/* Emoji — desktop only */}
              <span className="hidden sm:block text-lg leading-none mb-0.5">{emoji}</span>
              {/* Category name — auto-scaled font, wraps naturally, line-clamp safety */}
              <span className={`font-outfit font-extrabold text-plum leading-tight uppercase tracking-wide text-center break-words ${
                isExpanded
                  ? "text-[13px] sm:text-sm"
                  : `${getCatFontSize(displayName)} sm:text-sm md:text-base lg:text-lg line-clamp-3 sm:line-clamp-none`
              }`}>
                {displayName}
              </span>
            </ClayCard>

            {/* Question tiles — stacked vertically */}
            <div className="flex-1 flex flex-col gap-1 sm:gap-2">
              {questions.slice(0, 5).map((q: any, idx: number) => {
                const isRevealed = revealedQuestions.includes(q.id);
                return (
                  <ClayTile
                    key={q.id || idx}
                    state={isRevealed ? "revealed" : "unrevealed"}
                    color={color}
                    points={q.points || 100}
                    answer={isRevealed ? (q.answer_text || "DONE").slice(0, 24) : undefined}
                    onClick={() => !isRevealed && onSelect(q)}
                    className="flex-1"
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── QuestionOverlay (matching prototype's Question Modal) ─────────────────

function QuestionOverlay({
  question,
  isAnswerRevealed,
  onRevealAnswer,
  onClose,
  status,
  buzzedPlayerId,
  players,
  gradedPlayers,
  isLocal,
  lobbyCode,
  onOpenBuzzers,
  onCloseBuzzers,
  onClearBuzzer,
  onGrade,
  timer,
  isTimerRunning,
  onToggleTimer,
  onAdjustTimer,
  onResetTimer,
}: {
  question: any;
  isAnswerRevealed: boolean;
  onRevealAnswer: () => void;
  onClose: () => void;
  status: GamePhase;
  buzzedPlayerId: string | null;
  players: any[];
  gradedPlayers: Record<string, "correct" | "wrong">;
  isLocal: boolean;
  lobbyCode: string;
  onOpenBuzzers: () => void;
  onCloseBuzzers: () => void;
  onClearBuzzer: () => void;
  onGrade: (playerId: string, action: "correct" | "wrong") => void;
  timer: number;
  isTimerRunning: boolean;
  onToggleTimer: () => void;
  onAdjustTimer: (delta: number) => void;
  onResetTimer: () => void;
}) {
  const formatTime = (s: number) => `0:${String(s).padStart(2, "0")}`;
  const displayName = getCategoryDisplayName(question.category || "");
  const emoji = getCategoryEmoji(question.category || "");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-clay-pop">
      <ClayCard elevation="elevated" padding="lg" className="max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close question"
          className="absolute top-4 right-4 p-2 hover:text-peach text-warm-gray/50 transition-colors"
        >
          <XCircle className="w-6 h-6" />
        </button>

        {/* Badge — matching prototype */}
        <ClayBadge color="purple" dot>
          {emoji} {displayName} · {question.points || 100} PTS
        </ClayBadge>

        {/* Question text — centered, large */}
        <h2 className="font-outfit font-extrabold text-2xl md:text-3xl text-plum text-center leading-tight">
          {question.question_text}
        </h2>

        {/* Timer */}
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => onAdjustTimer(-1)}
            disabled={timer <= 0 || isTimerRunning}
            className="p-1.5 text-warm-gray/50 hover:text-plum disabled:opacity-20"
            title="-1 second"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <Timer className="w-5 h-5 text-peach" />
          <span className="font-mono font-bold text-xl md:text-2xl text-peach">{formatTime(timer)}</span>
          <button
            onClick={() => onAdjustTimer(1)}
            disabled={isTimerRunning}
            className="p-1.5 text-warm-gray/50 hover:text-plum disabled:opacity-20"
            title="+1 second"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={onToggleTimer} className="ml-1 text-warm-gray/50 hover:text-plum">
            {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button onClick={onResetTimer} className="text-warm-gray/50 hover:text-plum" title="Reset">
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* MCQ answers — using ClayButton, matching prototype */}
        {question.q_type === "MCQ" && question.options ? (
          <div className="max-w-sm mx-auto space-y-3">
            {question.options.map((option: string, idx: number) => {
              const isCorrect = option === question.answer_text;
              return (
                <ClayButton
                  key={idx}
                  variant={isAnswerRevealed ? (isCorrect ? "success" : "ghost") : "secondary"}
                  className="w-full justify-start gap-2 !font-outfit !font-bold"
                >
                  <span className="opacity-40">{String.fromCharCode(65 + idx)}.</span>
                  {option}
                  {isAnswerRevealed && isCorrect && <span className="ml-auto">✓</span>}
                </ClayButton>
              );
            })}
            {!isAnswerRevealed && (
              <ClayButton
                variant="success"
                className="w-full"
                onClick={onRevealAnswer}
                icon={<Eye className="w-4 h-4" />}
              >
                Reveal Answer
              </ClayButton>
            )}
          </div>
        ) : !isAnswerRevealed ? (
          <div className="max-w-sm mx-auto">
            <ClayButton
              variant="success"
              className="w-full"
              size="lg"
              onClick={onRevealAnswer}
              icon={<Eye className="w-5 h-5" />}
            >
              Reveal Answer
            </ClayButton>
          </div>
        ) : (
          <div className="p-5 bg-mint-light rounded-2xl border border-mint/20 text-mint font-bold text-lg text-center max-w-sm mx-auto">
            {question.answer_text}
          </div>
        )}

        {/* Buzzer controls (multiplayer only) */}
        {!isLocal && lobbyCode !== "LOCAL" && (
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <ClayButton
              variant="primary"
              size="sm"
              onClick={onOpenBuzzers}
              disabled={status === "BUZZING"}
              icon={<Unlock className="w-4 h-4" />}
            >
              Unlock Buzzers
            </ClayButton>
            <ClayButton
              variant="destructive"
              size="sm"
              onClick={onCloseBuzzers}
              disabled={status !== "BUZZING"}
              icon={<Lock className="w-4 h-4" />}
            >
              Lock Buzzers
            </ClayButton>
            <ClayButton
              variant="ghost"
              size="sm"
              onClick={onClearBuzzer}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              Reset
            </ClayButton>
          </div>
        )}

        {/* Buzzed player indicator */}
        {buzzedPlayerId && (
          <div className="bg-mint-light border border-mint/30 p-4 rounded-xl text-center animate-pulse max-w-sm mx-auto">
            <span className="font-outfit font-black text-mint text-sm">
              {players.find((p) => p.id === buzzedPlayerId)?.name || "Unknown"} buzzed in!
            </span>
          </div>
        )}

        {/* Grading panel — toggleable: click to correct↔wrong↔ungrade */}
        {isAnswerRevealed && players.length > 0 && (
          <div className="space-y-3 max-w-sm mx-auto">
            <div className="text-[10px] font-black text-warm-gray/50 uppercase tracking-widest text-center">
              Quick Scoring · click to toggle or undo
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {players.map((p) => {
                const g = gradedPlayers[p.id];
                const pts = question.points || 100;
                const netLabel = g === "correct" ? `+${pts}` : g === "wrong" ? `-${pts}` : "—";
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-warm-white p-2.5 rounded-xl border border-warm-gray/10"
                  >
                    <span className="text-sm font-bold text-plum truncate max-w-[90px]">
                      {p.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onGrade(p.id, "correct")}
                        className={`p-1.5 rounded-lg transition-all ${
                          g === "correct"
                            ? "bg-mint text-white ring-2 ring-mint/40 ring-offset-1"
                            : "bg-warm-gray/5 text-warm-gray/50 hover:bg-mint-light hover:text-mint"
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      {/* Net points delta */}
                      <span className={`text-[10px] font-mono font-bold w-8 text-center ${
                        g === "correct" ? "text-mint" : g === "wrong" ? "text-peach" : "text-warm-gray/30"
                      }`}>
                        {netLabel}
                      </span>
                      <button
                        onClick={() => onGrade(p.id, "wrong")}
                        className={`p-1.5 rounded-lg transition-all ${
                          g === "wrong"
                            ? "bg-peach text-white ring-2 ring-peach/40 ring-offset-1"
                            : "bg-warm-gray/5 text-warm-gray/50 hover:bg-peach-light hover:text-peach"
                        }`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Return to Board */}
        {isAnswerRevealed && (
          <ClayButton
            variant="secondary"
            className="w-full"
            onClick={onClose}
          >
            Return to Board
          </ClayButton>
        )}
      </ClayCard>
    </div>
  );
}

const getAvatarColor = (name: string, idx: number) => {
  const colors = ["bg-soft-purple", "bg-sky", "bg-mint", "bg-peach", "bg-butter"];
  return colors[idx % colors.length];
};

// ── ScoreSidebar (matching prototype's Standings) ────────────────────────

function ScoreSidebar({
  players,
  status,
  buzzedPlayerId,
  onOpenBuzzers,
  onCloseBuzzers,
  onClearBuzzer,
  onEditScore,
  isLocal,
  lobbyCode,
}: {
  players: any[];
  status: GamePhase;
  buzzedPlayerId: string | null;
  onOpenBuzzers: () => void;
  onCloseBuzzers: () => void;
  onClearBuzzer: () => void;
  onEditScore: (playerId: string, newScore: number) => void;
  isLocal: boolean;
  lobbyCode: string;
}) {
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const getMedal = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const startEdit = (playerId: string, score: number) => {
    setEditingPlayer(playerId);
    setEditValue(String(score));
  };

  const commitEdit = (playerId: string) => {
    const n = parseInt(editValue, 10);
    if (!isNaN(n)) onEditScore(playerId, n);
    setEditingPlayer(null);
  };

  return (
    <div className="w-full sm:w-64 lg:w-72 border-t sm:border-t-0 sm:border-l border-warm-gray/10 bg-warm-white/50 overflow-y-auto p-2 sm:p-3 space-y-2 sm:space-y-4 flex-[0_0_35%] sm:flex-none">
      {/* Phase badge */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            status === "BUZZING" ? "bg-mint animate-pulse" : "bg-warm-gray/40"
          }`}
        />
        <span className="text-[10px] font-black text-warm-gray/60 uppercase tracking-widest">
          {status}
        </span>
      </div>

      {/* Buzzer controls (multiplayer) — hidden on mobile to save space */}
      {!isLocal && lobbyCode !== "LOCAL" && (
        <div className="space-y-1.5 hidden sm:block">
          <h4 className="text-[10px] font-black text-warm-gray/50 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Buzzer
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            <ClayButton
              variant="primary"
              size="sm"
              onClick={onOpenBuzzers}
              disabled={status === "BUZZING"}
              icon={<Unlock className="w-3.5 h-3.5" />}
            >
              Unlock
            </ClayButton>
            <ClayButton
              variant="destructive"
              size="sm"
              onClick={onCloseBuzzers}
              disabled={status !== "BUZZING"}
              icon={<Lock className="w-3.5 h-3.5" />}
            >
              Lock
            </ClayButton>
          </div>
          <ClayButton
            variant="ghost"
            size="sm"
            onClick={onClearBuzzer}
            icon={<RotateCcw className="w-3 h-3" />}
          >
            Reset
          </ClayButton>

          {/* Buzzed player */}
          {buzzedPlayerId && (
            <div className="p-2 bg-mint-light rounded-lg border border-mint/20 text-center">
              <span className="text-[10px] font-black text-mint">
                {players.find((p) => p.id === buzzedPlayerId)?.name || "?"} buzzed!
              </span>
            </div>
          )}
        </div>
      )}

      {/* Divider — hidden on mobile */}
      {!isLocal && lobbyCode !== "LOCAL" && (
        <div className="border-t border-warm-gray/10 hidden sm:block" />
      )}

      {/* Scores — compact on mobile, edit on click */}
      <div className="space-y-1 sm:space-y-2">
        <h4 className="text-[10px] font-black text-warm-gray/50 uppercase tracking-wider flex items-center gap-1.5">
          <Trophy className="w-3 h-3" /> Leaderboard <span className="text-warm-gray/30 font-normal normal-case tracking-normal ml-auto text-[9px]">tap score to edit</span>
        </h4>

        {players.length === 0 ? (
          <p className="text-center text-warm-gray/30 text-[10px] py-6">No players</p>
        ) : (
          players.map((p, i) => {
            const isEditing = editingPlayer === p.id;
            return (
              <ClayCard key={p.id} elevation="flat" padding="sm" className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="font-outfit font-black text-xs sm:text-sm text-warm-gray/80 w-5 sm:w-6 text-center">
                    {getMedal(i + 1)}
                  </span>
                  <ClayAvatar
                    name={p.name}
                    size="sm"
                    color={getAvatarColor(p.name, i)}
                    status="online"
                  />
                  <span className="font-outfit font-bold text-xs sm:text-sm text-plum truncate max-w-[60px] sm:max-w-[80px]">{p.name}</span>
                </div>
                {isEditing ? (
                  <input
                    autoFocus
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(p.id);
                      if (e.key === "Escape") setEditingPlayer(null);
                    }}
                    className="w-16 text-right font-mono font-bold text-sm sm:text-base text-plum bg-soft-purple/10 rounded-lg px-2 py-1 border border-soft-purple/20 outline-none focus:ring-2 focus:ring-soft-purple/40"
                  />
                ) : (
                  <button
                    onClick={() => startEdit(p.id, p.score || 0)}
                    className="font-mono font-bold text-sm sm:text-base text-plum hover:text-soft-purple transition-colors cursor-pointer"
                    title="Click to edit score"
                  >
                    {p.score || 0}
                  </button>
                )}
              </ClayCard>
            );
          })
        )}
      </div>
    </div>
  );
}
