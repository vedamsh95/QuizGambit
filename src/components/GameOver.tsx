import { useEffect, useState, useMemo } from "react";
import {
  Medal, Play, RotateCcw, Clock, Target, Zap, ArrowLeft,
  Star, TrendingUp, Swords, Sparkles, Brain,
  Layers,  Crown, Hash, Gauge, ZapOff, Trophy, Flame,
} from "lucide-react";
import confetti from "canvas-confetti";
import { supabase } from "../lib/supabase";
import ClayButton from "./ui/ClayButton";
import ClayCard from "./ui/ClayCard";
import ClayBadge from "./ui/ClayBadge";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PlayerResult {
  id: string; name: string; score: number;
  correctAnswers?: number; totalAnswers?: number; avgTimeMs?: number; bestStreak?: number;
  perTier?: Record<number, { correct: number; wrong: number; avgTimeMs: number }>;
  perCategory?: Record<string, { correct: number; wrong: number; points: number }>;
  fastestAnswerMs?: number; slowestAnswerMs?: number; totalTimeMs?: number;
}

export interface GameOverProps {
  lobbyCode: string; players: PlayerResult[]; playerId?: string;
  onPlayAgain?: () => void; onLeave?: () => void; onNewGame?: () => void; demo?: boolean;
}

// ── Demo Data ───────────────────────────────────────────────────────────────

const TIERS = [100, 200, 300, 400, 500];
const DEMO_CATEGORIES = ["Science", "History", "Sports", "Entertainment", "Geography"];

function generateDemoPlayers(): PlayerResult[] {
  const names = ["Vedamsh", "Rahul", "Priya", "Arjun", "Sneha"];
  const baseScores = [3850, 3420, 2980, 2150, 1680];
  const baseAccuracies = [0.88, 0.76, 0.68, 0.55, 0.42];
  const baseSpeeds = [3200, 4200, 5100, 6800, 8500];
  return names.map((name, i) => {
    const totalAnswered = 22 + Math.floor(Math.random() * 4);
    const accuracy = baseAccuracies[i] + (Math.random() * 0.06 - 0.03);
    const correctAnswers = Math.round(totalAnswered * accuracy);
    const avgTimeMs = Math.round(baseSpeeds[i] * (0.85 + Math.random() * 0.3));
    const perTier: Record<number, { correct: number; wrong: number; avgTimeMs: number }> = {};
    TIERS.forEach((t) => {
      const tierTotal = 3 + Math.floor(Math.random() * 4);
      const ta = Math.max(0.1, Math.min(1, accuracy + (Math.random() * 0.3 - 0.15)));
      perTier[t] = { correct: Math.round(tierTotal * ta), wrong: tierTotal - Math.round(tierTotal * ta), avgTimeMs: Math.round(avgTimeMs * (0.7 + (t / 500) * 0.6)) };
    });
    return {
      id: `p${i + 1}`, name, score: baseScores[i] + Math.floor(Math.random() * 300 - 150),
      correctAnswers, totalAnswers: totalAnswered, avgTimeMs,
      bestStreak: Math.floor(Math.random() * 7) + 2, perTier,
      fastestAnswerMs: Math.round(avgTimeMs * 0.3), slowestAnswerMs: Math.round(avgTimeMs * 2.8),
      totalTimeMs: Math.round(avgTimeMs * totalAnswered),
      perCategory: Object.fromEntries(DEMO_CATEGORIES.map((cat) => {
        const c = 2 + Math.floor(Math.random() * 4);
        const w = Math.floor(Math.random() * 2);
        const catAcc = 0.5 + Math.random() * 0.5;
        return [cat, { correct: Math.round(c * catAcc), wrong: c - Math.round(c * catAcc) + w, points: baseScores[i] / 5 + Math.floor(Math.random() * 200) }];
      })),
    };
  });
}

// ── Roasts ──────────────────────────────────────────────────────────────────

interface Roast { icon: React.ReactNode; text: string; color: string; }

function computeRoasts(players: PlayerResult[], playerId?: string): Roast[] {
  if (players.length < 2) return [];
  const r: Roast[] = [];
  const c = players[0], u = players[1], gap = c.score - u.score;
  if (gap <= 100 && u.score > 0) r.push({ icon: <Swords className="w-3.5 h-3.5" />, text: `Photo finish! ${c.name} beat ${u.name} by just ${gap} pts — ${u.name} is fuming 😤`, color: "butter" });
  else if (gap >= 1000) r.push({ icon: <Sparkles className="w-3.5 h-3.5" />, text: `${c.name} absolutely dominated — ${gap.toLocaleString()} pts ahead 👑`, color: "purple" });

  const wt = players.filter((p) => p.avgTimeMs !== undefined && p.avgTimeMs > 0);
  if (wt.length >= 2) {
    const f = wt.reduce((a, b) => (a.avgTimeMs! < b.avgTimeMs!) ? a : b);
    const s = wt.reduce((a, b) => (a.avgTimeMs! > b.avgTimeMs!) ? a : b);
    if ((s.avgTimeMs! / f.avgTimeMs!) >= 2 && s.id !== f.id) r.push({ icon: <Clock className="w-3.5 h-3.5" />, text: `${f.name} lightning-fast ⚡ — ${(s.avgTimeMs! / f.avgTimeMs!).toFixed(1)}× quicker than ${s.name}`, color: "mint" });
  }

  const wa = players.filter((p) => p.totalAnswers !== undefined && p.totalAnswers! > 0);
  if (wa.length >= 2) {
    const best = wa.reduce((a, b) => (a.correctAnswers! / a.totalAnswers!) > (b.correctAnswers! / b.totalAnswers!) ? a : b);
    const worst = wa.reduce((a, b) => (a.correctAnswers! / a.totalAnswers!) < (b.correctAnswers! / b.totalAnswers!) ? a : b);
    if (best.id !== worst.id) r.push({ icon: <Target className="w-3.5 h-3.5" />, text: `${worst.name} hit ${Math.round((worst.correctAnswers! / worst.totalAnswers!) * 100)}% — might need glasses? 🤓`, color: "gray" });
  }

  // Easy-pick detective
  const wti = players.filter((p) => p.perTier?.[100] && p.perTier[100].correct + p.perTier[100].wrong >= 3);
  if (wti.length >= 1) {
    const ep = wti.reduce((a, b) => {
      const aA = a.perTier![100].correct / (a.perTier![100].correct + a.perTier![100].wrong);
      const bA = b.perTier![100].correct / (b.perTier![100].correct + b.perTier![100].wrong);
      return aA > bA ? a : b;
    });
    const acc = Math.round((ep.perTier![100].correct / (ep.perTier![100].correct + ep.perTier![100].wrong)) * 100);
    if (acc >= 70) r.push({ icon: <Layers className="w-3.5 h-3.5" />, text: `${ep.name} cleans up on 100pt tiles (${acc}%) — the easy-pick specialist 🍰`, color: "sky" });
  }

  if (playerId) {
    const me = players.find((p) => p.id === playerId);
    if (me) {
      const rank = players.indexOf(me) + 1;
      if (rank === players.length && players.length >= 3) r.push({ icon: <TrendingUp className="w-3.5 h-3.5" />, text: "You placed last — someone's gotta hold down the fort 🏰", color: "gray" });
      if (rank === 2 && gap <= 200) r.push({ icon: <Star className="w-3.5 h-3.5" />, text: `So close! Just ${gap} pts separated you from the crown 👀`, color: "butter" });
      if (rank === 1 && gap >= 500) r.push({ icon: <Crown className="w-3.5 h-3.5" />, text: "You didn't just win — you made it look easy. Absolute dominance 👑", color: "purple" });
    }
  }
  return r;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function GameOver({
  lobbyCode, players: initialPlayers, playerId, onPlayAgain, onLeave, onNewGame, demo = false,
}: GameOverProps) {
  const [players, setPlayers] = useState<PlayerResult[]>(() =>
    demo ? generateDemoPlayers().sort((a, b) => b.score - a.score) : [...initialPlayers].sort((a, b) => b.score - a.score)
  );
  const [showCommentary, setShowCommentary] = useState(true);

  // Confetti
  useEffect(() => {
    const w = players[0]; if (!w) return;
    let cancelled = false; let raf = 0; const end = Date.now() + 3000;
    const frame = () => { if (cancelled) return; confetti({ particleCount: 3, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: ["#FFD700","#10B981","#fff"] }); confetti({ particleCount: 3, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: ["#FFD700","#10B981","#fff"] }); if (Date.now() < end && !cancelled) raf = requestAnimationFrame(frame); };
    confetti({ particleCount: 200, spread: 120, origin: { x: 0.5, y: 0.4 }, colors: ["#FFD700","#10B981","#34D399","#fff"] });
    raf = requestAnimationFrame(frame);
    if (demo) return () => { cancelled = true; cancelAnimationFrame(raf); };

    const loadStats = async () => {
      if (!lobbyCode || lobbyCode === "LOCAL") return;
      try {
        // Fetch answers (with question_id for tier/category join)
        let { data: answers } = await supabase.from("simultaneous_answers").select("player_id,player_name,is_correct,answer_time_ms,points_awarded,question_id").eq("lobby_code", lobbyCode);
        if (!answers?.length) { const r2 = await supabase.from("arena_answers").select("player_id,player_name,is_correct,answer_time_ms,points_awarded,question_id").eq("lobby_code", lobbyCode); answers = r2.data; }
        if (cancelled || !answers?.length) return;

        // Fetch questions to map question_id → points (tier) + category
        const { data: questions } = await supabase.from("questions").select("id,points,category").eq("lobby_code", lobbyCode);
        const qMap = new Map<string, { points: number; category: string }>();
        (questions || []).forEach((q: any) => { if (q.id) qMap.set(q.id, { points: q.points || 0, category: q.category || "General" }); });

        setPlayers((prev) => {
          const e = prev.map((p) => {
            const a = answers!.filter((x: any) => x.player_id === p.id);
            const cor = a.filter((x: any) => x.is_correct).length;
            const avg = a.length > 0 ? a.reduce((s: number, x: any) => s + (x.answer_time_ms || 0), 0) / a.length : 0;
            const ts = a.map((x: any) => x.answer_time_ms || 0).filter(Boolean);

            // Compute perTier and perCategory from answers joined with questions
            const perTier: Record<number, { correct: number; wrong: number; avgTimeMs: number }> = {};
            const perCategory: Record<string, { correct: number; wrong: number; points: number }> = {};
            a.forEach((ans: any) => {
              let q = ans.question_id ? qMap.get(ans.question_id) : null;
              // Fallback: if question_id is a composite key like "Science-300", parse it
              if (!q && ans.question_id) {
                const lastDash = ans.question_id.lastIndexOf("-");
                if (lastDash > 0) {
                  const pts = parseInt(ans.question_id.slice(lastDash + 1), 10);
                  const cat = ans.question_id.slice(0, lastDash);
                  if (!isNaN(pts) && pts > 0) q = { points: pts, category: cat };
                }
              }
              if (!q) return;
              const tier = q.points || 0;
              const cat = q.category || "General";
              if (!perTier[tier]) perTier[tier] = { correct: 0, wrong: 0, avgTimeMs: 0 };
              if (!perCategory[cat]) perCategory[cat] = { correct: 0, wrong: 0, points: 0 };
              if (ans.is_correct) { perTier[tier].correct++; perCategory[cat].correct++; perCategory[cat].points += (ans.points_awarded || 0); }
              else { perTier[tier].wrong++; perCategory[cat].wrong++; }
              perTier[tier].avgTimeMs = (perTier[tier].avgTimeMs * (perTier[tier].correct + perTier[tier].wrong - 1) + (ans.answer_time_ms || 0)) / (perTier[tier].correct + perTier[tier].wrong);
            });

            return { ...p, correctAnswers: cor, totalAnswers: a.length, avgTimeMs: Math.round(avg), fastestAnswerMs: ts.length ? Math.min(...ts) : undefined, slowestAnswerMs: ts.length ? Math.max(...ts) : undefined, totalTimeMs: ts.reduce((s: number, v: number) => s + v, 0), perTier: Object.keys(perTier).length > 0 ? perTier : undefined, perCategory: Object.keys(perCategory).length > 0 ? perCategory : undefined };
          });
          return e.sort((a, b) => b.score - a.score);
        });
      } catch {}
    };
    loadStats();
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, []);

  const roasts = useMemo(() => computeRoasts(players, playerId), [players, playerId]);

  // ── Analyst metrics ──────────────────────────────────────────────────────

  const efficiencyData = useMemo(() =>
    players.filter((p) => p.totalTimeMs && p.totalTimeMs > 0).map((p) => ({
      ...p, eps: Math.round((p.score / (p.totalTimeMs! / 1000)) * 10) / 10,
    })).sort((a, b) => (b as any).eps - (a as any).eps),
  [players]);

  // MVPs: exactly 5 awards — allow players to win multiple if needed
  const MIN_SUPERLATIVES = 5;
  const SUPERLATIVE_DEFS = [
    { key: "fastestFinger", label: "Fastest Finger ⚡", icon: <Zap className="w-3.5 h-3.5" />, color: "butter", calc: (ps: PlayerResult[]) => { const w = ps.filter((p) => p.fastestAnswerMs).sort((a, b) => a.fastestAnswerMs! - b.fastestAnswerMs!); return w.length ? { id: w[0].id, detail: `${(w[0].fastestAnswerMs! / 1000).toFixed(1)}s` } : null; } },
    { key: "brainiac", label: "Brainiac 🧠", icon: <Brain className="w-3.5 h-3.5" />, color: "purple", calc: (ps: PlayerResult[]) => { const w = [...ps].filter((p) => p.totalAnswers).sort((a, b) => (b.correctAnswers! / b.totalAnswers!) - (a.correctAnswers! / a.totalAnswers!)); return w.length ? { id: w[0].id, detail: `${Math.round((w[0].correctAnswers! / w[0].totalAnswers!) * 100)}%` } : null; } },
    { key: "streakGod", label: "Streak God 🔥", icon: <Flame className="w-3.5 h-3.5" />, color: "peach", calc: (ps: PlayerResult[]) => { const w = [...ps].filter((p) => p.bestStreak).sort((a, b) => (b.bestStreak || 0) - (a.bestStreak || 0)); return w.length ? { id: w[0].id, detail: `${w[0].bestStreak} streak` } : null; } },
    { key: "speedDemon", label: "Speed Demon 🏎️", icon: <Gauge className="w-3.5 h-3.5" />, color: "mint", calc: (ps: PlayerResult[]) => { const w = ps.filter((p) => p.avgTimeMs && p.avgTimeMs > 0).sort((a, b) => a.avgTimeMs! - b.avgTimeMs!); return w.length ? { id: w[0].id, detail: `${(w[0].avgTimeMs! / 1000).toFixed(1)}s avg` } : null; } },
    { key: "daredevil", label: "Daredevil 💀", icon: <ZapOff className="w-3.5 h-3.5" />, color: "gray", calc: (ps: PlayerResult[]) => { const w = [...ps].filter((p) => p.perTier?.[500] && p.perTier![500].correct + p.perTier![500].wrong >= 2).sort((a, b) => (b.perTier![500].correct + b.perTier![500].wrong) - (a.perTier![500].correct + a.perTier![500].wrong)); return w.length ? { id: w[0].id, detail: `${w[0].perTier![500].correct}/${w[0].perTier![500].correct + w[0].perTier![500].wrong} at 500pt` } : null; } },
    { key: "easyMoney", label: "Easy Money 🍰", icon: <Layers className="w-3.5 h-3.5" />, color: "sky", calc: (ps: PlayerResult[]) => { const w = [...ps].filter((p) => p.perTier?.[100] && p.perTier![100].correct + p.perTier![100].wrong >= 3).sort((a, b) => (b.perTier![100].correct + b.perTier![100].wrong) - (a.perTier![100].correct + a.perTier![100].wrong)); return w.length ? { id: w[0].id, detail: `${w[0].perTier![100].correct}/${w[0].perTier![100].correct + w[0].perTier![100].wrong} at 100pt` } : null; } },
  ];

  const superlatives = useMemo(() => {
    if (players.length < 2) return [];
    // One award per type — no dedup, same player can win multiple
    const all: { playerId: string; label: string; icon: React.ReactNode; color: string; detail: string; displayName: string }[] = [];
    for (const def of SUPERLATIVE_DEFS) {
      const winner = def.calc(players);
      if (winner) {
        const p = players.find((pl) => pl.id === winner.id);
        all.push({ playerId: winner.id, label: def.label, icon: def.icon, color: def.color, detail: winner.detail, displayName: p?.name || "Unknown" });
      }
    }
    return all.slice(0, MIN_SUPERLATIVES);
  }, [players]);

  if (players.length === 0 && !demo) {
    return <div className="min-h-screen bg-clay-cream flex items-center justify-center"><div className="w-10 h-10 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" /></div>;
  }

  const getMedalEmoji = (i: number) => { switch (i) { case 0: return "🥇"; case 1: return "🥈"; case 2: return "🥉"; default: return `#${i + 1}`; } };

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col items-center p-4 sm:p-6 gap-4 sm:gap-5 pb-24 overflow-y-auto">
      {demo && <ClayBadge color="butter">🧪 Demo</ClayBadge>}

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="text-center space-y-1 mt-2 animate-clay-pop">
        <div className="text-5xl sm:text-6xl">🏆</div>
        <h1 className="font-outfit font-black text-3xl sm:text-4xl text-plum tracking-tight">Game Over</h1>
        {players[0] && (
          <p className="text-sm font-bold text-plum/50">
            {players[0].name} wins with {players[0].score.toLocaleString()} pts
            {players.length >= 2 && ` — ${(players[0].score - players[1].score).toLocaleString()} pts ahead`}
          </p>
        )}
      </div>

      {/* ── Final Standings ──────────────────────────────────────────── */}
      <ClayCard elevation="elevated" padding="md" className="w-full max-w-lg">
        <h3 className="text-[13px] font-black uppercase tracking-wider text-plum/80 mb-3 flex items-center gap-1.5">
          <Medal className="w-3.5 h-3.5" /> Final Standings
        </h3>
        <div className="space-y-1.5">
          {/* Header row */}
          <div className="flex items-center gap-2 px-2 pb-1.5 border-b border-warm-gray/10">
            <span className="w-10 shrink-0" />
            <span className="flex-1 text-[11px] font-black text-plum/60 uppercase tracking-wider">Player</span>
            <span className="w-16 text-right text-[11px] font-black text-plum/60 uppercase tracking-wider">Score</span>
            <span className="w-12 text-right text-[11px] font-black text-plum/60 uppercase tracking-wider">Acc</span>
            <span className="w-12 text-right text-[11px] font-black text-plum/60 uppercase tracking-wider">Speed</span>
            <span className="w-12 text-right text-[10px] font-black text-plum/60 uppercase tracking-wider">pts/sec</span>
          </div>
          {players.map((p, i) => {
            const isMe = p.id === playerId;
            const acc = p.totalAnswers ? Math.round((p.correctAnswers! / p.totalAnswers) * 100) : 0;
            const speed = p.avgTimeMs ? `${(p.avgTimeMs / 1000).toFixed(1)}s` : "—";
            const barPct = Math.max(3, acc);
            const barColor = acc >= 80 ? "bg-mint" : acc >= 50 ? "bg-butter" : "bg-peach";
            return (
              <div key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-xl ${isMe ? "bg-mint-light/10 ring-1 ring-mint/20" : i === 0 ? "bg-butter-light/10" : "hover:bg-warm-white/50"}`}>
                <span className="w-10 text-center text-base shrink-0">{getMedalEmoji(i)}</span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className={`font-outfit font-bold text-sm truncate ${i === 0 ? "text-butter" : "text-plum"}`}>{p.name}</span>
                  {isMe && <span className="text-[7px] font-black px-1 py-0.5 rounded-full bg-mint-light text-mint border border-mint/30 uppercase tracking-wider shrink-0">You</span>}
                </div>
                <span className="w-16 text-right font-outfit font-black text-base text-soft-purple tabular-nums">{p.score.toLocaleString()}</span>
                <div className="w-12 flex items-center justify-end gap-1">
                  <div className="w-8 h-3 bg-warm-gray/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${barPct}%`, opacity: 0.25 + (barPct / 200) }} />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-plum/60 w-8 text-right">{acc}%</span>
                </div>
                <span className="w-12 text-right text-[11px] font-mono text-plum/50">{speed}</span>
                <span className="w-12 text-right font-outfit font-black text-sm text-soft-purple tabular-nums">{efficiencyData.find((e: any) => e.id === p.id)?.eps ?? "—"}</span>
              </div>
            );
          })}
        </div>
      </ClayCard>

      {/* ── Analyst Deck ──────────────────────────────────────────────── */}
      <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Card A: Performance Matrix (players × tiers) */}
        <ClayCard elevation="flat" padding="md" className="sm:col-span-2">
          <h3 className="text-[13px] font-black uppercase tracking-wider text-plum/80 mb-3 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5" /> Performance Matrix
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-warm-gray/10">
                  <th className="text-left pb-2 font-black text-plum/60 uppercase text-[12px] pr-3">Player</th>
                  {TIERS.map((t) => <th key={t} className="text-center pb-2 font-black text-plum/60 uppercase text-[12px] px-1.5">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const matrixPlayers = players.filter((p) => p.perTier);
                  if (matrixPlayers.length === 0) return (
                    <tr>
                      <td colSpan={TIERS.length + 1} className="py-6 text-center">
                        <p className="text-xs text-plum/30 italic">No tier data yet — play more rounds to unlock per‑tier stats</p>
                      </td>
                    </tr>
                  );
                  return matrixPlayers.map((p) => (
                    <tr key={p.id} className="border-b border-warm-gray/5 last:border-0">
                      <td className="py-1.5 font-bold text-sm text-plum truncate max-w-[90px] pr-3">{p.name}</td>
                      {TIERS.map((t) => {
                        const ts = p.perTier?.[t];
                        if (!ts || ts.correct + ts.wrong === 0) return <td key={t} className="text-center text-warm-gray/30 px-1.5">—</td>;
                        const acc = Math.round((ts.correct / (ts.correct + ts.wrong)) * 100);
                        const bg = acc >= 80 ? "bg-mint/20 text-mint" : acc >= 50 ? "bg-butter/20 text-butter" : "bg-peach/10 text-peach";
                        return (
                          <td key={t} className="text-center px-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${bg}`}>
                              {acc}%
                            </span>
                            <div className="text-[10px] text-plum/40">{(ts.avgTimeMs / 1000).toFixed(1)}s</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </ClayCard>

        {/* Card B: MVPs — yearbook-style awards */}
        <ClayCard elevation="flat" padding="md" className="sm:col-span-2">
          <h3 className="text-[13px] font-black tracking-wider text-plum/80 mb-3 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> MVPs
          </h3>
          {superlatives.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {superlatives.map((s) => {
                const colorStyle = s.color === "butter" ? "from-butter-light/40 to-butter-light/10 border-butter/30" : s.color === "purple" ? "from-soft-purple-light/30 to-soft-purple-light/5 border-soft-purple/30" : s.color === "peach" ? "from-peach-light/30 to-peach-light/5 border-peach/30" : s.color === "mint" ? "from-mint-light/30 to-mint-light/5 border-mint/30" : s.color === "sky" ? "from-sky-light/30 to-sky-light/5 border-sky/30" : "from-cream to-warm-white border-warm-gray/10";
                const iconBg = s.color === "butter" ? "bg-butter/10" : s.color === "purple" ? "bg-soft-purple/10" : s.color === "peach" ? "bg-peach/10" : s.color === "mint" ? "bg-mint/10" : s.color === "sky" ? "bg-sky/10" : "bg-warm-gray/10";
                return (
                  <div key={`${s.playerId}-${s.label}`} className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl border bg-gradient-to-br ${colorStyle}`}>
                    <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-outfit font-black text-plum leading-tight">{s.label}</p>
                      <p className="text-[11px] font-bold text-plum/50">{s.displayName} · {s.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-plum/30 italic">{players.length < 2 ? "Need at least 2 players for awards" : "Not enough data yet — answer more questions to unlock MVPs"}</p>
          )}
        </ClayCard>

        {/* Card C: Category Heatmap + Best/Worst */}
        <ClayCard elevation="flat" padding="md" className="sm:col-span-2">
          <h3 className="text-[13px] font-black uppercase tracking-wider text-plum/80 mb-3 flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" /> Category Breakdown
          </h3>
          {(() => {
            const allCats = Array.from(new Set(players.flatMap((p) => p.perCategory ? Object.keys(p.perCategory) : [])));
            if (allCats.length === 0) return <p className="text-xs text-plum/30 italic">No category stats yet — answer more questions to see your breakdown</p>;
            const catEmoji = (cat: string) => {
              const k = cat.toLowerCase().replace(/[^a-z0-9_]/g, "");
              for (const [kw, e] of Object.entries({ science: "🔬", history: "🏛️", sports: "⚽", entertainment: "🎬", geography: "🌍", music: "🎵", technology: "💻", math: "🔢", nature: "🌿", food: "🍕", space: "🚀", gaming: "🎮", literature: "📚", mythology: "🏺", art: "🎨" })) { if (k.includes(kw)) return e; }
              return "📖";
            };
            const playersWithCats = players.filter((p) => p.perCategory);
            return (
              <>
                {/* Heatmap: players × categories */}
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-warm-gray/10">
                        <th className="text-left pb-2 font-black text-plum/60 uppercase text-[12px] pr-2" />
                        {allCats.map((cat) => <th key={cat} className="text-center pb-2 font-black text-plum/60 uppercase text-[10px] px-1">{catEmoji(cat)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {playersWithCats.map((p) => (
                        <tr key={p.id} className="border-b border-warm-gray/5 last:border-0">
                          <td className="py-1.5 font-bold text-sm text-plum truncate max-w-[70px] pr-2">{p.name}</td>
                          {allCats.map((cat) => {
                            const cs = p.perCategory?.[cat];
                            if (!cs || cs.correct + cs.wrong === 0) return <td key={cat} className="text-center text-warm-gray/30">—</td>;
                            const acc = Math.round((cs.correct / (cs.correct + cs.wrong)) * 100);
                            const bg = acc >= 80 ? "bg-mint/20 text-mint" : acc >= 50 ? "bg-butter/20 text-butter" : "bg-peach/10 text-peach";
                            return (
                              <td key={cat} className="text-center px-1">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${bg}`}>{acc}%</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Best + Worst per player */}
                <div className="space-y-1 pt-2 border-t border-warm-gray/10">
                  {playersWithCats.map((p) => {
                    const cats = Object.entries(p.perCategory!).filter(([, v]) => v.correct + v.wrong > 0);
                    if (!cats.length) return null;
                    const best = cats.reduce((a, b) => (a[1].correct/(a[1].correct+a[1].wrong)) > (b[1].correct/(b[1].correct+b[1].wrong)) ? a : b);
                    const worst = cats.reduce((a, b) => (a[1].correct/(a[1].correct+a[1].wrong)) < (b[1].correct/(b[1].correct+b[1].wrong)) ? a : b);
                    const bestAcc = Math.round((best[1].correct/(best[1].correct+best[1].wrong))*100);
                    const worstAcc = Math.round((worst[1].correct/(worst[1].correct+worst[1].wrong))*100);
                    return (
                      <div key={p.id} className="flex items-center gap-1.5 text-xs">
                        <span className="font-bold text-plum/60 w-16 truncate shrink-0 text-right">{p.name}</span>
                        <span className="text-mint font-bold">🧠 {best[0]} {bestAcc}%</span>
                        {best[0] !== worst[0] && (
                          <>
                            <span className="text-plum/20">·</span>
                            <span className="text-peach font-bold">💀 {worst[0]} {worstAcc}%</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </ClayCard>

      </div>

      {/* ── Commentary ───────────────────────────────────────────────── */}
      {roasts.length > 0 && (
        <ClayCard elevation="flat" padding="md" className="w-full max-w-lg">
          <button onClick={() => setShowCommentary(!showCommentary)} className="flex items-center gap-2 text-plum/60 hover:text-plum/80 transition-colors text-[12px] font-black uppercase tracking-wider w-full text-left mb-2">
            <Brain className="w-3.5 h-3.5" /> Commentary {showCommentary ? "▲" : "▼"}
          </button>
          {showCommentary && (
            <div className="space-y-1.5">
              {roasts.map((r, i) => {
                const style = r.color === "butter" ? "bg-butter-light/30 text-butter" : r.color === "purple" ? "bg-soft-purple-light/20 text-soft-purple" : r.color === "mint" ? "bg-mint-light/20 text-mint" : r.color === "sky" ? "bg-sky-light/20 text-sky" : "bg-cream text-warm-gray";
                return <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold ${style}`}>{r.icon}<span>{r.text}</span></div>;
              })}
            </div>
          )}
        </ClayCard>
      )}

      {/* ── Personal Stats ──────────────────────────────────────────── */}
      {playerId && (() => {
        const me = players.find((p) => p.id === playerId);
        if (!me?.perTier) return null;
        const myTiers = TIERS.filter((t) => me.perTier?.[t] && me.perTier[t].correct + me.perTier[t].wrong > 0);
        if (myTiers.length === 0) return null;
        const myAcc = me.totalAnswers! > 0 ? Math.round((me.correctAnswers! / me.totalAnswers!) * 100) : 0;
        const myEps = (efficiencyData as any[]).find((p: any) => p.id === playerId)?.eps;
        const mySuperlative = superlatives.find((s) => s.playerId === playerId);
        return (
          <ClayCard elevation="flat" padding="md" className="w-full max-w-lg border-mint/20">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-black uppercase tracking-wider text-plum/80 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-mint" /> Your Breakdown
              </h3>
              <div className="flex items-center gap-2">
                {myEps !== undefined && <ClayBadge color="sky">{myEps} pts/s</ClayBadge>}
                <ClayBadge color="mint">{myAcc}%</ClayBadge>
                {mySuperlative && <ClayBadge color={mySuperlative.color as any}>{mySuperlative.label}</ClayBadge>}
              </div>
            </div>
            <div className="space-y-2">
              {myTiers.map((t) => {
                const ts = me.perTier![t]; const total = ts.correct + ts.wrong;
                const acc = Math.round((ts.correct / total) * 100);
                const barPct = Math.max(8, acc);
                const barColor = acc >= 80 ? "bg-mint" : acc >= 50 ? "bg-butter" : "bg-peach";
                const emoji = acc >= 80 ? "🔥" : acc >= 50 ? "👍" : "💀";
                return (
                  <div key={t} className="flex items-center gap-2.5">
                    <span className="w-10 text-right text-[11px] font-outfit font-black text-plum/60 shrink-0">{t}pt</span>
                    <div className="flex-1 h-6 bg-warm-gray/5 rounded-full overflow-hidden relative">
                      <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${barPct}%`, opacity: 0.25 + (barPct / 200) }} />
                      <div className="absolute inset-0 flex items-center px-2.5 justify-between text-[10px] font-bold">
                        <span className="text-plum/70">{ts.correct}/{total}</span>
                        <span className="text-plum/40">{(ts.avgTimeMs / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                    <span className="text-sm">{emoji}</span>
                  </div>
                );
              })}
            </div>
          </ClayCard>
        );
      })()}

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm flex gap-3 mt-2">
        {onPlayAgain && <ClayButton variant="primary" size="lg" className="flex-1" icon={<Play className="w-4 h-4" />} onClick={onPlayAgain}>Play Again</ClayButton>}
        {onNewGame && <ClayButton variant="secondary" size="lg" className="flex-1" icon={<RotateCcw className="w-4 h-4" />} onClick={onNewGame}>New Game</ClayButton>}
        {onLeave && <ClayButton variant="secondary" size="lg" className="flex-1" icon={<ArrowLeft className="w-4 h-4" />} onClick={onLeave}>Exit</ClayButton>}
      </div>

      <p className="text-[11px] text-plum/30 tracking-[0.2em] uppercase text-center">
        Room {lobbyCode} {demo ? "(Demo)" : ""} · {players.length} players
      </p>
    </div>
  );
}
