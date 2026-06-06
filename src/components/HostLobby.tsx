import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import {
  Users, Settings2, Play, Crown, Clock, Hash, Zap,
  ChevronRight, Share2, LogOut, ArrowLeft,
  RotateCcw, Loader2,
} from "lucide-react";
import Lobby from "./Lobby";
import { store } from "../lib/storage";
import { GameHeaderButton, GameConnectionBadge } from "./ui";
import LanguageSwitcher from "./ui/LanguageSwitcher";

/**
 * HostLobby — Host entry point for Standard mode.
 *
 * Route: /host/:code
 * Shows lobby settings and delegates to Lobby.tsx.
 */
export default function HostLobby() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode?.toUpperCase();
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

  // ── Mode management ──────────────────────────────────────────────────────

  // ── Start Game — delegates to child component ─────────────────────────────
  const handleStartGame = (settings: any) => {
    // Called by Lobby.tsx (Standard mode).
    // The Lobby component handles the start flow internally via HostDashboard pattern.
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
          <p className="text-white/70 text-sm font-mono">Loading lobby...</p>
        </div>
      </div>
    );
  }

  // ── Render: Error ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-deep-void flex flex-col items-center justify-center text-white p-10 text-center gap-4">
        <h1 className="text-3xl font-orbitron font-black">Lobby Not Found</h1>
        <p className="text-white/70 max-w-md">{error}</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 rounded-xl bg-neon-emerald text-black font-black uppercase tracking-widest"
        >
          Return Home
        </button>
      </div>
    );
  }

  // ── Render: Lobby ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-deep-void relative">
      {/* Shared Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-sm z-40 relative">
        <GameHeaderButton
          variant="ghost"
          icon={<ArrowLeft className="w-3 h-3" />}
          onClick={() => navigate("/")}
        >
          Home
        </GameHeaderButton>

        <div className="flex items-center gap-4">
          <LanguageSwitcher compact variant="dark" />
          {/* Connection Status */}
          <GameConnectionBadge isConnected={isConnected} onlineCount={onlineCount} />

          <GameHeaderButton
            variant="danger"
            icon={<LogOut className="w-3 h-3" />}
            onClick={handleEndGame}
          >
            End Game
          </GameHeaderButton>
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
