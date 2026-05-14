import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Sparkles,
  Loader2,
  Check,
  ArrowRight,
  Trash2,
  Users,
  Play,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Lobby from "./Lobby";
import GameBoard from "./GameBoard";

export default function HostDashboard() {
  const navigate = useNavigate();
  // 1. Hooks MUST be at the top level, unconditionally.
  const [lobby, setLobby] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameSettings, setGameSettings] = useState<any>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Config for Selection
  const [activeRound, setActiveRound] = useState(1);
  const [selectedCategories, setSelectedCategories] = useState<
    Record<number, any[]>
  >({});

  const [categories, setCategories] = useState<any[]>([]);
  const [draftStatus, setDraftStatus] = useState<any>(null);
  const [draftCount, setDraftCount] = useState(0);

  // Listen for Draft Progress
  useEffect(() => {
    if (isSelecting && gameSettings?.selectionMode === "PLAYER" && lobby) {
      const checkDraft = async () => {
        const { data } = await supabase
          .from("players")
          .select("metadata")
          .eq("lobby_code", lobby.code);
        if (data) {
          const selected = data.filter(
            (p: any) => p.metadata?.lastSelection,
          ).length;
          setDraftCount(selected); // Kept for legacy if needed, but Monitor UI uses derived now
        }
      };
      checkDraft();

      const channel = supabase
        .channel(`host_draft:${lobby.code}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "players",
            filter: `lobby_code=eq.${lobby.code}`,
          },
          () => {
            checkDraft();
          },
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isSelecting, gameSettings, lobby]);

  // Fetch categories when selecting
  useEffect(() => {
    if (isSelecting && lobby) {
      const fetchCats = async () => {
        console.log("[Host] Fetching categories via RPC...");
        const source = gameSettings?.categorySource || "both";
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const hostId = session?.user.id || lobby.host_id;

        const { data, error } = await supabase.rpc("get_available_categories", {
          p_source: source,
          p_host_id: hostId,
        });

        if (data) setCategories(data);
        else if (error) {
          console.error("[Host] RPC Error", error);
          // Fallback
          const { data: fallback } = await supabase
            .from("categories_library")
            .select("*");
          if (fallback) setCategories(fallback);
        }
      };
      fetchCats();
    }
  }, [isSelecting, lobby, gameSettings]);

  // PERSISTENCE: Restore Lobby on Mount
  useEffect(() => {
    const restoreLobby = async () => {
      const storedCode = localStorage.getItem("host_lobby_code");
      if (storedCode) {
        setLoading(true);
        const { data, error } = await supabase
          .from("lobbies")
          .select("*")
          .eq("code", storedCode)
          .single();

        if (data && !error) {
          console.log("[Host] Restored lobby:", data.code);
          setLobby(data);
          setGameSettings(data.settings);

          // Restore state based on lobby status
          if (data.status === "SELECTING") setIsSelecting(true);
          if (data.status === "LOBBY" && data.settings?.round_categories) {
            setGameStarted(true);
          }
          if (["READING", "BUZZING", "ANSWER"].includes(data.status)) {
            setGameStarted(true);
          }
        } else {
          // Invalid Code in storage, create new
          createLobby();
        }
        setLoading(false);
      } else {
        // No code, create new
        createLobby();
      }
    };

    // Only run if no lobby set
    if (!lobby) restoreLobby();
  }, []); // Run once on mount

  const createLobby = async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const host_id = session?.user.id || crypto.randomUUID();

    // Retry up to 5 times if code conflicts
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Math.random().toString(36).substring(2, 6).toUpperCase();

      const { data, error } = await supabase
        .from("lobbies")
        .insert([
          {
            code,
            host_id,
            status: "LOBBY",
            settings: {
              rounds: 5,
              timer: 15,
              hasBuzzer: true,
              categories: 5,
              selectionMode: "HOST",
              categorySource: "both",
            },
          },
        ])
        .select()
        .single();

      if (data) {
        console.log("[Host] Created new lobby:", data.code);
        localStorage.setItem("host_lobby_code", data.code);
        setLobby(data);
        setGameSettings(data.settings);
        setLoading(false);
        return;
      }

      // If conflict (409), retry with new code
      if (error?.code === "23505" || error?.message?.includes("duplicate")) {
        console.log("[Host] Code collision, retrying... attempt:", attempt + 1);
        continue;
      }

      // Other error - break
      console.error("[Host] Lobby creation failed:", error);
      break;
    }
    setLoading(false);
  };

  // End Game - Delete lobby and clear session
  const endGame = async () => {
    if (
      !confirm(
        "Are you sure you want to end this game? All progress will be lost.",
      )
    )
      return;

    setLoading(true);
    if (lobby?.code) {
      // Delete lobby (cascade will handle players, questions, etc.)
      await supabase.from("lobbies").delete().eq("code", lobby.code);
    }

    // Clear localStorage
    localStorage.removeItem("host_lobby_code");

    // Reset state
    setLobby(null);
    setGameSettings(null);
    setGameStarted(false);
    setIsSelecting(false);
    setSelectedCategories({});
    setActiveRound(1);
    setLoading(false);
  };

  // Draft Logic State
  const [draftState, setDraftState] = useState<any>(null);

  // Draft Manager: Listen for Picks & Advance Turns
  useEffect(() => {
    if (!lobby || !gameSettings?.draft?.isActive) return;

    const channel = supabase
      .channel(`draft_manager:${lobby.code}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          filter: `lobby_code=eq.${lobby.code}`,
        },
        async (payload) => {
          const updatedPlayer = payload.new;
          const currentDraft = gameSettings.draft;
          const expectedPlayerId = currentDraft.order[currentDraft.currentIdx];

          // Validate: Is it the correct player's turn? Did they make a NEW selection?
          if (
            updatedPlayer.id === expectedPlayerId &&
            updatedPlayer.metadata?.lastPick
          ) {
            const pick = updatedPlayer.metadata.lastPick;

            // Avoid duplicate processing (optimize by checking if pick is already in history? or just rely on index)
            // We trust the turn system.

            const nextIdx = currentDraft.currentIdx + 1;
            const newPicks = [...(currentDraft.picks || []), pick];
            const isComplete = nextIdx >= currentDraft.order.length;

            const newDraftState = {
              ...currentDraft,
              currentIdx: nextIdx,
              picks: newPicks,
              isComplete,
            };

            // Update Lobby to notify everyone of next turn
            const { error } = await supabase
              .from("lobbies")
              .update({
                settings: { ...gameSettings, draft: newDraftState },
              })
              .eq("code", lobby.code);

            if (!error) {
              setGameSettings((prev: any) => ({
                ...prev,
                draft: newDraftState,
              }));
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lobby, gameSettings]);

  const handleHostStart = async (settings: any) => {
    if (!lobby) return;
    setGameSettings(settings);

    if (settings.selectionMode === "PLAYER") {
      await supabase.from("questions").delete().eq("lobby_code", lobby.code);

      // 1. Fetch Players
      const { data: players } = await supabase
        .from("players")
        .select("id, name")
        .eq("lobby_code", lobby.code);
      if (!players || players.length === 0) {
        alert("No players connected!");
        return;
      }

      // 2. Generate Round-Robin Schedule
      const totalSlots = (settings.rounds || 5) * (settings.categories || 5);
      const schedule: string[] = [];
      let playerIdx = 0;
      while (schedule.length < totalSlots) {
        schedule.push(players[playerIdx].id);
        playerIdx = (playerIdx + 1) % players.length;
      }

      // 3. Initialize Draft State in Lobby
      const draftConfig = {
        isActive: true,
        order: schedule, // Array of Player IDs [P1, P2, P3, P1...]
        currentIdx: 0,
        picks: [], // Array of Categories
        isComplete: false,
        playerNames: players.reduce(
          (acc: any, p: any) => ({ ...acc, [p.id]: p.name }),
          {},
        ),
      };

      const newSettings = { ...settings, draft: draftConfig };
      await supabase
        .from("lobbies")
        .update({
          status: "SELECTING",
          settings: newSettings,
        })
        .eq("code", lobby.code);

      setGameSettings(newSettings);
      setIsSelecting(true);
    } else {
      // HOST Mode
      setIsSelecting(true);
      await supabase
        .from("lobbies")
        .update({ status: "SELECTING" })
        .eq("code", lobby.code);
    }
  };

  const toggleCategory = (cat: any) => {
    // ... (Host Mode logic unchanged) ...
    const roundCats = selectedCategories[activeRound] || [];
    const exists = roundCats.find((c) => c.id === cat.id);

    if (exists) {
      setSelectedCategories((prev) => ({
        ...prev,
        [activeRound]: prev[activeRound].filter((c) => c.id !== cat.id),
      }));
    } else {
      // Limit check per round
      if (roundCats.length >= (gameSettings?.categories || 5)) return;

      // Clone and inject IDs to prevent "All Revealed" bug due to undefined IDs
      const enrichedCat = {
        ...cat,
        data: cat.data?.map((q: any) => ({ ...q, id: crypto.randomUUID() })),
      };

      setSelectedCategories((prev) => ({
        ...prev,
        [activeRound]: [...roundCats, enrichedCat],
      }));
    }
  };

  const finalizeHostSelection = async () => {
    setLoading(true);

    // 1. Clear existing questions
    await supabase.from("questions").delete().eq("lobby_code", lobby.code);

    // 2. Insert new questions
    const questionsToInsert: any[] = [];

    // Prepare Round Mapping strings for Settings
    const roundMapping: Record<number, string[]> = {};

    // Use sequential loop for async SRS handling
    for (const [roundStr, cats] of Object.entries(selectedCategories)) {
      const r = parseInt(roundStr);
      roundMapping[r] = cats.map((c) => c.name);

      for (const cat of cats) {
        if (Array.isArray(cat.data)) {
          // SMART SELECTION: Filter & Balance for 5 questions
          const selectedQuestions = await import("../lib/smartSelection").then(
            (mod) => mod.smartSelectQuestions(cat.data, cat.name),
          );

          selectedQuestions.forEach((q: any) => {
            questionsToInsert.push({
              lobby_code: lobby.code,
              category: cat.name,
              points: q.points,
              question_text: q.question_text,
              answer_text: q.answer_text,
              options: q.options, // Pass options if exist
              q_type: q.q_type || (q.options ? "MCQ" : "NUMERIC"), // Infer/Pass type
              is_revealed: false,
            });
          });
        }
      }
    }

    if (questionsToInsert.length > 0) {
      const { error } = await supabase
        .from("questions")
        .insert(questionsToInsert);
      if (error) {
        console.error("Failed to insert questions", error);
        alert("Error setting up board");
        setLoading(false);
        return;
      }
    }

    // 3. Update Lobby Settings with Round Mapping and Start Game
    const newSettings = { ...gameSettings, round_categories: roundMapping };
    await supabase
      .from("lobbies")
      .update({
        status: "LOBBY",
        settings: newSettings,
      })
      .eq("code", lobby.code);

    setIsSelecting(false);
    setGameStarted(true);
    setGameSettings(newSettings);
    setLoading(false);
  };

  // Helper to finish Player Draft
  const finalizePlayerDraft = async () => {
    setLoading(true);

    // 1. Get Collected Picks from Draft State
    const collectedPicks = gameSettings?.draft?.picks || [];

    if (collectedPicks.length === 0) {
      alert("No categories selected yet!");
      setLoading(false);
      return;
    }

    // 2. Prepare Data (Inject IDs & Map to Rounds)
    const questionsToInsert: any[] = [];
    const roundMapping: Record<number, string[]> = {};

    const catsPerRound = gameSettings?.categories || 5;

    collectedPicks.forEach((cat: any, index: number) => {
      // Determine Round (1-based)
      const roundNum = Math.floor(index / catsPerRound) + 1;
      if (!roundMapping[roundNum]) roundMapping[roundNum] = [];

      roundMapping[roundNum].push(cat.name);

      // Inject IDs for Questions
      if (Array.isArray(cat.data)) {
        cat.data.forEach((q: any) => {
          questionsToInsert.push({
            lobby_code: lobby.code,
            category: cat.name,
            points: q.points,
            question_text: q.question_text,
            answer_text: q.answer_text,
            is_revealed: false,
            id: crypto.randomUUID(), // Ensure valid UUID here too just in case
          });
        });
      }
    });

    // 3. Insert Questions (Delete old first to be safe, though handled in start)
    await supabase.from("questions").delete().eq("lobby_code", lobby.code);

    if (questionsToInsert.length > 0) {
      const { error } = await supabase
        .from("questions")
        .insert(questionsToInsert);
      if (error) console.error("Draft Insert Error", error);
    }

    // 4. Update Settings & Start
    const newSettings = { ...gameSettings, round_categories: roundMapping };

    await supabase
      .from("lobbies")
      .update({
        status: "LOBBY",
        settings: newSettings,
      })
      .eq("code", lobby.code);

    setIsSelecting(false);
    setGameStarted(true);
    setGameSettings(newSettings);
    setLoading(false);
  };

  if (gameStarted) {
    return (
      <GameBoard
        lobbyCode={lobby.code}
        settings={gameSettings}
        initialCategories={selectedCategories}
        onExit={endGame}
      />
    );
  }

  if (isSelecting) {
    // PLAYER DRAFT MONITOR UI
    if (gameSettings?.selectionMode === "PLAYER") {
      const targetCount =
        (gameSettings?.categories || 5) * (gameSettings?.rounds || 5);
      const currentPickCount = gameSettings?.draft?.picks?.length || 0;
      const isReady = currentPickCount >= targetCount;
      const activePlayerId =
        gameSettings?.draft?.order?.[gameSettings?.draft?.currentIdx] || "...";
      const activePlayerName =
        gameSettings?.draft?.playerNames?.[activePlayerId] || "Someone";

      return (
        <div className="min-h-screen bg-deep-void p-8 flex flex-col items-center justify-center gap-8 text-center relative">
          <button
            onClick={() => navigate("/")}
            className="absolute top-6 left-6 text-white/40 hover:text-neon-emerald text-xs uppercase font-bold tracking-widest transition-colors flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-white/10 hover:border-neon-emerald/30"
          >
            <ArrowLeft className="w-3 h-3" /> Home
          </button>
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-xs font-black tracking-[0.3em] uppercase animate-pulse">
              <Users className="w-4 h-4" /> Drafting Phase
            </div>
            <h1 className="text-4xl md:text-6xl font-orbitron font-black text-white uppercase tracking-tighter">
              Players Are Choosing
            </h1>
            <p className="text-white/40 text-sm tracking-widest uppercase max-w-lg mx-auto">
              Waiting for{" "}
              <span className="text-neon-emerald font-bold">
                {activePlayerName}
              </span>{" "}
              to select...
            </p>

            <div className="flex flex-col items-center gap-2 mt-8">
              <div className="text-5xl font-black text-neon-emerald font-orbitron">
                {currentPickCount}{" "}
                <span className="text-white/20 text-3xl">/ {targetCount}</span>
              </div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-white/40">
                Categories Selected
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={finalizePlayerDraft}
              disabled={!isReady}
              className={`px-12 py-5 rounded-2xl font-black text-lg tracking-[0.2em] uppercase transition-all flex items-center gap-4 ${
                isReady
                  ? "bg-white text-black hover:scale-105 active:scale-95 cursor-pointer"
                  : "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
              }`}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              {isReady ? "Launch Operation" : "Waiting for Selections..."}
            </button>
          </div>
        </div>
      );
    }

    // HOST SELECTION UI (Existing)
    const catsPerRound = gameSettings?.categories || 5;
    const roundCount = gameSettings?.rounds || 5;
    const currentRoundCats = selectedCategories[activeRound] || [];
    const isRoundFull = currentRoundCats.length >= catsPerRound;
    return (
      <div className="min-h-screen bg-deep-void p-4 md:p-8 flex flex-col gap-6">
        <button
          onClick={() => navigate("/")}
          className="self-start text-white/40 hover:text-neon-emerald text-xs uppercase font-bold tracking-widest transition-colors flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-white/10 hover:border-neon-emerald/30"
        >
          <ArrowLeft className="w-3 h-3" /> Home
        </button>
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-orbitron font-black text-white">
              MISSION PARAMETERS
            </h1>
            <p className="text-white/40 text-xs font-bold tracking-widest uppercase">
              Configure Round {activeRound} / {roundCount}
            </p>
          </div>
        </header>

        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
          {Array.from({ length: roundCount }).map((_, i) => {
            const r = i + 1;
            const count = selectedCategories[r]?.length || 0;
            const isComplete = count === catsPerRound;
            return (
              <button
                key={r}
                onClick={() => setActiveRound(r)}
                className={`flex-shrink-0 px-6 py-4 rounded-xl border transition-all flex flex-col items-center gap-1 ${
                  activeRound === r
                    ? "bg-neon-emerald text-black border-neon-emerald scale-105 shadow-neon-emerald/20 shadow-lg"
                    : isComplete
                      ? "bg-neon-emerald/10 text-neon-emerald border-neon-emerald/30"
                      : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Round {r}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold">
                    {count}/{catsPerRound}
                  </span>
                  {isComplete && <Check className="w-4 h-4" />}
                </div>
              </button>
            );
          })}

          <button
            disabled={Object.keys(selectedCategories).length < 1}
            onClick={finalizeHostSelection}
            className="ml-auto bg-white text-black px-8 py-3 rounded-xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-2 self-center shrink-0"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Launch
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          {(() => {
            const grouped = categories.reduce(
              (acc, cat) => {
                const main = cat.main_category || "General";
                if (!acc[main]) acc[main] = [];
                acc[main].push(cat);
                return acc;
              },
              {} as Record<string, any[]>,
            );

            return (Object.entries(grouped) as [string, any[]][]).map(
              ([mainCat, subCats]) => (
                <div
                  key={mainCat}
                  className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
                >
                  <h3 className="text-neon-emerald font-black tracking-widest uppercase text-sm mb-4 border-b border-neon-emerald/20 pb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-neon-emerald/50" />
                    {mainCat}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {subCats.map((cat) => {
                      const isSelected = currentRoundCats.find(
                        (c) => c.id === cat.id,
                      );
                      // HostDashboard Badge Logic
                      const isArena =
                        cat.tags?.includes("Arena") ||
                        cat.name.includes("(Arena)");
                      const displayName = cat.name
                        .replace(" (Arena)", "")
                        .trim();

                      return (
                        <div
                          key={cat.id}
                          // ... drag/click handlers ...
                          className={`p-4 rounded-xl border transition-all cursor-pointer group hover:scale-[1.02] active:scale-[0.98] ${
                            isSelected
                              ? "bg-neon-emerald/10 border-neon-emerald/50"
                              : "bg-white/5 border-white/5 hover:border-neon-emerald/30 hover:bg-white/10"
                          }`}
                          onClick={() => toggleCategory(cat)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4
                                  className={`font-bold text-sm uppercase tracking-wider ${isSelected ? "text-neon-emerald" : "text-white"}`}
                                >
                                  {displayName}
                                </h4>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {isArena && (
                                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded uppercase tracking-wider">
                                    Arena
                                  </span>
                                )}
                                {cat.is_global && (
                                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded uppercase tracking-wider">
                                    Global
                                  </span>
                                )}
                                <span className="text-[8px] font-black px-1.5 py-0.5 bg-white/5 text-white/30 border border-white/10 rounded uppercase tracking-wider">
                                  {cat.data?.length || 0} Qs
                                </span>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="absolute top-2 right-2">
                                <Check className="w-3 h-3 text-neon-emerald" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
            );
          })()}
        </div>
      </div>
    );
  }

  if (lobby) {
    return (
      <div className="min-h-screen bg-deep-void">
        <button
          onClick={() => navigate("/")}
          className="fixed top-4 left-4 z-50 text-white/40 hover:text-neon-emerald text-xs uppercase font-bold tracking-widest transition-colors flex items-center gap-2 bg-black/40 px-3 py-2 rounded-lg border border-white/10 hover:border-neon-emerald/30"
        >
          <ArrowLeft className="w-3 h-3" /> Home
        </button>
        <Lobby
          lobbyCode={lobby.code}
          onStartGame={handleHostStart}
          onEndGame={endGame}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-deep-void p-4 relative">
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 text-white/40 hover:text-neon-emerald text-xs uppercase font-bold tracking-widest transition-colors flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-white/10 hover:border-neon-emerald/30"
      >
        <ArrowLeft className="w-3 h-3" /> Home
      </button>
      <button
        onClick={createLobby}
        className="group relative px-12 py-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:scale-105 active:scale-95"
      >
        {loading ? (
          <Loader2 className="w-8 h-8 animate-spin text-neon-emerald mx-auto" />
        ) : (
          <div className="text-center">
            <Sparkles className="w-8 h-8 text-neon-emerald mx-auto mb-4 group-hover:animate-pulse" />
            <span className="block text-2xl font-orbitron font-black text-white mb-2">
              CREATE LOBBY
            </span>
            <span className="text-xs text-white/40 tracking-[0.2em] uppercase group-hover:text-neon-emerald transition-colors">
              Host a new game session
            </span>
          </div>
        )}
      </button>
    </div>
  );
}
