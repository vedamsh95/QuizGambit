import { useState, useCallback } from "react";
import {
  Zap, Globe, Monitor, Crown, Check, Users, Lock,
  Hash, Wand2, Puzzle, Dices, Swords, FerrisWheel,
  Network, TrendingUp, type LucideIcon,
} from "lucide-react";
import ClayButton from "./ui/ClayButton";
import ClayCard from "./ui/ClayCard";
import clsx from "clsx";

// ── Types ───────────────────────────────────────────────────────────────────

export type GameMode = "QUIZ_5X5" | "LINKS" | "THE_NUMBER" | "SPELL_IT" | "CROSSWORD" | "ODDSMAKER"
  | "WORD_DUEL" | "ROULETTE" | "CONNECTIONS" | "HIGHER_LOWER" | "ANAGRAMS" | "BLUFF";

export type PlayStyle = "LOCAL" | "MULTIPLAYER" | "BUZZER";

interface GameConfig {
  id: GameMode;
  label: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  gradient: string;         // tailwind gradient class (used for icon container)
  cardAccent: string;       // subtle full-card gradient class (e.g. "bg-gradient-to-br from-soft-purple-light/40 to-transparent")
  glowColor: string;        // tailwind shadow color
  accentText: string;       // tailwind text color for accent elements
  accentBg: string;         // tailwind bg color for tags/badges
  playStyles: PlayStyle[];  // which play styles this game supports
  available: boolean;       // false = coming soon
  features: string[];       // short feature bullets shown on card
}

// ── Game configs ────────────────────────────────────────────────────────────

const GAMES: GameConfig[] = [
  {
    id: "QUIZ_5X5",
    label: "5×5 Quiz",
    tagline: "The flagship trivia board",
    description:
      "A 5×5 grid of categories and point values. Buzz in to answer, build streaks, and dominate the board. Supports category drafts, host picks, and full buzzer chaos.",
    icon: Zap,
    gradient: "from-purple-600 via-violet-500 to-indigo-500",
    cardAccent: "bg-gradient-to-br from-soft-purple-light/40 to-transparent",
    glowColor: "shadow-purple-500/25",
    accentText: "text-purple-200",
    accentBg: "bg-purple-500/20",
    playStyles: ["LOCAL", "MULTIPLAYER", "BUZZER"],
    available: true,
    features: ["5×5 Board", "Point Values", "Category Draft", "Streak Bonuses"],
  },
  {
    id: "LINKS",
    label: "LINKS",
    tagline: "Vocabulary duel — first to claim wins",
    description:
      "Each player picks a letter. Type words containing ALL chosen letters before opponents claim them. Longer words = more points. Optional poison mode adds psychological warfare — secretly assign letters that damage opponents.",
    icon: Swords,
    gradient: "from-emerald-600 via-teal-500 to-cyan-400",
    cardAccent: "bg-gradient-to-br from-mint-light/40 to-transparent",
    glowColor: "shadow-emerald-500/20",
    accentText: "text-emerald-200",
    accentBg: "bg-emerald-500/20",
    playStyles: ["MULTIPLAYER"],
    available: true,
    features: ["Word Sprint", "Shared Pool", "Poison Mode", "Multiplayer 2-4"],
  },
  {
    id: "THE_NUMBER",
    label: "The Number",
    tagline: "Closest guess wins",
    description:
      "Every answer is a number. No binary right or wrong — the closest guess wins. Exact answers get perfect scores. Ties broken by fastest buzzer. Bar chart reveal on every round.",
    icon: Hash,
    gradient: "from-blue-600 via-cyan-500 to-teal-400",
    cardAccent: "bg-gradient-to-br from-sky-light/40 to-transparent",
    glowColor: "shadow-cyan-500/20",
    accentText: "text-cyan-200",
    accentBg: "bg-cyan-500/20",
    playStyles: ["LOCAL", "MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["Numeric Answers", "Closest Wins", "Bar Chart Reveal", "Speed Tiebreaker"],
  },
  {
    id: "SPELL_IT",
    label: "Spell It",
    tagline: "Unscramble & type fast",
    description:
      "A word appears scrambled with extra decoy letters. Buzz in and type the correct spelling. Pure speed — no trivia knowledge needed. Rapid-fire rounds, 30 seconds each.",
    icon: Wand2,
    gradient: "from-amber-500 via-orange-400 to-red-400",
    cardAccent: "bg-gradient-to-br from-butter-light/40 to-transparent",
    glowColor: "shadow-amber-500/20",
    accentText: "text-amber-200",
    accentBg: "bg-amber-500/20",
    playStyles: ["LOCAL", "MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["Word Scrambles", "Decoy Letters", "Speed Scoring", "No Trivia Needed"],
  },
  {
    id: "CROSSWORD",
    label: "Crossword Clash",
    tagline: "Build the grid together",
    description:
      "A shared crossword grid grows on the host screen. Answer clues to fill words. New words intersect previous ones — spot a steal at any intersection for bonus points.",
    icon: Puzzle,
    gradient: "from-teal-600 via-emerald-500 to-green-400",
    cardAccent: "bg-gradient-to-br from-mint-light/40 to-transparent",
    glowColor: "shadow-emerald-500/20",
    accentText: "text-emerald-200",
    accentBg: "bg-emerald-500/20",
    playStyles: ["MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["Shared Grid", "Intersection Steals", "Spatial Puzzle", "Word Building"],
  },
  {
    id: "ODDSMAKER",
    label: "Oddsmaker",
    tagline: "Bet on who gets it right",
    description:
      "Don't answer the question — predict whether another player will. Correct bet = points. The actual answerer scores separately. Zero trivia knowledge required to win.",
    icon: Dices,
    gradient: "from-rose-600 via-pink-500 to-fuchsia-400",
    cardAccent: "bg-gradient-to-br from-peach-light/40 to-transparent",
    glowColor: "shadow-pink-500/20",
    accentText: "text-pink-200",
    accentBg: "bg-pink-500/20",
    playStyles: ["MULTIPLAYER"],
    available: false,
    features: ["Social Betting", "Prediction Scoring", "No Knowledge Needed", "Rotating Targets"],
  },
  {
    id: "WORD_DUEL",
    label: "Word Duel",
    tagline: "1v1 word association",
    description:
      "Face off against another player. A seed word appears — type an associated word in 5 seconds. If both type the SAME word, both are eliminated. Fastest unique answer wins.",
    icon: Swords,
    gradient: "from-orange-600 via-red-500 to-rose-500",
    cardAccent: "bg-gradient-to-br from-peach-light/40 to-transparent",
    glowColor: "shadow-orange-500/20",
    accentText: "text-orange-200",
    accentBg: "bg-orange-500/20",
    playStyles: ["MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["1v1 Duels", "Sudden Death Rule", "5-Second Timer", "Round-Robin"],
  },
  {
    id: "ROULETTE",
    label: "Category Roulette",
    tagline: "Spin to pick your poison",
    description:
      "A spinning wheel picks a random category. Play or Pass in 3 seconds. Passed categories come back in a Revenge Pool — next player must play them. High tension, fast decisions.",
    icon: FerrisWheel,
    gradient: "from-emerald-600 via-green-500 to-lime-400",
    cardAccent: "bg-gradient-to-br from-mint-light/40 to-transparent",
    glowColor: "shadow-green-500/20",
    accentText: "text-green-200",
    accentBg: "bg-green-500/20",
    playStyles: ["LOCAL", "MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["Spinning Wheel", "Play or Pass", "Revenge Pool", "Social Pressure"],
  },
  {
    id: "CONNECTIONS",
    label: "Connections Race",
    tagline: "Group items, race to finish",
    description:
      "9–12 items on a grid. Group them into categories of 3–4. First to find ALL groups wins. Wrong group = 30-second lockout. Pattern recognition meets competitive speed.",
    icon: Network,
    gradient: "from-indigo-600 via-purple-500 to-violet-400",
    cardAccent: "bg-gradient-to-br from-soft-purple-light/40 to-transparent",
    glowColor: "shadow-indigo-500/20",
    accentText: "text-indigo-200",
    accentBg: "bg-indigo-500/20",
    playStyles: ["MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["Pattern Matching", "Tap to Group", "30s Lockout", "Race to Finish"],
  },
  {
    id: "HIGHER_LOWER",
    label: "Higher / Lower",
    tagline: "Chain your guesses",
    description:
      "Guess whether the next fact is higher or lower than the last. Build a streak multiplier. When you bust, the turn passes. Bank your score or keep pushing your luck.",
    icon: TrendingUp,
    gradient: "from-slate-600 via-gray-500 to-zinc-400",
    cardAccent: "bg-gradient-to-br from-gray-light/40 to-transparent",
    glowColor: "shadow-slate-500/15",
    accentText: "text-slate-200",
    accentBg: "bg-slate-500/20",
    playStyles: ["LOCAL", "MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["Chain Guesses", "Streak Multiplier", "Bank or Bust", "Numeric Trivia"],
  },
  {
    id: "ANAGRAMS",
    label: "Anagrams",
    tagline: "Unscramble before the hint gets easier",
    description:
      "A cryptic clue and scrambled answer. Hints progressively clarify. First correct answer = max points. Wrong guesses hurt less as hints improve. The 'I knew it at hint #2' regret is real.",
    icon: Wand2,
    gradient: "from-violet-600 via-purple-500 to-fuchsia-500",
    cardAccent: "bg-gradient-to-br from-lavender-light/40 to-transparent",
    glowColor: "shadow-violet-500/20",
    accentText: "text-violet-200",
    accentBg: "bg-violet-500/20",
    playStyles: ["LOCAL", "MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["Progressive Hints", "Scrambled Answers", "Time-Decay Scoring", "Buzzer + Type"],
  },
  {
    id: "BLUFF",
    label: "Bluff the Bot",
    tagline: "Spot the AI's lies",
    description:
      "AI generates one real answer and two convincing fakes. Pick the truth. Optional deception layer: one player knows the answer and must convince others to pick wrong.",
    icon: Dices,
    gradient: "from-red-700 via-rose-600 to-pink-500",
    cardAccent: "bg-gradient-to-br from-peach-light/40 to-transparent",
    glowColor: "shadow-red-500/20",
    accentText: "text-red-200",
    accentBg: "bg-red-500/20",
    playStyles: ["MULTIPLAYER", "BUZZER"],
    available: false,
    features: ["AI Fake Answers", "Spot the Truth", "Deception Layer", "Social Deduction"],
  },
];

// Map play style → config for the second step (after game is selected)
const PLAY_STYLES: { id: PlayStyle; label: string; icon: LucideIcon; description: string; gradient: string }[] = [
  {
    id: "LOCAL",
    label: "Local",
    icon: Monitor,
    description: "Everyone plays on this screen. Pass-and-play style.",
    gradient: "from-peach to-orange-400",
  },
  {
    id: "MULTIPLAYER",
    label: "Multiplayer",
    icon: Globe,
    description: "Everyone answers on their own device. Timed rounds.",
    gradient: "from-soft-purple to-purple-400",
  },
  {
    id: "BUZZER",
    label: "Buzzer",
    icon: Zap,
    description: "Buzz from your phone to answer first. Fast-paced.",
    gradient: "from-mint to-emerald-400",
  },
];

export type SelectionStep = "GAME_SELECTION" | "PLAY_STYLE_SELECTION";

interface VoteState {
  enabled: boolean;
  votes: Record<string, GameMode>;
}

interface ModeSelectionProps {
  isHost: boolean;
  playerId: string;
  players: any[];
  lobbyMode: string | null;
  voteState: VoteState;
  onSelectMode: (mode: GameMode, playStyle: PlayStyle) => void;
  onToggleVoting: (enabled: boolean) => void;
  onVote: (mode: GameMode) => void;
}

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
}: ModeSelectionProps) {
  const [step, setStep] = useState<SelectionStep>("GAME_SELECTION");
  const [selectedGame, setSelectedGame] = useState<GameMode | null>(null);
  const [myVote, setMyVote] = useState<GameMode | null>(
    voteState.votes?.[playerId] || null
  );

  // ── Vote counts ──────────────────────────────────────────────────────────

  const voteCounts: Record<string, number> = {};
  Object.values(voteState.votes || {}).forEach((v) => {
    voteCounts[v] = (voteCounts[v] || 0) + 1;
  });
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(0, ...Object.values(voteCounts));
  const leaders = Object.entries(voteCounts)
    .filter(([, c]) => c === maxVotes && c > 0)
    .map(([m]) => m as GameMode);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleVote = useCallback(
    (mode: GameMode) => {
      if (lobbyMode) return;
      setMyVote(mode);
      onVote(mode);
    },
    [lobbyMode, onVote]
  );

  const handleGamePick = useCallback(
    (mode: GameMode) => {
      if (lobbyMode) return;
      const game = GAMES.find((g) => g.id === mode);
      if (!game?.available) return;
      setSelectedGame(mode);
      setStep("PLAY_STYLE_SELECTION");
    },
    [lobbyMode]
  );

  const handlePlayStylePick = useCallback(
    (style: PlayStyle) => {
      if (!selectedGame || !isHost || lobbyMode) return;
      onSelectMode(selectedGame, style);
    },
    [selectedGame, isHost, lobbyMode, onSelectMode]
  );

  const handleBackToGames = useCallback(() => {
    setStep("GAME_SELECTION");
    setSelectedGame(null);
  }, []);

  // ── Available vs Coming Soon split ───────────────────────────────────────

  const availableGames = GAMES.filter((g) => g.available);
  const comingSoonGames = GAMES.filter((g) => !g.available);

  // ── Play style tag renderer (unused after clay refactor) ─────────────

  // ── Selected game config ─────────────────────────────────────────────────

  const selectedGameConfig = GAMES.find((g) => g.id === selectedGame);

  // ── Lock-in state (for host when voting is enabled) ──────────────────────

  const showLockIn = isHost && voteState.enabled && !lobbyMode && totalVotes >= 2;
  const singleLeader = leaders.length === 1 ? leaders[0] : null;
  const tieLeader = leaders.length > 1;

  // ── Render ───────────────────────────────────────────────────────────────

  // ── Already selected (transitioning to setup) ──────────────────────

  if (lobbyMode) {
    const game = GAMES.find((g) => g.id === lobbyMode);
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-4xl mx-auto w-full">
        <ClayCard padding="lg" className="text-center space-y-4 animate-clay-pop max-w-sm w-full">
          <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${game?.gradient || "from-mint to-emerald-400"} flex items-center justify-center`}>
            {game ? <game.icon className="w-8 h-8 text-white" /> : <Check className="w-8 h-8 text-white" />}
          </div>
          <div>
            <p className="font-outfit font-black text-lg text-plum">
              {game?.label || lobbyMode} selected!
            </p>
            <p className="text-xs text-warm-gray/70 mt-1">
              Setting up the game...
            </p>
          </div>
        </ClayCard>
      </div>
    );
  }

  // ── Step 2: Play Style Selection ────────────────────────────────────────

  if (step === "PLAY_STYLE_SELECTION" && selectedGameConfig) {
    return (
      <div className="flex-1 flex flex-col items-center p-4 sm:p-6 max-w-2xl mx-auto w-full gap-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-mint-light text-mint text-[10px] font-black tracking-[0.2em] uppercase">
            <Zap className="w-3 h-3" />
            Step 2 of 2
          </div>
          <h2 className="font-outfit font-black text-2xl sm:text-3xl text-plum">
            How to Play?
          </h2>
          <p className="text-xs text-warm-gray/70 font-medium max-w-md mx-auto">
            Choose how players interact with <span className="font-bold text-plum">{selectedGameConfig.label}</span>
          </p>
        </div>

        {/* Back button */}
        {isHost && (
          <button
            onClick={handleBackToGames}
            className="flex items-center gap-1.5 text-xs font-bold text-warm-gray/70 hover:text-plum transition-colors"
          >
            ← Back to game selection
          </button>
        )}

        {/* Selected game reminder card */}
        <ClayCard elevation="flat" padding="md" className="w-full flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${selectedGameConfig.gradient} flex items-center justify-center shrink-0`}>
            <selectedGameConfig.icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-outfit font-black text-base text-plum">{selectedGameConfig.label}</p>
            <p className="text-[10px] font-semibold text-warm-gray/50">{selectedGameConfig.tagline}</p>
          </div>
        </ClayCard>

        {/* Play style cards */}
        <div className="w-full space-y-3">
          <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest">
            Pick Play Style
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PLAY_STYLES.filter((ps) =>
              selectedGameConfig.playStyles.includes(ps.id)
            ).map((style) => {
              const isDisabled = !isHost;
              return (
                <button
                  key={style.id}
                  onClick={() => !isDisabled && handlePlayStylePick(style.id)}
                  disabled={isDisabled}
                  className={clsx(
                    "clay-btn flex flex-col items-center text-center p-5 gap-3 w-full",
                    "transition-all duration-200",
                    !isDisabled && "hover:-translate-y-1",
                    isDisabled && "clay-btn-disabled",
                  )}
                >
                  {/* Gradient icon container */}
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${style.gradient} flex items-center justify-center shadow-md`}>
                    <style.icon className="w-7 h-7 text-white" />
                  </div>

                  <div>
                    <h3 className="font-outfit font-black text-base text-plum mb-1">
                      {style.label}
                    </h3>
                    <p className="text-xs leading-relaxed text-warm-gray/70">
                      {style.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Non-host: host is choosing */}
          {!isHost && (
            <ClayCard padding="md" className="text-center space-y-2">
              <div className="w-10 h-10 mx-auto rounded-xl bg-soft-purple-light flex items-center justify-center">
                <Crown className="w-5 h-5 text-soft-purple" />
              </div>
              <p className="text-xs font-bold text-warm-gray/70">
                Host is picking the play style...
              </p>
            </ClayCard>
          )}
        </div>
      </div>
    );
  }

  // ── Step 1: Game Selection ──────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col items-center p-4 sm:p-6 max-w-4xl mx-auto w-full gap-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-soft-purple-light text-soft-purple text-[10px] font-black tracking-[0.2em] uppercase">
          <Crown className="w-3 h-3" />
          Choose Game
        </div>
        <h2 className="font-outfit font-black text-2xl sm:text-3xl text-plum">
          Pick a game
        </h2>
        <p className="text-xs text-warm-gray/70 font-medium max-w-md mx-auto">
          {isHost
            ? "Select a game or let players vote"
            : "Vote for your favorite game"}
        </p>
      </div>

      {/* Host voting toggle */}
      {isHost && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => onToggleVoting(!voteState.enabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              voteState.enabled
                ? "bg-mint-light text-mint border border-mint/30"
                : "bg-warm-gray/5 text-warm-gray/70 border border-warm-gray/15"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            {voteState.enabled ? "Voting ON" : "Voting OFF"}
            <span className="text-[10px] opacity-70">
              ({voteState.enabled ? "players can vote" : "host picks"})
            </span>
          </button>
        </div>
      )}

      {/* Available Games */}
      <div className="w-full space-y-3">
        <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest">
          Available Now
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {availableGames.map((game) => {
            const isSelected = lobbyMode === game.id;
            const isLeading = leaders.includes(game.id);
            const isMyVote = voteState.enabled && myVote === game.id;
            const canInteract = !lobbyMode && (isHost && !voteState.enabled ? true : voteState.enabled);
            const isDisabled = isSelected || !canInteract;

            return (
              <button
                key={game.id}
                onClick={() => {
                  if (isSelected || !canInteract) return;
                  if (isHost && !voteState.enabled) handleGamePick(game.id);
                  else if (voteState.enabled) handleVote(game.id);
                }}
                disabled={isDisabled}
                className={clsx(
                  "clay text-left w-full transition-all duration-300 overflow-hidden group",
                  game.cardAccent,
                  isSelected && "clay-pressed scale-[1.01]",
                  !isDisabled && "cursor-pointer hover:-translate-y-1",
                  isDisabled && !isSelected && "opacity-70 cursor-default",
                )}
              >

                {/* ── Card body ──────────────────────────────────────────── */}
                <div className="p-5">
                  {/* Top row: icon + badges */}
                  <div className="flex items-start justify-between mb-3">
                    {/* Gradient icon container */}
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${game.gradient} flex items-center justify-center shadow-lg`}>
                      <game.icon className="w-5 h-5 text-white" />
                    </div>

                    {/* Status badges */}
                    <div className="flex flex-col items-end gap-1.5">
                      {isSelected && (
                        <span className="clay-badge bg-mint-light text-mint">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      )}
                      {isMyVote && !isSelected && (
                        <span className="clay-badge bg-soft-purple-light text-soft-purple">
                          <Check className="w-3 h-3" /> Voted
                        </span>
                      )}
                      {/* Leading indicator during voting */}
                      {isLeading && voteState.enabled && !isSelected && !isMyVote && (
                        <span className="clay-badge bg-butter-light text-butter">
                          <Crown className="w-3 h-3" /> Leading
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title + tagline */}
                  <h3 className={clsx(
                    "font-outfit font-black text-lg mb-0.5",
                    isSelected ? "text-soft-purple" : "text-plum"
                  )}>
                    {game.label}
                  </h3>
                  <p className="text-xs font-semibold text-warm-gray/50 mb-3">
                    {game.tagline}
                  </p>

                  {/* Play style tags */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {game.playStyles.map((style) => {
                      const tags: Record<PlayStyle, { icon: LucideIcon; label: string }> = {
                        LOCAL: { icon: Monitor, label: "Local" },
                        MULTIPLAYER: { icon: Globe, label: "Multi" },
                        BUZZER: { icon: Zap, label: "Buzzer" },
                      };
                      const { icon: Icon, label } = tags[style];
                      return (
                        <span
                          key={style}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-soft-purple-light text-soft-purple text-[9px] font-black uppercase tracking-wider"
                        >
                          <Icon className="w-2.5 h-2.5" />
                          {label}
                        </span>
                      );
                    })}
                  </div>

                  {/* Feature chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {game.features.map((feat) => (
                      <span
                        key={feat}
                        className="text-[10px] font-bold text-warm-gray/70 bg-warm-gray/5 px-2 py-0.5 rounded-full border border-warm-gray/10"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>

                  {/* Vote bar (only when game has votes) */}
                  {voteState.enabled && !isSelected && voteCounts[game.id] !== undefined && (
                    <div className="mt-4 pt-3 border-t border-warm-gray/10 space-y-1.5">
                      <div className="flex justify-between text-[10px] font-bold text-warm-gray/70">
                        <span>{voteCounts[game.id] || 0} vote{(voteCounts[game.id] || 0) !== 1 ? "s" : ""}</span>
                        <span>
                          {totalVotes > 0 ? Math.round(((voteCounts[game.id] || 0) / totalVotes) * 100) : 0}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-warm-gray/10 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            "h-full rounded-full transition-all duration-500",
                            isLeading ? "bg-soft-purple" : "bg-soft-purple/30"
                          )}
                          style={{
                            width: `${totalVotes > 0 ? ((voteCounts[game.id] || 0) / totalVotes) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Coming Soon */}
      <div className="w-full space-y-3">
        <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest">
          Coming Soon
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {comingSoonGames.map((game) => (
            <div
              key={game.id}
              className={clsx(
                "clay overflow-hidden opacity-55 transition-all duration-300 hover:-translate-y-0.5 hover:opacity-65",
                game.cardAccent,
              )}
            >

              {/* ── Card body ──────────────────────────────────────────── */}
              <div className="p-4">
                {/* Top row: icon + lock badge */}
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${game.gradient} flex items-center justify-center opacity-50`}>
                    <game.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="clay-badge bg-warm-gray/5 text-warm-gray/40">
                    <Lock className="w-2.5 h-2.5" />
                    Soon
                  </span>
                </div>

                {/* Title + tagline */}
                <h3 className="font-outfit font-black text-sm text-plum/70 mb-0.5">
                  {game.label}
                </h3>
                <p className="text-[10px] font-semibold text-warm-gray/60 mb-2">
                  {game.tagline}
                </p>

                {/* Description (truncated) */}
                <p className="text-[10px] leading-relaxed text-warm-gray/50 mb-3 line-clamp-3">
                  {game.description}
                </p>

                {/* Play style tags */}
                <div className="flex flex-wrap gap-1">
                  {game.playStyles.map((style) => {
                    const tags: Record<PlayStyle, { icon: LucideIcon; label: string }> = {
                      LOCAL: { icon: Monitor, label: "Local" },
                      MULTIPLAYER: { icon: Globe, label: "Multi" },
                      BUZZER: { icon: Zap, label: "Buzzer" },
                    };
                    const { icon: Icon, label } = tags[style];
                    return (
                      <span
                        key={style}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-warm-gray/5 text-[9px] font-bold text-warm-gray/50 uppercase"
                      >
                        <Icon className="w-2.5 h-2.5" />
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vote summary (when voting enabled) */}
      {voteState.enabled && !lobbyMode && totalVotes > 0 && (
        <ClayCard elevation="elevated" padding="md" className="w-full max-w-lg text-center space-y-2">
          <p className="text-[10px] font-bold text-warm-gray/50">
            {totalVotes} of {players.length} player{players.length !== 1 ? "s" : ""} voted
          </p>
          <div className="flex flex-wrap items-center gap-3 justify-center">
            {Object.entries(voteCounts)
              .filter(([, c]) => c > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([m, c]) => {
                const game = GAMES.find((g) => g.id === m);
                return (
                  <span key={m} className="text-[10px] font-black text-warm-gray/70">
                    <span
                      className={`inline-block w-2 h-2 rounded-full mr-1 bg-gradient-to-br ${game?.gradient || ""}`}
                    />
                    {game?.label || m}: {c}
                  </span>
                );
              })}
          </div>
        </ClayCard>
      )}

      {/* Host: Lock In */}
      {showLockIn && (
        <div className="w-full max-w-sm space-y-2">
          <ClayButton
            variant="primary"
            size="lg"
            icon={<Lock className="w-4 h-4" />}
            onClick={() => { if (singleLeader) handleGamePick(singleLeader); }}
            disabled={tieLeader}
            className="w-full"
          >
            {singleLeader
              ? `Lock In: ${GAMES.find((g) => g.id === singleLeader)?.label}`
              : "Tie — host must pick manually"}
          </ClayButton>
          {tieLeader && (
            <p className="text-[10px] text-center font-bold text-peach">
              Multiple games are tied. Toggle voting off and pick directly, or wait for more votes.
            </p>
          )}
        </div>
      )}

      {/* Waiting for votes */}
      {isHost && voteState.enabled && !lobbyMode && totalVotes === 0 && (
        <p className="text-center text-xs text-warm-gray/60 font-medium">
          Waiting for players to vote...
        </p>
      )}

      {/* Non-host: host is choosing */}
      {!isHost && !lobbyMode && !voteState.enabled && (
        <ClayCard padding="md" className="w-full max-w-sm text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-soft-purple-light flex items-center justify-center">
            <Crown className="w-6 h-6 text-soft-purple" />
          </div>
          <p className="text-sm font-bold text-warm-gray/50">
            Host is choosing the game...
          </p>
          <p className="text-[10px] text-warm-gray/60">
            {players.length} player{players.length !== 1 ? "s" : ""} connected
          </p>
        </ClayCard>
      )}
    </div>
  );
}
