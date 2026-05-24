import { useEffect, useState } from "react";
import { Trophy, Medal, Home, Play, RotateCcw, Clock, Target, Zap } from "lucide-react";
import confetti from "canvas-confetti";
import { supabase } from "../lib/supabase";

interface PlayerResult {
  id: string;
  name: string;
  score: number;
  correctAnswers?: number;
  totalAnswers?: number;
  avgTimeMs?: number;
  bestStreak?: number;
}

interface GameOverProps {
  lobbyCode: string;
  players: PlayerResult[];
  playerId?: string; // current player, for highlighting
  onPlayAgain?: () => void; // host: return to lobby for new game
  onLeave?: () => void;     // leave and go home
  onNewGame?: () => void;   // host: start fresh lobby
}

export default function GameOver({
  lobbyCode,
  players: initialPlayers,
  playerId,
  onPlayAgain,
  onLeave,
  onNewGame,
}: GameOverProps) {
  const [players, setPlayers] = useState<PlayerResult[]>(
    initialPlayers.sort((a, b) => b.score - a.score)
  );
  const [statsLoading, setStatsLoading] = useState(false);

  // 🎉 Confetti on mount for the winner
  useEffect(() => {
    const winner = players[0];
    if (!winner) return;

    let cancelled = false;
    let rafId = 0;

    // Fire confetti bursts
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      if (cancelled) return;
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.7 },
        colors: ["#FFD700", "#10B981", "#ffffff"],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.7 },
        colors: ["#FFD700", "#10B981", "#ffffff"],
      });

      if (Date.now() < end && !cancelled) {
        rafId = requestAnimationFrame(frame);
      }
    };

    // Big initial burst
    confetti({
      particleCount: 200,
      spread: 120,
      origin: { x: 0.5, y: 0.4 },
      colors: ["#FFD700", "#10B981", "#34D399", "#ffffff"],
    });

    rafId = requestAnimationFrame(frame);

    // Load detailed stats from DB (with cancellation guard)
    const loadStats = async () => {
      if (!lobbyCode || lobbyCode === "LOCAL") return;
      setStatsLoading(true);

      const { data } = await supabase
        .from("arena_answers")
        .select("player_id, player_name, is_correct, answer_time_ms, points_awarded")
        .eq("lobby_code", lobbyCode);

      if (cancelled) return;

      if (data) {
        const enriched = players.map((p) => {
          const playerAnswers = data.filter((a: any) => a.player_id === p.id);
          const correct = playerAnswers.filter((a: any) => a.is_correct).length;
          const avgTime =
            playerAnswers.length > 0
              ? playerAnswers.reduce((sum: number, a: any) => sum + (a.answer_time_ms || 0), 0) /
                playerAnswers.length
              : 0;

          return {
            ...p,
            correctAnswers: correct,
            totalAnswers: playerAnswers.length,
            avgTimeMs: Math.round(avgTime),
          };
        });

        setPlayers(enriched.sort((a, b) => b.score - a.score));
      }

      setStatsLoading(false);
    };

    loadStats();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  const winner = players[0];
  const isCurrentPlayerWinner = winner?.id === playerId;

  if (players.length === 0) {
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center text-white/40">
        No game data available.
      </div>
    );
  }

  // Medal colors
  const getMedalColor = (rank: number) => {
    switch (rank) {
      case 0: return "text-yellow-400";
      case 1: return "text-gray-300";
      case 2: return "text-amber-600";
      default: return "text-white/20";
    }
  };

  const getMedalBg = (rank: number) => {
    switch (rank) {
      case 0: return "bg-yellow-400/10 border-yellow-400/30";
      case 1: return "bg-gray-300/10 border-gray-300/20";
      case 2: return "bg-amber-600/10 border-amber-600/20";
      default: return "bg-white/5 border-white/5";
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 0: return "🥇";
      case 1: return "🥈";
      case 2: return "🥉";
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-deep-void flex flex-col items-center justify-center p-6 gap-8 animate-in fade-in duration-700">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <Trophy className="w-16 h-16 text-yellow-400 mx-auto drop-shadow-[0_0_30px_rgba(250,204,21,0.4)]" />
        <h1 className="text-5xl md:text-7xl font-orbitron font-black text-white tracking-tighter">
          GAME OVER
        </h1>
        <p className="text-white/40 text-sm tracking-[0.3em] uppercase">
          {isCurrentPlayerWinner ? "VICTORY IS YOURS!" : "The battle has concluded"}
        </p>
      </div>

      {/* Winner Spotlight */}
      {winner && (
        <div className="glass p-8 rounded-[3rem] max-w-lg w-full text-center border border-yellow-400/20 animate-in zoom-in-95 duration-500 delay-200">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400/30 to-yellow-600/10 border-2 border-yellow-400/50 flex items-center justify-center mx-auto mb-4 shadow-[0_0_40px_rgba(250,204,21,0.2)]">
            <span className="text-3xl font-orbitron font-black text-yellow-400 drop-shadow-md">
              {winner.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="text-[10px] font-black text-yellow-400/60 uppercase tracking-[0.4em] mb-1">
            Arena Champion
          </div>
          <h2 className="text-2xl font-orbitron font-black text-white mb-1">
            {winner.name}
          </h2>
          <div className="text-4xl font-orbitron font-black text-yellow-400 tracking-tight">
            {winner.score.toLocaleString()} pts
          </div>
          {statsLoading && (
            <div className="mt-2 text-white/20 text-xs animate-pulse">Loading stats...</div>
          )}
        </div>
      )}

      {/* Full Leaderboard */}
      <div className="w-full max-w-lg space-y-2">
        <h3 className="text-white/40 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-3 px-2">
          <Medal className="w-4 h-4" /> Final Standings
        </h3>

        {players.map((p, idx) => {
          const isMe = p.id === playerId;
          const medal = getRankIcon(idx);
          return (
            <div
              key={p.id}
              className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${getMedalBg(idx)} ${isMe ? "ring-1 ring-neon-emerald/50" : ""}`}
            >
              {/* Rank */}
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center font-orbitron font-black text-sm">
                {medal || (idx + 1)}
              </div>

              {/* Name & Stats */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm truncate ${idx === 0 ? "text-yellow-400" : "text-white"}`}>
                    {p.name}
                  </span>
                  {isMe && (
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-neon-emerald/20 text-neon-emerald border border-neon-emerald/30 uppercase tracking-wider">
                      You
                    </span>
                  )}
                </div>
                {p.totalAnswers !== undefined && (
                  <div className="flex items-center gap-3 mt-1 text-white/30 text-[10px] font-mono">
                    <span className="flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      {p.correctAnswers}/{p.totalAnswers}
                    </span>
                    {p.avgTimeMs !== undefined && p.avgTimeMs > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {(p.avgTimeMs / 1000).toFixed(1)}s avg
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Score */}
              <div className="text-right">
                <div className={`font-orbitron font-black text-xl ${getMedalColor(idx)}`}>
                  {p.score.toLocaleString()}
                </div>
                <div className="text-white/20 text-[10px] font-mono">pts</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
        {onPlayAgain && (
          <button
            onClick={onPlayAgain}
            className="px-8 py-4 rounded-2xl bg-neon-emerald text-black font-black text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
          >
            <Play className="w-5 h-5 fill-black" />
            Play Again
          </button>
        )}

        {onNewGame && (
          <button
            onClick={onNewGame}
            className="px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
          >
            <RotateCcw className="w-5 h-5" />
            New Game
          </button>
        )}

        {onLeave && (
          <button
            onClick={onLeave}
            className="px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border border-white/5 font-black text-sm uppercase tracking-widest transition-all flex items-center gap-3"
          >
            <Home className="w-5 h-5" />
            Exit to Home
          </button>
        )}
      </div>

      {/* Subtle footer */}
      <p className="text-white/10 text-[10px] tracking-[0.3em] uppercase">
        Room {lobbyCode}
      </p>
    </div>
  );
}
