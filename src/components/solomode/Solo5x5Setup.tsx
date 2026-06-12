import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { smartSelectQuestions } from "../../lib/smartSelection";
import { store } from "../../lib/storage";
import { ArrowLeft, Play, Check, Zap, ListChecks, Shuffle, RefreshCw } from "lucide-react";
import ClayButton from "../ui/ClayButton";

interface Category {
  id: string;
  name: string;
  data?: any[];
  main_category?: string;
  tags?: string[];
}

export default function Solo5x5Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [fetchingCats, setFetchingCats] = useState(false);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [rounds, setRounds] = useState(3);
  const [timer, setTimer] = useState(15);
  const [randomPicker, setRandomPicker] = useState(true);
  const [optionsMode, setOptionsMode] = useState(true); // true = MCQ options, auto-grade; false = text answer, self-grade
  const [autoPickCategories, setAutoPickCategories] = useState(false); // auto-select 5 random categories
  const [isStarting, setIsStarting] = useState(false);

  // Fetch categories on mount
  useEffect(() => {
    const fetchCats = async () => {
      setFetchingCats(true);
      const { data } = await supabase.from("categories_library").select("*");
      if (data) setCategories(data);
      setFetchingCats(false);
    };
    fetchCats();
  }, []);

  // Auto-pick 5 random categories when toggle is enabled
  const rollRandomCategories = useCallback(() => {
    if (categories.length === 0) return;
    const shuffled = [...categories].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(5, categories.length));
    setSelectedCats(new Set(picked.map((c) => c.id)));
  }, [categories]);

  useEffect(() => {
    if (autoPickCategories && categories.length > 0 && selectedCats.size === 0) {
      rollRandomCategories();
    }
  }, [autoPickCategories, categories]);

  const toggleCategory = useCallback((id: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    if (selectedCats.size === 0) return;
    setIsStarting(true);

    try {
      const chosenCategories = categories.filter((c) => selectedCats.has(c.id));

      // Process each category through smart selection
      const processedCategories: Record<number, any[]> = {};
      for (let r = 1; r <= rounds; r++) {
        const roundCats = [];
        for (const cat of chosenCategories) {
          const questions = await smartSelectQuestions(
            cat.data || [],
            cat.name,
            5,
            "qb_solo_history"
          );
          roundCats.push({ ...cat, data: questions });
        }
        processedCategories[r] = roundCats;
      }

      const settings = {
        rounds,
        timer,
        randomPicker,
        optionsMode,
        categories: chosenCategories,
        roundCategories: processedCategories,
      };

      store.setLocalGameSettings(settings);
      navigate("/solo/5x5/play");
    } catch (err) {
      console.error("Solo 5x5 start error:", err);
    } finally {
      setIsStarting(false);
    }
  }, [selectedCats, categories, rounds, timer, randomPicker, optionsMode, navigate]);

  const canStart = selectedCats.size > 0;

  // Tile colors for category grid
  const tileColors = [
    "border-soft-purple/30 hover:border-soft-purple hover:bg-soft-purple-light/30",
    "border-sky/30 hover:border-sky hover:bg-sky-light/30",
    "border-mint/30 hover:border-mint hover:bg-mint-light/30",
    "border-peach/30 hover:border-peach hover:bg-peach-light/30",
  ];

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 flex items-center gap-3 border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t("common.back")}</span>
        </button>
        <span className="font-outfit font-black text-lg text-plum">
          🎯 {t("solo.quizTitle")}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center p-4 sm:p-6 gap-6 overflow-y-auto">
        {/* Title section */}
        <div className="text-center space-y-2 max-w-md">
          <h1 className="font-outfit font-black text-3xl text-plum">
            {t("solo.quizTitle")}
          </h1>
          <p className="text-sm text-warm-gray/60">
            {t("solo.quizDesc")}
          </p>
        </div>

        {/* Settings cards */}
        <div className="w-full max-w-md space-y-4">
          {/* Rounds & Timer */}
          <div className="clay p-5 space-y-4">
            <div className="flex gap-6">
              {/* Rounds */}
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-plum/60">
                  {t("home.roundsLabel", { count: rounds })}
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRounds(n)}
                      className={`flex-1 h-10 rounded-xl font-outfit font-black text-sm transition-all ${
                        rounds === n
                          ? "bg-soft-purple text-white shadow-lg shadow-soft-purple/20"
                          : "bg-cream text-plum/40 hover:text-plum border border-clay-border/50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timer */}
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-plum/60">
                  {t("home.timerLabel", { count: timer })}
                </label>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={5}
                  value={timer}
                  onChange={(e) => setTimer(Number(e.target.value))}
                  className="w-full accent-soft-purple"
                />
                <div className="flex justify-between text-[10px] text-warm-gray/40 font-bold">
                  <span>5s</span>
                  <span>30s</span>
                </div>
              </div>
            </div>
          </div>

          {/* Random Picker toggle */}
          <div className="clay p-4 flex items-center justify-between">
            <div>
              <h3 className="font-outfit font-bold text-sm text-plum flex items-center gap-2">
                <Zap className="w-4 h-4 text-soft-purple" />
                {t("solo.randomPicker")}
              </h3>
              <p className="text-[10px] text-warm-gray/50 mt-0.5">
                {t("solo.randomPickerDesc")}
              </p>
            </div>
            <button
              onClick={() => setRandomPicker(!randomPicker)}
              className={`relative w-14 h-8 rounded-full transition-all ${
                randomPicker ? "bg-soft-purple" : "bg-warm-gray/30"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${
                  randomPicker ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Options Mode toggle */}
          <div className="clay p-4 flex items-center justify-between">
            <div>
              <h3 className="font-outfit font-bold text-sm text-plum flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-mint" />
                MCQ Options
              </h3>
              <p className="text-[10px] text-warm-gray/50 mt-0.5">
                {optionsMode
                  ? "Multiple choice — auto-graded when you select"
                  : "Text answer — reveal then self-grade"}
              </p>
            </div>
            <button
              onClick={() => setOptionsMode(!optionsMode)}
              className={`relative w-14 h-8 rounded-full transition-all ${
                optionsMode ? "bg-mint" : "bg-warm-gray/30"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${
                  optionsMode ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Auto-pick Categories toggle */}
          <div className="clay p-4 flex items-center justify-between">
            <div>
              <h3 className="font-outfit font-bold text-sm text-plum flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-butter" />
                Auto-pick Categories
              </h3>
              <p className="text-[10px] text-warm-gray/50 mt-0.5">
                {autoPickCategories
                  ? "5 random categories selected for you"
                  : "Choose your own categories below"}
              </p>
            </div>
            <button
              onClick={() => setAutoPickCategories(!autoPickCategories)}
              className={`relative w-14 h-8 rounded-full transition-all ${
                autoPickCategories ? "bg-butter" : "bg-warm-gray/30"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${
                  autoPickCategories ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Re-roll button (only when auto-pick is on) */}
          {autoPickCategories && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] font-bold text-warm-gray/50">
                {selectedCats.size} categories picked
              </span>
              <button
                onClick={rollRandomCategories}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-butter-light text-butter text-xs font-bold hover:bg-butter/20 transition-all"
              >
                <RefreshCw className="w-3 h-3" />
                Re-roll
              </button>
            </div>
          )}
        </div>

        {/* Category grid */}
        <div className="w-full max-w-md">
          <p className="text-[10px] font-black uppercase tracking-wider text-plum/60 mb-3">
            {t("home.pickCategories")} ({t("home.selected", { count: selectedCats.size })})
          </p>
          {fetchingCats ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 clay-skeleton rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto smooth-scroll">
              {categories.map((cat, idx) => {
                const isSelected = selectedCats.has(cat.id);
                const colorClass = tileColors[idx % tileColors.length];
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl text-left transition-all text-xs font-bold border ${colorClass} ${
                      isSelected
                        ? "bg-mint text-white shadow-lg shadow-mint/20 border-mint"
                        : "bg-cream text-plum/50"
                    }`}
                  >
                    <span className="truncate flex-1">
                      {cat.name.replace(" (Arena)", "")}
                    </span>
                    {isSelected && <Check className="w-3 h-3 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Start button */}
        <div className="w-full max-w-md">
          <ClayButton
            variant="primary"
            size="lg"
            disabled={!canStart || isStarting}
            loading={isStarting}
            icon={<Play className="w-5 h-5" />}
            onClick={handleStart}
            className="w-full bg-soft-purple hover:bg-soft-purple/90"
          >
            {t("solo.startQuiz")}
          </ClayButton>
        </div>
      </div>
    </div>
  );
}
