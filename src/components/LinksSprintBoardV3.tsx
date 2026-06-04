import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { Zap, Target, ArrowLeft, Wifi, WifiOff, Trophy, Swords, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { AVATARS } from "../assets/avatars";
import ClayCard from "./ui/ClayCard";
import TensionTimer from "./ui/TensionTimer";
import LetterPool from "./ui/LetterPool";
import { getPoolMultiplier, calcPointsWithPoolMultiplier, countPoolLettersInWord, fetchWordFile, generateLetterPool, PLAYER_COLORS, PlayerColor } from "../lib/linksHelpers";

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
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const filteredWords = waveTab === "overall" ? sprintWords : sprintWords.filter(w => w.wave === waveTab);

  // Compute per-player detailed stats
  const playerStats = useMemo(() => {
    return sorted.map(p => {
      const pWords = sprintWords.filter(w => w.player_id === p.id);
      const pts = pWords.reduce((s, w) => s + w.points, 0);
      const targets = pWords.filter(w => w.is_target).length;
      const powerWords = pWords.filter(w => w.pool_letters_used && w.pool_letters_used >= 3).length;
      const avgLen = pWords.length > 0 ? (pWords.reduce((s, w) => s + w.word_length, 0) / pWords.length).toFixed(1) : "—";
      // Letter usage: count how many times each letter appears across words
      const letterFreq: Record<string, number> = {};
      pWords.forEach(w => {
        const seen = new Set<string>();
        for (const ch of w.word.toLowerCase()) {
          if (!seen.has(ch)) { letterFreq[ch] = (letterFreq[ch] || 0) + 1; seen.add(ch); }
        }
      });
      const sortedLetters = Object.entries(letterFreq).sort(([,a], [,b]) => b - a);
      const weakestLink = sortedLetters[0];
      const strongestLink = sortedLetters[sortedLetters.length - 1];
      const hasVariance = weakestLink && strongestLink && weakestLink[1] !== strongestLink[1];
      return { player: p, pts, targets, powerWords, avgLen, words: pWords, letterFreq, sortedLetters, weakestLink, strongestLink: hasVariance ? strongestLink : null };
    });
  }, [sorted, sprintWords]);

  // Roasts
  const roasts = useMemo(() => {
    if (sorted.length < 2) return [];
    const r: { icon: React.ReactNode; text: string; color: string }[] = [];
    const winner = playerStats[0];
    const runnerUp = playerStats[1];
    const gap = winner.pts - runnerUp.pts;
    if (gap <= 50 && runnerUp.pts > 0) {
      r.push({ icon: <Swords className="w-3.5 h-3.5" />, text: `Photo finish! ${winner.player.name} beat ${runnerUp.player.name} by just ${gap} pts 😤`, color: "butter" });
    } else if (gap >= 1000) {
      r.push({ icon: <Sparkles className="w-3.5 h-3.5" />, text: `${winner.player.name} absolutely dominated — ${gap.toLocaleString()} pts ahead 👑`, color: "purple" });
    }
    // Most targets
    const topTarget = [...playerStats].sort((a, b) => b.targets - a.targets)[0];
    if (topTarget && topTarget.targets >= 2) {
      r.push({ icon: <Target className="w-3.5 h-3.5" />, text: `${topTarget.player.name} hit ${topTarget.targets} targets — sharpshooter! 🎯`, color: "mint" });
    }
    // Most power words
    const topPower = [...playerStats].sort((a, b) => b.powerWords - a.powerWords)[0];
    if (topPower && topPower.powerWords >= 2) {
      r.push({ icon: <Sparkles className="w-3.5 h-3.5" />, text: `${topPower.player.name} scored ${topPower.powerWords} power words — letter mastery! ⚡`, color: "purple" });
    }
    // Most words but not winner
    const wordsSorted = [...playerStats].sort((a, b) => b.words.length - a.words.length);
    if (wordsSorted[0] && wordsSorted[0].player.id !== winner.player.id && wordsSorted[0].words.length > winner.words.length) {
      r.push({ icon: <Zap className="w-3.5 h-3.5" />, text: `${wordsSorted[0].player.name} found the most words but ${winner.player.name} stole the crown 👀`, color: "sky" });
    }
    return r;
  }, [playerStats, sorted]);

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80">
        <button onClick={handleLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach"><ArrowLeft className="w-3.5 h-3.5" /> Leave</button>
        <span className="font-outfit font-black text-lg text-plum">⚡ LINKS SPRINT</span>
        <span className="text-[10px] font-mono text-warm-gray/50">{gameCode}</span>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 gap-5 overflow-y-auto pb-24">
        {/* Hero */}
        <div className="text-center space-y-2">
          <Trophy className="w-16 h-16 mx-auto text-butter" />
          <h1 className="font-outfit font-black text-3xl text-plum">Game Over!</h1>
          {sorted[0] && (
            <p className="text-lg font-bold" style={{ color: (getPlayerColorByName(sorted[0].id, players)).fill }}>
              🏆 {sorted[0].name} wins!
            </p>
          )}
        </div>

        {/* Wave filter tabs */}
        {waveNumbers.length > 1 && (
          <div className="w-full max-w-md">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-warm-gray/5 border border-warm-gray/10">
              {["overall", ...waveNumbers].map(n => (
                <button key={n} onClick={() => setWaveTab(n as any)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${waveTab === n ? "bg-white shadow-sm text-plum" : "text-warm-gray/50"}`}
                >
                  {n === "overall" ? "Overall" : `Wave ${n}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Roasts */}
        {roasts.length > 0 && (
          <div className="w-full max-w-md space-y-1.5">
            {roasts.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border animate-clay-pop ${
                r.color === "butter" ? "bg-butter-light/30 border-butter/20 text-butter" :
                r.color === "purple" ? "bg-soft-purple-light/30 border-soft-purple/20 text-soft-purple" :
                r.color === "mint" ? "bg-mint-light/30 border-mint/20 text-mint" :
                "bg-sky-light/30 border-sky/20 text-sky"
              }`} style={{ animationDelay: `${i * 100}ms` }}>
                {r.icon}<span>{r.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard */}
        <div className="w-full max-w-md space-y-2">
          {playerStats.map((ps, idx) => {
            const c = getPlayerColorByName(ps.player.id, players);
            const pWords = waveTab === "overall" ? ps.words : ps.words.filter(w => w.wave === waveTab);
            const pts = pWords.reduce((s, w) => s + w.points, 0);
            const isExpanded = expandedPlayerId === ps.player.id;
            return (
              <div key={ps.player.id}>
                <button
                  onClick={() => setExpandedPlayerId(isExpanded ? null : ps.player.id)}
                  className="w-full p-4 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    backgroundColor: idx === 0 ? "#FEF3C7" : "#fff",
                    borderColor: idx === 0 ? "#FCD34D" : "rgba(0,0,0,0.08)",
                    boxShadow: idx === 0 ? "0 6px 20px rgba(251,191,36,0.25)" : "0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0">
                      {idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-outfit font-bold text-sm text-plum truncate">{ps.player.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-warm-gray/50">
                        <span>{ps.words.length} words</span>
                        {ps.targets > 0 && <span className="text-mint">· {ps.targets} 🎯</span>}
                        {ps.powerWords > 0 && <span className="text-soft-purple">· {ps.powerWords} ⚡</span>}
                        <span>· avg {ps.avgLen}l</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-lg" style={{ color: c.fill }}>{pts.toLocaleString()}</p>
                      <p className="text-[9px] font-bold text-warm-gray/40">pts</p>
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-1.5 ml-2 pl-10 pr-2 py-2 space-y-2 animate-slide-up-fade">
                    {/* Letter analysis */}
                    {ps.weakestLink && (
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        <span className="text-peach/70">🔗 Weakest: "{ps.weakestLink[0].toUpperCase()}" ({ps.weakestLink[1]} words)</span>
                        {ps.strongestLink && (
                          <span className="text-sky/70">💪 Strongest: "{ps.strongestLink[0].toUpperCase()}" ({ps.strongestLink[1]} words)</span>
                        )}
                      </div>
                    )}
                    {/* Word list */}
                    {pWords.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {pWords.map(w => (
                          <span key={w.id}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                              w.is_target ? 'bg-mint-light/50 border-mint/30 text-mint' :
                              'bg-warm-white border-warm-gray/10 text-plum/70'
                            }`}
                          >
                            {w.word}<span className="text-[9px] opacity-60 font-mono">+{w.points}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-warm-gray/40 italic">No words this wave</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Return button */}
        <button onClick={handleLeave} className="px-8 py-3 rounded-2xl font-outfit font-black text-sm bg-soft-purple text-white shadow-lg hover:opacity-90 transition-all">
          Return to Lobby
        </button>
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
  const playersLenRef = useRef(players.length);
  const isHost = lobby?.host_id === effectivePlayerId;
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { playersLenRef.current = players.length; }, [players.length]);
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'leaderboard' | 'feed'>('leaderboard');
  const [leaderboardWaveFilter, setLeaderboardWaveFilter] = useState<number | 'all'>('all');

  // ── Segment (Letter Shift) state ────────────────────────────────────
  const [segmentTimer, setSegmentTimer] = useState(0);
  const shiftFiredRef = useRef(false);
  const isLetterAnimatingRef = useRef(false);

  // Callback for LetterPool to pause timers during animation
  const handleLetterAnimationState = useCallback((animating: boolean) => {
    isLetterAnimatingRef.current = animating;
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────
  const phase = gameState.phase;
  const currentSegment: number = gameState.currentSegment || 1;
  const segmentsPerWave: number = gameState.segmentsPerWave || 1;
  const segmentDuration: number = gameState.segmentDuration || gameState.waveDuration || 60;
  const hasSegments = segmentsPerWave > 1;
  const letters: string[] = (gameState.playerLetters?.[effectivePlayerId] || gameState.letters) || [];
  // ── Letter animation key: increments on segment/wave changes to trigger slot-machine flip
  const letterAnimateKey = (gameState.currentWave || 0) * 100 + (gameState.currentSegment || 0);

  const usedWords: string[] = gameState.usedWords || [];
  const playerTimers: Record<string, number> = gameState.playerTimers || {};
  const myTimer = playerTimers[effectivePlayerId] ?? waveTimer;
  const myWords = useMemo(() => sprintWords.filter(w => w.player_id === effectivePlayerId), [sprintWords, effectivePlayerId]);
  const opponentWords = useMemo(() => sprintWords.filter(w => w.player_id !== effectivePlayerId), [sprintWords, effectivePlayerId]);
  const scores = useMemo(() => { const s: Record<string, number> = {}; players.forEach((p: any) => { s[p.id] = sprintWords.filter(w => w.player_id === p.id).reduce((sum, w) => sum + w.points, 0); }); return s; }, [players, sprintWords]);
  const myScore = scores[effectivePlayerId] || 0;
  const otherPlayers = players.filter((p: any) => p.id !== effectivePlayerId);

  // ── Ref for onLobbyChange/polling phase guard ──────────────────────
  const lobbyPhaseGuardRef = useRef(gameState);
  useEffect(() => { lobbyPhaseGuardRef.current = gameState; });

  // ── Realtime channel ─────────────────────────────────────────────────
  const { isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: `links-sprint:${gameCode}`, enablePresence: false,
    subscribeLobby: gameCode, subscribePlayers: gameCode, subscribeArenaAnswers: gameCode, answersTableName: "links_sprint_words",
    onLobbyChange: (payload: any) => {
      if (payload.eventType === "DELETE" || !payload.new) { window.location.href = "/"; return; }
      const parsed = parseArenaState(payload.new.arena_state); if (parsed) {
        // Phase guard: only apply DB state if phase advanced
        const phaseOrder: Record<string, number> = { WAVE_INTRO: 0, PLAYING: 1, WAVE_RESULTS: 2, GAME_OVER: 3 };
        const dbPhase = parsed.phase;
        const localPhase = lobbyPhaseGuardRef.current.phase;
        if ((phaseOrder[dbPhase] ?? -1) >= (phaseOrder[localPhase] ?? -1)) {
          setGameState(parsed); if (parsed.phase === "GAME_OVER") setIsGameOver(true);
        }
      }
    },
    onPlayerChange: async () => { const { data } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false }); if (data) setPlayers(data); },
    onArenaAnswer: (payload: any) => { const newWord = payload.new as SprintWord; if (!newWord) return; setSprintWords((prev) => { if (prev.find(w => w.id === newWord.id)) return prev; return [...prev, newWord]; }); if (newWord.is_target && newWord.player_id === effectivePlayerId) { setTargetHitFlash({ word: newWord.word, level: newWord.target_level || 1 }); setTimeout(() => setTargetHitFlash(null), 2500); } },
    onReconnect: async () => { const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle(); const parsed = parseArenaState(lobbyData?.arena_state); if (parsed) setGameState(parsed); const { data: wordsData } = await supabase.from("links_sprint_words").select("*").eq("lobby_code", gameCode).order("created_at", { ascending: true }); if (wordsData) setSprintWords(wordsData); },
  });

  // ── Connection banner ────────────────────────────────────────────────
  useEffect(() => { if (!isConnected) { disconnectTimerRef.current = setTimeout(() => setShowDisconnected(true), 5000); } else { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; setShowDisconnected(false); }    return () => { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); }; }, [isConnected]);

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
  useEffect(() => { if (phase !== "WAVE_INTRO") { setWaveIntroCountdown(10); waveStartFiredRef.current = false; isStartingWaveRef.current = false; setIsStartingWave(false); return; }
    waveStartFiredRef.current = false;
    const interval = setInterval(() => { setWaveIntroCountdown(prev => { const next = prev - 1; if (next <= 0 && isHostRef.current && !waveStartFiredRef.current) { waveStartFiredRef.current = true; handleStartWave(); } return next > 0 ? next : 0; }); }, 1000);
    return () => clearInterval(interval);
  }, [phase]); // handleStartWave intentionally omitted from deps — reads all values via refs

  // ── Non-host wave start fallback (fixes host disconnect freeze) ──────
  const nonHostWaveStartRef = useRef(false);
  useEffect(() => {
    if (phase !== "WAVE_INTRO" || isHost) { nonHostWaveStartRef.current = false; return; }
    // If host is gone and intro countdown has passed, first non-host starts the wave
    const timeout = setTimeout(() => {
      if (!isHostRef.current && !waveStartFiredRef.current && !nonHostWaveStartRef.current) {
        nonHostWaveStartRef.current = true;
        waveStartFiredRef.current = true;
        handleStartWave();
      }
    }, 12000); // 12s grace period (10s countdown + 2s buffer)
    return () => clearTimeout(timeout);
  }, [phase, isHost]);

  // ── Wave timer ───────────────────────────────────────────────────────
  const gameStateRef = useRef(gameState); useEffect(() => { gameStateRef.current = gameState; });
  useEffect(() => { if (phase !== "PLAYING") { setWaveTimer(gameState.waveDuration || 60); waveEndFiredRef.current = false; return; }
    setWaveTimer(gameState.waveDuration || 60); waveEndFiredRef.current = false;
    const interval = setInterval(() => { setWaveTimer(prev => { if (isLetterAnimatingRef.current) return prev; const next = prev - 1; if (next <= 0 && isHostRef.current && !waveEndFiredRef.current) { waveEndFiredRef.current = true; handleEndWave(); } return next > 0 ? next : 0; }); }, 1000);
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
        if (isLetterAnimatingRef.current) return prev;
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
  useEffect(() => { const poll = setInterval(async () => { if (isConnected) return; try {        const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle();
        if (lobbyData) { setLobby(lobbyData); const parsed = parseArenaState(lobbyData.arena_state); if (parsed) { const phaseOrder: Record<string, number> = { WAVE_INTRO: 0, PLAYING: 1, WAVE_RESULTS: 2, GAME_OVER: 3 }; const dbPhase = parsed.phase; const localPhase = lobbyPhaseGuardRef.current?.phase; if ((phaseOrder[dbPhase] ?? -1) >= (phaseOrder[localPhase] ?? -1)) { setGameState(parsed); if (parsed.phase === "GAME_OVER") setIsGameOver(true); } } } const { data: playerData } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false }); if (playerData) setPlayers(playerData); const { data: wordsData } = await supabase.from("links_sprint_words").select("*").eq("lobby_code", gameCode).order("created_at", { ascending: true }); if (wordsData) setSprintWords(wordsData); } catch {} }, 3000); return () => clearInterval(poll); }, [gameCode, isConnected]);

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

  // BUG FIX #14: Add error state + retry for wave end failures
  const [waveEndError, setWaveEndError] = useState(false);
  const waveEndRetriesRef = useRef(0);

  // ── End wave ─────────────────────────────────────────────────────────
  const handleEndWave = useCallback(async () => { if (!isHostRef.current) return; if (gameStateRef.current.phase !== "PLAYING") return;
    setWaveEndError(false);
    const { error } = await supabase.rpc("end_links_sprint_wave", { p_lobby_code: gameCode });
    if (error) {
      console.error("[SPRINT] end_links_sprint_wave error:", error);
      setWaveEndError(true);
      // Auto-retry once after 2s
      if (waveEndRetriesRef.current < 1) {
        waveEndRetriesRef.current++;
        waveEndFiredRef.current = false;
        setTimeout(() => {
          if (isHostRef.current && gameStateRef.current.phase === "PLAYING") {
            waveEndFiredRef.current = true;
            supabase.rpc("end_links_sprint_wave", { p_lobby_code: gameCode }).then(({ error: retryErr }) => {
              if (retryErr) console.error("[SPRINT] end_links_sprint_wave retry error:", retryErr);
              else setWaveEndError(false);
            });
          }
        }, 2000);
      }
    } else {
      waveEndRetriesRef.current = 0;
    }
  }, [gameCode]);

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
    const { error } = await supabase.rpc("start_links_sprint_wave", { p_lobby_code: gameCode, p_letters: newLetters, p_target_words: targets }); if (error) console.error("[SPRINT] start_links_sprint_wave error:", error);
    isStartingWaveRef.current = false; setIsStartingWave(false);
  }, [gameCode, lobby?.settings?.sprintLetterCount, generateLettersAndTargets]);

  // ── Shift letters (Letter Shifts) ───────────────────────────────────
  const handleShiftLetters = useCallback(async () => { if (!isHostRef.current) return;
    try {
      const gs = gameStateRef.current; const wave = gs.currentWave || 1; const settingLetterCount = lobby?.settings?.sprintLetterCount; const letterCount = settingLetterCount || 4;
      const { letters: newLetters, targets } = await generateLettersAndTargets(letterCount, wave);
      const { data, error } = await supabase.rpc("shift_sprint_letters", { p_lobby_code: gameCode, p_letters: newLetters, p_target_words: targets });
      if (error) console.error("[SPRINT] shift_sprint_letters error:", error);
      else if (data?.waveEnded) { /* wave ended via shift — server handled transition */ }
    } catch (e) { console.error("[SPRINT] handleShiftLetters error:", e); }
    finally { shiftFiredRef.current = false; }
  }, [gameCode, lobby?.settings?.sprintLetterCount, generateLettersAndTargets]);

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
            <div className="flex items-center gap-1.5 bg-soft-purple-light/80 px-2.5 py-1 rounded-xl border border-soft-purple/20">
              <Zap className="w-3 h-3 text-soft-purple" />
              <span className="text-[10px] font-black text-soft-purple tabular-nums">Shift in {segmentTimer}s</span>
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

          <div className="flex justify-center">
            <LetterPool letters={letters} inputText={typedWord} animateKey={letterAnimateKey} onAnimationChange={handleLetterAnimationState} title="" subtitle="These letters must be included in your word" />
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

              {/* Segment shift warning */}
              {hasSegments && phase === 'PLAYING' && segmentTimer <= 5 && segmentTimer > 0 && (
                <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-soft-purple-light/60 border border-soft-purple/20 animate-pulse">
                  <Zap className="w-3.5 h-3.5 text-soft-purple" />
                  <span className="text-[11px] font-bold text-soft-purple">Letters changing in {segmentTimer}s — type fast!</span>
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

              {/* Wave end error banner */}
              {waveEndError && (
                <div className="mb-3 px-3 py-2 rounded-xl bg-peach-light border border-peach/30 flex items-center gap-2">
                  <span className="text-xs font-bold text-peach">Wave end sync issue — retrying...</span>
                </div>
              )}

              {/* Input */}
              <form onSubmit={(e) => { e.preventDefault(); handleSubmitWord(); }} key={shakeKey} className={`relative ${shakeKey ? 'animate-shake' : ''}`}>
                <div className="flex gap-2">
                  <input type="text" value={typedWord}
                    onChange={(e) => handleSetInput(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 15).toUpperCase())}
                    placeholder="Type word"
                    className={`flex-1 bg-warm-white text-plum text-2xl font-black font-mono tracking-[0.1em] rounded-2xl py-4 pl-6 border-2 border-warm-gray/15 outline-none focus:border-soft-purple/40 focus:ring-2 focus:ring-soft-purple/20 transition-all ${wordFeedback.type === 'valid' ? '!border-mint/50 !ring-mint/20' : wordFeedback.type === 'missing' || wordFeedback.type === 'used' || wordFeedback.type === 'invalid' ? '!border-peach/50 !ring-peach/20' : ''}`}
                    onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 150);
                    }}
                    autoFocus autoComplete="off" />
                  <button
                    type="submit"
                    disabled={wordFeedback.type !== 'valid' || isSubmitting}
                    className={`shrink-0 px-5 rounded-2xl font-outfit font-black text-sm uppercase tracking-wider transition-all ${
                      wordFeedback.type === 'valid' && !isSubmitting
                        ? 'bg-soft-purple text-white shadow-lg shadow-soft-purple/30 hover:bg-soft-purple/90 active:scale-95'
                        : 'bg-warm-gray/15 text-warm-gray/40 cursor-not-allowed'
                    }`}
                  >
                    {isSubmitting ? '...' : 'Enter'}
                  </button>
                </div>
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
