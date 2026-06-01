import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { Zap, Target, Shuffle, RotateCw, ArrowLeft, Wifi, WifiOff, Trophy, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { AVATARS } from "../assets/avatars";
import ClayCard from "./ui/ClayCard";
import TensionTimer from "./ui/TensionTimer";
import LetterPool from "./ui/LetterPool";
import { PLAYER_COLORS, PlayerColor, calcPoints } from "./LinksBoardPrototype";

// ── Types ───────────────────────────────────────────────────────────────────

interface LinksSprintBoardV3Props { code?: string; playerId?: string; playerName?: string; }

interface SprintWord {
  id: string; player_id: string; player_name: string;
  word: string; word_length: number; points: number;
  is_target: boolean; target_level: number | null; wave: number; created_at: string;
}

// ── Letter Sets ─────────────────────────────────────────────────────────────
interface LetterSet { letters: string[]; wordCount: number; }
interface LetterSetsTiers { easy: LetterSet[]; medium: LetterSet[]; hard: LetterSet[]; expert: LetterSet[]; master: LetterSet[]; _meta: any; }
let letterSetsCache: LetterSetsTiers | null = null;
async function loadLetterSets(): Promise<LetterSetsTiers> {
  if (letterSetsCache) return letterSetsCache;
  const resp = await fetch("/words/letter_sets.json");
  letterSetsCache = await resp.json();
  return letterSetsCache!;
}
const WAVE_TIER: Record<number, keyof LetterSetsTiers> = { 1: "easy", 2: "medium", 3: "hard", 4: "expert", 5: "master" };

const wordFileCache = new Map<string, string[]>();
async function fetchWordFile(letter: string): Promise<string[]> {
  const key = letter.toLowerCase();
  if (wordFileCache.has(key)) return wordFileCache.get(key)!;
  try { const resp = await fetch(`/words/by_letter/${key}.json`); if (!resp.ok) return []; const words: string[] = await resp.json(); wordFileCache.set(key, words); return words; } catch { return []; }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseArenaState(raw: any): any { if (!raw) return null; if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return null; } } return raw; }
function getPlayerColorByIndex(index: number): PlayerColor { return PLAYER_COLORS[index % PLAYER_COLORS.length]; }
function getPlayerColorByName(playerId: string, players: any[]): PlayerColor { const idx = players.findIndex((p: any) => p.id === playerId); return getPlayerColorByIndex(idx >= 0 ? idx : 0); }

const TARGET_LEVELS: Record<number, { level: number; bonus: number; label: string }> = {
  1: { level: 1, bonus: 100, label: "Common" }, 2: { level: 2, bonus: 200, label: "Uncommon" }, 3: { level: 3, bonus: 350, label: "Rare" }, 4: { level: 4, bonus: 500, label: "Epic" }, 5: { level: 5, bonus: 750, label: "Legendary" },
};
const LEVEL_COLORS: Record<number, string> = { 1: "#A8A8A8", 2: "#34D399", 3: "#60A5FA", 4: "#A78BFA", 5: "#FBBF24" };
const LEVEL_GLOW: Record<number, string> = { 1: "0 0 8px rgba(168,168,168,0.3)", 2: "0 0 12px rgba(52,211,153,0.4)", 3: "0 0 16px rgba(96,165,250,0.5)", 4: "0 0 20px rgba(167,139,250,0.5)", 5: "0 0 24px rgba(251,191,36,0.6)" };

const AvatarIcon = memo(function AvatarIcon({ src, size = "32px", className = "" }: { src: string; size?: string; className?: string }) {
  return <img src={src} alt="" className={`block ${className}`} style={{ width: size, height: size }} />;
});

// ── LiveFeed ────────────────────────────────────────────────────────────────
const LiveFeed = memo(function LiveFeed({ sprintWords, players }: { sprintWords: SprintWord[]; players: any[] }) {
  const events = useMemo(() => {
    const recent = [...sprintWords].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20);
    return recent.map((w) => {
      const color = getPlayerColorByName(w.player_id, players);
      const name = players.find((p: any) => p.id === w.player_id)?.name || w.player_name;
      return {
        id: w.id,
        text: w.is_target ? `🎯 ${name} hit TARGET ${w.word.toUpperCase()} +${w.points}` : `${name} claimed ${w.word.toUpperCase()} +${w.points}`,
        isTarget: w.is_target,
        color: w.is_target ? LEVEL_COLORS[w.target_level || 1] : color.fill,
      };
    });
  }, [sprintWords, players]);
  return (
    <div className="flex flex-col h-full">
      <ClayCard elevation="flat" padding="sm" className="flex flex-col gap-3 min-h-[300px] overflow-y-auto scrollbar-hide border border-black/5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 opacity-30"><span className="text-2xl">⚡</span><span className="text-xs font-bold">Waiting for words...</span></div>
        ) : events.map((e) => (
          <div key={e.id} className={`text-sm font-black flex items-center gap-2.5 ${e.isTarget ? 'text-amber-500' : 'text-plum/80'}`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
            <span>{e.text}</span>
          </div>
        ))}
      </ClayCard>
    </div>
  );
});

// ── GameOverScreen ──────────────────────────────────────────────────────────

function GameOverScreen({ players, scores, sprintWords, gameCode, handleLeave }: {
  players: any[]; scores: Record<string, number>; sprintWords: SprintWord[]; gameCode: string; handleLeave: () => void;
}) {
  const sorted = [...players].sort((a: any, b: any) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const waveNumbers = Array.from(new Set(sprintWords.map(w => w.wave))).sort((a, b) => a - b);
  const [waveTab, setWaveTab] = useState<number | "overall">("overall");
  const filteredWords = waveTab === "overall" ? sprintWords : sprintWords.filter(w => w.wave === waveTab);
  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80"><button onClick={handleLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach"><ArrowLeft className="w-3.5 h-3.5" /> Leave</button><span className="font-outfit font-black text-lg text-plum">⚡ LINKS SPRINT</span><span className="text-[10px] font-mono text-warm-gray/50">{gameCode}</span></div>
      <div className="flex-1 flex flex-col items-center p-6 gap-6 overflow-y-auto">
        <div className="text-center space-y-2"><Trophy className="w-16 h-16 mx-auto text-butter" /><h1 className="font-outfit font-black text-3xl text-plum">Game Over!</h1>{sorted[0] && <p className="text-lg font-bold" style={{ color: (getPlayerColorByName(sorted[0].id, players)).fill }}>🏆 {sorted[0].name} wins!</p>}</div>
        <div className="w-full max-w-md"><div className="flex items-center gap-1 p-1 rounded-xl bg-warm-gray/5 border border-warm-gray/10">{["overall", ...waveNumbers].map(n => (<button key={n} onClick={() => setWaveTab(n as any)} className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${waveTab === n ? "bg-white shadow-sm text-plum" : "text-warm-gray/50"}`}>{n === "overall" ? "Overall" : `Wave ${n}`}</button>))}</div></div>
        <div className="w-full max-w-md space-y-2">{sorted.map((p: any, idx: number) => { const c = getPlayerColorByName(p.id, players); const pWords = filteredWords.filter((w: SprintWord) => w.player_id === p.id); const pts = pWords.reduce((s: number, w: SprintWord) => s + w.points, 0); return (<div key={p.id} className="p-4 rounded-xl border" style={{ backgroundColor: idx === 0 ? "#FEF3C7" : "#fff", borderColor: idx === 0 ? "#FCD34D" : "rgba(0,0,0,0.08)" }}><div className="flex items-center gap-3"><span className="text-2xl">{idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}</span><div className="flex-1"><p className="font-outfit font-bold text-sm text-plum">{p.name}</p><p className="text-[10px] text-warm-gray/50">{pWords.length} word{pWords.length !== 1 ? "s" : ""}</p></div><p className="font-mono font-bold text-lg" style={{ color: c.fill }}>{pts}</p></div></div>); })}</div>
        <button onClick={handleLeave} className="px-8 py-3 rounded-2xl font-outfit font-black text-sm bg-soft-purple text-white shadow-lg">Return to Lobby</button>
      </div>
    </div>
  );
}

// ── WaveResultsScreen ───────────────────────────────────────────────────────

function WaveResultsScreen({ players, scores, sprintWords, gameState, gameCode, handleLeave, handleStartWave, isHost, isStartingWave }: {
  players: any[]; scores: Record<string, number>; sprintWords: SprintWord[]; gameState: any; gameCode: string; handleLeave: () => void; handleStartWave: () => void; isHost: boolean; isStartingWave: boolean;
}) {
  const sorted = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const wave = gameState.currentWave;
  const totalWaves = gameState.totalWaves;
  const isLastWave = wave >= totalWaves;
  const targets = gameState.targetWords || [];
  const waveWords = sprintWords.filter(w => w.wave === wave);
  const [rExpandedPlayers, setRExpandedPlayers] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setRExpandedPlayers(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80"><button onClick={handleLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach"><ArrowLeft className="w-3.5 h-3.5" /> Leave</button><span className="font-outfit font-black text-lg text-plum">⚡ LINKS SPRINT</span><span className="text-[10px] font-mono text-warm-gray/50">{gameCode}</span></div>
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 gap-6 overflow-y-auto">
        <div className="text-center space-y-2"><div className="text-4xl mb-2">🎯</div><h1 className="font-outfit font-black text-3xl text-plum">Wave {wave} Complete!</h1><p className="text-sm text-warm-gray/60">{isLastWave ? "Final wave finished!" : `Wave ${wave + 1} of ${totalWaves} coming up`}</p></div>
        <div className="w-full max-w-md space-y-2"><h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest text-center">Target Words Revealed</h3><div className="flex flex-wrap gap-2 justify-center">{targets.map((t: any, i: number) => { const level = t.level || 1; const wasHit = sprintWords.some(w => w.is_target && w.word.toLowerCase() === (t.word || "").toLowerCase()); return (<span key={i} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all" style={{ backgroundColor: wasHit ? LEVEL_COLORS[level] + "25" : "rgba(0,0,0,0.03)", borderColor: wasHit ? LEVEL_COLORS[level] : "rgba(0,0,0,0.08)", color: wasHit ? LEVEL_COLORS[level] : "#9CA3AF", textDecoration: wasHit ? "none" : "line-through", boxShadow: wasHit ? LEVEL_GLOW[level] : "none" }}>{wasHit ? "✓" : "✗"} {t.word || "???"}<span className="text-[9px] opacity-60">+{t.bonus || 0}</span></span>); })}</div></div>
        <div className="w-full max-w-md space-y-2"><h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest text-center">Standings</h3>{sorted.map((p: any, idx: number) => { const c = getPlayerColorByName(p.id, players); const pWords = waveWords.filter((w: SprintWord) => w.player_id === p.id); const pts = pWords.reduce((s: number, w: SprintWord) => s + w.points, 0); const isExpanded = rExpandedPlayers.has(p.id); return (<div key={p.id} className="p-4 rounded-xl border" style={{ backgroundColor: idx === 0 ? "#FEF3C7" : "#fff", borderColor: idx === 0 ? "#FCD34D" : "rgba(0,0,0,0.08)" }}><div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(p.id)}><span className="text-xl">{idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}</span><div className="flex-1"><p className="font-outfit font-bold text-sm text-plum truncate">{p.name}</p><p className="text-[10px] text-warm-gray/50">{pWords.length} word{pWords.length !== 1 ? "s" : ""}</p></div><div className="flex items-center gap-2"><p className="font-mono font-bold text-lg" style={{ color: c.fill }}>{pts}</p><ChevronRight className={`w-4 h-4 text-warm-gray/40 transition-transform ${isExpanded ? "rotate-90" : ""}`} /></div></div><div className="overflow-hidden transition-all duration-300" style={{ maxHeight: isExpanded ? '60px' : '0', opacity: isExpanded ? 1 : 0, paddingTop: isExpanded ? '8px' : '0' }}><div className="flex items-center gap-3 pl-8 text-[10px] font-bold"><span className="text-mint">+{pts} earned</span></div></div></div>); })}</div>
        {isHost && (<button onClick={handleStartWave} disabled={isStartingWave} className="px-8 py-3 rounded-2xl font-outfit font-black text-sm text-white shadow-lg transition-all flex items-center gap-2 disabled:opacity-60" style={{ backgroundColor: isLastWave ? "#7C5CFC" : "#34D399", boxShadow: isLastWave ? "0 6px 24px rgba(124,92,252,0.35)" : "0 6px 24px rgba(52,211,153,0.35)" }}>{isStartingWave ? (<><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Starting...</>) : (<>{isLastWave ? "View Final Results" : `Start Wave ${wave + 1}`}<ChevronRight className="w-4 h-4" /></>)}</button>)}{!isHost && <p className="text-xs text-warm-gray/50 font-bold animate-pulse">Waiting for host...</p>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function LinksSprintBoardV3({ code: gameCode, playerId: propPlayerId, playerName: propPlayerName }: LinksSprintBoardV3Props) {
  // ── Stable identity ──────────────────────────────────────────────────
  const [effectivePlayerId] = useState<string>(() => { if (propPlayerId && UUID_RE.test(propPlayerId)) return propPlayerId; return store.ensurePlayerId(); });
  useEffect(() => { if (store.getPlayerId() !== effectivePlayerId) store.setPlayerId(effectivePlayerId); }, [effectivePlayerId]);
  const playerName = propPlayerName || store.getPlayerName() || "Player";

  // ── Core state ───────────────────────────────────────────────────────
  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [gameState, setGameState] = useState<any>({ phase: "WAVE_INTRO", currentWave: 1, totalWaves: 3, letters: [], targetWords: [], usedWords: [], scores: {}, waveDuration: 60, targetReveals: [], gameStartTime: null });
  const [sprintWords, setSprintWords] = useState<SprintWord[]>([]);
  const [isGameOver, setIsGameOver] = useState(false);
  const [typedWord, setTypedWord] = useState("");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingWave, setIsStartingWave] = useState(false);
  const isStartingWaveRef = useRef(false);
  const [wordFeedback, setWordFeedback] = useState<{ type: string; message?: string }>({ type: "typing" });
  const [shakeKey, setShakeKey] = useState(0);
  const [targetHitFlash, setTargetHitFlash] = useState<{ word: string; level: number } | null>(null);
  const [waveTimer, setWaveTimer] = useState(60);
  const [waveIntroCountdown, setWaveIntroCountdown] = useState(3);
  const [showDisconnected, setShowDisconnected] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitGuardRef = useRef(false);
  const waveStartFiredRef = useRef(false);
  const waveEndFiredRef = useRef(false);
  const shuffleGuardRef = useRef(false);
  const playersLenRef = useRef(players.length);
  const isHost = lobby?.host_id === effectivePlayerId;
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { playersLenRef.current = players.length; }, [players.length]);
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'leaderboard' | 'feed'>('leaderboard');

  // ── Shuffle state ────────────────────────────────────────────────────
  const [shuffleAllCount, setShuffleAllCount] = useState(0);
  const [shuffleSingleCount, setShuffleSingleCount] = useState(0);
  const [shufflePenaltyFlash, setShufflePenaltyFlash] = useState<{ message: string; type: "warning" | "danger" } | null>(null);
  const shufflePenaltyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────
  const phase = gameState.phase;
  const letters: string[] = (gameState.playerLetters?.[effectivePlayerId] || gameState.letters) || [];
  const usedWords: string[] = gameState.usedWords || [];
  const playerTimers: Record<string, number> = gameState.playerTimers || {};
  const myTimer = playerTimers[effectivePlayerId] ?? waveTimer;
  const shuffleCounts: Record<string, { all?: number; single?: number }> = gameState.shuffleCounts || {};
  const shuffleDeductions: Record<string, number> = gameState.shuffleDeductions || {};
  const myShuffles = shuffleCounts[effectivePlayerId] || {};

  useEffect(() => { if (myShuffles.all !== undefined) setShuffleAllCount(myShuffles.all); if (myShuffles.single !== undefined) setShuffleSingleCount(myShuffles.single); }, [myShuffles.all, myShuffles.single]);

  const myWords = useMemo(() => sprintWords.filter(w => w.player_id === effectivePlayerId), [sprintWords, effectivePlayerId]);
  const opponentWords = useMemo(() => sprintWords.filter(w => w.player_id !== effectivePlayerId), [sprintWords, effectivePlayerId]);
  const scores = useMemo(() => { const s: Record<string, number> = {}; players.forEach((p: any) => { s[p.id] = sprintWords.filter(w => w.player_id === p.id).reduce((sum, w) => sum + w.points, 0); }); return s; }, [players, sprintWords]);
  const myScore = scores[effectivePlayerId] || 0;
  const otherPlayers = players.filter((p: any) => p.id !== effectivePlayerId);

  // ── Realtime channel ─────────────────────────────────────────────────
  const { isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: `links-sprint:${gameCode}`, enablePresence: false,
    subscribeLobby: gameCode, subscribePlayers: gameCode, subscribeArenaAnswers: gameCode, answersTableName: "links_sprint_words",
    onLobbyChange: (payload: any) => {
      if (payload.eventType === "DELETE" || !payload.new) { window.location.href = "/"; return; }
      const parsed = parseArenaState(payload.new.arena_state); if (parsed) { setGameState(parsed); if (parsed.phase === "GAME_OVER") setIsGameOver(true); }
    },
    onPlayerChange: async () => { const { data } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false }); if (data) setPlayers(data); },
    onArenaAnswer: (payload: any) => { const newWord = payload.new as SprintWord; if (!newWord) return; setSprintWords((prev) => { if (prev.find(w => w.id === newWord.id)) return prev; return [...prev, newWord]; }); if (newWord.is_target && newWord.player_id === effectivePlayerId) { setTargetHitFlash({ word: newWord.word, level: newWord.target_level || 1 }); setTimeout(() => setTargetHitFlash(null), 2500); } },
    onReconnect: async () => { const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle(); const parsed = parseArenaState(lobbyData?.arena_state); if (parsed) setGameState(parsed); },
  });

  // ── Connection banner ────────────────────────────────────────────────
  useEffect(() => { if (!isConnected) { disconnectTimerRef.current = setTimeout(() => setShowDisconnected(true), 5000); } else { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; setShowDisconnected(false); } return () => { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); if (shufflePenaltyTimerRef.current) clearTimeout(shufflePenaltyTimerRef.current); }; }, [isConnected]);

  // ── Initial fetch ────────────────────────────────────────────────────
  const initRef = useRef(false);
  useEffect(() => { if (initRef.current) return; initRef.current = true; let cancelled = false;
    const init = async () => { const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle(); if (cancelled) return; if (lobbyData) { setLobby(lobbyData); const parsed = parseArenaState(lobbyData.arena_state); if (parsed) { setGameState(parsed); if (parsed.phase === "GAME_OVER") setIsGameOver(true); } }
      const { data: playerData } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false }); if (!cancelled && playerData) setPlayers(playerData);
      const { data: wordsData } = await supabase.from("links_sprint_words").select("*").eq("lobby_code", gameCode).order("created_at", { ascending: true }); if (!cancelled && wordsData) setSprintWords(wordsData); };
    init(); return () => { cancelled = true; };
  }, [gameCode]);

  useEffect(() => { setTypedWord(""); setWordFeedback({ type: "typing" }); }, [gameState.currentWave]);

  // ── Wave intro countdown ─────────────────────────────────────────────
  useEffect(() => { if (phase !== "WAVE_INTRO") { setWaveIntroCountdown(3); waveStartFiredRef.current = false; isStartingWaveRef.current = false; setIsStartingWave(false); return; }
    waveStartFiredRef.current = false;
    const interval = setInterval(() => { setWaveIntroCountdown(prev => { const next = prev - 1; if (next <= 0 && isHostRef.current && !waveStartFiredRef.current) { waveStartFiredRef.current = true; handleStartWave(); } return next > 0 ? next : 0; }); }, 1000);
    return () => clearInterval(interval);
  }, [phase]); // handleStartWave intentionally omitted from deps — reads all values via refs

  // ── Wave timer ───────────────────────────────────────────────────────
  const gameStateRef = useRef(gameState); useEffect(() => { gameStateRef.current = gameState; });
  useEffect(() => { if (phase !== "PLAYING") { setWaveTimer(gameState.waveDuration || 60); waveEndFiredRef.current = false; return; }
    setWaveTimer(gameState.waveDuration || 60); waveEndFiredRef.current = false;
    const interval = setInterval(() => { setWaveTimer(prev => { const next = prev - 1; if (next <= 0 && isHostRef.current && !waveEndFiredRef.current) { waveEndFiredRef.current = true; handleEndWave(); } return next > 0 ? next : 0; }); }, 1000);
    return () => clearInterval(interval);
  }, [phase, gameState.currentWave]);

  // ── Polling fallback ─────────────────────────────────────────────────
  useEffect(() => { const poll = setInterval(async () => { if (isConnected) return; try { const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle(); if (lobbyData) { setLobby(lobbyData); const parsed = parseArenaState(lobbyData.arena_state); if (parsed) { setGameState(parsed); if (parsed.phase === "GAME_OVER") setIsGameOver(true); } } const { data: playerData } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false }); if (playerData) setPlayers(playerData); const { data: wordsData } = await supabase.from("links_sprint_words").select("*").eq("lobby_code", gameCode).order("created_at", { ascending: true }); if (wordsData) setSprintWords(wordsData); } catch {} }, 3000); return () => clearInterval(poll); }, [gameCode, isConnected]);

  // ── Word validation (dictionary) ─────────────────────────────────────
  const [validWordCache, setValidWordCache] = useState<Set<string> | null>(null);
  useEffect(() => { if (letters.length === 0) return; setValidWordCache(null); let cancelled = false;
    const init = async () => { const wordSets: Set<string>[] = []; for (const letter of letters) { const words = await fetchWordFile(letter); if (words.length > 0) wordSets.push(new Set(words)); } if (cancelled) return; if (wordSets.length === 0) { setValidWordCache(null); return; }
      const first = wordSets[0]; const intersection = new Set<string>(); for (const word of first) { if (word.length >= 3 && word.length <= 15 && wordSets.every(s => s.has(word))) intersection.add(word); } if (!cancelled) setValidWordCache(intersection); };
    init(); return () => { cancelled = true; };
  }, [letters]);

  const validateWord = useCallback((word: string) => {
    if (!word || word.length < 3) return { type: "typing" as const }; const lower = word.toLowerCase().trim();
    if (!/^[a-z]{3,15}$/.test(lower)) return { type: "invalid" as const, message: "Letters only, 3-15 chars" };
    for (const letter of letters) { if (!lower.includes(letter.toLowerCase())) return { type: "missing" as const, message: `Missing "${letter}"` }; }
    if (validWordCache && !validWordCache.has(lower)) return { type: "invalid" as const, message: "Not in dictionary — names/places may be missing" };
    if (usedWords.includes(lower) || sprintWords.some(w => w.word === lower)) { const claimer = sprintWords.find(w => w.word === lower); return { type: "used" as const, message: claimer ? `${claimer.player_name} already claimed it` : "Already used" }; }
    return { type: "valid" as const };
  }, [letters, usedWords, sprintWords, validWordCache]);

  const handleSetInput = useCallback((v: string) => { setTypedWord(v); if (v.length === 0) setWordFeedback({ type: "typing" }); else { const fb = validateWord(v); setWordFeedback(fb); } }, [validateWord]);

  // ── Start wave ───────────────────────────────────────────────────────
  const handleStartWave = useCallback(async () => { if (!isHostRef.current) return; if (isStartingWaveRef.current) return; isStartingWaveRef.current = true; setIsStartingWave(true);
    const gs = gameStateRef.current; const wave = gs.currentWave || 1; const playerCount = playersLenRef.current || 2; const tierKey = (WAVE_TIER[wave] || "easy") as keyof LetterSetsTiers;
    let newLetters: string[]; try { const sets = await loadLetterSets(); const tier = sets[tierKey] || sets.easy; const picked = tier[Math.floor(Math.random() * tier.length)]; const settingLetterCount = lobby?.settings?.sprintLetterCount; const letterCount = settingLetterCount ? Math.min(settingLetterCount, picked.letters.length) : Math.min(Math.max(2, playerCount), picked.letters.length); newLetters = picked.letters.slice(0, letterCount); } catch { const allLetters = ['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q']; newLetters = [...allLetters].sort(() => Math.random() - 0.5).slice(0, Math.min(playerCount, 4)); }
    const targets: any[] = []; const usedTargetWords = new Set<string>();
    let allValidWords: string[] = [];
    try { const wordSets: Set<string>[] = []; for (const letter of newLetters) { const words = await fetchWordFile(letter); if (words.length > 0) wordSets.push(new Set(words)); } if (wordSets.length > 0) { const first = wordSets[0]; const intersection = new Set<string>(); for (const word of first) { if (wordSets.every((s) => s.has(word))) intersection.add(word); } allValidWords = Array.from(intersection).filter(w => w.length >= 3 && w.length <= 15); } } catch {}
    if (allValidWords.length > 0) { allValidWords.sort((a, b) => a.length - b.length); const tierRanges: [number, number][] = [[3, 4], [5, 6], [7, 8], [9, 10], [11, 15]]; for (let level = 1; level <= 5; level++) { const [min, max] = tierRanges[level - 1]; const pool = allValidWords.filter(w => w.length >= min && w.length <= max); if (pool.length === 0) continue; let word = pool[Math.floor(Math.random() * pool.length)]; let attempts = 0; while (usedTargetWords.has(word) && attempts < 20) { word = pool[Math.floor(Math.random() * pool.length)]; attempts++; } if (!usedTargetWords.has(word)) { usedTargetWords.add(word); targets.push({ word, level, bonus: TARGET_LEVELS[level]?.bonus || level * 100 }); } } if (targets.length === 0) { for (const word of allValidWords.slice(0, 5)) { if (!usedTargetWords.has(word)) { usedTargetWords.add(word); targets.push({ word, level: 1, bonus: TARGET_LEVELS[1]?.bonus || 100 }); } } } }
    setShuffleAllCount(0); setShuffleSingleCount(0);
    const { error } = await supabase.rpc("start_links_sprint_wave", { p_lobby_code: gameCode, p_letters: newLetters, p_target_words: targets }); if (error) console.error("[SPRINT] start_links_sprint_wave error:", error);
    isStartingWaveRef.current = false; setIsStartingWave(false);
  }, [gameCode, lobby?.settings?.sprintLetterCount]);

  // ── End wave ─────────────────────────────────────────────────────────
  const handleEndWave = useCallback(async () => { if (!isHostRef.current) return; if (gameStateRef.current.phase !== "PLAYING") return; const { error } = await supabase.rpc("end_links_sprint_wave", { p_lobby_code: gameCode }); if (error) console.error("[SPRINT] end_links_sprint_wave error:", error); }, [gameCode]);

  // ── Shuffle ──────────────────────────────────────────────────────────
  const handleShuffleAll = useCallback(async () => { if (phase !== "PLAYING" || shuffleGuardRef.current) return; shuffleGuardRef.current = true;
    const allLetters = ['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q']; const newLetters = [...allLetters].sort(() => Math.random() - 0.5).slice(0, letters.length);
    const { data, error } = await supabase.rpc("shuffle_links_sprint_letters", { p_lobby_code: gameCode, p_player_id: effectivePlayerId, p_shuffle_type: "all", p_new_letters: newLetters }); shuffleGuardRef.current = false;
    if (!error && data?.success) { setShuffleAllCount(data.newAllShuffles || 1); setWaveTimer(prev => Math.max(0, prev - (data.timePenalty || 5))); setShufflePenaltyFlash({ message: data.newAllShuffles <= 1 ? `-5s · -${data.pointsDeduction || 0} pts (-25%)` : `-5s · -${data.pointsDeduction || 0} pts (-50%)`, type: data.newAllShuffles <= 1 ? "warning" : "danger" }); if (shufflePenaltyTimerRef.current) clearTimeout(shufflePenaltyTimerRef.current); shufflePenaltyTimerRef.current = setTimeout(() => setShufflePenaltyFlash(null), 3000); }
  }, [gameCode, effectivePlayerId, phase, letters.length]);

  const handleShuffleSingle = useCallback(async (index: number) => { if (phase !== "PLAYING" || shuffleGuardRef.current) return; shuffleGuardRef.current = true;
    const allLetters = ['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q']; const currentLetter = letters[index]?.toLowerCase(); const available = allLetters.filter(l => l.toLowerCase() !== currentLetter); const newLetter = available[Math.floor(Math.random() * available.length)]; const newLetters = [...letters]; newLetters[index] = newLetter;
    const { data, error } = await supabase.rpc("shuffle_links_sprint_letters", { p_lobby_code: gameCode, p_player_id: effectivePlayerId, p_shuffle_type: "single", p_new_letters: newLetters }); shuffleGuardRef.current = false;
    if (!error && data?.success) { setShuffleSingleCount(prev => prev + 1); setWaveTimer(prev => Math.max(0, prev - (data.timePenalty || 3))); setShufflePenaltyFlash({ message: `-3s · -${data.pointsDeduction || 0} pts (-25%)`, type: "warning" }); if (shufflePenaltyTimerRef.current) clearTimeout(shufflePenaltyTimerRef.current); shufflePenaltyTimerRef.current = setTimeout(() => setShufflePenaltyFlash(null), 3000); }
  }, [gameCode, effectivePlayerId, phase, letters]);

  // ── Submit word ──────────────────────────────────────────────────────
  const handleSubmitWord = useCallback(async () => { if (phase !== "PLAYING" || submitGuardRef.current || isSubmitting) return; if (wordFeedback.type !== "valid") { if (wordFeedback.type === "used") setShakeKey(k => k + 1); return; }
    const word = typedWord.trim(); if (!word || word.length < 3) return;
    submitGuardRef.current = true; setIsSubmitting(true); setSubmitStatus("Claiming...");
    const { data, error } = await supabase.rpc("submit_links_sprint_word", { p_lobby_code: gameCode, p_player_id: effectivePlayerId, p_word: word.toLowerCase() }); submitGuardRef.current = false; setIsSubmitting(false);
    if (error || data?.success === false) { const errMsg = data?.error || error?.message || "Submit failed"; setSubmitStatus(errMsg); if (data?.error_code === "ALREADY_USED") { setWordFeedback({ type: "used", message: "Already claimed!" }); setShakeKey(k => k + 1); } setTimeout(() => setSubmitStatus(null), 2500); return; }
    setTypedWord(""); setWordFeedback({ type: "typing" });
    if (data.is_target) { setTargetHitFlash({ word: data.word, level: data.target_level || 1 }); setTimeout(() => setTargetHitFlash(null), 2500); setSubmitStatus(`🎯 TARGET! +${data.points} pts`); } else { setSubmitStatus(`+${data.points} pts`); } setTimeout(() => setSubmitStatus(null), 2000);
  }, [gameCode, effectivePlayerId, phase, typedWord, wordFeedback.type, isSubmitting]);

  // ── Leave ────────────────────────────────────────────────────────────
  const handleLeave = async () => { if (confirm("Leave the game?")) { broadcast("player:leave", { playerId: effectivePlayerId }); await supabase.from("players").delete().eq("id", effectivePlayerId).eq("lobby_code", gameCode); if (isHost) { await supabase.from("lobbies").update({ mode: null, status: "LOBBY", arena_state: null }).eq("code", gameCode); } store.clearArenaHostCode(); window.location.href = `/lobby/${gameCode}?from=game`; } };

  // ── Loading ──────────────────────────────────────────────────────────
  if (!lobby) { return <div className="min-h-screen bg-clay-cream flex items-center justify-center"><div className="text-warm-gray/60 font-medium text-sm animate-pulse">Loading LINKS Sprint...</div></div>; }

  // ── Game Over ────────────────────────────────────────────────────────
  if (isGameOver || phase === "GAME_OVER") {
    return <GameOverScreen players={players} scores={scores} sprintWords={sprintWords} gameCode={gameCode!} handleLeave={handleLeave} />;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Wave Results Phase ───────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════
  if (phase === "WAVE_RESULTS") {
    return <WaveResultsScreen players={players} scores={scores} sprintWords={sprintWords} gameState={gameState} gameCode={gameCode!} handleLeave={handleLeave} handleStartWave={handleStartWave} isHost={isHost} isStartingWave={isStartingWave} />;
  }

  // ── Wave Intro Phase ──────────────────────────────────────────────────
  if (phase === "WAVE_INTRO") {
    return (
      <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-6 gap-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-mint-light text-mint border border-mint/20"><Zap className="w-4 h-4" /><span className="text-sm font-black uppercase tracking-widest">Wave {gameState.currentWave} of {gameState.totalWaves}</span></div>
          <h1 className="font-outfit font-black text-4xl text-plum mt-4">Get Ready!</h1>
          <p className="text-sm text-warm-gray/60 max-w-sm">{players.length} players · Type words containing ALL letters below</p>
        </div>
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-warm-gray/10" /><circle cx="50" cy="50" r="42" fill="none" stroke="#34D399" strokeWidth="6" strokeLinecap="round" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - waveIntroCountdown / 3)} className="transition-all duration-1000" /></svg>
          <div className="absolute inset-0 flex items-center justify-center"><span className="font-mono font-black text-3xl text-mint tabular-nums">{waveIntroCountdown}</span></div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-center">{letters.map((l) => (<span key={l} className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-2xl font-outfit font-black shadow-lg animate-clay-pop" style={{ backgroundColor: "#34D399", color: "#fff", boxShadow: "0 6px 24px rgba(52,211,153,0.35)" }}>{l}</span>))}</div>
        <p className="text-xs text-warm-gray/50 font-bold">Every word must contain {letters.join(" + ")}</p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── RENDER: PLAYING phase (V3 layout) ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-clay-cream font-outfit text-plum flex flex-col">
      {showDisconnected && (
        <div className="sticky top-0 z-50 bg-peach-light border-b border-peach/30 px-4 py-3 flex items-center justify-center gap-3">
          <WifiOff className="w-4 h-4 text-peach animate-pulse" /><span className="text-peach text-xs font-bold uppercase tracking-widest">Connection lost — reconnecting...</span>
        </div>
      )}

      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pt-4 md:pt-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={handleLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /><span className="hidden sm:inline">Leave</span>
          </button>
          <div className="flex items-center gap-2 bg-white/60 px-3 py-1.5 rounded-2xl shadow-sm border border-white/50">
            <Trophy className="w-4 h-4 text-soft-purple" />
            <span className="font-black text-base">Wave {gameState.currentWave}/{gameState.totalWaves}</span>
          </div>

        </div>

        <div className="flex items-center gap-2">
          {!isConnected ? <WifiOff className="w-3.5 h-3.5 text-peach animate-pulse" /> : <Wifi className="w-3.5 h-3.5 text-mint" />}
          <div className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border bg-mint-light text-mint border-mint/30">Playing</div>
          <span className="text-[10px] font-mono text-warm-gray/50 hidden sm:inline">{gameCode}</span>
        </div>
      </div>

      {/* ── Main Board ──────────────────────────────────────────────── */}
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-8 pb-8 flex flex-col md:flex-row gap-8 items-start">
          {/* ── Left: Pool & Active Player ── */}
        <div className="flex-1 w-full space-y-8">
          {/* Timer centered above card */}
          <div className="flex justify-center">
            <TensionTimer timeLeft={myTimer} maxTime={gameState.waveDuration || 60} defaultColor="#34D399" sizeClass="w-12 h-12" textClass="text-lg" strokeWidth={12} />
          </div>

          <div className="flex justify-center">
            <LetterPool letters={letters} inputText={typedWord} title="" subtitle="These letters must be included in your word" />
          </div>

          <section className="w-full">
            <ClayCard elevation="flat" padding="md" className="relative overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl p-1 shadow-sm flex items-center justify-center">
                    <AvatarIcon src={AVATARS[0].src} size="100%" />
                  </div>
                  <div>
                    <div className="font-bold text-lg leading-tight text-plum">{playerName || "You"}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-2xl text-plum">{myScore}</div>
                  <div className="text-xs font-bold uppercase tracking-widest opacity-60 text-plum">Points</div>
                </div>
              </div>

              {/* Shuffle buttons */}
              <div className="mb-4 flex flex-wrap gap-2">
                <button onClick={() => handleShuffleSingle(0)} disabled={letters.length === 0} className="bg-white/80 hover:bg-white text-plum px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50">
                  <RotateCw className="w-3 h-3" />Reroll Letter
                </button>
                <button onClick={handleShuffleAll} className="bg-white/80 hover:bg-white text-plum px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all">
                  <Shuffle className="w-3 h-3" />Reroll All
                </button>
              </div>

              {/* Shuffle penalty flash */}
              {shufflePenaltyFlash && (
                <div className={`mb-3 px-3 py-1.5 rounded-xl text-[10px] font-bold animate-slide-up-fade ${shufflePenaltyFlash.type === "danger" ? "bg-peach-light text-peach border border-peach/30" : "bg-butter-light text-butter border border-butter/30"}`}>
                  {shufflePenaltyFlash.message}
                </div>
              )}

              {/* Target hit flash */}
              {targetHitFlash && (
                <div className="mb-3 px-5 py-2.5 rounded-2xl border-2 shadow-2xl flex items-center gap-2 animate-slide-up-fade" style={{ backgroundColor: LEVEL_COLORS[targetHitFlash.level] + "20", borderColor: LEVEL_COLORS[targetHitFlash.level], boxShadow: LEVEL_GLOW[targetHitFlash.level] }}>
                  <Target className="w-4 h-4" style={{ color: LEVEL_COLORS[targetHitFlash.level] }} />
                  <span className="text-sm font-black" style={{ color: LEVEL_COLORS[targetHitFlash.level] }}>TARGET! +{TARGET_LEVELS[targetHitFlash.level]?.bonus || 0}</span>
                </div>
              )}

              {submitStatus && <div className={`text-center text-xs font-bold mb-2 animate-clay-pop ${submitStatus.includes("+") || submitStatus.includes("🎯") ? "text-mint" : "text-peach"}`}>{submitStatus}</div>}

              {/* Input */}
              <form onSubmit={(e) => { e.preventDefault(); handleSubmitWord(); }} key={shakeKey} className={`relative ${shakeKey ? 'animate-shake' : ''}`}>
                <input type="text" value={typedWord}
                  onChange={(e) => handleSetInput(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 15).toUpperCase())}
                  placeholder="Type word"
                  className={`w-full bg-warm-white text-plum text-2xl font-black font-mono tracking-[0.1em] rounded-2xl py-4 pl-6 pr-6 border-2 border-warm-gray/15 outline-none focus:border-soft-purple/40 focus:ring-2 focus:ring-soft-purple/20 transition-all ${wordFeedback.type === 'valid' ? '!border-mint/50 !ring-mint/20' : wordFeedback.type === 'missing' || wordFeedback.type === 'used' || wordFeedback.type === 'invalid' ? '!border-peach/50 !ring-peach/20' : ''}`}
                  autoFocus autoComplete="off"                  />
                </form>

              {/* Word feedback */}
              <div className="h-5 mt-1">
                {wordFeedback.type === "valid" && <p className="text-xs font-bold text-mint animate-clay-pop">+{calcPoints(typedWord.length)} points — press Enter</p>}
                {wordFeedback.type === "missing" && <p className="text-xs font-bold text-peach/80">{wordFeedback.message}</p>}
                {wordFeedback.type === "used" && <p className="text-xs font-bold text-butter">{wordFeedback.message}</p>}
                {wordFeedback.type === "invalid" && <p className="text-xs font-bold text-peach/60">{wordFeedback.message}</p>}
              </div>

              {/* Word history pills */}
              {myWords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 max-h-32 overflow-y-auto scrollbar-hide">
                  {[...myWords].reverse().map((word) => (
                    <div key={word.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm ${word.is_target ? '' : 'bg-white/70 border-black/5'}`}
                      style={word.is_target ? { backgroundColor: LEVEL_COLORS[word.target_level || 1] + "25", borderColor: LEVEL_COLORS[word.target_level || 1], boxShadow: LEVEL_GLOW[word.target_level || 1] } : undefined}>
                      {word.is_target && <Target className="w-3 h-3" style={{ color: LEVEL_COLORS[word.target_level || 1] }} />}
                      <span className="font-bold text-sm tracking-widest uppercase text-plum" style={word.is_target ? { color: LEVEL_COLORS[word.target_level || 1] } : undefined}>{word.word}</span>
                      <span className="text-[10px] font-black opacity-60 text-plum">+{word.points}</span>
                    </div>
                  ))}
                </div>
              )}
            </ClayCard>
          </section>
        </div>

        {/* ── Right: Tabbed Sidebar ── */}
        <div className="w-full md:w-80 flex flex-col gap-4">
          <div className="flex bg-white/50 p-1 rounded-2xl border border-black/5 shadow-inner">
            <button className={`flex-1 py-2 text-sm font-bold uppercase tracking-widest rounded-xl transition-all ${activeSidebarTab === 'leaderboard' ? 'bg-white shadow-sm text-plum' : 'text-plum/50 hover:bg-white/50'}`}
              onClick={() => setActiveSidebarTab('leaderboard')}>Leaderboard</button>
            <button className={`flex-1 py-2 text-sm font-bold uppercase tracking-widest rounded-xl transition-all ${activeSidebarTab === 'feed' ? 'bg-white shadow-sm text-plum' : 'text-plum/50 hover:bg-white/50'}`}
              onClick={() => setActiveSidebarTab('feed')}>Live Feed</button>
          </div>

          {activeSidebarTab === 'leaderboard' ? (
            <div className="flex flex-col gap-4">
              {/* Your card */}
              <ClayCard elevation="flat" padding="sm" className="flex items-center justify-between ring-2 ring-warm-gray/20 ring-offset-2 ring-offset-clay-cream">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner bg-warm-gray/50"><AvatarIcon src={AVATARS[0].src} size="28px" /></div>
                  <div><div className="font-bold text-md leading-tight text-plum">You</div><div className="text-xs font-bold opacity-50 uppercase mt-1">{myWords.length} Words</div></div>
                </div>
                <div className="font-black text-xl text-plum/80">{myScore}</div>
              </ClayCard>

              {/* Opponents */}
              {otherPlayers.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0)).map((op) => {
                const color = getPlayerColorByName(op.id, players);
                const opScore = scores[op.id] || 0;
                const opWords = opponentWords.filter(w => w.player_id === op.id);
                const isExpanded = expandedOpponent === op.id;
                return (
                  <ClayCard key={op.id} elevation="flat" padding="sm"
                    className={`flex flex-col gap-3 cursor-pointer transition-all ${isExpanded ? 'ring-2 ring-offset-2 ring-offset-clay-cream' : 'hover:bg-black/5'}`}
                    onClick={() => setExpandedOpponent(isExpanded ? null : op.id)}
                    style={isExpanded ? { '--tw-ring-color': color.fill } as React.CSSProperties : undefined}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner" style={{ backgroundColor: color.fillLight }}><AvatarIcon src={AVATARS[(players.indexOf(op) + 1) % AVATARS.length].src} size="28px" /></div>
                        <div><div className="font-bold text-md leading-tight text-plum">{op.name}</div><div className="text-xs font-bold opacity-50 uppercase mt-1">{opWords.length} Words</div></div>
                      </div>
                      <div className="font-black text-xl text-plum/80">{opScore}</div>
                    </div>
                    {isExpanded && (
                      <div className="pt-3 border-t border-black/5 space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                        {opWords.length === 0 ? <div className="text-center text-sm font-bold opacity-50 py-2">No words yet</div> : opWords.map((word) => (
                          <div key={word.id} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-black/5 shadow-sm">
                            <span className="font-bold uppercase tracking-widest px-1">{word.word}</span>
                            <span className="font-bold opacity-50">+{word.points}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </ClayCard>
                );
              })}
            </div>
          ) : (
            <LiveFeed sprintWords={sprintWords} players={players} />
          )}
        </div>
      </div>
    </div>
  );
}
