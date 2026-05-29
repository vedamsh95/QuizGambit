import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import {
  Trophy, Zap, Clock, Wifi, WifiOff, ArrowLeft, Play,
} from "lucide-react";
import GameOver from "./GameOver";
import { ClayTile, ClayCard, ClayBadge, ClayButton, ClayAvatar } from "./ui";
import LanguageSwitcher from "./ui/LanguageSwitcher";
import type { TileColor } from "./ui/ClayTile";

// ── Types ───────────────────────────────────────────────────────────────────

interface SimultaneousBoardProps {
  code: string;
  playerId: string;
  playerName: string;
}

interface AnswerTiming {
  player_id: string;
  player_name: string;
  answer_text: string;
  is_correct: boolean;
  answer_time_ms: number;
  rank: number | null;
  points_awarded: number;
}

// ── Clay category colors (matching GameBoardV2) ─────────────────────────────

const CAT_TILE_COLORS: TileColor[] = ["purple", "sky", "peach", "mint", "butter"];

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
  gaming: "🎮", games: "🎮",
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

function getAvatarColor(name: string, idx: number) {
  const colors = ["bg-soft-purple", "bg-sky", "bg-mint", "bg-peach", "bg-butter"];
  return colors[idx % colors.length];
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SimultaneousBoard({
  code,
  playerId,
  playerName,
}: SimultaneousBoardProps) {
  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Synced game state (from lobbies.arena_state)
  const [gameState, setGameState] = useState<any>({
    phase: "PICKING",
    pickerId: null,
    activeQuestion: null,
    revealedQuestions: [],
    timerEndTime: null,
  });

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [answerTimings, setAnswerTimings] = useState<AnswerTiming[]>([]);
  const [isGameOver, setIsGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionError, setQuestionError] = useState("");



  // ── Sync state ref for onLobbyChange callback ────────────────────────
  const syncStateRef = useRef({
    lastQuestionId: null as string | null,
    lastBroadcastTick: 0,
    submitGuard: false,
  });

  // ── Realtime channel (single channel for presence + broadcast + postgres_changes) ──
  const { presences, isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: `simul:${code}`,
    enablePresence: true,
    presenceData: {
      playerId,
      name: playerName || "Player",
      status: "connected" as const,
    },
    subscribeLobby: code,
    subscribePlayers: code,
    subscribeArenaAnswers: code,
    answersTableName: 'simultaneous_answers',
    onLobbyChange: (payload: any) => {
      // Lobby deleted — navigate home
      if (payload.eventType === 'DELETE' || !payload.new) {
        window.location.href = '/';
        return;
      }
      const newData = payload.new as any;
      if (newData.arena_state) {
        setGameState(newData.arena_state);
        if (newData.arena_state.phase === "PICKING") {
          setSelectedAnswer(null);
          setSubmitStatus(null);
          setAnswerTimings([]);
          setBroadcastedAnswers(new Set());
          syncStateRef.current.submitGuard = false;
        }
      }
    },
    onPlayerChange: async () => {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code)
        .order("score", { ascending: false });
      if (data) setPlayers(data);
    },
    onArenaAnswer: (payload: any) => {
      const newAnswer = payload.new as AnswerTiming;
      setAnswerTimings((prev) => {
        const exists = prev.find((a) => a.player_id === newAnswer.player_id);
        if (exists) return prev;
        return [...prev, newAnswer].sort((a, b) => a.answer_time_ms - b.answer_time_ms);
      });
      if (newAnswer.player_id === playerId) {
        setSubmitStatus(newAnswer.is_correct ? "✅ Correct!" : "❌ Wrong");
      }
    },
    onReconnect: async () => {
      // Re-fetch stale state after reconnection
      const { data: lobbyData } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (lobbyData?.arena_state) setGameState(lobbyData.arena_state);
    },
  });

  // Track broadcasted answers (optimistic, before DB confirmation)
  const [broadcastedAnswers, setBroadcastedAnswers] = useState<Set<string>>(new Set());

  const isHost = lobby?.host_id === playerId;
  const cleanId = (id: any) => String(id || "").trim();
  const effectivePickerId = gameState.pickerId || players[0]?.id;
  const isPicker = cleanId(playerId) === cleanId(effectivePickerId);
  const pickerName = players.find((p) => cleanId(p.id) === cleanId(effectivePickerId))?.name || "Unknown";
  const activeQ = gameState.activeQuestion;
  const scoringType = gameState.scoringType || "RELATIVE";
  const penaltyType = gameState.penaltyType || "HALF";
  const onlineCount = Object.keys(presences).length;

  // ── Broadcast event handlers ──────────────────────────────────────────

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onBroadcast("timer:tick", (payload: any) => {
        setTimeLeft((prev) => {
          if (Math.abs(prev - payload.remainingSec) > 1) return payload.remainingSec;
          return prev;
        });
      })
    );

    unsubs.push(
      onBroadcast("answer:submit", (payload: any) => {
        setBroadcastedAnswers((prev) => {
          const next = new Set(prev);
          next.add(payload.playerId);
          return next;
        });
      })
    );

    unsubs.push(
      onBroadcast("question:open", () => {
        setSelectedAnswer(null);
        setSubmitStatus(null);
        setBroadcastedAnswers(new Set());
        syncStateRef.current.submitGuard = false;
      })
    );

    unsubs.push(
      onBroadcast("phase:change", (payload: any) => {
        if (payload.phase === "PICKING") {
          setSelectedAnswer(null);
          setSubmitStatus(null);
          setAnswerTimings([]);
          setBroadcastedAnswers(new Set());
          syncStateRef.current.submitGuard = false;
        }
      })
    );

    unsubs.push(
      onBroadcast("player:leave", (payload: any) => {
        if (payload.playerId) {
          setPlayers((prev) => prev.filter((p) => p.id !== payload.playerId));
        }
      })
    );

    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast]);

  // ── Initial fetch ─────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Fetch lobby
      const { data: lobbyData } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (cancelled) return;
      if (lobbyData) {
        setLobby(lobbyData);
        if (lobbyData.arena_state) setGameState(lobbyData.arena_state);

        // ── Load categories with question data ─────────────────────
        // Primary path: simultaneous_categories stored by handleStartSimultaneousGame
        const simCats = lobbyData.settings?.simultaneous_categories;
        if (simCats && Array.isArray(simCats) && simCats.length > 0) {
          setCategories(simCats);
        } else {
          // Fallback: build from draftPicks + questions table
          const draftPicks = lobbyData.settings?.draft?.picks || lobbyData.settings?.draftPicks || [];
          if (draftPicks.length > 0) {
            const catMap: Record<string, any> = {};
            draftPicks.forEach((pick: any) => {
              if (!catMap[pick.categoryId]) {
                catMap[pick.categoryId] = {
                  id: pick.categoryId,
                  name: pick.categoryName,
                  data: [],
                };
              }
            });
            const catIds = Object.keys(catMap);
            if (catIds.length > 0) {
              const { data: questions } = await supabase
                .from("questions")
                .select("*")
                .in("category_id", catIds);
              if (questions) {
                questions.forEach((q: any) => {
                  const cat = catMap[q.category_id];
                  if (cat) cat.data.push(q);
                });
              }
            }
            setCategories(Object.values(catMap));
          } else {
            // Last-resort fallback: selectedCategories (no question data)
            const selCats = lobbyData.settings?.selectedCategories;
            if (selCats) {
              const cats: any[] = [];
              Object.values(selCats).forEach((roundCats: any) => {
                roundCats.forEach((cat: any) => {
                  if (!cats.find((c) => c.id === cat.id)) cats.push(cat);
                });
              });
              setCategories(cats);
            }
          }
        }
      }

      // Fetch players
      const { data: playerData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code)
        .order("score", { ascending: false });

      if (!cancelled && playerData) {
        setPlayers(playerData);

        const myRecord = playerData.find((p: any) => p.id === playerId);
        if (!myRecord) {
          const existingByName = playerData.find(
            (p: any) => p.name.toLowerCase().trim() === (playerName || "").toLowerCase().trim()
          );
          if (existingByName) {
            store.setPlayerId(existingByName.id);
          } else {
            await supabase.from("players").upsert(
              { id: playerId, lobby_code: code, name: playerName || "Player", score: 0, metadata: {} },
              { onConflict: "id" }
            );
          }
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // Reset local state when active question changes
  useEffect(() => {
    const qId = activeQ?.id;
    if (!qId || syncStateRef.current.lastQuestionId === qId) return;
    syncStateRef.current.lastQuestionId = qId;
    setSelectedAnswer(null);
    setSubmitStatus(null);
    setAnswerTimings([]);
    setBroadcastedAnswers(new Set());
    syncStateRef.current.submitGuard = false;
  }, [activeQ?.id]);

  // Hydrate answer timings on RESULTS
  useEffect(() => {
    if (gameState.phase !== "RESULTS" || !activeQ?.id) return;

    supabase
      .from("simultaneous_answers")
      .select("*")
      .eq("lobby_code", code)
      .eq("question_id", activeQ.id)
      .order("rank", { ascending: true })
      .then(({ data }) => {
        if (data) setAnswerTimings(data);
      });
  }, [gameState.phase, activeQ?.id, code]);

  // ── Game-over detection ──────────────────────────────────────────────

  const totalRevealableQuestions = useMemo(() => {
    let count = 0;
    categories.slice(0, 5).forEach((cat: any) => {
      const allQuestions = cat.data || [];
      const pointValues = [100, 200, 300, 400, 500];
      pointValues.forEach((pts) => {
        if (allQuestions.some((q: any) => q.points === pts)) count++;
      });
    });
    return count;
  }, [categories]);

  useEffect(() => {
    if (gameState.phase === "PICKING" && totalRevealableQuestions > 0) {
      const revealed = gameState.revealedQuestions || [];
      if (revealed.length >= totalRevealableQuestions) {
        setIsGameOver(true);
      }
    }
  }, [gameState.phase, gameState.revealedQuestions, totalRevealableQuestions]);

  // ── Timer Logic ──────────────────────────────────────────────────────

  useEffect(() => {
    if (gameState.phase !== "OPEN" || !gameState.timerEndTime) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(async () => {
      const now = Date.now() / 1000;
      const rawRemaining = Math.ceil(gameState.timerEndTime - now);
      const displayRemaining = Math.max(0, rawRemaining);
      setTimeLeft(displayRemaining);

      if (isHost && displayRemaining > 0 && Math.abs(displayRemaining - syncStateRef.current.lastBroadcastTick) >= 1) {
        syncStateRef.current.lastBroadcastTick = displayRemaining;
        broadcast("timer:tick", { remainingSec: displayRemaining });
      }

      if (rawRemaining <= -2 && gameState.phase === "OPEN") {
        await supabase.rpc("force_close_simultaneous_question", { p_lobby_code: code });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [gameState.timerEndTime, gameState.phase, isHost, code, broadcast]);

  // ── Actions ──────────────────────────────────────────────────────────

  const openQuestion = async (q: any, categoryName: string) => {
    if (!isPicker || gameState.phase !== "PICKING") {
      console.warn("[Simul] Cannot open question:", {
        isPicker,
        phase: gameState.phase,
        pickerId: gameState.pickerId,
        playerId,
      });
      return;
    }

    const qId = q.id || `${categoryName}-${q.points}`;
    if ((gameState.revealedQuestions || []).includes(qId)) return;

    setQuestionError("");

    broadcast("question:open", {
      questionId: qId,
      category: categoryName,
      points: q.points,
    });

    const timerSecs = lobby?.settings?.timer || 15;

    try {
      const { data: qResult, error: qErr } = await supabase.rpc("open_simultaneous_question", {
        p_lobby_code: code,
        p_question_data: {
          ...q,
          id: qId,
          category: categoryName,
        },
        p_timer_seconds: timerSecs,
      });

      if (qErr) {
        console.error("[Simul] RPC open_simultaneous_question error:", qErr);
        setQuestionError(qErr.message || "Failed to open question");
        return;
      }

      if (qResult?.success === false) {
        console.error("[Simul] RPC returned failure:", qResult.error);
        setQuestionError(qResult.error || "Cannot open question now");
        return;
      }

      console.log("[Simul] Question opened:", { qId, timerSecs, timerEndTime: qResult?.timerEndTime });
    } catch (err: any) {
      console.error("[Simul] openQuestion exception:", err);
      setQuestionError(err?.message || "Network error opening question");
    }
  };

  const handleAnswer = async (answer: string) => {
    if (!activeQ || selectedAnswer || syncStateRef.current.submitGuard) return;

    syncStateRef.current.submitGuard = true;
    setSelectedAnswer(answer);
    setSubmitStatus("Submitting...");

    broadcast("answer:submit", {
      playerId,
      questionId: activeQ.id,
    });

    const startTime = activeQ.questionStartTime;
    const clientTimeMs = startTime
      ? Math.max(0, Date.now() - startTime)
      : 0;

    const { data, error } = await supabase.rpc("submit_simultaneous_answer", {
      p_lobby_code: code,
      p_player_id: playerId,
      p_answer_text: answer,
      p_client_time_ms: clientTimeMs,
    });

    if (error) {
      syncStateRef.current.submitGuard = false;
      setSelectedAnswer(null);

      if (error.message?.includes("duplicate") || error.code === "23505") {
        setSubmitStatus("Answer received");
        return;
      }
      setSubmitStatus("Network issue. Try again.");
      return;
    }

    if (data?.success === false) {
      syncStateRef.current.submitGuard = false;
      setSelectedAnswer(null);
      setSubmitStatus(data?.error || "Answer rejected");
      return;
    }

    setSubmitStatus(data?.correct ? "✅ Correct!" : "❌ Wrong");

    if (data?.all_answered) {
      setGameState((prev: any) => ({ ...prev, phase: "RESULTS" }));
    }
  };

  const nextTurn = async () => {
    if (!isPicker && playerId !== answerTimings.find((a) => a.rank === 1)?.player_id) return;

    broadcast("phase:change", { phase: "PICKING" });

    const { data, error } = await supabase.rpc("next_simultaneous_turn", {
      p_lobby_code: code,
    });

    if (error) console.error("next_simultaneous_turn error:", error);
  };

  // ── Render ───────────────────────────────────────────────────────────

  if (!lobby) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="text-warm-gray/60 font-medium text-sm animate-pulse">Loading Game...</div>
      </div>
    );
  }

  if (isGameOver) {
    return (
      <GameOver
        lobbyCode={code}
        players={players.map((p: any) => ({
          id: p.id,
          name: p.name,
          score: p.score || 0,
        }))}
        playerId={playerId}
        onPlayAgain={async () => {
          if (isHost) {
            await supabase.rpc("reset_lobby_for_new_game", { p_lobby_code: code });
          }
          window.location.reload();
        }}
        onLeave={async () => {
          await supabase.from("players").delete().eq("id", playerId).eq("lobby_code", code);
          store.clearArenaHostCode();
          window.location.href = "/";
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* Reconnection Banner */}
      {!isConnected && (
        <div className="sticky top-0 z-50 bg-peach-light border-b border-peach/30 px-4 py-3 flex items-center justify-center gap-3">
          <WifiOff className="w-4 h-4 text-peach animate-pulse" />
          <span className="text-peach text-xs font-bold uppercase tracking-widest">
            Connection lost — reconnecting...
          </span>
        </div>
      )}

      {/* Question error toast */}
      {questionError && (
        <div className="sticky top-0 z-40 bg-peach-light border-b border-peach/30 px-4 py-2 flex items-center justify-between gap-3">
          <span className="text-peach text-xs font-bold">{questionError}</span>
          <button
            onClick={() => setQuestionError("")}
            className="text-peach/60 hover:text-peach text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={async () => {
              if (confirm("Leave the game?")) {
                broadcast("player:leave", { playerId });
                await supabase.from("players").delete().eq("id", playerId).eq("lobby_code", code);
                store.clearArenaHostCode();
                window.location.href = "/";
              }
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-warm-gray/60 hover:text-plum transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>

          {/* Title + code */}
          <div className="flex items-center gap-2">
            <span className="font-outfit font-black text-lg text-plum">5×5</span>
            <span className="text-[10px] font-mono text-warm-gray/50 hidden sm:inline">{code}</span>
          </div>

          <LanguageSwitcher compact />
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
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

          {/* Picker indicator */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              isPicker && gameState.phase === "PICKING"
                ? "bg-soft-purple text-white animate-pulse"
                : "bg-warm-gray/10 text-warm-gray/60"
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>
              {isPicker && gameState.phase === "PICKING"
                ? "Your turn!"
                : `${pickerName} picks`}
            </span>
          </div>
        </div>
      </div>

      {/* Scoring info bar */}
      <div className="px-3 py-1 flex items-center gap-2 text-[10px] text-warm-gray/50 font-medium justify-center">
        <span>{scoringType === "RELATIVE" ? "Relative Scoring" : "Fastest Finger"}</span>
        <span>·</span>
        <span>{penaltyType === "HALF" ? "-50% Penalty" : "-100% Penalty"}</span>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ── Main Area ─────────────────────────────────────────────── */}
        <div className="flex-1 p-1.5 sm:p-4 overflow-y-auto relative min-h-0">
          {/* ── QUESTION OVERLAY ────────────────────────────────────── */}
          {(gameState.phase === "OPEN" || gameState.phase === "RESULTS") && activeQ ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-clay-pop">
              <ClayCard elevation="elevated" padding="lg" className="max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 relative">
                {/* Timer (OPEN only) */}
                {gameState.phase === "OPEN" && (
                  <div
                    className={`absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full font-mono font-bold text-xl ${
                      timeLeft > 5
                        ? "bg-mint-light text-mint"
                        : timeLeft > 2
                          ? "bg-butter-light text-butter animate-pulse"
                          : "bg-peach-light text-peach animate-pulse"
                    }`}
                  >
                    <Clock className="w-5 h-5" />
                    {timeLeft}s
                  </div>
                )}

                {/* Category badge */}
                <ClayBadge color="purple" dot>
                  {getCategoryEmoji(activeQ.category || "")} {getCategoryDisplayName(activeQ.category || "")} · {activeQ.points} PTS
                </ClayBadge>

                {/* Question text */}
                <h2 className="font-outfit font-extrabold text-2xl md:text-3xl text-plum text-center leading-tight">
                  {activeQ.question_text}
                </h2>

                {/* MCQ Options (OPEN phase) */}
                {gameState.phase === "OPEN" && activeQ.options && Array.isArray(activeQ.options) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeQ.options.map((opt: string, i: number) => (
                      <ClayButton
                        key={i}
                        variant={selectedAnswer === opt ? "primary" : "secondary"}
                        className="justify-start gap-2 !font-outfit !font-bold"
                        onClick={() => handleAnswer(opt)}
                        disabled={!!selectedAnswer}
                      >
                        <span className="opacity-40">{String.fromCharCode(65 + i)}.</span>
                        {opt}
                      </ClayButton>
                    ))}
                  </div>
                )}

                {/* Waiting message */}
                {selectedAnswer && gameState.phase === "OPEN" && (
                  <div className="text-center space-y-3">
                    <div className="flex items-center justify-center gap-2 text-warm-gray/60 font-medium text-sm">
                      <Clock className="w-4 h-4" />
                      {submitStatus || "Waiting for other players..."}
                    </div>
                    {isHost && timeLeft <= -3 && (
                      <button
                        onClick={() => nextTurn()}
                        className="text-peach text-xs font-bold uppercase tracking-widest border border-peach/30 px-4 py-2 rounded-full hover:bg-peach/10 transition-colors"
                      >
                        Force Next Round
                      </button>
                    )}
                  </div>
                )}

                {/* ── RESULTS ─────────────────────────────────────── */}
                {gameState.phase === "RESULTS" && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <span className="text-warm-gray/60 text-sm">Answer: </span>
                      <span className="font-bold text-xl text-mint">{activeQ.answer_text}</span>
                    </div>

                    <div className="space-y-2">
                      {answerTimings.map((t) => (
                        <ClayCard
                          key={t.player_id}
                          elevation={t.player_id === playerId ? "elevated" : "flat"}
                          padding="sm"
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg flex-shrink-0">
                              {t.rank === 1 ? "👑" : t.rank === 2 ? "🥈" : t.rank === 3 ? "🥉" : t.is_correct ? "✅" : "❌"}
                            </span>
                            <span className={`font-outfit font-bold text-sm truncate ${t.is_correct ? "text-plum" : "text-peach"}`}>
                              {t.player_name}
                            </span>
                            <span className="text-warm-gray/50 text-xs truncate hidden sm:inline">{t.answer_text}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-warm-gray/50 font-mono text-xs">
                              {(t.answer_time_ms / 1000).toFixed(1)}s
                            </span>
                            <span className={`font-mono font-bold text-sm ${t.points_awarded >= 0 ? "text-mint" : "text-peach"}`}>
                              {t.points_awarded > 0 ? `+${t.points_awarded}` : t.points_awarded}
                            </span>
                          </div>
                        </ClayCard>
                      ))}
                    </div>

                    {(isPicker || playerId === answerTimings.find((a) => a.rank === 1)?.player_id) && (
                      <ClayButton
                        variant="primary"
                        className="w-full"
                        size="lg"
                        onClick={nextTurn}
                        icon={<Play className="w-4 h-4" />}
                      >
                        Next Round
                      </ClayButton>
                    )}
                  </div>
                )}
              </ClayCard>
            </div>
          ) : (
            /* ── 5×5 GRID ──────────────────────────────────────────── */
            <div
              className="grid gap-1 sm:gap-2 h-full overflow-y-auto"
              style={{
                gridTemplateColumns: `repeat(${Math.min(categories.length, 5)}, minmax(0, 1fr))`,
              }}
            >
              {categories.slice(0, 5).map((cat: any, colIndex: number) => {
                const allQuestions = cat.data || [];
                const pointValues = [100, 200, 300, 400, 500];
                const questions = pointValues
                  .map((pts) => allQuestions.find((q: any) => q.points === pts) || null)
                  .filter(Boolean);
                const color = CAT_TILE_COLORS[colIndex % CAT_TILE_COLORS.length];
                const displayName = getCategoryDisplayName(cat.name || "");
                const emoji = getCategoryEmoji(cat.name || "");

                return (
                  <div key={cat.id || cat.name} className="flex flex-col gap-1 sm:gap-2 min-h-0 h-full">
                    {/* Category header */}
                    <ClayCard
                      elevation="flat"
                      padding="sm"
                      className="min-h-[80px] sm:min-h-[5rem] flex flex-col items-center justify-center flex-shrink-0"
                    >
                      <span className="hidden sm:block text-lg leading-none mb-0.5">{emoji}</span>
                      <span className="font-outfit font-extrabold text-[10px] sm:text-xs md:text-sm text-plum uppercase tracking-wide text-center leading-tight line-clamp-3">
                        {displayName}
                      </span>
                    </ClayCard>

                    {/* Question tiles */}
                    <div className="flex-1 flex flex-col gap-1 sm:gap-2">
                      {questions
                        .sort((a: any, b: any) => a.points - b.points)
                        .map((q: any) => {
                          const qId = q.id || `${displayName}-${q.points}`;
                          const isRevealed = (gameState.revealedQuestions || []).includes(qId);
                          const canClick = isPicker && gameState.phase === "PICKING" && !isRevealed;

                          return (
                            <ClayTile
                              key={qId}
                              state={isRevealed ? "revealed" : canClick ? "unrevealed" : "disabled"}
                              color={color}
                              points={q.points}
                              answer={isRevealed ? (q.answer_text || "").slice(0, 24) : undefined}
                              onClick={canClick ? () => openQuestion(q, cat.name) : undefined}
                              className="flex-1"
                            />
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Sidebar ────────────────────────────────────────────────── */}
        <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-warm-gray/10 bg-warm-white/50 overflow-y-auto p-2 sm:p-3 space-y-3 sm:space-y-4 flex-shrink-0 max-h-48 lg:max-h-none">
          {/* Standings */}
          <div className="space-y-1 sm:space-y-2">
            <h4 className="text-[10px] font-black text-warm-gray/70 uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="w-3 h-3" /> Standings
            </h4>

            {players.map((p, idx) => (
              <ClayCard key={p.id} elevation="flat" padding="sm" className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-outfit font-black text-xs text-warm-gray/80 w-5 text-center flex-shrink-0">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                  </span>
                  <ClayAvatar
                    name={p.name}
                    size="sm"
                    color={getAvatarColor(p.name, idx)}
                    status={p.id === gameState.pickerId ? "online" : undefined}
                  />
                  <span className="font-outfit font-bold text-xs text-plum truncate">{p.name}</span>
                </div>
                <span className="font-mono font-bold text-sm text-soft-purple flex-shrink-0 ml-2">{p.score || 0}</span>
              </ClayCard>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-warm-gray/10" />

          {/* This Round */}
          <div className="space-y-1 sm:space-y-2">
            <h4 className="text-[10px] font-black text-warm-gray/70 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> This Round
            </h4>

            {answerTimings.length > 0 || broadcastedAnswers.size > 0 ? (
              <>
                {/* Broadcast answers (instant, before DB confirm) */}
                {Array.from(broadcastedAnswers).map((pid) => {
                  if (answerTimings.find((a) => a.player_id === pid)) return null;
                  const p = players.find((pl: any) => pl.id === pid);
                  return (
                    <div
                      key={`bc-${pid}`}
                      className="flex items-center justify-between p-2 rounded-xl bg-mint-light border border-mint/20 animate-pulse"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm flex-shrink-0">⏳</span>
                        <span className="text-mint text-xs font-bold truncate">
                          {p?.name || pid.slice(0, 6)}
                        </span>
                      </div>
                      <span className="text-mint/60 font-mono text-[10px] flex-shrink-0">answering...</span>
                    </div>
                  );
                })}
                {/* DB-confirmed answers */}
                {answerTimings.map((a) => (
                  <div
                    key={a.player_id}
                    className={`flex items-center justify-between p-2 rounded-xl ${a.is_correct ? "bg-mint-light border border-mint/20" : "bg-peach-light border border-peach/20"}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm flex-shrink-0">
                        {a.rank === 1 ? "🥇" : a.rank === 2 ? "🥈" : a.rank === 3 ? "🥉" : a.is_correct ? "✅" : "❌"}
                      </span>
                      <span className="text-plum text-xs font-bold truncate">{a.player_name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-warm-gray/50 font-mono text-[10px]">
                        {(a.answer_time_ms / 1000).toFixed(1)}s
                      </span>
                      <span className={`font-mono font-bold text-xs ${a.points_awarded >= 0 ? "text-mint" : "text-peach"}`}>
                        {a.points_awarded >= 0 ? "+" : ""}{a.points_awarded}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center text-warm-gray/50 text-[10px] py-4">Waiting for answers...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
