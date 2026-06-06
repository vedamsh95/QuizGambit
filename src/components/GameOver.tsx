import { useEffect, useState, useMemo } from "react";
import {
  Trophy, Medal, Play, RotateCcw, Clock, Target, Zap, ArrowLeft,
  Flame, Star, TrendingUp, Swords, Sparkles,
} from "lucide-react";
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
  playerId?: string;
  onPlayAgain?: () => void;
  onLeave?: () => void;
  onNewGame?: () => void;
}

// ── Awards ──────────────────────────────────────────────────────────────────

interface Award {
  icon: React.ReactNode;
  title: string;
  playerName: string;
  playerId: string;
  description: string;
  color: string;
}

function computeAwards(players: PlayerResult[]): Award[] {
  if (players.length < 2) return [];
  const awards: Award[] = [];

  // Champion
  const champion = players[0];
  awards.push({
    icon: <Trophy className="w-4 h-4" />,
    title: "Champion",
    playerName: champion.name,
    playerId: champion.id,
    description: `${champion.score.toLocaleString()} pts`,
    color: "amber",
  });

  // Speed Demon — fastest average time
  const withTimes = players.filter(p => p.avgTimeMs !== undefined && p.avgTimeMs > 0);
  if (withTimes.length >= 2) {
    const fastest = withTimes.reduce((a, b) => (a.avgTimeMs! < b.avgTimeMs!) ? a : b);
    const slowest = withTimes.reduce((a, b) => (a.avgTimeMs! > b.avgTimeMs!) ? a : b);
    if (fastest.id !== champion.id) {
      awards.push({
        icon: <Zap className="w-4 h-4" />,
        title: "Speed Demon",
        playerName: fastest.name,
        playerId: fastest.id,
        description: `${(fastest.avgTimeMs! / 1000).toFixed(2)}s avg — ${((slowest.avgTimeMs! / fastest.avgTimeMs!)).toFixed(1)}× faster than ${slowest.name}`,
        color: "green",
      });
    }
  }

  // Sharpshooter — highest accuracy
  const withAccuracy = players.filter(p => p.totalAnswers !== undefined && p.totalAnswers! > 0);
  if (withAccuracy.length >= 2) {
    const sharpest = withAccuracy.reduce((a, b) => {
      const accA = a.correctAnswers! / a.totalAnswers!;
      const accB = b.correctAnswers! / b.totalAnswers!;
      return accA > accB ? a : b;
    });
    if (sharpest.id !== champion.id && sharpest.id !== (awards[1]?.playerId)) {
      const acc = Math.round((sharpest.correctAnswers! / sharpest.totalAnswers!) * 100);
      awards.push({
        icon: <Target className="w-4 h-4" />,
        title: "Sharpshooter",
        playerName: sharpest.name,
        playerId: sharpest.id,
        description: `${acc}% accuracy (${sharpest.correctAnswers}/${sharpest.totalAnswers})`,
        color: "sky",
      });
    }
  }

  // Streak Master — best streak
  const withStreaks = players.filter(p => p.bestStreak !== undefined && p.bestStreak > 0);
  if (withStreaks.length >= 1) {
    const streaker = withStreaks.reduce((a, b) => (a.bestStreak! > b.bestStreak!) ? a : b);
    if (streaker.id !== champion.id && streaker.id !== (awards[1]?.playerId) && streaker.id !== (awards[2]?.playerId)) {
      awards.push({
        icon: <Flame className="w-4 h-4" />,
        title: "Streak Master",
        playerName: streaker.name,
        playerId: streaker.id,
        description: `${streaker.bestStreak} answer streak`,
        color: "orange",
      });
    }
  }

  // Dark Horse — last place surpassed expectations
  if (players.length >= 3) {
    const last = players[players.length - 1];
    const secondLast = players[players.length - 2];
    const gapPct = secondLast.score > 0 ? Math.round((1 - last.score / secondLast.score) * 100) : 0;
    if (gapPct < 15 && last.score > 0) {
      awards.push({
        icon: <TrendingUp className="w-4 h-4" />,
        title: "Close Call",
        playerName: last.name,
        playerId: last.id,
        description: `Only ${secondLast.score - last.score} pts behind #${players.length - 1}`,
        color: "slate",
      });
    }
  }

  return awards;
}

// ── Roasts ──────────────────────────────────────────────────────────────────

interface Roast {
  icon: React.ReactNode;
  text: string;
  color: string;
}

function computeRoasts(players: PlayerResult[], currentPlayerId?: string): Roast[] {
  if (players.length < 2) return [];
  const roasts: Roast[] = [];

  const champion = players[0];
  const runnerUp = players[1];

  // Gap between 1st and 2nd
  const gap = champion.score - runnerUp.score;
  if (gap <= 100 && runnerUp.score > 0) {
    roasts.push({
      icon: <Swords className="w-4 h-4" />,
      text: `Photo finish! ${champion.name} beat ${runnerUp.name} by just ${gap} pts — ${runnerUp.name} is fuming 😤`,
      color: "amber",
    });
  } else if (gap >= 1000) {
    roasts.push({
      icon: <Sparkles className="w-4 h-4" />,
      text: `${champion.name} absolutely dominated — ${gap.toLocaleString()} pts ahead of the pack 👑`,
      color: "amber",
    });
  }

  // Speed roast
  const withTimes = players.filter(p => p.avgTimeMs !== undefined && p.avgTimeMs > 0);
  if (withTimes.length >= 2) {
    const fastest = withTimes.reduce((a, b) => (a.avgTimeMs! < b.avgTimeMs!) ? a : b);
    const slowest = withTimes.reduce((a, b) => (a.avgTimeMs! > b.avgTimeMs!) ? a : b);
    const ratio = slowest.avgTimeMs! / fastest.avgTimeMs!;
    if (ratio >= 2 && slowest.id !== fastest.id) {
      roasts.push({
        icon: <Clock className="w-4 h-4" />,
        text: `${fastest.name} lightning-fast ⚡ — ${ratio.toFixed(1)}× quicker than ${slowest.name}`,
        color: "green",
      });
    }
  }

  // Accuracy roast
  const withAccuracy = players.filter(p => p.totalAnswers !== undefined && p.totalAnswers! > 0);
  if (withAccuracy.length >= 2) {
    const best = withAccuracy.reduce((a, b) => {
      return (a.correctAnswers! / a.totalAnswers!) > (b.correctAnswers! / b.totalAnswers!) ? a : b;
    });
    const worst = withAccuracy.reduce((a, b) => {
      return (a.correctAnswers! / a.totalAnswers!) < (b.correctAnswers! / b.totalAnswers!) ? a : b;
    });
    if (best.id !== worst.id) {
      const worstAcc = Math.round((worst.correctAnswers! / worst.totalAnswers!) * 100);
      roasts.push({
        icon: <Target className="w-4 h-4" />,
        text: `${worst.name} hit ${worstAcc}% — might need glasses? 🤓`,
        color: "slate",
      });
    }
  }

  // Current player specific roasts
  if (currentPlayerId) {
    const me = players.find(p => p.id === currentPlayerId);
    if (me) {
      const myRank = players.indexOf(me) + 1;
      if (myRank === players.length && players.length >= 3) {
        roasts.push({
          icon: <TrendingUp className="w-4 h-4" />,
          text: `You placed last, but hey — someone's gotta hold down the fort 🏰`,
          color: "slate",
        });
      }
      if (myRank === 2 && gap <= 200) {
        roasts.push({
          icon: <Star className="w-4 h-4" />,
          text: `So close to glory! Just ${gap} pts separated you from the crown 👀`,
          color: "amber",
        });
      }
    }
  }

  return roasts;
}

// ── Component ───────────────────────────────────────────────────────────────

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
  const [expandedAwards, setExpandedAwards] = useState(false);

  // 🎉 Confetti on mount for the winner
  useEffect(() => {
    const winner = players[0];
    if (!winner) return;

    let cancelled = false;
    let rafId = 0;

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

    confetti({
      particleCount: 200,
      spread: 120,
      origin: { x: 0.5, y: 0.4 },
      colors: ["#FFD700", "#10B981", "#34D399", "#ffffff"],
    });

    rafId = requestAnimationFrame(frame);

    // Load detailed stats from DB
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

  const awards = useMemo(() => computeAwards(players), [players]);
  const roasts = useMemo(() => computeRoasts(players, playerId), [players, playerId]);

  if (players.length === 0) {
    return (
      <div className="min-h-screen bg-deep-void flex items-center justify-center text-white/40">
        No game data available.
      </div>
    );
  }

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

  const getAwardColor = (color: string) => {
    switch (color) {
      case "amber": return "border-amber-400/30 bg-amber-400/10";
      case "green": return "border-emerald-400/30 bg-emerald-400/10";
      case "sky": return "border-sky-400/30 bg-sky-400/10";
      case "orange": return "border-orange-400/30 bg-orange-400/10";
      default: return "border-white/10 bg-white/5";
    }
  };

  const getAwardTextColor = (color: string) => {
    switch (color) {
      case "amber": return "text-amber-400";
      case "green": return "text-emerald-400";
      case "sky": return "text-sky-400";
      case "orange": return "text-orange-400";
      default: return "text-white/40";
    }
  };

  return (
    <div className="min-h-screen bg-deep-void flex flex-col items-center justify-center p-4 sm:p-6 gap-6 pb-24 overflow-y-auto">
      {/* Hero Section */}
      <div className="text-center space-y-3 animate-in fade-in duration-500">
        <Trophy className="w-14 h-14 sm:w-16 sm:h-16 text-yellow-400 mx-auto drop-shadow-[0_0_30px_rgba(250,204,21,0.4)]" />
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-orbitron font-black text-white tracking-tighter">
          GAME OVER
        </h1>
        <p className="text-white/30 text-xs sm:text-sm tracking-[0.3em] uppercase">
          {isCurrentPlayerWinner ? "VICTORY IS YOURS!" : "The battle has concluded"}
        </p>
      </div>

      {/* Winner Spotlight */}
      {winner && (
        <div className="glass p-6 sm:p-8 rounded-[2.5rem] max-w-lg w-full text-center border border-yellow-400/20 animate-in zoom-in-95 duration-500 delay-200">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-yellow-400/30 to-yellow-600/10 border-2 border-yellow-400/50 flex items-center justify-center mx-auto mb-3 shadow-[0_0_40px_rgba(250,204,21,0.2)]">
            <span className="text-2xl sm:text-3xl font-orbitron font-black text-yellow-400 drop-shadow-md">
              {winner.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="text-[9px] sm:text-[10px] font-black text-yellow-400/60 uppercase tracking-[0.4em] mb-1">
            Champion
          </div>
          <h2 className="text-xl sm:text-2xl font-orbitron font-black text-white mb-1">
            {winner.name}
          </h2>
          <div className="text-3xl sm:text-4xl font-orbitron font-black text-yellow-400 tracking-tight">
            {winner.score.toLocaleString()} pts
          </div>
          {statsLoading && (
            <div className="mt-2 text-white/20 text-xs animate-pulse">Loading stats...</div>
          )}
          {/* Quick gap info */}
          {players.length >= 2 && (
            <p className="text-[10px] text-white/30 mt-2 font-bold">
              {winner.score - players[1].score > 0
                ? `${(winner.score - players[1].score).toLocaleString()} pts ahead of ${players[1].name}`
                : "Tied for 1st!"}
            </p>
          )}
        </div>
      )}

      {/* Full Leaderboard */}
      <div className="w-full max-w-lg space-y-2 animate-in fade-in duration-500 delay-300">
        <h3 className="text-white/30 text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-3 px-2">
          <Medal className="w-4 h-4" /> Final Standings
        </h3>

        {players.map((p, idx) => {
          const isMe = p.id === playerId;
          const medal = getRankIcon(idx);
          const gapToAbove = idx > 0 ? players[idx - 1].score - p.score : 0;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-4 p-3 sm:p-4 rounded-2xl border transition-all ${getMedalBg(idx)} ${isMe ? "ring-1 ring-neon-emerald/50" : ""}`}
            >
              {/* Rank */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center font-orbitron font-black text-sm shrink-0">
                {medal || (idx + 1)}
              </div>

              {/* Name & Stats */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm truncate ${idx === 0 ? "text-yellow-400" : "text-white"}`}>
                    {p.name}
                  </span>
                  {isMe && (
                    <span className="text-[7px] sm:text-[8px] font-black px-1.5 py-0.5 rounded bg-neon-emerald/20 text-neon-emerald border border-neon-emerald/30 uppercase tracking-wider shrink-0">
                      You
                    </span>
                  )}
                </div>
                {p.totalAnswers !== undefined && (
                  <div className="flex items-center gap-3 mt-1 text-white/30 text-[9px] sm:text-[10px] font-mono">
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
                    {p.bestStreak !== undefined && p.bestStreak > 0 && (
                      <span className="flex items-center gap-1">
                        <Flame className="w-3 h-3" />
                        {p.bestStreak}×
                      </span>
                    )}
                  </div>
                )}
                {/* Gap to above */}
                {gapToAbove > 0 && (
                  <p className="text-[8px] text-white/15 mt-0.5">{gapToAbove} pts behind</p>
                )}
              </div>

              {/* Score */}
              <div className="text-right shrink-0">
                <div className={`font-orbitron font-black text-lg sm:text-xl ${getMedalColor(idx)}`}>
                  {p.score.toLocaleString()}
                </div>
                <div className="text-white/20 text-[9px] sm:text-[10px] font-mono">pts</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Awards Section */}
      {awards.length > 1 && (
        <div className="w-full max-w-lg animate-in fade-in duration-500 delay-500">
          <button
            onClick={() => setExpandedAwards(!expandedAwards)}
            className="flex items-center gap-2 text-white/40 hover:text-white/60 transition-colors text-xs font-bold uppercase tracking-widest mb-2 px-2"
          >
            <Star className="w-3.5 h-3.5" />
            Awards ({awards.length})
            <span className="text-[10px]">{expandedAwards ? "▲" : "▼"}</span>
          </button>

          {expandedAwards && (
            <div className="space-y-2">
              {awards.map((award, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl border ${getAwardColor(award.color)} animate-clay-pop`}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <span className={`${getAwardTextColor(award.color)} shrink-0 mt-0.5`}>
                    {award.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-black uppercase tracking-wider ${getAwardTextColor(award.color)}`}>
                      {award.title} — {award.playerName}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">{award.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Roasts */}
      {roasts.length > 0 && (
        <div className="w-full max-w-lg space-y-1.5 animate-in fade-in duration-500 delay-600">
          {roasts.map((roast, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border ${
                roast.color === "amber"
                  ? "border-amber-400/20 bg-amber-400/5 text-amber-400/70"
                  : roast.color === "green"
                    ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-400/70"
                    : "border-white/10 bg-white/5 text-white/30"
              }`}
            >
              {roast.icon}
              <span>{roast.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-2">
        {onPlayAgain && (
          <button
            onClick={onPlayAgain}
            className="px-6 sm:px-8 py-3 sm:py-4 rounded-2xl bg-neon-emerald text-black font-black text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
          >
            <Play className="w-5 h-5 fill-black" />
            Play Again
          </button>
        )}

        {onNewGame && (
          <button
            onClick={onNewGame}
            className="px-6 sm:px-8 py-3 sm:py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
          >
            <RotateCcw className="w-5 h-5" />
            New Game
          </button>
        )}

        {onLeave && (
          <button
            onClick={onLeave}
            className="px-6 sm:px-8 py-3 sm:py-4 rounded-2xl bg-soft-purple/10 hover:bg-soft-purple/20 text-soft-purple border border-soft-purple/30 font-black text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-3"
          >
            <ArrowLeft className="w-5 h-5" />
            Exit to Home
          </button>
        )}
      </div>

      {/* Footer */}
      <p className="text-white/10 text-[9px] sm:text-[10px] tracking-[0.3em] uppercase">
        Room {lobbyCode}
      </p>
    </div>
  );
}
