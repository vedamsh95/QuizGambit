import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { Zap, Users, Trophy, Wifi, WifiOff, ArrowRight, LogIn, Circle, BookOpen, Sliders, Clock, Hash } from "lucide-react";
import LanguageSwitcher from "./ui/LanguageSwitcher";

// ── Types ───────────────────────────────────────────────────────────────────

type PlayerPhase = "JOIN" | "PLAY";
type BuzzState = "idle" | "buzzing-open" | "buzzed-success" | "buzzed-too-slow" | "locked";

// ── Component ───────────────────────────────────────────────────────────────

export default function BuzzerPlayerView() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  // ── Join state ──────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<PlayerPhase>(() => {
    const stored = code ? localStorage.getItem(`buzzer_player_${code}`) : null;
    return stored ? "PLAY" : "JOIN";
  });
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(() => {
    if (!code) return null;
    return localStorage.getItem(`buzzer_player_${code}`);
  });
  const [playerScore, setPlayerScore] = useState(0);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  // ── Game state ──────────────────────────────────────────────────────────

  const [gameStatus, setGameStatus] = useState("LOBBY");
  const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null);
  const [buzzState, setBuzzState] = useState<BuzzState>("idle");
  const [players, setPlayers] = useState<any[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // ── Host settings (live from lobby) ────────────────────────────────────

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [hostRounds, setHostRounds] = useState(1);
  const [hostTimer, setHostTimer] = useState(15);
  const [hostCatsPerRound, setHostCatsPerRound] = useState(5);
  const [hostSelectionMode, setHostSelectionMode] = useState("HOST_PICK");
  const [hostSelectedCategories, setHostSelectedCategories] = useState<Record<number, any[]>>({});
  const [hostDraftPoolSize, setHostDraftPoolSize] = useState(0);

  // ── Draft state ────────────────────────────────────────────────────────

  const [draftPhase, setDraftPhase] = useState("pending");
  const [draftTurnIndex, setDraftTurnIndex] = useState(0);
  const [draftPool, setDraftPool] = useState<{ id: string; name: string }[]>([]);
  const [draftPicks, setDraftPicks] = useState<any[]>([]);

  // ── Buzz timestamps for leaderboard ──────────────────────────────────

  const [buzzTimestamps, setBuzzTimestamps] = useState<Record<string, number>>({});
  const gameStatusRef = useRef(gameStatus);
  const buzzedPlayerIdRef = useRef(buzzedPlayerId);
  const playersRef = useRef(players);
  const buzzFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { gameStatusRef.current = gameStatus; });
  useEffect(() => { buzzedPlayerIdRef.current = buzzedPlayerId; });
  useEffect(() => { playersRef.current = players; });

  // ── Realtime ────────────────────────────────────────────────────────────

  const { broadcast, onBroadcast, presences, isConnected } = useRealtimeChannel({
    channelName: `standard:${code}`,
    enablePresence: phase === "PLAY" && !!playerId,
    presenceData:
      phase === "PLAY" && playerId
        ? { playerId, name: playerName || "Player", status: "connected" as const }
        : undefined,
    subscribeLobby: code,
    subscribePlayers: code,
    onLobbyChange: (payload: any) => {
      const newLobby = payload.new;
      if (newLobby.status) {
        setGameStatus(newLobby.status);
        if (newLobby.status === "BUZZING" && newLobby.buzzed_player_id === null) {
          setBuzzState("buzzing-open");
          setBuzzedPlayerId(null);
        }
      }
      if (newLobby.buzzed_player_id !== undefined) {
        setBuzzedPlayerId(newLobby.buzzed_player_id);
        if (newLobby.buzzed_player_id && newLobby.buzzed_player_id !== playerId) {
          setBuzzState("buzzed-too-slow");
        }
      }
      // ── Settings + Draft ──────────────────────────────────────
      if (newLobby.settings) {
        const s = newLobby.settings;
        if (s.draftPhase !== undefined) setDraftPhase(s.draftPhase);
        if (s.draftTurnIndex !== undefined) setDraftTurnIndex(s.draftTurnIndex);
        if (s.draftPool) setDraftPool(s.draftPool);
        if (s.draftPicks) setDraftPicks(s.draftPicks);
        if (s.rounds !== undefined) setHostRounds(s.rounds);
        if (s.timer !== undefined) setHostTimer(s.timer);
        if (s.catsPerRound !== undefined) setHostCatsPerRound(s.catsPerRound);
        if (s.selectionMode) setHostSelectionMode(s.selectionMode);
        if (s.selectedCategories) {
          try { setHostSelectedCategories(s.selectedCategories); } catch {}
        }
        if (s.draftPoolIds) {
          try { setHostDraftPoolSize((s.draftPoolIds as any[]).length); } catch {}
        }
        setSettingsLoaded(true);
      }
    },
    onPlayerChange: async () => {
      if (!code) return;
      const { data } = await supabase.from("players").select("*").eq("lobby_code", code);
      if (data) {
        // Sort by joined_at for draft turn consistency with BuzzerLobby
        setPlayers(data.sort((a: any, b: any) => (a.joined_at || "").localeCompare(b.joined_at || "")));
        if (playerId) {
          const me = data.find((p: any) => p.id === playerId);
          if (me) setPlayerScore(me.score || 0);
        }
      }
    },
  });

  // ── Initial fetches ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!code || phase !== "PLAY") return;

    supabase
      .from("lobbies")
      .select("status, buzzed_player_id, settings")
      .eq("code", code)
      .single()
      .then(({ data }) => {
        if (data) {
          setGameStatus(data.status);
          setBuzzedPlayerId(data.buzzed_player_id);
          if (data.status === "BUZZING" && data.buzzed_player_id === null) {
            setBuzzState("buzzing-open");
          }
          if (data.settings) {
            const s = data.settings;
            if (s.draftPhase !== undefined) setDraftPhase(s.draftPhase);
            if (s.draftTurnIndex !== undefined) setDraftTurnIndex(s.draftTurnIndex);
            if (s.draftPool) setDraftPool(s.draftPool);
            if (s.draftPicks) setDraftPicks(s.draftPicks);
            if (s.rounds !== undefined) setHostRounds(s.rounds);
            if (s.timer !== undefined) setHostTimer(s.timer);
            if (s.catsPerRound !== undefined) setHostCatsPerRound(s.catsPerRound);
            if (s.selectionMode) setHostSelectionMode(s.selectionMode);
            if (s.selectedCategories) {
              try { setHostSelectedCategories(s.selectedCategories); } catch {}
            }
            if (s.draftPoolIds) {
              try { setHostDraftPoolSize((s.draftPoolIds as any[]).length); } catch {}
            }
          }
          setSettingsLoaded(true);
        }
      });

    supabase
      .from("players")
      .select("*")
      .eq("lobby_code", code)
      .then(({ data }) => {
        if (data) {
          // Sort by joined_at for draft turn consistency
          setPlayers(data.sort((a: any, b: any) => (a.joined_at || "").localeCompare(b.joined_at || "")));
          if (playerId) {
            const me = data.find((p: any) => p.id === playerId);
            if (me) setPlayerScore(me.score || 0);
          }
        }
      });
  }, [code, phase, playerId]);

  // Track whether game has started (set by game:start broadcast)
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    if (phase !== "PLAY") return;
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onBroadcast("buzzer:clear", () => {
        setBuzzedPlayerId(null);
        setBuzzState("buzzing-open");
      })
    );

    unsubs.push(
      onBroadcast("phase:change", (payload: any) => {
        setGameStatus(payload.phase);
        if (payload.phase === "BUZZING") {
          setBuzzState("buzzing-open");
          setBuzzedPlayerId(null);
        } else {
          setBuzzState("locked");
        }
      })
    );

    unsubs.push(
      onBroadcast("score:update", (payload: any) => {
        if (payload.playerId === playerId && payload.score !== undefined) {
          setPlayerScore(payload.score);
        }
      })
    );

    // ── Draft events ──────────────────────────────────────────────

    unsubs.push(
      onBroadcast("draft:start", (payload: any) => {
        setDraftPhase("in_progress");
        setDraftTurnIndex(payload.turnIndex || 0);
      })
    );

    unsubs.push(
      onBroadcast("draft:turn", (payload: any) => {
        setDraftTurnIndex(payload.turnIndex);
      })
    );

    // Full state sync from authority (BuzzerLobby) — avoids echo issues
    unsubs.push(
      onBroadcast("draft:sync", (payload: any) => {
        if (payload.picks) setDraftPicks(payload.picks);
        if (payload.turnIndex !== undefined) setDraftTurnIndex(payload.turnIndex);
        if (payload.phase) setDraftPhase(payload.phase);
        // Reset drafting flag when turn passes away from this player
        const myIdx = playersRef.current.findIndex((p) => p.id === playerId);
        if (myIdx !== payload.turnIndex) setIsDrafting(false);
      })
    );

    unsubs.push(
      onBroadcast("draft:complete", (payload: any) => {
        setDraftPhase("complete");
        if (payload.picks) setDraftPicks(payload.picks);
      })
    );

    unsubs.push(
      onBroadcast("settings:update", (payload: any) => {
        if (payload.rounds !== undefined) setHostRounds(payload.rounds);
        if (payload.timer !== undefined) setHostTimer(payload.timer);
        if (payload.catsPerRound !== undefined) setHostCatsPerRound(payload.catsPerRound);
        if (payload.selectionMode) setHostSelectionMode(payload.selectionMode);
        if (payload.selectedCategories) {
          try { setHostSelectedCategories(payload.selectedCategories); } catch {}
        }
        if (payload.draftPoolIds) {
          try { setHostDraftPoolSize((payload.draftPoolIds as any[]).length); } catch {}
        }
      })
    );

    // game:start — player stays on BuzzerPlayerView; flag marks game as live
    unsubs.push(
      onBroadcast("game:start", () => {
        setGameStarted(true);
      })
    );

    // Listen for buzzer presses from other players (including host)
    unsubs.push(
      onBroadcast("buzzer:press", (payload: any) => {
        if (payload.playerId && payload.playerId !== playerId) {
          setBuzzedPlayerId(payload.playerId);
          setBuzzState("buzzed-too-slow");
        }
      })
    );

    // Listen for buzz timestamps from all players
    unsubs.push(
      onBroadcast("buzz:timestamp", (payload: any) => {
        if (payload.playerId && payload.buzzTime) {
          setBuzzTimestamps((prev) => ({ ...prev, [payload.playerId]: payload.buzzTime }));
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

    unsubs.push(
      onBroadcast("game:end", () => {
        navigate(`/buzzer/${code}`);
      })
    );

    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast, phase, playerId, code]);

  // ── Check if already in lobby (re-join) ─────────────────────────────────

  useEffect(() => {
    if (!code || !playerId || phase !== "PLAY") return;

    supabase
      .from("players")
      .select("id, name, score")
      .eq("id", playerId)
      .eq("lobby_code", code)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          localStorage.removeItem(`buzzer_player_${code}`);
          setPlayerId(null);
          setPhase("JOIN");
        } else {
          setPlayerName(data.name);
          setPlayerScore(data.score || 0);
        }
      });
  }, [code, playerId, phase]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleJoin = useCallback(async () => {
    const name = playerName.trim().toUpperCase();
    if (!name || !code) return;
    if (name.length > 20) {
      setJoinError("Name too long (max 20 characters)");
      return;
    }

    setIsJoining(true);
    setJoinError("");

    try {
      const { data: lobby, error: lobbyErr } = await supabase
        .from("lobbies")
        .select("code, status, buzzed_player_id, settings")
        .eq("code", code)
        .single();

      if (lobbyErr || !lobby) {
        setJoinError("Game not found. Check the room code.");
        setIsJoining(false);
        return;
      }

      const { data: existing } = await supabase
        .from("players")
        .select("id")
        .eq("lobby_code", code)
        .ilike("name", name)
        .maybeSingle();

      if (existing) {
        setJoinError("Name already taken. Choose another.");
        setIsJoining(false);
        return;
      }

      const newId = crypto.randomUUID();
      const { error: insertErr } = await supabase.from("players").insert({
        id: newId,
        lobby_code: code,
        name,
        score: 0,
        joined_at: new Date().toISOString(),
      });

      if (insertErr) {
        setJoinError("Failed to join. Try again.");
        setIsJoining(false);
        return;
      }

      localStorage.setItem(`buzzer_player_${code}`, newId);
      setPlayerId(newId);
      setPlayerName(name);
      setPlayerScore(0);
      setPhase("PLAY");

      // Broadcast join so host sees it immediately
      broadcast("player:join", { playerId: newId, playerName: name });

      if (lobby.status === "BUZZING" && !lobby.buzzed_player_id) {
        setBuzzState("buzzing-open");
      }

      // Read settings on join
      if (lobby.settings) {
        const s = lobby.settings;
        if (s.draftPhase) setDraftPhase(s.draftPhase);
        if (s.draftTurnIndex !== undefined) setDraftTurnIndex(s.draftTurnIndex);
        if (s.draftPool) setDraftPool(s.draftPool);
        if (s.draftPicks) setDraftPicks(s.draftPicks);
        if (s.rounds !== undefined) setHostRounds(s.rounds);
        if (s.timer !== undefined) setHostTimer(s.timer);
        if (s.catsPerRound !== undefined) setHostCatsPerRound(s.catsPerRound);
        if (s.selectionMode) setHostSelectionMode(s.selectionMode);
        if (s.selectedCategories) {
          try { setHostSelectedCategories(s.selectedCategories); } catch {}
        }
        if (s.draftPoolIds) {
          try { setHostDraftPoolSize((s.draftPoolIds as any[]).length); } catch {}
        }
      }
    } catch (err) {
      setJoinError("Something went wrong. Try again.");
    } finally {
      setIsJoining(false);
    }
  }, [playerName, code]);

  const handleBuzz = useCallback(async () => {
    if (!code || !playerId || gameStatus !== "BUZZING") return;

    // Call RPC first — let server decide who wins (avoids flash on failure)
    const { data, error } = await supabase.rpc("buzz_in", {
      p_lobby_code: code,
      p_player_id: playerId,
    });

    if (error || !data) {
      // Someone else buzzed first — show "too slow" briefly, then reset
      setBuzzState("buzzed-too-slow");
      if (buzzFlashRef.current) clearTimeout(buzzFlashRef.current);
      buzzFlashRef.current = setTimeout(() => {
        if (gameStatusRef.current === "BUZZING" && !buzzedPlayerIdRef.current) {
          setBuzzState("buzzing-open");
        }
      }, 2000);
      return;
    }

    setBuzzState("buzzed-success");
    setBuzzedPlayerId(playerId);
    const now = Date.now();
    broadcast("buzzer:press", { playerId });
    broadcast("buzz:timestamp", { playerId, playerName, buzzTime: now });
    setBuzzTimestamps((prev) => ({ ...prev, [playerId]: now }));
  }, [code, playerId, gameStatus, playerName, broadcast]);

  const [isDrafting, setIsDrafting] = useState(false);

  const handleDraftPick = useCallback((cat: { id: string; name: string }) => {
    if (!code || !playerId || draftPhase !== "in_progress") return;
    if (isDrafting) return;  // Prevent double-clicks

    // Check if it's our turn
    const playerIndex = players.findIndex((p) => p.id === playerId);
    if (playerIndex !== draftTurnIndex) return;

    // Check if category already picked
    if (draftPicks.some((p) => p.categoryId === cat.id)) return;

    setIsDrafting(true);

    // Broadcast the pick — BuzzerLobby is the authority and will sync back
    broadcast("draft:pick", {
      playerId,
      playerName,
      categoryId: cat.id,
      categoryName: cat.name,
    });
  }, [code, playerId, playerName, draftPhase, draftTurnIndex, draftPicks, players, isDrafting, broadcast]);

  const handleLeave = useCallback(async () => {
    if (!code || !playerId) return;
    broadcast("player:leave", { playerId });
    await supabase
      .from("players")
      .delete()
      .eq("id", playerId)
      .eq("lobby_code", code);
    localStorage.removeItem(`buzzer_player_${code}`);
    if (buzzFlashRef.current) clearTimeout(buzzFlashRef.current);
    setPhase("JOIN");
    setPlayerId(null);
    setPlayerName("");
  }, [code, playerId, broadcast]);

  // ── Polling fallback for critical phases (catches missed realtime events) ─

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!code || phase !== "PLAY" || !playerId) return;

    const needsPolling =
      gameStatus === "BUZZING" ||
      gameStatus === "READING" ||
      gameStatus === "ANSWERING" ||
      draftPhase === "in_progress" ||
      gameStatus === "LOBBY";

    if (needsPolling) {
      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from("lobbies")
          .select("status, buzzed_player_id, settings")
          .eq("code", code)
          .single();
        if (!data) return;

        if (data.status !== gameStatusRef.current) {
          setGameStatus(data.status);
          if (data.status === "BUZZING" && !data.buzzed_player_id) {
            setBuzzState("buzzing-open");
            setBuzzedPlayerId(null);
          }
        }
        if (data.buzzed_player_id !== buzzedPlayerIdRef.current) {
          setBuzzedPlayerId(data.buzzed_player_id);
          if (data.buzzed_player_id && data.buzzed_player_id !== playerId) {
            setBuzzState("buzzed-too-slow");
          }
        }
        if (data.settings) {
          const s = data.settings;
          if (s.draftPhase !== undefined) setDraftPhase(s.draftPhase);
          if (s.draftTurnIndex !== undefined) setDraftTurnIndex(s.draftTurnIndex);
          if (s.draftPicks) setDraftPicks(s.draftPicks);
          if (s.rounds !== undefined) setHostRounds(s.rounds);
        }
      }, 2000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [code, phase, playerId, gameStatus, draftPhase]);

  const getStatusLabel = (s: string): string => {
    if (s === "LOBBY" && gameStarted) return "Game live — waiting for question";
    switch (s) {
      case "LOBBY":
        return "Waiting for host...";
      case "READING":
        return "Question in play";
      case "BUZZING":
        return "BUZZ NOW!";
      case "ANSWERING":
        return "Answering...";
      default:
        return s;
    }
  };

  const getStatusColor = (s: string): string => {
    switch (s) {
      case "BUZZING":
        return "bg-mint text-mint border-mint/30";
      case "READING":
        return "bg-sky-light text-sky border-sky/30";
      case "ANSWERING":
        return "bg-soft-purple-light text-soft-purple border-soft-purple/30";
      default:
        return "bg-warm-gray/10 text-warm-gray/70 border-warm-gray/20";
    }
  };

  const myRank =
    playerId ? players.findIndex((p) => p.id === playerId) + 1 : 0;

  const isMyDraftTurn =
    draftPhase === "in_progress" &&
    playerId &&
    players.findIndex((p) => p.id === playerId) === draftTurnIndex;

  const pickedIds = new Set(draftPicks.map((p) => p.categoryId));
  const availableDraftCategories = draftPool.filter((c) => !pickedIds.has(c.id));

  // Host setup progress
  const hostTotalSlots = hostRounds * hostCatsPerRound;
  const hostTotalSelected = Object.values(hostSelectedCategories).reduce((sum, cats) => sum + cats.length, 0);
  const hostRoundsFilled = Object.keys(hostSelectedCategories).length;
  const isDraftPoolMode = hostSelectionMode === "PLAYER_DRAFT";
  const hostSetupProgress = isDraftPoolMode ? hostDraftPoolSize : hostTotalSelected;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-soft-purple" />
          <span className="font-outfit font-black text-plum text-sm tracking-wide">
            QuizGambit
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher compact />
          {isConnected ? (
            <Wifi className="w-3.5 h-3.5 text-mint" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-peach animate-pulse" />
          )}
          <span className="text-[10px] font-bold text-warm-gray/60">{code}</span>
          {phase === "PLAY" && (
            <button onClick={handleLeave} className="text-[10px] font-bold text-peach hover:text-peach/80 transition-colors uppercase tracking-wider">
              Leave
            </button>
          )}
        </div>
      </div>

      {/* ── Join Screen ─────────────────────────────────────────────────── */}
      {phase === "JOIN" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-8 animate-clay-pop">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-soft-purple-light text-soft-purple text-[10px] font-black tracking-[0.2em] uppercase">
                <LogIn className="w-3 h-3" />
                Join Game
              </div>
              <h1 className="text-4xl font-outfit font-black text-plum tracking-[0.15em]">{code}</h1>
              <p className="text-sm text-warm-gray/60 font-medium">Enter your name to join the buzzer game</p>
            </div>
            <div className="space-y-4">
              <input
                value={playerName}
                onChange={(e) => { setPlayerName(e.target.value); setJoinError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                placeholder="Your name..."
                maxLength={20}
                autoFocus
                className="w-full text-center font-outfit font-black text-2xl text-plum placeholder:text-warm-gray/30 px-6 py-4 rounded-2xl bg-warm-white border-2 border-warm-gray/20 focus:border-soft-purple/40 focus:outline-none focus:ring-4 focus:ring-soft-purple/10 transition-all uppercase tracking-wide"
              />
              {joinError && (
                <div className="text-center text-xs font-bold text-peach bg-peach-light/50 px-4 py-2 rounded-xl">{joinError}</div>
              )}
              <button
                onClick={handleJoin}
                disabled={!playerName.trim() || isJoining}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-soft-purple text-white font-outfit font-black text-lg hover:bg-soft-purple/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100 shadow-[4px_4px_0px_rgba(166,157,145,0.3)] active:shadow-[2px_2px_0px_rgba(166,157,145,0.2)]"
              >
                {isJoining ? (
                  <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    Join Game
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Game Screen ─────────────────────────────────────────────────── */}
      {phase === "PLAY" && (
        <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-lg mx-auto w-full gap-6">              {/* Draft Phase UI */}
          {draftPhase === "in_progress" && (
            <div className="space-y-4 animate-clay-pop">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-mint-light text-mint text-xs font-black uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5" />
                  Category Draft
                </div>
                <p className="text-[10px] font-medium text-warm-gray/70 mt-2 max-w-xs mx-auto">
                  🎮 <strong>Buzzer mode</strong> — after the draft, stay on this screen and use the big buzz button when the host opens the round.
                </p>
              </div>

              {isMyDraftTurn ? (
                <div className="space-y-3">
                  <div className="p-3 bg-mint-light rounded-xl border-2 border-mint/40 text-center animate-pulse">
                    <span className="font-outfit font-black text-mint text-lg">Your turn to pick!</span>
                    <p className="text-xs text-mint/70 mt-1">Select a category below</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                    {availableDraftCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => handleDraftPick(cat)}
                        className="p-4 rounded-xl bg-warm-white border-2 border-warm-gray/15 hover:border-mint/40 hover:bg-mint-light/50 hover:-translate-y-0.5 transition-all text-center"
                      >
                        <span className="font-outfit font-black text-sm text-plum">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-2 p-6 bg-warm-white rounded-2xl border border-warm-gray/10">
                  <div className="w-12 h-12 mx-auto rounded-full bg-warm-gray/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-warm-gray/60" />
                  </div>
                  <p className="font-outfit font-bold text-plum text-sm">
                    {players[draftTurnIndex]?.name || "Someone"} is picking...
                  </p>
                  <p className="text-xs text-warm-gray/70">Wait for your turn</p>
                </div>
              )}

              {/* Draft progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-warm-gray/70">
                  <span>Draft progress</span>
                  <span>{draftPicks.length} picked</span>
                </div>
                <div className="h-1.5 bg-warm-gray/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-mint rounded-full transition-all duration-500"
                    style={{ width: `${draftPool.length > 0 ? (draftPicks.length / draftPool.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Host Setup Card — shown when host is still configuring */}
          {settingsLoaded && draftPhase !== "in_progress" && gameStatus === "LOBBY" && (
            <div className="clay p-5 space-y-4 animate-clay-pop">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-soft-purple" />
                <span className="font-outfit font-black text-plum text-sm">Host is configuring the game</span>
              </div>

              {/* Settings summary */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
                  <div className="text-[10px] font-black text-warm-gray/60 uppercase">Rounds</div>
                  <div className="font-outfit font-black text-lg text-soft-purple">{hostRounds}</div>
                </div>
                <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
                  <div className="text-[10px] font-black text-warm-gray/60 uppercase">Cats/Rd</div>
                  <div className="font-outfit font-black text-lg text-soft-purple">{hostCatsPerRound}</div>
                </div>
                <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
                  <div className="text-[10px] font-black text-warm-gray/60 uppercase">Timer</div>
                  <div className="font-outfit font-black text-lg text-soft-purple">{hostTimer}s</div>
                </div>
                <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
                  <div className="text-[10px] font-black text-warm-gray/60 uppercase">Mode</div>
                  <div className="font-outfit font-black text-[10px] text-soft-purple mt-0.5">{hostSelectionMode === "HOST_PICK" ? "Host Pick" : "Draft"}</div>
                </div>
              </div>

              {/* Category progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-warm-gray/70">
                  <span>{isDraftPoolMode ? "Draft pool" : "Categories selected"}</span>
                  <span>{hostSetupProgress} / {hostTotalSlots} slots</span>
                </div>
                <div className="h-2 bg-warm-gray/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-soft-purple rounded-full transition-all duration-500"
                    style={{ width: `${hostTotalSlots > 0 ? (hostSetupProgress / hostTotalSlots) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-warm-gray/70">
                  <span>{isDraftPoolMode ? `${hostDraftPoolSize} categories in pool` : `${hostRoundsFilled} of ${hostRounds} rounds configured`}</span>
                  <span>{isDraftPoolMode ? "Draft after setup" : "Starting when ready"}</span>
                </div>
              </div>

              <p className="text-center text-[10px] font-medium text-warm-gray/60">
                Waiting for host to {hostSetupProgress >= hostTotalSlots ? "start the game" : "finish setup"}...
              </p>
              <p className="text-center text-[9px] font-medium text-mint/60 mt-1">
                🎮 <strong>This is a buzzer game</strong> — after setup, the host will show questions on their screen. You just press the big buzz button below when it lights up!
              </p>
            </div>
          )}

          {/* Status badge */}
          {draftPhase !== "in_progress" && (
            <div className="flex justify-center">
              <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border-2 font-outfit font-black text-sm uppercase tracking-wider transition-all duration-300 ${getStatusColor(gameStatus)}`}>
                <Circle className={`w-2 h-2 fill-current ${gameStatus === "BUZZING" ? "animate-pulse" : ""}`} />
                {getStatusLabel(gameStatus)}
              </div>
            </div>
          )}

          {/* Buzz Button — only shown when not drafting */}
          {draftPhase !== "in_progress" && (
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={handleBuzz}
                disabled={gameStatus !== "BUZZING" || buzzState === "buzzed-success"}
                className={`relative rounded-full transition-all duration-200 select-none ${
                  gameStatus === "BUZZING" && buzzState === "buzzing-open"
                    ? "w-44 h-44 sm:w-52 sm:h-52 bg-gradient-to-br from-mint to-emerald-400 shadow-[0_0_40px_rgba(168,217,204,0.5)] animate-buzz-pulse active:scale-90"
                    : buzzState === "buzzed-success"
                    ? "w-44 h-44 sm:w-52 sm:h-52 bg-gradient-to-br from-soft-purple to-purple-400 shadow-[0_0_40px_rgba(168,152,204,0.5)]"
                    : buzzState === "buzzed-too-slow"
                    ? "w-44 h-44 sm:w-52 sm:h-52 bg-gradient-to-br from-peach to-red-300 shadow-[0_0_20px_rgba(220,120,100,0.4)] opacity-70"
                    : "w-44 h-44 sm:w-52 sm:h-52 bg-warm-gray/20 opacity-40"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <Zap className={`w-12 h-12 sm:w-14 sm:h-14 transition-all ${
                    gameStatus === "BUZZING" && buzzState === "buzzing-open"
                      ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                      : buzzState === "buzzed-success"
                      ? "text-white"
                      : "text-white/60"
                  }`} />
                  <span className="font-outfit font-black text-white text-lg sm:text-xl tracking-wider drop-shadow-md">
                    {buzzState === "buzzed-success"
                      ? "YOU'RE IN!"
                      : buzzState === "buzzed-too-slow"
                      ? "TOO SLOW"
                      : gameStatus === "BUZZING"
                      ? "BUZZ!"
                      : "LOCKED"}
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* Buzz result details */}
          {buzzState === "buzzed-success" && draftPhase !== "in_progress" && (
            <div className="text-center space-y-2 animate-clay-pop">
              <p className="font-outfit font-black text-mint text-lg">🎉 You buzzed in!</p>
              <p className="text-xs text-warm-gray/60 font-medium">Wait for the host to grade your answer</p>
            </div>
          )}

          {buzzState === "buzzed-too-slow" && buzzedPlayerId && draftPhase !== "in_progress" && (
            <div className="text-center space-y-1">
              <p className="font-outfit font-bold text-peach text-sm">
                {players.find((p) => p.id === buzzedPlayerId)?.name || "Someone"} was faster!
              </p>
              <p className="text-[10px] text-warm-gray/60 font-medium">Wait for the next buzzer round</p>
            </div>
          )}

          {/* Score display */}
          <div className="flex items-center justify-center gap-4 px-6 py-4 bg-warm-white rounded-2xl border border-warm-gray/10 shadow-sm">
            <div className="text-center">
              <div className="text-[10px] font-black text-warm-gray/60 uppercase tracking-wider">Score</div>
              <div className="font-mono font-black text-3xl text-plum">{playerScore}</div>
            </div>
            {myRank > 0 && <div className="w-px h-10 bg-warm-gray/10" />}
            {myRank > 0 && (
              <div className="text-center">
                <div className="text-[10px] font-black text-warm-gray/60 uppercase tracking-wider">Rank</div>
                <div className="font-mono font-black text-3xl text-plum">#{myRank}</div>
              </div>
            )}
          </div>

        {/* Leaderboard toggle — shows score-sorted list */}
        <div>
          <button
            onClick={() => setShowLeaderboard((o) => !o)}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-soft-purple hover:text-soft-purple/80 transition-colors uppercase tracking-wider"
          >
            <Trophy className="w-3.5 h-3.5" />
            {showLeaderboard ? "Hide Leaderboard" : `Leaderboard (${players.length})`}
          </button>

          {showLeaderboard && (
            <div className="mt-2 space-y-1.5 max-h-[300px] overflow-y-auto animate-clay-pop">
              <div className="text-[10px] font-black text-warm-gray/60 uppercase tracking-wider px-1 mb-1">
                Leaderboard
              </div>
              {[...players].sort((a: any, b: any) => (b.score || 0) - (a.score || 0)).map((p, i) => {
                  const bt = buzzTimestamps[p.id];
                  return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                      p.id === playerId ? "bg-soft-purple-light border border-soft-purple/20" : "bg-warm-white border border-warm-gray/5"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-outfit font-black text-xs text-warm-gray/70 w-6 text-center flex-shrink-0">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-outfit font-bold text-sm text-plum truncate max-w-[120px]">
                          {p.name}
                          {p.id === playerId && <span className="ml-1 text-[10px] text-soft-purple">(you)</span>}
                        </span>
                        {bt && (
                          <span className="text-[9px] font-mono text-mint/80 tabular-nums">
                            ⚡ {new Date(bt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono font-bold text-sm text-plum flex-shrink-0 ml-2">{p.score || 0}</span>
                  </div>
                  );
                })}
                {players.length === 0 && (
                  <div className="text-center py-4 text-warm-gray/70 text-xs">No players yet</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes buzz-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        .animate-buzz-pulse {
          animation: buzz-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
