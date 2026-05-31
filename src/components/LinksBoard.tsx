import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import {
  Trophy, Wifi, WifiOff, ArrowLeft, Heart, Skull,
  Shuffle, ChevronUp, ChevronDown, Shield, Clock,
} from "lucide-react";
import { ClayCard, ClayBadge, ClayButton, ClayAvatar } from "./ui";
import LinksStickyScoreboard from "./LinksStickyScoreboard";

// ── Types ───────────────────────────────────────────────────────────────────

interface LinksBoardProps {
  code: string;
  playerId: string;
  playerName: string;
}

interface ClaimedWord {
  id: string;
  player_id: string;
  player_name: string;
  word: string;
  word_length: number;
  points: number;
  is_poisoned: boolean;
  poison_letter: string | null;
  hearts_remaining: number;
  created_at: string;
}

// ── Player color palette (matches clay/candy tokens) ─────────────────────────

const PLAYER_COLORS = [
  { name: "purple", bg: "bg-soft-purple", bgLight: "bg-soft-purple-light", text: "text-soft-purple", border: "border-soft-purple", ring: "ring-soft-purple/30", glow: "shadow-soft-purple/20", gradient: "from-soft-purple to-purple-400", label: "Purple" },
  { name: "peach", bg: "bg-peach", bgLight: "bg-peach-light", text: "text-peach", border: "border-peach", ring: "ring-peach/30", glow: "shadow-peach/20", gradient: "from-peach to-orange-400", label: "Peach" },
  { name: "sky", bg: "bg-sky", bgLight: "bg-sky-light", text: "text-sky", border: "border-sky", ring: "ring-sky/30", glow: "shadow-sky/20", gradient: "from-sky to-blue-400", label: "Sky" },
  { name: "mint", bg: "bg-mint", bgLight: "bg-mint-light", text: "text-mint", border: "border-mint", ring: "ring-mint/30", glow: "shadow-mint/20", gradient: "from-mint to-emerald-400", label: "Mint" },
];

function getPlayerColor(index: number) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function getPlayerColorByName(playerId: string, players: any[]): typeof PLAYER_COLORS[0] {
  const idx = players.findIndex((p) => p.id === playerId);
  return getPlayerColor(idx >= 0 ? idx : 0);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function calculatePoints(wordLength: number): number {
  if (wordLength <= 4) return 10 * wordLength;
  if (wordLength <= 6) return 15 * wordLength;
  if (wordLength <= 8) return 20 * wordLength;
  return 30 * wordLength;
}

/**
 * Defensively parse arena_state — Supabase may return JSONB as a raw JSON
 * string from realtime payloads or certain PostgREST responses.  If gameState
 * becomes a string, all phase checks fail and the board renders blank.
 */
function parseArenaState(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "string") {
    if (import.meta.env.DEV) console.warn("[LINKS] arena_state is a raw string — parsing", raw.slice(0, 100));
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

// ── Constants ────────────────────────────────────────────────────────────────

const LETTER_SELECT_TIMEOUT = 30; // seconds — host-configurable in future
const SVG_CIRCUMFERENCE = 2 * Math.PI * 34; // r=34 stroke circle circumference

// ── Component ───────────────────────────────────────────────────────────────

export default function LinksBoard({ code, playerId, playerName }: LinksBoardProps) {
  const { t } = useTranslation();
  // ── Stable identity ──────────────────────────────────────────────────
  const [effectivePlayerId] = useState<string>(() => {
    if (playerId && UUID_RE.test(playerId)) return playerId;
    return store.ensurePlayerId();
  });

  useEffect(() => {
    if (store.getPlayerId() !== effectivePlayerId) {
      store.setPlayerId(effectivePlayerId);
    }
  }, [effectivePlayerId]);

  // ── Core state ───────────────────────────────────────────────────────
  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [gameState, setGameState] = useState<any>({
    phase: "LETTER_SELECT",
    letters: [],
    playerLetters: {},
    poisonLetters: {},
    playerHearts: {},
    usedWords: [],
    scores: {},
    timerEndTime: null,
    poisonEnabled: true,
    roundDuration: 60,
    gameStartTime: null,
  });

  // ── UI state ─────────────────────────────────────────────────────────
  const [typedWord, setTypedWord] = useState("");
  const [wordFeedback, setWordFeedback] = useState<{
    type: "valid" | "missing" | "used" | "invalid" | "typing";
    message?: string;
  }>({ type: "typing" });
  // ── Letter selection countdown ────────────────────────────────────
  const [letterSelectTimeLeft, setLetterSelectTimeLeft] = useState(LETTER_SELECT_TIMEOUT);
  const letterSelectStartRef = useRef<number | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [poisonAssignments, setPoisonAssignments] = useState<Record<string, string>>({});
  const [claimedWords, setClaimedWords] = useState<ClaimedWord[]>([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [layoutFlipped, setLayoutFlipped] = useState(false);
  const [opponentView, setOpponentView] = useState<"full" | "recent">("full");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [letterSelectError, setLetterSelectError] = useState("");
  const [poisonError, setPoisonError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poisonReveal, setPoisonReveal] = useState<{
    letter: string;
    source: string;
    show: boolean;
  } | null>(null);

  // ── Shake animation key (bumps on Enter for "used" words) ────────────
  const [shakeKey, setShakeKey] = useState(0);

  // ── Connection state ─────────────────────────────────────────────────
  const [showDisconnected, setShowDisconnected] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────
  const typedWordRef = useRef(typedWord);
  useEffect(() => { typedWordRef.current = typedWord; });

  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; });

  const submitGuardRef = useRef(false);

  // ── Derived state ────────────────────────────────────────────────────
  const phase = gameState.phase;
  const letters: string[] = gameState.letters || [];

  // ── Diagnostic: log if gameState looks broken (remove after debug) ─────
  useEffect(() => {
    if (import.meta.env.DEV && typeof gameState.phase !== "string") {
      console.warn("[LINKS] gameState.phase is not a string — arena_state may be unparsed:", {
        typeof: typeof gameState,
        phase: gameState.phase,
        keys: typeof gameState === "object" && gameState ? Object.keys(gameState).slice(0, 10) : "N/A",
        sample: typeof gameState === "string" ? gameState.slice(0, 200) : "N/A",
      });
    }
  }, [gameState]);
  const playerLetters: Record<string, string> = gameState.playerLetters || {};
  const poisonLetters: Record<string, Record<string, string>> = gameState.poisonLetters || {};
  const playerHearts: Record<string, number> = gameState.playerHearts || {};
  const usedWords: string[] = gameState.usedWords || [];
  const poisonEnabled = gameState.poisonEnabled !== false;
  const roundDuration = gameState.roundDuration || 60;

  const myLetter = playerLetters[effectivePlayerId] || "";
  const myHearts = playerHearts[effectivePlayerId] ?? 3;
  const myColor = getPlayerColorByName(effectivePlayerId, players);
  const isHost = lobby?.host_id === effectivePlayerId;
  const otherPlayers = players.filter((p) => p.id !== effectivePlayerId);
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [players]);

  // ── My claimed words + opponent words ────────────────────────────────
  const myWords = useMemo(
    () => claimedWords.filter((w) => w.player_id === effectivePlayerId),
    [claimedWords, effectivePlayerId]
  );
  const opponentWords = useMemo(
    () => claimedWords.filter((w) => w.player_id !== effectivePlayerId),
    [claimedWords, effectivePlayerId]
  );

  // ── Realtime channel ─────────────────────────────────────────────────
  const { presences, isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: `links:${code}`,
    enablePresence: true,
    presenceData: {
      playerId: effectivePlayerId,
      name: playerName || "Player",
      status: "connected" as const,
    },
    subscribeLobby: code,
    subscribePlayers: code,
    subscribeArenaAnswers: code,
    answersTableName: "links_words",
    onLobbyChange: (payload: any) => {
      if (payload.eventType === "DELETE" || !payload.new) {
        window.location.href = "/";
        return;
      }
      const newData = payload.new as any;
      const parsed = parseArenaState(newData.arena_state);
      if (parsed) {
        setGameState(parsed);
        if (parsed.phase === "PLAYING") {
          setTypedWord("");
          setWordFeedback({ type: "typing" });
          setSubmitStatus(null);
          submitGuardRef.current = false;
        }
        if (parsed.phase === "RESULTS") {
          setIsGameOver(true);
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
      const newWord = payload.new as ClaimedWord;
      if (!newWord) return;
      setClaimedWords((prev) => {
        const exists = prev.find((w) => w.id === newWord.id);
        if (exists) return prev;
        return [...prev, newWord];
      });
      // Show poison reveal animation
      if (newWord.is_poisoned && newWord.player_id === effectivePlayerId) {
        setPoisonReveal({
          letter: newWord.poison_letter || "",
          source: newWord.player_name || "",
          show: true,
        });
        setTimeout(() => setPoisonReveal((p) => p && p.show ? { ...p, show: false } : null), 3000);
      }
    },
    onReconnect: async () => {
      const { data: lobbyData } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      const parsed = parseArenaState(lobbyData?.arena_state);
      if (parsed) setGameState(parsed);
    },
  });

  // ── Online count ────────────────────────────────────────────────────
  const onlineCount = Object.keys(presences || {}).length;

  // ── Connection banner (5s delay, same pattern as SimultaneousBoard) ──

  useEffect(() => {
    if (!isConnected) {
      disconnectTimerRef.current = setTimeout(() => setShowDisconnected(true), 5000);
    } else {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
      setShowDisconnected(false);
    }
    return () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    };
  }, [isConnected]);

  // ── Broadcast listeners ──────────────────────────────────────────────

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onBroadcast("letter:select", (payload: any) => {
        setGameState((prev: any) => ({
          ...prev,
          playerLetters: { ...prev.playerLetters, [payload.playerId]: payload.letter },
          letters: payload.letters || prev.letters,
          phase: payload.phase || prev.phase,
        }));
      })
    );

    unsubs.push(
      onBroadcast("poison:assign", () => {
        // Re-fetch lobby state for updated poison data
        supabase
          .from("lobbies")
          .select("arena_state")
          .eq("code", code)
          .single()
          .then(({ data }) => {
            const parsed = parseArenaState(data?.arena_state);
            if (parsed) setGameState(parsed);
          });
      })
    );

    unsubs.push(
      onBroadcast("word:claim", (payload: any) => {
        setClaimedWords((prev) => {
          if (prev.find((w) => w.id === payload.id)) return prev;
          return [...prev, payload];
        });
      })
    );

    unsubs.push(
      onBroadcast("timer:tick", (payload: any) => {
        setTimeLeft((prev) => {
          if (Math.abs(prev - payload.remainingSec) > 2) return payload.remainingSec;
          return prev;
        });
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
  }, [onBroadcast, code]);

  // ── Initial fetch ────────────────────────────────────────────────────

  const recoveryAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data: lobbyData } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (cancelled) return;
      if (lobbyData) {
        setLobby(lobbyData);
        const parsed = parseArenaState(lobbyData.arena_state);
        if (parsed) {
          // Auto-recovery: if phase is from another game mode (e.g. Simultaneous
          // 'PICKING'), force a fresh LINKS start instead of showing "Unknown phase"
          const validPhases = ["LETTER_SELECT", "POISON_SETUP", "PLAYING", "RESULTS", "GAME_OVER"];
          if (parsed.phase && !validPhases.includes(parsed.phase) && !recoveryAttemptedRef.current) {
            recoveryAttemptedRef.current = true;
            if (import.meta.env.DEV) {
              console.warn("[LINKS] Stale phase detected:", parsed.phase, "— auto-recovering via start_links_game");
            }
            // Nuke stale arena_state so even the old-RPC blacklist won't "resume" it
            const { error: nullErr } = await supabase.from("lobbies").update({ arena_state: null }).eq("code", code);
            if (nullErr && import.meta.env.DEV) {
              console.warn("[LINKS] Failed to null stale arena_state:", nullErr.message);
            }
            const { data: recovered } = await supabase.rpc("start_links_game", {
              p_lobby_code: code,
              p_settings: {
                poisonEnabled: parsed.poisonEnabled !== false,
                roundDuration: parsed.roundDuration || 60,
              },
            });
            if (recovered?.success && recovered?.phase) {
              // Re-fetch to get the full state (skip intermediate setState to avoid flicker)
              const { data: freshLobby } = await supabase
                .from("lobbies")
                .select("*")
                .eq("code", code)
                .maybeSingle();
              if (freshLobby && !cancelled) {
                const freshParsed = parseArenaState(freshLobby.arena_state);
                if (freshParsed) {
                  setGameState(freshParsed);
                  setLobby(freshLobby);
                }
              }
              return;
            }
            // RPC failed — fall through to show stale phase with Force Restart button
          }
          setGameState(parsed);
        }
      }

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

      // Fetch existing claimed words
      const { data: wordsData } = await supabase
        .from("links_words")
        .select("*")
        .eq("lobby_code", code)
        .order("created_at", { ascending: true });

      if (!cancelled && wordsData) {
        setClaimedWords(wordsData);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [code]);

  // ── Letter selection timer (LETTER_SELECT phase) ────────────────────

  useEffect(() => {
    if (phase !== "LETTER_SELECT") {
      letterSelectStartRef.current = null;
      setLetterSelectTimeLeft(LETTER_SELECT_TIMEOUT);
      return;
    }

    if (!letterSelectStartRef.current) {
      letterSelectStartRef.current = Date.now();
    }

    const interval = setInterval(() => {
      const elapsed = (Date.now() - (letterSelectStartRef.current || Date.now())) / 1000;
      const remaining = Math.max(0, LETTER_SELECT_TIMEOUT - Math.floor(elapsed));
      setLetterSelectTimeLeft(remaining);
    }, 200);

    return () => clearInterval(interval);
  }, [phase, LETTER_SELECT_TIMEOUT]);

  // ── Timer logic (PLAYING phase) ──────────────────────────────────────

  const lastBroadcastTick = useRef(0);

  useEffect(() => {
    if (phase !== "PLAYING" || !gameState.timerEndTime) {
      setTimeLeft(roundDuration);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now() / 1000;
      const remaining = Math.max(0, Math.ceil(gameState.timerEndTime - now));
      setTimeLeft(remaining);

      // Broadcast timer ticks as host
      if (isHost && remaining > 0 && Math.abs(remaining - lastBroadcastTick.current) >= 1) {
        lastBroadcastTick.current = remaining;
        broadcast("timer:tick", { remainingSec: remaining });
      }

      // Auto-end when timer expires
      if (remaining <= 0 && isHost && gameStateRef.current.phase === "PLAYING") {
        supabase.rpc("end_links_round", { p_lobby_code: code }).then(() => {}, () => {});
      }
    }, 250);

    return () => clearInterval(interval);
  }, [phase, gameState.timerEndTime, isHost, code, broadcast, roundDuration]);

  // ── Polling fallback ─────────────────────────────────────────────────

  const isConnectedRef = useRef(isConnected);
  useEffect(() => { isConnectedRef.current = isConnected; });

  useEffect(() => {
    const poll = setInterval(async () => {
      if (isConnectedRef.current) return;

      try {
        const { data: lobbyData } = await supabase
          .from("lobbies")
          .select("*")
          .eq("code", code)
          .maybeSingle();
        if (lobbyData) {
          setLobby(lobbyData);
          const parsed = parseArenaState(lobbyData.arena_state);
          if (parsed) setGameState(parsed);
        }

        const { data: playerData } = await supabase
          .from("players")
          .select("*")
          .eq("lobby_code", code)
          .order("score", { ascending: false });
        if (playerData) setPlayers(playerData);

        const { data: wordsData } = await supabase
          .from("links_words")
          .select("*")
          .eq("lobby_code", code)
          .order("created_at", { ascending: true });
        if (wordsData) setClaimedWords(wordsData);
      } catch {
        // silently ignore polling errors
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [code]);

  // ── Word validation (client-side, instant) ───────────────────────────

  const validateWord = useCallback(
    (word: string) => {
      if (!word || word.length < 3) return { type: "typing" as const };

      const lower = word.toLowerCase().trim();
      if (!/^[a-z]{3,15}$/.test(lower)) {
        return { type: "invalid" as const, message: t('links.lettersOnly') };
      }

      // Check required letters
      for (const letter of letters) {
        if (!lower.includes(letter.toLowerCase())) {
          return { type: "missing" as const, message: t('links.missingLetter', { letter }) };
        }
      }

      // Check if already used
      if (usedWords.includes(lower) || claimedWords.some((w) => w.word === lower)) {
        const claimer = claimedWords.find((w) => w.word === lower);
        return {
          type: "used" as const,
          message: claimer ? t('links.alreadyClaimedBy', { name: claimer.player_name }) : t('links.alreadyUsed'),
        };
      }

      return { type: "valid" as const };
    },
    [letters, usedWords, claimedWords, t]
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

  // ── Actions ──────────────────────────────────────────────────────────

  const handleSelectLetter = async (letter: string) => {
    if (phase !== "LETTER_SELECT" || selectedLetter) return;
    setSelectedLetter(letter);
    setLetterSelectError("");

    const { data, error } = await supabase.rpc("select_links_letter", {
      p_lobby_code: code,
      p_player_id: effectivePlayerId,
      p_letter: letter,
    });

    if (error) {
      setLetterSelectError(error.message || t('links.wordSubmitFailed'));
      setSelectedLetter(null);
      return;
    }

    if (data?.success === false) {
      setLetterSelectError(data.error || t('links.wordRejected'));
      setSelectedLetter(null);
      return;
    }

    broadcast("letter:select", {
      playerId: effectivePlayerId,
      letter,
      letters: data.letters,
      phase: data.phase,
    });

    // Update local state
    setGameState((prev: any) => ({
      ...prev,
      playerLetters: { ...prev.playerLetters, [effectivePlayerId]: letter },
      letters: data.letters || prev.letters,
      phase: data.phase || prev.phase,
    }));
  };

  const handleAssignPoison = async () => {
    if (phase !== "POISON_SETUP") return;

    // Validate: one poison per opponent
    const targetIds = otherPlayers.map((p) => p.id);
    const missing = targetIds.filter((id) => !poisonAssignments[id]);
    if (missing.length > 0) {
      setPoisonError(t('links.assignAllPoisons'));
      return;
    }

    setPoisonError("");

    const { data, error } = await supabase.rpc("assign_links_poison", {
      p_lobby_code: code,
      p_player_id: effectivePlayerId,
      p_poison_map: poisonAssignments,
    });

    if (error) {
      setPoisonError(error.message || t('links.wordSubmitFailed'));
      return;
    }

    if (data?.success === false) {
      setPoisonError(data.error || t('links.wordRejected'));
      return;
    }

    broadcast("poison:assign", { playerId: effectivePlayerId });

    if (data?.phase === "PLAYING") {
      setGameState((prev: any) => ({ ...prev, phase: "PLAYING" }));
    }
  };

  const handleSubmitWord = async () => {
    if (phase !== "PLAYING" || submitGuardRef.current || isSubmitting) return;
    if (wordFeedback.type !== "valid") {
      if (wordFeedback.type === "used") {
        setShakeKey(k => k + 1);
      }
      return;
    }

    const word = typedWord.trim().toLowerCase();
    if (!word || word.length < 3) return;

    submitGuardRef.current = true;
    setIsSubmitting(true);
    setSubmitStatus(t('links.wordClaiming'));

    // Optimistic broadcast
    const tempId = `temp-${Date.now()}`;
    const optimisticWord: ClaimedWord = {
      id: tempId,
      player_id: effectivePlayerId,
      player_name: playerName || "You",
      word,
      word_length: word.length,
      points: calculatePoints(word.length),
      is_poisoned: false,
      poison_letter: null,
      hearts_remaining: myHearts,
      created_at: new Date().toISOString(),
    };

    setClaimedWords((prev) => [...prev, optimisticWord]);
    setTypedWord("");
    setWordFeedback({ type: "typing" });

    const { data, error } = await supabase.rpc("submit_links_word", {
      p_lobby_code: code,
      p_player_id: effectivePlayerId,
      p_word: word,
    });

    submitGuardRef.current = false;
    setIsSubmitting(false);

    if (error) {
      // Remove optimistic word
      setClaimedWords((prev) => prev.filter((w) => w.id !== tempId));
      setTypedWord(word);
      setSubmitStatus(error.message || t('links.wordSubmitFailed'));
      setTimeout(() => setSubmitStatus(null), 3000);
      return;
    }

    if (data?.success === false) {
      setClaimedWords((prev) => prev.filter((w) => w.id !== tempId));
      setTypedWord(word);

      if (data.error_code === "ALREADY_USED") {
        setWordFeedback({ type: "used", message: t('links.wordAlreadyClaimed') });
        setSubmitStatus(t('links.wordAlreadyTaken'));
      } else if (data.error_code === "MISSING_LETTER") {
        setWordFeedback({ type: "missing", message: data.error || t('links.wordMissingLetter') });
        setSubmitStatus(data.error || t('links.wordMissingLetter'));
      } else {
        setSubmitStatus(data.error || t('links.wordRejected'));
      }
      setTimeout(() => setSubmitStatus(null), 3000);
      return;
    }

    // Remove optimistic, DB will push the real record via realtime
    setClaimedWords((prev) => prev.filter((w) => w.id !== tempId));

    if (data.is_poisoned) {
      setPoisonReveal({
        letter: data.poison_letter || "",
        source: "",
        show: true,
      });
      setTimeout(() => setPoisonReveal((p) => p && p.show ? { ...p, show: false } : null), 3000);
    }

    setSubmitStatus(data.eliminated ? t('links.wordEliminated') : t('links.wordPoints', { pts: data.points }));
    setTimeout(() => setSubmitStatus(null), 2000);

    // Broadcast word claim
    broadcast("word:claim", {
      id: tempId,
      playerId: effectivePlayerId,
      playerName: playerName || "Player",
      word,
      points: calculatePoints(word.length),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmitWord();
    }
  };

  // ── Leave handler ────────────────────────────────────────────────────

  const handleLeave = async () => {
    if (confirm(t('links.leaveGame'))) {
      broadcast("player:leave", { playerId: effectivePlayerId });
      await supabase.from("players").delete().eq("id", effectivePlayerId).eq("lobby_code", code);
      store.clearArenaHostCode();
      window.location.href = `/lobby/${code}`;
    }
  };

  // ── Timer display helpers ────────────────────────────────────────────

  const timerPercent = roundDuration > 0 ? (timeLeft / roundDuration) * 100 : 0;
  const timerColor =
    timeLeft > 20 ? "bg-mint" : timeLeft > 10 ? "bg-butter" : "bg-peach";
  const timerPulse = timeLeft <= 10;

  // ── Letter select timer display ───────────────────────────────────
  const lsTimerPercent = (letterSelectTimeLeft / LETTER_SELECT_TIMEOUT) * 100;
  const lsTimerUrgent = letterSelectTimeLeft <= 10;
  const lsTimerCritical = letterSelectTimeLeft <= 5;

  // ── Scoreboard data ───────────────────────────────────────────────
  const scoreboardPlayers = useMemo(() =>
    players.map((p) => ({
      id: p.id,
      name: p.name || "Player",
      score: claimedWords
        .filter((w) => w.player_id === p.id)
        .reduce((sum, w) => sum + (w.is_poisoned ? 0 : w.points), 0),
      hearts: playerHearts[p.id] ?? 3,
      wordCount: claimedWords.filter((w) => w.player_id === p.id).length,
      isYou: p.id === effectivePlayerId,
    })),
    [players, claimedWords, playerHearts, effectivePlayerId]
  );

  // ── Render: Loading ──────────────────────────────────────────────────

  if (!lobby) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="text-warm-gray/60 font-medium text-sm animate-pulse">{t('links.loading')}</div>
      </div>
    );
  }

  // ── Render: Game Over / Results ──────────────────────────────────────

  if (isGameOver || phase === "RESULTS") {
    return (
      <div className="min-h-screen bg-clay-cream flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80">
          <button onClick={handleLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80">
            <ArrowLeft className="w-3.5 h-3.5" /> {t('links.leaveGame')}
          </button>                <span className="font-outfit font-black text-lg text-plum">🔗 {t('links.title')}</span>
          <span className="text-[10px] font-mono text-warm-gray/50">{code}</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8 overflow-y-auto">
          {/* Trophy */}
          <div className="text-center space-y-2">
            <Trophy className="w-16 h-16 mx-auto text-butter" />
            <h1 className="font-outfit font-black text-3xl text-plum">{t('gameOver.title')}</h1>
            <p className="text-sm text-warm-gray/60">
              {t('links.letters')} {letters.join(" + ")}
              {poisonEnabled && ` · ${t('links.poisonOn')}`}
            </p>
          </div>

          {/* Final standings */}
          <div className="w-full max-w-md space-y-2">
            {sortedPlayers.map((p, idx) => {
              const color = getPlayerColorByName(p.id, players);
              const words = claimedWords.filter((w) => w.player_id === p.id);
              const totalPoints = words.reduce((sum, w) => sum + (w.is_poisoned ? 0 : w.points), 0);
              const hearts = playerHearts[p.id] ?? 3;

              return (
                <ClayCard
                  key={p.id}
                  elevation={idx === 0 ? "elevated" : "flat"}
                  padding="md"
                  className={`flex items-center gap-3 ${idx === 0 ? "ring-2 ring-butter/30" : ""}`}
                >
                  <span className="text-2xl flex-shrink-0">
                    {idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                  </span>
                  <ClayAvatar name={p.name} size="sm" color={color.bg} />
                  <div className="flex-1 min-w-0">
                    <p className="font-outfit font-bold text-sm text-plum truncate">{p.name}</p>
                    <p className="text-[10px] text-warm-gray/50">
                      {words.length} {words.length === 1 ? t('links.word') : t('links.words')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-bold text-lg text-soft-purple">{totalPoints}</p>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Heart
                          key={i}
                          className={`w-3 h-3 ${i < hearts ? `text-peach fill-peach` : "text-warm-gray/20"}`}
                        />
                      ))}
                    </div>
                  </div>
                </ClayCard>
              );
            })}
          </div>

          {/* Word cloud */}
          <div className="w-full max-w-md">
            <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest mb-3">{t('links.allWords')}</h3>
            <div className="flex flex-wrap gap-2">
              {claimedWords.map((w) => {
                const color = getPlayerColorByName(w.player_id, players);
                return (
                  <span
                    key={w.id}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border ${color.border} ${color.bgLight} ${color.text}`}
                  >
                    {w.word}
                    <span className="opacity-60 text-[10px]">{w.is_poisoned ? "☠️" : `+${w.points}`}</span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Play again */}
          <ClayButton
            variant="primary"
            size="lg"
            onClick={() => {
              if (isHost) {
                supabase.rpc("end_links_round", { p_lobby_code: code }).then(() => {}, () => {});
              }
              window.location.href = `/lobby/${code}?from=game`;
            }}
          >
            {t('links.returnToLobby')}
          </ClayButton>
        </div>
      </div>
    );
  }

  // ── Render: Main game ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* ── Reconnection banner ──────────────────────────────────────── */}
      {showDisconnected && (
        <div className="sticky top-0 z-50 bg-peach-light border-b border-peach/30 px-4 py-3 flex items-center justify-center gap-3">
          <WifiOff className="w-4 h-4 text-peach animate-pulse" />
          <span className="text-peach text-xs font-bold uppercase tracking-widest">
            {t('links.connectionLost')}
          </span>
        </div>
      )}

      {/* ── Sticky Scoreboard (PLAYING phase only) ────────────────── */}
      {phase === "PLAYING" && (
        <LinksStickyScoreboard players={scoreboardPlayers} />
      )}

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('lobby.leave')}</span>
          </button>
          <span className="font-outfit font-black text-lg text-plum">🔗 {t('links.title')}</span>
          <span className="text-[10px] font-mono text-warm-gray/50 hidden sm:inline">{code}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            {showDisconnected ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-peach animate-pulse" />
                <span className="text-peach">{t('game.reconnecting')}</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-mint" />
                <span className="text-mint">{t('links.online', { count: onlineCount })}</span>
              </>
            )}
          </div>

          {/* Phase badge */}
          <ClayBadge color="purple" dot>
            {phase === "LETTER_SELECT"
              ? t('links.phaseLetterSelect')
              : phase === "POISON_SETUP"
                ? t('links.phasePoisonSetup')
                : phase === "PLAYING"
                  ? t('links.phasePlaying')
                  : t('links.phaseResults')}
          </ClayBadge>
        </div>
      </div>

      {/* ── Timer bar (PLAYING phase) ────────────────────────────────── */}
      {phase === "PLAYING" && (
        <div className="shrink-0 h-2 bg-warm-gray/10">
          <div
            className={`h-full transition-all duration-300 ${timerColor} ${timerPulse ? "animate-pulse" : ""}`}
            style={{ width: `${clamp(timerPercent, 0, 100)}%` }}
          />
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Fallback: unknown / broken phase ─────────────────────── */}
        {phase !== "LETTER_SELECT" && phase !== "POISON_SETUP" && phase !== "PLAYING" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 text-center">
            <p className="text-sm text-warm-gray/50">
              {t('links.unknownPhase')} <code className="text-peach font-mono text-xs">{JSON.stringify(phase)}</code>
            </p>
            <p className="text-xs text-warm-gray/40">
              {t('links.unknownPhaseDesc')}
            </p>
            <div className="flex gap-2">
              <ClayButton
                variant="secondary"
                size="sm"
                onClick={() => window.location.reload()}
              >
                {t('links.reloadPage')}
              </ClayButton>
              {isHost && (
                <ClayButton
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await supabase.rpc("start_links_game", {
                      p_lobby_code: code,
                      p_settings: {
                        poisonEnabled,
                        roundDuration,
                      },
                    });
                  }}                  >
                  {t('links.forceRestart')}
                </ClayButton>
              )}
            </div>
          </div>
        )}

        {/* ── LETTER_SELECT phase ──────────────────────────────────── */}
        {phase === "LETTER_SELECT" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
            {/* ⏱ Circular Countdown Timer */}
            <div className="relative w-20 h-20 mb-2">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                <circle
                  cx="40" cy="40" r="34"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  className="text-warm-gray/10"
                />
                <circle
                  cx="40" cy="40" r="34"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={SVG_CIRCUMFERENCE}
                  strokeDashoffset={SVG_CIRCUMFERENCE * (1 - lsTimerPercent / 100)}
                  className={`transition-all duration-500 ${
                    lsTimerCritical
                      ? "text-peach animate-pulse"
                      : lsTimerUrgent
                        ? "text-butter"
                        : "text-soft-purple"
                  }`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`font-mono font-black text-xl tabular-nums leading-none ${
                  lsTimerCritical ? "text-peach animate-pulse" : lsTimerUrgent ? "text-butter" : "text-plum"
                }`}>
                  {letterSelectTimeLeft}
                </span>
                <span className="text-[9px] font-bold text-warm-gray/40 uppercase tracking-wider">{t('links.sec')}</span>
              </div>
            </div>

            <div className="text-center space-y-2">
              <h1 className="font-outfit font-black text-3xl text-plum">{t('links.pickYourLetter')}</h1>
              <p className="text-sm text-warm-gray/60 max-w-sm">
                {t('links.pickLetterDesc')}
                {players.length > 2 && ` ${t('links.playersLettersHint', { count: players.length })}`}
              </p>
              {lsTimerUrgent && !selectedLetter && (
                <p className={`text-xs font-black mt-1 animate-pulse ${lsTimerCritical ? "text-peach" : "text-butter"}`}>
                  <Clock className="w-3 h-3 inline mr-1" />
                  {lsTimerCritical ? t('links.hurryUp') : t('links.timeRunningOut')}
                </p>
              )}
            </div>

            {letterSelectError && (
              <div className="text-peach text-xs font-bold bg-peach-light px-4 py-2 rounded-full animate-shake">
                {letterSelectError}
              </div>
            )}

            {selectedLetter ? (
              <div className="text-center space-y-4">
                <p className="text-warm-gray/60 text-sm">{t('links.youPicked')}</p>
                <div className="w-24 h-24 rounded-3xl bg-soft-purple flex items-center justify-center shadow-lg animate-clay-pop mx-auto">
                  <span className="text-5xl font-outfit font-black text-white">{selectedLetter}</span>
                </div>
                <p className="text-xs text-warm-gray/50">{t('links.waitingOtherPlayers')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 max-w-lg">
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => {
                  const taken = Object.values(playerLetters).includes(l);
                  return (
                    <button
                      key={l}
                      onClick={() => !taken && handleSelectLetter(l)}
                      disabled={taken}
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl font-outfit font-black text-lg transition-all duration-150 ${
                        taken
                          ? "bg-warm-gray/10 text-warm-gray/30 cursor-not-allowed"
                          : "bg-warm-white border-2 border-soft-purple/20 text-plum hover:bg-soft-purple-light hover:border-soft-purple hover:text-soft-purple hover:-translate-y-1 hover:shadow-lg active:scale-95"
                      }`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected letters so far — with reveal animation */}
            {Object.keys(playerLetters).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 justify-center">
                <span className="text-xs font-bold text-warm-gray/50">{t('links.letters')}</span>
                {Object.entries(playerLetters).map(([pid, letter], i) => {
                  const p = players.find((pl) => pl.id === pid);
                  const color = getPlayerColorByName(pid, players);
                  return (
                    <span
                      key={pid}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${color.border} ${color.bgLight} ${color.text} animate-clay-pop`}
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      {letter}
                      <span className="opacity-70">{p?.name || pid.slice(0, 6)}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── POISON_SETUP phase ───────────────────────────────────── */}
        {phase === "POISON_SETUP" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">
            <div className="text-center space-y-2">
              <div className="text-4xl mb-2">☣️</div>
              <h1 className="font-outfit font-black text-2xl text-plum">{t('links.poisonPhase')}</h1>
              <p className="text-sm text-warm-gray/60 max-w-md">
                {t('links.poisonPhaseDesc')}
                <br />
                <span className="text-[10px] text-warm-gray/50">{t('links.poisonPhaseHint')}</span>
              </p>
            </div>

            {/* Required letters reminder */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-warm-gray/50">{t('links.required')}</span>
              {letters.map((l) => (
                <span key={l} className="px-3 py-1 rounded-full bg-soft-purple-light text-soft-purple text-sm font-black">
                  {l}
                </span>
              ))}
            </div>

            {poisonError && (
              <div className="text-peach text-xs font-bold bg-peach-light px-4 py-2 rounded-full">
                {poisonError}
              </div>
            )}

            {/* Poison assignment per opponent */}
            <div className="w-full max-w-md space-y-3">
              {otherPlayers.map((op) => {
                const opColor = getPlayerColorByName(op.id, players);
                const myPoison = poisonAssignments[op.id] || "";

                return (
                  <ClayCard key={op.id} padding="md" className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ClayAvatar name={op.name} size="sm" color={opColor.bg} />
                      <span className="font-outfit font-bold text-sm text-plum">{op.name}</span>
                    </div>
                    <p className="text-[10px] text-warm-gray/50">
                      {t('links.pickPoisonFor', { name: op.name })}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => {
                        const isRequired = letters.includes(l);
                        const isSelected = myPoison === l;
                        return (
                          <button
                            key={l}
                            onClick={() => {
                              if (isRequired) return;
                              setPoisonAssignments((prev) => ({
                                ...prev,
                                [op.id]: isSelected ? "" : l,
                              }));
                            }}
                            className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                              isRequired
                                ? "bg-warm-gray/10 text-warm-gray/20 cursor-not-allowed"
                                : isSelected
                                  ? `${opColor.bg} text-white shadow-md scale-110`
                                  : "bg-warm-white border border-warm-gray/15 text-warm-gray/60 hover:border-soft-purple/30 hover:text-plum"
                            }`}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                    {myPoison && (
                      <p className={`text-[10px] font-bold ${opColor.text}`}>
                        {t('links.poisonAssigned', { letter: myPoison, name: op.name })}
                      </p>
                    )}
                  </ClayCard>
                );
              })}
            </div>

            <ClayButton
              variant="primary"
              size="lg"
              icon={<Shield className="w-4 h-4" />}
              onClick={handleAssignPoison}
              disabled={otherPlayers.some((op) => !poisonAssignments[op.id])}
            >
              {t('links.lockInPoisons')}
            </ClayButton>

            <p className="text-[10px] text-warm-gray/50 text-center">
              {t('links.opponentsAssigned', { count: Object.keys(poisonAssignments).length, total: otherPlayers.length })}
            </p>
          </div>
        )}

        {/* ── PLAYING phase ─────────────────────────────────────────── */}
        {phase === "PLAYING" && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* ── Left/Top: YOU (input + your words) ──────────────── */}
            <div
              className={`flex-1 flex flex-col p-3 sm:p-4 gap-3 overflow-y-auto min-h-0 border-b lg:border-b-0 lg:border-r border-warm-gray/10 ${
                layoutFlipped ? "lg:order-2" : "lg:order-1"
              }`}
            >
              {/* Your stats bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className={`px-3 py-1.5 rounded-full ${myColor.bgLight} ${myColor.text} text-xs font-black flex items-center gap-2`}>
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  {t('links.you')}
                </div>

                {/* Hearts */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Heart
                      key={i}
                      className={`w-4 h-4 transition-all ${
                        i < myHearts ? "text-peach fill-peach" : "text-warm-gray/20"
                      } ${poisonReveal?.show ? "animate-shake" : ""}`}
                    />
                  ))}
                </div>

                {/* Score */}
                <span className="font-mono font-bold text-sm text-soft-purple">
                  {t('game.points', { pts: myWords.reduce((sum, w) => sum + (w.is_poisoned ? 0 : w.points), 0) })}
                </span>

                {/* Word count */}
                <span className="text-[10px] text-warm-gray/50">
                  {myWords.length} {myWords.length === 1 ? t('links.word') : t('links.words')}
                </span>
              </div>

              {/* Poison reveal flash */}
              {poisonReveal?.show && (
                <div className="bg-peach-light border border-peach/30 rounded-2xl p-3 flex items-center gap-3 animate-clay-pop">
                  <Skull className="w-5 h-5 text-peach" />
                  <div>
                    <p className="text-peach text-sm font-black">{t('links.poisonHit')}</p>
                    <p className="text-peach/70 text-xs font-medium">
                      {t('links.poisonUsedLetter', { letter: poisonReveal.letter })}
                    </p>
                  </div>
                </div>
              )}

              {/* Submit status */}
              {submitStatus && (
                <div className={`text-center text-xs font-bold animate-clay-pop ${
                  submitStatus.includes("+") ? "text-mint" : submitStatus.includes("💀") ? "text-peach" : "text-warm-gray/60"
                }`}>
                  {submitStatus}
                </div>
              )}

              {/* Word input */}
              <div key={shakeKey} className={`space-y-2 ${wordFeedback?.type === "used" ? "animate-shake" : ""}`}>
                <div className="relative">
                  <input
                    type="text"
                    value={typedWord}
                    onChange={handleWordChange}
                    onKeyDown={handleKeyDown}
                    placeholder={t('links.typeWordWith', { letters: letters.join(' + ') })}
                    className={`w-full px-5 py-4 rounded-2xl border-2 bg-warm-white font-outfit font-bold text-lg text-plum placeholder:text-warm-gray/40 outline-none transition-all ${
                      wordFeedback.type === "valid"
                        ? `${myColor.border} ${myColor.ring} ring-2`
                        : wordFeedback.type === "missing" || wordFeedback.type === "used" || wordFeedback.type === "invalid"
                          ? "border-peach/30 ring-2 ring-peach/20"
                          : "border-warm-gray/15 focus:border-soft-purple/40"
                    }`}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={myHearts <= 0}
                  />
                  {/* Claim button */}
                  {wordFeedback.type === "valid" && (
                    <button
                      onClick={handleSubmitWord}
                      disabled={isSubmitting || myHearts <= 0}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl font-outfit font-black text-sm text-white transition-all ${
                        isSubmitting ? "bg-warm-gray/40 cursor-wait" : `${myColor.bg} hover:opacity-90 active:scale-95`
                      }`}
                    >
                      {isSubmitting ? "..." : `⚡ ${t('links.claim')}`}
                    </button>
                  )}
                </div>

                {/* Feedback */}
                <div className="h-5">
                  {wordFeedback.type === "valid" && (
                    <p className={`text-xs font-bold ${myColor.text} animate-clay-pop`}>
                      {t('links.pointsPressEnter', { points: calculatePoints(typedWord.length) })}
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

              {/* Required letters */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-warm-gray/50 uppercase">{t('links.required')}:</span>
                {letters.map((l) => (
                  <span
                    key={l}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black ${
                      typedWord.toLowerCase().includes(l.toLowerCase())
                        ? `${myColor.bg} text-white`
                        : "bg-warm-gray/10 text-warm-gray/40"
                    } transition-colors`}
                  >
                    {l}
                  </span>
                ))}
              </div>

              {/* Your word stack */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                <h4 className="text-[10px] font-black text-warm-gray/50 uppercase tracking-wider sticky top-0 bg-clay-cream py-1">
                  {t('links.yourWords', { count: myWords.length })}
                </h4>
                {myWords.length === 0 ? (
                  <p className="text-xs text-warm-gray/40 py-4 text-center">{t('links.noWordsStart')}</p>
                ) : (
                  myWords.map((w) => (
                    <div
                      key={w.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                        w.is_poisoned ? "bg-peach-light border border-peach/20" : `${myColor.bgLight} border border-warm-gray/10`
                      } animate-clay-pop`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-outfit font-bold text-sm truncate ${w.is_poisoned ? "text-peach line-through" : "text-plum"}`}>
                          {w.word.toUpperCase()}
                        </span>
                        {w.is_poisoned && <Skull className="w-3.5 h-3.5 text-peach flex-shrink-0" />}
                      </div>
                      <span className={`font-mono font-bold text-xs flex-shrink-0 ml-2 ${w.is_poisoned ? "text-peach" : myColor.text}`}>
                        {w.is_poisoned ? "☠️" : `+${w.points}`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Divider with swap button ─────────────────────────── */}
            <div className="flex lg:hidden items-center justify-center py-1 bg-warm-gray/5">
              <button
                onClick={() => setLayoutFlipped(!layoutFlipped)}
                className="p-1.5 rounded-full bg-warm-white border border-warm-gray/15 text-warm-gray/50 hover:text-plum transition-colors"
              >
                {layoutFlipped ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            <button
              onClick={() => setLayoutFlipped(!layoutFlipped)}
              className="hidden lg:flex items-center justify-center p-1 bg-warm-gray/5 hover:bg-warm-gray/10 transition-colors"
              title="Swap sides"
            >
              <Shuffle className="w-4 h-4 text-warm-gray/40" />
            </button>

            {/* ── Right/Bottom: OPPONENTS ──────────────────────────── */}
            <div
              className={`flex-1 flex flex-col p-3 sm:p-4 gap-3 overflow-y-auto min-h-0 ${
                layoutFlipped ? "lg:order-1" : "lg:order-2"
              }`}
            >
              {/* Opponent view toggle */}
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-warm-gray/50 uppercase tracking-wider">
                  {t('links.opponents')}
                </h4>
                <button
                  onClick={() => setOpponentView(opponentView === "full" ? "recent" : "full")}
                  className="text-[9px] font-bold text-warm-gray/40 hover:text-warm-gray/60 transition-colors"
                >
                  {opponentView === "full" ? t('links.showRecent') : t('links.showAll')}
                </button>
              </div>

              {/* Per-opponent cards */}
              <div className={`grid gap-3 ${
                otherPlayers.length <= 2 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
              }`}>
                {otherPlayers.map((op) => {
                  const opColor = getPlayerColorByName(op.id, players);
                  const opWords = opponentWords
                    .filter((w) => w.player_id === op.id)
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                  const displayWords = opponentView === "recent" ? opWords.slice(0, 5) : opWords;
                  const opHearts = playerHearts[op.id] ?? 3;
                  const opScore = opWords.reduce((sum, w) => sum + (w.is_poisoned ? 0 : w.points), 0);

                  return (
                    <ClayCard key={op.id} padding="md" className="space-y-2">
                      {/* Opponent header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <ClayAvatar name={op.name} size="sm" color={opColor.bg} />
                          <span className="font-outfit font-bold text-sm text-plum truncate">{op.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Hearts */}
                          <div className="flex gap-0.5">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <Heart
                                key={i}
                                className={`w-3 h-3 ${i < opHearts ? "text-peach fill-peach" : "text-warm-gray/20"}`}
                              />
                            ))}
                          </div>
                          <span className="font-mono font-bold text-xs text-soft-purple">{opScore}</span>
                        </div>
                      </div>

                      {/* Words */}
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {displayWords.length === 0 ? (
                          <p className="text-xs text-warm-gray/40 py-2 text-center">{t('links.noWordsYet')}</p>
                        ) : (
                          displayWords.map((w) => (
                            <div
                              key={w.id}
                              className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs ${
                                w.is_poisoned ? "bg-peach-light/50" : `${opColor.bgLight}/50`
                              } animate-clay-pop`}
                            >
                              <span className={`font-bold ${w.is_poisoned ? "text-peach line-through" : opColor.text}`}>
                                {w.word.toUpperCase()}
                              </span>
                              <span className={`font-mono text-[10px] ${w.is_poisoned ? "text-peach/60" : `${opColor.text}/60`}`}>
                                {w.is_poisoned ? "☠️" : `+${w.points}`}
                              </span>
                            </div>
                          ))
                        )}
                        {opponentView === "recent" && opWords.length > 5 && (
                          <p className="text-[9px] text-warm-gray/40 text-center">
                            {t('links.moreWords', { count: opWords.length - 5 })}
                          </p>
                        )}
                      </div>

                      {/* Word count */}
                      <p className="text-[10px] text-warm-gray/40 text-right">
                        {opWords.length} {opWords.length === 1 ? t('links.word') : t('links.words')} · {opLetter(op.id)}
                      </p>
                    </ClayCard>
                  );

                  function opLetter(pid: string) {
                    const l = playerLetters[pid];
                    return l ? t('links.opponentLetter', { letter: l }) : "";
                  }
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 border-t border-warm-gray/10 bg-warm-white/80 flex items-center justify-between text-[10px] text-warm-gray/50">
        <span>🔤 {t('links.required')} {letters.join(' + ') || '—'}</span>
        <span>{phase === 'PLAYING' ? `⏱ ${timeLeft}s` : `📋 ${claimedWords.length} ${t('links.wordsClaimed')}`}</span>
        <span>{poisonEnabled ? `☣️ ${t('links.poisonOn')}` : `🛡️ ${t('links.poisonOff')}`}</span>
      </div>
    </div>
  );
}
