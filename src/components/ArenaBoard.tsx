import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { store } from "../lib/storage";
import { Trophy, Zap, XCircle, Eye, Clock, LogOut, WifiOff } from "lucide-react";
import GameOver from "./GameOver";
import { GameHeaderButton, GameConnectionBadge } from "./ui";

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
  playerId: initialPlayerId,
  playerName,
}: ArenaBoardProps) {
  const navigate = useNavigate();
  // Local playerId that can be overridden on name collision (prevents reload loop)
  const [playerId, setPlayerId] = useState<string>(initialPlayerId);
  // Ref to avoid re-triggering the init effect when playerId syncs after collision
  const resolvedPlayerIdRef = useRef<string>(initialPlayerId);
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
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const lastQuestionIdRef = useRef<string | null>(null);
  const roundTraceIdRef = useRef<string>("-");

  // ── Presence: track this player + all online players ────────────────────
  const { presences, isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: `arena:${code}`,
    enablePresence: true,
    presenceData: {
      playerId,
      name: playerName || "Player",
      status: "connected" as const,
    },
  });

  // Track players who broadcast their answer (optimistic, before DB confirmation)
  const [broadcastedAnswers, setBroadcastedAnswers] = useState<Set<string>>(new Set());

  // Timer
  const [timeLeft, setTimeLeft] = useState(0);
  const isHost = lobby?.host_id === playerId;

  // ── Broadcast event handlers (instant peer-to-peer communication) ──────
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Timer ticks from host (sync display across all clients)
    unsubs.push(
      onBroadcast('timer:tick', (payload: any) => {
        // Minor sync: update if drift exceeds 1s
        setTimeLeft((prev) => {
          if (Math.abs(prev - payload.remainingSec) > 1) {
            return payload.remainingSec;
          }
          return prev;
        });
      })
    );

    // Answer submitted by another player (instant sidebar feedback)
    unsubs.push(
      onBroadcast('answer:submit', (payload: any) => {
        setBroadcastedAnswers((prev) => {
          const next = new Set(prev);
          next.add(payload.playerId);
          return next;
        });
      })
    );

    // Question opened by host
    unsubs.push(
      onBroadcast('question:open', (_payload: any) => {
        // Reset local answer state for snappy transition
        setMyAnswer(null);
        setNumericInput('');
        setSubmitStatus(null);
        setBroadcastedAnswers(new Set());
      })
    );

    // Phase change from host
    unsubs.push(
      onBroadcast('phase:change', (payload: any) => {
        if (payload.phase === 'PICKING') {
          setMyAnswer(null);
          setNumericInput('');
          setAnswerTimings([]);
          setSubmitStatus(null);
          setBroadcastedAnswers(new Set());
        }
      })
    );

    unsubs.push(
      onBroadcast('player:leave', (payload: any) => {
        if (payload.playerId) {
          setPlayers((prev) => prev.filter((p) => p.id !== payload.playerId));
        }
      })
    );

    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast]);

  const pushDebug = (event: string, details?: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    const qId = arenaState?.activeQuestion?.id || "-";
    const line = `[${ts}] [trace:${roundTraceIdRef.current}] [q:${qId}] ${event}${details ? ` | ${details}` : ""}`;
    setDebugEvents((prev) => [line, ...prev].slice(0, 30));
    console.log("[ArenaDebug]", line);
  };

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
            // Player exists with different ID - sync localStorage to match
            // Use the existing player's ID instead of reloading (fixes infinite loop)
            console.log(
              "[Arena] Found existing player by name, syncing ID:",
              existingByName.id.slice(0, 8),
            );
            store.setPlayerId(existingByName.id);
            // Continue with synced ID — no reload needed
            resolvedPlayerIdRef.current = existingByName.id;
            setPlayerId(existingByName.id);
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
              setSubmitStatus(null);
              setBroadcastedAnswers(new Set());
              pushDebug("phase:PICKING", "local answer state reset");
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
            setSubmitStatus("Answer received");
          }
          pushDebug(
            "answer:insert",
            `${newAnswer.player_name || newAnswer.player_id} rank:${newAnswer.rank ?? "-"} points:${newAnswer.points_awarded ?? "-"}`,
          );
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [code]); // Only re-init on code change — playerId sync handled via ref

  // Reset local input when active question changes (authoritative server phase + question id)
  useEffect(() => {
    const qId = arenaState?.activeQuestion?.id || null;
    if (!qId) return;

    if (lastQuestionIdRef.current !== qId) {
      lastQuestionIdRef.current = qId;
      roundTraceIdRef.current = `${code}-${qId}-${Date.now().toString(36)}`;
      setMyAnswer(null);
      setNumericInput("");
      setAnswerTimings([]);
      setSubmitStatus(null);
      setBroadcastedAnswers(new Set());
      pushDebug("question:changed", `new trace created for ${qId}`);
    }
  }, [arenaState?.activeQuestion?.id]);

  // Hydrate answer timings on RESULTS in case client missed insert events
  useEffect(() => {
    if (arenaState.phase !== "RESULTS" || !arenaState?.activeQuestion?.id)
      return;

    const loadResults = async () => {
      const { data } = await supabase
        .from("arena_answers")
        .select("*")
        .eq("lobby_code", code)
        .eq("question_id", arenaState.activeQuestion.id)
        .order("answer_time_ms", { ascending: true });

      if (data) setAnswerTimings(data);
    };

    loadResults();
  }, [arenaState.phase, arenaState?.activeQuestion?.id, code]);

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

  // Timer Logic (local countdown + Broadcast sync)
  const lastBroadcastTickRef = useRef(0);

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

      // Host broadcasts timer tick every 1s for instant sync across clients
      if (isHost && displayRemaining > 0 && Math.abs(displayRemaining - lastBroadcastTickRef.current) >= 1) {
        lastBroadcastTickRef.current = displayRemaining;
        broadcast('timer:tick', { remainingSec: displayRemaining });
      }

      // Player auto-submits their own timeout
      if (rawRemaining <= 0 && !myAnswer && arenaState.phase === "OPEN") {
        submitTimeout();
      }

      // Any client forces round to close after timer + 2s grace period.
      // Previously only the host did this, but if the host disconnects,
      // non-host clients would be stuck. force_close_question is idempotent
      // (checks phase=OPEN first), so duplicate calls are harmless.
      if (rawRemaining <= -2 && arenaState.phase === "OPEN") {
        console.log("[Arena] Timer expired, forcing question close");
        pushDebug("timer:force_close", `remaining:${rawRemaining.toFixed(1)}s host:${isHost}`);
        await supabase.rpc("force_close_question", { p_lobby_code: code });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [arenaState.timerEndTime, arenaState.phase, myAnswer, isHost, code, broadcast]);

  // Submit TIMEOUT answer
  const submitTimeout = async () => {
    if (myAnswer) return;
    await handleAnswer("TIMEOUT");
  };

  const cleanId = (id: any) => String(id || "").trim();
  const effectivePickerId = arenaState.pickerId || players[0]?.id;
  const isPicker = cleanId(playerId) === cleanId(effectivePickerId);
  const pickerName =
    players.find((p) => cleanId(p.id) === cleanId(effectivePickerId))?.name ||
    "Unknown";
  const activeQ = arenaState.activeQuestion;

  // ── Game-over detection: all questions revealed across all categories ────
  const totalRevealableQuestions = useMemo(() => {
    let count = 0;
    categories.slice(0, 5).forEach((cat: any) => {
      const allQuestions = cat.data || [];
      const pointValues = [100, 200, 300, 400, 500];
      pointValues.forEach((pts) => {
        const atThisLevel = allQuestions.filter((q: any) => q.points === pts);
        if (atThisLevel.length > 0) count++;
      });
    });
    return count;
  }, [categories]);

  // Transition to game-over when all questions are exhausted
  useEffect(() => {
    if (arenaState.phase === "PICKING" && totalRevealableQuestions > 0) {
      const revealed = arenaState.revealedQuestions || [];
      if (revealed.length >= totalRevealableQuestions) {
        setIsGameOver(true);
      }
    }
  }, [arenaState.phase, arenaState.revealedQuestions, totalRevealableQuestions]);

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
    pushDebug("question:open", `${categoryName} ${q.points}`);

    // Broadcast for instant (sub-50ms) transition on all clients
    const qId = q.id || `${categoryName}-${q.points}`;
    broadcast('question:open', {
      questionId: qId,
      category: categoryName,
      points: q.points,
    });

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
    if (myAnswer) return;

    // Optimistic update for snappy UX
    setMyAnswer(answer);
    setSubmitStatus("Submitting...");

    // Broadcast instantly so other clients see "X answered" (<50ms)
    broadcast('answer:submit', {
      playerId,
      questionId: activeQ.id,
    });

    const payload = {
      p_lobby_code: code,
      p_player_id: playerId,
      p_answer_text: answer || "",
    };

    console.log("Submitting Answer Payload:", payload);
    pushDebug("answer:submit", `text:${answer}`);

    const { data, error } = await supabase.rpc("submit_arena_answer", payload);

    if (error) {
      // Treat duplicate insert as already accepted
      if (
        error.code === "409" ||
        error.code === "23505" ||
        error.message?.includes("Conflict") ||
        error.message?.includes("duplicate")
      ) {
        console.warn("[Arena] Duplicate answer ignored (409/23505)");
        setSubmitStatus("Answer received");
        pushDebug("answer:duplicate", "server reported duplicate");
      } else {
        console.error("Answer submit failed:", error);
        setMyAnswer(null);
        setSubmitStatus("Network issue. Try again.");
        pushDebug(
          "answer:error",
          `${error.code || "unknown"} ${error.message || "rpc failed"}`,
        );
      }
      return;
    }

    if (data?.success === false) {
      console.warn("[Arena] Answer rejected by server:", data);
      setMyAnswer(null);
      setSubmitStatus(data?.error || "Answer rejected");
      pushDebug(
        "answer:rejected",
        `${data?.error_code || "-"} ${data?.error || "rejected"}`,
      );
      return;
    }

    setSubmitStatus("Answer received");
    pushDebug(
      "answer:accepted",
      `points:${data?.points ?? "-"} correct:${data?.correct ?? "-"}`,
    );

    // RPC may already have transitioned phase to RESULTS on server.
    // Now returned as all_answered: true so we can optimistically transition
    // on the client too — no waiting for postgres_changes round-trip.
    if (data?.all_answered) {
      console.log("[Arena] All players answered — transitioning locally");
      pushDebug("answer:all_answered", `answers:${data.answers_received} players:${data.total_players}`);
      // Optimistic local transition (server already transitioned)
      setArenaState((prev: any) => ({
        ...prev,
        phase: 'RESULTS',
      }));
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

    // Broadcast for instant transition on all clients
    broadcast('turn:next', { nextPickerId });
    broadcast('phase:change', { phase: 'PICKING', nextPickerId });

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

  // ── Game Over Screen ──────────────────────────────────────────────────
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
          // Return to lobby state for a new game
          if (isHost) {
            await supabase.rpc("reset_lobby_for_new_game", {
              p_lobby_code: code,
            });
          }
          navigate(`/play/${code}`);
        }}
        onLeave={async () => {
          const { error } = await supabase.rpc("leave_game", {
            p_lobby_code: code,
            p_player_id: playerId,
          });
          if (error) {
            await supabase
              .from("players")
              .delete()
              .eq("id", playerId)
              .eq("lobby_code", code);
          }
          store.clearArenaHostCode();
          navigate("/");
        }}
        onNewGame={isHost ? () => {
          store.clearArenaHostCode();
          navigate("/arena");
        } : undefined}
      />
    );
  }

  return (
    <div className="min-h-screen bg-deep-void flex flex-col p-4 relative">
      {/* Reconnection Banner */}
      {!isConnected && (
        <div className="fixed top-0 left-0 right-0 z-[110] bg-red-500/10 border-b border-red-500/30 px-4 py-3 flex items-center justify-center gap-3 animate-pulse backdrop-blur-sm">
          <WifiOff className="w-4 h-4 text-red-500" />
          <span className="text-red-400 text-xs font-bold uppercase tracking-widest">
            Connection lost — reconnecting...
          </span>
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}
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
          <span className="text-white/50 font-mono text-sm">{code}</span>
          {/* Connection indicator */}
          <GameConnectionBadge isConnected={isConnected} onlineCount={Object.keys(presences).length} />
          <GameHeaderButton
            variant="danger"
            icon={<LogOut className="w-3 h-3" />}
            onClick={async () => {
              if (confirm("Are you sure you want to leave the game?")) {
                broadcast("player:leave", { playerId });
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

                store.clearArenaHostCode();
                navigate("/");
              }
            }}
            className="ml-2"
          >
            Leave
          </GameHeaderButton>
          {isHost && (
            <GameHeaderButton
              variant={showDebug ? "primary" : "subtle"}
              icon={<Eye className="w-3 h-3" />}
              onClick={() => setShowDebug((v) => !v)}
              className="ml-1"
            >
              Debug
            </GameHeaderButton>
          )}
        </div>

        <div
          role="status" aria-live="polite"
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

      {isHost && showDebug && (
        <div className="mb-3 rounded-xl border border-neon-emerald/30 bg-black/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-neon-emerald text-[10px] font-black uppercase tracking-widest">
              Arena Debug Stream
            </div>
            <button
              onClick={() => setDebugEvents([])}
              className="text-xs text-white/60 hover:text-white underline"
            >
              Clear
            </button>
          </div>
          <div className="max-h-36 overflow-y-auto font-mono text-[10px] text-white/70 space-y-1">
            {debugEvents.length === 0 ? (
              <div className="text-white/60">No events yet...</div>
            ) : (
              debugEvents.map((evt, idx) => (
                <div key={`dbg-${idx}`} className="break-all">
                  {evt}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-hidden flex-col lg:flex-row">
        <div className="flex-1 flex flex-col relative min-h-0">
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
                    {(myAnswer || submitStatus) && (
                      <div className="mt-8 text-white/60 animate-pulse font-mono flex flex-col items-center justify-center gap-4">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {submitStatus || "Waiting for other players..."}
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
              className="h-full grid gap-1 md:gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(categories.length, typeof window !== 'undefined' && window.innerWidth >= 1024 ? 5 : 3)}, minmax(0, 1fr))`,
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
                      <span className="text-white font-black text-[10px] md:text-xs uppercase tracking-widest leading-relaxed line-clamp-3 relative z-10 drop-shadow-md">
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
                              role="button"
                              aria-label={`${q.points} points ${isRevealed ? 'revealed' : ''}${!isRevealed && isPicker && arenaState.phase === 'PICKING' ? ' click to open' : ''}`}
                              aria-disabled={isRevealed || !isPicker || arenaState.phase !== 'PICKING'}
                              tabIndex={isRevealed || !isPicker || arenaState.phase !== 'PICKING' ? -1 : 0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openQuestion(q, cat.name);
                                }
                              }}
                              className={`flex-1 rounded flex flex-col items-center justify-center transition-all group relative overflow-hidden border p-1 ${
                                isRevealed
                                  ? "bg-slate-600/80 border-slate-400/50 cursor-default"
                                  : !isPicker || arenaState.phase !== "PICKING"
                                    ? `${theme.border} border-opacity-30 opacity-50 cursor-not-allowed`
                                    : `hover:bg-white/10 ${theme.border} border-opacity-30 cursor-pointer hover:scale-105 focus-visible:ring-2 focus-visible:ring-neon-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-black`
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
        <div className="w-full lg:w-72 bg-black/40 border border-white/10 rounded-2xl p-3 md:p-4 flex flex-col gap-4 overflow-hidden max-h-48 lg:max-h-none shrink-0">
          {/* Top Half: Standings */}
          <div className="flex-1 min-h-0">
            <h3 className="text-white/80 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
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
            <h3 className="text-white/80 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4" /> This Round
            </h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {answerTimings.length > 0 || broadcastedAnswers.size > 0 ? (
                <>
                  {/* Broadcast answers (instant, before DB confirm) */}
                  {Array.from(broadcastedAnswers).map((pid) => {
                    // Skip if already in answerTimings (confirmed by DB)
                    if (answerTimings.find((a: any) => a.player_id === pid)) return null;
                    const p = players.find((pl: any) => pl.id === pid);
                    return (
                      <div
                        key={`bc-${pid}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-neon-emerald/5 border border-neon-emerald/20 animate-pulse"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">⏳</span>
                          <span className="text-neon-emerald text-xs truncate max-w-16">
                            {p?.name || pid.slice(0, 6)}
                          </span>
                        </div>
                        <span className="text-neon-emerald/50 font-mono text-[10px]">
                          answering...
                        </span>
                      </div>
                    );
                  })}
                  {/* DB-confirmed answers */}
                  {answerTimings.map((a: any) => (
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
                        <span className="text-white/70 font-mono text-xs">
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
                  ))}
                </>
              ) : (
                <div className="text-white/70 text-xs text-center py-4">
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
