import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { Zap, Target, Shuffle, RotateCw, ArrowLeft, Wifi, WifiOff, Trophy, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { AVATARS } from "../assets/avatars";
import ClayCard from "./ui/ClayCard";
import TensionTimer from "./ui/TensionTimer";
import LetterPool from "./ui/LetterPool";
import { PLAYER_COLORS, PlayerColor } from "./LinksBoardPrototype";
import { getPoolMultiplier, calcPointsWithPoolMultiplier, countPoolLettersInWord, fetchWordFile, generateLetterPool } from "../lib/linksHelpers";

// ── Types ───────────────────────────────────────────────────────────────────

interface LinksSprintBoardV3Props { code?: string; playerId?: string; playerName?: string; }

interface SprintWord {
  id: string; player_id: string; player_name: string;
  word: string; word_length: number; points: number;
  is_target: boolean; target_level: number | null; wave: number; created_at: string;
  pool_letters_used?: number;
  pool_multiplier?: number;
}

// Letter generation uses the hybrid anchor+spice engine from linksHelpers

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

// WaveResultsScreen removed — wave results now shown as overlay during WAVE_INTRO

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
  const [waveIntroCountdown, setWaveIntroCountdown] = useState(10);
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
  const [leaderboardWaveFilter, setLeaderboardWaveFilter] = useState<number | 'all'>('all');
  const prevLettersRef = useRef<string[]>([]);

  // ── Segment (Letter Shift) state ────────────────────────────────────
  const [segmentTimer, setSegmentTimer] = useState(0);
  const [shiftFlash, setShiftFlash] = useState(false);
  const [shiftOldLetters, setShiftOldLetters] = useState<string[]>([]);
  const [shiftNewLetters, setShiftNewLetters] = useState<string[]>([]);
  const [shiftAnimPhase, setShiftAnimPhase] = useState<'idle' | 'exit' | 'enter' | 'done'>('idle');
  const shiftFiredRef = useRef(false);

  // ── Shuffle state ────────────────────────────────────────────────────
  const [shuffleAllCount, setShuffleAllCount] = useState(0);
  const [shuffleSingleCount, setShuffleSingleCount] = useState(0);
  const [shufflePenaltyFlash, setShufflePenaltyFlash] = useState<{ message: string; type: "warning" | "danger" } | null>(null);
  const shufflePenaltyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────
  const phase = gameState.phase;
  const currentSegment: number = gameState.currentSegment || 1;
  const segmentsPerWave: number = gameState.segmentsPerWave || 1;
  const segmentDuration: number = gameState.segmentDuration || gameState.waveDuration || 60;
  const hasSegments = segmentsPerWave > 1;
  const letters: string[] = (gameState.playerLetters?.[effectivePlayerId] || gameState.letters) || [];
  // Track previous letters in render body (not useEffect) so shift detection reads truly old letters
  const prevLettersSnapshot = prevLettersRef.current;
  prevLettersRef.current = [...letters];
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

  // ── Shift flash animation (only on actual segment changes, not reconnect) ──
  const prevSegmentRef = useRef(1);
  useEffect(() => {
    const seg = gameState.currentSegment || 1;
    if (phase !== "PLAYING" || !hasSegments || seg <= prevSegmentRef.current) { prevSegmentRef.current = seg; return; }
    prevSegmentRef.current = seg;
    // prevLettersSnapshot was captured BEFORE the ref was updated this render
    setShiftOldLetters([...prevLettersSnapshot]);
    // letters (derived from current gameState) are already the NEW pool
    setShiftNewLetters([...letters]);
    setShiftFlash(true);
    setShiftAnimPhase('exit');
    setTypedWord(""); setWordFeedback({ type: "typing" });
    // Phase: exit (600ms) → enter (800ms) → done
    const t1 = setTimeout(() => setShiftAnimPhase('enter'), 600);
    const t2 = setTimeout(() => setShiftAnimPhase('done'), 1400);
    const t3 = setTimeout(() => { setShiftFlash(false); setShiftAnimPhase('idle'); }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [gameState.currentSegment]);

  // ── Wave intro countdown ─────────────────────────────────────────────
  useEffect(() => { if (phase !== "WAVE_INTRO") { setWaveIntroCountdown(10); waveStartFiredRef.current = false; isStartingWaveRef.current = false; setIsStartingWave(false); return; }
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

  // ── Segment timer (Letter Shifts) ───────────────────────────────────
  useEffect(() => {
    if (phase !== "PLAYING" || !hasSegments) { setSegmentTimer(0); shiftFiredRef.current = false; return; }
    // Use server-side segmentTimerEnd if available, otherwise calculate
    const segmentEnd = gameState.segmentTimerEnd;
    if (segmentEnd && typeof segmentEnd === 'number') {
      setSegmentTimer(Math.max(0, Math.ceil(segmentEnd - Date.now() / 1000)));
    } else {
      setSegmentTimer(segmentDuration);
    }
    shiftFiredRef.current = false;
    const interval = setInterval(() => {
      setSegmentTimer(prev => {
        const next = prev - 1;
        if (next <= 0 && isHostRef.current && !shiftFiredRef.current) {
          shiftFiredRef.current = true;
          handleShiftLetters();
        }
        return next > 0 ? next : 0;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, gameState.currentSegment, gameState.segmentTimerEnd]);

  // ── Polling fallback ─────────────────────────────────────────────────
  useEffect(() => { const poll = setInterval(async () => { if (isConnected) return; try { const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle(); if (lobbyData) { setLobby(lobbyData); const parsed = parseArenaState(lobbyData.arena_state); if (parsed) { setGameState(parsed); if (parsed.phase === "GAME_OVER") setIsGameOver(true); } } const { data: playerData } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false }); if (playerData) setPlayers(playerData); const { data: wordsData } = await supabase.from("links_sprint_words").select("*").eq("lobby_code", gameCode).order("created_at", { ascending: true }); if (wordsData) setSprintWords(wordsData); } catch {} }, 3000); return () => clearInterval(poll); }, [gameCode, isConnected]);

  // ── Word validation (redesigned: min 2 chars, at least 2 pool letters) ──
  const [validWordCache, setValidWordCache] = useState<Set<string> | null>(null);
  useEffect(() => { if (letters.length === 0) return; setValidWordCache(null); let cancelled = false;
    const init = async () => {
      // Build union of all words containing ANY pool letter (not intersection)
      const allWords = new Set<string>();
      for (const letter of letters) { const words = await fetchWordFile(letter); for (const w of words) { if (w.length >= 2 && w.length <= 15) allWords.add(w); } }
      if (!cancelled) setValidWordCache(allWords);
    };
    init(); return () => { cancelled = true; };
  }, [letters]);

  const validateWord = useCallback((word: string) => {
    if (!word || word.length < 2) return { type: "typing" as const }; const lower = word.toLowerCase().trim();
    if (!/^[a-z]{2,15}$/.test(lower)) return { type: "invalid" as const, message: "Letters only, 2-15 chars" };
    // Must contain at least 2 letters from the pool
    const poolCount = countPoolLettersInWord(lower, letters);
    if (poolCount < 2) return { type: "missing" as const, message: `Need at least 2 pool letters (found ${poolCount})` };
    if (validWordCache && !validWordCache.has(lower)) return { type: "invalid" as const, message: "Not in dictionary — names/places may be missing" };
    if (usedWords.includes(lower) || sprintWords.some(w => w.word === lower)) { const claimer = sprintWords.find(w => w.word === lower); return { type: "used" as const, message: claimer ? `${claimer.player_name} already claimed it` : "Already used" }; }
    return { type: "valid" as const, poolLettersUsed: poolCount };
  }, [letters, usedWords, sprintWords, validWordCache]);

  const handleSetInput = useCallback((v: string) => { setTypedWord(v); if (v.length === 0) setWordFeedback({ type: "typing" }); else { const fb = validateWord(v); setWordFeedback(fb); } }, [validateWord]);

  // ── End wave ─────────────────────────────────────────────────────────
  const handleEndWave = useCallback(async () => { if (!isHostRef.current) return; if (gameStateRef.current.phase !== "PLAYING") return; const { error } = await supabase.rpc("end_links_sprint_wave", { p_lobby_code: gameCode }); if (error) console.error("[SPRINT] end_links_sprint_wave error:", error); }, [gameCode]);

  // ── Shared helper: generate letters + targets for a wave ────────────
  const generateLettersAndTargets = useCallback(async (letterCount: number, wave: number) => {
    let newLetters: string[];
    try { newLetters = await generateLetterPool(letterCount, wave); } catch {
      const allL = ['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q'];
      newLetters = [...allL].sort(() => Math.random() - 0.5).slice(0, letterCount);
    }
    const targets: any[] = []; const usedTargetWords = new Set<string>();
    let allValidWords: string[] = [];
    try {
      const wordSets: Map<string, string[]> = new Map();
      for (const letter of newLetters) { const words = await fetchWordFile(letter); wordSets.set(letter, words); }
      const allWords = new Set<string>();
      for (const letter of newLetters) { for (const w of (wordSets.get(letter) || [])) { if (w.length >= 3 && w.length <= 15) allWords.add(w); } }
      const poolLower = new Set(newLetters.map(l => l.toLowerCase()));
      for (const word of allWords) { const lower = word.toLowerCase(); let hits = 0; for (const l of poolLower) { if (lower.includes(l)) { hits++; if (hits >= 2) { allValidWords.push(word); break; } } } }
    } catch {}
    if (allValidWords.length > 0) { allValidWords.sort((a, b) => a.length - b.length); const tierRanges: [number, number][] = [[3, 4], [5, 6], [7, 8], [9, 10], [11, 15]]; for (let level = 1; level <= 5; level++) { const [min, max] = tierRanges[level - 1]; const pool = allValidWords.filter(w => w.length >= min && w.length <= max); if (pool.length === 0) continue; let word = pool[Math.floor(Math.random() * pool.length)]; let attempts = 0; while (usedTargetWords.has(word) && attempts < 20) { word = pool[Math.floor(Math.random() * pool.length)]; attempts++; } if (!usedTargetWords.has(word)) { usedTargetWords.add(word); targets.push({ word, level, bonus: TARGET_LEVELS[level]?.bonus || level * 100 }); } } if (targets.length === 0) { for (const word of allValidWords.slice(0, 5)) { if (!usedTargetWords.has(word)) { usedTargetWords.add(word); targets.push({ word, level: 1, bonus: TARGET_LEVELS[1]?.bonus || 100 }); } } } }
    return { letters: newLetters, targets };
  }, []);

  // ── Start wave (uses shared helper) ─────────────────────────────────
  const handleStartWave = useCallback(async () => { if (!isHostRef.current) return; if (isStartingWaveRef.current) return; isStartingWaveRef.current = true; setIsStartingWave(true);
    const gs = gameStateRef.current; const wave = gs.currentWave || 1; const settingLetterCount = lobby?.settings?.sprintLetterCount; const letterCount = settingLetterCount || 4;
    const { letters: newLetters, targets } = await generateLettersAndTargets(letterCount, wave);
    setShuffleAllCount(0); setShuffleSingleCount(0);
    const { error } = await supabase.rpc("start_links_sprint_wave", { p_lobby_code: gameCode, p_letters: newLetters, p_target_words: targets }); if (error) console.error("[SPRINT] start_links_sprint_wave error:", error);
    isStartingWaveRef.current = false; setIsStartingWave(false);
  }, [gameCode, lobby?.settings?.sprintLetterCount, generateLettersAndTargets]);

  // ── Shift letters (Letter Shifts) ───────────────────────────────────
  const handleShiftLetters = useCallback(async () => { if (!isHostRef.current) return;
    try {
      const gs = gameStateRef.current; const wave = gs.currentWave || 1; const settingLetterCount = lobby?.settings?.sprintLetterCount; const letterCount = settingLetterCount || 4;
      const { letters: newLetters, targets } = await generateLettersAndTargets(letterCount, wave);
      setShuffleAllCount(0); setShuffleSingleCount(0);
      const { data, error } = await supabase.rpc("shift_sprint_letters", { p_lobby_code: gameCode, p_letters: newLetters, p_target_words: targets });
      if (error) console.error("[SPRINT] shift_sprint_letters error:", error);
      else if (data?.waveEnded) { /* wave ended via shift — server handled transition */ }
    } catch (e) { console.error("[SPRINT] handleShiftLetters error:", e); }
    finally { shiftFiredRef.current = false; }
  }, [gameCode, lobby?.settings?.sprintLetterCount, generateLettersAndTargets]);

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
    const word = typedWord.trim(); if (!word || word.length < 2) return;
    submitGuardRef.current = true; setIsSubmitting(true); setSubmitStatus("Claiming...");
    const { data, error } = await supabase.rpc("submit_links_sprint_word", { p_lobby_code: gameCode, p_player_id: effectivePlayerId, p_word: word.toLowerCase() }); submitGuardRef.current = false; setIsSubmitting(false);
    if (error || data?.success === false) { const errMsg = data?.error || error?.message || "Submit failed"; setSubmitStatus(errMsg); if (data?.error_code === "ALREADY_USED") { setWordFeedback({ type: "used", message: "Already claimed!" }); setShakeKey(k => k + 1); } setTimeout(() => setSubmitStatus(null), 2500); return; }
    setTypedWord(""); setWordFeedback({ type: "typing" });
    const pts = data.points || 0;
    const mult = data.pool_multiplier || 1;
    const multText = mult > 1 ? ` (×${mult} bonus!)` : '';
    if (data.is_target) { setTargetHitFlash({ word: data.word, level: data.target_level || 1 }); setTimeout(() => setTargetHitFlash(null), 2500); setSubmitStatus(`🎯 TARGET! +${pts} pts${multText}`); } else { setSubmitStatus(`+${pts} pts${multText}`); } setTimeout(() => setSubmitStatus(null), 2000);
  }, [gameCode, effectivePlayerId, phase, typedWord, wordFeedback.type, isSubmitting]);

  // ── Leave ────────────────────────────────────────────────────────────
  const handleLeave = async () => { if (confirm("Leave the game?")) { broadcast("player:leave", { playerId: effectivePlayerId }); await supabase.from("players").delete().eq("id", effectivePlayerId).eq("lobby_code", gameCode); if (isHost) { await supabase.from("lobbies").update({ mode: null, status: "LOBBY", arena_state: null }).eq("code", gameCode); } store.clearArenaHostCode(); window.location.href = `/lobby/${gameCode}?from=game`; } };

  // ── Loading ──────────────────────────────────────────────────────────
  if (!lobby) { return <div className="min-h-screen bg-clay-cream flex items-center justify-center"><div className="text-warm-gray/60 font-medium text-sm animate-pulse">Loading LINKS Sprint...</div></div>; }

  // ── Game Over ────────────────────────────────────────────────────────
  if (isGameOver || phase === "GAME_OVER") {
    return <GameOverScreen players={players} scores={scores} sprintWords={sprintWords} gameCode={gameCode!} handleLeave={handleLeave} />;
  }

  // ── Wave Intro Phase (continuous flow with results overlay) ──────────
  if (phase === "WAVE_INTRO") {
    // Previous wave results (if not the first wave)
    const prevWave = gameState.currentWave - 1;
    const prevWaveWords = prevWave >= 1 ? sprintWords.filter(w => w.wave === prevWave) : [];
    const prevWaveTargets = (gameState.targetReveals || []).find((r: any) => r.wave === prevWave)?.targets || [];
    const prevWaveScores: Record<string, number> = {};
    prevWaveWords.forEach(w => { prevWaveScores[w.player_id] = (prevWaveScores[w.player_id] || 0) + w.points; });
    const prevWaveSorted = [...players].sort((a: any, b: any) => (prevWaveScores[b.id] || 0) - (prevWaveScores[a.id] || 0));
    const hasPrevResults = prevWaveWords.length > 0;

    return (
      <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-mint-light text-mint border border-mint/20"><Zap className="w-4 h-4" /><span className="text-sm font-black uppercase tracking-widest">Wave {gameState.currentWave} of {gameState.totalWaves}</span></div>
          <h1 className="font-outfit font-black text-4xl text-plum mt-4">Get Ready!</h1>
        </div>

        {/* Countdown */}
        <div className="relative w-20 h-20">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-warm-gray/10" /><circle cx="50" cy="50" r="42" fill="none" stroke="#34D399" strokeWidth="6" strokeLinecap="round" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - waveIntroCountdown / 10)} className="transition-all duration-1000" /></svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono font-black text-2xl text-mint tabular-nums leading-none">{waveIntroCountdown}</span>
          </div>
        </div>

        {/* Previous wave results overlay */}
        {hasPrevResults && (
          <div className="w-full max-w-md space-y-3 animate-clay-pop">
            <h3 className="text-xs font-black text-warm-gray/50 uppercase tracking-widest text-center">Wave {prevWave} Results</h3>
            {/* Targets summary */}
            {prevWaveTargets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {prevWaveTargets.map((t: any, i: number) => {
                  const level = t.level || 1;
                  const wasHit = prevWaveWords.some(w => w.is_target && w.word.toLowerCase() === (t.word || "").toLowerCase());
                  return (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border" style={{
                      backgroundColor: wasHit ? LEVEL_COLORS[level] + "20" : "rgba(0,0,0,0.03)",
                      borderColor: wasHit ? LEVEL_COLORS[level] : "rgba(0,0,0,0.08)",
                      color: wasHit ? LEVEL_COLORS[level] : "#9CA3AF",
                      textDecoration: wasHit ? "none" : "line-through",
                    }}>
                      {wasHit ? "✓" : "✗"} {t.word}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Standings mini */}
            <div className="flex flex-col gap-1.5">
              {prevWaveSorted.map((p: any, idx: number) => {
                const c = getPlayerColorByName(p.id, players);
                const pts = prevWaveScores[p.id] || 0;
                const pWords = prevWaveWords.filter(w => w.player_id === p.id);
                return (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{
                    backgroundColor: idx === 0 ? "#FEF3C7" : "rgba(255,255,255,0.7)",
                    borderColor: idx === 0 ? "#FCD34D" : "rgba(0,0,0,0.06)",
                  }}>
                    <span className="text-sm">{idx === 0 ? "👑" : `#${idx + 1}`}</span>
                    <span className="flex-1 font-bold text-xs text-plum truncate">{p.name}</span>
                    <span className="text-[10px] text-warm-gray/50">{pWords.length}w</span>
                    <span className="font-mono font-black text-sm" style={{ color: c.fill }}>+{pts}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Next wave letters preview */}
        {letters.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-bold text-warm-gray/50">Your letters</p>
            <div className="flex items-center gap-2">
              {letters.map((l) => (
                <span key={l} className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl flex items-center justify-center text-lg font-outfit font-black shadow-md animate-clay-pop" style={{ backgroundColor: "#34D399", color: "#fff", boxShadow: "0 4px 16px rgba(52,211,153,0.3)" }}>{l}</span>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-warm-gray/40 font-bold">Type words with at least 2 pool letters for bonus multipliers!</p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── RENDER: PLAYING phase (V3 layout) ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-clay-cream font-outfit text-plum flex flex-col">
      {/* ── Shift transition animation ──────────────────────────────── */}
      {shiftFlash && (
        <div className="fixed inset-0 z-[60] pointer-events-none">
          {/* Backdrop flash */}
          <div className="absolute inset-0 bg-butter/5 animate-pulse" />
          {/* Central banner */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={shiftAnimPhase === 'exit' ? 'animate-shift-banner-in' : shiftAnimPhase === 'done' ? 'opacity-0 transition-opacity duration-500' : ''}>
              <div className="px-6 py-3 rounded-2xl bg-gradient-to-br from-butter via-amber-400 to-orange-500 shadow-2xl shadow-butter/30">
                <span className="font-outfit font-black text-2xl text-white tracking-wide">⚡ NEW LETTERS!</span>
              </div>
            </div>
          </div>
          {/* Animated letter tiles overlay */}
          <div className="absolute inset-0 flex items-center justify-center pt-20">
            <div className="flex items-center gap-3">
              {/* Old letters sliding out */}
              {shiftAnimPhase === 'exit' && shiftOldLetters.map((letter, i) => (
                <div
                  key={`old-${letter}-${i}`}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center font-outfit font-black text-2xl text-white shadow-lg animate-shift-letter-out"
                  style={{
                    backgroundColor: '#9CA3AF',
                    animationDelay: `${i * 80}ms`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  {letter}
                </div>
              ))}
              {/* New letters sliding in */}
              {(shiftAnimPhase === 'enter' || shiftAnimPhase === 'done') && shiftNewLetters.map((letter, i) => (
                <div
                  key={`new-${letter}-${i}`}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center font-outfit font-black text-2xl text-white shadow-lg animate-shift-letter-in"
                  style={{
                    backgroundColor: '#34D399',
                    animationDelay: `${i * 80}ms`,
                    boxShadow: '0 4px 16px rgba(52,211,153,0.4)',
                  }}
                >
                  {letter}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
            {hasSegments && <span className="text-[10px] font-black text-warm-gray/50">· Seg {currentSegment}/{segmentsPerWave}</span>}
          </div>
          {hasSegments && phase === "PLAYING" && (
            <div className="flex items-center gap-1.5 bg-butter-light/80 px-2.5 py-1 rounded-xl border border-butter/20">
              <Zap className="w-3 h-3 text-butter" />
              <span className="text-[10px] font-black text-butter tabular-nums">Shift in {segmentTimer}s</span>
            </div>
          )}

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

          <div className="flex justify-center">              <LetterPool letters={letters} inputText={typedWord} title="" subtitle="These letters must be included in your word" />
              {/* Shift incoming letters preview (shown during segment timer < 5s) */}
              {hasSegments && phase === 'PLAYING' && segmentTimer <= 5 && segmentTimer > 0 && (
                <div className="flex items-center justify-center gap-1 mt-2 animate-pulse">
                  <Zap className="w-3 h-3 text-butter" />
                  <span className="text-[10px] font-bold text-butter/70">Letters changing soon...</span>
                </div>
              )}
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
                {wordFeedback.type === "valid" && (() => {
                  const poolUsed = countPoolLettersInWord(typedWord, letters);
                  const { base, multiplier, total } = calcPointsWithPoolMultiplier(typedWord.length, poolUsed);
                  return (
                    <div className="animate-clay-pop">
                      <p className="text-xs font-bold text-mint">+{total} points — press Enter</p>
                      {multiplier > 1 && <p className="text-[10px] font-bold text-soft-purple">{base} base × {multiplier} multiplier ({poolUsed} pool letters)</p>}
                    </div>
                  );
                })()}
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
            <div className="flex flex-col gap-3">
              {/* Wave filter tabs */}
              {gameState.totalWaves > 1 && (
                <div className="flex items-center gap-1 p-1 rounded-xl bg-warm-gray/5 border border-warm-gray/10">
                  <button onClick={() => setLeaderboardWaveFilter('all')} className={`flex-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${leaderboardWaveFilter === 'all' ? 'bg-white shadow-sm text-plum' : 'text-warm-gray/40'}`}>All</button>
                  {Array.from({ length: Math.min(gameState.currentWave, gameState.totalWaves) }).map((_, i) => (
                    <button key={i + 1} onClick={() => setLeaderboardWaveFilter(i + 1)} className={`flex-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${leaderboardWaveFilter === i + 1 ? 'bg-white shadow-sm text-plum' : 'text-warm-gray/40'}`}>W{i + 1}</button>
                  ))}
                </div>
              )}

              {/* Your card */}
              {(() => {
                const filteredMyWords = leaderboardWaveFilter === 'all' ? myWords : myWords.filter(w => w.wave === leaderboardWaveFilter);
                const filteredMyScore = filteredMyWords.reduce((s, w) => s + w.points, 0);
                return (
                  <ClayCard elevation="flat" padding="sm" className="flex items-center justify-between ring-2 ring-warm-gray/20 ring-offset-2 ring-offset-clay-cream">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner bg-warm-gray/50"><AvatarIcon src={AVATARS[0].src} size="28px" /></div>
                      <div><div className="font-bold text-md leading-tight text-plum">You</div><div className="text-xs font-bold opacity-50 uppercase mt-1">{filteredMyWords.length} Words</div></div>
                    </div>
                    <div className="font-black text-xl text-plum/80">{filteredMyScore}</div>
                  </ClayCard>
                );
              })()}

              {/* Opponents */}
              {(() => {
                const filteredScores: Record<string, number> = {};
                players.forEach((p: any) => {
                  const pw = leaderboardWaveFilter === 'all' ? sprintWords.filter(w => w.player_id === p.id) : sprintWords.filter(w => w.player_id === p.id && w.wave === leaderboardWaveFilter);
                  filteredScores[p.id] = pw.reduce((s, w) => s + w.points, 0);
                });
                return otherPlayers.sort((a, b) => (filteredScores[b.id] || 0) - (filteredScores[a.id] || 0)).map((op) => {
                  const color = getPlayerColorByName(op.id, players);
                  const opScore = filteredScores[op.id] || 0;
                  const opWords = leaderboardWaveFilter === 'all' ? opponentWords.filter(w => w.player_id === op.id) : opponentWords.filter(w => w.player_id === op.id && w.wave === leaderboardWaveFilter);
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
                });
              })()}
            </div>
          ) : (
            <LiveFeed sprintWords={sprintWords} players={players} />
          )}
        </div>
      </div>
    </div>
  );
}
