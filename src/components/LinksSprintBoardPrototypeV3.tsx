import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Heart, Zap, Users, Shield, Clock, Plus, Key, Trophy, Shuffle, RotateCw, Target
} from "lucide-react";
import { AVATARS } from "../assets/avatars";
import ClayCard from "./ui/ClayCard";
import TensionTimer from "./ui/TensionTimer";
import LetterPool from "./ui/LetterPool";
import { PLAYER_COLORS } from "./LinksBoardPrototype";

// ── Shared UI Utilities ───────────────────────────────────────────────────────

export const AvatarIcon = ({ src, size = "32px", className = "" }: { src: string; size?: string; className?: string }) => (
  <img src={src} alt="avatar" className={`block ${className}`} style={{ width: size, height: size }} />
);

export const calcPoints = (length: number) =>
  length <= 4 ? 10 * length : length <= 6 ? 15 * length : length <= 8 ? 20 * length : 30 * length;

// ── Demo Data ───────────────────────────────────────────────────────────────

interface WordEntry {
  id: string;
  word: string;
  points: number;
  status: 'valid' | 'invalid' | 'target';
  reason?: string;
  targetLevel?: number;
}

const DEMO_LETTERS = ["C", "T", "A"];
const DEMO_WORDS_SPRINT: WordEntry[][] = [
  [{ id: "w1", word: "CAT", points: 30, status: 'valid' }, { id: "w2", word: "TACT", points: 40, status: 'valid' }, { id: "w3", word: "TRACT", points: 50, status: 'valid' }],
  [{ id: "w4", word: "ATTACH", points: 90, status: 'valid' }],
  [{ id: "w5", word: "CATER", points: 50, status: 'valid' }, { id: "w6", word: "REACT", points: 50, status: 'valid' }],
  [{ id: "w7", word: "ACT", points: 30, status: 'valid' }]
];

// ── Main Component ──────────────────────────────────────────────────────────

export default function LinksSprintBoardPrototypeV3() {
  const navigate = useNavigate();
  const [playerCount, setPlayerCount] = useState(4);
  const [activePlayer, setActivePlayer] = useState(0);
  const [inputText, setInputText] = useState("");
  const [expandedOpponent, setExpandedOpponent] = useState<number | null>(null);
  const [words, setWords] = useState<WordEntry[][]>([...DEMO_WORDS_SPRINT]);
  const [shuffleTokens, setShuffleTokens] = useState({ all: 3, single: 3 });
  
  const demoAllWords = useMemo(() => {
    const result = [...words];
    while (result.length < playerCount) result.push([]);
    return result;
  }, [words, playerCount]);

  const demoScores = useMemo(() =>
    demoAllWords.map((ws) => ws.reduce((s, w) => s + w.points, 0)),
    [demoAllWords]
  );
  
  const opponents = Array.from({ length: Math.max(0, playerCount - 1) }, (_, i) => {
    const actualIdx = i >= activePlayer ? i + 1 : i; 
    return {
      index: actualIdx,
      score: demoScores[actualIdx],
      color: PLAYER_COLORS[actualIdx % PLAYER_COLORS.length],
      avatar: AVATARS[(actualIdx + 1) % AVATARS.length].src,
    };
  });

  const activeColor = PLAYER_COLORS[activePlayer % PLAYER_COLORS.length];
  const activeAvatar = AVATARS[activePlayer % AVATARS.length].src;
  const activeScore = demoScores[activePlayer];

  const [timeLeft, setTimeLeft] = useState(45);
  const [shakeInput, setShakeInput] = useState(false);

  useEffect(() => {
    const int = setInterval(() => setTimeLeft(t => (t > 0 ? t - 1 : 45)), 1000);
    return () => clearInterval(int);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const typed = inputText.trim().toUpperCase();
    if (!typed) return;
    
    let status: 'valid' | 'invalid' | 'target' = 'valid';
    let points = calcPoints(typed.length);
    let reason = '';
    let targetLevel;

    // Check if contains ALL demo letters
    const missing = DEMO_LETTERS.find(l => !typed.includes(l));
    if (missing) {
      status = 'invalid';
      points = 0;
      reason = `Missing '${missing}'`;
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 500);
    } else if (typed.length >= 8) {
      status = 'target';
      points += 500;
      targetLevel = 4; // Epic
    }
    
    const entry: WordEntry = {
      id: `w${Date.now()}`,
      word: typed,
      points,
      status,
      reason,
      targetLevel
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
        <div className="flex gap-4 items-center">
          <button 
            className="w-10 h-10 bg-white rounded-xl shadow-sm text-plum/50 hover:bg-black/5 hover:text-plum flex items-center justify-center font-bold"
            onClick={() => navigate('/prototype/links-v3')}
          >
            ←
          </button>
          <div className="flex items-center gap-2 bg-white/60 px-4 py-2 rounded-2xl shadow-sm border border-white/50">
            <Trophy className="w-5 h-5 text-soft-purple" />
            <span className="font-black text-xl tracking-tight">Wave 2/3</span>
          </div>

          <div className="ml-2">
            <TensionTimer 
              timeLeft={timeLeft} 
              maxTime={45} 
              defaultColor="#34D399" 
              sizeClass="w-12 h-12" 
              textClass="text-xl" 
              strokeWidth={12} 
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {[2,3,4,5,6].map(num => (
            <button 
              key={num}
              onClick={() => setPlayerCount(num)}
              className={`w-10 h-10 rounded-2xl font-bold transition-all flex items-center justify-center shadow-sm ${
                playerCount === num 
                  ? "bg-plum text-white transform scale-110" 
                  : "bg-white text-plum opacity-70 hover:opacity-100 hover:bg-white"
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Board Content ── */}
      <div className="w-full max-w-4xl flex flex-col md:flex-row gap-8 items-start">
        
        {/* Left Side: Active Player & The Target Letters ── */}
        <div className="flex-1 w-full space-y-8 flex flex-col">
          
          <LetterPool 
            letters={DEMO_LETTERS} 
            inputText={inputText} 
            title="Shared Letters Pool" 
            subtitle="Every word must contain ALL letters above." 
          />

          {/* Active Player Input Area */}
          <section className="w-full">
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
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-2xl" style={{ color: activeColor.fill }}>{activeScore}</div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60" style={{ color: activeColor.fill }}>Points</div>
                </div>
              </div>

              {/* Sprint Quick Actions */}
              <div className="mb-4 flex flex-wrap gap-2">
                 <button 
                  onClick={() => setShuffleTokens(p => ({...p, single: Math.max(0, p.single-1)}))}
                  disabled={shuffleTokens.single === 0}
                  className="bg-white/80 hover:bg-white text-plum px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                 >
                   <RotateCw className="w-3 h-3" />
                   Reroll Single ({shuffleTokens.single})
                 </button>
                 <button 
                   onClick={() => setShuffleTokens(p => ({...p, all: Math.max(0, p.all-1)}))}
                   disabled={shuffleTokens.all === 0}
                   className="bg-white/80 hover:bg-white text-plum px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                 >
                   <Shuffle className="w-3 h-3" />
                   Reroll All ({shuffleTokens.all})
                 </button>
              </div>

              <form onSubmit={handleSubmit} className="relative" style={shakeInput ? { transform: 'translateX(10px) rotate(1deg)', transition: 'transform 0.1s' } : { transition: 'transform 0.1s' }}>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                  placeholder={`Word using ${DEMO_LETTERS.join(", ")}`}
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
                        word.status === 'target' ? 'bg-amber-400 border-amber-500 text-white shadow-amber-500/50' : 
                        'bg-white/70 border-black/5'
                      }`}
                    >
                      {word.status === 'target' && <Target className="w-3 h-3 text-white" />}
                      <span className={`font-bold text-sm tracking-widest uppercase ${word.status === 'invalid' ? 'line-through text-peach' : word.status === 'target' ? 'text-white drop-shadow-sm' : 'text-plum'}`}>{word.word}</span>
                      {word.status !== 'invalid' && <span className={`text-[10px] font-black opacity-80 ${word.status === 'target' ? 'text-white' : 'text-plum'}`}>+{word.points}</span>}
                      {word.status === 'invalid' && <span className="text-[10px] font-black uppercase text-peach">{word.reason}</span>}
                    </div>
                  ))}
                </div>
              )}
            </ClayCard>
          </section>
        </div>

        {/* Right Side: Opponents (Minimalist List) ── */}
        <div className="w-full md:w-80 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-plum/50 uppercase tracking-widest pl-2">Sprint Leaderboard</h2>
          {opponents.sort((a,b) => b.score - a.score).map((opp) => (
            <ClayCard 
              key={opp.index} 
              elevation="flat" 
              padding="sm"
              className={`flex flex-col gap-3 cursor-pointer transition-all ${expandedOpponent === opp.index ? 'ring-2 ring-offset-2 ring-offset-clay-cream' : 'hover:bg-black/5'}`}
              onClick={() => setExpandedOpponent(expandedOpponent === opp.index ? null : opp.index)}
              style={expandedOpponent === opp.index ? { ringColor: opp.color.fill } : undefined}
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
                    <div className="text-xs font-bold opacity-50 uppercase tracking-widest mt-1">
                      {demoAllWords[opp.index].length} Words
                    </div>
                  </div>
                </div>
                <div className="font-black text-xl text-plum/80 p-2">{opp.score}</div>
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