import { Trophy, Check, Crown, Zap, HelpCircle, LogOut, Wifi, WifiOff } from "lucide-react";
import { useGameSession } from "../hooks/useGameSession";
import confetti from "canvas-confetti";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import CategoryDraftGrid from "./CategoryDraftGrid";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { store } from "../lib/storage";

interface PlayerViewProps {
  code: string;
  name: string;
}

export default function PlayerView({ code, name }: PlayerViewProps) {
  const navigate = useNavigate();
  const [playerId, setPlayerId] = useState<string>(() => store.ensurePlayerId());
  const [categories, setCategories] = useState<any[]>([]);
  const [categorySelected, setCategorySelected] = useState<any>(null);
  const [lobby, setLobby] = useState<any>(null);

  const { status, buzzedPlayerId, buzz } = useGameSession(code, playerId);
  const [joinError, setJoinError] = useState<string | null>(null);

  // ── Realtime Channel (Broadcast + Presence) ────────────────────────────────
  const { broadcast, onBroadcast, presences, isConnected } = useRealtimeChannel({
    channelName: `standard:${code}`,
    enablePresence: true,
    presenceData: {
      playerId,
      name: name || "Player",
      status: "connected" as const,
    },
    subscribeLobby: code,
    onLobbyChange: (payload: any) => {
      // Handle lobby DELETE (host ended the game)
      if (!payload.new) {
        navigate("/");
        return;
      }
      const updated = payload.new;
      if (updated.status === "PLAYING" && lobby?.settings?.draft?.isComplete) {
        navigate(`/play?code=${code}&mode=arena`);
      }
    },
  });

  // ── Broadcast: buzzer press ────────────────────────────────────────────────
  const handleBuzzWithBroadcast = async () => {
    const success = await buzz();
    if (success) {
      // Broadcast instantly for all clients to see
      broadcast("buzzer:press", { playerId });
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#10B981", "#34D399", "#ffffff"],
      });
    }
  };
  const [canPick, setCanPick] = useState(false);
  const [picksRemaining, setPicksRemaining] = useState(0);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  const [draftStatusText, setDraftStatusText] = useState("");

  const isBuzzed = buzzedPlayerId === playerId;
  const isSomeoneElseBuzzed = buzzedPlayerId && !isBuzzed;

  // (replaced by handleBuzzWithBroadcast above)

  // REGISTER PLAYER ON MOUNT
  useEffect(() => {
    if (!code || !playerId || !name) return;

    const joinLobby = async () => {
      setJoinError(null);

      const { error } = await supabase.from("players").upsert(
        {
          id: playerId,
          lobby_code: code,
          name: name,
          score: 0,
          metadata: {},
        },
        { onConflict: "id" },
      );

      if (error) {
        console.error("Error joining lobby:", error);
        setJoinError(
          `Connection Failed: ${error.message}. Code: ${error.code}`,
        );
      }
    };

    joinLobby();
  }, [code, playerId, name]);

  // ARENA MODE DETECTION: use one authoritative fetch driven by the shared lobby status stream.
  useEffect(() => {
    if (!code) return;

    const checkAndRedirectArena = async () => {
      const { data: lobbyData } = await supabase
        .from("lobbies")
        .select("mode, status, settings")
        .eq("code", code)
        .single();

      if (lobbyData?.mode !== "ARENA") return;

      const isDraftComplete = lobbyData.settings?.draft?.isComplete === true;
      const isGameActive = ["PLAYING", "READING", "RACE"].includes(
        lobbyData.status,
      );

      if (isGameActive || isDraftComplete) {
        console.log(
          "[PlayerView] Arena game ready, redirecting to ArenaBoard. DraftComplete:",
          isDraftComplete,
          "Status:",
          lobbyData.status,
        );
        navigate(`/play?code=${code}&mode=arena`);
      }
    };

    checkAndRedirectArena();
  }, [code, status, navigate]);

  // Load categories if drafting
  useEffect(() => {
    if (status === "SELECTING") {
      const fetchCategories = async () => {
        const { data: lobbyData } = await supabase
          .from("lobbies")
          .select("host_id, settings")
          .eq("code", code)
          .single();

        if (lobbyData) setLobby(lobbyData);
        if (!lobbyData?.host_id) return;

        const categorySource = lobbyData.settings?.categorySource || "both";

        const { data, error } = await supabase.rpc("get_available_categories", {
          p_source: categorySource,
          p_host_id: lobbyData.host_id,
        });

        if (error) {
          console.error("[Player] RPC Error:", error);
        }
        if (data) {
          console.log("[Player] Categories fetched (RPC):", data.length);

          let finalCats = data;
          if (lobbyData.settings?.categoryFilter === "Arena") {
            finalCats = data.filter(
              (c: any) =>
                (c.tags && Array.isArray(c.tags) && c.tags.includes("Arena")) ||
                c.main_category === "Arena",
            );
            console.log("[Player] Filtered for Arena:", finalCats.length);
          }

          setCategories(finalCats);
        }
      };

      fetchCategories();
    }
  }, [status, code]);

  useEffect(() => {
    if (!code || !playerId || status !== "SELECTING") return;

    const checkDraftStatus = (lobbyData: any) => {
      const draft = lobbyData?.settings?.draft;
      if (draft?.isActive) {
        const activePlayerId = draft.order?.[draft.currentIdx];
        const isMyTurn = activePlayerId === playerId;

        setCanPick(isMyTurn);
        setPicksRemaining(isMyTurn ? 1 : 0);

        if (draft.picks) {
          setUnavailableIds(new Set(draft.picks.map((p: any) => p.id)));
        } else {
          setUnavailableIds(new Set());
        }

        // FIX #6: Set proper status text
        if (isMyTurn) {
          setDraftStatusText("YOUR TURN! CHOOSE A CATEGORY");
        } else {
          const activeName =
            draft.playerNames?.[activePlayerId] || "ANOTHER AGENT";
          setDraftStatusText(`WAITING FOR ${activeName}...`);
        }
      } else if (draft?.isComplete) {
        setDraftStatusText("DRAFT COMPLETE! WAITING FOR HOST...");
        setCanPick(false);
      }
    };

    // Initial Fetch
    supabase
      .from("lobbies")
      .select("settings")
      .eq("code", code)
      .single()
      .then(({ data }) => checkDraftStatus(data));

    // Subscribe to Lobby Changes (Turn Updates)
    const channel = supabase
      .channel(`player_draft:${code}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lobbies",
          filter: `code=eq.${code}`,
        },
        (payload) => {
          checkDraftStatus(payload.new);
          setLobby(payload.new);
          if (payload.new.status === "PLAYING") {
            navigate(`/play?code=${code}&mode=arena`);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [status, code, playerId]);

  // FIX #3: Disable picking immediately after selection
  const submitSelection = async (cat: any) => {
    if (!canPick) return;

    // Immediately disable to prevent double-picks
    setCanPick(false);
    setPicksRemaining(0);
    setCategorySelected(cat);
    setUnavailableIds((prev) => new Set(prev).add(cat.id));
    setDraftStatusText("SELECTION SENT! WAITING...");

    await supabase
      .from("players")
      .update({
        metadata: {
          lastPick: cat,
          updatedAt: Date.now(),
        },
      })
      .eq("id", playerId);
  };

  // Selection complete - waiting for others
  if (status === "SELECTING" && categorySelected && !canPick) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-deep-void animate-in fade-in duration-500">
        <div className="w-20 h-20 rounded-full bg-neon-emerald/20 flex items-center justify-center mb-8 border border-neon-emerald/40 animate-bounce">
          <Check className="w-10 h-10 text-neon-emerald" />
        </div>
        <h1 className="text-2xl font-orbitron font-bold text-white mb-2">
          SELECTION LOCKED
        </h1>
        <p className="text-white/40 text-sm">{draftStatusText}</p>
        <div className="mt-8 p-4 bg-neon-emerald/10 border border-neon-emerald/30 rounded-xl">
          <div className="text-neon-emerald font-bold">
            {categorySelected.name}
          </div>
          <div className="text-white/40 text-xs">
            {categorySelected.description}
          </div>
        </div>
      </div>
    );
  }

  // FIX #6: Show proper draft UI with status text
  if (status === "SELECTING") {
    return (
      <div className="min-h-screen bg-deep-void p-6 flex flex-col gap-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-orbitron font-bold text-white">
            {canPick ? "YOUR TURN TO PICK" : draftStatusText}
          </h2>
          {canPick && (
            <p className="text-neon-emerald text-xs font-black uppercase tracking-[0.2em] animate-pulse">
              {picksRemaining} Selection{picksRemaining > 1 ? "s" : ""}{" "}
              Remaining
            </p>
          )}
        </div>

        {canPick ? (
          <CategoryDraftGrid
            categories={categories}
            unavailableIds={unavailableIds}
            isMysteryMode={lobby?.settings?.isMysteryMode || false}
            canPick={canPick && picksRemaining > 0}
            onSelect={submitSelection}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="animate-pulse text-white/40 text-center">
              <div className="w-16 h-16 rounded-full bg-white/10 mx-auto mb-4 flex items-center justify-center">
                <HelpCircle className="w-8 h-8 text-white/40" />
              </div>
              <div className="text-lg font-bold">{draftStatusText}</div>
              <div className="text-xs mt-2">Please wait for your turn...</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative">
      {/* Reconnection Banner */}
      {!isConnected && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-500/10 border-b border-red-500/30 px-4 py-3 flex items-center justify-center gap-3 animate-pulse">
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
      {/* Leave Button */}
      <button
        onClick={async () => {
          if (confirm("Are you sure you want to leave the game?")) {
            broadcast("player:leave", { playerId });
            await supabase
              .from("players")
              .delete()
              .eq("id", playerId)
              .eq("lobby_code", code);
            navigate("/");
          }
        }}
        className="absolute top-4 right-4 p-2 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 transition-all flex items-center gap-1 text-xs"
        title="Leave Game"
      >
        <LogOut className="w-4 h-4" />
        <span>Leave</span>
      </button>

      {/* Connection Status */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs">
        {isConnected ? (
          <Wifi className="w-3 h-3 text-neon-emerald" />
        ) : (
          <WifiOff className="w-3 h-3 text-red-500" />
        )}
        <span className={`font-bold uppercase tracking-wider ${isConnected ? "text-neon-emerald" : "text-red-500"}`}>
          {isConnected ? "Connected" : "Reconnecting..."}
        </span>
      </div>

      <div className="text-center mb-10">
        <h2 className="text-white/40 font-orbitron text-sm tracking-[0.4em] mb-1">
          PLAYER: {name}
        </h2>
        <h1 className="text-white font-bold text-3xl">ROOM: {code}</h1>
      </div>

      <div className="w-full max-w-sm aspect-square relative group">
        <div
          className={`absolute -inset-4 rounded-full blur-[60px] transition-all duration-700 ${
            status === "BUZZING"
              ? "bg-neon-emerald/20 animate-pulse"
              : isBuzzed
                ? "bg-blue-500/40"
                : "bg-white/5"
          }`}
        />

        <button
          disabled={status !== "BUZZING"}
          onClick={handleBuzzWithBroadcast}
          className={`relative w-full h-full rounded-full flex flex-col items-center justify-center transition-all duration-300 border-8 transform active:scale-95 ${
            status === "BUZZING"
              ? "bg-neon-emerald border-black/20 shadow-[0_0_80px_rgba(16,185,129,0.4)]"
              : isBuzzed
                ? "bg-blue-600 border-black/20 text-white"
                : isSomeoneElseBuzzed
                  ? "bg-red-900 border-white/5 opacity-50"
                  : "bg-zinc-900 border-white/5 cursor-not-allowed"
          }`}
        >
          {status === "BUZZING" && (
            <>
              <Zap className="w-20 h-20 text-black fill-black" />
              <span className="text-black font-orbitron font-bold text-4xl mt-4">
                BUZZ!
              </span>
            </>
          )}

          {isBuzzed && (
            <span className="font-orbitron font-bold text-2xl text-white">
              YOUR TURN!
            </span>
          )}

          {isSomeoneElseBuzzed && (
            <span className="text-white/40 font-medium">LOCKED BY OTHERS</span>
          )}

          {status === "READING" && (
            <div className="flex flex-col items-center animate-pulse">
              <div className="w-4 h-4 rounded-full bg-white/40 mb-2"></div>
              <span className="text-white/40 uppercase tracking-widest text-xs">
                Waiting for Open...
              </span>
            </div>
          )}

          {status === "LOBBY" && (
            <span className="text-white/20 uppercase tracking-[0.2em] font-orbitron text-center px-8">
              Host is setting up the board
            </span>
          )}

          {!["BUZZING", "READING", "LOBBY", "SELECTING"].includes(status) && (
            <span className="text-white/20 uppercase tracking-[0.2em] font-orbitron">
              {status}
            </span>
          )}
        </button>
      </div>

      <div className="mt-12 text-center text-white/40 font-medium">
        Keep this window open and wait for the host's signal.
      </div>
    </div>
  );
}
