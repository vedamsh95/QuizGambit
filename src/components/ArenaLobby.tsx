import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import {
  Users,
  Copy,
  Play,
  Trophy,
  Settings,
  Clock,
  Layers,
  Hash,
  Shuffle,
  ArrowRight,
  ArrowLeft,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";

import CategoryDraftGrid from "./CategoryDraftGrid";

export default function ArenaLobby() {
  const navigate = useNavigate();

  // Setup State
  const [setupStep, setSetupStep] = useState<"LOADING" | "NAME" | "LOBBY">(
    "LOADING",
  );
  const [hostName, setHostName] = useState(
    () => store.getPlayerName(),
  );

  // Lobby State
  const [lobbyCode, setLobbyCode] = useState("");
  const [players, setPlayers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);

  // Arena Settings State
  interface DraftState {
    isActive: boolean;
    startTime?: number;
    order: string[];
    currentIdx: number;
    picks: any[];
    isComplete: boolean;
    playerNames: Record<string, string>;
  }

  interface ArenaSettings {
    rounds: number;
    categoriesPerRound: number;
    answerTime: number;
    maxPlayers: number;
    categoryFilter: string;
    isMysteryMode: boolean;
    categorySource?: string;
    selectionMode?: string;
    draft?: DraftState;
  }

  const DEFAULT_SETTINGS: ArenaSettings = {
    rounds: 3,
    categoriesPerRound: 3,
    answerTime: 10,
    maxPlayers: 4,
    categoryFilter: "Arena",
    isMysteryMode: false,
    categorySource: "both",
  };

  const [settings, setSettings] = useState<ArenaSettings>(DEFAULT_SETTINGS);

  // FIX #1: Use Ref to avoid stale closures in draft engine
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Track processed picks to prevent double-processing
  const processedPicks = useRef(new Set<number>());

  // FIX #2: Updated fetchCategories to accept filter parameter
  const fetchCategories = async (
    hostId: string,
    source: string,
    filter: string,
  ) => {
    const { data: catData } = await supabase.rpc("get_available_categories", {
      p_source: source,
      p_host_id: hostId,
    });

    if (catData) {
      const arenaCats = catData.filter(
        (c: any) => c.tags?.includes("Arena") || c.main_category === "Arena",
      );
      setCategories(filter === "Arena" ? arenaCats : catData);
    }
  };

  // 1. INITIALIZATION & PERSISTENCE
  useEffect(() => {
    const checkRestore = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // FIX: Use qb_pid (same as PlayerRoute) to ensure Host is recognized as player
      let currentUserId = session?.user.id;
      if (!currentUserId) {
        currentUserId = store.ensurePlayerId();
      }

      setUserId(currentUserId);

      // Try to restore previous session
      const storedCode = store.getArenaHostCode();
      if (storedCode) {
        console.log("[Arena] Attempting to restore lobby:", storedCode);
        const { data: lobbyData, error } = await supabase
          .from("lobbies")
          .select("*")
          .eq("code", storedCode)
          .single();

        if (lobbyData && !error && lobbyData.status !== "FINISHED") {
          // Restore Success
          setLobbyCode(lobbyData.code);
          setSettings(lobbyData.settings || DEFAULT_SETTINGS);
          setSetupStep("LOBBY");

          // FIX #2: Pass filter explicitly to avoid stale state
          fetchCategories(
            currentUserId,
            lobbyData.settings?.categorySource || "both",
            lobbyData.settings?.categoryFilter || "Arena",
          );
          return;
        } else {
          store.clearArenaHostCode();
        }
      }

      setSetupStep("NAME");
    };
    checkRestore();
  }, []);

  // 2. CREATE LOBBY FLOW
  const handleCreateLobby = async () => {
    if (!hostName.trim()) {
      alert("Please enter a Commander Name");
      return;
    }

    store.setPlayerName(hostName);

    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const { error } = await supabase.from("lobbies").insert({
      code,
      host_id: userId,
      status: "LOBBY",
      mode: "ARENA",
      settings: settings,
    });

    if (error) {
      console.error("Lobby Create Error", error);
      alert("Failed to create lobby");
      return;
    }

    // FIX #7: Use upsert to handle refresh/reconnect
    await supabase.from("players").upsert(
      {
        lobby_code: code,
        name: hostName,
        id: userId,
        score: 0,
        metadata: {},
      },
      { onConflict: "id" },
    );

    store.setArenaHostCode(code);
    setLobbyCode(code);

    if (userId)
      fetchCategories(
        userId,
        settings.categorySource || "both",
        settings.categoryFilter,
      );

    setSetupStep("LOBBY");
  };

  // 3. LISTENERS (Players)
  useEffect(() => {
    if (!lobbyCode) return;

    const fetchPlayers = async () => {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", lobbyCode);
      if (data) setPlayers(data);
    };
    fetchPlayers();

    const channel = supabase
      .channel(`arena_lobby:${lobbyCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `lobby_code=eq.${lobbyCode}`,
        },
        async () => {
          const { data } = await supabase
            .from("players")
            .select("*")
            .eq("lobby_code", lobbyCode);
          if (data) setPlayers(data);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lobbyCode]);

  // FIX #5: Add lobby sync subscription + POLLING FALLBACK (critical for cross-network)
  useEffect(() => {
    if (!lobbyCode) return;

    const channel = supabase
      .channel(`arena_lobby_sync:${lobbyCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lobbies",
          filter: `code=eq.${lobbyCode}`,
        },
        (payload) => {
          console.log("[Arena] Lobby sync update received via Realtime");

          const incomingSettings = payload.new.settings as ArenaSettings | null;
          if (!incomingSettings) return;

          // Prevent draft flicker: if DB payload temporarily drops draft while we're in draft flow,
          // keep the richer local draft state.
          const shouldPreserveDraft =
            settingsRef.current?.draft &&
            !incomingSettings?.draft &&
            payload.new.status === "SELECTING";

          const mergedSettings = shouldPreserveDraft
            ? { ...incomingSettings, draft: settingsRef.current.draft }
            : incomingSettings;

          setSettings(mergedSettings || DEFAULT_SETTINGS);
          settingsRef.current = mergedSettings || DEFAULT_SETTINGS;
        },
      )
      .subscribe();

    // CRITICAL: Polling fallback for cross-network reliability
    // Skip during active draft to avoid interference with draft engine
    const settingsPoller = setInterval(async () => {
      // Skip polling during draft (active OR complete) to avoid UI flicker.
      if (
        settingsRef.current?.draft?.isActive ||
        settingsRef.current?.draft?.isComplete
      )
        return;

      const { data } = await supabase
        .from("lobbies")
        .select("settings, status")
        .eq("code", lobbyCode)
        .single();

      if (!data?.settings) return;

      const incomingSettings = data.settings as ArenaSettings;

      // Prevent draft flicker from stale snapshots while lobby is in SELECTING.
      const shouldPreserveDraft =
        settingsRef.current?.draft &&
        !incomingSettings?.draft &&
        data.status === "SELECTING";

      const mergedSettings = shouldPreserveDraft
        ? { ...incomingSettings, draft: settingsRef.current.draft }
        : incomingSettings;

      // Only update if actually changed
      if (
        JSON.stringify(mergedSettings) !== JSON.stringify(settingsRef.current)
      ) {
        console.log("[Arena] Settings update detected via polling");
        setSettings(mergedSettings || DEFAULT_SETTINGS);
        settingsRef.current = mergedSettings || DEFAULT_SETTINGS;
      }
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(settingsPoller);
    };
  }, [lobbyCode]);

  // 4. FIX #1: ROBUST EVENT-DRIVEN DRAFT ENGINE (No settings dependency)
  const isProcessingPick = useRef(false);

  useEffect(() => {
    if (!lobbyCode) return;

    console.log("[DRAFT ENGINE] Starting subscription for:", lobbyCode);

    const draftChannel = supabase
      .channel(`arena_draft_engine:${lobbyCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          filter: `lobby_code=eq.${lobbyCode}`,
        },
        async (payload) => {
          const player = payload.new;
          const currentSettings = settingsRef.current;

          // EARLY GUARDS - before any logging
          if (!currentSettings) return;
          const draft = currentSettings.draft;
          if (!draft || !draft.isActive) return;

          const currentTurnId = draft.order[draft.currentIdx];
          const pickTimestamp = player.metadata?.updatedAt || 0;

          // CHECK 1: Is it the correct player's turn?
          if (player.id !== currentTurnId) return;

          // CHECK 2: Is the pick NEW?
          if (pickTimestamp <= (draft.startTime || 0)) return;

          // CHECK 3: Already processed this exact timestamp?
          if (processedPicks.current.has(pickTimestamp)) return;

          // CHECK 4: Do we have a pick?
          const pick = player.metadata?.lastPick;
          if (!pick) return;

          // CHECK 5: Prevent race condition with processing lock
          if (isProcessingPick.current) {
            console.log(
              "[DRAFT ENGINE] Already processing, skipping duplicate",
            );
            return;
          }

          // CHECK 6: Is this pick already in the list? (extra safety)
          if (draft.picks.some((p: any) => p.id === pick.id)) {
            console.log("[DRAFT ENGINE] Category already picked, ignoring");
            processedPicks.current.add(pickTimestamp);
            return;
          }

          // --- VALID PICK - Start Processing ---
          isProcessingPick.current = true;
          processedPicks.current.add(pickTimestamp);

          console.log(
            `[DRAFT ENGINE] ✅ VALID MOVE: ${player.name} picked ${pick.name}`,
          );

          // EXECUTE TURN
          const nextIdx = draft.currentIdx + 1;
          const isComplete = nextIdx >= draft.order.length;
          const newPicks = [...draft.picks, pick];

          const newSettings = {
            ...currentSettings,
            draft: {
              ...draft,
              picks: newPicks,
              currentIdx: nextIdx,
              isComplete,
              isActive: !isComplete,
            },
          };

          settingsRef.current = newSettings;
          setSettings(newSettings);

          const { error } = await supabase.rpc('merge_lobby_settings', {
            p_lobby_code: lobbyCode,
            p_merge: { draft: newSettings.draft }
          });
          if (error) console.error("[DRAFT ENGINE] DB Write Error:", error);

          // Release lock after DB write completes
          isProcessingPick.current = false;

          if (isComplete) {
            confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(draftChannel);
    };
  }, [lobbyCode]); // Only lobbyCode dependency - uses settingsRef for fresh state

  // Sync Settings changes to DB
  const updateSettings = async (newSettings: ArenaSettings) => {
    setSettings(newSettings);
    settingsRef.current = newSettings;
    if (lobbyCode) {
      // Targeted merge — only writes changed keys, no read-modify-write race
      const { error } = await supabase.rpc('merge_lobby_settings', {
        p_lobby_code: lobbyCode,
        p_merge: newSettings
      });
      if (error) console.error('[Arena] merge_lobby_settings error:', error);
    }
  };

  const updateCategoryControls = async (updates: Partial<ArenaSettings>) => {
    const newSettings = { ...settings, ...updates };
    await updateSettings(newSettings);

    if (userId) {
      await fetchCategories(
        userId,
        newSettings.categorySource || "both",
        newSettings.categoryFilter || "Arena",
      );
    }
  };

  const handleStartDraft = async () => {
    if (players.length < 2) {
      alert("Need at least 2 players!");
      return;
    }

    // Clear processed picks for new draft
    processedPicks.current.clear();

    const totalSlots = settings.rounds * settings.categoriesPerRound;
    const schedule: string[] = [];
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);

    let playerIdx = 0;
    while (schedule.length < totalSlots) {
      schedule.push(shuffledPlayers[playerIdx].id);
      playerIdx = (playerIdx + 1) % shuffledPlayers.length;
    }

    const draftConfig: DraftState = {
      isActive: true,
      startTime: Date.now(),
      order: schedule,
      currentIdx: 0,
      picks: [],
      isComplete: false,
      playerNames: players.reduce(
        (acc: any, p: any) => ({ ...acc, [p.id]: p.name }),
        {},
      ),
    };

    const finalSettings = {
      ...settings,
      draft: draftConfig,
      selectionMode: "PLAYER",
    };

    // Single DB write avoids status/settings race and reduces flicker from rapid updates.
    setSettings(finalSettings);
    settingsRef.current = finalSettings;

    // Write status + settings atomically via separate updates
    await supabase
      .from("lobbies")
      .update({ status: "SELECTING" })
      .eq("code", lobbyCode);
    await supabase.rpc('merge_lobby_settings', {
      p_lobby_code: lobbyCode,
      p_merge: finalSettings
    });
  };

  // RENDER: LOADING
  if (setupStep === "LOADING") {
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-neon-emerald"></div>
      </div>
    );
  }

  // RENDER: NAME INPUT
  if (setupStep === "NAME") {
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center p-6">
        <div className="max-w-md w-full glass p-8 rounded-3xl border border-white/10 space-y-8 animate-in zoom-in">
          <div className="text-center space-y-2">
            <span className="text-neon-emerald text-xs font-black tracking-[0.5em] uppercase">
              Multiplayer PVP
            </span>
            <h1 className="text-4xl font-orbitron font-black text-white italic tracking-tighter">
              THE ARENA
            </h1>
          </div>

          <div className="space-y-4">
            <label className="text-xs text-white/60 font-bold uppercase tracking-wider block">
              Commander Name
            </label>
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Enter your alias..."
              className="w-full bg-black/40 border-2 border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-neon-emerald focus:outline-none transition-colors"
            />
          </div>

          <button
            onClick={handleCreateLobby}
            className="w-full py-4 bg-neon-emerald text-black font-black font-orbitron text-xl rounded-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
          >
            CREATE ARENA <ArrowRight className="w-5 h-5" />
          </button>

          {store.getArenaHostCode() && (
            <button
              onClick={() => {
                store.clearArenaHostCode();
                store.clearArenaHostId();
                window.location.reload();
              }}
              className="w-full text-white/20 hover:text-red-400 text-xs uppercase font-bold tracking-widest transition-colors flex items-center justify-center gap-2"
            >
              <XCircle className="w-3 h-3" /> Clear Saved Session
            </button>
          )}
        </div>
      </div>
    );
  }

  // FIX #4: Guard for userId before rendering draft UI
  if (!userId) {
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-neon-emerald"></div>
        <span className="text-white/40 ml-4">
          Loading Commander Identity...
        </span>
      </div>
    );
  }

  // RENDER: LOBBY & DRAFT
  const currentRound =
    Math.floor(
      (settings.draft?.currentIdx || 0) / settings.categoriesPerRound,
    ) + 1;
  const isDrafting = settings.draft?.isActive;
  const draftComplete = settings.draft?.isComplete;

  return (
    <div className="min-h-screen bg-deep-void p-8 flex flex-col items-center">
      <div className="w-full max-w-6xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2 relative">
          <button
            onClick={() => navigate("/")}
            className="absolute top-0 left-0 text-white/40 hover:text-neon-emerald text-xs uppercase font-bold tracking-widest transition-colors flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg border border-white/10 hover:border-neon-emerald/30"
          >
            <ArrowLeft className="w-3 h-3" /> Home
          </button>
          <span className="text-neon-emerald text-xs font-black tracking-[0.5em] uppercase">
            Multiplayer PVP
          </span>
          <h1 className="text-4xl md:text-6xl font-orbitron font-black text-white italic tracking-tighter">
            THE ARENA
          </h1>

          {/* New Arena Button */}
          <button
            onClick={() => {
              store.clearArenaHostCode();
              store.clearArenaHostId();
              navigate("/arena");
            }}
            className="absolute top-0 right-0 text-white/30 hover:text-red-400 text-xs uppercase font-bold tracking-widest transition-colors flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg border border-white/10 hover:border-red-400/30"
          >
            <XCircle className="w-3 h-3" /> New Arena
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* LEFT: Lobby / Draft Board */}
          <div className="col-span-1 md:col-span-8 space-y-6">
            {/* DRAFTING UI OVERLAY - Show when drafting OR when complete (to show start button) */}
            {isDrafting || draftComplete ? (
              <div className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-6 animate-in fade-in">
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                  <div>
                    <h2 className="text-2xl font-orbitron font-bold text-white">
                      DRAFT PHASE
                    </h2>
                    <p className="text-neon-emerald text-xs font-bold tracking-widest uppercase">
                      Round {currentRound} of {settings.rounds}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-black text-white/20">
                      {settings.draft?.currentIdx || 0} /{" "}
                      {settings.draft?.order?.length}
                    </div>
                    <div className="text-[10px] text-white/40 uppercase">
                      Picks Made
                    </div>
                  </div>
                </div>

                {/* Active Draft Area */}
                <div className="min-h-[300px]">
                  {settings.draft?.order?.[settings.draft?.currentIdx] ===
                  userId ? (
                    /* HOST TURN UI */
                    <div className="bg-black/20 p-4 rounded-2xl border border-neon-emerald/30">
                      <div className="text-neon-emerald font-bold mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-neon-emerald rounded-full animate-ping" />
                        COMMANDER, IT IS YOUR TURN TO CHOOSE
                      </div>
                      <CategoryDraftGrid
                        categories={categories}
                        unavailableIds={
                          new Set(settings.draft.picks.map((p: any) => p.id))
                        }
                        isMysteryMode={settings.isMysteryMode}
                        canPick={true}
                        onSelect={async (cat) => {
                          await supabase
                            .from("players")
                            .update({
                              metadata: {
                                lastPick: cat,
                                updatedAt: Date.now(),
                              },
                            })
                            .eq("id", userId);
                        }}
                      />
                    </div>
                  ) : (
                    /* SPECTATOR / WAITING VIEW */
                    <div className="space-y-4">
                      <div className="text-center py-8 text-white/60">
                        <div className="text-lg font-bold mb-2">
                          WAITING FOR{" "}
                          {settings.draft?.playerNames?.[
                            settings.draft?.order?.[settings.draft?.currentIdx]
                          ] || "PLAYER"}
                          ...
                        </div>
                        <div className="text-xs text-white/40">
                          They are selecting a category
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {settings.draft?.picks?.map(
                          (pick: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-neon-emerald/10 border border-neon-emerald/30 p-3 rounded-xl flex items-center gap-3 animate-in zoom-in"
                            >
                              <div className="w-8 h-8 rounded-full bg-neon-emerald text-black flex items-center justify-center font-bold text-xs">
                                {idx + 1}
                              </div>
                              <div className="overflow-hidden">
                                <div className="text-white text-sm font-bold truncate">
                                  {pick.name}
                                </div>
                                <div className="text-emerald-400 text-[10px] uppercase">
                                  {pick.main_category || "General"}
                                </div>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* HOST ACTION: START SESSION */}
                {settings.draft?.isComplete && (
                  <div className="pt-6 border-t border-white/10 animate-in slide-in-from-bottom-4">
                    <button
                      onClick={async () => {
                        console.log("[ArenaLobby] Starting game via RPC...");
                        const { data, error } = await supabase.rpc(
                          "start_arena_session",
                          {
                            p_lobby_code: lobbyCode,
                          },
                        );

                        if (error) {
                          console.error("[ArenaLobby] RPC failed:", error);
                          alert("Failed to start game: " + error.message);
                          return;
                        }

                        console.log(
                          "[ArenaLobby] RPC result:",
                          data,
                          "- navigating to ArenaBoard...",
                        );
                        navigate(`/play?code=${lobbyCode}&mode=arena`);
                      }}
                      className="w-full py-4 rounded-xl bg-neon-emerald text-black font-orbitron font-black text-xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_30px_rgba(16,185,129,0.4)] flex items-center justify-center gap-3"
                    >
                      <Play className="w-6 h-6 fill-black" />
                      INITIALIZE COMBAT SESSION
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* STANDARD LOBBY UI */
              <>
                {/* Code Display */}
                <div className="bg-white/5 border border-white/10 p-8 rounded-3xl flex flex-col items-center gap-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-5 transition-opacity group-hover:opacity-10">
                    <Trophy className="w-32 h-32 text-white" />
                  </div>

                  <span className="text-white/40 text-xs font-bold tracking-widest uppercase">
                    Arena Access Code
                  </span>
                  <div
                    onClick={() => {
                      navigator.clipboard.writeText(lobbyCode);
                      confetti({
                        particleCount: 30,
                        spread: 50,
                        origin: { y: 0.5 },
                      });
                    }}
                    className="text-6xl md:text-8xl font-black font-orbitron text-white tracking-widest cursor-pointer hover:scale-105 transition-transform"
                  >
                    {lobbyCode}
                  </div>
                  <div className="flex items-center gap-2 text-white/20 text-xs uppercase tracking-widest">
                    <Copy className="w-4 h-4" /> Click to Copy
                  </div>
                </div>

                {/* Player Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {players.map((p) => (
                    <div
                      key={p.id}
                      className="bg-black/40 border border-white/10 p-4 rounded-xl flex items-center gap-3 animate-in zoom-in duration-300"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20">
                        {p.name[0]}
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-white font-bold truncate">
                          {p.name}
                        </div>
                        <div className="text-neon-emerald text-[10px] font-mono tracking-wider">
                          CONNECTED
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Empty Slots */}
                  {Array.from({
                    length: Math.max(0, settings.maxPlayers - players.length),
                  }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="border border-white/5 border-dashed p-4 rounded-xl flex items-center gap-3 opacity-30"
                    >
                      <div className="w-10 h-10 rounded-full bg-white/5" />
                      <div className="h-2 w-20 bg-white/5 rounded" />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* RIGHT COLUMN: Settings Panel */}
          <div className="col-span-1 md:col-span-4 space-y-6">
            <div className="glass p-6 rounded-3xl space-y-6 border border-white/5">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <Settings className="w-5 h-5 text-neon-emerald" />
                <h3 className="font-orbitron font-bold text-white tracking-wider uppercase">
                  Combat Settings
                </h3>
              </div>

              {/* EASY TOPIC SELECTION */}
              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-white font-black uppercase tracking-widest text-xs">
                      Topic Pool
                    </h4>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">
                      {categories.length} topics available
                    </p>
                  </div>
                  <span className="text-neon-emerald text-[10px] font-mono uppercase">
                    Guest Arena
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black tracking-widest text-white/40 uppercase">
                    Source
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "both", label: "All" },
                      { id: "global", label: "Public" },
                      { id: "mine", label: "Mine" },
                    ].map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() =>
                          updateCategoryControls({ categorySource: source.id })
                        }
                        className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${
                          settings.categorySource === source.id
                            ? "bg-neon-emerald text-black border-neon-emerald"
                            : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {source.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black tracking-widest text-white/40 uppercase">
                    Filter
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "Arena", label: "Arena Only" },
                      { id: "All", label: "All Topics" },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() =>
                          updateCategoryControls({ categoryFilter: filter.id })
                        }
                        className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${
                          settings.categoryFilter === filter.id
                            ? "bg-blue-600 text-white border-blue-500"
                            : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ROUNDS SLIDER */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-white/60 font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Rounds
                  </span>
                  <span className="text-neon-emerald font-mono text-lg">
                    {settings.rounds}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={settings.rounds}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      rounds: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-neon-emerald bg-white/10 h-2 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* CATEGORIES SLIDER */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-white/60 font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-2">
                    <Hash className="w-4 h-4" /> Cats / Round
                  </span>
                  <span className="text-neon-emerald font-mono text-lg">
                    {settings.categoriesPerRound}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={settings.categoriesPerRound}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      categoriesPerRound: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-neon-emerald bg-white/10 h-2 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* PLAYERS SLIDER */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-white/60 font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4" /> Max Players
                  </span>
                  <span className="text-neon-pink font-mono text-lg">
                    {settings.maxPlayers}
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="10"
                  step="1"
                  value={settings.maxPlayers}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      maxPlayers: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-neon-pink bg-white/10 h-2 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* TIME SLIDER */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-white/60 font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Answer Time
                  </span>
                  <span className="text-yellow-400 font-mono text-lg">
                    {settings.answerTime}s
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="20"
                  step="1"
                  value={settings.answerTime}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      answerTime: parseInt(e.target.value),
                    })
                  }
                  className="w-full accent-yellow-400 bg-white/10 h-2 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Game Modes */}
              <div className="pt-4 border-t border-white/10">
                <button
                  onClick={() =>
                    updateSettings({
                      ...settings,
                      isMysteryMode: !settings.isMysteryMode,
                    })
                  }
                  className={`w-full p-3 rounded-xl border flex items-center justify-center gap-3 transition-all ${
                    settings.isMysteryMode
                      ? "bg-neon-purple/20 border-neon-purple text-neon-purple shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                      : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                  }`}
                >
                  <Shuffle
                    className={`w-5 h-5 ${settings.isMysteryMode ? "animate-spin-slow" : ""}`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Mystery Mode
                  </span>
                </button>
              </div>

              <button
                onClick={handleStartDraft}
                disabled={isDrafting}
                className={`w-full py-4 text-white font-black font-orbitron tracking-widest rounded-xl transition-all flex items-center justify-center gap-3 ${
                  isDrafting
                    ? "bg-white/5 cursor-not-allowed opacity-50"
                    : "bg-red-600 hover:bg-red-500 shadow-[0_0_30px_rgba(220,38,38,0.5)] hover:shadow-[0_0_50px_rgba(220,38,38,0.8)] hover:scale-[1.02] active:scale-[0.98]"
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                {isDrafting ? "DRAFT IN PROGRESS" : "INITIALIZE PROTOCOL"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
