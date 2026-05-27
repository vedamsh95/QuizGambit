import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { smartSelectQuestions } from "../lib/smartSelection";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import ClayButton from "./ui/ClayButton";
import ClayCard from "./ui/ClayCard";
import ModeSelection from "./ModeSelection";
import type { GameMode, PlayStyle } from "./ModeSelection";
import BuzzerSetup from "./BuzzerSetup";
import {
  Users, ArrowLeft, Crown, Wifi, WifiOff, LogOut,
  Play, UserPlus, Share2,
} from "lucide-react";

// ── Backward compat: legacy mode strings from old lobbies ───────────────────

/** Normalize old BUZZER lobby mode to new GameMode; keeps STANDARD/LOCAL as-is (no new equivalent yet). */
function normalizeMode(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "BUZZER") return "QUIZ_5X5";
  return raw;
}

/** Derive effective play style from settings + legacy mode fallback. */
function derivePlayStyle(mode: string | null, settings: any): string | null {
  // New lobbies: explicit play_style in settings
  if (settings?.play_style) return settings.play_style as string;
  // Old lobbies: infer from legacy mode column
  if (mode === "BUZZER") return "BUZZER";
  if (mode === "STANDARD") return "MULTIPLAYER";
  if (mode === "LOCAL") return "LOCAL";
  return null;
}

/** True when the mode points to a 5×5 game played as buzzer. */
function isBuzzer5x5(mode: string | null, playStyle: string | null): boolean {
  if (playStyle === "BUZZER") return true;
  return mode === "BUZZER";
}

// ── Types ───────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  data?: any[];
  main_category?: string;
  tags?: string[];
  is_global?: boolean;
}

type LobbyPhase = "MODE_SELECTION" | "SETUP";

// ── UnifiedLobby ────────────────────────────────────────────────────────────

export default function UnifiedLobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  // ── Identity ────────────────────────────────────────────────────────────

  const playerId = store.ensurePlayerId();
  const playerName = store.getPlayerName();

  // ── Core state ──────────────────────────────────────────────────────────

  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Flow state ──────────────────────────────────────────────────────────

  const [lobbyMode, setLobbyMode] = useState<string | null>(null);        // game_type, e.g. "QUIZ_5X5"
  const [lobbyPlayStyle, setLobbyPlayStyle] = useState<string | null>(null);  // "BUZZER" | "MULTIPLAYER" | "LOCAL"
  const [phase, setPhase] = useState<LobbyPhase>("MODE_SELECTION");

  // ── Voting state ────────────────────────────────────────────────────────

  const [voteState, setVoteState] = useState<{
    enabled: boolean;
    votes: Record<string, GameMode>;
  }>({ enabled: false, votes: {} });

  // ── Category state (shared) ─────────────────────────────────────────────

  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);

  // ── Start game state ────────────────────────────────────────────────────

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");

  // ── Refs for latest values ──────────────────────────────────────────────

  const playersRef = useRef(players);
  const lobbyRef = useRef(lobby);
  useEffect(() => { playersRef.current = players; });
  useEffect(() => { lobbyRef.current = lobby; });

  // ── Realtime ────────────────────────────────────────────────────────────

  const { broadcast, onBroadcast, isConnected } = useRealtimeChannel({
    channelName: `lobby:${code}`,
    enablePresence: true,
    presenceData: {
      playerId,
      name: playerName || "Player",
      status: "connected" as const,
    },
    subscribeLobby: code,
    subscribePlayers: code,
    onLobbyChange: (payload: any) => {
      const updated = payload.new;
      if (!updated) {
        navigate("/");
        return;
      }
      setLobby(updated);

      // Mode changed — advance to setup
      if (updated.mode && !lobbyRef.current?.mode) {
        const nm = normalizeMode(updated.mode);
        setLobbyMode(nm);
        setLobbyPlayStyle(derivePlayStyle(updated.mode, updated.settings));
        setPhase("SETUP");
      }

      // Settings sync (voteState, play_style, etc.)
      if (updated.settings) {
        const s = updated.settings;
        if (s.voteState) {
          try { setVoteState(s.voteState); } catch {}
        }
        if (s.play_style && s.play_style !== lobbyRef.current?.settings?.play_style) {
          setLobbyPlayStyle(s.play_style);
        }
      }

      // Status transition: lobby → playing
      if (["PLAYING", "READING", "BUZZING", "ANSWERING", "RACE"].includes(updated.status)) {
        const ps = derivePlayStyle(updated.mode, updated.settings);
        if (isBuzzer5x5(updated.mode, ps) && !isHost) {
          navigate(`/buzzer/${code}`);
        } else {
          navigate(`/play/${code}`);
        }
      }
    },
    onPlayerChange: async () => {
      if (!code) return;
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code);
      if (data) {
        setPlayers(data.sort((a: any, b: any) =>
          (a.joined_at || "").localeCompare(b.joined_at || "")
        ));
      }
    },
  });

  // ── Initial load ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!code) return;
    const init = async () => {
      setLoading(true);

      // Fetch lobby
      const { data: lobbyData, error: lobbyErr } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", code)
        .single();

      if (lobbyErr || !lobbyData) {
        setError("Lobby not found. The code may be invalid.");
        setLoading(false);
        return;
      }

      setLobby(lobbyData);
      setIsHost(lobbyData.host_id === playerId);
      const nm = normalizeMode(lobbyData.mode);
      const ps = derivePlayStyle(lobbyData.mode, lobbyData.settings);
      setLobbyMode(nm);
      setLobbyPlayStyle(ps);
      setPhase(nm ? "SETUP" : "MODE_SELECTION");

      // Reset lobby status on re-entry
      if (lobbyData.status !== "LOBBY" && lobbyData.status !== "IN_PROGRESS") {
        supabase
          .from("lobbies")
          .update({ status: "LOBBY", buzzed_player_id: null })
          .eq("code", code)
          .then(() => {});
      }

      // Load vote state
      if (lobbyData.settings?.voteState) {
        try { setVoteState(lobbyData.settings.voteState); } catch {}
      }

      // Fetch players
      const { data: playerData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code);
      if (playerData) {
        setPlayers(
          playerData.sort((a: any, b: any) =>
            (a.joined_at || "").localeCompare(b.joined_at || "")
          )
        );
      }

      // Fetch categories
      supabase
        .from("categories_library")
        .select("*")
        .then(({ data }) => {
          if (data) setAllCategories(data);
          setCatsLoading(false);
        }, () => setCatsLoading(false));

      setLoading(false);
    };
    init();
  }, [code, playerId]);

  // ── Auto-join as player (non-host) ──────────────────────────────────────

  const hasJoined = useRef(false);
  useEffect(() => {
    if (!code || loading || !playerName || !lobby || hasJoined.current) return;
    if (isHost) {
      hasJoined.current = true;
      return;
    }
    const alreadyJoined = players.some((p) => p.id === playerId);
    if (alreadyJoined) {
      hasJoined.current = true;
      return;
    }
    hasJoined.current = true;
    supabase.from("players").upsert(
      {
        id: playerId,
        lobby_code: code,
        name: playerName,
        score: 0,
        joined_at: new Date().toISOString(),
        metadata: { avatar: store.getPlayerAvatar() },
      },
      { onConflict: "id" }
    ).then(() => {
      broadcast("player:join", { playerId, playerName });
    });
  }, [code, loading, playerName, lobby, playerId, players, isHost]);

  // ── Broadcast listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onBroadcast("player:join", async () => {
      if (!code) return;
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code);
      if (data) {
        setPlayers(
          data.sort((a: any, b: any) =>
            (a.joined_at || "").localeCompare(b.joined_at || "")
          )
        );
      }
    }));

    unsubs.push(onBroadcast("settings:update", (payload: any) => {
      if (payload.mode) {
        setLobbyMode(payload.mode);
        setLobbyPlayStyle(payload.play_style || null);
        setPhase("SETUP");
      }
      if (payload.voteState) {
        try { setVoteState(payload.voteState); } catch {}
      }
    }));

    unsubs.push(onBroadcast("vote:submit", (payload: any) => {
      if (!payload.playerId || !payload.mode) return;
      setVoteState((prev) => {
        const updated = {
          ...prev,
          votes: { ...prev.votes, [payload.playerId]: payload.mode },
        };
        // Persist to lobby
        updateLobbySetting("voteState", updated);
        return updated;
      });
    }));

    unsubs.push(onBroadcast("game:start", () => {
      const ps = lobbyRef.current?.settings?.play_style || derivePlayStyle(
        lobbyRef.current?.mode, lobbyRef.current?.settings
      );
      if (isBuzzer5x5(lobbyRef.current?.mode, ps) && !isHost) {
        navigate(`/buzzer/${code}`);
      } else {
        navigate(`/play/${code}`);
      }
    }));

    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast, code, isHost, navigate]);

  // ── Polling fallback ────────────────────────────────────────────────────

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!code) return;
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("lobbies")
        .select("mode, status, settings")
        .eq("code", code)
        .single();
      if (!data) return;

      // Mode changed
      if (data.mode && data.mode !== lobbyRef.current?.mode) {
        const nm = normalizeMode(data.mode);
        const ps = derivePlayStyle(data.mode, data.settings);
        setLobbyMode(nm);
        setLobbyPlayStyle(ps);
        setPhase("SETUP");
      }

      // Settings sync
      if (data.settings?.voteState) {
        const vs = data.settings.voteState;
        setVoteState((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(vs)) return vs;
          return prev;
        });
      }
      if (data.settings?.play_style && data.settings.play_style !== lobbyRef.current?.settings?.play_style) {
        setLobbyPlayStyle(data.settings.play_style);
      }
    }, 3000);

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [code]);

  // ── Mode selection handlers ─────────────────────────────────────────────

  const updateLobbySetting = useCallback(async (key: string, val: any) => {
    if (!code) return { error: new Error("No lobby code") };
    const { error } = await supabase.rpc("update_lobby_setting_key", {
      p_lobby_code: code,
      p_key: key,
      p_value: val,
    });
    if (error) console.error("Update failed:", error);
    return { error };
  }, [code]);

  const handleSelectMode = useCallback(async (mode: GameMode, playStyle: PlayStyle) => {
    if (!code || !isHost) return;

    setLobbyMode(mode);
    setLobbyPlayStyle(playStyle);
    setPhase("SETUP");

    // Store game_type in the mode column, play_style in settings
    await supabase.from("lobbies").update({ mode }).eq("code", code);
    await updateLobbySetting("play_style", playStyle);

    // Seed default settings based on game type
    const defaultSettings: any = { rounds: 1, timer: 15 };
    if (mode === "QUIZ_5X5") {
      Object.assign(defaultSettings, {
        catsPerRound: 5,
        selectionMode: "HOST_PICK",
        draftPhase: "pending",
        draftPicks: [],
        draftTurnIndex: 0,
        roundCategories: {},
        selectedCategoryIds: [],
      });
    }
    await Promise.all(
      Object.entries(defaultSettings).map(([k, v]) => updateLobbySetting(k, v))
    );

    broadcast("settings:update", { mode, play_style: playStyle, ...defaultSettings });
  }, [code, isHost, broadcast, updateLobbySetting]);

  const handleToggleVoting = useCallback(async (enabled: boolean) => {
    const updated = { enabled, votes: {} };
    setVoteState(updated);
    await updateLobbySetting("voteState", updated);
    broadcast("settings:update", { voteState: updated });
  }, [updateLobbySetting, broadcast]);

  const handleVote = useCallback((mode: GameMode) => {
    broadcast("vote:submit", { playerId, mode });
  }, [playerId, broadcast]);

  // ── Start Game ──────────────────────────────────────────────────────────

  const handleStartGame = useCallback(async () => {
    if (!code || isStarting || !lobbyMode) return;
    setIsStarting(true);
    setStartError("");

    try {
      const s = lobby?.settings || {};

      if (isBuzzer5x5(lobbyMode, lobbyPlayStyle)) {
        // Build round categories from draft picks or selected categories
        const catsToProcess: { round: number; cat: Category }[] = [];
        const picks = s.draftPicks || [];
        const selCats = s.selectedCategories || {};
        const rounds = s.rounds || 1;

        if (picks.length > 0) {
          for (const pick of picks) {
            if (pick.round == null) continue;
            const fullCat = allCategories.find((c) => c.id === pick.categoryId);
            if (fullCat) catsToProcess.push({ round: pick.round, cat: fullCat });
          }
        } else {
          for (let r = 1; r <= rounds; r++) {
            const cats = selCats[r] || [];
            for (const cat of cats) {
              catsToProcess.push({ round: r, cat });
            }
          }
        }

        if (catsToProcess.length === 0) {
          setStartError("No categories selected.");
          setIsStarting(false);
          return;
        }

        const catsPerRound = s.catsPerRound || 5;
        const results = await Promise.all(
          catsToProcess.map(async ({ round, cat }) => {
            const questions = await smartSelectQuestions(
              cat.data || [],
              (cat.name || "").replace(" (Arena)", "").trim(),
              catsPerRound,
              "qb_local_history",
            );
            return { round, cat, questions };
          })
        );

        const processedCategories: Record<number, any[]> = {};
        for (const { round, cat, questions } of results) {
          if (!processedCategories[round]) processedCategories[round] = [];
          processedCategories[round].push({ ...cat, data: questions });
        }

        await updateLobbySetting("round_categories", processedCategories);
      }

      // Update lobby status to start game
      await supabase.from("lobbies").update({ status: "PLAYING" }).eq("code", code);
      broadcast("game:start", {});

      if (isBuzzer5x5(lobbyMode, lobbyPlayStyle) && isHost) {
        navigate(`/play/${code}`);
      } else if (isBuzzer5x5(lobbyMode, lobbyPlayStyle) && !isHost) {
        navigate(`/buzzer/${code}`);
      } else {
        navigate(`/play/${code}`);
      }
    } catch (err: any) {
      setStartError(err?.message || "Failed to start game.");
      setIsStarting(false);
    }
  }, [code, isStarting, lobbyMode, lobbyPlayStyle, lobby, allCategories, isHost, updateLobbySetting, broadcast, navigate]);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = useCallback(async () => {
    if (confirm("Leave this lobby?")) {
      await supabase
        .from("players")
        .delete()
        .eq("id", playerId)
        .eq("lobby_code", code!);
      if (isHost) {
        await supabase.from("lobbies").delete().eq("code", code!);
        store.clearHostLobbyCode();
      }
      navigate("/");
    }
  }, [code, playerId, isHost, navigate]);

  const formattedCode = code
    ? `${code.slice(0, 3)}-${code.slice(3, 6)}`
    : "";

  function getMedal(rank: number) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  }

  // ── Loading state ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" />
          <p className="text-sm text-plum/40 font-medium">Loading lobby...</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-8 text-center gap-6">
        <div className="text-6xl">🔍</div>
        <h1 className="text-2xl font-outfit font-black text-plum">Lobby Not Found</h1>
        <p className="text-plum/40 max-w-sm">{error}</p>
        <ClayButton variant="primary" onClick={() => navigate("/")}>
          Return Home
        </ClayButton>
      </div>
    );
  }

  // ── Mode display name ───────────────────────────────────────────────────

  const modeLabel = (() => {
    if (!lobbyMode) return "Unknown";
    const gameName = lobbyMode === "QUIZ_5X5" ? "5×5 Quiz" : lobbyMode;
    const styleName =
      lobbyPlayStyle === "BUZZER" ? "Buzzer" :
      lobbyPlayStyle === "MULTIPLAYER" ? "Multiplayer" :
      lobbyPlayStyle === "LOCAL" ? "Local" : "";
    return styleName ? `${gameName} · ${styleName}` : gameName;
  })();

  // ── Play style helpers for setup phase ──────────────────────────────────

  // Note: BUZZER is always normalized to QUIZ_5X5, so lobbyMode is never "BUZZER".
  // STANDARD/LOCAL legacy fallbacks are still needed for old lobbies not yet migrated.
  const isBuzzer = lobbyPlayStyle === "BUZZER";
  const isStandard = lobbyPlayStyle === "MULTIPLAYER" || (lobbyMode === "STANDARD" && !lobbyPlayStyle);
  const isLocal = lobbyPlayStyle === "LOCAL" || (lobbyMode === "LOCAL" && !lobbyPlayStyle);
  const is5x5 = lobbyMode === "QUIZ_5X5" || lobbyMode === "BUZZER" || lobbyMode === "STANDARD" || lobbyMode === "LOCAL";

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-clay-border/50 bg-warm-white/80 backdrop-blur-sm">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs font-bold text-warm-gray/60 hover:text-plum transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Home
        </button>

        <div className="flex items-center gap-3">
          {/* Phase badge */}
          <span className="text-[9px] font-black uppercase tracking-wider text-warm-gray/40">
            {phase === "MODE_SELECTION" ? "Choose Mode" : modeLabel}
          </span>

          {/* Connection */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-mint" />
            ) : (
              <WifiOff className="w-3 h-3 text-peach" />
            )}
            <span className={isConnected ? "text-mint" : "text-peach"}>
              {isConnected ? `${players.length} online` : "Offline"}
            </span>
          </div>

          <button
            onClick={handleLeave}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-plum/30 hover:text-peach transition-colors"
          >
            <LogOut className="w-3 h-3" />
            Leave
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* ── Left sidebar: Code + Players ──────────────────────────────── */}
        <div className="lg:w-80 lg:border-r border-clay-border/50 p-4 sm:p-6 space-y-5 shrink-0">
          {/* Code card */}
          <ClayCard elevation="elevated" padding="lg" className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-light text-mint text-[10px] font-black tracking-[0.2em] uppercase">
              {isHost ? <Crown className="w-3 h-3" /> : <Users className="w-3 h-3" />}
              {isHost ? "Host" : "Player"}
            </div>
            <div onClick={handleCopyCode} className="cursor-pointer group select-all" title="Click to copy">
              <div className="text-4xl sm:text-5xl font-outfit font-black text-plum tracking-[0.15em] group-hover:text-soft-purple transition-colors">
                {formattedCode}
              </div>
              <div className="text-[10px] font-bold text-warm-gray/40 mt-1">
                {copied ? "Copied!" : "Tap to copy"}
              </div>
            </div>
            {isHost && (
              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-warm-white border border-warm-gray/15 text-xs font-bold text-warm-gray/60 hover:text-plum hover:border-soft-purple/30 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Code
              </button>
            )}
          </ClayCard>

          {/* Players card */}
          <ClayCard padding="md">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-plum/30" />
              <h3 className="text-xs font-black uppercase tracking-widest text-plum/40">
                Players ({players.length})
              </h3>
            </div>

            {players.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <UserPlus className="w-8 h-8 mx-auto text-warm-gray/20" />
                <p className="text-xs text-warm-gray/40 font-medium">
                  Waiting for players...
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                {players.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl">
                    <span className="font-outfit font-black text-xs text-warm-gray/60 w-6 text-center">
                      {getMedal(i + 1)}
                    </span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black"
                      style={{
                        background:
                          p.id === playerId
                            ? "linear-gradient(135deg, #7C5CFC, #A78BFA)"
                            : i === 0
                              ? "linear-gradient(135deg, #FBBF24, #F59E0B)"
                              : "linear-gradient(135deg, #9CA3AF, #6B7280)",
                      }}
                    >
                      {p.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <span className="text-sm font-bold text-plum flex-1 truncate">
                      {p.name}
                    </span>
                    {p.id === playerId && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-soft-purple">
                        You
                      </span>
                    )}
                    {p.id === lobby?.host_id && (
                      <Crown className="w-3.5 h-3.5 text-butter" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </ClayCard>
        </div>

        {/* ── Right side: Phase-dependent content ────────────────────────── */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {phase === "MODE_SELECTION" && (
            <ModeSelection
              isHost={isHost}
              playerId={playerId}
              players={players}
              lobbyMode={lobbyMode}
              voteState={voteState}
              onSelectMode={handleSelectMode}
              onToggleVoting={handleToggleVoting}
              onVote={handleVote}

            />
          )}

          {/* ── Buzzer setup ────────────────────────────────────────────── */}
          {phase === "SETUP" && is5x5 && isBuzzer && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-light text-mint text-[10px] font-black tracking-[0.2em] uppercase">
                  ⚡ Buzzer Game
                </div>
                {isHost ? (
                  <span className="text-xs text-warm-gray/50 font-medium">
                    Configure categories and start when ready
                  </span>
                ) : (
                  <span className="text-xs text-warm-gray/50 font-medium">
                    Host is setting up the game...
                  </span>
                )}
              </div>

              {isHost ? (
                <BuzzerSetup
                  lobbyCode={code!}
                  players={players}
                  hostPlayerId={playerId}
                  hostPlayerName={playerName}
                  broadcast={broadcast}
                  onBroadcast={onBroadcast}
                  updateLobbySetting={updateLobbySetting}
                  allCategories={allCategories}
                  catsLoading={catsLoading}
                  initialSettings={lobby?.settings || {}}
                  onStartGame={handleStartGame}
                />
              ) : (
                /* Player view during buzzer setup */
                <div className="space-y-6">
                  <PlayerSetupView
                    settings={lobby?.settings || {}}
                    players={players}
                    playerId={playerId}
                    hostPlayerId={lobby?.host_id}
                    playStyle="BUZZER"
                  />
                  <div className="clay p-5 text-center">
                    <div className="animate-pulse flex items-center justify-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-butter" />
                      <span className="text-sm font-bold text-warm-gray/50">
                        Waiting for host to start the game...
                      </span>
                    </div>
                    <p className="text-xs text-warm-gray/40">
                      When the game starts, you'll use the buzz button on your phone.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Standard/multiplayer setup ───────────────────────────────── */}
          {phase === "SETUP" && is5x5 && isStandard && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-purple-light text-soft-purple text-[10px] font-black tracking-[0.2em] uppercase">
                  🌐 Multiplayer
                </div>
                <span className="text-xs text-warm-gray/50 font-medium">
                  Standard quiz game
                </span>
              </div>

              {isHost ? (
                <div className="clay p-8 text-center space-y-6">
                  <h2 className="font-outfit font-black text-xl text-plum">
                    Ready to Start
                  </h2>
                  <p className="text-sm text-warm-gray/50 max-w-md mx-auto">
                    {players.length} player{players.length !== 1 ? "s" : ""} connected. Categories will be selected on the game board.
                  </p>

                  {startError && (
                    <p className="text-xs font-bold text-peach bg-peach-light/30 px-4 py-2 rounded-xl">
                      {startError}
                    </p>
                  )}

                  <ClayButton
                    variant="primary"
                    size="lg"
                    icon={isStarting ? undefined : <Play className="w-5 h-5" />}
                    loading={isStarting}
                    onClick={handleStartGame}
                    className="w-full max-w-sm"
                    disabled={players.length < 1}
                  >
                    Start Game
                  </ClayButton>

                  {players.length < 1 && (
                    <p className="text-xs text-warm-gray/40">
                      Waiting for players to join...
                    </p>
                  )}
                </div>
              ) : (
                <div className="clay p-8 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-soft-purple-light flex items-center justify-center">
                    <Play className="w-8 h-8 text-soft-purple" />
                  </div>
                  <p className="text-sm font-bold text-warm-gray/50">
                    Waiting for host to start...
                  </p>
                  <p className="text-xs text-warm-gray/40">
                    {players.length} player{players.length !== 1 ? "s" : ""} in lobby
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Local setup ──────────────────────────────────────────────── */}
          {phase === "SETUP" && is5x5 && isLocal && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-peach-light text-peach text-[10px] font-black tracking-[0.2em] uppercase">
                  🖥️ Local
                </div>
                <span className="text-xs text-warm-gray/50 font-medium">
                  Play on this screen
                </span>
              </div>
              <div className="clay p-8 text-center space-y-6">
                <h2 className="font-outfit font-black text-xl text-plum">
                  Local Game
                </h2>
                <p className="text-sm text-warm-gray/50">
                  Setup will happen on the game board.
                </p>
                <ClayButton variant="primary" size="lg" onClick={handleStartGame}>
                  Start Local Game
                </ClayButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PlayerSetupView (shown during buzzer setup) ────────────────────────────

function PlayerSetupView({
  settings,
  players,
  playerId,
  hostPlayerId,
  playStyle,
}: {
  settings: any;
  players: any[];
  playerId: string;
  hostPlayerId: string;
  playStyle?: string;
}) {
  const rounds = settings?.rounds || 1;
  const catsPerRound = settings?.catsPerRound || 5;
  const timer = settings?.timer || 15;
  const selectionMode = settings?.selectionMode || "HOST_PICK";
  const draftPoolIds = settings?.draftPoolIds || [];
  const draftPhase = settings?.draftPhase || "pending";
  const draftPicks = settings?.draftPicks || [];
  const draftTurnIndex = settings?.draftTurnIndex || 0;
  const selectedCategories = settings?.selectedCategories || {};

  const totalSlots = rounds * catsPerRound;
  const isDraftPoolMode = selectionMode === "PLAYER_DRAFT";
  const hostSetupProgress = isDraftPoolMode
    ? draftPoolIds.length
    : Object.values(selectedCategories).reduce((sum: number, cats: any) => sum + (Array.isArray(cats) ? cats.length : 0), 0);
  const hostRoundsFilled = Object.keys(selectedCategories).length;
  const draftProgress = draftPicks.length;

  const isMyDraftTurn =
    draftPhase === "in_progress" &&
    players.findIndex((p) => p.id === playerId) === draftTurnIndex;

  return (
    <div className="space-y-4">
      {/* Settings summary */}
      <div className="clay p-5 space-y-4">
        <h3 className="font-outfit font-black text-plum text-sm">Game Setup</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
            <div className="text-[9px] font-black text-warm-gray/40 uppercase">Rounds</div>
            <div className="font-outfit font-black text-lg text-soft-purple">{rounds}</div>
          </div>
          <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
            <div className="text-[9px] font-black text-warm-gray/40 uppercase">Cats/Rd</div>
            <div className="font-outfit font-black text-lg text-soft-purple">{catsPerRound}</div>
          </div>
          <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
            <div className="text-[9px] font-black text-warm-gray/40 uppercase">Timer</div>
            <div className="font-outfit font-black text-lg text-soft-purple">{timer}s</div>
          </div>
          <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
            <div className="text-[9px] font-black text-warm-gray/40 uppercase">Mode</div>
            <div className="font-outfit font-black text-[10px] text-soft-purple mt-0.5">
              {selectionMode === "HOST_PICK" ? "Host Pick" : "Draft"}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-bold text-warm-gray/50">
            <span>{isDraftPoolMode ? "Draft pool" : "Categories"}</span>
            <span>{hostSetupProgress} / {totalSlots}</span>
          </div>
          <div className="h-2 bg-warm-gray/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-soft-purple rounded-full transition-all duration-500"
              style={{ width: `${totalSlots > 0 ? (hostSetupProgress / totalSlots) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Draft state */}
      {draftPhase === "in_progress" && (
        <div className="clay p-5 space-y-3">
          <h3 className="font-outfit font-black text-plum text-sm">Category Draft</h3>
          <div className="h-2 bg-warm-gray/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-mint rounded-full transition-all"
              style={{ width: `${draftPicks.length > 0 ? (draftProgress / Math.max(draftPicks.length, 1)) * 100 : 0}%` }}
            />
          </div>
          {isMyDraftTurn ? (
            <p className="text-sm font-bold text-mint text-center animate-pulse">
              It's your turn to pick! Look at the host's screen.
            </p>
          ) : (
            <p className="text-sm text-warm-gray/50 text-center">
              {players[draftTurnIndex]?.name || "Someone"} is picking...
            </p>
          )}
        </div>
      )}

      {/* Hint */}
      <p className="text-center text-[10px] font-medium text-mint/60">
        🎮 <strong>{playStyle === "BUZZER" ? "Buzzer game" : "Game"}</strong> — after setup, stay on this screen and press the buzz button when the host opens a question.
      </p>
    </div>
  );
}
