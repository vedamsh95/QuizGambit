import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { smartSelectQuestions } from "../lib/smartSelection";
import ClayButton from "./ui/ClayButton";
import { Gamepad2, Sliders, Users, BookOpen, Search, Plus, Trash2, X, ChevronRight, ChevronLeft, Zap, CheckCircle2, ArrowLeft } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

type Phase = "CONFIG" | "PLAYERS" | "CATEGORIES";

interface Config {
  rounds: number;
  categoriesPerRound: number;
  timer: number;
  hasBuzzer: boolean;
}

interface LocalPlaySetupV2Props {
  onStart: (settings: any) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function LocalPlaySetupV2({ onStart }: LocalPlaySetupV2Props) {
  const navigate = useNavigate();

  // Phase
  const [phase, setPhase] = useState<Phase>("CONFIG");

  // Config
  const [config, setConfig] = useState<Config>({
    rounds: 3,
    categoriesPerRound: 5,
    timer: 15,
    hasBuzzer: false,
  });

  // Categories
  const [categories, setCategories] = useState<any[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<
    Record<number, any[]>
  >({});
  const [categorySearch, setCategorySearch] = useState("");
  const [activeRound, setActiveRound] = useState(1);

  // Players (buzzer mode)
  const [players, setPlayers] = useState<string[]>([]);
  const [playerInput, setPlayerInput] = useState("");

  // Loading state for Start button
  const [isStarting, setIsStarting] = useState(false);

  // ── Fetch Categories ────────────────────────────────────────────────────

  useEffect(() => {
    supabase
      .from("categories_library")
      .select("*")
      .then(
        ({ data }) => {
          if (data) setCategories(data);
          setCategoriesLoading(false);
        },
        () => setCategoriesLoading(false),
      );
  }, []);

  // ── Prune selected categories when config.rounds or categoriesPerRound shrink ─

  useEffect(() => {
    setSelectedCategories((prev) => {
      const cleaned: Record<number, any[]> = {};
      for (let r = 1; r <= config.rounds; r++) {
        const cats = prev[r];
        // Only keep rounds that actually have selected categories
        if (cats && cats.length > 0) {
          cleaned[r] = cats.slice(0, config.categoriesPerRound);
        }
      }
      return cleaned;
    });
    // Clamp activeRound if it exceeds new rounds count
    setActiveRound((prev) => Math.min(prev, config.rounds));
  }, [config.rounds, config.categoriesPerRound]);

  // ── Category Helpers ─────────────────────────────────────────────────────

  const toggleCategory = useCallback(
    (cat: any, round: number) => {
      setSelectedCategories((prev) => {
        const current = prev[round] || [];
        const exists = current.find((c) => c.id === cat.id);
        if (exists) {
          // Remove
          return {
            ...prev,
            [round]: current.filter((c) => c.id !== cat.id),
          };
        }
        // Check if full
        if (current.length >= config.categoriesPerRound) return prev;
        // Prevent duplicates across rounds
        for (const [r, cats] of Object.entries(prev)) {
          if (cats.some((c) => c.id === cat.id) && parseInt(r) !== round) {
            // Remove from previous round and add to new round
            const updated: Record<number, any[]> = {};
            for (const [key, val] of Object.entries(prev)) {
              const k = parseInt(key);
              if (k === round) {
                updated[k] = [...val, { ...cat, data: cat.data?.map((q: any) => ({ ...q, id: crypto.randomUUID() })) }];
              } else {
                updated[k] = val.filter((c: any) => c.id !== cat.id);
              }
            }
            return updated;
          }
        }
        // Add to round
        return {
          ...prev,
          [round]: [
            ...current,
            { ...cat, data: cat.data?.map((q: any) => ({ ...q, id: crypto.randomUUID() })) },
          ],
        };
      });
    },
    [config.categoriesPerRound],
  );

  const removeCategory = useCallback((round: number, catId: string) => {
    setSelectedCategories((prev) => ({
      ...prev,
      [round]: (prev[round] || []).filter((c) => c.id !== catId),
    }));
  }, []);

  // ── Player Helpers ───────────────────────────────────────────────────────

  const addPlayer = useCallback(() => {
    const name = playerInput.trim();
    if (!name) return;
    if (players.includes(name.toUpperCase())) return;
    setPlayers((prev) => [...prev, name.toUpperCase()]);
    setPlayerInput("");
  }, [playerInput, players]);

  const removePlayer = useCallback((index: number) => {
    setPlayers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────

  const goToNext = useCallback(() => {
    if (phase === "CONFIG") {
      setPhase("PLAYERS");
    } else if (phase === "PLAYERS") {
      setPhase("CATEGORIES");
    }
  }, [phase]);

  const goToPrev = useCallback(() => {
    if (phase === "CATEGORIES") {
      setPhase("PLAYERS");
    } else {
      setPhase("CONFIG");
    }
  }, [phase]);

  // ── Start Game ───────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    try {
      const processedCategories: Record<number, any[]> = {};

      for (const [roundStr, cats] of Object.entries(selectedCategories)) {
        const processedCats = [];
        for (const cat of cats) {
          const finalQuestions = await smartSelectQuestions(
            cat.data || [],
            cat.name.replace(" (Arena)", ""),
            config.categoriesPerRound,
            "qb_local_history",
          );
          processedCats.push({ ...cat, data: finalQuestions });
        }
        processedCategories[parseInt(roundStr)] = processedCats;
      }

      const settings: any = {
        rounds: config.rounds,
        categoriesPerRound: config.categoriesPerRound,
        timer: config.timer,
        hasBuzzer: config.hasBuzzer,
        round_categories: processedCategories,
      };

      if (players.length > 0) {
        settings.players = players.map((name) => ({
          id: crypto.randomUUID(),
          name,
          score: 0,
        }));
      }

      onStart(settings);
    } finally {
      setIsStarting(false);
    }
  }, [config, selectedCategories, players, onStart]);

  // ── Derived State ────────────────────────────────────────────────────────

  const totalRoundsFilled = Object.keys(selectedCategories).length;
  const allRoundsFilled =
    totalRoundsFilled === config.rounds &&
    Object.values(selectedCategories).every(
      (cats) => cats.length === config.categoriesPerRound,
    );

  const canAdvanceFromPlayers = config.hasBuzzer ? players.length >= 2 : true;
  const canStart = !config.hasBuzzer
    ? allRoundsFilled
    : allRoundsFilled && players.length >= 2;

  const displayName = (name: string) => name.replace(" (Arena)", "").trim();

  // ── Grouped & Filtered Categories ────────────────────────────────────────

  const filteredCategories = categories.filter((c) =>
    displayName(c.name).toLowerCase().includes(categorySearch.toLowerCase()),
  );

  const groupedCategories = filteredCategories.reduce(
    (acc, cat) => {
      const main = cat.main_category || "General";
      if (!acc[main]) acc[main] = [];
      acc[main].push(cat);
      return acc;
    },
    {} as Record<string, any[]>,
  );

  // ── Category Colors ──────────────────────────────────────────────────────

  const CAT_COLORS = [
    "bg-lavender border-soft-purple/30",
    "bg-sky border-sky/30",
    "bg-peach border-peach/30",
    "bg-mint border-mint/30",
    "bg-butter border-butter/30",
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-clay-cream py-6 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* ── Back to Home ──────────────────────────────────────────── */}
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-warm-gray/40 hover:text-plum transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Home
        </button>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="text-center mb-8 space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-soft-purple-light text-soft-purple text-[10px] font-black tracking-[0.2em] uppercase">
            {phase === "CONFIG" && <Sliders className="w-3 h-3" />}
            {phase === "PLAYERS" && <Users className="w-3 h-3" />}
            {phase === "CATEGORIES" && <BookOpen className="w-3 h-3" />}
            {phase === "CONFIG" && "Game Setup"}
            {phase === "PLAYERS" && (config.hasBuzzer ? "Player Registration" : "Add Players")}
            {phase === "CATEGORIES" && "Category Selection"}
          </div>
          <h2 className="text-3xl font-outfit font-black text-plum">
            {phase === "CONFIG" && "Configure Your Game"}
            {phase === "PLAYERS" && (config.hasBuzzer ? "Who's Playing?" : "Add Players")}
            {phase === "CATEGORIES" && "Pick Your Categories"}
          </h2>
          <p className="text-warm-gray text-sm font-medium max-w-md mx-auto">
            {phase === "CONFIG" &&
              "Set the rules, then choose how you want to play."}
            {phase === "PLAYERS" && (config.hasBuzzer
              ? "Add at least 2 players for buzzer mode. Each player takes turns answering."
              : "Add player names for scoring. You can skip this step.")}
            {phase === "CATEGORIES" && 
              `Click categories to add them to each round. ${config.categoriesPerRound} per round required.`}
          </p>
        </div>

        {/* ── Phase: CONFIG ──────────────────────────────────────────── */}
        {phase === "CONFIG" && (
          <div className="space-y-8 animate-clay-pop">
            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Rounds */}
              <div className="clay p-6 space-y-4 text-center">
                <label className="font-outfit font-black text-plum text-xs tracking-[0.15em] uppercase">
                  Rounds
                </label>
                <div className="text-5xl font-outfit font-black text-soft-purple">
                  {config.rounds}
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={config.rounds}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, rounds: parseInt(e.target.value) }))
                  }
                  className="w-full h-2 rounded-full appearance-none bg-lavender
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6
                    [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-soft-purple [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-[2px_2px_4px_rgba(166,157,145,0.4)]"
                />
                <div className="flex justify-between text-[10px] font-bold text-warm-gray">
                  <span>1</span><span>5</span>
                </div>
              </div>

              {/* Categories per Round */}
              <div className="clay p-6 space-y-4 text-center">
                <label className="font-outfit font-black text-plum text-xs tracking-[0.15em] uppercase">
                  Categories / Round
                </label>
                <div className="text-5xl font-outfit font-black text-soft-purple">
                  {config.categoriesPerRound}
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={config.categoriesPerRound}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      categoriesPerRound: parseInt(e.target.value),
                    }))
                  }
                  className="w-full h-2 rounded-full appearance-none bg-lavender
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6
                    [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-soft-purple [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-[2px_2px_4px_rgba(166,157,145,0.4)]"
                />
                <div className="flex justify-between text-[10px] font-bold text-warm-gray">
                  <span>1</span><span>5</span>
                </div>
              </div>

              {/* Timer */}
              <div className="clay p-6 space-y-4 text-center">
                <label className="font-outfit font-black text-plum text-xs tracking-[0.15em] uppercase">
                  Timer (seconds)
                </label>
                <div className="text-5xl font-outfit font-black text-soft-purple">
                  {config.timer}s
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={config.timer}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, timer: parseInt(e.target.value) }))
                  }
                  className="w-full h-2 rounded-full appearance-none bg-lavender
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6
                    [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-soft-purple [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-[2px_2px_4px_rgba(166,157,145,0.4)]"
                />
                <div className="flex justify-between text-[10px] font-bold text-warm-gray">
                  <span>5s</span><span>60s</span>
                </div>
              </div>
            </div>

            {/* Buzzer Toggle */}
            <div className="clay p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                      config.hasBuzzer
                        ? "bg-mint-light text-mint"
                        : "bg-warm-gray/10 text-warm-gray"
                    }`}
                  >
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-outfit font-black text-plum text-sm">
                      Buzzer Mode
                    </h3>
                    <p className="text-xs text-warm-gray font-medium">
                      {config.hasBuzzer
                        ? "Players buzz in to answer. Multiplayer on one device."
                        : "Host selects and grades. Simple quiz format."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setConfig((c) => ({ ...c, hasBuzzer: !c.hasBuzzer }))
                  }
                  className={`relative w-14 h-8 rounded-full transition-all duration-200 ${
                    config.hasBuzzer ? "bg-mint" : "bg-warm-gray/30"
                  }`}
                  role="switch"
                  aria-checked={config.hasBuzzer}
                >
                  <span
                    className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-[2px_2px_4px_rgba(166,157,145,0.3)] transition-all duration-200 ${
                      config.hasBuzzer ? "left-7" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Next / Skip Button */}
            <div className="flex justify-center">
              <ClayButton
                variant="primary"
                size="lg"
                onClick={goToNext}
                icon={<ChevronRight className="w-5 h-5" />}
              >
                Next: Add Players
              </ClayButton>
            </div>
          </div>
        )}

        {/* ── Phase: PLAYERS ─────────────────────────────────────────── */}
        {phase === "PLAYERS" && (
          <div className="space-y-8 animate-clay-pop">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Input */}
              <div className="clay p-6 space-y-4">
                <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-soft-purple" />
                  Add Player
                </h3>
                <div className="flex gap-3">
                  <input
                    value={playerInput}
                    onChange={(e) => setPlayerInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                    placeholder="Enter player name..."
                    className="flex-1 clay-input font-outfit font-bold text-plum placeholder:text-warm-gray/40
                      text-sm px-4 py-3 rounded-xl bg-warm-white border border-warm-gray/20
                      focus:border-soft-purple/50 focus:outline-none"
                    maxLength={20}
                  />
                  <ClayButton
                    variant="primary"
                    size="sm"
                    onClick={addPlayer}
                    icon={<Plus className="w-4 h-4" />}
                  >
                    Add
                  </ClayButton>
                </div>

                {/* Player List */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {players.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-warm-white p-3 rounded-xl border border-warm-gray/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-soft-purple-light flex items-center justify-center text-soft-purple font-outfit font-black text-sm">
                          {p.charAt(0)}
                        </div>
                        <span className="font-outfit font-bold text-plum text-sm">
                          {p}
                        </span>
                      </div>
                      <button
                        onClick={() => removePlayer(i)}
                        className="p-1.5 text-warm-gray/40 hover:text-peach rounded-lg hover:bg-peach-light transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {players.length === 0 && (
                    <div className="text-center py-8 text-warm-gray/30 text-sm font-medium">
                      No players added yet
                    </div>
                  )}
                </div>
              </div>

              {/* Preview */}
              <div className="clay p-6 flex flex-col items-center justify-center text-center gap-4">
                <div className="w-24 h-24 rounded-full bg-soft-purple-light border-4 border-soft-purple/20 flex items-center justify-center relative">
                  <Users className="w-10 h-10 text-soft-purple/50" />
                  <div className="absolute -top-1 -right-1 w-9 h-9 rounded-full bg-soft-purple text-white font-outfit font-black text-sm flex items-center justify-center shadow-lg">
                    {players.length}
                  </div>
                </div>
                <div>
                  <h3 className="font-outfit font-black text-plum text-lg">
                    {config.hasBuzzer
                      ? players.length >= 2 ? "Ready!" : "Add Players"
                      : players.length > 0 ? `${players.length} Added` : "Optional"}
                  </h3>
                  <p className="text-xs text-warm-gray font-medium mt-1">
                    {config.hasBuzzer
                      ? players.length >= 2
                        ? `${players.length} players registered`
                        : "Minimum 2 players required"
                      : players.length > 0
                        ? "Players will appear on the scoreboard"
                        : "Add names for scoring, or skip"}
                  </p>
                </div>
                {players.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-[240px]">
                    {players.map((p, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 rounded-lg bg-soft-purple-light text-soft-purple text-[10px] font-bold"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <ClayButton
                variant="ghost"
                size="md"
                onClick={goToPrev}
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                Back to Config
              </ClayButton>
              <ClayButton
                variant="primary"
                size="lg"
                onClick={goToNext}
                disabled={!canAdvanceFromPlayers}
                icon={<ChevronRight className="w-5 h-5" />}
              >
                {config.hasBuzzer || players.length > 0 ? "Next: Pick Categories" : "Skip: Pick Categories"}
              </ClayButton>
            </div>
          </div>
        )}

        {/* ── Phase: CATEGORIES ───────────────────────────────────────── */}
        {phase === "CATEGORIES" && (
          <div className="space-y-6 animate-clay-pop">
            {/* Round Selector */}
            <div className="flex items-center gap-2 justify-center flex-wrap">
              {Array.from({ length: config.rounds }).map((_, i) => {
                const roundNum = i + 1;
                const count = (selectedCategories[roundNum] || []).length;
                const isFull = count >= config.categoriesPerRound;
                return (
                  <button
                    key={roundNum}
                    onClick={() => setActiveRound(roundNum)}
                    className={`px-4 py-2 rounded-xl font-outfit font-black text-sm transition-all ${
                      activeRound === roundNum
                        ? "bg-soft-purple text-white shadow-[3px_3px_0px_rgba(166,157,145,0.3)]"
                        : isFull
                          ? "bg-mint-light text-mint"
                          : "bg-warm-white text-plum border border-warm-gray/20 hover:border-soft-purple/30"
                    }`}
                  >
                    Round {roundNum}
                    <span className="ml-2 text-[10px] opacity-70">
                      ({count}/{config.categoriesPerRound})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray/40" />
              <input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search categories..."
                className="w-full clay-input pl-10 pr-4 py-2.5 text-sm font-outfit font-bold text-plum
                  placeholder:text-warm-gray/30 rounded-xl bg-warm-white border border-warm-gray/20
                  focus:border-soft-purple/50 focus:outline-none"
              />
              {categorySearch && (
                <button
                  onClick={() => setCategorySearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray/40 hover:text-plum"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Main Content: Library + Round Slots */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Library */}
              <div className="clay p-4 max-h-[500px] overflow-y-auto space-y-4">
                <h3 className="font-outfit font-black text-plum text-sm flex items-center gap-2 sticky top-0 bg-warm-white pb-2">
                  <BookOpen className="w-4 h-4 text-soft-purple" />
                  Category Library
                  {categoriesLoading && (
                    <span className="ml-2 w-4 h-4 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" />
                  )}
                </h3>

                {categoriesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="clay-pressed p-4 animate-pulse">
                        <div className="h-4 bg-warm-gray/20 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-warm-gray/10 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : Object.keys(groupedCategories).length === 0 ? (
                  <p className="text-center text-warm-gray/40 text-sm py-8">
                    No categories found
                  </p>
                ) : (
                  (Object.entries(groupedCategories) as [string, any[]][]).map(
                    ([mainCat, subCats]) => (
                      <div key={mainCat} className="space-y-2">
                        <div className="flex items-center gap-2 px-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-soft-purple" />
                          <span className="text-[10px] font-black text-warm-gray/50 uppercase tracking-[0.15em]">
                            {mainCat}
                          </span>
                          <span className="text-[9px] text-warm-gray/30">
                            ({subCats.length})
                          </span>
                        </div>
                        <div className="grid gap-2 pl-4 border-l-2 border-warm-gray/10 ml-1">
                          {subCats.map((cat: any) => {
                            const isSelectedInActive =
                              (selectedCategories[activeRound] || []).some(
                                (c) => c.id === cat.id,
                              );
                            const isSelectedOther = Object.entries(
                              selectedCategories,
                            ).some(
                              ([r, cats]) =>
                                parseInt(r) !== activeRound &&
                                cats.some((c) => c.id === cat.id),
                            );
                            const isArena =
                              cat.tags?.includes("Arena") ||
                              cat.name.includes("(Arena)");
                            const currentRoundSlots =
                              (selectedCategories[activeRound] || []).length;
                            const isActiveFull =
                              currentRoundSlots >= config.categoriesPerRound;

                            return (
                              <button
                                key={cat.id}
                                onClick={() => toggleCategory(cat, activeRound)}
                                disabled={
                                  (!isSelectedInActive && isActiveFull) ||
                                  (isSelectedOther && !isSelectedInActive)
                                }
                                className={`text-left p-3 rounded-xl border transition-all ${
                                  isSelectedInActive
                                    ? "bg-mint-light border-mint/40 shadow-[2px_2px_0px_rgba(158,217,204,0.4)]"
                                    : isSelectedOther
                                      ? "bg-warm-gray/5 border-warm-gray/10 opacity-50 cursor-not-allowed"
                                      : "bg-warm-white border-warm-gray/15 hover:border-soft-purple/30 hover:-translate-y-0.5 cursor-pointer"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-outfit font-bold text-sm text-plum">
                                    {displayName(cat.name)}
                                  </span>
                                  {isSelectedInActive && (
                                    <CheckCircle2 className="w-4 h-4 text-mint flex-shrink-0" />
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  {isArena && (
                                    <span className="text-[8px] font-black px-1.5 py-0.5 bg-peach-light text-peach rounded uppercase tracking-wider">
                                      Arena
                                    </span>
                                  )}
                                  {cat.is_global && (
                                    <span className="text-[8px] font-black px-1.5 py-0.5 bg-sky-light text-sky rounded uppercase tracking-wider">
                                      Global
                                    </span>
                                  )}
                                  <span className="text-[8px] font-bold px-1.5 py-0.5 bg-warm-gray/10 text-warm-gray rounded">
                                    {cat.data?.length || 0} Qs
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>

              {/* Right: Round Slots */}
              <div className="clay p-4 max-h-[500px] overflow-y-auto space-y-4">
                <h3 className="font-outfit font-black text-plum text-sm sticky top-0 bg-warm-white pb-2">
                  Round {activeRound} — Selected Categories
                  <span className="ml-2 text-[10px] font-bold text-warm-gray/50">
                    ({(selectedCategories[activeRound] || []).length}/
                    {config.categoriesPerRound})
                  </span>
                </h3>

                {(selectedCategories[activeRound] || []).length === 0 ? (
                  <div className="text-center py-12 text-warm-gray/30 space-y-2">
                    <BookOpen className="w-8 h-8 mx-auto opacity-30" />
                    <p className="text-sm font-medium">
                      Click categories from the library to add them here
                    </p>
                    <p className="text-[10px]">
                      {config.categoriesPerRound} categories needed for this round
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {(selectedCategories[activeRound] || []).map(
                      (cat: any, idx: number) => (
                        <div
                          key={cat.id}
                          className={`p-3 rounded-xl border flex items-center justify-between ${
                            CAT_COLORS[idx % CAT_COLORS.length]
                          }`}
                        >
                          <div>
                            <span className="font-outfit font-bold text-sm text-plum">
                              {displayName(cat.name)}
                            </span>
                            <div className="flex gap-1.5 mt-1">
                              <span className="text-[8px] font-bold text-warm-gray/50">
                                {cat.data?.length || 0} questions
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeCategory(activeRound, cat.id)}
                            className="p-1.5 text-warm-gray/40 hover:text-peach rounded-lg hover:bg-peach-light transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ),
                    )}
                    {/* Empty slots */}
                    {Array.from({
                      length:
                        config.categoriesPerRound -
                        (selectedCategories[activeRound] || []).length,
                    }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="p-3 rounded-xl border-2 border-dashed border-warm-gray/15 flex items-center justify-center text-[10px] font-bold text-warm-gray/20 uppercase tracking-wider"
                      >
                        Empty slot
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Progress Summary */}
            <div className="clay p-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-outfit font-black text-plum">
                  Progress:
                </span>
                <div className="flex-1 h-2 bg-warm-gray/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-mint rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        (totalRoundsFilled / config.rounds) * 100
                      }%`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-bold text-warm-gray/50">
                  {totalRoundsFilled}/{config.rounds} rounds filled
                </span>
              </div>
            </div>

            {/* Navigation + Start */}
            <div className="flex justify-between items-center">
              <ClayButton
                variant="ghost"
                size="md"
                onClick={goToPrev}
                icon={<ChevronLeft className="w-4 h-4" />}
              >
                Back to Players
              </ClayButton>

              <ClayButton
                variant="primary"
                size="lg"
                onClick={handleStart}
                disabled={!canStart || isStarting}
                loading={isStarting}
                icon={!isStarting ? <Gamepad2 className="w-5 h-5" /> : undefined}
              >
                Start Game
              </ClayButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
