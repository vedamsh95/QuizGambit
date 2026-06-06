import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import SimultaneousBoard from "./SimultaneousBoard";
import GameBoard from "./GameBoard";
import PlayerView from "./PlayerView";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { GameHeaderButton, ConfirmModal } from "./ui";
import LanguageSwitcher from "./ui/LanguageSwitcher";

/**
 * GameRoom — Unified entry point for all players (Standard & Arena).
 *
 * Routes:
 *   /play/:code           → auto-detects mode, prompts for name if needed
 *   /play/:code?mode=arena → force Arena mode
 *   /play/:code?mode=standard → force Standard mode
 *
 * Lifecycle:
 *   LOADING → JOIN (prompt name) or PLAY (already joined, reconnecting) or LOBBY (waiting)
 *
 * Sticky Lobby: Players stay in the lobby across multiple games.
 * Only leave when they explicitly click "Leave" or the host deletes the lobby.
 */
export default function GameRoom() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode?.toUpperCase();
  const navigate = useNavigate();

  // ── Phase: loading → join → lobby → play ───────────────────────────────
  const [phase, setPhase] = useState<"loading" | "join" | "lobby" | "play" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [lobby, setLobby] = useState<any>(null);
  const [mode, setMode] = useState<"STANDARD" | "SIMULTANEOUS" | null>(null);
  const [playerName, setPlayerName] = useState(store.getPlayerName());
  const [tempName, setTempName] = useState(playerName);
  const [playerId, setPlayerId] = useState<string>(() => store.ensurePlayerId());
  const [joining, setJoining] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const initialFetchDoneRef = useRef(false);

  // ── Presence: track this player's online status ────────────────────────
  const { isConnected } = useRealtimeChannel({
    channelName: `room:${code}`,
    enablePresence: true,
    presenceData: {
      playerId,
      name: playerName || "Joining...",
      status: "connected" as const,
    },
  });

  // ── Initial fetch: detect lobby mode and player status ──────────────────
  useEffect(() => {
    if (!code || initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;

    const init = async () => {
      setPhase("loading");

      // Fetch lobby
      const { data: lobbyData, error } = await supabase
        .from("lobbies")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (error || !lobbyData) {
        setPhase("error");
        setErrorMessage(error?.message || "Game room not found. Check your code and try again.");
        return;
      }

      setLobby(lobbyData);
      const detectedMode =
        lobbyData.mode === "SIMULTANEOUS" ? "SIMULTANEOUS" : "STANDARD";
      setMode(detectedMode);

      // Check if this player is already registered in the lobby
      const { data: existingPlayers } = await supabase
        .from("players")
        .select("id, name")
        .eq("lobby_code", code);

      const myRecord = existingPlayers?.find((p: any) => p.id === playerId);

      if (myRecord) {
        // Already joined — update name from DB if needed
        if (myRecord.name && myRecord.name !== playerName) {
          setPlayerName(myRecord.name);
          store.setPlayerName(myRecord.name);
        }
      }

      // Determine phase
      const isGameActive =
        ["PLAYING", "READING", "BUZZING", "ANSWERING", "SELECTING", "RACE"].includes(
          lobbyData.status
        );

      if (isGameActive && myRecord) {
        // Game is in progress and player is registered — go straight to play
        setPhase("play");
      } else if (lobbyData.status === "LOBBY" && myRecord) {
        // In lobby, already joined
        setPhase("lobby");
      } else if (!myRecord && !playerName) {
        // New player without name — prompt
        setPhase("join");
      } else {
        // Auto-join if we have a name
        setPhase("join");
      }
    };

    init();
  }, [code, playerId]);

  // ── Subscribe to lobby changes (status transitions) ────────────────────
  useEffect(() => {
    if (!code) return;

    const channel = supabase
      .channel(`gameroom:${code}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lobbies",
          filter: `code=eq.${code}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setLobby(updated);

          // Lobby status changed to active game → switch to play
          if (
            ["PLAYING", "READING", "BUZZING", "ANSWERING", "RACE", "SELECTING"].includes(
              updated.status
            )
          ) {
            setPhase("play");
          }

          // Game returned to lobby (sticky lobby)
          if (updated.status === "LOBBY" && phase === "play") {
            setPhase("lobby");
          }

          // Lobby deleted → go home
          if (!updated || updated.status === "DELETED") {
            navigate("/");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [code, phase]);

  // ── Join action ────────────────────────────────────────────────────────
  const handleJoin = async () => {
    const name = tempName.trim() || playerName;
    if (!name) return;

    setJoining(true);
    store.setPlayerName(name);
    setPlayerName(name);

    // Register or update player in lobby
    const { error } = await supabase.from("players").upsert(
      {
        id: playerId,
        lobby_code: code!,
        name,
        score: 0,
        metadata: {},
      },
      { onConflict: "id" }
    );

    if (error) {
      setErrorMessage("Failed to join. Please try again.");
      setJoining(false);
      return;
    }

    setJoining(false);

    // Navigate to lobby or play based on current state
    if (lobby && ["PLAYING", "READING", "BUZZING", "ANSWERING", "RACE"].includes(lobby.status)) {
      setPhase("play");
    } else {
      setPhase("lobby");
    }
  };

  // ── Handle return from game to lobby (sticky lobby) ────────────────────
  const handleReturnToLobby = () => {
    setPhase("lobby");
  };

  // ── Handle leave ───────────────────────────────────────────────────────
  const handleLeave = async () => {
    setShowLeaveModal(false);
    await supabase
      .from("players")
      .delete()
      .eq("id", playerId)
      .eq("lobby_code", code!);
    navigate(`/lobby/${code}`);
  };

  // ── RENDER: Loading ────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-neon-emerald"></div>
          <p className="text-white/60 text-sm font-mono">Connecting to {code}...</p>
        </div>
      </div>
    );
  }

  // ── RENDER: Error ──────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-deep-void flex flex-col items-center justify-center text-white p-10 text-center gap-4">
        <h1 className="text-3xl font-orbitron font-black">Room Not Found</h1>
        <p className="text-white/60 max-w-md">{errorMessage}</p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 rounded-xl bg-neon-emerald text-black font-black uppercase tracking-widest"
        >
          Return Home
        </button>
      </div>
    );
  }

  // ── RENDER: Join (name input) ──────────────────────────────────────────
  if (phase === "join") {
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center p-6">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher compact variant="dark" />
        </div>
        <div className="glass p-12 rounded-[3rem] max-w-md w-full text-center space-y-8 animate-in zoom-in duration-300">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/20 text-blue-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>

          <div>
            <h2 className="text-2xl font-orbitron font-black text-white mb-2">
              JOIN GAME
            </h2>
            <p className="text-white/60 text-sm">
              Room: <span className="text-neon-emerald font-mono font-bold">{code}</span>
            </p>
            <p className="text-white/40 text-xs mt-1">
              {mode === "SIMULTANEOUS" ? "Simultaneous Mode" : "Standard Mode"}
            </p>
          </div>

          <div className="space-y-3">
            {!playerName ? (
              <input
                placeholder="YOUR NAME"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="w-full bg-black/60 border border-white/10 p-4 rounded-xl text-center font-bold text-sm tracking-widest uppercase focus:border-neon-emerald outline-none text-white placeholder:text-white/20"
                autoFocus
              />
            ) : (
              <div className="text-white/60 text-sm">
                Playing as{" "}
                <span className="text-neon-emerald font-bold">{playerName}</span>
              </div>
            )}
          </div>

          <button
            disabled={!tempName.trim() && !playerName}
            onClick={handleJoin}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {joining ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
            ) : (
              "Enter Room"
            )}
          </button>

          <button
            onClick={() => navigate("/")}
            className="text-white/50 hover:text-white/70 text-xs uppercase tracking-widest transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── RENDER: Lobby (waiting for game to start) ──────────────────────────
  if (phase === "lobby") {
    return (
      <div className="min-h-screen bg-deep-void flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher compact variant="dark" />
        </div>
        <div className="glass p-10 rounded-[3rem] max-w-lg w-full space-y-6">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <div className="w-3 h-3 rounded-full bg-neon-emerald animate-pulse" />
          </div>

          <h2 className="text-2xl font-orbitron font-black text-white">
            YOU'RE IN!
          </h2>
          <p className="text-white/60 text-sm">
            Room <span className="font-mono text-neon-emerald font-bold">{code}</span>{" "}
            is waiting for the host to start the next game.
          </p>

          <div className="flex items-center justify-center gap-2 text-white/50 text-xs">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-neon-emerald" : "bg-red-500"}`}
            />
            {isConnected ? "Connected" : "Reconnecting..."}
          </div>

          <GameHeaderButton
            variant="danger"
            onClick={() => setShowLeaveModal(true)}
          >
            Leave Room
          </GameHeaderButton>
        </div>

        {/* ── Leave Confirmation Modal ───────────────────────────────── */}
        <ConfirmModal
          open={showLeaveModal}
          onClose={() => setShowLeaveModal(false)}
          onConfirm={handleLeave}
          title="Leave this game room?"
          message="You'll be removed from the lobby. You can rejoin later with the same code."
          confirmLabel="Leave"
          cancelLabel="Stay"
          variant="default"
        />
      </div>
    );
  }

  // ── RENDER: Play (in-game) ─────────────────────────────────────────────
  if (phase === "play" && mode) {
    if (mode === "SIMULTANEOUS") {
      return <SimultaneousBoard code={code!} playerId={playerId} playerName={playerName} />;
    }
    // Standard mode — uses GameBoard for host-managed games
    // For standard players, show PlayerView
    return <PlayerView code={code!} name={playerName} />;
  }

  // Fallback (shouldn't reach here)
  return (
    <div className="min-h-screen bg-deep-void flex items-center justify-center text-white/60">
      Loading...
    </div>
  );
}
