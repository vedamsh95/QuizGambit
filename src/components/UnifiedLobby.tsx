import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { smartSelectQuestions } from "../lib/smartSelection";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import ClayButton from "./ui/ClayButton";
import ClayCard from "./ui/ClayCard";
import ConfirmModal from "./ui/ConfirmModal";
import ModeSelection from "./ModeSelection";
import type { GameMode, PlayStyle } from "./ModeSelection";
import BuzzerSetup from "./BuzzerSetup";
import {
  Users, ArrowLeft, Crown, Wifi, WifiOff, LogOut,
  Play, UserPlus, Share2,
} from "lucide-react";
import { getAvatar } from "../assets/avatars";

import SimultaneousSetup from "./SimultaneousSetup";
import PillSelector from "./ui/PillSelector";

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
  const { t } = useTranslation();
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode?.toUpperCase();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromParam = searchParams.get("from"); // 'game' | 'results' — means user just left a game
  const fromParamRef = useRef(fromParam);
  useEffect(() => { fromParamRef.current = fromParam; });

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
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // ── Optimistic settings overlay ────────────────────────────────────────
  // Updates UI instantly on click; server syncs in background.
  const [optimisticSettings, setOptimisticSettings] = useState<Record<string, any>>({});
  // Reset optimistic overlay whenever the server lobby.settings changes
  const lobbySettingsRef = useRef(lobby?.settings);
  useEffect(() => {
    if (lobby?.settings && lobby.settings !== lobbySettingsRef.current) {
      lobbySettingsRef.current = lobby?.settings;
      setOptimisticSettings({});
    }
  }, [lobby?.settings]);
  // Merged settings: optimistic overrides take precedence
  const effectiveSettings = { ...(lobby?.settings || {}), ...optimisticSettings };

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
      // BUG FIX #15: Guard against null arena_state flicker during game start.
      // When start handlers set arena_state to null before calling the RPC, the
      // realtime subscription can fire with arena_state:null for one frame.
      // Clone the payload first to avoid mutating the shared realtime object.
      const prevArenaState = lobbyRef.current?.arena_state;
      const patched = updated.arena_state === null && prevArenaState && prevArenaState.phase
        ? { ...updated, arena_state: prevArenaState }
        : updated;
      setLobby(patched);

      // Mode changed — advance to setup (skip if user just returned from a game)
      if (updated.mode && !lobbyRef.current?.mode && !fromParamRef.current) {
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

      // Clear the ?from= gate once the old game ends (status → LOBBY)
      if (fromParamRef.current && updated.status === "LOBBY") {
        setSearchParams({});
      }

      // Status transition: lobby → playing (skip if user just left a game)
      if (!fromParamRef.current && ["PLAYING", "READING", "BUZZING", "ANSWERING", "RACE"].includes(updated.status)) {
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
    // ── Capture fromParam synchronously BEFORE any async ops ──────────
    // The polling interval (3s) can clear fromParam while we're awaiting
    // DB fetches, causing the host re-insert fix to be skipped. Capturing
    // here ensures we use the correct value throughout the init.
    const isReturningFromGame = !!fromParam;
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
      // When returning from a finished game, show ModeSelection so the user
      // can pick a game mode again — don't auto-advance to SETUP even if mode is set
      // Also clear lobbyMode so ModeSelection doesn't show frozen "X selected!" page
      if (isReturningFromGame) {
        setLobbyMode(null);
        setLobbyPlayStyle(null);
        setPhase("MODE_SELECTION");
      } else {
        setLobbyMode(nm);
        setLobbyPlayStyle(ps);
        setPhase(nm ? "SETUP" : "MODE_SELECTION");
      }

      // Only reset lobby status on re-entry if coming from outside (not from a game)
      if (!isReturningFromGame && lobbyData.status !== "LOBBY" && lobbyData.status !== "IN_PROGRESS") {
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

      // ── Fix: Re-insert host into players table when returning from a game ──
      // The game's handleLeave deletes the host's player record, but the auto-join
      // skips hosts (isHost=true). Without this, the host stays invisible in the lobby.
      // Use the captured `isReturningFromGame` (not fromParamRef.current) to avoid
      // a race condition where polling clears the ref during async ops.
      if (isReturningFromGame && lobbyData.host_id === playerId) {
        const hostInPlayers = playerData?.some((p: any) => p.id === playerId);
        if (!hostInPlayers) {
          try {
            const { error: upsertErr } = await supabase.from("players").upsert(
              {
                id: playerId,
                lobby_code: code,
                name: playerName,
                score: 0,
                joined_at: new Date().toISOString(),
                metadata: { avatar: store.getPlayerAvatar() },
              },
              { onConflict: "id" }
            );
            if (upsertErr) {
              console.error("[UNIFIED LOBBY] Host re-insert failed:", upsertErr.message);
            } else {
              // Re-fetch players after successful insert
              const { data: reFetched } = await supabase
                .from("players")
                .select("*")
                .eq("lobby_code", code);
              if (reFetched) {
                setPlayers(
                  reFetched.sort((a: any, b: any) =>
                    (a.joined_at || "").localeCompare(b.joined_at || "")
                  )
                );
              }
            }
          } catch (reinsertErr: any) {
            console.error("[UNIFIED LOBBY] Host re-insert exception:", reinsertErr?.message || reinsertErr);
          }
        }
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

    unsubs.push(onBroadcast("player:leave", (payload: any) => {
      if (payload.playerId) {
        setPlayers((prev) => prev.filter((p) => p.id !== payload.playerId));
      }
    }));

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
        .select("*")
        .eq("code", code)
        .single();
      if (!data) return;

      // Always update the full lobby state (fixes stale settings)
      setLobby((prev: any) => {
        if (!prev || JSON.stringify(prev) !== JSON.stringify(data)) return data;
        return prev;
      });

      // Clear the ?from= gate once the old game ends (status → LOBBY)
      if (fromParamRef.current && data.status === "LOBBY") {
        setSearchParams({});
      }

      // Status changed to PLAYING — navigate to game board (skip if user just left a game)
      if (
        !fromParamRef.current &&
        ["PLAYING", "READING", "BUZZING", "ANSWERING", "RACE"].includes(data.status) &&
        lobbyRef.current?.status !== data.status
      ) {
        const ps = derivePlayStyle(data.mode, data.settings);
        if (isBuzzer5x5(data.mode, ps) && !isHost) {
          navigate(`/buzzer/${code}`);
        } else {
          navigate(`/play/${code}`);
        }
        return;
      }

      // Mode changed (skip if user just returned from a game)
      if (data.mode && data.mode !== lobbyRef.current?.mode && !fromParamRef.current) {
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

      // ── Player polling fallback: re-fetch players list ──────────────
      // When realtime postgres_changes aren't delivering (e.g. players
      // not in supabase_realtime), this keeps the host's player list fresh.
      const { data: playerData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code);
      if (playerData) {
        const sorted = playerData.sort((a: any, b: any) =>
          (a.joined_at || "").localeCompare(b.joined_at || "")
        );
        setPlayers((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(sorted)) return sorted;
          return prev;
        });
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

  // Optimistic update: apply locally + fire server call in background
  const optimisticUpdate = useCallback((key: string, val: any) => {
    setOptimisticSettings(prev => ({ ...prev, [key]: val }));
    updateLobbySetting(key, val);
    broadcast("settings:update", { [key]: val });
  }, [updateLobbySetting, broadcast]);

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
      const s = { ...lobby?.settings, ...optimisticSettings };

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

  // ── Start Simultaneous Game ──────────────────────────────────────────────

  const handleStartSimultaneousGame = useCallback(async () => {
    if (!code || isStarting) return;
    setIsStarting(true);
    setStartError("");

    try {
      // ── Read settings DIRECTLY from DB (not from stale lobby state) ───
      const { data: freshLobby } = await supabase
        .from("lobbies")
        .select("settings")
        .eq("code", code)
        .single();

      const s = freshLobby?.settings || { ...lobby?.settings, ...optimisticSettings };

      // ── Build categories with question data ──────────────────────────

      let catsToProcess: { id: string; name: string; round: number }[] = [];
      const draftPicks: any[] = s.draftPicks || [];

      if (draftPicks.length > 0) {
        const seen = new Set<string>();
        for (const pick of draftPicks) {
          if (!seen.has(pick.categoryId)) {
            seen.add(pick.categoryId);
            catsToProcess.push({
              id: pick.categoryId,
              name: pick.categoryName,
              round: pick.round || 1,
            });
          }
        }
      } else {
        const selCats: Record<number, any[]> = s.selectedCategories || {};
        const seen = new Set<string>();
        for (const [roundStr, cats] of Object.entries(selCats)) {
          const round = parseInt(roundStr) || 1;
          for (const cat of (cats as any[])) {
            if (!seen.has(cat.id)) {
              seen.add(cat.id);
              catsToProcess.push({ id: cat.id, name: cat.name, round });
            }
          }
        }
      }

      console.log("[Simul] handleStartSimultaneousGame catsToProcess:", catsToProcess.length, catsToProcess.map(c => c.name));

      // Match against allCategories (which carry .data with questions)
      const simultaneousCategories = catsToProcess.map(({ id, name, round }) => {
        const fullCat = allCategories.find((c) => c.id === id);
        return {
          id,
          name,
          round,
          data: fullCat?.data || [],
        };
      });

      // ── Store categories FIRST (before RPC — so SimultaneousBoard can read them) ──
      await updateLobbySetting("simultaneous_categories", simultaneousCategories);

      // ── Nuke stale arena_state from previous games BEFORE starting ──
      // Without this, start_simultaneous_session may "resume" an old game
      // with stale revealed_questions_by_round — making all 25 tiles appear already played.
      const { error: nullArenaErr } = await supabase
        .from("lobbies")
        .update({ arena_state: null })
        .eq("code", code);
      if (nullArenaErr && import.meta.env.DEV) {
        console.warn("[SIMUL] Failed to null stale arena_state:", nullArenaErr.message);
      }

      // ── Call the start_simultaneous_session RPC to init game state ────

      const { data: sessionResult, error: sessionErr } = await supabase.rpc(
        "start_simultaneous_session",
        {
          p_lobby_code: code,
          p_settings: {
            rounds: s.rounds || 1,
            timer: s.timer || 15,
            catsPerRound: s.catsPerRound || 5,
            scoringType: s.scoringType || "RELATIVE",
            penaltyType: s.penaltyType || "HALF",
            selectionMode: s.selectionMode || "HOST_PICK",
            draftPicks: s.draftPicks || [],
            selectedCategories: s.selectedCategories || {},
          },
        }
      );

      console.log("[Simul] start_simultaneous_session result:", sessionResult);

      if (sessionErr) {
        // Detect 404 (RPC not deployed — migrations not run)
        if (sessionErr.code === 'PGRST202' || sessionErr.message?.includes('404') || sessionErr.message?.includes('not found')) {
          const msg = "Database functions not deployed. Run the SQL migrations in Supabase SQL Editor first.";
          setStartError(msg);
          setIsStarting(false);
          return;
        }
        const msg = sessionErr.message || "Failed to initialize game session";
        setStartError(msg);
        setIsStarting(false);
        return;
      }

      if (sessionResult?.success === false) {
        const msg = sessionResult?.error || "Failed to initialize game session";
        console.error("[Simul] RPC failed:", msg);
        setStartError(msg);
        setIsStarting(false);
        return;
      }

      // Update lobby mode + status
      await supabase.from("lobbies").update({
        mode: "SIMULTANEOUS",
        status: "PLAYING",
      }).eq("code", code);

      broadcast("game:start", {});
      navigate(`/play/${code}`);
    } catch (err: any) {
      const msg = err?.message || "Failed to start simultaneous game.";
      setStartError(msg);
      setIsStarting(false);
    }
  }, [code, isStarting, lobby, allCategories, updateLobbySetting, broadcast, navigate]);

  // ── Start LINKS Game ─────────────────────────────────────────────────

  const handleStartLinksGame = useCallback(async () => {
    if (!code || isStarting) return;
    setIsStarting(true);
    setStartError("");

    try {
      const s = { ...lobby?.settings, ...optimisticSettings };

      // ── Nuke stale arena_state from previous game modes BEFORE calling
      //     the RPC.  The old migration (blacklist) would otherwise "resume"
      //     a Simultaneous 'PICKING' phase and cause "Unknown phase" on the
      //     client.  Once the new migration (whitelist) is applied this is
      //     belt-and-suspenders; until then it is the only thing that works.
      const { error: nullErr } = await supabase
        .from("lobbies")
        .update({ arena_state: null })
        .eq("code", code);
      if (nullErr && import.meta.env.DEV) {
        console.warn("[LINKS] Failed to null stale arena_state:", nullErr.message);
      }

      const { data: sessionResult, error: sessionErr } = await supabase.rpc(
        "start_links_game",
        {
          p_lobby_code: code,
          p_settings: {
            poisonEnabled: s.poisonEnabled !== false,
            roundDuration: s.roundDuration || 60,
            linksLetterCount: s.linksLetterCount || 3,
          },
        }
      );

      if (sessionErr || !sessionResult) {
        if (sessionErr) {
          if (sessionErr.code === "PGRST202" || sessionErr.message?.includes("404") || sessionErr.message?.includes("not found")) {
            const msg = "LINKS database functions not deployed. Run the SQL migration in Supabase SQL Editor: supabase/migrations/20260529000004_links_mode.sql";
            setStartError(msg);
            setIsStarting(false);
            return;
          }
          setStartError(sessionErr.message || "Failed to initialize game session");
        } else {
          setStartError("No response from server — the LINKS database functions may not be deployed. Run the SQL migration in Supabase SQL Editor.");
        }
        setIsStarting(false);
        return;
      }

      if (sessionResult?.success === false) {
        setStartError(sessionResult?.error || "Failed to initialize game session");
        setIsStarting(false);
        return;
      }

      // Update lobby mode + status
      await supabase.from("lobbies").update({
        mode: "LINKS",
        status: "PLAYING",
      }).eq("code", code);

      broadcast("game:start", {});
      navigate(`/play/${code}`);
    } catch (err: any) {
      setStartError(err?.message || "Failed to start LINKS game.");
      setIsStarting(false);
    }
  }, [code, isStarting, lobby, broadcast, navigate]);

  // ── Start LINKS Sprint Game ───────────────────────────────────────────

  const handleStartLinksSprintGame = useCallback(async () => {
    if (!code || isStarting) return;
    setIsStarting(true);
    setStartError("");

    try {
      const s = { ...lobby?.settings, ...optimisticSettings };

      // Nuke stale arena_state before calling RPC
      const { error: nullErr } = await supabase
        .from("lobbies")
        .update({ arena_state: null })
        .eq("code", code);
      if (nullErr && import.meta.env.DEV) {
        console.warn("[SPRINT] Failed to null stale arena_state:", nullErr.message);
      }

      const { data: sessionResult, error: sessionErr } = await supabase.rpc(
        "start_links_sprint_game",
        {
          p_lobby_code: code,
          p_settings: {
            waves: s.sprintWaves || 3,
            waveDuration: s.sprintWaveDuration || 60,
            segmentsPerWave: s.sprintSegments || 1,
          },
        }
      );

      if (sessionErr || !sessionResult) {
        if (sessionErr) {
          if (sessionErr.code === "PGRST202" || sessionErr.message?.includes("404") || sessionErr.message?.includes("not found")) {
            const msg = "LINKS Sprint database functions not deployed. Run the SQL migration in Supabase SQL Editor: supabase/migrations/20260531000000_links_sprint.sql";
            setStartError(msg);
            setIsStarting(false);
            return;
          }
          setStartError(sessionErr.message || "Failed to initialize Sprint game");
        } else {
          setStartError("No response from server — the LINKS Sprint database functions may not be deployed.");
        }
        setIsStarting(false);
        return;
      }

      if (sessionResult?.success === false) {
        setStartError(sessionResult?.error || "Failed to initialize Sprint game");
        setIsStarting(false);
        return;
      }

      // Update lobby mode + status
      await supabase.from("lobbies").update({
        mode: "LINKS_SPRINT",
        status: "PLAYING",
      }).eq("code", code);

      broadcast("game:start", {});
      navigate(`/play/${code}`);
    } catch (err: any) {
      setStartError(err?.message || "Failed to start LINKS Sprint game.");
      setIsStarting(false);
    }
  }, [code, isStarting, lobby, broadcast, navigate]);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = useCallback(async () => {
    setShowLeaveModal(false);
    broadcast("player:leave", { playerId });
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
  }, [code, playerId, isHost, navigate, broadcast]);



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
          <p className="text-sm text-plum/60 font-medium">{t('lobby.loadingLobby')}</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-8 text-center gap-6">
        <div className="text-6xl">🔍</div>
        <h1 className="text-2xl font-outfit font-black text-plum">{t('lobby.lobbyNotFound')}</h1>
        <p className="text-plum/60 max-w-sm">{error}</p>
        <ClayButton variant="primary" onClick={() => navigate("/")}>
          {t('lobby.returnHome')}
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
    <div className="min-h-screen bg-clay-cream flex flex-col overflow-x-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-clay-border/50 bg-warm-white/80 backdrop-blur-sm">
        <button
          onClick={() => setShowLeaveModal(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-plum hover:text-soft-purple transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('lobby.home')}
        </button>

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Phase badge — hidden on very small screens */}
          <span className="hidden sm:inline text-[10px] font-black uppercase tracking-wider text-warm-gray/60 truncate">
            {phase === "MODE_SELECTION" ? t('lobby.chooseMode') : modeLabel}
          </span>

          {/* Connection — compact on mobile */}
          <div className="flex items-center gap-1 text-[10px] font-bold">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-mint" />
            ) : (
              <WifiOff className="w-3 h-3 text-peach" />
            )}
            <span className={`hidden sm:inline ${isConnected ? "text-mint" : "text-peach"}`}>
              {isConnected ? t('lobby.online', { count: players.length }) : t('lobby.offline')}
            </span>
          </div>

          <button
            onClick={() => setShowLeaveModal(true)}
            className="flex items-center gap-1 text-xs font-bold text-peach hover:text-peach/80 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline uppercase tracking-wider">Leave</span>
          </button>
        </div>
      </header>

      {/* ── Active Game Reconnection Banner (hidden when user just left a game) ── */}
      {!fromParamRef.current && ["PLAYING", "READING", "BUZZING", "ANSWERING", "RACE"].includes(lobby?.status) && (
        <div className="shrink-0 px-3 py-2 sm:px-4 sm:py-3 bg-mint-light/80 border-b border-mint/20">
          <div className="flex items-center justify-between max-w-4xl mx-auto gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-mint animate-pulse flex-shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-mint truncate">
                🎮 A game is in progress — you can reconnect!
              </span>
            </div>
            <button
              onClick={() => {
                const ps = lobbyPlayStyle || derivePlayStyle(lobby?.mode, lobby?.settings);
                if (isBuzzer5x5(lobby?.mode, ps) && !isHost) {
                  navigate(`/buzzer/${code}`);
                } else {
                  navigate(`/play/${code}`);
                }
              }}
              className="flex-shrink-0 px-4 py-1.5 rounded-xl bg-mint text-white text-xs font-black uppercase tracking-wider hover:bg-mint/90 transition-colors"
            >
              Rejoin Game
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* ── Left sidebar: Code + Players ──────────────────────────────── */}
        <div className="lg:w-72 xl:w-80 lg:border-r border-b lg:border-b-0 border-clay-border/50 px-3 py-2 sm:px-6 sm:py-4 space-y-2 sm:space-y-4 shrink-0 lg:h-auto">
          {/* Mobile: compact lobby info bar (no horizontal scroll) */}
          <div className="flex lg:hidden items-center gap-3">
            <ClayCard elevation="elevated" padding="sm" className="text-center space-y-0.5 flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-mint-light text-mint text-[9px] font-black tracking-[0.15em] uppercase">
                {isHost ? <Crown className="w-2.5 h-2.5" /> : <Users className="w-2.5 h-2.5" />}
                {isHost ? t('lobby.host') : t('lobby.player')}
              </div>
              <div onClick={handleCopyCode} className="cursor-pointer group select-all" title="Click to copy">
                <span className="text-xl font-outfit font-black text-plum tracking-wide group-hover:text-soft-purple transition-colors">
                  {code}
                </span>
                <span className="text-[10px] font-bold text-warm-gray/60 ml-2">
                  {copied ? '✓' : 'tap to copy'}
                </span>
              </div>
            </ClayCard>

            {/* Players: compact avatar strip — no scroll */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {players.slice(0, 4).map((p, i) => (
                <div key={p.id} className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-clay-cream"
                  style={{
                    border: `2px solid ${p.id === playerId ? "#A78BFA" : i === 0 ? "#FBBF24" : "#D1D5DB"}`,
                    marginLeft: i > 0 ? '-4px' : undefined,
                  }}
                >
                  {p.metadata?.avatar ? (
                    <img
                      src={getAvatar(p.metadata.avatar).src}
                      alt={getAvatar(p.metadata.avatar).label}
                      className="w-5 h-5 object-contain"
                    />
                  ) : (
                    <span className="text-[10px] font-black" style={{
                      color: p.id === playerId ? "#7C5CFC" : i === 0 ? "#D97706" : "#6B7280"
                    }}>
                      {p.name?.[0]?.toUpperCase() || "?"}
                    </span>
                  )}
                </div>
              ))}
              {players.length > 4 && (
                <span className="text-[10px] font-bold text-plum/50 ml-0.5">+{players.length - 4}</span>
              )}
            </div>
          </div>

          {/* Desktop: vertical sidebar layout */}
          <div className="hidden lg:block space-y-4">
          {/* Code card */}
          <ClayCard elevation="elevated" padding="lg" className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-light text-mint text-[10px] font-black tracking-[0.2em] uppercase">
              {isHost ? <Crown className="w-3 h-3" /> : <Users className="w-3 h-3" />}
              {isHost ? t('lobby.host') : t('lobby.player')}
            </div>
            <div onClick={handleCopyCode} className="cursor-pointer group select-all" title="Click to copy">
              <div className="text-4xl sm:text-5xl font-outfit font-black text-plum tracking-wide group-hover:text-soft-purple transition-colors whitespace-nowrap">
                {code}
              </div>
              <div className="text-xs font-bold text-warm-gray/60 mt-1">
                {copied ? t('lobby.codeCopied') : t('lobby.tapToCopy')}
              </div>
            </div>
            {isHost && (
              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-warm-white border border-warm-gray/15 text-xs font-bold text-warm-gray/60 hover:text-plum hover:border-soft-purple/30 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" /> {t('lobby.shareCode')}
              </button>
            )}
          </ClayCard>

          {/* Players card */}
          <ClayCard padding="md">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-plum/50" />
              <h3 className="text-xs font-black uppercase tracking-widest text-plum/60">
                {t('lobby.players')} ({players.length})
              </h3>
            </div>

            {players.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <UserPlus className="w-8 h-8 mx-auto text-warm-gray/40" />
                <p className="text-xs text-warm-gray/60 font-medium">
                  {t('lobby.waitingForPlayers')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                {players.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl">
                    <span className="font-outfit font-black text-xs text-warm-gray/60 w-6 text-center">
                      {getMedal(i + 1)}
                    </span>
                    <div className="relative w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-clay-cream"
                      style={{
                        border: `2px solid ${p.id === playerId ? "#A78BFA" : i === 0 ? "#FBBF24" : "#D1D5DB"}`,
                        boxShadow: `0 0 0 1px #F5F0EB`,
                      }}
                    >
                      {p.metadata?.avatar ? (
                        <img
                          src={getAvatar(p.metadata.avatar).src}
                          alt={getAvatar(p.metadata.avatar).label}
                          className="w-7 h-7 object-contain"
                        />
                      ) : (
                        <span className="text-sm font-black" style={{
                          color: p.id === playerId ? "#7C5CFC" : i === 0 ? "#D97706" : "#6B7280"
                        }}>
                          {p.name?.[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-plum flex-1 truncate">
                      {p.name}
                    </span>
                    {p.id === playerId && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-soft-purple">
                        {t('lobby.you')}
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
        </div>

        {/* ── Right side: Phase-dependent content ────────────────────────── */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden">
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
                  <span className="text-xs text-warm-gray/70 font-medium">
                    Configure categories and start when ready
                  </span>
                ) : (
                  <span className="text-xs text-warm-gray/70 font-medium">
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
                      <span className="text-sm font-bold text-warm-gray/70">
                        Waiting for host to start the game...
                      </span>
                    </div>
                    <p className="text-xs text-plum/60">
                      When the game starts, you'll use the buzz button on your phone.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Simultaneous Multiplayer (5×5 Grid) setup ───────────────── */}
          {phase === "SETUP" && is5x5 && isStandard && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-purple-light text-soft-purple text-[10px] font-black tracking-[0.2em] uppercase">
                  🌐 5×5 Grid Multiplayer
                </div>
                {isHost ? (
                  <span className="text-xs text-warm-gray/70 font-medium">
                    Configure game settings & categories
                  </span>
                ) : (
                  <span className="text-xs text-warm-gray/70 font-medium">
                    Host is setting up the game...
                  </span>
                )}
              </div>

              <SimultaneousSetup
                lobbyCode={code!}
                players={players}
                hostPlayerId={lobby?.host_id}
                hostPlayerName={lobby?.host_name || "Host"}
                playerId={playerId}
                playerName={playerName}
                broadcast={broadcast}
                onBroadcast={onBroadcast}
                updateLobbySetting={updateLobbySetting}
                allCategories={allCategories}
                catsLoading={catsLoading}
                initialSettings={lobby?.settings || {}}
                onStartGame={isHost ? handleStartSimultaneousGame : () => {}}
              />
            </div>
          )}

          {/* ── LINKS setup ─────────────────────────────────────────── */}
          {phase === "SETUP" && lobbyMode === "LINKS" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-light text-mint text-[10px] font-black tracking-[0.2em] uppercase">
                  🔗 LINKS · Vocabulary Duel
                </div>
                {isHost ? (
                  <span className="text-xs text-warm-gray/70 font-medium">
                    Configure LINKS settings
                  </span>
                ) : (
                  <span className="text-xs text-warm-gray/70 font-medium">
                    Host is setting up the game...
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {/* ── Sub-mode picker: Classic vs Sprint + How to Play ──── */}
                <ClayCard padding="md" className="space-y-3">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <h3 className="font-outfit font-black text-plum text-sm">Game Variant</h3>
                    <button
                      onClick={() => setShowHowToPlay(!showHowToPlay)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap ${
                        showHowToPlay
                          ? 'bg-soft-purple text-white shadow-md'
                          : 'bg-warm-gray/5 text-plum/60 hover:bg-soft-purple-light/50 hover:text-soft-purple border border-warm-gray/15'
                      }`}
                    >
                      <span>📖</span>
                      {showHowToPlay ? 'Hide Guide' : 'How to Play'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        if (!isHost) return;
                        optimisticUpdate("linksSubMode", "CLASSIC");
                      }}
                      disabled={!isHost}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        (effectiveSettings.linksSubMode || "CLASSIC") === "CLASSIC"
                          ? "border-soft-purple bg-soft-purple-light/50 shadow-md"
                          : "border-warm-gray/15 bg-warm-white hover:border-soft-purple/30"
                      }`}
                    >
                      <div className="text-xl mb-1">⚔️</div>
                      <div className="font-outfit font-black text-sm text-plum">Classic</div>
                      <div className="text-[10px] text-plum/55 mt-1">Pick letters, set poisons, last-one-standing word duel</div>
                    </button>
                    <button
                      onClick={() => {
                        if (!isHost) return;
                        optimisticUpdate("linksSubMode", "SPRINT");
                      }}
                      disabled={!isHost}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        effectiveSettings.linksSubMode === "SPRINT"
                          ? "border-soft-purple bg-soft-purple-light/50 shadow-md"
                          : "border-warm-gray/15 bg-warm-white hover:border-soft-purple/30"
                      }`}
                    >
                      <div className="text-xl mb-1">⚡</div>
                      <div className="font-outfit font-black text-sm text-plum">Sprint</div>
                      <div className="text-[10px] text-plum/55 mt-1">Computer letters, hidden targets, wave-based pure scoring</div>
                    </button>
                  </div>
                </ClayCard>

                {/* ── Classic-specific: bento grid layout ────────────────── */}
                {(effectiveSettings.linksSubMode || "CLASSIC") === "CLASSIC" && (
                  <>
                    {/* How to Play + Multiplier Reference — collapsible */}
                    {showHowToPlay && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[slideDown_250ms_ease-out]">
                      <ClayCard padding="md" className="space-y-2 sm:col-span-2">
                        <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2">
                          🎯 How LINKS Classic Works
                        </h3>
                        <ul className="text-xs text-plum/65 space-y-1.5 list-none">
                          <li className="flex items-start gap-2">
                            <span className="text-soft-purple font-black text-[10px] mt-0.5">1.</span>
                            <span>The host picks a <strong>letter pool size</strong> (2–6 letters). Each player then picks letters to fill the shared pool.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-soft-purple font-black text-[10px] mt-0.5">2.</span>
                            <span>Type words that include <strong>at least 2 letters</strong> from the pool. The more pool letters you use, the higher your score multiplier.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-soft-purple font-black text-[10px] mt-0.5">3.</span>
                            <span>First to claim a word <strong>locks it</strong> — opponents can't use it. Last player standing wins!</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-soft-purple font-black text-[10px] mt-0.5">☠️</span>
                            <span><strong>Poison mode:</strong> secretly assign a poison letter to each opponent. Hit them with it for a surprise elimination!</span>
                          </li>
                        </ul>
                      </ClayCard>

                      <ClayCard padding="md" className="space-y-2">
                        <h3 className="font-outfit font-black text-plum text-sm">🏆 Score Multiplier</h3>
                        <p className="text-xs text-plum/55 mb-1">More pool letters = bigger bonus</p>
                        <div className="space-y-1">
                          {[{n:'2',m:'1×',c:'text-warm-gray/60'},{n:'3',m:'1.5×',c:'text-soft-purple'},{n:'4',m:'2×',c:'text-soft-purple'},{n:'5',m:'2.5×',c:'text-mint'},{n:'6',m:'3×',c:'text-mint'}].map(({n,m,c}) => (
                            <div key={n} className="flex items-center justify-between px-2 py-1 rounded-lg bg-warm-gray/5">
                              <span className="text-[10px] font-bold text-plum/55">{n} pool letters used</span>
                              <span className={`text-xs font-black ${c}`}>{m}</span>
                            </div>
                          ))}
                        </div>
                      </ClayCard>
                    </div>}

                    {/* Settings bento grid */}
                    <ClayCard padding="lg" className="space-y-5">
                      <h3 className="font-outfit font-black text-plum text-base">⚙️ Classic Settings</h3>

                      <PillSelector
                        label="Letter Pool Size"
                        sublabel="Total letters shared by all players. Each player picks letters to fill it."
                        options={[2,3,4,5,6].map((n) => {
                          const pc = Math.max(players.length, 2);
                          const available = n % pc === 0 || pc % n === 0;
                          return {
                            value: n,
                            label: `${n}`,
                            sublabel: n === 2 ? "Quick" : n === 3 ? "Balanced" : n === 4 ? "Classic" : n === 5 ? "Complex" : "Expert",
                            description: available ? [
                              `2 letters — fast-paced duels with quick word options. Great for beginners.`,
                              `3 letters — the sweet spot. Balanced word variety and strategy.`,
                              `4 letters — the classic experience. Requires creative wordplay.`,
                              `5 letters — complex pool with many possible combinations.`,
                              `6 letters — expert mode. Deep vocabulary knowledge required.`,
                            ][n - 2] : `Not available with ${players.length || 2} players (pool must divide evenly).`,
                            disabled: !available,
                          };
                        })}
                        value={effectiveSettings.linksLetterCount || 3}
                        onChange={(val) => {
                          if (!isHost) return;
                          optimisticUpdate("linksLetterCount", val);
                        }}
                        disabled={!isHost}
                        variant="purple"
                        columns={5}
                      />

                      <PillSelector
                        label="Round Duration"
                        sublabel="How long each round lasts. Shorter = more intense, longer = more words."
                        options={[
                          { value: 30, label: "30s", sublabel: "Blitz", description: "30 seconds — lightning fast! Perfect for quick games and experienced players who think on their feet." },
                          { value: 45, label: "45s", sublabel: "Fast", description: "45 seconds — quick and punchy. Enough time for 3-4 solid words per player." },
                          { value: 60, label: "60s", sublabel: "Standard", description: "60 seconds — the recommended default. Balanced time for strategic play and word discovery." },
                          { value: 90, label: "90s", sublabel: "Relaxed", description: "90 seconds — extra breathing room. Good for larger pools or casual play with friends." },
                          { value: 120, label: "2min", sublabel: "Extended", description: "2 minutes — marathon mode. Best for 5-6 letter pools where finding words takes longer." },
                        ]}
                        value={effectiveSettings.roundDuration || 60}
                        onChange={(val) => {
                          if (!isHost) return;
                          optimisticUpdate("roundDuration", val);
                        }}
                        disabled={!isHost}
                        variant="purple"
                        columns={5}
                      />

                      {/* Poison Mode toggle */}
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-warm-gray/5 border border-warm-gray/10">
                        <div>
                          <h4 className="font-outfit font-bold text-sm text-plum flex items-center gap-2">☠️ Poison Mode</h4>
                          <p className="text-xs text-plum/55 mt-0.5">
                            {                            effectiveSettings.poisonEnabled !== false
                              ? "Each player secretly assigns a poison letter to an opponent. Hit them with it for a surprise elimination!"
                              : "Enable to add a hidden poison letter mechanic — adds bluffing and mind games to each round."
                            }
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (!isHost) return;
                            optimisticUpdate("poisonEnabled", !(effectiveSettings.poisonEnabled !== false));
                          }}
                          className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${
                            effectiveSettings.poisonEnabled !== false ? "bg-soft-purple" : "bg-warm-gray/20"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                              effectiveSettings.poisonEnabled !== false ? "translate-x-6" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    </ClayCard>
                  </>
                )}

                {/* ── Sprint-specific: bento grid layout ────────────────── */}
                {effectiveSettings.linksSubMode === "SPRINT" && (
                  <>
                    {/* How to Play + Shuffle Penalties — collapsible */}
                    {showHowToPlay && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-[slideDown_250ms_ease-out]">
                      <ClayCard padding="md" className="space-y-2 sm:col-span-2">
                        <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2">
                          ⚡ How LINKS Sprint Works
                        </h3>
                        <ul className="text-xs text-plum/65 space-y-1.5 list-none">
                          <li className="flex items-start gap-2">
                            <span className="text-mint font-black text-[10px] mt-0.5">1.</span>
                            <span>Everyone shares the <strong>same computer-assigned letters</strong>. No picking phase — jump straight into word-finding.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-mint font-black text-[10px] mt-0.5">2.</span>
                            <span>Each wave has <strong>5 hidden target words</strong> with escalating bonus points. Hit one for a big score boost!</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-mint font-black text-[10px] mt-0.5">3.</span>
                            <span>Pure scoring, <strong>no elimination</strong>. Highest total score across all waves wins the match.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-mint font-black text-[10px] mt-0.5">🔄</span>
                            <span><strong>Letter Shifts:</strong> optionally, the letter pool changes mid-wave — adapt your strategy on the fly!</span>
                          </li>
                        </ul>
                      </ClayCard>

                      <ClayCard padding="md" className="space-y-2">
                        <h3 className="font-outfit font-black text-peach text-sm">⚠️ Shuffle Penalties</h3>
                        <p className="text-xs text-plum/55 mb-1">Shuffling costs time, points <strong>&amp; target eligibility</strong></p>
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-2 p-2 rounded-lg bg-peach-light/40">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black bg-peach-light text-peach border border-peach/20 shrink-0 mt-0.5">ALL</span>
                            <span className="text-xs text-plum/55">-5s &amp; -25% points (1st), -50% (2nd+). <strong className="text-peach">No target bonuses.</strong></span>
                          </div>
                          <div className="flex items-start gap-2 p-2 rounded-lg bg-butter-light/40">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black bg-butter-light text-butter border border-butter/20 shrink-0 mt-0.5">1</span>
                            <span className="text-xs text-plum/55">-3s &amp; -25% points (every time). <strong className="text-peach">No target bonuses.</strong></span>
                          </div>
                        </div>
                      </ClayCard>
                    </div>}

                    {/* Sprint settings — bento grid */}
                    <ClayCard padding="lg" className="space-y-5">
                      <h3 className="font-outfit font-black text-plum text-base">⚙️ Sprint Settings</h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <PillSelector
                          label="Letters per Wave"
                          sublabel="How many letters everyone shares. More letters = more word options."
                          options={[
                            { value: 2, label: "2", sublabel: "Quick", description: "2 letters — fast and furious. Limited words, maximum creativity needed." },
                            { value: 3, label: "3", sublabel: "Balanced", description: "3 letters — the sweet spot. Good variety without overwhelming word choices." },
                            { value: 4, label: "4", sublabel: "Standard", description: "4 letters — classic sprint. Plenty of combinations for strategic word-hunting." },
                            { value: 5, label: "5", sublabel: "Complex", description: "5 letters — deep pool with many paths. Great for vocabulary enthusiasts." },
                            { value: 6, label: "6", sublabel: "Expert", description: "6 letters — maximum complexity. For players who love a serious challenge." },
                          ]}
                        value={effectiveSettings.sprintLetterCount || 2}
                        onChange={(val) => {
                          if (!isHost) return;
                          optimisticUpdate("sprintLetterCount", val);
                        }}
                          disabled={!isHost}
                          variant="purple"
                          columns={5}
                        />

                        <PillSelector
                          label="Number of Waves"
                          sublabel="Total rounds played. More waves = longer game with more scoring chances."
                          options={[
                            { value: 3, label: "3", sublabel: "Quick", description: "3 waves — a fast sprint. ~3-5 minutes total. Great for quick matches." },
                            { value: 4, label: "4", sublabel: "Standard", description: "4 waves — the standard length. Good balance of variety and pacing." },
                            { value: 5, label: "5", sublabel: "Marathon", description: "5 waves — extended play. More chances to catch up, deeper strategy." },
                          ]}
                        value={effectiveSettings.sprintWaves || 3}
                        onChange={(val) => {
                          if (!isHost) return;
                          optimisticUpdate("sprintWaves", val);
                        }}
                          disabled={!isHost}
                          variant="purple"
                          columns={3}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <PillSelector
                          label="Wave Duration"
                          sublabel="Time per wave. Shorter = more intense, longer = more words per wave."
                          options={[
                            { value: 60, label: "60s", sublabel: "Standard", description: "1 minute — the default. Enough time for 5-8 words per wave. Intense but fair." },
                            { value: 90, label: "90s", sublabel: "Relaxed", description: "1.5 minutes — extra breathing room for careful word selection." },
                            { value: 120, label: "2min", sublabel: "Extended", description: "2 minutes — generous timer. Best for larger letter pools or casual play." },
                            { value: 180, label: "3min", sublabel: "Marathon", description: "3 minutes — marathon waves. Deep strategy with time to explore many words." },
                            { value: 300, label: "5min", sublabel: "Epic", description: "5 minutes — epic waves. For when you want to really dig into each round." },
                          ]}
                        value={effectiveSettings.sprintWaveDuration || 60}
                        onChange={(val) => {
                          if (!isHost) return;
                          optimisticUpdate("sprintWaveDuration", val);
                          // Auto-clamp segments if they exceed the new max
                          const maxShifts = Math.min(5, Math.max(1, Math.floor((val as number) / 30)));
                          if ((effectiveSettings.sprintSegments || 1) > maxShifts) {
                            optimisticUpdate("sprintSegments", maxShifts);
                          }
                        }}
                          disabled={!isHost}
                          variant="purple"
                          columns={5}
                        />

                        <PillSelector
                          label="Letter Shifts per Wave"
                          sublabel="How many times the letter pool changes mid-wave. 1 = no shifts."
                          options={(() => {
                            const waveDuration = effectiveSettings.sprintWaveDuration || 60;
                            const maxShifts = Math.min(5, Math.max(1, Math.floor(waveDuration / 30)));
                            const allOptions = [
                              { value: 1, label: "1", sublabel: "None", description: "1 segment — letters stay the same for the entire wave. Simple and predictable." },
                              { value: 2, label: "2", sublabel: "Mild", description: `2 segments — one mid-wave shift. Each segment ~${Math.floor(waveDuration / 2)}s.` },
                              { value: 3, label: "3", sublabel: "Dynamic", description: `3 segments — two shifts per wave. Each segment ~${Math.floor(waveDuration / 3)}s.` },
                              { value: 4, label: "4", sublabel: "Chaotic", description: `4 segments — letters change frequently. Each segment ~${Math.floor(waveDuration / 4)}s.` },
                              { value: 5, label: "5", sublabel: "Frantic", description: `5 segments — maximum chaos. Each segment ~${Math.floor(waveDuration / 5)}s.` },
                            ];
                            return allOptions.map(opt => ({
                              ...opt,
                              disabled: (opt.value as number) > maxShifts,
                              description: (opt.value as number) > maxShifts
                                ? `Not available with ${waveDuration}s waves (need ≥20s per segment).`
                                : opt.description,
                            }));
                          })()}
                        value={effectiveSettings.sprintSegments || 1}
                        onChange={(val) => {
                          if (!isHost) return;
                          optimisticUpdate("sprintSegments", val);
                        }}
                          disabled={!isHost}
                          variant="purple"
                          columns={5}
                        />
                      </div>
                    </ClayCard>
                  </>
                )}

                {/* Player requirement */}
                <ClayCard padding="md" className="text-center space-y-2">
                  <p className="text-xs text-plum/60">
                    {players.length < 2
                      ? `Need at least 2 players (currently ${players.length})`
                      : `${players.length} player${players.length !== 1 ? "s" : ""} ready`}
                  </p>
                  {players.length < 1 && (
                    <p className="text-[10px] text-peach font-bold">Waiting for players to join...</p>
                  )}
                </ClayCard>

                {/* Start button */}
                {isHost ? (
                  <div className="space-y-2">
                    <ClayButton
                      variant="primary"
                      size="lg"
                      className="w-full"
                      icon={<Play className="w-4 h-4" />}
                      onClick={() => {
                        const subMode = effectiveSettings.linksSubMode || "CLASSIC";
                        if (subMode === "SPRINT") {
                          handleStartLinksSprintGame();
                        } else {
                          handleStartLinksGame();
                        }
                      }}
                      disabled={isStarting || players.length < 2}
                    >
                      {isStarting
                        ? "Starting..."
                        : players.length < 2
                          ? "Need 2+ Players"
                          : (effectiveSettings.linksSubMode || "CLASSIC") === "SPRINT"
                            ? "Start LINKS Sprint"
                            : "Start LINKS Classic"}
                    </ClayButton>
                    {startError && (
                      <p className="text-xs text-peach text-center font-bold">{startError}</p>
                    )}
                  </div>
                ) : (
                  <div className="clay p-5 text-center">
                    <div className="animate-pulse flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-butter" />
                      <span className="text-sm font-bold text-warm-gray/70">
                        Waiting for host to start...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Local setup ──────────────────────────────────────────────── */}
          {phase === "SETUP" && is5x5 && isLocal && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-peach-light text-peach text-[10px] font-black tracking-[0.2em] uppercase">
                  🖥️ Local
                </div>
                <span className="text-xs text-warm-gray/70 font-medium">
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

      {/* ── Leave Confirmation Modal ───────────────────────────────────────────── */}
      <ConfirmModal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onConfirm={handleLeave}
        title="Leave this lobby?"
        message={
          isHost && lobby?.status !== "LOBBY"
            ? "A game is in progress. Leaving will end the game and remove all players."
            : isHost
              ? "You're the host. Leaving will close this lobby for everyone."
              : "You'll be removed from the lobby. You can rejoin later with the same code."
        }
        confirmLabel={isHost && lobby?.status !== "LOBBY" ? "End Game & Leave" : isHost ? "Close & Leave" : "Leave"}
        cancelLabel="Stay"
        variant={isHost && lobby?.status !== "LOBBY" ? "danger" : "default"}
      />
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
            <div className="text-[9px] font-black text-warm-gray/60 uppercase">Rounds</div>
            <div className="font-outfit font-black text-lg text-soft-purple">{rounds}</div>
          </div>
          <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
            <div className="text-[9px] font-black text-warm-gray/60 uppercase">Cats/Rd</div>
            <div className="font-outfit font-black text-lg text-soft-purple">{catsPerRound}</div>
          </div>
          <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
            <div className="text-[9px] font-black text-warm-gray/60 uppercase">Timer</div>
            <div className="font-outfit font-black text-lg text-soft-purple">{timer}s</div>
          </div>
          <div className="bg-warm-white rounded-xl p-2 border border-warm-gray/10">
            <div className="text-[9px] font-black text-warm-gray/60 uppercase">Mode</div>
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
            <p className="text-sm text-warm-gray/70 text-center">
              {players[draftTurnIndex]?.name || "Someone"} is picking...
            </p>
          )}
        </div>
      )}

      {/* Hint */}
      <p className="text-center text-[10px] font-medium text-mint/60">
        🎮 <strong>{playStyle === "BUZZER" ? "Buzzer game" : playStyle === "SIMULTANEOUS" ? "Simultaneous game" : "Game"}</strong>
        {playStyle === "BUZZER"
          ? " — after setup, stay on this screen and press the buzz button when the host opens a question."
          : playStyle === "SIMULTANEOUS"
            ? " — when the game starts, you'll answer questions simultaneously on your device."
            : " — after setup, the host will manage the game."}
      </p>
    </div>
  );
}
