import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import {
  Users, Settings2, Play, Crown, Clock, Hash, Zap,
  ChevronRight, Share2, LogOut, Wifi, WifiOff, ArrowLeft,
  RotateCcw, Loader2,
} from "lucide-react";
import Lobby from "./Lobby";
import ArenaLobby from "./ArenaLobby";
import { store } from "../lib/storage";

/**
 * HostLobby — Unified host entry point for Standard & Arena modes.
 *
 * Route: /host/:code
 * Auto-detects lobby mode. Shows a toggle to switch modes.
 * Delegates settings/start logic to mode-specific child components.
 */
export default function HostLobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Realtime Channel (Presence + lobby/player subscriptions) ──────────────
  const { broadcast, onBroadcast, presences, isConnected } = useRealtimeChannel({
    channelName: `hostlobby:${code}`,
    enablePresence: true,
    presenceData: { playerId: "host", name: "Host", status: "connected" as const },
    subscribeLobby: code,
    subscribePlayers: code,
    onLobbyChange: (payload: any) => {
      const updated = payload.new;
      if (updated) {
        setLobby((prev: any) => ({ ...prev, ...updated }));
        // If lobby was deleted or status changed to something unexpected
        if (!updated || updated.status === "DELETED") {
          navigate("/");
        }
      }
    },
    onPlayerChange: async () => {
      if (!code) return;
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code);
      if (data) setPlayers(data);
    },
  });

  // ── Initial Fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    const init = async () => {
      setLoading(true);
      const { data: lobbyData, error: lobbyErr } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", code)
        .single();

      if (lobbyErr || !lobbyData) {
        setError("Lobby not found. It may have been deleted.");
        setLoading(false);
        return;
      }

      setLobby(lobbyData);

      // Fetch players
      const { data: playerData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code);
      if (playerData) setPlayers(playerData);

      setLoading(false);
    };
    init();
  }, [code]);

  // ── Broadcast: settings sync ──────────────────────────────────────────────
  useEffect(() => {
    const unsub = onBroadcast("settings:update", (payload: any) => {
      if (payload && lobby) {
        setLobby((prev: any) => ({
          ...prev,
          settings: { ...prev.settings, ...payload },
        }));
      }
    });
    return unsub;
  }, [onBroadcast, lobby]);

  // ── Online count from Presence ────────────────────────────────────────────
  const onlineCount = useMemo(() => {
    const presenceCount = Object.keys(presences).length;
    return presenceCount > 0 ? presenceCount : players.length;
  }, [presences, players.length]);

  // ── Mode Toggle ───────────────────────────────────────────────────────────
  const handleSwitchMode = async (newMode: "STANDARD" | "ARENA") => {
    if (!lobby || !code) return;
    if (lobby.mode === newMode) return;

    await supabase.from("lobbies").update({ mode: newMode }).eq("code", code);
    setLobby((prev: any) => ({ ...prev, mode: newMode }));
  };

  // ── Start Game — delegates to child component ─────────────────────────────
  const handleStartGame = (settings: any) => {
    // This is called by Lobby.tsx (Standard mode).
    // The Lobby component handles the start flow internally via HostDashboard pattern.
    // For Arena mode, ArenaLobby handles its own start flow.
  };

  // ── End Game ──────────────────────────────────────────────────────────────
  const handleEndGame = async () => {
    if (!confirm("End this game and delete the lobby? All progress will be lost.")) return;
    if (code) {
      await supabase.from("lobbies").delete().eq("code", code);
    }
    store.clearHostLobbyCode();
    navigate("/");
  };

  // ── Copy Lobby Code ───────────────────────────────────────────────────────
  const copyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code);
    }
  };

  // ── Render: Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-neon-emerald"></div>
          <p className="text-white/40 text-sm font-mono">Loading lobby...</p>
        </div>
      </div>
    );
  }

  // ── Render: Error ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-deep-void flex flex-col items-center justify-center text-white p-10 text-center gap-4">
        <h1 className="text-3xl font-orbitron font-black">Lobby Not Found</h1>
        <p className="text-white/40 max-w-md">{error}</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 rounded-xl bg-neon-emerald text-black font-black uppercase tracking-widest"
        >
          Return Home
        </button>
      </div>
    );
  }

  // ── Render: Arena Lobby ───────────────────────────────────────────────────
  if (lobby?.mode === "ARENA") {
    return (
      <div className="min-h-screen bg-deep-void relative">
        {/* Shared Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-sm z-40 relative">
          <button
            onClick={() => navigate("/")}
            className="text-white/40 hover:text-neon-emerald text-xs uppercase font-bold tracking-widest transition-colors flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-white/10 hover:border-neon-emerald/30"
          >
            <ArrowLeft className="w-3 h-3" /> Home
          </button>

          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs">
              {isConnected ? (
                <Wifi className="w-3 h-3 text-neon-emerald" />
              ) : (
                <WifiOff className="w-3 h-3 text-red-500" />
              )}
              <span className={`font-bold uppercase tracking-wider ${isConnected ? "text-neon-emerald" : "text-red-500"}`}>
                {isConnected ? `${onlineCount} online` : "Reconnecting..."}
              </span>
            </div>

            {/* Mode Toggle */}
            <div className="flex p-1 bg-white/5 rounded-xl">
              <button
                onClick={() => handleSwitchMode("STANDARD")}
                className="px-4 py-2 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all text-white/40 hover:text-white"
              >
                Standard
              </button>
              <button
                onClick={() => handleSwitchMode("ARENA")}
                className="px-4 py-2 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all bg-red-500/10 text-red-500 border border-red-500/20"
              >
                Arena
              </button>
            </div>

            <button
              onClick={handleEndGame}
              className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all"
            >
              <LogOut className="w-4 h-4" /> End Game
            </button>
          </div>
        </header>

        {/* Delegates to existing ArenaLobby — it handles its own state from localStorage */}
        <ArenaLobby />
      </div>
    );
  }

  // ── Render: Standard Lobby ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-deep-void relative">
      {/* Shared Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-sm z-40 relative">
        <button
          onClick={() => navigate("/")}
          className="text-white/40 hover:text-neon-emerald text-xs uppercase font-bold tracking-widest transition-colors flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg border border-white/10 hover:border-neon-emerald/30"
        >
          <ArrowLeft className="w-3 h-3" /> Home
        </button>

        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-neon-emerald" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-500" />
            )}
            <span className={`font-bold uppercase tracking-wider ${isConnected ? "text-neon-emerald" : "text-red-500"}`}>
              {isConnected ? `${onlineCount} online` : "Reconnecting..."}
            </span>
          </div>

          {/* Mode Toggle */}
          <div className="flex p-1 bg-white/5 rounded-xl">
            <button
              className="px-4 py-2 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all bg-neon-emerald/20 text-neon-emerald border border-neon-emerald/30"
            >
              Standard
            </button>
            <button
              onClick={() => handleSwitchMode("ARENA")}
              className="px-4 py-2 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all text-white/40 hover:text-white"
            >
              Arena
            </button>
          </div>

          <button
            onClick={handleEndGame}
            className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all"
          >
            <LogOut className="w-4 h-4" /> End Game
          </button>
        </div>
      </header>

      {/* Delegates to existing Lobby.tsx */}
      {code && (
        <Lobby
          lobbyCode={code}
          onStartGame={handleStartGame}
          onEndGame={handleEndGame}
        />
      )}
    </div>
  );
}
