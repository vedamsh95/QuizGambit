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

// ── Helpers ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// BUG FIX #15: Stable sort for answer timings — ties broken by rank then player_id
function stableAnswerSort(a: any, b: any): number {
  if (a.answer_time_ms !== b.answer_time_ms) return a.answer_time_ms - b.answer_time_ms;
  if (a.rank !== b.rank) return (a.rank ?? 999) - (b.rank ?? 999);
  return (a.player_id || "").localeCompare(b.player_id || "");
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SimultaneousBoard({
  code,
  playerId,
  playerName,
}: SimultaneousBoardProps) {
  // ── Stable identity: prefer prop if valid UUID, fallback to store ──
  // This is the PERMANENT fix — guarantees a valid UUID at all times even if
  // the prop becomes corrupted due to a yet-unidentified root cause.
  const [effectivePlayerId] = useState<string>(() => {
    if (playerId && UUID_RE.test(playerId)) {
      return playerId;
    }
    const fallback = store.ensurePlayerId();
    if (import.meta.env.DEV) {
      console.error("[Simul] 🔴 Invalid playerId prop at mount — using stored fallback.", {
        propValue: playerId,
        propType: typeof playerId,
        propLength: playerId?.length,
        fallback,
        localStorageRaw: localStorage.getItem("qb_pid"),
      });
    }
    return fallback;
  });

  // Sync localStorage with resolved identity (keeps initializer pure)
  useEffect(() => {
    if (store.getPlayerId() !== effectivePlayerId) {
      store.setPlayerId(effectivePlayerId);
    }
  }, [effectivePlayerId]);

  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Synced game state (from lobbies.arena_state)
  const [gameState, setGameState] = useState<any>({
    phase: "PICKING",
    pickerId: null,
    activeQuestion: null,
    // Round-aware: revealed_questions_by_round = { "1": [...] } matches GameBoardV2
    // Legacy fallback: old DB rows may have revealedQuestions (flat array)
    revealed_questions_by_round: {},
    timerEndTime: null,
  });

  // ── Derived: flat revealed array for current round ──
  // Simultaneous mode uses round "1" as the only round.
  // Backward compat: falls back to legacy revealedQuestions flat array from old DB rows.
  // Deduplicate: defenses against DB duplicate entries (see migration 20260604000002).
  const currentRoundRevealed: string[] = useMemo(() => {
    const raw: string[] = gameState.revealed_questions_by_round?.["1"] ||
      (Array.isArray(gameState.revealedQuestions) ? gameState.revealedQuestions : []);
    return [...new Set(raw)];
  }, [gameState.revealed_questions_by_round, gameState.revealedQuestions]);

  // Helper: immutably add a question ID to revealed_questions_by_round -> 1
  const appendRevealedRound1 = (prev: any, qId: string) => {
    const existing = prev.revealed_questions_by_round?.["1"] ||
      (Array.isArray(prev.revealedQuestions) ? prev.revealedQuestions : []);
    if (existing.includes(qId)) return prev;
    return {
      ...prev,
      revealed_questions_by_round: {
        ...(prev.revealed_questions_by_round || {}),
        "1": Array.from(new Set([...existing, qId])),
      },
    };
  };

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [answerTimings, setAnswerTimings] = useState<AnswerTiming[]>([]);
  const [isGameOver, setIsGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionError, setQuestionError] = useState("");

  // TODO: remove always-on diagnostics once root cause of invalid playerId is found
  // ── Diagnostic: trace playerId — CRITICAL, always on ──
  const playerIdRef = useRef(playerId);
  useEffect(() => {
    const prev = playerIdRef.current;
    const isValid = UUID_RE.test(playerId);
    
    // Always log if playerId changed or is invalid
    if (playerId !== prev || !isValid) {
      console.warn("[Simul] playerId changed or invalid:", {
        current: playerId,
        previous: prev,
        type: typeof playerId,
        length: playerId?.length,
        isEmpty: playerId === "",
        isUndefined: playerId === undefined,
        isNull: playerId === null,
        isValidUUID: isValid,
        storedValue: store.getPlayerId(),
        localStorageValue: localStorage.getItem("qb_pid"),
        changed: playerId !== prev,
      });
      playerIdRef.current = playerId;
    }
  });

  // ── Sync state ref for onLobbyChange callback ────────────────────────
  const syncStateRef = useRef({
    lastQuestionId: null as string | null,
    lastBroadcastTick: 0,
    submitGuard: false,
    closeCalledForQuestion: null as string | null,  // prevent duplicate force_close calls
    // Clock-skew fix: track when WE received the question (performance.now()), not the picker's clock
    questionReceivedAt: 0,
    // Debounce: prevent duplicate nextTurn from picker + winner clicking simultaneously
    nextTurnGuard: false,
  });

  // ── Ref for onLobbyChange phase guard (declared BEFORE useRealtimeChannel to avoid TDZ) ──
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; });

  // ── Realtime channel (single channel for presence + broadcast + postgres_changes) ──
  const { presences, isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: `simul:${code}`,
    enablePresence: true,
    presenceData: {
      playerId: effectivePlayerId,
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
        // SYNCHRONIZATION GUARD: Only apply DB state if the phase has advanced.
        // Prevents onLobbyChange from reverting optimistic broadcast state when
        // the broadcast reached the client before the DB change notification.
        const phaseOrder: Record<string, number> = { PICKING: 0, OPEN: 1, RESULTS: 2, GAME_OVER: 3 };
        const dbPhase = newData.arena_state.phase;
        const localPhase = gameStateRef.current.phase;
        if ((phaseOrder[dbPhase] ?? -1) > (phaseOrder[localPhase] ?? -1)) {
          setGameState(newData.arena_state);
          if (newData.arena_state.phase === "PICKING") {
            setSelectedAnswer(null);
            setTypedAnswer("");
            setSubmitStatus(null);
            setAnswerTimings([]);
            setBroadcastedAnswers(new Set());
            syncStateRef.current.submitGuard = false;
            syncStateRef.current.closeCalledForQuestion = null;
            syncStateRef.current.nextTurnGuard = false;
          }
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
        const existsIdx = prev.findIndex((a) => a.player_id === newAnswer.player_id);
        if (existsIdx >= 0) {
          // BUG FIX #12: Replace existing entry (handles timeout → real answer updates)
          const updated = [...prev];
          updated[existsIdx] = newAnswer;
          return updated.sort(stableAnswerSort);
        }
        return [...prev, newAnswer].sort(stableAnswerSort);
      });
      if (newAnswer.player_id === effectivePlayerId) {
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
      if (lobbyData?.arena_state) {
        setGameState(lobbyData.arena_state);
        // BUG FIX #7: Re-fetch answer timings if reconnecting during RESULTS
        const qId = lobbyData.arena_state.activeQuestion?.id;
        if (lobbyData.arena_state.phase === "RESULTS" && qId) {
          const { data: answers } = await supabase
            .from("simultaneous_answers")
            .select("*")
            .eq("lobby_code", code)
            .eq("question_id", qId)
            .order("rank", { ascending: true });
          if (answers) setAnswerTimings(answers);
        }
      }
    },
  });

  // ── Delayed connection-lost banner (smoother UX than instant flash) ──
  const [showDisconnected, setShowDisconnected] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasEverConnectedRef = useRef(false);

  useEffect(() => {
    if (isConnected) {
      wasEverConnectedRef.current = true;
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
      setShowDisconnected(false);
    } else if (wasEverConnectedRef.current) {
      // Only show banner after 8s of continuous disconnection, and only if we had connected once
      disconnectTimerRef.current = setTimeout(() => setShowDisconnected(true), 8000);
    }
    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    };
  }, [isConnected]);

  // Track broadcasted answers (optimistic, before DB confirmation)
  const [broadcastedAnswers, setBroadcastedAnswers] = useState<Set<string>>(new Set());

  const isHost = lobby?.host_id === effectivePlayerId;
  const cleanId = (id: any) => String(id || "").trim();
  // CRITICAL FIX: Don't fallback to players[0] — it's sorted by score and changes
  // whenever someone scores, shifting picker identity mid-game. If pickerId is null
  // (game not yet initialized), isPicker is false which is correct.
  const effectivePickerId = gameState.pickerId;
  const isPicker = cleanId(effectivePlayerId) === cleanId(effectivePickerId);
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
        // BUG FIX #10: Don't show ourselves as "answering..." in sidebar
        if (payload.playerId === effectivePlayerId) return;
        setBroadcastedAnswers((prev) => {
          const next = new Set(prev);
          next.add(payload.playerId);
          return next;
        });
      })
    );

    unsubs.push(
      onBroadcast("question:open", (payload: any) => {
        setSelectedAnswer(null);
        setTypedAnswer("");
        setSubmitStatus(null);
        setBroadcastedAnswers(new Set());
        syncStateRef.current.submitGuard = false;
        // Clock-skew fix: record when WE received the broadcast using our own monotonic clock
        syncStateRef.current.questionReceivedAt = performance.now();
        // Immediately show the question + mark tile revealed on ALL clients — broadcast-first, no DB wait
        if (payload.question) {
          // Each client derives timerEndTime from their OWN clock, eliminating cross-device clock skew
          const localTimerEnd = Math.floor(Date.now() / 1000) + (payload.timerSecs || 15);
          setGameState((prev: any) => appendRevealedRound1({
            ...prev,
            phase: "OPEN",
            activeQuestion: payload.question,
            timerEndTime: localTimerEnd,
          }, payload.questionId));
        }
      })
    );

    unsubs.push(
      onBroadcast("phase:change", (payload: any) => {
        if (payload.phase === "PICKING") {
          setSelectedAnswer(null);
          setTypedAnswer("");
          setSubmitStatus(null);
          setAnswerTimings([]);
          setBroadcastedAnswers(new Set());
          syncStateRef.current.submitGuard = false;
          syncStateRef.current.closeCalledForQuestion = null;
          syncStateRef.current.nextTurnGuard = false;
          // Immediately transition to PICKING phase + mark tile revealed on ALL clients
          setGameState((prev: any) => {
            const base = {
              ...prev,
              phase: "PICKING",
              activeQuestion: null,
              timerEndTime: null,
            };
            return payload.closedQuestionId
              ? appendRevealedRound1(base, payload.closedQuestionId)
              : base;
          });
        }
      })
    );

    unsubs.push(
      onBroadcast("player:leave", (payload: any) => {
        if (payload.playerId) {
          setPlayers((prev) => {
            const remaining = prev.filter((p) => p.id !== payload.playerId);
            // BUG FIX #8: If a player leaves during OPEN and all remaining
            // have answered, force-close so the game doesn't wait forever
            if (gameStateRef.current.phase === "OPEN" && remaining.length > 0) {
              // Deduplicate: count unique players who answered (DB-confirmed or broadcasted)
              const answeredPlayers = new Set([
                ...answerTimings.map(a => a.player_id),
                ...Array.from(broadcastedAnswers),
              ]);
              if (answeredPlayers.size >= remaining.length) {
                supabase.rpc("force_close_simultaneous_question", { p_lobby_code: code }).then(
                  () => {},
                  () => {}
                );
              }
            }
            return remaining;
          });
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
            // Query by lobby_code + category name (questions table uses text "category" column, not UUID)
            const catNames = Object.values(catMap).map((c: any) => c.name);
            if (catNames.length > 0) {
              const { data: questions } = await supabase
                .from("questions")
                .select("*")
                .eq("lobby_code", code)
                .in("category", catNames);
              if (questions) {
                questions.forEach((q: any) => {
                  const cat = Object.values(catMap).find((c: any) => c.name === q.category);
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

        const myRecord = playerData.find((p: any) => p.id === effectivePlayerId);
        if (!myRecord) {
          const existingByName = playerData.find(
            (p: any) => p.name.toLowerCase().trim() === (playerName || "").toLowerCase().trim()
          );
          if (existingByName) {
            store.setPlayerId(existingByName.id);
          } else {
            await supabase.from("players").upsert(
              { id: effectivePlayerId, lobby_code: code, name: playerName || "Player", score: 0, metadata: {} },
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
  // BUG FIX: Also set questionReceivedAt here — the lobby-change path (onLobbyChange)
  // doesn't go through the broadcast handler, so questionReceivedAt stayed at 0 for
  // non-host players, causing 0.0s answer times until they refreshed.
  useEffect(() => {
    const qId = activeQ?.id;
    if (!qId || syncStateRef.current.lastQuestionId === qId) return;
    syncStateRef.current.lastQuestionId = qId;
    syncStateRef.current.questionReceivedAt = performance.now();
    setSelectedAnswer(null);
    setTypedAnswer("");
    setSubmitStatus(null);
    setAnswerTimings([]);
    setBroadcastedAnswers(new Set());
    syncStateRef.current.submitGuard = false;
  }, [activeQ?.id]);

  // ── Polling fallback ────────────────────────────────────────────────
  // BUG FIX: Two-phase polling. Fast (3s) when disconnected, slow (10s) safety
  // poll when connected. The first postgres_changes event after channel subscription
  // can be silently dropped by Supabase Realtime, leaving players stuck on the grid.
  // The slow safety poll catches missed events without excessive DB load.

  const isConnectedRef = useRef(isConnected);
  useEffect(() => { isConnectedRef.current = isConnected; });

  // Track how long the channel has been connected — after 30s of stable connection,
  // disable safety polling entirely (realtime is reliable by then).
  const connectedSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (isConnected && connectedSinceRef.current === null) {
      connectedSinceRef.current = Date.now();
    } else if (!isConnected) {
      connectedSinceRef.current = null;
    }
  }, [isConnected]);

  // Track last broadcast time to skip polling immediately after a broadcast
  const lastBroadcastTimeRef = useRef<number>(0);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onBroadcast("phase:change", () => { lastBroadcastTimeRef.current = Date.now(); }));
    unsubs.push(onBroadcast("question:open", () => { lastBroadcastTimeRef.current = Date.now(); }));
    unsubs.push(onBroadcast("answer:submit", () => { lastBroadcastTimeRef.current = Date.now(); }));
    return () => unsubs.forEach(u => u());
  }, [onBroadcast]);

  useEffect(() => {
    const intervalMs = isConnected ? 10000 : 3000; // 10s when connected, 3s when disconnected
    const maxSafetyPollDuration = 30000; // Stop safety polling after 30s of stable connection

    const poll = setInterval(async () => {
      // Prioritize broadcasts: skip poll if we received a broadcast in the last 2 seconds
      if (Date.now() - lastBroadcastTimeRef.current < 2000) return;

      // During connection: skip safety poll if channel has been stable for >30s
      if (isConnected && connectedSinceRef.current) {
        const stableDuration = Date.now() - connectedSinceRef.current;
        if (stableDuration > maxSafetyPollDuration) return;
      }

      try {
        // Fetch lobby state
        const { data: lobbyData } = await supabase
          .from("lobbies")
          .select("*")
          .eq("code", code)
          .maybeSingle();

        if (!lobbyData) return;

        setLobby(lobbyData);
        // BUG FIX #9: Only apply polling state if DB phase advanced (don't revert optimistic state)
        if (lobbyData.arena_state) {
          const phaseOrder: Record<string, number> = { PICKING: 0, OPEN: 1, RESULTS: 2, GAME_OVER: 3 };
          const dbPhase = lobbyData.arena_state.phase;
          const localPhase = gameStateRef.current.phase;
          
          // Merge revealed questions instead of replacing, so polls don't un-reveal tiles
          if (lobbyData.arena_state.revealed_questions_by_round?.["1"]) {
             const serverRevealed = lobbyData.arena_state.revealed_questions_by_round["1"];
             const localRevealed = gameStateRef.current.revealed_questions_by_round?.["1"] || [];
             lobbyData.arena_state.revealed_questions_by_round["1"] = Array.from(new Set([...serverRevealed, ...localRevealed]));
          }

          if ((phaseOrder[dbPhase] ?? -1) > (phaseOrder[localPhase] ?? -1)) {
            setGameState(lobbyData.arena_state);
          }
        }

        // Fetch players
        const { data: playerData } = await supabase
          .from("players")
          .select("*")
          .eq("lobby_code", code)
          .order("score", { ascending: false });

        if (playerData) setPlayers(playerData);

        // Fetch answer timings only if in RESULTS phase
        const qId = lobbyData?.arena_state?.activeQuestion?.id;
        if (lobbyData?.arena_state?.phase === "RESULTS" && qId) {
          const { data: answers } = await supabase
            .from("simultaneous_answers")
            .select("*")
            .eq("lobby_code", code)
            .eq("question_id", qId)
            .order("rank", { ascending: true });
          if (answers) setAnswerTimings(answers);
        }
      } catch {
        // Silently ignore polling errors
      }
    }, intervalMs);

    return () => clearInterval(poll);
  }, [code, isConnected]);

  // Hydrate answer timings on RESULTS (realtime-driven, fast path)
  useEffect(() => {
    if (gameState.phase !== "RESULTS" || !activeQ?.id) return;

    supabase
      .from("simultaneous_answers")
    const fetchTimings = async () => {
      if (gameState.phase !== "RESULTS" || !activeQ?.id) return;

      const { data: answers } = await supabase
        .from("simultaneous_answers")
        .select("*")
        .eq("lobby_code", code)
        .eq("question_id", activeQ.id)
        .order("rank", { ascending: true });
        
      if (answers) setAnswerTimings(answers);
    };
    fetchTimings();
  }, [gameState.phase, activeQ?.id, code]);

  // Force-reveal active question when transitioning to RESULTS (catches force-close path)
  useEffect(() => {
    if (gameState.phase === "RESULTS" && activeQ?.id) {
      setGameState((prev: any) => appendRevealedRound1(prev, activeQ.id));
    }
  }, [gameState.phase, activeQ?.id]);

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

  // BUG FIX #11: Game-over detection in any phase when no question is active.
  // Previously only checked in PICKING, requiring an extra "Next Round" click after
  // the last question's RESULTS. Now also triggers from RESULTS without that click,
  // but NOT during OPEN (would block players from seeing/answering the last question).
  useEffect(() => {
    if (!activeQ && totalRevealableQuestions > 0 && currentRoundRevealed.length >= totalRevealableQuestions) {
      setIsGameOver(true);
    }
  }, [activeQ, currentRoundRevealed, totalRevealableQuestions]);

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

      // BUG FIX #4: Only the HOST auto-closes — prevents 4× RPC spam
      if (isHost && rawRemaining <= -2 && gameState.phase === "OPEN") {
        const qId = gameState.activeQuestion?.id;
        if (qId && syncStateRef.current.closeCalledForQuestion !== qId) {
          syncStateRef.current.closeCalledForQuestion = qId;
          try {
            await supabase.rpc("force_close_simultaneous_question", { p_lobby_code: code });
          } catch {
            // RPC may not exist (migration not run) — don't retry
          }
        }
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
        playerId: effectivePlayerId,
      });
      return;
    }

    const qId = q.id || `${categoryName}-${q.points}`;
    if (currentRoundRevealed.includes(qId)) return;

    setQuestionError("");

    const timerSecs = lobby?.settings?.timer || 15;
    // Clock-skew fix: send relative timerSecs instead of absolute timerEndTime.
    // Each client computes timerEndTime from their OWN Date.now(), eliminating
    // cross-device clock skew. The RPC still uses server time for persistence.
    const questionData = { ...q, id: qId, category: categoryName };

    // Broadcast FULL payload instantly — reaches all clients in <50ms via WebSocket
    broadcast("question:open", {
      questionId: qId,
      category: categoryName,
      points: q.points,
      question: questionData,
      timerSecs,
    });

    // Optimistic local state update — picker computes timerEndTime from THEIR own clock
    const localTimerEnd = Math.floor(Date.now() / 1000) + timerSecs;
    syncStateRef.current.questionReceivedAt = performance.now();
    setGameState((prev: any) => appendRevealedRound1({
      ...prev,
      phase: "OPEN",
      activeQuestion: questionData,
      timerEndTime: localTimerEnd,
    }, qId));

    // Fire-and-forget RPC for persistence — DB is NOT in the critical path
    supabase.rpc("open_simultaneous_question", {
      p_lobby_code: code,
      p_question_data: { ...questionData, questionStartTime: Date.now() },
      p_timer_seconds: timerSecs,
    }).then(
      ({ data: qResult, error: qErr }: any) => {
        if (qErr) {
          console.error("[Simul] RPC open_simultaneous_question error:", qErr);
          setQuestionError(qErr.message || "Failed to open question");
          // CRITICAL FIX: Roll back optimistic state — player is stuck on phantom overlay otherwise
          setGameState((prev: any) => ({ ...prev, phase: "PICKING", activeQuestion: null, timerEndTime: null }));
          return;
        }
        if (qResult?.success === false) {
          console.error("[Simul] RPC returned failure:", qResult.error);
          setQuestionError(qResult.error || "Cannot open question now");
          // CRITICAL FIX: Roll back optimistic state
          setGameState((prev: any) => ({ ...prev, phase: "PICKING", activeQuestion: null, timerEndTime: null }));
        }
      },
      (err: any) => {
        console.error("[Simul] openQuestion RPC exception:", err);
        setQuestionError(err?.message || "Network error opening question");
        // CRITICAL FIX: Roll back optimistic state
        setGameState((prev: any) => ({ ...prev, phase: "PICKING", activeQuestion: null, timerEndTime: null }));
      }
    );
  };

  const handleAnswer = async (answer: string) => {
    if (!activeQ || selectedAnswer || syncStateRef.current.submitGuard) return;

    syncStateRef.current.submitGuard = true;
    setSelectedAnswer(answer);
    setSubmitStatus("Submitting...");

    // Clock-skew fix: use performance.now() delta since WE received the question,
    // not the picker's absolute clock. This is accurate regardless of device clock drift.
    const elapsed = syncStateRef.current.questionReceivedAt > 0
      ? performance.now() - syncStateRef.current.questionReceivedAt
      : 0;
    let clientTimeMs = Math.max(0, Math.round(elapsed));
    // Safety: ensure clientTimeMs is a valid integer (NaN/Infinity → 0)
    if (!Number.isFinite(clientTimeMs)) clientTimeMs = 0;

    // ── effectivePlayerId is guaranteed valid (see mount-time initialization) ──
    // No need for safePlayerId check — use directly.

    broadcast("answer:submit", {
      playerId: effectivePlayerId,
      questionId: activeQ.id,
    });

    // ── Log exact RPC parameters — always on for debugging ─────
    if (import.meta.env.DEV) {
      console.log("[Simul] 📤 RPC submit_simultaneous_answer params:", {
        p_lobby_code: code,
        p_player_id: effectivePlayerId,
        p_answer_text: answer,
        p_client_time_ms: clientTimeMs,
      });
    }

    const callRpc = async (attempt: number): Promise<{ data: any; error: any }> => {
      // Don't retry if component has reset (guard was cleared externally)
      if (!syncStateRef.current.submitGuard) {
        if (import.meta.env.DEV) console.warn("[Simul] RPC aborted — guard cleared");
        return { data: null, error: { message: "Request cancelled", code: "CANCELLED" } };
      }

      const result = await supabase.rpc("submit_simultaneous_answer", {
        p_lobby_code: code,
        p_player_id: effectivePlayerId,
        p_answer_text: answer,
        p_client_time_ms: clientTimeMs,
      });

      // Log FULL error details — always on (critical for debugging)
      if (result.error) {
        console.error("[Simul] ❌ RPC error (attempt " + attempt + "):", {
          code: result.error.code,
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
          status: (result as any).status,
          statusText: (result as any).statusText,
        });
      }

      // Retry once on transient errors (network loss, function not found)
      if (result.error && attempt === 1 && (
        result.error.code === "PGRST202" ||
        result.error.message?.includes("fetch failed") ||
        result.error.message?.includes("Failed to fetch") ||
        result.error.message?.includes("NetworkError")
      )) {
        if (import.meta.env.DEV) console.warn("[Simul] RPC attempt 1 failed, retrying in 500ms...");
        await new Promise(r => setTimeout(r, 500));
        return callRpc(2);
      }
      return result;
    };

    const { data, error } = await callRpc(1);

    if (error) {
      syncStateRef.current.submitGuard = false;
      setSelectedAnswer(null);

      if (error.message?.includes("duplicate") || error.code === "23505") {
        setSubmitStatus("Answer received");
        return;
      }

      // 22P02 = invalid input syntax (bad UUID, etc)
      // CANCELLED = request aborted (component reset during retry)
      if (error.code === "22P02" || error.code === "PGRST202" || error.message?.includes("Not Found") || error.message?.includes("invalid input")) {
        setSubmitStatus("Answer failed — please refresh and try again");
        return;
      }
      if (error.code === "CANCELLED") {
        // Request aborted during retry — silently reset, no error message
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
    // BUG FIX #14: Also allow anyone who has submitted an answer (optimistic) to click.
    // If answerTimings hasn't synced yet, the rank-1 winner would otherwise be locked out.
    const hasAnswered = selectedAnswer !== null || broadcastedAnswers.has(effectivePlayerId);
    if (!isPicker && !hasAnswered && effectivePlayerId !== answerTimings.find((a) => a.rank === 1)?.player_id) return;
    // BUG FIX #6: Debounce duplicate nextTurn from picker + winner clicking simultaneously
    if (syncStateRef.current.nextTurnGuard) return;
    syncStateRef.current.nextTurnGuard = true;

    // Optimistic local state update — instant phase change on picker's screen.
    // Append the closed question to the revealed list for immediate tile graying.
    const closedId = activeQ?.id;
    setGameState((prev: any) => {
      const base = {
        ...prev,
        phase: "PICKING",
        activeQuestion: null,
        timerEndTime: null,
      };
      return closedId ? appendRevealedRound1(base, closedId) : base;
    });
    setSelectedAnswer(null);
    setTypedAnswer("");
    setSubmitStatus(null);
    setAnswerTimings([]);
    setBroadcastedAnswers(new Set());
    syncStateRef.current.submitGuard = false;
    syncStateRef.current.closeCalledForQuestion = null;
    syncStateRef.current.questionReceivedAt = 0;

    broadcast("phase:change", { phase: "PICKING", closedQuestionId: activeQ?.id });

    // Fire-and-forget RPC — DB is NOT in the critical path
    supabase.rpc("next_simultaneous_turn", {
      p_lobby_code: code,
    }).then(
      () => {},
      (error) => console.error("next_simultaneous_turn error:", error)
    );
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
        playerId={effectivePlayerId}
        onPlayAgain={async () => {
          if (isHost) {
            try {
              await supabase.rpc("reset_lobby_for_new_game", { p_lobby_code: code });
            } catch (err) {}
          }
          
          // Reset client state so old data doesn't flash if SPA navigation is used
          setGameState({
            phase: "PICKING",
            pickerId: null,
            activeQuestion: null,
            revealed_questions_by_round: {},
            timerEndTime: null,
          });

          store.clearArenaHostCode();
          window.location.href = `/lobby/${code}?from=game`;
        }}
        onLeave={async () => {
          await supabase.from("players").delete().eq("id", effectivePlayerId).eq("lobby_code", code);
          store.clearArenaHostCode();
          window.location.href = `/lobby/${code}?from=game`;
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* Reconnection Banner — only shown after 3s of disconnection (no flash on brief WebSocket reconnects) */}
      {showDisconnected && (
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
                broadcast("player:leave", { playerId: effectivePlayerId });
                await supabase.from("players").delete().eq("id", effectivePlayerId).eq("lobby_code", code);
                store.clearArenaHostCode();
                window.location.href = `/lobby/${code}?from=game`;
              }
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors"
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
          {/* Connection status — uses delayed showDisconnected to avoid flashing on brief WebSocket reconnects */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            {showDisconnected ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-peach animate-pulse" />
                <span className="text-peach">Reconnecting</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-mint" />
                <span className="text-mint">{onlineCount} online</span>
              </>
            )}
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
                </h2>                        {/* MCQ Options (OPEN phase) */}
                        {gameState.phase === "OPEN" && activeQ.options && Array.isArray(activeQ.options) && activeQ.options.length > 0 ? (
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
                        ) : gameState.phase === "OPEN" && !selectedAnswer ? (
                          /* No MCQ options — show text input + Skip button */
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={typedAnswer}
                                onChange={(e) => setTypedAnswer(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && typedAnswer.trim()) handleAnswer(typedAnswer.trim()); }}
                                placeholder="Type your answer..."
                                className="flex-1 px-4 py-3 rounded-2xl border-2 border-warm-gray/20 bg-warm-white font-outfit font-bold text-plum placeholder:text-warm-gray/40 focus:outline-none focus:border-soft-purple/40 transition-colors"
                                autoFocus
                              />
                              <ClayButton
                                variant="primary"
                                onClick={() => typedAnswer.trim() && handleAnswer(typedAnswer.trim())}
                                disabled={!typedAnswer.trim()}
                              >
                                Submit
                              </ClayButton>
                            </div>
                            <button
                              onClick={() => handleAnswer("[SKIP]")}
                              className="w-full text-center text-warm-gray/50 hover:text-peach text-xs font-bold uppercase tracking-widest py-1 transition-colors"
                            >
                              Skip (Don't Know)
                            </button>
                          </div>
                        ) : null}                        {/* Waiting message */}
                        {selectedAnswer && gameState.phase === "OPEN" && (
                          <div className="text-center space-y-3">
                            <div className="flex items-center justify-center gap-2 text-warm-gray/60 font-medium text-sm">
                              <Clock className="w-4 h-4" />
                              {submitStatus || "Waiting for other players..."}
                            </div>
                          </div>
                        )}

                        {/* Timer expired — Close button for ALL players */}
                        {gameState.phase === "OPEN" && timeLeft <= 0 && (
                          <div className="text-center space-y-2">
                            <p className="text-peach text-xs font-bold uppercase tracking-widest">
                              Time's up!
                            </p>
                            <ClayButton
                              variant="secondary"
                              className="!text-peach !border-peach/30"
                              onClick={async () => {
                                try {
                                  await supabase.rpc("force_close_simultaneous_question", { p_lobby_code: code });
                                } catch (err: any) {
                                  console.error("[Simul] force_close error:", err);
                                  setQuestionError(err?.message || "Failed to close question");
                                }
                              }}
                            >
                              Close Question
                            </ClayButton>
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
                          elevation={t.player_id === effectivePlayerId ? "elevated" : "flat"}
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

                    {(isPicker || effectivePlayerId === answerTimings.find((a) => a.rank === 1)?.player_id) && (
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
            categories.length === 0 ? (
              /* BUG FIX #13: Empty grid fallback — show error instead of blank screen */
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <p className="text-warm-gray/50 font-medium text-sm">No categories loaded</p>
                  <p className="text-warm-gray/40 text-xs">Please refresh the page or ask the host to restart the game.</p>
                </div>
              </div>
            ) : (
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
                          const isRevealed = currentRoundRevealed.includes(qId);
                          const canClick = isPicker && gameState.phase === "PICKING" && !isRevealed;

                          return (
                            <ClayTile
                              key={qId}
                              state={isRevealed ? "revealed" : "unrevealed"}
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
            )
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
