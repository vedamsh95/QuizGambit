import { useState, useMemo, useCallback } from "react";
import { Heart, Zap, Users, Palette, ArrowLeftRight, List, LayoutGrid, Sparkles } from "lucide-react";
import { AVATARS } from "../assets/avatars";
import ClayCard from "./ui/ClayCard";
import {
  ActivePlayerPanel,
  OpponentPanel,
  OpponentLeaderboard,
  PLAYER_COLORS,
  DEMO_LETTERS,
  DEMO_WORDS,
  calcPoints,
  needsDarkText,
  WordEntry,
} from "./LinksBoardPrototype";

// ── Types ───────────────────────────────────────────────────────────────────

type ViewMode = "soft" | "clay-card";

// ── Demo data ───────────────────────────────────────────────────────────────

const DEMO_HEARTS = [2, 3, 1, 3, 2, 3];

// ── ClayCard wrapper for the active player panel ────────────────────────────

function ClayActivePlayerWrap({
  children,
  active,
}: {
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <ClayCard
      elevation="elevated"
      padding="none"
      className={`w-full h-full overflow-hidden ${active ? "ring-2 ring-soft-purple ring-offset-2 ring-offset-clay-cream" : ""}`}
    >
      {children}
    </ClayCard>
  );
}

function ClayOpponentWrap({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClayCard
      elevation="flat"
      padding="none"
      className="w-full h-full overflow-hidden"
    >
      {children}
    </ClayCard>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function LinksBoardPrototypeClay() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("soft");
  const [playerCount, setPlayerCount] = useState(2);
  const [activePlayer, setActivePlayer] = useState(0);
  const [words, setWords] = useState<WordEntry[][]>([...DEMO_WORDS]);
  const [inputs, setInputs] = useState<string[]>(["", "", "", "", "", ""]);
  const [colorIndices, setColorIndices] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [leaderboardMode, setLeaderboardMode] = useState(false);
  const isClay = viewMode === "clay-card";

  // ── Derived ────────────────────────────────────────────────────────────────
  const demoAllWords = useMemo(() => {
    const result = [...words];
    while (result.length < playerCount) result.push([]);
    return result;
  }, [words, playerCount]);

  const demoAllColors = useMemo(() => {
    const result = [...colorIndices];
    while (result.length < playerCount) result.push(result.length % PLAYER_COLORS.length);
    return result;
  }, [colorIndices, playerCount]);

  const demoScores = useMemo(() =>
    demoAllWords.map((ws) => ws.reduce((s, w) => s + w.points, 0)),
    [demoAllWords]
  );

  const opponentIndices = useMemo(
    () => Array.from({ length: playerCount }, (_, i) => i).filter(i => i !== activePlayer),
    [playerCount, activePlayer]
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  const demoActiveInput = inputs[activePlayer] || "";

  const setActiveInput = useCallback((v: string) => {
    setInputs((prev) => {
      const next = [...prev];
      next[activePlayer] = v;
      return next;
    });
  }, [activePlayer]);

  const handleDemoClaim = useCallback((claimedWord: string) => {
    const entry: WordEntry = {
      id: `w${Date.now()}`,
      word: claimedWord,
      points: calcPoints(claimedWord.length),
      isPoisoned: false,
      claimedAt: new Date(),
    };
    setWords((prev) => {
      const next = [...prev];
      while (next.length <= activePlayer) next.push([]);
      next[activePlayer] = [entry, ...(next[activePlayer] || [])];
      return next;
    });
    setInputs((prev) => {
      const next = [...prev];
      next[activePlayer] = "";
      return next;
    });
  }, [activePlayer]);

  // ── Render panels ─────────────────────────────────────────────────────────
  const renderActivePanel = () => {
    const panel = (
      <ActivePlayerPanel
        color={PLAYER_COLORS[demoAllColors[activePlayer]]}
        input={demoActiveInput}
        setInput={setActiveInput}
        onClaim={handleDemoClaim}
        words={demoAllWords[activePlayer]}
        score={demoScores[activePlayer]}
        hearts={DEMO_HEARTS[activePlayer]}
        playerLabel={`P${activePlayer + 1}`}
        avatarSrc={AVATARS[activePlayer % AVATARS.length].src}
        clayMode={isClay}
        letters={DEMO_LETTERS}
      />
    );
    if (isClay) {
      return (
        <div className="p-2 h-full">
          <ClayActivePlayerWrap active>{panel}</ClayActivePlayerWrap>
        </div>
      );
    }
    return panel;
  };

  const renderOpponentPanel = (oppIdx: number) => {
    const panel = (
      <OpponentPanel
        color={PLAYER_COLORS[demoAllColors[oppIdx]]}
        playerLabel={`P${oppIdx + 1}`}
        avatarSrc={AVATARS[(oppIdx + 1) % AVATARS.length].src}
        score={demoScores[oppIdx]}
        hearts={DEMO_HEARTS[oppIdx]}
        words={demoAllWords[oppIdx]}
        liveInput={demoActiveInput}
        playerLetter={DEMO_LETTERS[oppIdx % DEMO_LETTERS.length]}
        clayMode={isClay}
      />
    );
    if (isClay) {
      return (
        <div className="p-2 h-full">
          <ClayOpponentWrap>{panel}</ClayOpponentWrap>
        </div>
      );
    }
    return panel;
  };

  const renderLeaderboard = () => {
    const leaderboardOpponents = opponentIndices.map((oi, idx) => ({
      index: idx,
      label: `P${oi + 1}`,
      score: demoScores[oi],
      hearts: DEMO_HEARTS[oi],
      wordCount: demoAllWords[oi].length,
      words: demoAllWords[oi],
      color: PLAYER_COLORS[demoAllColors[oi]],
      avatarSrc: AVATARS[(oi + 1) % AVATARS.length].src,
    }));

    if (isClay) {
      return (
        <div className="p-2 h-full">
          <ClayCard elevation="flat" padding="none" className="w-full h-full overflow-hidden">
            <OpponentLeaderboard opponents={leaderboardOpponents} liveInput={demoActiveInput} clayMode={isClay} />
          </ClayCard>
        </div>
      );
    }
    return <OpponentLeaderboard opponents={leaderboardOpponents} liveInput={demoActiveInput} clayMode={isClay} />;
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ── RENDER ──────────────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen bg-clay-cream flex flex-col overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 sm:px-4 py-2 flex items-center justify-between bg-warm-white/90 backdrop-blur-md border-b border-warm-gray/10 z-20 gap-2 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-outfit font-black text-base text-plum">🔗 LINKS</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-plum/25 hidden sm:inline">Clay Prototype</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
          {/* Player count selector */}
          <div className="flex items-center gap-1 bg-warm-gray/5 rounded-full p-0.5">
            <Users className="w-3 h-3 text-plum/30 ml-1.5" />
            {([2, 3, 4, 5, 6] as const).map((n) => (
              <button key={n} onClick={() => {
                setPlayerCount(n);
                if (activePlayer >= n) setActivePlayer(0);
              }}
                className={`w-6 h-6 rounded-full text-[10px] font-black transition-all ${playerCount === n ? "bg-soft-purple text-white shadow-sm" : "text-plum/30 hover:text-plum/60"}`}>
                {n}
              </button>
            ))}
          </div>

          {/* View mode toggle: Soft vs Clay Card */}
          <div className="flex items-center bg-warm-gray/5 rounded-full p-0.5 border border-warm-gray/10">
            <button onClick={() => setViewMode("soft")}
              className={`px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all ${
                viewMode === "soft"
                  ? "bg-soft-purple text-white shadow-sm"
                  : "text-plum/40 hover:text-plum/70"
              }`}>
              <span className="hidden sm:inline">Soft</span>
              <span className="sm:hidden">S</span>
            </button>
            <button onClick={() => setViewMode("clay-card")}
              className={`px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all ${
                viewMode === "clay-card"
                  ? "bg-soft-purple text-white shadow-sm"
                  : "text-plum/40 hover:text-plum/70"
              }`}>
              <Palette className="w-3 h-3 inline sm:mr-1" />
              <span className="hidden sm:inline">Clay Card</span>
            </button>
          </div>

          {/* View toggle: Grid vs Leaderboard */}
          {playerCount >= 3 && (
            <button onClick={() => setLeaderboardMode(!leaderboardMode)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] sm:text-xs font-bold transition-all ${
                leaderboardMode
                  ? "bg-soft-purple border-soft-purple text-white shadow-md"
                  : "bg-warm-gray/5 border-warm-gray/10 text-plum/40 hover:text-plum/70 hover:bg-warm-gray/10"
              }`}>
              {leaderboardMode ? <List className="w-3 h-3" /> : <LayoutGrid className="w-3 h-3" />}
              <span className="hidden sm:inline">{leaderboardMode ? "List" : "Grid"}</span>
            </button>
          )}

          {/* Switch active player */}
          <button onClick={() => setActivePlayer((prev) => (prev + 1) % playerCount)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-warm-gray/5 border border-warm-gray/10 text-[10px] sm:text-xs font-bold text-plum/40 hover:text-plum/70 hover:bg-warm-gray/10 transition-all">
            <ArrowLeftRight className="w-3 h-3" />
            <span className="hidden sm:inline">Switch</span>
          </button>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      {isClay && (
        <div className="shrink-0 px-4 py-2 flex items-center gap-2 bg-soft-purple-light/30 border-b border-soft-purple/10">
          <Palette className="w-3.5 h-3.5 text-soft-purple" />
          <span className="text-[10px] font-bold text-soft-purple uppercase tracking-wider">
            Clay Card Mode — panels wrapped in ClayCard with padding gaps
          </span>
        </div>
      )}

      <div className={`flex-1 flex min-h-0 ${isClay ? "p-1 sm:p-2" : ""}`}>
        {/* 2 PLAYERS */}
        {playerCount === 2 && (
          <div className={`flex-1 flex flex-col md:flex-row min-h-0 ${isClay ? "gap-1 sm:gap-2" : ""}`}>
            <div className="flex-1 min-h-0 flex">
              {renderActivePanel()}
            </div>
            {!isClay && (
              <>
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="w-8 h-8 rounded-full bg-warm-white border-2 border-warm-gray/10 shadow-sm flex items-center justify-center">
                      <span className="text-[10px] font-black text-plum/15">VS</span>
                    </div>
                  </div>
                </div>
                <div className="md:hidden h-[3px] bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="w-6 h-6 rounded-full bg-warm-white border border-warm-gray/10 shadow-sm flex items-center justify-center">
                      <span className="text-[8px] font-black text-plum/15">VS</span>
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="flex-1 min-h-0 flex">
              {renderOpponentPanel(opponentIndices[0])}
            </div>
          </div>
        )}

        {/* 3+ PLAYERS */}
        {playerCount >= 3 && (
          <div className={`flex-1 flex flex-col md:flex-row min-h-0 ${isClay ? "gap-1 sm:gap-2" : ""}`}>
            {/* Active player — top on mobile, left on desktop */}
            <div className={`${isClay ? "" : "h-[55vh] md:h-auto"} flex-1 min-h-0 flex flex-col md:flex-none md:w-[50%]`}>
              {renderActivePanel()}
            </div>

            {/* Divider (soft mode only) */}
            {!isClay && (
              <>
                <div className="hidden md:block w-[3px] bg-gradient-to-b from-warm-white/80 via-warm-gray/15 to-warm-white/80 relative shrink-0">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="w-6 h-6 rounded-full bg-warm-white border-2 border-warm-gray/10 shadow-sm flex items-center justify-center">
                      <span className="text-[8px] font-black text-plum/15">VS</span>
                    </div>
                  </div>
                </div>
                <div className="md:hidden h-[2px] bg-gradient-to-r from-warm-white/80 via-warm-gray/15 to-warm-white/80 relative shrink-0" />
              </>
            )}

            {/* Opponents area */}
            <div className={`flex-1 min-h-0 flex flex-col md:flex-none md:w-[50%] ${isClay ? "overflow-y-auto" : "overflow-y-auto"}`}>
              {leaderboardMode ? (
                renderLeaderboard()
              ) : (
                <div className={`flex flex-col ${isClay ? "gap-1 sm:gap-2 h-full" : ""}`}>
                  {opponentIndices.map((oi) => (
                    <div key={oi} className={`${isClay ? "flex-1 min-h-[160px]" : "flex-shrink-0 min-h-[130px] md:flex-1 md:min-h-0 flex border-b border-warm-gray/10 last:border-b-0 md:border-b-0"}`}>
                      {renderOpponentPanel(oi)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom status bar ─────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 flex items-center justify-between bg-warm-white/80 backdrop-blur-sm border-t border-warm-gray/10">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-plum/40">
            {playerCount} players · Active: P{activePlayer + 1}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: playerCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => setActivePlayer(i)}
              className={`w-5 h-5 rounded-full text-[7px] font-black transition-all ${
                i === activePlayer
                  ? "ring-2 ring-soft-purple ring-offset-1 ring-offset-clay-cream scale-110"
                  : "opacity-50 hover:opacity-80"
              }`}
              style={{
                backgroundColor: PLAYER_COLORS[demoAllColors[i] % PLAYER_COLORS.length].fill,
                color: needsDarkText(PLAYER_COLORS[demoAllColors[i] % PLAYER_COLORS.length].fill) ? "#4A3B6B" : "#fff",
              }}>
              {i + 1}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-plum/30">
          <Sparkles className="w-3 h-3" />
          <span>Type + Enter to claim a word</span>
        </div>
      </div>
    </div>
  );
}
