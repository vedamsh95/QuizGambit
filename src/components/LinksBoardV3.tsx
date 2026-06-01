import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { Heart, Zap, AlertTriangle, Wifi, WifiOff, ArrowLeft, Clock, Shield, Trophy } from "lucide-react";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { useRealtimeChannel } from "../hooks/useRealtimeChannel";
import { AVATARS } from "../assets/avatars";
import ClayCard from "./ui/ClayCard";
import TensionTimer from "./ui/TensionTimer";
import LetterPool from "./ui/LetterPool";

import { PLAYER_COLORS, PlayerColor, calcPoints } from "./LinksBoardPrototype";

// ── Dictionary ───────────────────────────────────────────────────────────────
const wordFileCache = new Map<string, string[]>();
async function fetchWordFile(letter: string): Promise<string[]> {
  const key = letter.toLowerCase();
  if (wordFileCache.has(key)) return wordFileCache.get(key)!;
  try { const resp = await fetch(`/words/by_letter/${key}.json`); if (!resp.ok) return []; const words: string[] = await resp.json(); wordFileCache.set(key, words); return words; } catch { return []; }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface LinksBoardV3Props {
  code?: string;
  playerId?: string;
  playerName?: string;
}

interface ClaimedWord {
  id: string;
  player_id: string;
  player_name: string;
  word: string;
  word_length: number;
  points: number;
  is_poisoned: boolean;
  poison_letter: string | null;
  hearts_remaining: number;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LETTER_SELECT_TIMEOUT = 30;
const SVG_CIRCUMFERENCE = 2 * Math.PI * 34;

function parseArenaState(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

function getPlayerColorByIndex(index: number): PlayerColor {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function getPlayerColorByName(playerId: string, players: any[]): PlayerColor {
  const idx = players.findIndex((p: any) => p.id === playerId);
  return getPlayerColorByIndex(idx >= 0 ? idx : 0);
}

// ── AvatarIcon ──────────────────────────────────────────────────────────────

const AvatarIcon = memo(function AvatarIcon({ src, size = "32px", className = "" }: { src: string; size?: string; className?: string }) {
  return <img src={src} alt="" className={`block ${className}`} style={{ width: size, height: size }} />;
});

// ── LetterSelectPhase ───────────────────────────────────────────────────────

const LetterSelectPhase = memo(function LetterSelectPhase({
  lettersTimeLeft, players, playerLetters, playerColors, selectedLetter, error, isHost, onSelectLetter, onForceStart,
}: {
  lettersTimeLeft: number; players: any[]; playerLetters: Record<string, string>;
  playerColors: Record<string, PlayerColor>; selectedLetter: string | null; error: string;
  isHost: boolean; onSelectLetter: (l: string) => void; onForceStart: () => void;
}) {
  const percent = (lettersTimeLeft / LETTER_SELECT_TIMEOUT) * 100;
  const urgent = lettersTimeLeft <= 10;
  const critical = lettersTimeLeft <= 5;
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">
      <div className="relative w-20 h-20 mb-2">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5" className="text-warm-gray/10" />
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={SVG_CIRCUMFERENCE} strokeDashoffset={SVG_CIRCUMFERENCE * (1 - percent / 100)}
            className={`transition-all duration-500 ${critical ? "text-peach animate-pulse" : urgent ? "text-butter" : "text-soft-purple"}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono font-black text-xl tabular-nums leading-none ${critical ? "text-peach animate-pulse" : urgent ? "text-butter" : "text-plum"}`}>{lettersTimeLeft}</span>
          <span className="text-[9px] font-bold text-warm-gray/40 uppercase tracking-wider">sec</span>
        </div>
      </div>
      <div className="text-center space-y-2">
        <h1 className="font-outfit font-black text-3xl text-plum">Pick Your Letter</h1>
        <p className="text-sm text-warm-gray/60 max-w-sm">Choose one letter. Every word you type must contain ALL chosen letters.{players.length > 2 && ` ${players.length} players means ${players.length} letters required per word!`}</p>
        {urgent && !selectedLetter && (
          <p className={`text-xs font-black mt-1 animate-pulse ${critical ? "text-peach" : "text-butter"}`}><Clock className="w-3 h-3 inline mr-1" />{critical ? "HURRY UP!" : "Time running out!"}</p>
        )}
      </div>
      {error && <div className="text-peach text-xs font-bold bg-peach-light px-4 py-2 rounded-full animate-shake">{error}</div>}
      {selectedLetter ? (
        <div className="text-center space-y-4">
          <p className="text-warm-gray/60 text-sm">You picked:</p>
          <div className="w-24 h-24 rounded-3xl bg-soft-purple flex items-center justify-center shadow-lg animate-clay-pop mx-auto">
            <span className="text-5xl font-outfit font-black text-white">{selectedLetter}</span>
          </div>
          <p className="text-xs text-warm-gray/50">Waiting for other players...</p>
        </div>
      ) : (
        <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 max-w-lg">
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => {
            const taken = Object.values(playerLetters).includes(l);
            return (
              <button key={l} onClick={() => !taken && onSelectLetter(l)} disabled={taken}
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl font-outfit font-black text-lg transition-all duration-150 ${taken ? "bg-warm-gray/10 text-warm-gray/30 cursor-not-allowed" : "bg-warm-white border-2 border-soft-purple/20 text-plum hover:bg-soft-purple-light hover:border-soft-purple hover:text-soft-purple hover:-translate-y-1 hover:shadow-lg active:scale-95"}`}>
                {l}
              </button>
            );
          })}
        </div>
      )}
      {Object.keys(playerLetters).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 justify-center">
          <span className="text-xs font-bold text-warm-gray/50">Letters:</span>
          {Object.entries(playerLetters).map(([pid, letter], i) => {
            const p = players.find((pl: any) => pl.id === pid);
            const c = playerColors[pid] || PLAYER_COLORS[0];
            return (
              <span key={pid} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border animate-clay-pop"
                style={{ animationDelay: `${i * 100}ms`, backgroundColor: c.fillLight, borderColor: c.pillBorder, color: c.fill }}>
                {letter}<span className="opacity-70">{p?.name || pid.slice(0, 6)}</span>
              </span>
            );
          })}
        </div>
      )}
      {isHost && <button onClick={onForceStart} className="px-4 py-2 rounded-xl bg-soft-purple text-white text-xs font-black hover:opacity-90">Force Start Game</button>}
    </div>
  );
});

// ── PoisonSetupPhase ────────────────────────────────────────────────────────

const PoisonSetupPhase = memo(function PoisonSetupPhase({
  letters, poisonAssignments, error, poisonTarget, playerColors, onAssignPoison, onSetPoisonLetter,
}: {
  letters: string[]; poisonAssignments: Record<string, string>; error: string; poisonTarget: any;
  playerColors: Record<string, PlayerColor>; onAssignPoison: () => void; onSetPoisonLetter: (targetId: string, letter: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 overflow-y-auto">
      <div className="text-center space-y-2">
        <div className="text-4xl mb-2">☣️</div>
        <h1 className="font-outfit font-black text-2xl text-plum">Poison Phase</h1>
        <p className="text-sm text-warm-gray/60 max-w-md">Secretly assign a poison letter to your target opponent.<br /><span className="text-[10px] text-warm-gray/50">They won't know what you picked!</span></p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-warm-gray/50">Required:</span>
        {letters.map((l) => (<span key={l} className="px-3 py-1 rounded-full bg-soft-purple-light text-soft-purple text-sm font-black">{l}</span>))}
      </div>
      {error && <div className="text-peach text-xs font-bold bg-peach-light px-4 py-2 rounded-full">{error}</div>}
      <div className="w-full max-w-md space-y-3">
        {poisonTarget && (() => {
          const op = poisonTarget;
          const c = playerColors[op.id] || PLAYER_COLORS[0];
          const myPoison = poisonAssignments[op.id] || "";
          return (
            <div key={op.id} className="rounded-3xl p-6 space-y-4"
              style={{ backgroundColor: c.fillLight + "80", border: `1.5px solid ${c.pillBorder}`, boxShadow: `0 8px 32px color-mix(in srgb, ${c.fill} 15%, transparent)` }}>
              <div className="flex flex-col items-center gap-2 text-center">
                <h2 className="font-outfit font-black text-xl" style={{ color: c.fill }}>Poison {op.name}</h2>
                <p className="text-[11px] font-bold text-warm-gray/50">Pick a letter to sabotage them!</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => {
                  const isRequired = letters.includes(l);
                  const isSelected = myPoison === l;
                  return (
                    <button key={l} onClick={() => { if (!isRequired) onSetPoisonLetter(op.id, l); }}
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-200 ${isRequired ? "opacity-30 cursor-not-allowed" : isSelected ? "scale-110" : "hover:scale-105 active:scale-95"}`}
                      style={{ backgroundColor: isSelected ? c.fill : "rgba(0,0,0,0.05)", color: isSelected ? "#fff" : c.fill,
                        boxShadow: isSelected ? `4px 4px 14px ${c.fill}4D, inset 1px 1px 0px rgba(255,255,255,0.35), inset -1px -1px 0px rgba(0,0,0,0.08)` : "inset 2px 2px 6px rgba(0,0,0,0.05), inset -1px -1px 0px rgba(255,255,255,0.20)" }}>
                      {l}
                    </button>
                  );
                })}
              </div>
              {myPoison && <p className="text-[12px] font-black text-center animate-clay-pop pt-2" style={{ color: c.fill }}>Poison Locked: {myPoison}</p>}
            </div>
          );
        })()}
      </div>
      <button onClick={onAssignPoison} disabled={!poisonTarget || !poisonAssignments[poisonTarget.id]}
        className="px-8 py-3 rounded-2xl font-outfit font-black text-sm tracking-widest uppercase transition-all hover:scale-105 active:scale-95 disabled:opacity-40 flex items-center gap-2"
        style={{ backgroundColor: "#7C5CFC", color: "#fff", boxShadow: "0 6px 24px rgba(124,92,252,0.35)" }}>
        <Shield className="w-4 h-4" />Lock In Poisons
      </button>
    </div>
  );
});

// ── GameOverScreen ──────────────────────────────────────────────────────────

const GameOverScreen = memo(function GameOverScreen({
  players, claimedWords, playerHearts, letters, poisonEnabled, lobbyCode, onLeave,
}: {
  players: any[]; claimedWords: ClaimedWord[]; playerHearts: Record<string, number>;
  letters: string[]; poisonEnabled: boolean; lobbyCode: string; onLeave: () => void;
}) {
  const sorted = [...players].sort((a: any, b: any) => {
    const scoreA = claimedWords.filter(w => w.player_id === a.id).reduce((s, w) => s + (w.is_poisoned ? 0 : w.points), 0);
    const scoreB = claimedWords.filter(w => w.player_id === b.id).reduce((s, w) => s + (w.is_poisoned ? 0 : w.points), 0);
    return scoreB - scoreA;
  });
  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-warm-gray/10 bg-warm-white/80">
        <button onClick={onLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80"><ArrowLeft className="w-3.5 h-3.5" /> Leave</button>
        <span className="font-outfit font-black text-lg text-plum">🔗 LINKS</span>
        <span className="text-[10px] font-mono text-warm-gray/50">{lobbyCode}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8 overflow-y-auto">
        <div className="text-center space-y-2">
          <Trophy className="w-16 h-16 mx-auto text-butter" />
          <h1 className="font-outfit font-black text-3xl text-plum">Game Over!</h1>
          <p className="text-sm text-warm-gray/60">Letters: {letters.join(" + ")}{poisonEnabled && " · Poison Mode"}</p>
        </div>
        <div className="w-full max-w-md space-y-2">
          {sorted.map((p: any, idx: number) => {
            const c = getPlayerColorByName(p.id, players);
            const pWords = claimedWords.filter((w) => w.player_id === p.id);
            const totalPoints = pWords.reduce((sum, w) => sum + (w.is_poisoned ? 0 : w.points), 0);
            const hearts = playerHearts[p.id] ?? 3;
            return (
              <div key={p.id} className="flex items-center gap-3 p-4 rounded-xl border transition-all"
                style={{ backgroundColor: idx === 0 ? "#FEF3C7" : "#fff", borderColor: idx === 0 ? "#FCD34D" : "rgba(0,0,0,0.08)", boxShadow: idx === 0 ? "0 6px 20px rgba(251,191,36,0.25)" : "0 2px 8px rgba(0,0,0,0.04)" }}>
                <span className="text-2xl flex-shrink-0">{idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}</span>
                <div className="flex-1 min-w-0"><p className="font-outfit font-bold text-sm text-plum truncate">{p.name}</p><p className="text-[10px] text-warm-gray/50">{pWords.length} word{pWords.length !== 1 ? "s" : ""}</p></div>
                <div className="text-right flex-shrink-0"><p className="font-mono font-bold text-lg" style={{ color: c.fill }}>{totalPoints}</p>
                  <div className="flex gap-0.5">{Array.from({ length: 3 }).map((_, i) => (<Heart key={i} className={`w-3 h-3 ${i < hearts ? "text-peach fill-peach" : "text-warm-gray/20"}`} />))}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="w-full max-w-md">
          <h3 className="text-xs font-black text-warm-gray/60 uppercase tracking-widest mb-3">All Words</h3>
          <div className="flex flex-wrap gap-2">
            {claimedWords.map((w) => {
              const c = getPlayerColorByName(w.player_id, players);
              return (<span key={w.id} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border" style={{ backgroundColor: c.fillLight, borderColor: c.pillBorder, color: c.fill }}>{w.word}<span className="opacity-60 text-[10px]">{w.is_poisoned ? "☠️" : `+${w.points}`}</span></span>);
            })}
          </div>
        </div>
        <button onClick={onLeave} className="px-8 py-3 rounded-2xl font-outfit font-black text-sm bg-soft-purple text-white shadow-lg hover:opacity-90">Return to Lobby</button>
      </div>
    </div>
  );
});

// ── LiveFeed (real game events) ─────────────────────────────────────────────

const LiveFeed = memo(function LiveFeed({ claimedWords, players }: { claimedWords: ClaimedWord[]; players: any[] }) {
  const events = useMemo(() => {
    const recent = [...claimedWords].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20);
    return recent.map((w) => {
      const color = getPlayerColorByName(w.player_id, players);
      const playerName = players.find((p: any) => p.id === w.player_id)?.name || w.player_name;
      return {
        id: w.id,
        text: w.is_poisoned
          ? `${playerName} hit a poison — ${w.word.toUpperCase()} ☠️`
          : `${playerName} claimed ${w.word.toUpperCase()} +${w.points}`,
        isPoisoned: w.is_poisoned,
        color: w.is_poisoned ? '#FF6B8A' : color.fill,
        dotBg: w.is_poisoned ? 'bg-peach' : undefined,
      };
    });
  }, [claimedWords, players]);

  return (
    <div className="flex flex-col h-full">
      <ClayCard elevation="flat" padding="sm" className="flex flex-col gap-3 min-h-[300px] overflow-y-auto scrollbar-hide border border-black/5">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 opacity-30">
            <span className="text-2xl">🔤</span>
            <span className="text-xs font-bold">Waiting for words...</span>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className={`text-sm font-black flex items-center gap-2.5 ${event.isPoisoned ? 'text-peach' : 'text-plum/80'}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${event.isPoisoned ? 'bg-peach animate-pulse' : ''}`} style={!event.isPoisoned ? { backgroundColor: event.color } : undefined} />
              <span>{event.text}</span>
            </div>
          ))
        )}
      </ClayCard>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function LinksBoardV3({ code: gameCode, playerId: propPlayerId, playerName: propPlayerName }: LinksBoardV3Props) {
  // ── Stable player identity ───────────────────────────────────────────
  const [effectivePlayerId] = useState<string>(() => {
    if (propPlayerId && UUID_RE.test(propPlayerId)) return propPlayerId;
    return store.ensurePlayerId();
  });
  useEffect(() => { if (store.getPlayerId() !== effectivePlayerId) store.setPlayerId(effectivePlayerId); }, [effectivePlayerId]);
  const playerName = propPlayerName || store.getPlayerName() || "Player";

  // ── Core state ───────────────────────────────────────────────────────
  const [lobby, setLobby] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [gameState, setGameState] = useState<any>({ phase: "LETTER_SELECT", letters: [], playerLetters: {}, poisonLetters: {}, playerHearts: {}, usedWords: [], scores: {}, timerEndTime: null, poisonEnabled: true, roundDuration: 60, gameStartTime: null });
  const [claimedWords, setClaimedWords] = useState<ClaimedWord[]>([]);
  const [isGameOver, setIsGameOver] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poisonReveal, setPoisonReveal] = useState<{ letter: string; source: string; show: boolean } | null>(null);
  const [letterSelectError, setLetterSelectError] = useState("");
  const [poisonError, setPoisonError] = useState("");
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [poisonAssignments, setPoisonAssignments] = useState<Record<string, string>>({});
  const [letterSelectTimeLeft, setLetterSelectTimeLeft] = useState(LETTER_SELECT_TIMEOUT);
  const [showDisconnected, setShowDisconnected] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBroadcastTick = useRef(0);
  const letterSelectStartRef = useRef<number | null>(null);
  const submitGuardRef = useRef(false);
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'leaderboard' | 'feed'>('leaderboard');
  const [liveInputs, setLiveInputs] = useState<Record<string, string>>({});

  // ── Derived ──────────────────────────────────────────────────────────
  const phase = gameState.phase;
  const letters: string[] = gameState.letters || [];
  const playerLettersState: Record<string, string> = gameState.playerLetters || {};
  const poisonLettersState: Record<string, Record<string, string>> = gameState.poisonLetters || {};
  const playerHearts: Record<string, number> = gameState.playerHearts || {};
  const usedWords: string[] = gameState.usedWords || [];
  const poisonEnabled = gameState.poisonEnabled !== false;
  const roundDuration = gameState.roundDuration || 60;
  const isHost = lobby?.host_id === effectivePlayerId;
  const otherPlayers = players.filter((p: any) => p.id !== effectivePlayerId);
  const myHearts = playerHearts[effectivePlayerId] ?? 3;
  const myColor = getPlayerColorByName(effectivePlayerId, players);

  const myWords = useMemo(() => claimedWords.filter((w) => w.player_id === effectivePlayerId), [claimedWords, effectivePlayerId]);
  const opponentClaimedWords = useMemo(() => claimedWords.filter((w) => w.player_id !== effectivePlayerId), [claimedWords, effectivePlayerId]);

  const scores = useMemo(() => {
    const s: Record<string, number> = {};
    players.forEach((p: any) => { s[p.id] = claimedWords.filter(w => w.player_id === p.id).reduce((sum, w) => sum + (w.is_poisoned ? 0 : w.points), 0); });
    return s;
  }, [players, claimedWords]);

  const myScore = scores[effectivePlayerId] || 0;

  // ── Per-player timer system ──────────────────────────────────────────
  const playerTimers: Record<string, number> = gameState.playerTimers || {};
  const playerTimersRef = useRef(playerTimers);
  playerTimersRef.current = playerTimers;
  const [myTimerSeconds, setMyTimerSeconds] = useState(roundDuration);
  const getOpponentTimer = (playerId: string): number | undefined => {
    const endTime = playerTimers[playerId];
    if (!endTime || typeof endTime !== "number") return undefined;
    return Math.max(0, Math.ceil(endTime - Date.now() / 1000));
  };

  // ── Realtime channel ─────────────────────────────────────────────────
  const { isConnected, broadcast, onBroadcast } = useRealtimeChannel({
    channelName: `links:${gameCode}`,
    enablePresence: false,
    subscribeLobby: gameCode,
    subscribePlayers: gameCode,
    subscribeArenaAnswers: gameCode,
    answersTableName: "links_words",
    onLobbyChange: (payload: any) => {
      if (payload.eventType === "DELETE" || !payload.new) { window.location.href = "/"; return; }
      const parsed = parseArenaState(payload.new.arena_state);
      if (parsed) {
        setGameState(parsed);
        if (parsed.phase === "PLAYING") { setSelectedLetter(null); setSubmitStatus(null); submitGuardRef.current = false; setPoisonAssignments({}); }
        if (parsed.phase === "RESULTS") setIsGameOver(true);
      }
    },
    onPlayerChange: async () => {
      const { data } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false });
      if (data) setPlayers(data);
    },
    onArenaAnswer: (payload: any) => {
      const newWord = payload.new as ClaimedWord;
      if (!newWord) return;
      setClaimedWords((prev) => { if (prev.find((w) => w.id === newWord.id)) return prev; return [...prev, newWord]; });
      if (newWord.is_poisoned && newWord.player_id === effectivePlayerId) {
        setPoisonReveal({ letter: newWord.poison_letter || "", source: newWord.player_name || "", show: true });
        setTimeout(() => setPoisonReveal((p) => p && p.show ? { ...p, show: false } : null), 3000);
      }
    },
    onReconnect: async () => {
      const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle();
      const parsed = parseArenaState(lobbyData?.arena_state);
      if (parsed) setGameState(parsed);
    },
  });

  // ── Connection banner ────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) { disconnectTimerRef.current = setTimeout(() => setShowDisconnected(true), 5000); }
    else { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; setShowDisconnected(false); }
    return () => { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); };
  }, [isConnected]);

  // ── Broadcast listeners ──────────────────────────────────────────────
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onBroadcast("letter:select", (payload: any) => {
      setGameState((prev: any) => ({ ...prev, playerLetters: { ...prev.playerLetters, [payload.playerId]: payload.letter }, letters: payload.letters || prev.letters, phase: payload.phase || prev.phase }));
    }));
    unsubs.push(onBroadcast("poison:assign", () => {
      supabase.from("lobbies").select("arena_state").eq("code", gameCode).single().then(({ data }) => { const parsed = parseArenaState(data?.arena_state); if (parsed) setGameState(parsed); });
    }));
    unsubs.push(onBroadcast("word:claim", (payload: any) => {
      setClaimedWords((prev) => { if (prev.find((w) => w.id === payload.id)) return prev; return [...prev, payload]; });
    }));
    unsubs.push(onBroadcast("player:leave", (payload: any) => {
      if (payload.playerId) { setPlayers((prev) => prev.filter((p) => p.id !== payload.playerId)); setLiveInputs((prev) => { const next = { ...prev }; delete next[payload.playerId]; return next; }); }
    }));
    unsubs.push(onBroadcast("player:typing", (payload: any) => {
      if (payload.playerId && payload.input !== undefined) setLiveInputs((prev) => ({ ...prev, [payload.playerId]: payload.input }));
    }));
    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast, gameCode]);

  // ── Initial fetch ────────────────────────────────────────────────────
  const recoveryAttemptedRef = useRef(false);
  useEffect(() => {
    if (!gameCode) return;
    let cancelled = false;
    const init = async () => {
      const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle();
      if (cancelled) return;
      if (lobbyData) {
        setLobby(lobbyData);
        const parsed = parseArenaState(lobbyData.arena_state);
        if (parsed) {
          const validPhases = ["LETTER_SELECT", "POISON_SETUP", "PLAYING", "RESULTS", "GAME_OVER"];
          if (parsed.phase && !validPhases.includes(parsed.phase) && !recoveryAttemptedRef.current) {
            recoveryAttemptedRef.current = true;
            await supabase.from("lobbies").update({ arena_state: null }).eq("code", gameCode);
            const { data: recovered } = await supabase.rpc("start_links_game", { p_lobby_code: gameCode, p_settings: { poisonEnabled: parsed.poisonEnabled !== false, roundDuration: parsed.roundDuration || 60 } });
            if (recovered?.success) {
              const { data: freshLobby } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle();
              if (freshLobby && !cancelled) { const freshParsed = parseArenaState(freshLobby.arena_state); if (freshParsed) { setGameState(freshParsed); setLobby(freshLobby); } }
              return;
            }
          }
          setGameState(parsed);
        }
      }
      const { data: playerData } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false });
      if (!cancelled && playerData) {
        setPlayers(playerData);
        const myRecord = playerData.find((p: any) => p.id === effectivePlayerId);
        if (!myRecord) {
          await supabase.from("players").upsert({ id: effectivePlayerId, lobby_code: gameCode, name: playerName || "Player", score: 0, metadata: {} }, { onConflict: "id" });
        }
      }
      const { data: wordsData } = await supabase.from("links_words").select("*").eq("lobby_code", gameCode).order("created_at", { ascending: true });
      if (!cancelled && wordsData) setClaimedWords(wordsData);
    };
    init();
    return () => { cancelled = true; };
  }, [gameCode, effectivePlayerId, playerName]);

  // ── Letter selection timer ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== "LETTER_SELECT") { letterSelectStartRef.current = null; setLetterSelectTimeLeft(LETTER_SELECT_TIMEOUT); return; }
    if (!letterSelectStartRef.current) letterSelectStartRef.current = Date.now();
    const interval = setInterval(() => { const elapsed = (Date.now() - (letterSelectStartRef.current || Date.now())) / 1000; setLetterSelectTimeLeft(Math.max(0, LETTER_SELECT_TIMEOUT - Math.floor(elapsed))); }, 200);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Polling fallback ─────────────────────────────────────────────────
  useEffect(() => {
    const poll = setInterval(async () => {
      if (isConnected) return;
      try {
        const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle();
        if (lobbyData) { setLobby(lobbyData); const parsed = parseArenaState(lobbyData.arena_state); if (parsed) setGameState(parsed); }
        const { data: playerData } = await supabase.from("players").select("*").eq("lobby_code", gameCode).order("score", { ascending: false });
        if (playerData) setPlayers(playerData);
        const { data: wordsData } = await supabase.from("links_words").select("*").eq("lobby_code", gameCode).order("created_at", { ascending: true });
        if (wordsData) setClaimedWords(wordsData);
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, [gameCode, isConnected]);

  // ── Word validation ──────────────────────────────────────────────────
  // Build dictionary intersection: words containing ALL required letters
  const [validWordCache, setValidWordCache] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (letters.length === 0) { setValidWordCache(null); return; }
    setValidWordCache(null);
    let cancelled = false;
    const init = async () => {
      const wordSets: Set<string>[] = [];
      for (const letter of letters) {
        const words = await fetchWordFile(letter);
        if (words.length > 0) wordSets.push(new Set(words));
      }
      if (cancelled) return;
      if (wordSets.length === 0) { setValidWordCache(null); return; }
      const first = wordSets[0];
      const intersection = new Set<string>();
      for (const word of first) {
        if (word.length >= 3 && word.length <= 15 && wordSets.every(s => s.has(word))) intersection.add(word);
      }
      if (!cancelled) setValidWordCache(intersection);
    };
    init();
    return () => { cancelled = true; };
  }, [letters]);

  const validateWord = useCallback((word: string) => {
    if (!word || word.length < 3) return { type: "typing" as const };
    const lower = word.toLowerCase().trim();
    if (!/^[a-z]{3,15}$/.test(lower)) return { type: "invalid" as const, message: "Letters only, 3-15 chars" };
    for (const letter of letters) { if (!lower.includes(letter.toLowerCase())) return { type: "missing" as const, message: `Missing "${letter}"` }; }
    if (validWordCache && !validWordCache.has(lower)) return { type: "invalid" as const, message: "Not in dictionary — names/places may be missing" };
    if (usedWords.includes(lower) || claimedWords.some((w) => w.word === lower)) {
      const claimer = claimedWords.find((w) => w.word === lower);
      return { type: "used" as const, message: claimer ? `${claimer.player_name} already claimed it` : "Already used" };
    }
    return { type: "valid" as const };
  }, [letters, usedWords, claimedWords, validWordCache]);

  // ── Typed word state ─────────────────────────────────────────────────
  const [typedWord, setTypedWord] = useState("");
  const [wordFeedback, setWordFeedback] = useState<{ type: string; message?: string }>({ type: "typing" });
  const [shakeKey, setShakeKey] = useState(0);

  const handleSetInput = useCallback((v: string) => {
    setTypedWord(v);
    if (v.length === 0) setWordFeedback({ type: "typing" });
    else setWordFeedback(validateWord(v));
  }, [validateWord]);

  // ── RPC Actions ──────────────────────────────────────────────────────
  const handleSelectLetter = async (letter: string) => {
    if (phase !== "LETTER_SELECT" || selectedLetter) return;
    setSelectedLetter(letter); setLetterSelectError("");
    const { data, error } = await supabase.rpc("select_links_letter", { p_lobby_code: gameCode, p_player_id: effectivePlayerId, p_letter: letter });
    if (error) { setLetterSelectError(error.message || "Failed"); setSelectedLetter(null); return; }
    if (data?.success === false) { setLetterSelectError(data.error || "Cannot select"); setSelectedLetter(null); return; }
    broadcast("letter:select", { playerId: effectivePlayerId, letter, letters: data.letters, phase: data.phase });
    setGameState((prev: any) => ({ ...prev, playerLetters: { ...prev.playerLetters, [effectivePlayerId]: letter }, letters: data.letters || prev.letters, phase: data.phase || prev.phase }));
  };

  const handleForceStart = async () => {
    if (!isHost) return;
    await supabase.rpc("start_links_game", { p_lobby_code: gameCode, p_settings: { poisonEnabled, roundDuration } });
    const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", gameCode).maybeSingle();
    if (lobbyData?.arena_state) setGameState(lobbyData.arena_state);
  };

  const handleSetPoisonLetter = (targetId: string, letter: string) => {
    setPoisonAssignments((prev) => ({ ...prev, [targetId]: prev[targetId] === letter ? "" : letter }));
  };

  const handleAssignPoison = async () => {
    if (phase !== "POISON_SETUP") return;
    const pairing = gameState.poisonPairings?.[effectivePlayerId];
    const targetId = pairing?.target || otherPlayers[0]?.id;
    if (targetId && !poisonAssignments[targetId]) { setPoisonError("Assign a poison letter for your target"); return; }
    setPoisonError("");
    const { data, error } = await supabase.rpc("assign_links_poison", { p_lobby_code: gameCode, p_player_id: effectivePlayerId, p_poison_map: poisonAssignments });
    if (error) { setPoisonError(error.message || "Failed"); return; }
    if (data?.success === false) { setPoisonError(data.error || "Cannot assign"); return; }
    broadcast("poison:assign", { playerId: effectivePlayerId });
    if (data?.phase === "PLAYING") setGameState((prev: any) => ({ ...prev, phase: "PLAYING" }));
  };

  const handleSubmitWord = async () => {
    if (phase !== "PLAYING" || submitGuardRef.current || isSubmitting) return;
    if (wordFeedback.type !== "valid") { if (wordFeedback.type === "used") setShakeKey(k => k + 1); return; }
    if (myHearts <= 0) return;
    const word = typedWord.trim().toLowerCase();
    if (!word || word.length < 3) return;

    submitGuardRef.current = true; setIsSubmitting(true); setSubmitStatus("Claiming...");

    const tempId = `temp-${Date.now()}`;
    const optimistic: ClaimedWord = { id: tempId, player_id: effectivePlayerId, player_name: playerName || "You", word, word_length: word.length, points: calcPoints(word.length), is_poisoned: false, poison_letter: null, hearts_remaining: myHearts, created_at: new Date().toISOString() };
    setClaimedWords((prev) => [...prev, optimistic]); setTypedWord(""); setWordFeedback({ type: "typing" });

    const { data, error } = await supabase.rpc("submit_links_word", { p_lobby_code: gameCode, p_player_id: effectivePlayerId, p_word: word });
    submitGuardRef.current = false; setIsSubmitting(false);

    if (error) { setClaimedWords((prev) => prev.filter((w) => w.id !== tempId)); setTypedWord(word); setSubmitStatus(error.message || "Submit failed"); setTimeout(() => setSubmitStatus(null), 3000); return; }
    if (data?.success === false) {
      setClaimedWords((prev) => prev.filter((w) => w.id !== tempId)); setTypedWord(word);
      if (data.error_code === "ALREADY_USED") { setWordFeedback({ type: "used", message: "Already claimed!" }); setShakeKey(k => k + 1); setSubmitStatus("Already taken!"); }
      else setSubmitStatus(data.error || "Rejected");
      setTimeout(() => setSubmitStatus(null), 3000); return;
    }
    setClaimedWords((prev) => prev.filter((w) => w.id !== tempId));
    if (data.is_poisoned) { setPoisonReveal({ letter: data.poison_letter || "", source: "", show: true }); setTimeout(() => setPoisonReveal((p) => p && p.show ? { ...p, show: false } : null), 3000); }
    setSubmitStatus(data.eliminated ? "💀 Eliminated!" : `+${data.points} pts`); setTimeout(() => setSubmitStatus(null), 2000);
    broadcast("word:claim", { id: tempId, playerId: effectivePlayerId, playerName: playerName || "Player", word, points: calcPoints(word.length) });
  };

  const handleLeave = async () => {
    if (confirm("Leave the game?")) {
      broadcast("player:leave", { playerId: effectivePlayerId });
      await supabase.from("players").delete().eq("id", effectivePlayerId).eq("lobby_code", gameCode);
      store.clearArenaHostCode();
      window.location.href = `/lobby/${gameCode}?from=game`;
    }
  };

  // ── Per-player timer tick (PLAYING phase) ────────────────────────
  const playerHeartsRef = useRef(playerHearts);
  useEffect(() => { playerHeartsRef.current = playerHearts; });
  const penaltyCheckRef = useRef(false);
  const penaltyAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (phase !== "PLAYING") { setMyTimerSeconds(roundDuration); return; }
    const interval = setInterval(() => {
      const now = Date.now() / 1000;
      const timers = playerTimersRef.current;
      const myEnd = timers[effectivePlayerId];
      if (myEnd) setMyTimerSeconds(Math.max(0, Math.ceil(myEnd - now)));
      // Host: check all player timers and penalize expired ones
      if (isHost && !penaltyCheckRef.current) {
        for (const [pid, endTime] of Object.entries(timers)) {
          if (typeof endTime === "number" && now >= endTime) {
            const attemptKey = `${pid}:${endTime}`;
            if (penaltyAttemptedRef.current.has(attemptKey)) continue;
            const hearts = playerHeartsRef.current[pid];
            if (hearts !== undefined && hearts > 0) {
              penaltyAttemptedRef.current.add(attemptKey);
              penaltyCheckRef.current = true;
              void (async () => {
                try {
                  const { data } = await supabase.rpc("penalize_links_player", { p_lobby_code: gameCode, p_player_id: pid });
                  penaltyCheckRef.current = false;
                  if (data?.success) broadcast("player:penalized", { playerId: pid, heartsRemaining: data.hearts_remaining, phase: data.phase });
                } catch { penaltyCheckRef.current = false; }
              })();
            }
          }
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [phase, effectivePlayerId, isHost, gameCode, broadcast, roundDuration]);

  // ── Listen for player:penalized broadcasts ──────────────────────────
  useEffect(() => {
    return onBroadcast("player:penalized", () => {
      supabase.from("lobbies").select("arena_state").eq("code", gameCode).single().then(({ data }) => {
        const parsed = parseArenaState(data?.arena_state);
        if (parsed) { setGameState(parsed); if (parsed.phase === "RESULTS") setIsGameOver(true); }
      });
    });
  }, [onBroadcast, gameCode]);

  // ── Live typing broadcast (throttled) ────────────────────────────────
  useEffect(() => {
    if (phase !== "PLAYING") return;
    const now = Date.now();
    if (now - lastBroadcastTick.current >= 200) {
      lastBroadcastTick.current = now;
      broadcast("player:typing", { playerId: effectivePlayerId, input: typedWord });
    } else {
      const t = setTimeout(() => { lastBroadcastTick.current = Date.now(); broadcast("player:typing", { playerId: effectivePlayerId, input: typedWord }); }, 200 - (now - lastBroadcastTick.current));
      return () => clearTimeout(t);
    }
  }, [typedWord, phase, broadcast, effectivePlayerId]);

  // ── Clear liveInputs when phase changes away from PLAYING ────────────
  useEffect(() => { if (phase !== "PLAYING") setLiveInputs({}); }, [phase]);

  // ── Loading state ────────────────────────────────────────────────────
  if (!lobby) {
    return <div className="min-h-screen bg-clay-cream flex items-center justify-center"><div className="text-warm-gray/60 font-medium text-sm animate-pulse">Loading LINKS...</div></div>;
  }

  // ── Game Over ────────────────────────────────────────────────────────
  if (isGameOver || phase === "RESULTS") {
    return <GameOverScreen players={players} claimedWords={claimedWords} playerHearts={playerHearts} letters={letters} poisonEnabled={poisonEnabled} lobbyCode={gameCode || ""} onLeave={handleLeave} />;
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-clay-cream font-outfit text-plum flex flex-col">
      {/* ── Disconnected banner ───────────────────────────────────── */}
      {showDisconnected && (
        <div className="sticky top-0 z-50 bg-peach-light border-b border-peach/30 px-4 py-3 flex items-center justify-center gap-3">
          <WifiOff className="w-4 h-4 text-peach animate-pulse" />
          <span className="text-peach text-xs font-bold uppercase tracking-widest">Connection lost — reconnecting...</span>
        </div>
      )}

      {/* ── Top Bar ───────────────────────────────────────────────── */}
      <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pt-4 md:pt-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={handleLeave} className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /><span className="hidden sm:inline">Leave</span>
          </button>

        </div>

        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            {showDisconnected ? (<><WifiOff className="w-3.5 h-3.5 text-peach animate-pulse" /><span className="text-peach hidden sm:inline">Reconnecting</span></>) : (<><Wifi className="w-3.5 h-3.5 text-mint" /><span className="text-mint hidden sm:inline">{players.length} online</span></>)}
          </div>
          {/* Phase badge */}
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${phase === "PLAYING" ? "bg-mint-light text-mint border-mint/30" : phase === "LETTER_SELECT" ? "bg-soft-purple-light text-soft-purple border-soft-purple/30" : phase === "POISON_SETUP" ? "bg-peach-light text-peach border-peach/30" : "bg-warm-gray/10 text-warm-gray/50 border-warm-gray/10"}`}>
            {phase === "LETTER_SELECT" ? "Pick Letter" : phase === "POISON_SETUP" ? "Set Poison" : phase === "PLAYING" ? "Playing" : phase}
          </div>
          <span className="text-[10px] font-mono text-warm-gray/50 hidden sm:inline">{gameCode}</span>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      {phase === "LETTER_SELECT" && (
        <LetterSelectPhase lettersTimeLeft={letterSelectTimeLeft} players={players} playerLetters={playerLettersState}
          playerColors={Object.fromEntries(players.map((p: any, i: number) => [p.id, getPlayerColorByIndex(i)]))}
          selectedLetter={selectedLetter} error={letterSelectError} isHost={isHost} onSelectLetter={handleSelectLetter} onForceStart={handleForceStart} />
      )}

      {phase === "POISON_SETUP" && (
        <PoisonSetupPhase letters={letters} poisonAssignments={poisonAssignments} error={poisonError}
          poisonTarget={(() => { const p = gameState.poisonPairings?.[effectivePlayerId]; return p ? otherPlayers.find(op => op.id === p.target) : otherPlayers[0]; })()}
          playerColors={Object.fromEntries(players.map((p: any, i: number) => [p.id, getPlayerColorByIndex(i)]))}
          onAssignPoison={handleAssignPoison} onSetPoisonLetter={handleSetPoisonLetter} />
      )}

      {phase === "PLAYING" && (
        <div className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-8 pb-8 flex flex-col md:flex-row gap-8 items-start">
          {/* ── Left: Active Player ── */}
          <div className="flex-1 w-full space-y-8">
            {/* Timer centered above card */}
            <div className="flex justify-center">
              <TensionTimer timeLeft={myTimerSeconds} maxTime={roundDuration} defaultColor="#A78BFA" />
            </div>

            <section>
              <ClayCard elevation="flat" padding="md" className="relative overflow-hidden">
                {/* Player header */}
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl p-1 shadow-sm flex items-center justify-center">
                      <AvatarIcon src={AVATARS[0].src} size="100%" />
                    </div>
                    <div>
                      <div className="font-bold text-lg leading-tight text-plum">{playerName || "You"}</div>
                      <div className="flex items-center gap-1 mt-1">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Heart key={i} className={`w-4 h-4 ${i < myHearts ? 'fill-peach text-peach' : 'opacity-30'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-2xl text-plum">{myScore}</div>
                    <div className="text-xs font-bold uppercase tracking-widest opacity-60 text-plum">Points</div>
                  </div>
                </div>

                {/* Letter pool inside card */}
                <div className="flex justify-center">
                  <LetterPool letters={letters} inputText={typedWord} title="" subtitle="These letters must be included in your word" />
                </div>

                {/* Submit status */}
                {submitStatus && <div className={`text-center text-xs font-bold mb-2 animate-clay-pop ${submitStatus.includes("+") ? "text-mint" : submitStatus.includes("💀") ? "text-peach" : "text-warm-gray/60"}`}>{submitStatus}</div>}

                {/* Poison reveal */}
                {poisonReveal?.show && (
                  <div className="mb-3 bg-peach-light border border-peach/30 rounded-2xl p-3 flex items-center gap-3 animate-clay-pop">
                    <span className="text-lg">☠️</span>
                    <div><p className="text-peach text-sm font-black">Poisoned!</p><p className="text-peach/70 text-xs font-medium">Letter '{poisonReveal.letter}' was a trap</p></div>
                  </div>
                )}

                {/* Input */}
                <form onSubmit={(e) => { e.preventDefault(); handleSubmitWord(); }} key={shakeKey} className={`relative ${shakeKey ? 'animate-shake' : ''}`}>
                  <input
                    type="text" value={typedWord}
                    onChange={(e) => handleSetInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    placeholder="Type word"
                  className={`w-full bg-warm-white text-plum text-2xl font-black font-mono tracking-[0.1em] rounded-2xl py-4 pl-6 pr-6 border-2 border-warm-gray/15 outline-none focus:border-soft-purple/40 focus:ring-2 focus:ring-soft-purple/20 transition-all ${wordFeedback.type === 'valid' ? '!border-mint/50 !ring-mint/20' : wordFeedback.type === 'missing' || wordFeedback.type === 'used' || wordFeedback.type === 'invalid' ? '!border-peach/50 !ring-peach/20' : ''}`}
                    autoFocus autoComplete="off" disabled={myHearts <= 0}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmitWord(); } }}
                  />
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
                      <div key={word.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm ${word.is_poisoned ? 'bg-peach-light border-peach/30 line-through' : 'bg-white/70 border-black/5'}`}>
                        {word.is_poisoned && <AlertTriangle className="w-3 h-3 text-peach" />}
                        <span className={`font-bold text-sm tracking-widest uppercase ${word.is_poisoned ? 'text-peach line-through' : 'text-plum'}`}>{word.word}</span>
                        {word.is_poisoned ? <span className="text-[10px] font-black uppercase text-peach">POISONED</span> : <span className="text-[10px] font-black opacity-60 text-plum">+{word.points}</span>}
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
                {/* You — always first */}
                <ClayCard elevation="flat" padding="sm" className="flex items-center justify-between ring-2 ring-warm-gray/20 ring-offset-2 ring-offset-clay-cream" style={{ backgroundColor: myColor.fillLight }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner" style={{ backgroundColor: myColor.fillLight }}>
                      <AvatarIcon src={AVATARS[0].src} size="28px" />
                    </div>
                    <div>
                      <div className="font-bold text-md leading-tight text-plum">You</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {Array.from({ length: 3 }).map((_, i) => (<Heart key={i} className={`w-3 h-3 ${i < myHearts ? 'fill-peach text-peach' : 'fill-warm-gray text-warm-gray opacity-30'}`} />))}
                      </div>
                    </div>
                  </div>
                  <div className="font-black text-xl text-plum/80">{myScore}</div>
                </ClayCard>

                {/* Opponents */}
                {otherPlayers.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0)).map((op) => {
                  const color = getPlayerColorByName(op.id, players);
                  const opScore = scores[op.id] || 0;
                  const opHearts = playerHearts[op.id] ?? 3;
                  const opWords = opponentClaimedWords.filter(w => w.player_id === op.id);
                  const isExpanded = expandedOpponent === op.id;

                  return (
                    <ClayCard key={op.id} elevation="flat" padding="sm"
                      className={`flex flex-col gap-3 cursor-pointer transition-all ${isExpanded ? 'ring-2 ring-offset-2 ring-offset-clay-cream' : 'hover:bg-black/5'}`}
                      onClick={() => setExpandedOpponent(isExpanded ? null : op.id)}
                      style={isExpanded ? { '--tw-ring-color': color.fill } as React.CSSProperties : undefined}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-inner" style={{ backgroundColor: color.fillLight }}>
                            <AvatarIcon src={AVATARS[(players.indexOf(op) + 1) % AVATARS.length].src} size="28px" />
                          </div>
                          <div>
                            <div className="font-bold text-md leading-tight text-plum">{op.name}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {Array.from({ length: 3 }).map((_, i) => (<Heart key={i} className={`w-3 h-3 ${i < opHearts ? 'fill-peach text-peach' : 'fill-warm-gray text-warm-gray opacity-30'}`} />))}
                            </div>
                          </div>
                        </div>
                        <div className="font-black text-xl text-plum/80">{opScore}</div>
                      </div>

                      {isExpanded && (
                        <div className="pt-3 border-t border-black/5 space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                          {opWords.length === 0 ? (
                            <div className="text-center text-sm font-bold opacity-50 py-2">No words yet</div>
                          ) : (
                            opWords.map((word) => (
                              <div key={word.id} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-black/5 shadow-sm">
                                <span className={`font-bold uppercase tracking-widest px-1 ${word.is_poisoned ? 'text-peach line-through' : ''}`}>{word.word}</span>
                                <span className="font-bold opacity-50">{word.is_poisoned ? '☠️' : `+${word.points}`}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </ClayCard>
                  );
                })}
              </div>
            ) : (
              <LiveFeed claimedWords={claimedWords} players={players} />
            )}
          </div>
        </div>
      )}

      {/* Unknown phase fallback */}
      {phase !== "LETTER_SELECT" && phase !== "POISON_SETUP" && phase !== "PLAYING" && phase !== "RESULTS" && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 text-center">
          <p className="text-sm text-warm-gray/50">Unknown phase: <code className="text-peach font-mono text-xs">{JSON.stringify(phase)}</code></p>
          {isHost && <button onClick={handleForceStart} className="px-6 py-3 rounded-2xl bg-soft-purple text-white font-black text-sm shadow-lg hover:opacity-90">Force Restart</button>}
        </div>
      )}
    </div>
  );
}
