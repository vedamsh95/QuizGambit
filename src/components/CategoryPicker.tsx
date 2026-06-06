import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeft, Search, X, Check, Loader2, Sparkles, Trash2, Filter, Info, ChevronDown, ChevronUp, CheckCircle2
} from "lucide-react";
import { store } from "../lib/storage";
import ClayModal from "./ui/ClayModal";
import ClayCard from "./ui/ClayCard";
import ClayButton from "./ui/ClayButton";
import ClayBadge from "./ui/ClayBadge";
import ClayInput from "./ui/ClayInput";

import { ALL_PERSONAS, ALL_LENSES, ALL_BACKDOORS, type PlayerPersona, type LensType, type BackdoorType } from "../lib/ai/types";

// ─── Types ────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  data?: any[];
  main_category?: string;
  tags?: string[];
  is_global?: boolean;
}

interface DraftPick {
  playerId: string;
  playerName: string;
  categoryId: string;
  categoryName: string;
  round: number;
  slotIndex: number;
}

export interface CategoryPickerProps {
  players: any[];
  hostPlayerId: string;
  playerId: string;
  playerName: string;
  broadcast: (event: string, payload: any) => void;
  onBroadcast: (event: string, handler: (payload: any) => void) => () => void;
  updateLobbySetting: (key: string, val: any) => Promise<{ error?: any }>;
  allCategories: Category[];
  catsLoading: boolean;
  lobbyCode: string;
  initialSettings: any;
  onStartGame: () => void;
  onBack: () => void;
  mode?: "host-pick" | "player-draft";
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getThemeFromTags(tags?: string[]): string | null {
  if (!tags) return null;
  const themeTag = tags.find((t) => t.startsWith("Theme:"));
  return themeTag ? themeTag.replace("Theme:", "") : null;
}

function getPersonasForCategory(cat: Category): Set<string> {
  const personas = new Set<string>();
  if (cat.tags) {
    cat.tags.forEach((t) => {
      if (t.startsWith("Persona:")) {
        personas.add(t.replace("Persona:", ""));
      }
    });
  }
  if (personas.size === 0 && cat.data && Array.isArray(cat.data)) {
    cat.data.forEach((q) => {
      if (q.persona) personas.add(q.persona);
    });
  }
  return personas;
}

function getLensesForCategory(cat: Category): Set<string> {
  const lenses = new Set<string>();
  if (cat.tags) {
    cat.tags.forEach((t) => {
      if (t.startsWith("Lens:")) {
        lenses.add(t.replace("Lens:", ""));
      }
    });
  }
  if (lenses.size === 0 && cat.data && Array.isArray(cat.data)) {
    cat.data.forEach((q) => {
      if (q.lens) lenses.add(q.lens);
    });
  }
  return lenses;
}

function getThemeFontSizeClass(theme: string): string {
  const len = theme.length;
  if (len > 16) return "text-[10px] md:text-[11px] leading-tight";
  if (len >= 13) return "text-[11px] md:text-xs leading-tight";
  return "text-xs md:text-sm leading-tight";
}

function getCategoryDisplayName(name: string): string {
  return name.replace(" (Arena)", "").trim();
}

function getThemeColor(theme: string): "purple" | "mint" | "peach" | "sky" | "butter" | "gray" {
  const t = theme.toLowerCase();
  if (t.includes("science") || t.includes("tech") || t.includes("nature") || t.includes("geography") || t.includes("math")) return "mint";
  if (t.includes("history") || t.includes("literature") || t.includes("art") || t.includes("society") || t.includes("philosophy")) return "purple";
  if (t.includes("pop") || t.includes("movie") || t.includes("music") || t.includes("tv") || t.includes("entertainment") || t.includes("show")) return "sky";
  if (t.includes("sport") || t.includes("gaming") || t.includes("game")) return "peach";
  if (t.includes("food") || t.includes("drink") || t.includes("general") || t.includes("trivia")) return "butter";
  
  // Stable hash fallback
  const colors: ("purple" | "mint" | "peach" | "sky" | "butter")[] = ["purple", "mint", "peach", "sky", "butter"];
  let hash = 0;
  for (let i = 0; i < theme.length; i++) {
    hash = theme.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getThemeEmoji(theme: string): string {
  const t = theme.toLowerCase();
  if (t.includes("science") || t.includes("tech")) return "🔬";
  if (t.includes("nature") || t.includes("environment")) return "🌿";
  if (t.includes("geography") || t.includes("world")) return "🌍";
  if (t.includes("math")) return "📐";
  if (t.includes("history")) return "🏛️";
  if (t.includes("literature") || t.includes("book")) return "📚";
  if (t.includes("art")) return "🎨";
  if (t.includes("society") || t.includes("philosophy")) return "🧠";
  if (t.includes("pop") || t.includes("show")) return "✨";
  if (t.includes("movie") || t.includes("cinema") || t.includes("film")) return "🎬";
  if (t.includes("music")) return "🎵";
  if (t.includes("tv")) return "📺";
  if (t.includes("entertainment")) return "🎭";
  if (t.includes("sport")) return "⚽";
  if (t.includes("gaming") || t.includes("game")) return "🎮";
  if (t.includes("food") || t.includes("drink")) return "🍕";
  if (t.includes("general") || t.includes("trivia")) return "💡";
  
  // Emojis array for fallback
  const emojis = ["🎯", "🧩", "🌟", "🔮", "🔥", "⚡", "🍀", "🌈"];
  let hash = 0;
  for (let i = 0; i < theme.length; i++) {
    hash = theme.charCodeAt(i) + ((hash << 5) - hash);
  }
  return emojis[Math.abs(hash) % emojis.length];
}

const themeColorConfig = {
  purple: {
    gradient: "from-soft-purple-light/40 to-transparent",
    ring: "hover:ring-soft-purple/40",
    bg: "bg-soft-purple",
    activeBg: "bg-soft-purple-light/20",
    activeRing: "ring-soft-purple",
    accent: "text-soft-purple",
  },
  mint: {
    gradient: "from-mint-light/40 to-transparent",
    ring: "hover:ring-mint/40",
    bg: "bg-mint",
    activeBg: "bg-mint-light/20",
    activeRing: "ring-mint",
    accent: "text-mint",
  },
  peach: {
    gradient: "from-peach-light/40 to-transparent",
    ring: "hover:ring-peach/40",
    bg: "bg-peach",
    activeBg: "bg-peach-light/20",
    activeRing: "ring-peach",
    accent: "text-peach",
  },
  sky: {
    gradient: "from-sky-light/40 to-transparent",
    ring: "hover:ring-sky/40",
    bg: "bg-sky",
    activeBg: "bg-sky-light/20",
    activeRing: "ring-sky",
    accent: "text-sky",
  },
  butter: {
    gradient: "from-butter-light/40 to-transparent",
    ring: "hover:ring-butter/40",
    bg: "bg-butter",
    activeBg: "bg-butter-light/20",
    activeRing: "ring-butter",
    accent: "text-butter",
  },
  gray: {
    gradient: "from-gray-light/40 to-transparent",
    ring: "hover:ring-gray/40",
    bg: "bg-gray",
    activeBg: "bg-gray-light/20",
    activeRing: "ring-gray",
    accent: "text-plum/50",
  },
};

// Map personas/lenses to emojis for compact UI
const personaIcons: Record<string, string> = {
  "Casual Explorer": "🧘",
  "Competitive Duelist": "⚔️",
  "Party Group": "🎉",
  "Speed Runner": "⚡",
  "Deep Learner": "📚",
};

const lensIcons: Record<string, string> = {
  "Origin Story": "🔮",
  "The Unexpected": "⚡",
  "The Human Element": "👤",
  "Numbers & Scale": "📊",
  "The Rivalry": "⚔️",
  "The Oddity": "🤔",
  "Behind the Scenes": "🎬",
  "The Connection": "🔗",
  "What If?": "🤷",
  "The Legacy": "🏛️",
};

// ─── Sub-component: CategoryCard (browse) ──────────────────────────────

function BrowseCategoryCard({
  cat,
  isSelected,
  isUnavailable,
  canPick,
  onPick,
  draftedByAvatar,
}: {
  cat: Category;
  isSelected: boolean;
  isUnavailable: boolean;
  canPick: boolean;
  onPick: () => void;
  draftedByAvatar?: React.ReactNode;
}) {
  const personas = getPersonasForCategory(cat);
  const lenses = getLensesForCategory(cat);
  const persona = personas.values().next().value || null;
  const lens = lenses.values().next().value || null;
  const theme = getThemeFromTags(cat.tags) || "Uncategorized";
  const color = getThemeColor(theme);
  const cfg = themeColorConfig[color];
  
  return (
    <ClayCard
      onClick={onPick}
      elevation={isSelected ? "pressed" : "flat"}
      padding="none"
      className={`w-full flex flex-col p-4 text-left transition-all relative bg-warm-white ${
        isSelected
          ? `${cfg.activeBg} ring-2 ${cfg.activeRing}`
          : `hover:-translate-y-1 hover:ring-2 ${cfg.ring} bg-gradient-to-br ${cfg.gradient}`
      } ${(isUnavailable && !isSelected) || !canPick ? "opacity-50 cursor-not-allowed grayscale-[30%]" : "cursor-pointer"}`}
    >
      <div className="flex items-start justify-between gap-3 w-full mb-2">
        <h4 className="font-outfit font-bold text-plum text-[15px] leading-tight break-words pr-2 w-full">
          {getCategoryDisplayName(cat.name)}
        </h4>
        
        {/* Selection Indicator / Action Button */}
        <div className="flex-shrink-0 mt-0.5">
          {draftedByAvatar ? (
             <div className="w-7 h-7 rounded-full flex items-center justify-center bg-clay-border/50 ring-2 ring-warm-white shadow-sm overflow-hidden text-[10px]">
               {draftedByAvatar}
             </div>
          ) : isSelected ? (
            <div className={`w-6 h-6 rounded-full ${cfg.bg} text-white flex items-center justify-center shadow-inner`}>
              <Check className="w-3.5 h-3.5" />
            </div>
          ) : isUnavailable ? (
            <div className="text-[10px] font-black uppercase text-plum/30 tracking-wider bg-warm-gray/5 px-2 py-1 rounded">
              Taken
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-clay-border flex items-center justify-center text-plum/30 transition-all hover:scale-105 active:scale-95">
              <span className="text-[14px] leading-none mb-[2px]">+</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-auto pt-1 flex-wrap">
        <ClayBadge color="gray" className="text-[9px] sm:text-[10px] font-black flex items-center gap-1 px-1.5 py-0.5">
          <span className="w-1 h-1 rounded-full bg-plum/20" />
          {cat.data?.length || 0} Qs
        </ClayBadge>
        
        {persona && (
          <ClayBadge color="peach" className="text-[9px] sm:text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5" title={`Persona: ${persona}`}>
            {personaIcons[persona] || "👤"} <span className="opacity-90">{persona}</span>
          </ClayBadge>
        )}
        
        {lens && (
          <ClayBadge color="sky" className="text-[9px] sm:text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5" title={`Lens: ${lens}`}>
            {lensIcons[lens] || "🔍"} <span className="opacity-90">{lens}</span>
          </ClayBadge>
        )}
        
        {cat.is_global && (
          <ClayBadge color="mint" className="text-[9px] sm:text-[10px] font-black px-1.5 py-0.5">Global</ClayBadge>
        )}
      </div>
    </ClayCard>
  );
}

// ─── Sub-component: SelectedCategoryCard (right panel / selected tab) ──

function SelectedCategoryCard({
  cat,
  index,
  canRemove,
  onRemove,
  draftedBy,
}: {
  cat: Category;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  draftedBy?: string;
}) {
  const theme = getThemeFromTags(cat.tags) || "Uncategorized";
  const color = getThemeColor(theme);
  const cfg = themeColorConfig[color];

  const colorClassMap = {
    purple: "bg-soft-purple-light text-soft-purple",
    mint: "bg-mint-light text-mint",
    peach: "bg-peach-light text-peach",
    sky: "bg-sky-light text-sky",
    butter: "bg-butter-light text-butter",
    gray: "bg-gray-light text-plum/50",
  };
  const colorClass = colorClassMap[color];

  return (
    <ClayCard padding="none" elevation="flat" className={`flex items-center gap-3 p-3 animate-slide-up-fade bg-warm-white bg-gradient-to-br ${cfg.gradient}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-outfit font-black text-xs flex-shrink-0 shadow-inner ${colorClass}`}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="font-outfit font-bold text-sm text-plum break-words leading-tight">
          {getCategoryDisplayName(cat.name)}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
           <span className="text-[10px] font-semibold text-warm-gray/70">{cat.data?.length || 0} questions</span>
           {draftedBy && <ClayBadge color="purple">{draftedBy}</ClayBadge>}
        </div>
      </div>
      {canRemove && (
        <button
          onClick={onRemove}
          className="w-8 h-8 rounded-full flex items-center justify-center text-plum/30
            hover:bg-peach/10 hover:text-peach transition-colors flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </ClayCard>
  );
}

// ─── Main Component ────────────────────────────────────────────────────

export default function CategoryPicker({
  players,
  hostPlayerId,
  playerId,
  playerName,
  broadcast,
  onBroadcast,
  updateLobbySetting,
  allCategories,
  catsLoading,
  initialSettings,
  onStartGame,
  onBack,
  lobbyCode,
  mode = "host-pick",
}: CategoryPickerProps) {
  const isHost = playerId === hostPlayerId;
  const rounds = initialSettings?.rounds || 1;
  const catsPerRound = initialSettings?.catsPerRound || 5;

  // ── State ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Record<number, Category[]>>(
    initialSettings?.selectedCategories || {},
  );
  const [activeRound, setActiveRound] = useState(1);
  const [isStarting, setIsStarting] = useState(false);
  const [mobileTab, setMobileTab] = useState<"browse" | "selected">("browse");

  // Filter States
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(new Set());
  const [selectedLenses, setSelectedLenses] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  
  // Active Theme (Drill-down view)
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  // Modals
  const [infoModalOpen, setInfoModalOpen] = useState<"persona" | "lens" | null>(null);

  // ── Draft state ────────────────────────────────────────────────────
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>(initialSettings?.draftPicks || []);
  const [draftTurnIndex, setDraftTurnIndex] = useState(initialSettings?.draftTurnIndex || 0);
  const [draftPhase, setDraftPhase] = useState(initialSettings?.draftPhase || "pending");

  const isDraft = mode === "player-draft";
  const canHostPick = isHost && mode === "host-pick";

  // ── Derived Data ───────────────────────────────────────────────────
  const themeOptions = useMemo(() => {
    const set = new Set<string>();
    allCategories.forEach(c => {
      const t = getThemeFromTags(c.tags);
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [allCategories]);

  const activeSelectedIds = useMemo(
    () => new Set((selectedCategories[activeRound] || []).map((c) => c.id)),
    [selectedCategories, activeRound],
  );

  const allSelectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cats of Object.values(selectedCategories)) {
      for (const c of cats || []) ids.add(c.id);
    }
    return ids;
  }, [selectedCategories]);

  const draftPickedIds = useMemo(() => new Set(draftPicks.map((p) => p.categoryId)), [draftPicks]);

  // Active round's selected categories
  const activeSelected = selectedCategories[activeRound] || [];
  const activeCount = activeSelected.length;

  // Filtering Logic
  const filteredCategories = useMemo(() => {
    let cats = allCategories;
    
    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      cats = cats.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.main_category || "").toLowerCase().includes(q) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(q)),
      );
    }

    // 2. Personas (OR logic within personas)
    if (selectedPersonas.size > 0) {
       cats = cats.filter(c => {
         const personas = getPersonasForCategory(c);
         return Array.from(personas).some(p => selectedPersonas.has(p));
       });
    }

    // 3. Lenses (OR logic within lenses)
    if (selectedLenses.size > 0) {
       cats = cats.filter(c => {
         const lenses = getLensesForCategory(c);
         return Array.from(lenses).some(l => selectedLenses.has(l));
       });
    }

    return cats;
  }, [allCategories, searchQuery, selectedPersonas, selectedLenses]);

  const groupedByTheme = useMemo(() => {
    const groups: Record<string, Category[]> = {};
    filteredCategories.forEach(c => {
      const t = getThemeFromTags(c.tags) || "Uncategorized";
      if (!groups[t]) groups[t] = [];
      groups[t].push(c);
    });
    return groups;
  }, [filteredCategories]);


  // ── Handlers ───────────────────────────────────────────────────────
  const toggleFilter = (set: Set<string>, val: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  };

  const toggleCategory = useCallback(
    (cat: Category) => {
      if (!canHostPick) return;
      const current = selectedCategories[activeRound] || [];
      const isSelected = current.some((c) => c.id === cat.id);

      let updated: Category[];
      if (isSelected) {
        updated = current.filter((c) => c.id !== cat.id);
      } else {
        if (current.length >= catsPerRound) return;
        updated = [...current, cat];
        store.addRecentCategory(cat.id);
      }

      const newSelected = { ...selectedCategories, [activeRound]: updated };
      setSelectedCategories(newSelected);
      updateLobbySetting("selectedCategories", newSelected);
      broadcast("settings:update", { selectedCategories: newSelected });
    },
    [canHostPick, selectedCategories, activeRound, catsPerRound, updateLobbySetting, broadcast],
  );

  const removeCategory = useCallback(
    (catId: string) => {
      if (!canHostPick) return;
      const current = selectedCategories[activeRound] || [];
      const updated = current.filter((c) => c.id !== catId);
      const newSelected = { ...selectedCategories, [activeRound]: updated };
      setSelectedCategories(newSelected);
      updateLobbySetting("selectedCategories", newSelected);
      broadcast("settings:update", { selectedCategories: newSelected });
    },
    [canHostPick, selectedCategories, activeRound, updateLobbySetting, broadcast],
  );

  const clearRound = useCallback(() => {
    if (!canHostPick) return;
    const newSelected = { ...selectedCategories, [activeRound]: [] };
    setSelectedCategories(newSelected);
    updateLobbySetting("selectedCategories", newSelected);
    broadcast("settings:update", { selectedCategories: newSelected });
  }, [canHostPick, selectedCategories, activeRound, updateLobbySetting, broadcast]);

  const handleDraftPick = useCallback(
    (cat: Category) => {
      if (draftPhase !== "in_progress") return;
      const currentPickerIdx = draftTurnIndex % players.length;
      const currentPicker = players[currentPickerIdx];
      if (!currentPicker || currentPicker.id !== playerId) return;

      const newPick: DraftPick = {
        playerId, playerName,
        categoryId: cat.id, categoryName: cat.name,
        round: activeRound, slotIndex: draftPicks.filter(p => p.round === activeRound).length,
      };
      const updatedPicks = [...draftPicks, newPick];
      setDraftPicks(updatedPicks);
      broadcast("draft:pick", newPick);
      updateLobbySetting("draftPicks", updatedPicks);

      const nextTurn = draftTurnIndex + 1;
      setDraftTurnIndex(nextTurn);
      broadcast("draft:turn", { turnIndex: nextTurn });
      updateLobbySetting("draftTurnIndex", nextTurn);
    },
    [draftPhase, draftTurnIndex, draftPicks, players, playerId, playerName, activeRound, broadcast, updateLobbySetting],
  );

  const handleConfirmStart = useCallback(async () => {
    setIsStarting(true);
    try { await onStartGame(); } finally { setIsStarting(false); }
  }, [onStartGame]);

  // ── Broadcast listeners ────────────────────────────────────────────
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(onBroadcast("draft:pick", (payload: DraftPick) => {
      setDraftPicks((prev) => prev.some((p) => p.categoryId === payload.categoryId) ? prev : [...prev, payload]);
    }));
    unsubs.push(onBroadcast("draft:turn", (payload: { turnIndex: number }) => {
      setDraftTurnIndex(payload.turnIndex);
    }));
    unsubs.push(onBroadcast("settings:update", (payload: any) => {
      if (payload.selectedCategories) setSelectedCategories(payload.selectedCategories);
      if (payload.draftPicks) setDraftPicks(payload.draftPicks);
      if (payload.draftTurnIndex != null) setDraftTurnIndex(payload.draftTurnIndex);
      if (payload.draftPhase) setDraftPhase(payload.draftPhase);
    }));
    unsubs.push(onBroadcast("draft:complete", (payload: any) => {
      setDraftPhase("complete");
    }));
    return () => unsubs.forEach((fn) => fn());
  }, [onBroadcast]);

  // ── Validations ───────────────────────────────────────────────
  const totalSelected = Object.values(selectedCategories).reduce((s, c) => s + (c?.length || 0), 0);
  
  let allRoundsFull = false;
  if (isDraft) {
     allRoundsFull = draftPicks.length >= (rounds * catsPerRound);
  } else {
     allRoundsFull = rounds > 0 && Array.from({ length: rounds }, (_, i) => i + 1).every(
      (r) => (selectedCategories[r] || []).length >= catsPerRound,
    );
  }

  // ── Loading ────────────────────────────────────────────────────────
  if (catsLoading) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-soft-purple" />
          <p className="text-sm text-plum/40 font-medium">Loading categories...</p>
        </div>
      </div>
    );
  }

  // ── UI Components: Filter Bank ─────────────────────────────────────
  const FilterPill = ({ label, icon, active, onClick }: { label: string; icon?: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-outfit font-black border-2 shadow-sm transition-all duration-200 hover:-translate-y-0.5
        ${active 
          ? "bg-soft-purple text-white border-soft-purple shadow-md shadow-soft-purple/20" 
          : "bg-warm-white border-warm-gray/15 text-plum/70 hover:border-soft-purple/30 hover:bg-soft-purple-light/20"}`}
    >
      {icon && <span className="text-sm">{icon}</span>}
      {label}
    </button>
  );

  const totalActiveFilters = selectedPersonas.size + selectedLenses.size;

  // ── Shared: Browser panel content (Left) ─────────────────────────────────
  const browserContent = (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-clay-cream">
      {/* Fixed Header & Filters */}
      <div className="shrink-0 p-4 pb-3 space-y-3 bg-warm-white/80 border-b border-clay-border/30 backdrop-blur-md z-10 shadow-sm">
        
        {/* Search & Collapsible Filters Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ClayInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 500+ topics..."
              icon={<Search className="w-4 h-4" />}
              autoComplete="off"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`shrink-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-outfit font-black text-xs transition-all duration-200 hover:-translate-y-0.5 cursor-pointer
              ${showFilters || totalActiveFilters > 0
                ? "bg-soft-purple text-white border-soft-purple shadow-md shadow-soft-purple/20"
                : "bg-warm-white border-clay-border/50 text-plum/60 hover:bg-soft-purple-light/10"}`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {totalActiveFilters > 0 && (
              <span className="bg-peach text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full border border-warm-white font-black animate-scale-in">
                {totalActiveFilters}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible Filter Bank */}
        {showFilters && (
          <div className="pt-3 border-t border-clay-border/20 space-y-3 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-plum/40">Filter Options</span>
              {totalActiveFilters > 0 && (
                <button
                  onClick={() => {
                    setSelectedPersonas(new Set());
                    setSelectedLenses(new Set());
                  }}
                  className="text-[10px] font-black text-peach/70 hover:text-peach uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Personas */}
            <div className="flex items-center gap-2">
               <div className="flex items-center gap-1 w-14 shrink-0">
                 <span className="text-[10px] font-black uppercase text-plum/40">Persona</span>
                 <button onClick={() => setInfoModalOpen("persona")} className="text-plum/30 hover:text-soft-purple transition-colors p-0.5 rounded-full hover:bg-soft-purple-light/20"><Info className="w-3 h-3" /></button>
               </div>
               <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                 {ALL_PERSONAS.map(persona => (
                   <FilterPill 
                     key={persona} 
                     label={persona.split(' ')[0]} 
                     icon={personaIcons[persona]}
                     active={selectedPersonas.has(persona)} 
                     onClick={() => toggleFilter(selectedPersonas, persona, setSelectedPersonas)} 
                   />
                 ))}
               </div>
            </div>

            {/* Lenses */}
            <div className="flex items-center gap-2">
               <div className="flex items-center gap-1 w-14 shrink-0">
                 <span className="text-[10px] font-black uppercase text-plum/40">Lenses</span>
                 <button onClick={() => setInfoModalOpen("lens")} className="text-plum/30 hover:text-soft-purple transition-colors p-0.5 rounded-full hover:bg-soft-purple-light/20"><Info className="w-3 h-3" /></button>
               </div>
               <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                 {ALL_LENSES.map(lens => (
                   <FilterPill 
                     key={lens} 
                     label={lens} 
                     icon={lensIcons[lens]}
                     active={selectedLenses.has(lens)} 
                     onClick={() => toggleFilter(selectedLenses, lens, setSelectedLenses)} 
                   />
                 ))}
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Grid of Category Cards */}
      <div className="flex-1 overflow-y-auto p-4">
        {Object.keys(groupedByTheme).length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60">
            <div className="w-20 h-20 rounded-full bg-clay-border/50 flex items-center justify-center">
               <Search className="w-8 h-8 text-plum/40" />
            </div>
            <div>
              <h3 className="font-outfit font-black text-lg text-plum">No categories found</h3>
              <p className="text-sm font-medium text-plum/50 max-w-[250px] mx-auto mt-1">Try removing some filters or searching for something else.</p>
            </div>
          </div>
        ) : activeTheme === null ? (
          // THEME GRID VIEW (Tier 1)
          <div className="space-y-4 pb-12 animate-in fade-in duration-300">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-warm-gray/70">
                {Object.keys(groupedByTheme).length} Themes Available
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3.5">
              {Object.entries(groupedByTheme).sort(([a], [b]) => a.localeCompare(b)).map(([theme, cats]) => {
                const color = getThemeColor(theme);
                const emoji = getThemeEmoji(theme);
                const cfg = themeColorConfig[color];
                return (
                  <ClayCard 
                    key={theme} 
                    elevation="elevated" 
                    padding="sm"
                    onClick={() => setActiveTheme(theme)}
                    className={`flex flex-col items-center justify-center text-center aspect-[1.1] cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:ring-2 ${cfg.ring} bg-warm-white bg-gradient-to-br ${cfg.gradient}`}
                  >
                     <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center mb-2 shadow-md`}>
                       <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-inner text-sm">
                         {emoji}
                       </span>
                     </div>
                     <h3 className={`font-outfit font-black text-plum mb-1.5 break-normal w-full px-1 line-clamp-2 ${getThemeFontSizeClass(theme)}`} title={theme}>
                       {theme}
                     </h3>
                     <ClayBadge color={color} className="text-[9px] py-0.5 px-2">{cats.length} Topics</ClayBadge>
                  </ClayCard>
                );
              })}
            </div>
          </div>
        ) : (
          // TOPIC SELECTION VIEW (Tier 2)
          <div className="space-y-4 pb-12 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveTheme(null)}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-warm-gray/10 hover:bg-soft-purple-light/20 text-plum/60 hover:text-soft-purple transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="font-outfit font-black text-xl text-plum">{activeTheme}</h3>
              </div>
              <ClayBadge color="purple">{(groupedByTheme[activeTheme] || []).length} Topics</ClayBadge>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(groupedByTheme[activeTheme] || []).map(cat => {
                const isSelected = activeSelectedIds.has(cat.id);
                const isDraftPicked = draftPickedIds.has(cat.id);
                const isUnavailable = (!canHostPick && !isDraft) || isDraftPicked;
                const canPick = canHostPick || (isDraft && draftPhase === "in_progress");

                let draftedByStr: string | undefined;
                if (isDraftPicked) {
                    const pick = draftPicks.find(p => p.categoryId === cat.id);
                    draftedByStr = pick?.playerName.substring(0, 2).toUpperCase();
                }

                return (
                  <BrowseCategoryCard
                    key={cat.id}
                    cat={cat}
                    isSelected={isSelected}
                    isUnavailable={isUnavailable}
                    canPick={canPick}
                    draftedByAvatar={draftedByStr}
                    onPick={() => {
                      if (canHostPick) toggleCategory(cat);
                      else if (isDraft && !isDraftPicked) handleDraftPick(cat);
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Shared: Selected panel content (Right / Bottom Drawer) ────────────────────────
  
  // Calculate which slots are filled for the active round
  let activeRoundPicks: any[] = [];
  if (isDraft) {
     activeRoundPicks = draftPicks.filter(p => p.round === activeRound);
  } else {
     activeRoundPicks = activeSelected;
  }
  
  const currentCount = activeRoundPicks.length;
  const dots = Array.from({ length: catsPerRound }, (_, i) => i < currentCount);

  const selectedPanelContent = (
    <div className="flex-1 flex flex-col h-full bg-warm-white shadow-[-10px_0_30px_rgba(0,0,0,0.03)] z-20 relative">
      
      {/* Draft Board Header */}
      <div className="shrink-0 p-5 pb-4 border-b border-clay-border/40">
         <h2 className="font-outfit font-black text-xl text-plum flex items-center gap-2">
            📋 Draft Board
         </h2>
         <p className="text-xs font-bold text-plum/40 mt-1">
            Build your game grid
         </p>
      </div>

      {/* Round tabs */}
      {rounds > 1 && (
        <div className="shrink-0 flex items-center gap-2 p-4 pb-2 overflow-x-auto scrollbar-hide border-b border-clay-border/20">
          {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
            let countForR = 0;
            if (isDraft) countForR = draftPicks.filter(p => p.round === r).length;
            else countForR = (selectedCategories[r] || []).length;
            
            const isComplete = countForR >= catsPerRound;
            
            return (
              <button
                key={r}
                onClick={() => setActiveRound(r)}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border-2 ${
                  activeRound === r
                    ? "bg-soft-purple text-white border-soft-purple shadow-md"
                    : isComplete
                      ? "bg-mint-light/30 text-mint border-mint/30 hover:bg-mint-light/50"
                      : "bg-warm-gray/5 text-plum/40 border-transparent hover:bg-warm-gray/10"
                }`}
              >
                {isComplete && <CheckCircle2 className="w-3.5 h-3.5" />}
                Round {r}
              </button>
            );
          })}
        </div>
      )}

      {/* Draft Turn Banner */}
      {isDraft && draftPhase === "in_progress" && (
        <div className="shrink-0 px-5 py-3 bg-soft-purple-light/30 border-b border-soft-purple/15 flex items-center justify-center text-center">
          {players[draftTurnIndex % players.length]?.id === playerId ? (
            <p className="font-outfit font-black text-sm text-soft-purple animate-pulse flex items-center gap-2">
              🎮 It's your turn to pick!
            </p>
          ) : (
            <p className="font-outfit font-bold text-sm text-plum/60 flex items-center gap-2">
              Waiting for {players[draftTurnIndex % players.length]?.name}...
              <Loader2 className="w-3 h-3 animate-spin opacity-50" />
            </p>
          )}
        </div>
      )}

      {/* Selected cards list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {activeRoundPicks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-40">
            <div className="text-4xl">🎯</div>
            <p className="text-sm font-bold text-plum/80 max-w-[200px]">
              {isDraft
                ? draftPhase === "in_progress"
                  ? "Categories will appear here as players draft them."
                  : "Draft hasn't started yet."
                : canHostPick
                  ? "Select categories from the left to build this round."
                  : "Waiting for host to select categories..."}
            </p>
          </div>
        ) : (
          activeRoundPicks.map((pick, idx) => {
            // Handle both Category objects (host mode) and DraftPick objects (draft mode)
            const cat = isDraft ? { id: pick.categoryId, name: pick.categoryName } as Category : pick as Category;
            const draftedBy = isDraft ? pick.playerName : undefined;
            const fullCat = allCategories.find((c) => c.id === cat.id) || cat;
            
            return (
              <SelectedCategoryCard
                key={isDraft ? `draft-${idx}` : cat.id}
                cat={fullCat}
                index={idx}
                canRemove={canHostPick && !isDraft}
                onRemove={() => removeCategory(cat.id)}
                draftedBy={draftedBy}
              />
            );
          })
        )}

        {/* Empty slots placeholders */}
        {activeRoundPicks.length < catsPerRound && (
          Array.from({ length: catsPerRound - activeRoundPicks.length }).map((_, i) => (
            <ClayCard
              key={`empty-${i}`}
              elevation="pressed"
              padding="sm"
              className="flex items-center justify-center min-h-[60px]"
            >
              <span className="text-[10px] font-black text-plum/20 uppercase tracking-widest">
                Empty slot {activeRoundPicks.length + i + 1}
              </span>
            </ClayCard>
          ))
        )}
      </div>

      {/* Sticky Bottom Actions */}
      <div className="shrink-0 p-5 bg-warm-white border-t border-clay-border/50 shadow-[0_-10px_20px_rgba(0,0,0,0.02)] z-10 space-y-4">
        
        {/* Progress Dots */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {dots.map((filled, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 ${
                  filled
                    ? "bg-soft-purple border-soft-purple scale-110"
                    : "bg-transparent border-clay-border"
                }`}
              />
            ))}
            <span className="text-[11px] font-black text-plum/40 ml-2">
              {currentCount} / {catsPerRound}
            </span>
          </div>

          {canHostPick && currentCount > 0 && !isDraft && (
            <button
              onClick={clearRound}
              className="flex items-center gap-1.5 text-[11px] font-bold text-peach/60 hover:text-peach transition-colors uppercase tracking-wider bg-peach/5 px-2 py-1 rounded-lg"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Action Buttons */}
        {isDraft && isHost && draftPhase === "pending" ? (
           <ClayButton
             variant="primary"
             size="lg"
             className="w-full"
             onClick={() => {
               setDraftPhase("in_progress");
               setDraftTurnIndex(0);
               updateLobbySetting("draftPhase", "in_progress");
               updateLobbySetting("draftTurnIndex", 0);
               broadcast("draft:start", { turnIndex: 0 });
               broadcast("settings:update", { draftPhase: "in_progress", draftTurnIndex: 0 });
             }}
           >
             Start Player Draft
           </ClayButton>
        ) : (canHostPick && !isDraft) || (isDraft && isHost && draftPhase === "complete") ? (
          <ClayButton
            variant={allRoundsFull ? "success" : "ghost"}
            size="lg"
            className="w-full"
            loading={isStarting}
            disabled={isStarting || !allRoundsFull}
            onClick={handleConfirmStart}
            style={{ backgroundColor: !allRoundsFull ? "rgba(166, 157, 145, 0.1)" : undefined }}
          >
            {allRoundsFull ? "Confirm & Start Game" : `Select ${rounds * catsPerRound - totalSelected} more topics`}
          </ClayButton>
        ) : null}
      </div>
    </div>
  );

  // ── Info Modals ────────────────────────────────────────────────────────
  const renderInfoModalContent = () => {
    if (infoModalOpen === "persona") {
      return (
        <div className="space-y-4">
          <p className="text-sm text-plum/60 leading-relaxed font-medium">
            Personas control the tone, difficulty curve, and "vibe" of the AI-generated questions.
          </p>
          <div className="space-y-3">
            {[
              { icon: "🧘", name: "Casual Explorer", desc: "Warm, inviting tone. Very strong logical backdoors so anyone can guess the answer even without prior knowledge." },
              { icon: "⚔️", name: "Competitive Duelist", desc: "Sharp, edgy tone. Moderate backdoors designed for trivia hobbyists." },
              { icon: "🎉", name: "Party Group", desc: "Fun, chaotic, and highly accessible for mixed-level groups." },
              { icon: "⚡", name: "Speed Runner", desc: "Rapid, punchy questions. Less fluff, subtle backdoors for quick recall." },
              { icon: "📚", name: "Deep Learner", desc: "Scholarly, rich tone. Subtle backdoors that reward deep topic expertise." }
            ].map(p => (
               <ClayCard key={p.name} elevation="flat" padding="sm" className="flex gap-3">
                  <span className="text-2xl">{p.icon}</span>
                  <div>
                    <h4 className="font-outfit font-bold text-plum text-sm">{p.name}</h4>
                    <p className="text-xs text-plum/50 mt-1 leading-snug">{p.desc}</p>
                  </div>
               </ClayCard>
            ))}
          </div>
        </div>
      );
    }
    if (infoModalOpen === "lens") {
      return (
        <div className="space-y-4">
          <p className="text-sm text-plum/60 leading-relaxed font-medium">
            Lenses act as the "camera angle" for the question. They change how the factual information is framed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
             {[
               { icon: "🔮", name: "Origin Story", desc: "How did this begin? The spark that started it all." },
               { icon: "⚡", name: "The Unexpected", desc: "Contradicts common belief. The 'wait, what?!' moment." },
               { icon: "👤", name: "The Human Element", desc: "The person, struggle, or drama behind the fact." },
               { icon: "📊", name: "Numbers & Scale", desc: "Awe-inspiring statistics. How big, fast, or many?" },
               { icon: "⚔️", name: "The Rivalry", desc: "Tension and conflict. Who was fighting whom?" },
               { icon: "🤔", name: "The Oddity", desc: "Amusement and curiosity. The weirdest detail." },
               { icon: "🎬", name: "Behind the Scenes", desc: "Insider feeling. What was hidden from view?" },
               { icon: "🔗", name: "The Connection", desc: "Mind-blown links. How do two unrelated things connect?" }
             ].map(l => (
                <ClayCard key={l.name} elevation="flat" padding="sm" className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                     <span>{l.icon}</span>
                     <h4 className="font-outfit font-bold text-plum text-xs">{l.name}</h4>
                  </div>
                  <p className="text-[11px] text-plum/50 leading-snug">{l.desc}</p>
                </ClayCard>
             ))}
          </div>
        </div>
      );
    }
    return null;
  };

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen bg-clay-cream overflow-hidden font-inter flex items-center justify-center p-0 md:p-6 lg:p-8">
      
      {/* ── Info Modal ──────────────────────────────────────────────── */}
      <ClayModal 
        open={infoModalOpen !== null} 
        onClose={() => setInfoModalOpen(null)}
        title={infoModalOpen === "persona" ? "AI Personas Explained" : "AI Lenses Explained"}
        icon={infoModalOpen === "persona" ? <span className="text-2xl leading-none -mt-1">👥</span> : <span className="text-2xl leading-none -mt-1">🔍</span>}
      >
         {renderInfoModalContent()}
      </ClayModal>

      {/* Surface Clay Card container for the whole category picker */}
      <div className="w-full h-full md:w-[85%] lg:w-[75%] md:max-w-7xl md:clay-elevated md:border-2 md:border-clay-border/60 bg-warm-white flex flex-col overflow-hidden md:rounded-[2.5rem] shadow-2xl relative">
        
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="shrink-0 px-4 md:px-6 py-4 flex items-center justify-between border-b border-clay-border/50 bg-warm-white/90 backdrop-blur-md z-30 shadow-sm relative">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-bold text-plum/50 hover:text-soft-purple transition-colors bg-warm-gray/5 hover:bg-soft-purple-light/20 px-3 py-1.5 rounded-full"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Lobby</span>
          </button>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
            <h1 className="font-outfit font-black text-lg md:text-xl text-plum flex items-center gap-2">
              <span className="text-2xl">📚</span> Topic Library
            </h1>
          </div>

          <div className="flex items-center">
            <span className="text-xs font-black text-soft-purple bg-soft-purple-light/30 px-3 py-1.5 rounded-full border border-soft-purple/20">
              {allCategories.length} Total
            </span>
          </div>
        </header>

        {/* ── Mobile tabs (Bottom Nav Style) ───────────────────────────── */}
        <div className="lg:hidden absolute bottom-0 left-0 right-0 shrink-0 flex border-t border-clay-border/50 bg-warm-white/95 backdrop-blur-md z-40 pb-safe shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
          <button
            onClick={() => setMobileTab("browse")}
            className={`flex-1 py-4 flex flex-col items-center gap-1 text-xs font-outfit font-black transition-colors relative ${
              mobileTab === "browse" ? "text-soft-purple" : "text-plum/30 hover:text-plum/50"
            }`}
          >
            <Search className="w-5 h-5 mb-0.5" />
            Discover
          </button>
          <button
            onClick={() => setMobileTab("selected")}
            className={`flex-1 py-4 flex flex-col items-center gap-1 text-xs font-outfit font-black transition-colors relative ${
              mobileTab === "selected" ? "text-soft-purple" : "text-plum/30 hover:text-plum/50"
            }`}
          >
            <div className="relative">
               <CheckCircle2 className="w-5 h-5 mb-0.5" />
               {currentCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-peach text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full border-2 border-warm-white">
                    {currentCount}
                  </span>
               )}
            </div>
            Draft Board
          </button>
        </div>

        {/* ── Main Layout (Desktop: 70/30 Split | Mobile: Tab View) ────── */}
        <div className="flex-1 flex overflow-hidden lg:pb-0 pb-[72px]">
          
          {/* Left: Discover/Filter (70% on Desktop, 100% on Mobile when active) */}
          <div className={`w-full lg:w-[65%] xl:w-[70%] flex flex-col overflow-hidden border-r border-clay-border/50 ${mobileTab === "browse" ? "flex" : "hidden lg:flex"}`}>
            {browserContent}
          </div>

          {/* Right: Draft Board (30% on Desktop, 100% on Mobile when active) */}
          <div className={`w-full lg:w-[35%] xl:w-[30%] flex flex-col overflow-hidden ${mobileTab === "selected" ? "flex" : "hidden lg:flex"}`}>
            {selectedPanelContent}
          </div>
          
        </div>

      </div>
    </div>
  );
}
