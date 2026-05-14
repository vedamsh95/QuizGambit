import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Trophy, Zap, XCircle, Eye, Clock, LogOut } from "lucide-react";
import confetti from "canvas-confetti";
import { pickUnseenQuestion } from "../lib/spacedRepetition";

interface ArenaBoardProps {
  code: string;
  playerId: string;
  playerName: string;
}

// Neon Color Palette for Categories
const CATEGORY_COLORS = [
  {
    name: "emerald",
    bg: "bg-emerald-500",
    text: "text-emerald-500",
    border: "border-emerald-500/50",
    gradient: "from-emerald-500/20",
  },
  {
    name: "blue",
    bg: "bg-blue-500",
    text: "text-blue-500",
    border: "border-blue-500/50",
    gradient: "from-blue-500/20",
  },
  {
    name: "purple",
    bg: "bg-purple-500",
    text: "text-purple-500",
    border: "border-purple-500/50",
    gradient: "from-purple-500/20",
  },
  {
    name: "pink",
    bg: "bg-pink-500",
    text: "text-pink-500",
    border: "border-pink-500/50",
    gradient: "from-pink-500/20",
  },
  {
    name: "yellow",
    bg: "bg-yellow-500",
    text: "text-yellow-500",
    border: "border-yellow-500/50",
    gradient: "from-yellow-500/20",
  },
];

export default function ArenaBoard({
  code,
  playerId,
  playerName,
}: ArenaBoardProps) {
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // SYNCED GAME STATE (from lobbies.arena_state)
  const [arenaState, setArenaState] = useState<any>({
    phase: "PICKING",
    pickerId: null,
    activeQuestion: null,
    revealedQuestions: [],
    timerEndTime: null,
  });

  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [numericInput, setNumericInput] = useState("");
  const [answerTimings, setAnswerTimings] = useState<any[]>([]);

  // Timer
  const [timeLeft, setTimeLeft] = useState(0);
  const isHost = lobby?.host_id === playerId;

  // Initial Fetch & Subscription & Polling
  useEffect(() => {
    const init = async () => {
      const { data: lobbyData, error } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (lobbyData) {
        setLobby(lobbyData);
        if (lobbyData.arena_state) {
          setArenaState(lobbyData.arena_state);
        }
        const draftPicks = lobbyData.settings?.draft?.picks || [];
        setCategories(draftPicks);
      }

      const { data: playerData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code)
        .order("score", { ascending: false });
      if (playerData) {
        setPlayers(playerData);

        // DEBUG & FIX: Verify this client's playerId exists in the players list
        const myPlayerRecord = playerData.find((p: any) => p.id === playerId);
        if (myPlayerRecord) {
          console.log(
            "[Arena] ✅ Player verified:",
            myPlayerRecord.name,
            "ID:",
            playerId.slice(0, 8),
          );
        } else {
          console.error(
            "[Arena] ❌ PLAYER NOT FOUND! Checking for name match...",
          );

          // FIX: Check if player exists with same name in this lobby (prevents duplicates)
          const existingByName = playerData.find(
            (p: any) =>
              p.name.toLowerCase().trim() ===
              (playerName || "").toLowerCase().trim(),
          );

          if (existingByName) {
            // Player exists with different ID - update localStorage to match
            console.log(
              "[Arena] Found existing player by name, syncing ID:",
              existingByName.id.slice(0, 8),
            );
            localStorage.setItem("qb_pid", existingByName.id);
            // Force page reload to use correct ID
            window.location.reload();
          } else {
            // Truly new player - auto-register
            const { error } = await supabase.from("players").upsert(
              {
                id: playerId,
                lobby_code: code,
                name: playerName || "Player",
                score: 0,
                metadata: {},
              },
              { onConflict: "id" },
            );

            if (!error) {
              console.log("[Arena] ✅ Player auto-registered successfully");
              const { data: refreshedPlayers } = await supabase
                .from("players")
                .select("*")
                .eq("lobby_code", code)
                .order("score", { ascending: false });
              if (refreshedPlayers) setPlayers(refreshedPlayers);
            } else {
              console.error("[Arena] Failed to auto-register:", error);
            }
          }
        }
      }
    };
    init();

    // P1: Fast Reconnect (Fetch then Subscribe)
    const setupConnection = async () => {
      // 1. Initial Fetch
      const { data } = await supabase
        .from("lobbies")
        .select("arena_state")
        .eq("code", code)
        .single();
      if (data?.arena_state) setArenaState(data.arena_state);

      const { data: pData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code)
        .order("score", { ascending: false });
      if (pData) setPlayers(pData);
    };
    setupConnection();

    // 2. Realtime Subscription
    const channel = supabase
      .channel("arena_sync")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lobbies",
          filter: `code=eq.${code}`,
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData.arena_state) {
            setArenaState(newData.arena_state);
            // Reset local defaults on new round (PICKING phase)
            if (newData.arena_state.phase === "PICKING") {
              setMyAnswer(null);
              setNumericInput("");
              setAnswerTimings([]);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `lobby_code=eq.${code}`,
        },
        async () => {
          const { data } = await supabase
            .from("players")
            .select("*")
            .eq("lobby_code", code)
            .order("score", { ascending: false });
          if (data) setPlayers(data);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "arena_answers",
          filter: `lobby_code=eq.${code}`,
        },
        (payload) => {
          const newAnswer = payload.new as any;
          if (newAnswer.player_id === playerId) {
            setMyAnswer(newAnswer.answer_text);
          }
          setAnswerTimings((prev: any[]) => {
            const exists = prev.find(
              (a: any) => a.player_id === newAnswer.player_id,
            );
            if (exists) return prev;
            return [...prev, newAnswer].sort(
              (a: any, b: any) => a.answer_time_ms - b.answer_time_ms,
            );
          });
        },
      )
      .subscribe((status) => {
        console.log("[Arena] Realtime status:", status);
      });

    // RESTORED: Lightweight 3s polling fallback (Realtime can be flaky)
    const poller = setInterval(async () => {
      const { data } = await supabase
        .from("lobbies")
        .select("arena_state")
        .eq("code", code)
        .single();
      if (data?.arena_state) {
        setArenaState((prev: any) => {
          // Only update if state actually changed
          if (JSON.stringify(prev) !== JSON.stringify(data.arena_state)) {
            console.log("[Arena] Poller detected state change");
            // Reset on new PICKING phase
            if (
              data.arena_state.phase === "PICKING" &&
              prev?.phase !== "PICKING"
            ) {
              setMyAnswer(null);
              setNumericInput("");
              setAnswerTimings([]);
            }
            return data.arena_state;
          }
          return prev;
        });

        // Fetch answer timings for current question
        if (data.arena_state?.activeQuestion?.id) {
          const { data: answersData } = await supabase
            .from("arena_answers")
            .select("*")
            .eq("lobby_code", code)
            .eq("question_id", data.arena_state.activeQuestion.id)
            .order("answer_time_ms", { ascending: true });

          if (answersData && answersData.length > 0) {
            setAnswerTimings(answersData);
          }
        }
      }
      // Also refresh players
      const { data: pData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code)
        .order("score", { ascending: false });
      if (pData) setPlayers(pData);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poller);
    };
  }, [code, playerId]);

  // P3: Host Watchdog for Stale Pickers
  useEffect(() => {
    if (!isHost) return;
    const watchdog = setInterval(async () => {
      // RPC that force-skips picker if last_seen > 20s
      // We await it but ignore the result/error silently
      await supabase.rpc("check_stale_picker", { p_lobby_code: code });
    }, 5000);
    return () => clearInterval(watchdog);
  }, [isHost, code]);

  // Timer Logic
  useEffect(() => {
    if (arenaState.phase !== "OPEN" || !arenaState.timerEndTime) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(async () => {
      const now = Date.now() / 1000;
      const rawRemaining = Math.ceil(arenaState.timerEndTime - now);
      const displayRemaining = Math.max(0, rawRemaining);
      setTimeLeft(displayRemaining);

      // Player auto-submits their own timeout
      if (rawRemaining <= 0 && !myAnswer && arenaState.phase === "OPEN") {
        submitTimeout();
      }

      // Host forces round to close after timer + 2s grace period
      if (rawRemaining <= -2 && isHost && arenaState.phase === "OPEN") {
        console.log("[Arena] Host forcing question close due to timeout");
        await supabase.rpc("force_close_question", { p_lobby_code: code });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [arenaState.timerEndTime, arenaState.phase, myAnswer, isHost, code]);

  // Submit TIMEOUT answer
  const submitTimeout = async () => {
    if (myAnswer) return;
    setMyAnswer("TIMEOUT");
    await handleAnswer("TIMEOUT");
  };

  const cleanId = (id: any) => String(id || "").trim();
  const effectivePickerId = arenaState.pickerId || players[0]?.id;
  const isPicker = cleanId(playerId) === cleanId(effectivePickerId);
  const pickerName =
    players.find((p) => cleanId(p.id) === cleanId(effectivePickerId))?.name ||
    "Unknown";
  const activeQ = arenaState.activeQuestion;

  // Actions
  const openQuestion = async (q: any, categoryName: string) => {
    if (!isPicker) return;
    if (
      (arenaState.revealedQuestions || []).includes(
        q.id || `${categoryName}-${q.points}`,
      )
    )
      return;

    console.log("[Arena] Opening Question RPC...");
    await supabase.rpc("open_arena_question", {
      p_lobby_code: code,
      p_question_data: {
        ...q,
        id: q.id || `${categoryName}-${q.points}`,
        category: categoryName,
        startTime: Date.now(), // Server will overwrite usually but helpful payload
      },
      p_timer_seconds:
        lobby?.settings?.answerTime ?? lobby?.settings?.timer ?? 15,
    });
  };

  const handleAnswer = async (answer: string) => {
    if (!activeQ) return;

    // Optimistic update
    setMyAnswer(answer);

    const payload = {
      p_lobby_code: code,
      p_player_id: playerId,
      p_answer_text: answer || "",
    };

    console.log("Submitting Answer Payload:", payload);

    const { data, error } = await supabase.rpc("submit_arena_answer", payload);

    if (error) {
      // FIX: Treat 409 Conflict (Duplicate) as success to prevent UI hang
      // Supabase/Postgres returns '23505' for unique violations
      if (
        error.code === "409" ||
        error.code === "23505" ||
        error.message?.includes("Conflict") ||
        error.message?.includes("duplicate")
      ) {
        console.warn("[Arena] Duplicate answer ignored (409/23505)");
      } else {
        console.error("Answer submit failed:", error);
      }
    }

    // RPC will trigger phase change to RESULTS if everyone answered
    if (data?.all_answered) {
      console.log("All players answered! Waiting for sync...");
    }
  };

  const nextTurn = async () => {
    // FIX #1: Query DB directly for winner (rank=1) instead of using stale local state
    const { data: winnerData } = await supabase
      .from("arena_answers")
      .select("player_id")
      .eq("lobby_code", code)
      .eq("question_id", arenaState.activeQuestion?.id)
      .eq("rank", 1)
      .maybeSingle();

    let nextPickerId = winnerData?.player_id || players[0]?.id;

    // Fallback: If no winner found, use first active player
    if (!nextPickerId) {
      console.log("[Arena] No winner found, defaulting to first player");
      nextPickerId = players[0]?.id;
    }

    console.log(
      "[Arena] Next picker:",
      nextPickerId,
      "Revealing Q:",
      arenaState.activeQuestion?.id,
    );
    await supabase.rpc("next_arena_turn", {
      p_lobby_code: code,
      p_next_picker_id: nextPickerId,
      p_revealed_question_id: arenaState.activeQuestion?.id || null,
    });
  };

  if (!lobby)
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center text-white">
        Loading Arena...
      </div>
    );

  return (
    <div className="min-h-screen bg-deep-void flex flex-col p-4 relative">
      <div className="fixed top-0 left-0 bg-black/90 text-green-400 text-[10px] z-[100] px-2 py-1 font-mono pointer-events-none border-b border-green-900 w-full text-center">
        ME:{playerId?.slice(0, 4)} | PK_ID:{arenaState.pickerId?.slice(0, 4)} |
        IS_PK:{String(isPicker)} | PH:{arenaState.phase}
      </div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4 px-4 py-3 bg-black/40 rounded-2xl border border-white/5">
        <div className="flex items-center gap-4">
          <span className="text-neon-emerald font-orbitron font-black text-2xl">
            ARENA
          </span>
          <span className="text-white/20 font-mono text-sm">{code}</span>
          <button
            onClick={async () => {
              if (confirm("Are you sure you want to leave the game?")) {
                const { error } = await supabase.rpc("leave_game", {
                  p_lobby_code: code,
                  p_player_id: playerId,
                });

                if (error) {
                  console.warn(
                    "[Arena] leave_game RPC failed, falling back to direct player delete:",
                    error,
                  );
                  await supabase
                    .from("players")
                    .delete()
                    .eq("id", playerId)
                    .eq("lobby_code", code);
                }

                localStorage.removeItem("arena_host_code");
                navigate("/");
              }
            }}
            className="ml-2 p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 transition-all flex items-center gap-1 text-xs"
            title="Leave Game"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Leave</span>
          </button>
        </div>

        <div
          className={`px-4 py-2 rounded-xl ${isPicker && arenaState.phase === "PICKING" ? "bg-neon-emerald text-black animate-pulse" : "bg-white/10 text-white/60"} font-bold text-sm uppercase tracking-wider flex items-center gap-2`}
        >
          <Zap className="w-4 h-4" />
          <div className="flex flex-col items-end">
            <span>
              {isPicker ? "YOUR TURN TO PICK!" : `${pickerName} picks next`}
            </span>
            {isHost && !isPicker && (
              <button
                onClick={() => nextTurn()}
                className="text-[10px] text-red-400 hover:text-red-300 underline mt-1"
              >
                Force Skip Picker
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex-1 flex flex-col relative">
          {/* MODAL: QUESTION PHASE or RESULTS PHASE */}
          {(arenaState.phase === "OPEN" || arenaState.phase === "RESULTS") &&
          activeQ ? (
            <div className="absolute inset-0 z-30 glass p-6 md:p-12 rounded-3xl flex flex-col items-center justify-center text-center space-y-8 animate-in zoom-in-95 duration-300">
              {/* Timer (Only show during OPEN) */}
              {arenaState.phase === "OPEN" && (
                <div
                  className={`absolute top-6 left-6 flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-2xl ${
                    timeLeft > 5
                      ? "bg-neon-emerald/20 text-neon-emerald"
                      : timeLeft > 2
                        ? "bg-yellow-500/20 text-yellow-400 animate-pulse"
                        : "bg-red-500/20 text-red-400 animate-pulse"
                  }`}
                >
                  <Clock className="w-6 h-6" />
                  {timeLeft}s
                </div>
              )}

              {/* Question Content */}
              <div className="space-y-6 relative z-10 w-full max-w-4xl">
                <div className="text-neon-emerald font-orbitron font-black text-[10px] tracking-[0.5em] uppercase px-4 py-2 bg-neon-emerald/10 rounded-full inline-block mb-4 border border-neon-emerald/20">
                  {activeQ.category} | {activeQ.points} PTS
                </div>

                <h2 className="text-3xl md:text-5xl font-orbitron font-black text-white leading-tight tracking-tight drop-shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                  {activeQ.question_text}
                </h2>

                {/* INPUTS: Only show inputs during OPEN phase */}
                {arenaState.phase === "OPEN" && (
                  <>
                    {activeQ.options && Array.isArray(activeQ.options) ? (
                      <div className="grid grid-cols-2 gap-4 mt-8">
                        {activeQ.options.map((opt: string, i: number) => (
                          <button
                            key={i}
                            onClick={() => handleAnswer(opt)}
                            disabled={!!myAnswer}
                            className={`p-6 rounded-xl border-2 text-xl font-bold transition-all ${
                              myAnswer === opt
                                ? "bg-white/20 border-white text-white scale-105"
                                : "bg-white/5 border-white/10 hover:border-neon-emerald hover:bg-neon-emerald/10 text-white hover:scale-105"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 mt-8 w-full max-w-md mx-auto">
                        <div className="flex gap-4 w-full">
                          <input
                            type="number"
                            value={numericInput}
                            onChange={(e) => setNumericInput(e.target.value)}
                            disabled={!!myAnswer}
                            placeholder="Enter number..."
                            className="flex-1 px-6 py-4 bg-white/10 border-2 border-white/20 rounded-xl text-white text-2xl font-mono font-bold focus:border-neon-emerald focus:outline-none"
                            onKeyDown={(e) => {
                              if (
                                e.key === "Enter" &&
                                numericInput &&
                                !myAnswer
                              )
                                handleAnswer(numericInput);
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() =>
                              numericInput && handleAnswer(numericInput)
                            }
                            disabled={!numericInput || !!myAnswer}
                            className="px-8 py-4 bg-neon-emerald text-black font-bold rounded-xl hover:scale-105 transition-all disabled:opacity-30"
                          >
                            Submit
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Waiting Message */}
                    {myAnswer && (
                      <div className="mt-8 text-white/60 animate-pulse font-mono flex flex-col items-center justify-center gap-4">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Waiting for other players...
                        </div>
                        {isHost && timeLeft <= -5 && (
                          <button
                            onClick={() => nextTurn()}
                            className="text-red-400 text-xs font-bold uppercase tracking-widest border border-red-500/30 px-4 py-2 rounded-full hover:bg-red-500/20 hover:text-red-300 transition-colors"
                          >
                            Force Next Round
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* RESULTS: Show Correct Answer & Winner */}
                {arenaState.phase === "RESULTS" && (
                  <div className="mt-8 space-y-6 animate-in slide-in-from-bottom-5">
                    <div className="text-2xl font-bold text-white mb-2">
                      Answer:{" "}
                      <span className="text-neon-emerald">
                        {activeQ.answer_text}
                      </span>
                    </div>

                    {/* Who Won? */}
                    <div className="grid gap-2 max-w-md mx-auto">
                      {answerTimings.map((t) => (
                        <div
                          key={t.player_id}
                          className={`flex justify-between items-center p-3 rounded-lg ${t.player_id === playerId ? "bg-white/10 border border-white/20" : "bg-black/20"}`}
                        >
                          <div className="flex items-center gap-3">
                            {t.rank === 1 && (
                              <span className="text-xl">👑</span>
                            )}
                            <span
                              className={
                                t.is_correct
                                  ? "text-neon-emerald font-bold"
                                  : "text-red-400"
                              }
                            >
                              {t.player_name}
                            </span>
                          </div>
                          <div className="flex gap-4 font-mono text-sm">
                            <span>{(t.answer_time_ms / 1000).toFixed(2)}s</span>
                            <span
                              className={
                                t.points_awarded > 0
                                  ? "text-neon-emerald"
                                  : "text-red-400"
                              }
                            >
                              {t.points_awarded > 0
                                ? `+${t.points_awarded}`
                                : t.points_awarded}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {(isPicker ||
                      playerId ===
                        answerTimings.find((a) => a.rank === 1)?.player_id) && (
                      <button
                        onClick={nextTurn}
                        className="mt-8 px-8 py-4 bg-neon-emerald text-black font-bold rounded-xl hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                      >
                        Next Round →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* GRID (Only visible when no Active Question modal) */
            <div
              className="h-full grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(categories.length, 5)}, minmax(0, 1fr))`,
              }}
            >
              {categories.slice(0, 5).map((cat: any, colIndex: number) => {
                const allQuestions = cat.data || [];
                const pointValues = [100, 200, 300, 400, 500];
                // Use spaced repetition to pick questions (or fall back to first match)
                const questions = pointValues
                  .map((pts) => {
                    const atThisLevel = allQuestions.filter(
                      (q: any) => q.points === pts,
                    );
                    // For Arena, just pick first for now since questions are pre-selected per session
                    // The spaced rep is better applied during draft selection
                    return atThisLevel[0] || null;
                  })
                  .filter(Boolean);
                const theme =
                  CATEGORY_COLORS[colIndex % CATEGORY_COLORS.length];

                return (
                  <div key={cat.id} className="flex flex-col gap-2 h-full">
                    <div
                      className={`h-16 md:h-20 glass rounded-lg flex items-center justify-center text-center p-2 border relative group overflow-hidden ${theme.border} bg-gradient-to-b ${theme.gradient} to-transparent`}
                    >
                      <span className="text-white font-black text-[9px] md:text-[10px] uppercase tracking-widest leading-relaxed line-clamp-3 relative z-10 drop-shadow-md">
                        {cat.name}
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      {questions
                        .sort((a: any, b: any) => a.points - b.points)
                        .map((q: any, rowIndex: number) => {
                          // FIX: Use cat.name (not cat.id) to match openQuestion format
                          const qId = q.id || `${cat.name}-${q.points}`;
                          // Check synced revealed list
                          const isRevealed = (
                            arenaState.revealedQuestions || []
                          ).includes(qId);
                          const opacity = 0.1 + rowIndex * 0.1;

                          return (
                            <button
                              key={qId}
                              onClick={() => openQuestion(q, cat.name)}
                              disabled={
                                isRevealed ||
                                !isPicker ||
                                arenaState.phase !== "PICKING"
                              }
                              className={`flex-1 rounded flex flex-col items-center justify-center transition-all group relative overflow-hidden border p-1 ${
                                isRevealed
                                  ? "bg-slate-600/80 border-slate-400/50 cursor-default"
                                  : !isPicker || arenaState.phase !== "PICKING"
                                    ? `${theme.border} border-opacity-30 opacity-50 cursor-not-allowed`
                                    : `hover:bg-white/10 ${theme.border} border-opacity-30 cursor-pointer hover:scale-105`
                              }`}
                            >
                              {!isRevealed && (
                                <div
                                  className={`absolute inset-0 ${theme.bg}`}
                                  style={{ opacity }}
                                />
                              )}
                              {isRevealed ? (
                                <div className="flex flex-col items-center justify-center gap-0.5 w-full">
                                  <span className="text-slate-300 text-[7px] font-medium line-through opacity-60">
                                    {q.points}
                                  </span>
                                  <span className="text-white text-[10px] font-bold text-center leading-tight line-clamp-2 px-0.5">
                                    {q.answer_text || q.numeric_answer || "✓"}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xl font-bold text-white relative z-10">
                                  {q.points}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar - FIX #2: Split into Standings + Results */}
        <div className="w-72 bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col gap-4 overflow-hidden">
          {/* Top Half: Standings */}
          <div className="flex-1 min-h-0">
            <h3 className="text-white/40 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4" /> Standings
            </h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {players.map((p, idx) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-2 rounded-lg ${p.id === playerId ? "bg-neon-emerald/10 border border-neon-emerald/30" : "bg-white/5"} ${p.id === arenaState.pickerId ? "ring-1 ring-neon-emerald" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="text-white font-bold text-xs truncate max-w-20">
                      {p.name}
                    </span>
                    {p.id === arenaState.pickerId && (
                      <Zap className="w-3 h-3 text-neon-emerald" />
                    )}
                  </div>
                  <span className="text-neon-emerald font-mono font-bold text-sm">
                    {p.score || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Half: Round Results */}
          <div className="flex-1 min-h-0 border-t border-white/10 pt-3">
            <h3 className="text-white/40 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4" /> This Round
            </h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {answerTimings.length > 0 ? (
                answerTimings.map((a: any, idx: number) => (
                  <div
                    key={a.player_id}
                    className={`flex items-center justify-between p-2 rounded-lg ${a.is_correct ? "bg-green-500/10" : "bg-red-500/10"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {a.rank === 1
                          ? "🥇"
                          : a.rank === 2
                            ? "🥈"
                            : a.rank === 3
                              ? "🥉"
                              : a.is_correct
                                ? "✅"
                                : "❌"}
                      </span>
                      <span className="text-white text-xs truncate max-w-16">
                        {a.player_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/50 font-mono text-[10px]">
                        {(a.answer_time_ms / 1000).toFixed(1)}s
                      </span>
                      <span
                        className={`font-mono font-bold text-xs ${a.points_awarded >= 0 ? "text-green-400" : "text-red-400"}`}
                      >
                        {a.points_awarded >= 0 ? "+" : ""}
                        {a.points_awarded}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-white/30 text-xs text-center py-4">
                  Waiting for answers...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
