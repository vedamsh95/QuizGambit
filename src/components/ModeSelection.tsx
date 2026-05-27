import { useState, useCallback } from "react";
import { Zap, Globe, Monitor, Crown, Check, Users, ChevronRight, Lock } from "lucide-react";
import ClayButton from "./ui/ClayButton";

// ── Types ───────────────────────────────────────────────────────────────────

export type GameMode = "BUZZER" | "STANDARD" | "LOCAL";

interface VoteState {
  enabled: boolean;
  votes: Record<string, GameMode>; // playerId → mode
}

interface ModeSelectionProps {
  isHost: boolean;
  playerId: string;
  players: any[];
  lobbyMode: string | null; // null = mode not yet selected
  voteState: VoteState;
  onSelectMode: (mode: GameMode) => void;
  onToggleVoting: (enabled: boolean) => void;
  onVote: (mode: GameMode) => void;
  onLockIn: () => void; // host locks in the winning mode
}

// ── Mode config ─────────────────────────────────────────────────────────────

const MODES: { id: GameMode; label: string; icon: any; description: string; gradient: string; bg: string; ring: string }[] = [
  {
    id: "BUZZER",
    label: "Buzzer Game",
    icon: Zap,
    description: "Players buzz in from their phones. Host picks or draft categories. Fast-paced, competitive.",
    gradient: "from-mint to-emerald-400",
    bg: "bg-mint",
    ring: "ring-mint",
  },
  {
    id: "STANDARD",
    label: "Multiplayer",
    icon: Globe,
    description: "Classic quiz game. Everyone answers on their device. Timed rounds with scoring.",
    gradient: "from-soft-purple to-purple-400",
    bg: "bg-soft-purple",
    ring: "ring-soft-purple",
  },
  {
    id: "LOCAL",
    label: "Local",
    icon: Monitor,
    description: "Play together on this screen. Pass-and-play style. No devices needed.",
    gradient: "from-peach to-orange-400",
    bg: "bg-peach",
    ring: "ring-peach",
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function ModeSelection({
  isHost,
  playerId,
  players,
  lobbyMode,
  voteState,
  onSelectMode,
  onToggleVoting,
  onVote,
  onLockIn,
}: ModeSelectionProps) {
  const [myVote, setMyVote] = useState<GameMode | null>(
    voteState.votes?.[playerId] || null
  );

  // ── Vote counts ──────────────────────────────────────────────────────────

  const voteCounts: Record<GameMode, number> = { BUZZER: 0, STANDARD: 0, LOCAL: 0 };
  Object.values(voteState.votes || {}).forEach((v) => {
    if (voteCounts[v] !== undefined) voteCounts[v]++;
  });
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
  const totalPlayers = players.length;

  // Leader (for highlight)
  const maxVotes = Math.max(...Object.values(voteCounts));
  const leaders = Object.entries(voteCounts)
    .filter(([, c]) => c === maxVotes && c > 0)
    .map(([m]) => m as GameMode);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleVote = useCallback(
    (mode: GameMode) => {
      if (lobbyMode) return; // mode already locked
      setMyVote(mode);
      onVote(mode);
    },
    [lobbyMode, onVote]
  );

  const handleDirectPick = useCallback(
    (mode: GameMode) => {
      if (!isHost || lobbyMode) return;
      onSelectMode(mode);
    },
    [isHost, lobbyMode, onSelectMode]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-xl mx-auto w-full gap-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-soft-purple-light text-soft-purple text-[10px] font-black tracking-[0.2em] uppercase">
          <Crown className="w-3 h-3" />
          Game Mode
        </div>
        <h2 className="font-outfit font-black text-2xl text-plum">
          {lobbyMode ? "Mode Selected" : "Choose a game mode"}
        </h2>
        <p className="text-xs text-warm-gray/50 font-medium max-w-xs mx-auto">
          {lobbyMode
            ? `Playing ${MODES.find((m) => m.id === lobbyMode)?.label || lobbyMode}`
            : isHost
              ? "Pick a mode or let players vote"
              : "Vote for your preferred game mode"}
        </p>
      </div>

      {/* Host voting toggle */}
      {isHost && !lobbyMode && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => onToggleVoting(!voteState.enabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              voteState.enabled
                ? "bg-mint-light text-mint border border-mint/30"
                : "bg-warm-gray/5 text-warm-gray/50 border border-warm-gray/15"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            {voteState.enabled ? "Voting ON" : "Voting OFF"}
            <span className="text-[9px] opacity-60">
              ({voteState.enabled ? "players can vote" : "host picks directly"})
            </span>
          </button>
        </div>
      )}

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {MODES.map((mode) => {
          const isSelected = lobbyMode === mode.id;
          const isLeading = leaders.includes(mode.id);
          const votePct = totalPlayers > 0 ? (voteCounts[mode.id] / totalPlayers) * 100 : 0;

          const canInteract = !lobbyMode && (isHost && !voteState.enabled ? true : voteState.enabled);
          const isClickable = canInteract;

          return (
            <button
              key={mode.id}
              onClick={() => {
                if (!canInteract) return;
                if (isHost && !voteState.enabled) {
                  handleDirectPick(mode.id);
                } else if (voteState.enabled) {
                  handleVote(mode.id);
                }
              }}
              disabled={!isClickable}
              className={`relative p-5 rounded-2xl border-2 text-left transition-all ${
                isSelected
                  ? `bg-gradient-to-br ${mode.gradient} text-white border-transparent shadow-[4px_4px_0px_rgba(166,157,145,0.3)]`
                  : voteState.enabled && myVote === mode.id
                    ? `border-${mode.ring.split("-")[1] || "mint"}/50 bg-${mode.bg.split("-")[1] || "mint"}-light shadow-[2px_2px_0px_rgba(166,157,145,0.15)]`
                    : "bg-warm-white border-warm-gray/15 hover:border-warm-gray/30 hover:-translate-y-0.5"
              } ${isClickable ? "cursor-pointer" : "cursor-default opacity-80"}`}
            >
              {/* Icon */}
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${
                  isSelected
                    ? "bg-white/20"
                    : myVote === mode.id && voteState.enabled
                      ? mode.bg + " text-white"
                      : "bg-warm-gray/10"
                }`}
              >
                <mode.icon className={`w-5 h-5 ${isSelected ? "text-white" : myVote === mode.id && voteState.enabled ? "text-white" : "text-warm-gray/60"}`} />
              </div>

              {/* Label */}
              <h3
                className={`font-outfit font-black text-sm mb-1 ${
                  isSelected ? "text-white" : "text-plum"
                }`}
              >
                {mode.label}
              </h3>

              {/* Description */}
              <p
                className={`text-[10px] font-medium leading-tight ${
                  isSelected ? "text-white/80" : "text-warm-gray/50"
                }`}
              >
                {mode.description}
              </p>

              {/* Vote bar (only when voting is enabled) */}
              {voteState.enabled && !isSelected && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-[9px] font-bold text-warm-gray/40">
                    <span>{voteCounts[mode.id]} vote{voteCounts[mode.id] !== 1 ? "s" : ""}</span>
                    <span>{Math.round(votePct)}%</span>
                  </div>
                  <div className="h-1.5 bg-warm-gray/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isLeading ? "bg-mint" : "bg-warm-gray/30"
                      }`}
                      style={{ width: `${votePct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <Lock className="w-4 h-4 text-white/70" />
                </div>
              )}

              {/* My vote indicator */}
              {voteState.enabled && myVote === mode.id && !isSelected && (
                <Check className="absolute top-3 right-3 w-4 h-4 text-mint" />
              )}
            </button>
          );
        })}
      </div>

      {/* Vote summary (voting enabled) */}
      {voteState.enabled && !lobbyMode && totalVotes > 0 && (
        <div className="text-center space-y-1">
          <p className="text-[10px] font-bold text-warm-gray/50">
            {totalVotes} of {totalPlayers} players voted
          </p>
          <div className="flex items-center gap-2 justify-center text-[10px] font-bold">
            {Object.entries(voteCounts)
              .filter(([, c]) => c > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([m, c]) => (
                <span key={m} className="text-warm-gray/50">
                  {MODES.find((md) => md.id === m)?.label}: {c}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Host: Lock In button (when voting is enabled and enough votes) */}
      {isHost && voteState.enabled && !lobbyMode && totalVotes >= 2 && (
        <ClayButton
          variant="primary"
          size="lg"
          icon={<Lock className="w-4 h-4" />}
          onClick={onLockIn}
          className="w-full max-w-sm"
        >
          Lock In:{" "}
          {leaders.length === 1
            ? MODES.find((m) => m.id === leaders[0])?.label
            : "Tied — pick one"}
        </ClayButton>
      )}

      {/* Waiting message (voting enabled but not enough votes) */}
      {isHost && voteState.enabled && !lobbyMode && totalVotes === 0 && (
        <p className="text-center text-xs text-warm-gray/40 font-medium">
          Waiting for players to vote...
        </p>
      )}

      {/* Non-host message when voting is off */}
      {!isHost && !lobbyMode && !voteState.enabled && (
        <div className="text-center p-4 bg-warm-white rounded-2xl border border-warm-gray/10">
          <p className="text-sm font-bold text-warm-gray/50">
            Host is choosing the game mode...
          </p>
          <p className="text-[10px] text-warm-gray/40 mt-1">
            {players.length} player{players.length !== 1 ? "s" : ""} connected
          </p>
        </div>
      )}

      {/* After mode locked: countdown / transition */}
      {lobbyMode && (
        <div className="text-center space-y-2 animate-clay-pop">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-mint-light flex items-center justify-center">
            <Check className="w-8 h-8 text-mint" />
          </div>
          <p className="text-sm font-bold text-mint">
            {MODES.find((m) => m.id === lobbyMode)?.label} selected!
          </p>
          <p className="text-xs text-warm-gray/50">
            Setting up the game...
          </p>
        </div>
      )}
    </div>
  );
}
