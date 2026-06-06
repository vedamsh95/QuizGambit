import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, Search, X, CheckCircle2, Trophy, Zap,
  Play, ChevronRight, Plus, Sliders, Clock, Hash, Target, Shield, Grid3X3,
} from "lucide-react";
import ClayButton from "./ui/ClayButton";
import { supabase } from "../lib/supabase";
import type { BroadcastEventName, BroadcastHandler } from "../hooks/useRealtimeChannel";

// ── Types ───────────────────────────────────────────────────────────────────

interface DraftPick {
  playerId: string;
  playerName: string;
  categoryId: string;
  categoryName: string;
  round: number;
  slotIndex: number;
}

interface DraftCategory {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  data?: any[];
  main_category?: string;
  tags?: string[];
  is_global?: boolean;
}

export interface SimultaneousSettings {
  rounds: number;
  timer: number;
  catsPerRound: number;
  scoringType: "RELATIVE" | "FASTEST_FINGER";
  penaltyType: "HALF" | "FULL";
  selectionMode: "HOST_PICK" | "PLAYER_DRAFT";
  selectedCategories: Record<number, Category[]>;
  setupStep: "waiting" | "configuring" | "draft_pool";
  draftPoolIds: string[];
  draftPhase: "pending" | "in_progress" | "complete";
  draftPicks: DraftPick[];
  draftTurnIndex: number;
}

interface SimultaneousSetupProps {
  lobbyCode: string;
  players: any[];
  hostPlayerId: string;
  hostPlayerName: string;
  playerId: string;
  playerName: string;
  broadcast: (event: BroadcastEventName, payload: any) => void;
  onBroadcast: (event: BroadcastEventName, handler: BroadcastHandler) => () => void;
  updateLobbySetting: (key: string, val: any) => Promise<{ error: any }>;
  allCategories: Category[];
  catsLoading: boolean;
  initialSettings: any;
  onStartGame: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CAT_COLORS = [
  "bg-lavender border-soft-purple/30",
  "bg-sky border-sky/30",
  "bg-peach border-peach/30",
  "bg-mint border-mint/30",
  "bg-butter border-butter/30",
];

const DEFAULT_CATS_PER_ROUND = 5; // 5×5 grid

// ── Component ───────────────────────────────────────────────────────────────

export default function SimultaneousSetup({
  lobbyCode,
  players,
  hostPlayerId,
  hostPlayerName,
  playerId,
  playerName,
  broadcast,
  onBroadcast,
  updateLobbySetting,
  allCategories,
  catsLoading,
  initialSettings,
  onStartGame,
}: SimultaneousSetupProps) {
  const navigate = useNavigate();

  // ── Settings state ──────────────────────────────────────────────────────

  const [rounds, setRounds] = useState(initialSettings?.rounds || 1);
  const [timer, setTimer] = useState(initialSettings?.timer || 15);
  const [catsPerRound, setCatsPerRound] = useState(
    initialSettings?.catsPerRound || DEFAULT_CATS_PER_ROUND
  );
  const [scoringType, setScoringType] = useState<"RELATIVE" | "FASTEST_FINGER">(
    initialSettings?.scoringType || "RELATIVE"
  );
  const [penaltyType, setPenaltyType] = useState<"HALF" | "FULL">(
    initialSettings?.penaltyType || "HALF"
  );

  // ── Category state ─────────────────────────────────────────────────────

  const [categorySearch, setCategorySearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Record<number, Category[]>>(
    initialSettings?.selectedCategories || {}
  );
  const [activeRound, setActiveRound] = useState(1);

  // ── Draft state ────────────────────────────────────────────────────────

  const [selectionMode, setSelectionMode] = useState<"HOST_PICK" | "PLAYER_DRAFT">(
    initialSettings?.selectionMode || "HOST_PICK"
  );
  const [setupStep, setSetupStep] = useState<"waiting" | "configuring" | "draft_pool">(
    initialSettings?.setupStep || "waiting"
  );
  const [draftPoolIds, setDraftPoolIds] = useState<Set<string>>(
    initialSettings?.draftPoolIds ? new Set(initialSettings.draftPoolIds) : new Set()
  );
  const [draftPhase, setDraftPhase] = useState<"pending" | "in_progress" | "complete">(
    initialSettings?.draftPhase || "pending"
  );
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>(
    initialSettings?.draftPicks || []
  );
  const [draftTurnIndex, setDraftTurnIndex] = useState(
    initialSettings?.draftTurnIndex || 0
  );

  // ── Start state ────────────────────────────────────────────────────────

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");

  // ── Refs ───────────────────────────────────────────────────────────────

  const draftPicksRef = useRef(draftPicks);
  const draftTurnIndexRef = useRef(draftTurnIndex);
  const catsPerRoundRef = useRef(catsPerRound);
  const playersRef = useRef(players);
  const draftPhaseRef = useRef(draftPhase);
  const roundsRef = useRef(rounds);
  const selectedCategoriesRef = useRef(selectedCategories);
  const draftPoolIdsRef = useRef(draftPoolIds);
  const setupStepRef = useRef(setupStep);
  const scoringTypeRef = useRef(scoringType);
  const penaltyTypeRef = useRef(penaltyType);
  const timerRef = useRef(timer);
  const sliderDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const poolEverTouchedRef = useRef(false);

  useEffect(() => { draftPicksRef.current = draftPicks; }, [draftPicks]);
  useEffect(() => { draftTurnIndexRef.current = draftTurnIndex; }, [draftTurnIndex]);
  useEffect(() => { catsPerRoundRef.current = catsPerRound; }, [catsPerRound]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { draftPhaseRef.current = draftPhase; }, [draftPhase]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { selectedCategoriesRef.current = selectedCategories; }, [selectedCategories]);
  useEffect(() => { draftPoolIdsRef.current = draftPoolIds; }, [draftPoolIds]);
  useEffect(() => { setupStepRef.current = setupStep; }, [setupStep]);
  useEffect(() => { scoringTypeRef.current = scoringType; }, [scoringType]);
  useEffect(() => { penaltyTypeRef.current = penaltyType; }, [penaltyType]);
  useEffect(() => { timerRef.current = timer; }, [timer]);

  // ── Broadcast listeners ────────────────────────────────────────────────

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onBroadcast("settings:update", (payload: any) => {
      if (payload.rounds !== undefined) setRounds(payload.rounds);
      if (payload.timer !== undefined) setTimer(payload.timer);
      if (payload.catsPerRound !== undefined) setCatsPerRound(payload.catsPerRound);
      if (payload.selectionMode) setSelectionMode(payload.selectionMode);
      if (payload.setupStep) setSetupStep(payload.setupStep);
      if (payload.scoringType) setScoringType(payload.scoringType);
      if (payload.penaltyType) setPenaltyType(payload.penaltyType);
      if (payload.draftPoolIds) {
        try { setDraftPoolIds(new Set(payload.draftPoolIds)); } catch {}
      }
      if (payload.draftPhase) setDraftPhase(payload.draftPhase);
      if (payload.draftPicks) setDraftPicks(payload.draftPicks);
      if (payload.draftTurnIndex !== undefined) setDraftTurnIndex(payload.draftTurnIndex);
      if (payload.selectedCategories) {
        try { setSelectedCategories(payload.selectedCategories); } catch {}
      }
    }));

    // Draft broadcast listeners
    unsubs.push(onBroadcast("draft:pick", (payload: any) => {
      if (!payload.playerId || !payload.categoryId) return;
      if (draftPhaseRef.current !== "in_progress") return;

      const currentPicks = draftPicksRef.current;
      if (currentPicks.some((p) => p.categoryId === payload.categoryId)) return;

      const nextSlot = currentPicks.length;
      const round = Math.floor(nextSlot / catsPerRoundRef.current) + 1;
      const slotIndex = nextSlot % catsPerRoundRef.current;

      const enrichedPick: DraftPick = { ...payload, round, slotIndex };
      const newPicks = [...currentPicks, enrichedPick];
      setDraftPicks(newPicks);

      const nextTurn = (draftTurnIndexRef.current + 1) % (playersRef.current.length || 1);
      setDraftTurnIndex(nextTurn);

      updateLobbySetting("draftPicks", newPicks);
      updateLobbySetting("draftTurnIndex", nextTurn);

      const total = roundsRef.current * catsPerRoundRef.current;
      if (newPicks.length >= total) {
        setDraftPhase("complete");
        updateLobbySetting("draftPhase", "complete");
        broadcast("draft:complete", { picks: newPicks });
        broadcast("draft:sync", { picks: newPicks, turnIndex: nextTurn, phase: "complete" });
      } else {
        broadcast("draft:turn", { turnIndex: nextTurn });
        broadcast("draft:sync", { picks: newPicks, turnIndex: nextTurn, phase: "in_progress" });
      }
    }));

    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast, updateLobbySetting, broadcast]);

  // ── Polling fallback ───────────────────────────────────────────────────

  useEffect(() => {
    if (!lobbyCode) return;
    const needsPolling = setupStep === "configuring" || setupStep === "draft_pool" || draftPhase === "in_progress";
    if (!needsPolling) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("lobbies")
        .select("settings")
        .eq("code", lobbyCode)
        .single();
      if (!data?.settings) return;
      const s = data.settings;

      if (s.draftPicks) setDraftPicks(s.draftPicks);
      if (s.draftTurnIndex !== undefined) setDraftTurnIndex(s.draftTurnIndex);
      if (s.draftPhase) setDraftPhase(s.draftPhase);
      if (s.draftPoolIds) {
        try { setDraftPoolIds(new Set(s.draftPoolIds as string[])); } catch {}
      }
      if (s.setupStep) setSetupStep(s.setupStep);
      if (s.selectedCategories) setSelectedCategories(s.selectedCategories);
      if (s.rounds !== undefined) setRounds(s.rounds);
      if (s.timer !== undefined) setTimer(s.timer);
      if (s.catsPerRound !== undefined) setCatsPerRound(s.catsPerRound);
      if (s.scoringType) setScoringType(s.scoringType);
      if (s.penaltyType) setPenaltyType(s.penaltyType);
    }, 3000);

    return () => clearInterval(interval);
  }, [lobbyCode, setupStep, draftPhase]);

  // ── Derived ────────────────────────────────────────────────────────────

  const isHost = playerId === hostPlayerId;
  const totalSlots = rounds * catsPerRound;

  const draftPool: DraftCategory[] = useMemo(() => {
    if (selectionMode === "PLAYER_DRAFT") {
      return allCategories
        .filter((c) => draftPoolIds.has(c.id))
        .map((c) => ({ id: c.id, name: displayName(c.name) }));
    }
    const seen = new Set<string>();
    const pool: DraftCategory[] = [];
    for (let r = 1; r <= rounds; r++) {
      const cats = selectedCategories[r] || [];
      for (const cat of cats) {
        if (!seen.has(cat.id)) {
          seen.add(cat.id);
          pool.push({ id: cat.id, name: displayName(cat.name) });
        }
      }
    }
    return pool;
  }, [selectionMode, draftPoolIds, allCategories, selectedCategories, rounds]);

  const pickedCategoryIds = useMemo(() => new Set(draftPicks.map((p) => p.categoryId)), [draftPicks]);
  const availableDraftCategories = useMemo(() => draftPool.filter((c) => !pickedCategoryIds.has(c.id)), [draftPool, pickedCategoryIds]);
  const slotsFilled = draftPicks.length;
  const allSlotsFilled = totalSlots > 0 && slotsFilled >= totalSlots;
  const currentPicker = players[draftTurnIndex % (players.length || 1)];

  const totalRoundsFilled = Object.keys(selectedCategories).length;
  const allRoundsFilled = totalRoundsFilled === rounds &&
    Object.values(selectedCategories).every((cats) => cats.length === catsPerRound);

  const canConfigure = players.length >= 2;
  const canStartHostPick = selectionMode === "HOST_PICK" && allRoundsFilled && canConfigure;
  const canStartDraftPool = selectionMode === "PLAYER_DRAFT" && draftPoolIds.size >= totalSlots && canConfigure;

  // ── Helpers ────────────────────────────────────────────────────────────

  function displayName(name: string) {
    return (name || "").replace(" (Arena)", "").trim();
  }

  const debouncedUpdate = useCallback((key: string, val: any) => {
    if (sliderDebounceRef.current[key]) clearTimeout(sliderDebounceRef.current[key]);
    sliderDebounceRef.current[key] = setTimeout(() => updateLobbySetting(key, val), 300);
  }, [updateLobbySetting]);

  // ── Settings handlers ──────────────────────────────────────────────────

  const handleRoundsChange = useCallback((val: number) => {
    if (!isHost) return;
    setRounds(val);
    setSelectedCategories((prev) => {
      const cleaned: Record<number, Category[]> = {};
      for (let r = 1; r <= val; r++) {
        if (prev[r]) cleaned[r] = prev[r].slice(0, catsPerRound);
      }
      return cleaned;
    });
    setActiveRound((prev) => Math.min(prev, val));
    broadcast("settings:update", { rounds: val });
    debouncedUpdate("rounds", val);
  }, [catsPerRound, debouncedUpdate, broadcast]);

  const handleTimerChange = useCallback((val: number) => {
    if (!isHost) return;
    setTimer(val);
    broadcast("settings:update", { timer: val });
    debouncedUpdate("timer", val);
  }, [debouncedUpdate, broadcast]);

  const handleCatsPerRoundChange = useCallback((val: number) => {
    if (!isHost) return;
    setCatsPerRound(val);
    setSelectedCategories((prev) => {
      const cleaned: Record<number, Category[]> = {};
      for (let r = 1; r <= rounds; r++) {
        if (prev[r]) cleaned[r] = prev[r].slice(0, val);
      }
      return cleaned;
    });
    broadcast("settings:update", { catsPerRound: val });
    debouncedUpdate("catsPerRound", val);
  }, [rounds, debouncedUpdate, broadcast]);

  const handleScoringToggle = useCallback((val: "RELATIVE" | "FASTEST_FINGER") => {
    if (!isHost) return;
    setScoringType(val);
    broadcast("settings:update", { scoringType: val });
    updateLobbySetting("scoringType", val);
  }, [broadcast, updateLobbySetting]);

  const handlePenaltyToggle = useCallback((val: "HALF" | "FULL") => {
    if (!isHost) return;
    setPenaltyType(val);
    broadcast("settings:update", { penaltyType: val });
    updateLobbySetting("penaltyType", val);
  }, [broadcast, updateLobbySetting]);

  // ── Category handlers ──────────────────────────────────────────────────

  const toggleCategory = useCallback((cat: Category, round: number) => {
    if (!isHost) return;
    setSelectedCategories((prev) => {
      const current = prev[round] || [];
      const exists = current.find((c) => c.id === cat.id);
      if (exists) {
        const updated = { ...prev, [round]: current.filter((c) => c.id !== cat.id) };
        broadcast("settings:update", { selectedCategories: updated });
        updateLobbySetting("selectedCategories", updated);
        return updated;
      }
      if (current.length >= catsPerRound) return prev;
      for (const [r, cats] of Object.entries(prev)) {
        if (cats.some((c) => c.id === cat.id) && parseInt(r) !== round) {
          const updated: Record<number, Category[]> = {};
          for (const [key, val] of Object.entries(prev)) {
            const k = parseInt(key);
            if (k === round) updated[k] = [...val, cat];
            else updated[k] = val.filter((c: any) => c.id !== cat.id);
          }
          broadcast("settings:update", { selectedCategories: updated });
          updateLobbySetting("selectedCategories", updated);
          return updated;
        }
      }
      const updated = { ...prev, [round]: [...current, cat] };
      broadcast("settings:update", { selectedCategories: updated });
      updateLobbySetting("selectedCategories", updated);
      return updated;
    });
  }, [catsPerRound, broadcast, updateLobbySetting]);

  const removeCategory = useCallback((round: number, catId: string) => {
    if (!isHost) return;
    setSelectedCategories((prev) => {
      const updated = { ...prev, [round]: (prev[round] || []).filter((c) => c.id !== catId) };
      broadcast("settings:update", { selectedCategories: updated });
      updateLobbySetting("selectedCategories", updated);
      return updated;
    });
  }, [broadcast, updateLobbySetting]);

  // ── Draft pool handler ────────────────────────────────────────────────

  const toggleDraftPool = useCallback((catId: string) => {
    if (!isHost) return;
    setDraftPoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      const arr = Array.from(next);
      broadcast("settings:update", { draftPoolIds: arr });
      updateLobbySetting("draftPoolIds", arr);
      return next;
    });
  }, [broadcast, updateLobbySetting]);

  // ── Configure / Step handlers ──────────────────────────────────────────

  const handleConfigure = useCallback(async () => {
    if (!isHost) return;
    if (selectionMode === "PLAYER_DRAFT") {
      if (!poolEverTouchedRef.current && allCategories.length > 0) {
        const allCatIds = allCategories.map((c) => c.id);
        const poolSet = new Set(allCatIds);
        setDraftPoolIds(poolSet);
        await updateLobbySetting("draftPoolIds", allCatIds);
        broadcast("settings:update", { draftPoolIds: allCatIds });
      }
      poolEverTouchedRef.current = true;
      const step: "draft_pool" = "draft_pool";
      setSetupStep(step);
      await updateLobbySetting("setupStep", step);
      broadcast("settings:update", { setupStep: step });
    } else {
      const step: "configuring" = "configuring";
      setSetupStep(step);
      await updateLobbySetting("setupStep", step);
      broadcast("settings:update", { setupStep: step });
    }
  }, [selectionMode, allCategories, updateLobbySetting, broadcast]);

  const handleToggleMode = useCallback(async (mode: "HOST_PICK" | "PLAYER_DRAFT") => {
    if (!isHost) return;
    setSelectionMode(mode);
    setSelectedCategories({});
    setDraftPhase("pending");
    setDraftPicks([]);
    setDraftTurnIndex(0);
    poolEverTouchedRef.current = false;

    if (mode === "PLAYER_DRAFT" && allCategories.length > 0) {
      const allCatIds = allCategories.map((c) => c.id);
      const poolSet = new Set(allCatIds);
      setDraftPoolIds(poolSet);
      setSetupStep("draft_pool");
      await Promise.all([
        updateLobbySetting("selectionMode", mode),
        updateLobbySetting("setupStep", "draft_pool"),
        updateLobbySetting("selectedCategories", {}),
        updateLobbySetting("draftPoolIds", allCatIds),
        updateLobbySetting("draftPicks", []),
        updateLobbySetting("draftTurnIndex", 0),
        updateLobbySetting("draftPhase", "pending"),
      ]);
      broadcast("settings:update", { selectionMode: mode, setupStep: "draft_pool", selectedCategories: {}, draftPoolIds: allCatIds, draftPhase: "pending" });
    } else {
      setDraftPoolIds(new Set());
      setSetupStep("waiting");
      await Promise.all([
        updateLobbySetting("selectionMode", mode),
        updateLobbySetting("setupStep", "waiting"),
        updateLobbySetting("selectedCategories", {}),
        updateLobbySetting("draftPoolIds", []),
        updateLobbySetting("draftPicks", []),
        updateLobbySetting("draftTurnIndex", 0),
        updateLobbySetting("draftPhase", "pending"),
      ]);
      broadcast("settings:update", { selectionMode: mode, setupStep: "waiting", selectedCategories: {}, draftPoolIds: [], draftPhase: "pending" });
    }
  }, [updateLobbySetting, broadcast, allCategories]);

  // ── Draft handlers ────────────────────────────────────────────────────

  const handleStartDraft = useCallback(async () => {
    if (!isHost || !lobbyCode) return;
    setDraftPhase("in_progress");
    setDraftTurnIndex(0);
    const pool = allCategories
      .filter((c) => draftPoolIds.has(c.id))
      .map((c) => ({ id: c.id, name: displayName(c.name) }));
    await updateLobbySetting("draftPhase", "in_progress");
    await updateLobbySetting("draftTurnIndex", 0);
    await updateLobbySetting("draftPool", pool);
    broadcast("draft:start", { turnIndex: 0, totalSlots, pool });
    broadcast("draft:sync", { picks: [], turnIndex: 0, phase: "in_progress" });
  }, [lobbyCode, totalSlots, allCategories, draftPoolIds, updateLobbySetting, broadcast]);

  const handleDraftPick = useCallback(async (cat: DraftCategory) => {
    if (!lobbyCode || draftPhase !== "in_progress") return;
    if (!currentPicker || currentPicker.id !== playerId) return;
    if (pickedCategoryIds.has(cat.id)) return;

    const nextSlot = draftPicks.length;
    const round = Math.floor(nextSlot / catsPerRound) + 1;
    const slotIndex = nextSlot % catsPerRound;

    const pick: DraftPick = {
      playerId, playerName,
      categoryId: cat.id, categoryName: cat.name,
      round, slotIndex,
    };

    const newPicks = [...draftPicks, pick];
    setDraftPicks(newPicks);

    const nextTurn = (draftTurnIndex + 1) % (players.length || 1);
    setDraftTurnIndex(nextTurn);

    await updateLobbySetting("draftPicks", newPicks);
    await updateLobbySetting("draftTurnIndex", nextTurn);

    if (newPicks.length >= totalSlots) {
      setDraftPhase("complete");
      await updateLobbySetting("draftPhase", "complete");
      broadcast("draft:complete", { picks: newPicks });
      broadcast("draft:sync", { picks: newPicks, turnIndex: nextTurn, phase: "complete" });
    } else {
      broadcast("draft:pick", pick);
      broadcast("draft:sync", { picks: newPicks, turnIndex: nextTurn, phase: "in_progress" });
    }
  }, [lobbyCode, draftPhase, draftPicks, draftTurnIndex, players, totalSlots, catsPerRound, currentPicker, playerId, playerName, pickedCategoryIds, updateLobbySetting, broadcast]);

  // ── Start Game ────────────────────────────────────────────────────────

  const handleStartClick = useCallback(async () => {
    if (!isHost || isStarting) return;
    setIsStarting(true);
    setStartError("");

    try {
      await Promise.all([
        updateLobbySetting("rounds", rounds),
        updateLobbySetting("timer", timer),
        updateLobbySetting("catsPerRound", catsPerRound),
        updateLobbySetting("scoringType", scoringType),
        updateLobbySetting("penaltyType", penaltyType),
      ]);
      // Await the start callback — it handles navigation on success;
      // if it fails (returns without navigating), reset the spinner.
      await onStartGame();
    } catch (err: any) {
      setStartError(err?.message || "Failed to start game. Try again.");
    } finally {
      setIsStarting(false);
    }
  }, [isHost, isStarting, rounds, timer, catsPerRound, scoringType, penaltyType, updateLobbySetting, onStartGame]);

  // ── Filtered categories ────────────────────────────────────────────────

  const filteredCategories = allCategories.filter((c) =>
    displayName(c.name).toLowerCase().includes(categorySearch.toLowerCase())
  );

  const groupedCategories = filteredCategories.reduce((acc, cat) => {
    const main = cat.main_category || "General";
    if (!acc[main]) acc[main] = [];
    acc[main].push(cat);
    return acc;
  }, {} as Record<string, Category[]>);

  // ── Slider class (extracted to avoid TS JSX parsing issues with multiline template literals) ──

  const sliderThumbClass = `w-full h-2 rounded-full appearance-none bg-lavender [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full ${isHost ? "[&::-webkit-slider-thumb]:bg-soft-purple [&::-webkit-slider-thumb]:cursor-pointer" : "[&::-webkit-slider-thumb]:bg-warm-gray/40 cursor-not-allowed opacity-50"}`;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Settings Sliders ────────────────────────────────────────────── */}
      <div className="clay p-5 space-y-4">
        <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2">
          <Sliders className="w-4 h-4 text-soft-purple" /> Game Settings
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {/* Rounds */}
          <div className="text-center space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-warm-gray/70">Rounds</label>
            <div className="text-3xl font-outfit font-black text-soft-purple">{rounds}</div>
            <input
              type="range" min={1} max={3} value={rounds}
              disabled={!isHost}
              onChange={(e) => handleRoundsChange(Number(e.target.value))}
              className={sliderThumbClass}
            />
            <div className="flex justify-between text-[10px] font-bold text-warm-gray/60"><span>1</span><span>3</span></div>
          </div>
          {/* Categories per round */}
          <div className="text-center space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-warm-gray/70">Categories</label>
            <div className="text-3xl font-outfit font-black text-soft-purple">{catsPerRound}</div>
            <input
              type="range" min={3} max={5} value={catsPerRound}
              disabled={!isHost}
              onChange={(e) => handleCatsPerRoundChange(Number(e.target.value))}
              className={sliderThumbClass}
            />
            <div className="flex justify-between text-[10px] font-bold text-warm-gray/60"><span>3</span><span>5</span></div>
          </div>
          {/* Timer */}
          <div className="text-center space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-warm-gray/70">Timer</label>
            <div className="text-3xl font-outfit font-black text-soft-purple">{timer}s</div>
            <input
              type="range" min={5} max={30} step={5} value={timer}
              disabled={!isHost}
              onChange={(e) => handleTimerChange(Number(e.target.value))}
              className={sliderThumbClass}
            />
            <div className="flex justify-between text-[10px] font-bold text-warm-gray/60"><span>5s</span><span>30s</span></div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold text-warm-gray/70 justify-center">
          <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{rounds} rounds</span>
          <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{catsPerRound} cats/round</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timer}s timer</span>
          <span className="text-soft-purple font-black">= {totalSlots} total questions</span>
        </div>
      </div>

      {/* ── Scoring & Penalty Toggles ────────────────────────────────────── */}
      <div className="clay p-5 space-y-4">
        <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-soft-purple" /> Scoring Rules
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Scoring Type */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-warm-gray/70">Scoring</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handleScoringToggle("RELATIVE")}
                disabled={!isHost}
                className={`px-3 py-2.5 rounded-xl text-xs font-outfit font-bold transition-all ${
                  scoringType === "RELATIVE"
                    ? "bg-soft-purple-light border-2 border-soft-purple/40 text-plum shadow-[2px_2px_0px_rgba(168,152,204,0.3)]"
                    : `bg-warm-white border border-warm-gray/15 text-warm-gray/70 ${isHost ? "hover:border-soft-purple/30" : "opacity-60"}`
                } ${!isHost ? "cursor-not-allowed" : ""}`}
              >
                <div>Relative</div>
                <div className="text-[9px] font-medium text-warm-gray/60 mt-0.5">1st 100%, 2nd 75%…</div>
              </button>
              <button
                onClick={() => handleScoringToggle("FASTEST_FINGER")}
                disabled={!isHost}
                className={`px-3 py-2.5 rounded-xl text-xs font-outfit font-bold transition-all ${
                  scoringType === "FASTEST_FINGER"
                    ? "bg-peach-light border-2 border-peach/40 text-plum shadow-[2px_2px_0px_rgba(255,107,138,0.2)]"
                    : `bg-warm-white border border-warm-gray/15 text-warm-gray/70 ${isHost ? "hover:border-peach/30" : "opacity-60"}`
                } ${!isHost ? "cursor-not-allowed" : ""}`}
              >
                <div>Fastest Finger</div>
                <div className="text-[9px] font-medium text-warm-gray/60 mt-0.5">Only 1st gets points</div>
              </button>
            </div>
          </div>

          {/* Penalty Type */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-warm-gray/70">Wrong Penalty</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handlePenaltyToggle("HALF")}
                disabled={!isHost}
                className={`px-3 py-2.5 rounded-xl text-xs font-outfit font-bold transition-all ${
                  penaltyType === "HALF"
                    ? "bg-mint-light border-2 border-mint/40 text-plum shadow-[2px_2px_0px_rgba(158,217,204,0.3)]"
                    : `bg-warm-white border border-warm-gray/15 text-warm-gray/70 ${isHost ? "hover:border-mint/30" : "opacity-60"}`
                } ${!isHost ? "cursor-not-allowed" : ""}`}
              >
                <div>Gentle</div>
                <div className="text-[9px] font-medium text-warm-gray/60 mt-0.5">-50% points</div>
              </button>
              <button
                onClick={() => handlePenaltyToggle("FULL")}
                disabled={!isHost}
                className={`px-3 py-2.5 rounded-xl text-xs font-outfit font-bold transition-all ${
                  penaltyType === "FULL"
                    ? "bg-peach-light border-2 border-peach/40 text-plum shadow-[2px_2px_0px_rgba(255,107,138,0.2)]"
                    : `bg-warm-white border border-warm-gray/15 text-warm-gray/70 ${isHost ? "hover:border-peach/30" : "opacity-60"}`
                } ${!isHost ? "cursor-not-allowed" : ""}`}
              >
                <div>Hardcore</div>
                <div className="text-[9px] font-medium text-warm-gray/60 mt-0.5">-100% points</div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Selection Mode ──────────────────────────────────────────────── */}
      <div className="clay p-5 space-y-3">
        <h3 className="font-outfit font-black text-plum text-sm">Selection Mode</h3>
        {!canConfigure && (
          <p className="text-center text-xs font-bold text-warm-gray/70">
            At least 2 players needed to select a mode
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleToggleMode("HOST_PICK")}
            disabled={!canConfigure || draftPhase !== "pending" || catsLoading || !isHost}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectionMode === "HOST_PICK"
                ? "bg-soft-purple-light border-soft-purple/40 shadow-[2px_2px_0px_rgba(168,152,204,0.3)]"
                : "bg-warm-white border-warm-gray/15 hover:border-soft-purple/30"
            } ${(!canConfigure || draftPhase !== "pending" || catsLoading || !isHost) ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="font-outfit font-black text-sm text-plum">Host Pick</div>
            <div className="text-[10px] text-warm-gray/70 mt-1">Host assigns categories to rounds.</div>
          </button>
          <button
            onClick={() => handleToggleMode("PLAYER_DRAFT")}
            disabled={!canConfigure || draftPhase !== "pending" || catsLoading || !isHost}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              selectionMode === "PLAYER_DRAFT"
                ? "bg-mint-light border-mint/40 shadow-[2px_2px_0px_rgba(158,217,204,0.4)]"
                : "bg-warm-white border-warm-gray/15 hover:border-mint/30"
            } ${(!canConfigure || draftPhase !== "pending" || catsLoading || !isHost) ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="font-outfit font-black text-sm text-plum">Player Draft</div>
            <div className="text-[10px] text-warm-gray/70 mt-1">Players take turns picking categories.</div>
          </button>
        </div>
      </div>

      {/* ── Waiting Step ─────────────────────────────────────────────────── */}
      {setupStep === "waiting" && (
        <div className="clay p-5 space-y-3 text-center">
          {isHost ? (
            <>
              <p className="text-sm font-bold text-warm-gray/70">
                {selectionMode === "HOST_PICK"
                  ? "Pick categories for each round's 5×5 grid"
                  : "Build a pool of categories for players to draft"}
              </p>
              <button
                onClick={handleConfigure}
                disabled={!canConfigure}
                className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-outfit font-black text-lg transition-all ${
                  selectionMode === "HOST_PICK"
                    ? "bg-gradient-to-r from-soft-purple to-purple-400 text-white hover:from-soft-purple/90 hover:to-purple-400/90 shadow-[4px_4px_0px_rgba(168,152,204,0.3)]"
                    : "bg-gradient-to-r from-mint to-emerald-400 text-white hover:from-mint/90 hover:to-emerald-400/90 shadow-[4px_4px_0px_rgba(158,217,204,0.3)]"
                } active:scale-[0.98] disabled:opacity-30 disabled:active:scale-100`}
              >
                <Plus className="w-5 h-5" />
                {selectionMode === "HOST_PICK" ? "Pick Categories" : draftPoolIds.size > 0 ? "Customize Pool" : "Build Draft Pool"}
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate(`/lobby/${lobbyCode}/categories`)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-soft-purple/10 text-soft-purple font-outfit font-bold text-sm hover:bg-soft-purple/20 transition-colors"
              >
                <Grid3X3 className="w-4 h-4" />
                Open Full Category Picker
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="animate-pulse flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-soft-purple" />
                <span className="text-sm font-bold text-warm-gray/70">Host is configuring the game...</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Category Selection (HOST_PICK mode) ────────────────────────── */}
      {selectionMode === "HOST_PICK" && setupStep === "configuring" && (
        <div className="clay p-5 space-y-4 animate-clay-pop">
          <div className="flex items-center justify-between">
            <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-soft-purple" />
              Category Selection
              <span className="text-[10px] font-bold text-warm-gray/70">
                ({totalRoundsFilled}/{rounds} rounds configured)
              </span>
            </h3>
            {isHost && (
            <button
              onClick={() => {
                setSetupStep("waiting");
                updateLobbySetting("setupStep", "waiting");
                broadcast("settings:update", { setupStep: "waiting" });
              }}
              className="text-xs font-bold text-warm-gray/70 hover:text-plum transition-colors"
            >
              ← Back
            </button>
            )}
          </div>

          {/* Round tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {Array.from({ length: rounds }).map((_, i) => {
              const rn = i + 1;
              const count = (selectedCategories[rn] || []).length;
              const isFull = count >= catsPerRound;
              return (
                <button
                  key={rn}
                  onClick={() => setActiveRound(rn)}
                  className={`px-4 py-2 rounded-xl font-outfit font-black text-sm transition-all ${
                    activeRound === rn
                      ? "bg-soft-purple text-white shadow-[3px_3px_0px_rgba(166,157,145,0.3)]"
                      : isFull
                        ? "bg-mint-light text-mint"
                        : "bg-warm-white text-plum border border-warm-gray/20 hover:border-soft-purple/30"
                  }`}
                >
                  Round {rn} <span className="ml-2 text-[10px] opacity-70">({count}/{catsPerRound})</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray/60" />
            <input
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search categories..."
              className="w-full clay-input pl-10 pr-4 py-2.5 text-sm font-outfit font-bold text-plum
                placeholder:text-warm-gray/30 rounded-xl bg-warm-white border border-warm-gray/20
                focus:border-soft-purple/50 focus:outline-none"
            />
            {categorySearch && (
              <button onClick={() => setCategorySearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray/60 hover:text-plum">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Library + Selected */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="max-h-[400px] overflow-y-auto space-y-3">
              <h4 className="text-[10px] font-black text-warm-gray/70 uppercase tracking-wider sticky top-0 bg-warm-white pb-1">
                Category Library
              </h4>
              {catsLoading ? (
                <div className="space-y-2">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="h-12 clay-skeleton rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : Object.keys(groupedCategories).length === 0 ? (
                <p className="text-center text-warm-gray/70 text-xs py-4">No categories found</p>
              ) : (
                Object.entries(groupedCategories).map(([mainCat, subCats]) => (
                  <div key={mainCat} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-soft-purple" />
                      <span className="text-[9px] font-black text-warm-gray/60 uppercase tracking-[0.15em]">{mainCat}</span>
                    </div>
                    <div className="grid gap-1.5 pl-4 border-l-2 border-warm-gray/10 ml-1">
                      {subCats.map((cat) => {
                        const isInActive = (selectedCategories[activeRound] || []).some((c) => c.id === cat.id);
                        const isInOther = Object.entries(selectedCategories).some(
                          ([r, cats]) => parseInt(r) !== activeRound && cats.some((c) => c.id === cat.id)
                        );
                        const isFull = (selectedCategories[activeRound] || []).length >= catsPerRound;
                        const isArena = cat.tags?.includes("Arena") || cat.name.includes("(Arena)");

                        return (
                          <button
                            key={cat.id}
                            onClick={() => toggleCategory(cat, activeRound)}
                            disabled={!isHost || (!isInActive && isFull) || (isInOther && !isInActive)}
                            className={`text-left p-2.5 rounded-xl border transition-all ${
                              isInActive
                                ? "bg-mint-light border-mint/40 shadow-[2px_2px_0px_rgba(158,217,204,0.4)]"
                                : isInOther
                                  ? "bg-warm-gray/5 border-warm-gray/10 opacity-50 cursor-not-allowed"
                                  : `bg-warm-white border-warm-gray/15 ${isHost ? "hover:border-soft-purple/30 hover:-translate-y-0.5 cursor-pointer" : "opacity-50 cursor-not-allowed"}`
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-outfit font-bold text-xs text-plum">{displayName(cat.name)}</span>
                              {isInActive && <CheckCircle2 className="w-3.5 h-3.5 text-mint flex-shrink-0" />}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {isArena && <span className="text-[7px] font-black px-1.5 py-0.5 bg-peach-light text-peach rounded uppercase">Arena</span>}
                              {cat.is_global && <span className="text-[7px] font-black px-1.5 py-0.5 bg-sky-light text-sky rounded uppercase">Global</span>}
                              <span className="text-[7px] font-bold px-1.5 py-0.5 bg-warm-gray/10 text-warm-gray rounded">{cat.data?.length || 0} Qs</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Selected for active round */}
            <div className="max-h-[400px] overflow-y-auto space-y-3">
              <h4 className="text-[10px] font-black text-warm-gray/70 uppercase tracking-wider sticky top-0 bg-warm-white pb-1">
                Round {activeRound} — Selected <span className="font-bold">({(selectedCategories[activeRound] || []).length}/{catsPerRound})</span>
              </h4>
              {(selectedCategories[activeRound] || []).length === 0 ? (
                <div className="text-center py-10 text-warm-gray/25 space-y-2">
                  <BookOpen className="w-7 h-7 mx-auto opacity-30" />
                  <p className="text-xs font-medium">{isHost ? "Click categories from the library" : "Host will select categories"}</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {(selectedCategories[activeRound] || []).map((cat, idx) => (
                    <div key={cat.id} className={`p-3 rounded-xl border flex items-center justify-between ${CAT_COLORS[idx % CAT_COLORS.length]}`}>
                      <div>
                        <span className="font-outfit font-bold text-sm text-plum">{displayName(cat.name)}</span>
                        <div className="text-[10px] font-bold text-warm-gray/60 mt-0.5">{cat.data?.length || 0} questions</div>
                      </div>
                      {isHost && (
                      <button
                        onClick={() => removeCategory(activeRound, cat.id)}
                        className="p-1 text-warm-gray/60 hover:text-peach rounded-lg hover:bg-peach-light transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      )}
                    </div>
                  ))}
                  {Array.from({ length: catsPerRound - (selectedCategories[activeRound] || []).length }).map((_, i) => (
                    <div key={`empty-${i}`} className="p-3 rounded-xl border-2 border-dashed border-warm-gray/15 flex items-center justify-center text-[10px] font-bold text-warm-gray/60 uppercase tracking-wider">
                      Empty slot
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-plum">Progress:</span>
            <div className="flex-1 h-1.5 bg-warm-gray/10 rounded-full overflow-hidden">
              <div className="h-full bg-mint rounded-full transition-all duration-300"
                style={{ width: `${(totalRoundsFilled / rounds) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-warm-gray/70">{totalRoundsFilled}/{rounds} rounds</span>
          </div>
        </div>
      )}

      {/* ── Draft Pool Picker (PLAYER_DRAFT mode) ───────────────────────── */}
      {selectionMode === "PLAYER_DRAFT" && setupStep === "draft_pool" && draftPhase === "pending" && (
        <div className="clay p-5 space-y-4 animate-clay-pop">
          <div className="flex items-center justify-between">
            <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-mint" />
              Build Draft Pool
              <span className="text-[10px] font-bold text-mint">({draftPoolIds.size}/{totalSlots} needed)</span>
            </h3>
            {isHost && (
            <button
              onClick={() => {
                setSetupStep("waiting");
                updateLobbySetting("setupStep", "waiting");
                broadcast("settings:update", { setupStep: "waiting" });
              }}
              className="text-xs font-bold text-warm-gray/70 hover:text-plum transition-colors"
            >
              ← Back
            </button>
            )}
          </div>

          <p className="text-xs font-medium text-warm-gray/70">
            Select categories that players can choose from during the draft.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray/60" />
            <input
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search categories..."
              className="w-full clay-input pl-10 pr-4 py-2.5 text-sm font-outfit font-bold text-plum
                placeholder:text-warm-gray/30 rounded-xl bg-warm-white border border-warm-gray/20
                focus:border-mint/50 focus:outline-none"
            />
            {categorySearch && (
              <button onClick={() => setCategorySearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray/60 hover:text-plum">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {catsLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="h-12 clay-skeleton rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
              {Object.entries(groupedCategories).map(([mainCat, subCats]) => (
                <div key={mainCat} className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-mint" />
                    <span className="text-[9px] font-black text-warm-gray/60 uppercase tracking-[0.15em]">{mainCat}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-4 border-l-2 border-warm-gray/10 ml-1">
                    {subCats.map((cat) => {
                      const isInPool = draftPoolIds.has(cat.id);
                      const isArena = cat.tags?.includes("Arena") || cat.name.includes("(Arena)");
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleDraftPool(cat.id)}
                          disabled={!isHost}
                          className={`text-left p-2.5 rounded-xl border transition-all ${
                            isInPool
                              ? "bg-mint-light border-mint/40 shadow-[2px_2px_0px_rgba(158,217,204,0.4)]"
                              : `bg-warm-white border-warm-gray/15 ${isHost ? "hover:border-mint/30 hover:-translate-y-0.5 cursor-pointer" : "opacity-50 cursor-not-allowed"}`
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-outfit font-bold text-xs text-plum">{displayName(cat.name)}</span>
                            {isInPool && <CheckCircle2 className="w-3.5 h-3.5 text-mint flex-shrink-0" />}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {isArena && <span className="text-[7px] font-black px-1.5 py-0.5 bg-peach-light text-peach rounded uppercase">Arena</span>}
                            {cat.is_global && <span className="text-[7px] font-black px-1.5 py-0.5 bg-sky-light text-sky rounded uppercase">Global</span>}
                            <span className="text-[7px] font-bold px-1.5 py-0.5 bg-warm-gray/10 text-warm-gray rounded">{cat.data?.length || 0} Qs</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(groupedCategories).length === 0 && (
                <p className="text-center text-warm-gray/70 text-xs py-4 col-span-full">No categories found</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-plum">Pool:</span>
              <div className="flex-1 h-1.5 bg-warm-gray/10 rounded-full overflow-hidden">
                <div className="h-full bg-mint rounded-full transition-all duration-300"
                  style={{ width: `${totalSlots > 0 ? Math.min((draftPoolIds.size / totalSlots) * 100, 100) : 0}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-warm-gray/70">{draftPoolIds.size}/{totalSlots}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Draft Phase ──────────────────────────────────────────────────── */}
      {selectionMode === "PLAYER_DRAFT" && draftPhase !== "pending" && (
        <div className="clay p-5 space-y-4 animate-clay-pop">
          <div className="flex items-center justify-between">
            <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4 text-mint" />
              Category Draft
              <span className="text-[10px] font-bold text-mint">({slotsFilled}/{totalSlots})</span>
            </h3>
            {draftPhase === "complete" && (
              <span className="text-[10px] font-black text-mint bg-mint-light px-3 py-1 rounded-full uppercase">Complete</span>
            )}
          </div>

          <div className="h-2 bg-warm-gray/10 rounded-full overflow-hidden">
            <div className="h-full bg-mint rounded-full transition-all duration-500" style={{ width: `${totalSlots > 0 ? (slotsFilled / totalSlots) * 100 : 0}%` }} />
          </div>

          {draftPhase === "in_progress" && currentPicker && (
            <div className="p-3 bg-mint-light rounded-xl border border-mint/20 text-center">
              <span className="font-outfit font-black text-mint text-sm">
                {currentPicker.id === playerId ? "It's your turn! Pick a category below" : `${currentPicker.name}'s turn to pick`}
              </span>
            </div>
          )}

          {draftPhase === "in_progress" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[250px] overflow-y-auto">
              {availableDraftCategories.map((cat) => {
                const isMyTurn = currentPicker?.id === playerId;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleDraftPick(cat)}
                    disabled={!isMyTurn}
                    className={`p-3 rounded-xl border transition-all text-left ${
                      isMyTurn
                        ? "bg-warm-white border-warm-gray/15 hover:border-soft-purple/30 hover:-translate-y-0.5 cursor-pointer"
                        : "bg-warm-white border-warm-gray/10 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="font-outfit font-bold text-sm text-plum">{cat.name}</div>
                  </button>
                );
              })}
              {availableDraftCategories.length === 0 && (
                <div className="col-span-full text-center py-4 text-warm-gray/60 text-xs">All categories picked</div>
              )}
            </div>
          )}

          {draftPicks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-warm-gray/70 uppercase tracking-wider">Picked</h4>
              <div className="grid gap-1.5">
                {draftPicks.map((pick, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warm-white border border-warm-gray/10 text-xs">
                    <span className="font-outfit font-black text-warm-gray/60 text-[10px] w-8">R{pick.round}</span>
                    <span className="font-outfit font-bold text-plum flex-1 truncate">{pick.categoryName}</span>
                    <span className="text-[10px] text-warm-gray/70">{pick.playerName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Action Buttons ──────────────────────────────────────────────── */}
      <div className="clay p-5">
        {/* HOST_PICK: Start Game (host only) */}
        {selectionMode === "HOST_PICK" && setupStep === "configuring" && (
          <>
            {playerId === hostPlayerId ? (
              <>
                <button
                  onClick={handleStartClick}
                  disabled={!canStartHostPick || isStarting}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-mint to-emerald-400 text-white font-outfit font-black text-lg hover:from-mint/90 hover:to-emerald-400/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:active:scale-100 shadow-[4px_4px_0px_rgba(158,217,204,0.3)] active:shadow-[2px_2px_0px_rgba(158,217,204,0.2)]"
                >
                  {isStarting ? (
                    <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                  {isStarting ? "Starting Game..." : "Start 5×5 Grid Game"}
                  <ChevronRight className="w-5 h-5" />
                </button>
                {!canStartHostPick && !startError && (
                  <p className="text-center text-xs font-bold text-warm-gray/70 mt-3">
                    Fill all rounds with categories to start
                  </p>
                )}
              </>
            ) : (
              <div className="text-center space-y-2">
                <div className="animate-pulse flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-soft-purple" />
                  <span className="text-sm font-bold text-warm-gray/70">Waiting for host to start the game...</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* PLAYER_DRAFT: Start Draft (host only) */}
        {selectionMode === "PLAYER_DRAFT" && setupStep === "draft_pool" && draftPhase === "pending" && (
          <>
            {playerId === hostPlayerId ? (
              <>
                <button
                  onClick={handleStartDraft}
                  disabled={!canStartDraftPool}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-soft-purple to-purple-400 text-white font-outfit font-black text-lg hover:from-soft-purple/90 hover:to-purple-400/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:active:scale-100 shadow-[4px_4px_0px_rgba(168,152,204,0.3)] active:shadow-[2px_2px_0px_rgba(168,152,204,0.2)]"
                >
                  <Zap className="w-5 h-5" /> Start Category Draft <ChevronRight className="w-5 h-5" />
                </button>
                {!canStartDraftPool && !startError && (
                  <p className="text-center text-xs font-bold text-warm-gray/70 mt-3">
                    {draftPoolIds.size < totalSlots
                      ? `Select at least ${totalSlots} categories (${draftPoolIds.size}/${totalSlots})`
                      : "Waiting for at least 2 players"}
                  </p>
                )}
              </>
            ) : (
              <div className="text-center space-y-2">
                <div className="animate-pulse flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-mint" />
                  <span className="text-sm font-bold text-warm-gray/70">Host is setting up the draft pool...</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Draft in progress */}
        {draftPhase === "in_progress" && (
          <div className="text-center space-y-2">
            <div className="text-xs font-bold text-warm-gray/60 animate-pulse">
              Draft in progress — {slotsFilled}/{totalSlots} categories picked
            </div>
            <button disabled className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-warm-gray/10 text-warm-gray/70 font-outfit font-black text-lg cursor-not-allowed">
              <Play className="w-5 h-5" /> Waiting for draft to complete...
            </button>
          </div>
        )}

        {/* Draft complete: Start Game (host only) */}
        {selectionMode === "PLAYER_DRAFT" && draftPhase === "complete" && (
          <>
            {playerId === hostPlayerId ? (
              <button
                onClick={handleStartClick}
                disabled={isStarting}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-mint to-emerald-400 text-white font-outfit font-black text-lg hover:from-mint/90 hover:to-emerald-400/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:active:scale-100 shadow-[4px_4px_0px_rgba(158,217,204,0.3)] active:shadow-[2px_2px_0px_rgba(158,217,204,0.2)]"
              >
                {isStarting ? (
                  <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                {isStarting ? "Starting Game..." : "Start 5×5 Grid Game"}
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <div className="text-center space-y-2">
                <div className="animate-pulse flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-mint" />
                  <span className="text-sm font-bold text-warm-gray/70">Draft complete — waiting for host to start...</span>
                </div>
              </div>
            )}
          </>
        )}

        {startError && (
          <p className="text-center text-[10px] font-bold text-peach bg-peach-light/30 px-4 py-2 rounded-xl mt-3 animate-clay-pop">
            {startError}
          </p>
        )}
      </div>
    </div>
  );
}
