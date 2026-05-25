import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import ClayButton from "./ui/ClayButton";
import ClayCard from "./ui/ClayCard";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import {
  Copy,
  Users,
  ArrowLeft,
  Play,
  Crown,
  Wifi,
  WifiOff,
  LogOut,
} from "lucide-react";

export default function GameLobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isHost, setIsHost] = useState(false);
  const playerId = store.ensurePlayerId();
  const playerName = store.getPlayerName();
  const [copied, setCopied] = useState(false);

  // ── Realtime ──────────────────────────────────────────────────────────
  const { isConnected } = useRealtimeChannel({
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

      // Status transition: lobby → playing
      if (["PLAYING", "READING", "BUZZING", "ANSWERING", "RACE"].includes(updated.status)) {
        navigate(`/play/${code}`);
      }
    },
    onPlayerChange: async () => {
      if (!code) return;
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code);
      if (data) setPlayers(data.sort((a: any, b: any) => b.score - a.score));
    },
  });

  // ── Initial Load ──────────────────────────────────────────────────────
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
        setError("Lobby not found. The code may be invalid.");
        setLoading(false);
        return;
      }

      setLobby(lobbyData);
      setIsHost(lobbyData.host_id === playerId);

      const { data: playerData } = await supabase
        .from("players")
        .select("*")
        .eq("lobby_code", code);
      if (playerData) setPlayers(playerData);

      setLoading(false);
    };
    init();
  }, [code, playerId]);

  // ── Join as player (if not host and not registered) ───────────────────
  const hasJoined = useRef(false);
  useEffect(() => {
    if (!code || loading || !playerName || !lobby || hasJoined.current) return;
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
        metadata: { avatar: store.getPlayerAvatar() },
      },
      { onConflict: "id" },
    );
  }, [code, loading, playerName, lobby, playerId, players]);

  // ── Host: Start Game ──────────────────────────────────────────────────
  const handleStartGame = useCallback(async () => {
    if (!code || !isHost) return;
    await supabase
      .from("lobbies")
      .update({ status: "PLAYING" })
      .eq("code", code);

    navigate(`/play/${code}`);
  }, [code, isHost, navigate]);

  // ── Leave ─────────────────────────────────────────────────────────────
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

  // ── Copy code ─────────────────────────────────────────────────────────
  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Format code as ABC-DEF ────────────────────────────────────────────
  const formattedCode = code
    ? `${code.slice(0, 3)}-${code.slice(3, 6)}`
    : "";

  // ── Loading state ─────────────────────────────────────────────────────
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

  // ── Error state ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-8 text-center gap-6">
        <div className="text-6xl">🔍</div>
        <h1 className="text-2xl font-outfit font-black text-plum">
          Lobby Not Found
        </h1>
        <p className="text-plum/40 max-w-sm">{error}</p>
        <ClayButton variant="primary" onClick={() => navigate("/")}>
          Return Home
        </ClayButton>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-clay-border/50">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-plum/40 hover:text-plum text-xs font-bold uppercase tracking-widest transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Home
        </button>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
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

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-8 max-w-lg mx-auto w-full">
        {/* Code display */}
        <ClayCard
          elevation="elevated"
          padding="lg"
          className="w-full flex flex-col items-center gap-4"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-plum/40">
            {isHost ? "Share this code" : "Room Code"}
          </p>
          <button
            onClick={handleCopy}
            className="group flex flex-col items-center gap-2 cursor-pointer"
          >
            <span className="text-4xl sm:text-5xl font-outfit font-black text-plum tracking-[0.3em] group-hover:scale-105 transition-transform">
              {formattedCode}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-plum/30 group-hover:text-soft-purple transition-colors">
              <Copy className="w-3 h-3" />
              {copied ? "Copied!" : "Click to copy"}
            </span>
          </button>
        </ClayCard>

        {/* Player list */}
        <ClayCard padding="md" className="w-full">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-plum/30" />
            <h3 className="text-xs font-black uppercase tracking-widest text-plum/40">
              Players ({players.length})
            </h3>
          </div>

          {players.length === 0 ? (
            <p className="text-sm text-plum/20 text-center py-6">
              Waiting for players to join...
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {players.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-2 rounded-xl"
                >
                  {/* Avatar circle */}
                  <div
                    className="clay-avatar w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black"
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

        {/* Host controls / Player waiting */}
        <div className="w-full flex flex-col gap-3">
          {isHost ? (
            <ClayButton
              variant="primary"
              size="lg"
              icon={<Play className="w-5 h-5" />}
              onClick={handleStartGame}
              className="w-full"
            >
              Start Game
            </ClayButton>
          ) : (
            <div className="clay p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-butter animate-pulse" />
                <span className="text-sm font-bold text-plum/50">
                  Waiting for host to start the game...
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
