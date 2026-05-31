import { useState, useMemo, useCallback, useEffect } from "react";
import { 
  Heart, Zap, Users, Shield, Clock, Plus, Key, Trophy, AlertTriangle
} from "lucide-react";
import { AVATARS } from "../assets/avatars";
import ClayCard from "./ui/ClayCard";
import ClayInput from "./ui/ClayInput";
import { PLAYER_COLORS, calcPoints, DEMO_LETTERS } from "./LinksBoardPrototype";
import TensionTimer from "./ui/TensionTimer";
import LetterPool from "./ui/LetterPool";

export interface WordEntry {
  id: string;
  word: string;
  points: number;
  status: 'valid' | 'invalid' | 'poisoned';
  reason?: string;
}

const DEMO_WORDS: WordEntry[][] = [
  [{ id: "w1", word: "SPARK", points: 75, status: 'valid' }, { id: "w2", word: "REACT", points: 60, status: 'valid' }],
  [{ id: "w4", word: "BLAST", points: 75, status: 'valid' }],
  [{ id: "w6", word: "FLAME", points: 0, status: 'poisoned', reason: "POISONED" }],
  [{ id: "w8", word: "BRAKE", points: 75, status: 'valid' }]
];

// ── Shared UI Utilities ───────────────────────────────────────────────────────

export const AvatarIcon = ({ src, size = "32px", className = "" }: { src: string; size?: string; className?: string }) => (
  <img src={src} alt="avatar" className={`block ${className}`} style={{ width: size, height: size }} />
);

// ── Types ───────────────────────────────────────────────────────────────────

export default function LinksBoardPrototypeV3() {
  const [playerCount, setPlayerCount] = useState(4);
  const [activePlayer, setActivePlayer] = useState(0);
  const [inputText, setInputText] = useState("");
  const [expandedOpponent, setExpandedOpponent] = useState<number | null>(null);
  const [words, setWords] = useState<WordEntry[][]>([...DEMO_WORDS]);
  
  const demoAllWords = useMemo(() => {
    const result = [...words];
    while (result.length < playerCount) result.push([]);
    return result;
  }, [words, playerCount]);

  const demoScores = useMemo(() =>
    demoAllWords.map((ws) => ws.reduce((s, w) => s + w.points, 0)),
    [demoAllWords]
  );
  
  const DEMO_HEARTS = [3, 2, 1, 3, 2, 3];

  const opponents = Array.from({ length: Math.max(0, playerCount - 1) }, (_, i) => {
    const actualIdx = i >= activePlayer ? i + 1 : i; 
    return {
      index: actualIdx,
      score: demoScores[actualIdx],
      hearts: DEMO_HEARTS[actualIdx],
      color: PLAYER_COLORS[actualIdx % PLAYER_COLORS.length],
      avatar: AVATARS[(actualIdx + 1) % AVATARS.length].src,
      letter: DEMO_LETTERS[actualIdx % DEMO_LETTERS.length]
    };
  });

  const activeColor = PLAYER_COLORS[activePlayer % PLAYER_COLORS.length];
  const activeAvatar = AVATARS[activePlayer % AVATARS.length].src;
  const activeScore = demoScores[activePlayer];
  const activeHearts = DEMO_HEARTS[activePlayer];
  const activeRequiredLetter = DEMO_LETTERS[activePlayer % DEMO_LETTERS.length];

  const [timeLeft, setTimeLeft] = useState(60);
  const [shakeInput, setShakeInput] = useState(false);

  useEffect(() => {
    const int = setInterval(() => setTimeLeft(t => (t > 0 ? t - 1 : 60)), 1000);
    return () => clearInterval(int);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const typed = inputText.trim().toUpperCase();
    if (!typed) return;
    
    let status: 'valid' | 'invalid' | 'poisoned' = 'valid';
    let points = calcPoints(typed.length);
    let reason = '';

    if (!typed.includes(activeRequiredLetter)) {
      status = 'invalid';
      points = 0;
      reason = `Missing '${activeRequiredLetter}'`;
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 500);
    } else if (typed === "POISON") {
      status = 'poisoned';
      points = 0;
      reason = "POISON LOGIC";
    }
    const entry: WordEntry = {
      id: `w${Date.now()}`,
      word: typed,
      points,
      status,
      reason
    };
    
    setWords((prev) => {
      const next = [...prev];
      while (next.length <= activePlayer) next.push([]);
      next[activePlayer] = [entry, ...(next[activePlayer] || [])];
      return next;
    });
    
    setInputText("");
  };

  return (
    <div className="min-h-screen bg-clay-cream font-outfit text-plum p-4 md:p-8 flex flex-col items-center">
      
      {/* ── Top Bar: Controls & Game Info ── */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <TensionTimer timeLeft={timeLeft} maxTime={60} defaultColor="#A78BFA" />

        <div className="flex items-center gap-2">
          {[2,3,4,5,6].map(num => (
            <button 
              key={num}
              onClick={() => setPlayerCount(num)}
              className={`w-10 h-10 rounded-2xl font-bold transition-all flex items-center justify-center ${
                playerCount === num 
                  ? "bg-soft-purple text-white shadow-md transform scale-110" 
                  : "bg-white text-plum opacity-50 hover:opacity-100 hover:bg-white"
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Board Content ── */}
      <div className="w-full max-w-4xl flex flex-col md:flex-row gap-8 items-start">
        
        {/* Left Side: Pool & Active Player ── */}
        <div className="flex-1 w-full space-y-8">
          
          {/* Letters Pool */}
          <LetterPool letters={DEMO_LETTERS} inputText={inputText} title="Letter Pool" />

          {/* Active Player Input Area */}
          <section className="mt-8">
            <ClayCard 
              elevation="elevated" 
              className="p-6 relative overflow-hidden" 
              style={{ backgroundColor: activeColor.fillLight, borderColor: activeColor.pillBorder }}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl p-1 shadow-sm flex items-center justify-center">
                    <AvatarIcon src={activeAvatar} size="100%" />
                  </div>
                  <div>
                    <div className="font-bold text-lg leading-tight" style={{ color: activeColor.fill }}>
                      You (Player {activePlayer + 1})
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Heart 
                          key={i} 
                          className={`w-4 h-4 ${i < activeHearts ? 'fill-current' : 'opacity-30'}`} 
                          style={{ color: i < activeHearts ? activeColor.fill : undefined }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-2xl" style={{ color: activeColor.fill }}>{activeScore}</div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60" style={{ color: activeColor.fill }}>Points</div>
                </div>
              </div>

              {/* Requirement Token */}
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm font-bold opacity-70" style={{ color: activeColor.fill }}>Required Letter:</span>
                <span className="bg-white px-3 py-1 rounded-lg font-black text-lg shadow-sm" style={{ color: activeColor.fill }}>
                  {activeRequiredLetter}
                </span>
              </div>

              <form onSubmit={handleSubmit} className="relative" style={shakeInput ? { transform: 'translateX(10px) rotate(1deg)', transition: 'transform 0.1s' } : { transition: 'transform 0.1s' }}>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  placeholder={`Word must include '${activeRequiredLetter}'`}
                  className="w-full bg-white text-plum text-2xl font-black font-mono tracking-[0.1em] rounded-2xl py-4 pl-6 pr-16 border-2 outline-none focus:ring-4 transition-all"
                  style={{ borderColor: shakeInput ? '#F87171' : activeColor.pillBorder, outlineColor: shakeInput ? '#F87171' : activeColor.fill, '--tw-ring-color': shakeInput ? '#FEE2E2' : activeColor.fillLight } as any}
                  autoFocus
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-xl transition-all disabled:opacity-50"
                  style={{ backgroundColor: shakeInput ? '#F87171' : activeColor.fill, color: "white" }}
                >
                  <Zap className="w-5 h-5 fill-current" />
                </button>
              </form>

              {/* Active Player Words History (Pills below input) */}
              {demoAllWords[activePlayer].length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 max-h-32 overflow-y-auto scrollbar-hide">
                  {demoAllWords[activePlayer].map((word) => (
                    <div 
                      key={word.id} 
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm ${
                        word.status === 'invalid' ? 'bg-peach/10 border-peach/30' : 
                        word.status === 'poisoned' ? 'bg-plum border-plum text-white/90 animate-pulse' : 
                        'bg-white/70 border-black/5'
                      }`}
                    >
                      {word.status === 'poisoned' && <AlertTriangle className="w-3 h-3 text-peach" />}
                      <span className={`font-bold text-sm tracking-widest uppercase ${word.status === 'invalid' ? 'line-through text-peach' : word.status === 'poisoned' ? 'text-white' : 'text-plum'}`}>
                        {word.word}
                      </span>
                      {word.status === 'valid' && <span className="text-[10px] font-black opacity-60 text-plum">+{word.points}</span>}
                      {word.status === 'invalid' && <span className="text-[10px] font-black uppercase text-peach">{word.reason}</span>}
                      {word.status === 'poisoned' && <span className="text-[10px] font-black uppercase text-peach opacity-80">{word.reason}</span>}
                    </div>
                  ))}
                </div>
              )}
            </ClayCard>
          </section>
        </div>

        {/* Right Side: Opponents (Minimalist List) ── */}
        <div className="w-full md:w-80 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-plum/50 uppercase tracking-widest pl-2">Opponents</h2>
          {opponents.map((opp) => (
            <ClayCard 
              key={opp.index} 
              elevation="flat" 
              padding="sm"
              className={`flex flex-col gap-3 cursor-pointer transition-all ${expandedOpponent === opp.index ? 'ring-2 ring-offset-2 ring-offset-clay-cream' : 'hover:bg-black/5'}`}
              onClick={() => setExpandedOpponent(expandedOpponent === opp.index ? null : opp.index)}
              style={expandedOpponent === opp.index ? { '--tw-ring-color': opp.color.fill } as React.CSSProperties : undefined}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner"
                    style={{ backgroundColor: opp.color.fillLight }}
                  >
                    <AvatarIcon src={opp.avatar} size="28px" />
                  </div>
                  <div>
                    <div className="font-bold text-md leading-tight text-plum">Player {opp.index + 1}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Heart 
                          key={i} 
                          className={`w-3 h-3 ${i < opp.hearts ? 'fill-peach text-peach' : 'fill-warm-gray text-warm-gray opacity-30'}`} 
                        />
                      ))}
                      <span 
                        className="ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: opp.color.fillLight, color: opp.color.fill }}
                      >
                        {opp.letter}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="font-black text-xl text-plum/80">{opp.score}</div>
              </div>

              {/* Expandable Word History for Opponent */}
              {expandedOpponent === opp.index && (
                <div className="pt-3 border-t border-black/5 space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                  {demoAllWords[opp.index].length === 0 ? (
                    <div className="text-center text-sm font-bold opacity-50 py-2">No words yet</div>
                  ) : (
                    demoAllWords[opp.index].map((word) => (
                      <div key={word.id} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-black/5 shadow-sm">
                        <span className="font-bold uppercase tracking-widest px-1">{word.word}</span>
                        <span className="font-bold opacity-50">+{word.points}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </ClayCard>
          ))}
        </div>

      </div>
    </div>
  );
}