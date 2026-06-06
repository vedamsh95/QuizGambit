import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeft, Search, X, ChevronDown, ChevronRight,
  Check, Plus, Loader2, Sparkles, Trash2,
} from "lucide-react";
import { store } from "../lib/storage";

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

function getCategoryDisplayName(name: string): string {
  return name.replace(" (Arena)", "").trim();
}

// ─── Sub-component: CategoryCard (browse) ──────────────────────────────

function BrowseCategoryCard({
  cat,
  isSelected,
  isUnavailable,
  canPick,
  onPick,
}: {
  cat: Category;
  isSelected: boolean;
  isUnavailable: boolean;
  canPick: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      disabled={!canPick || isUnavailable}
      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all group
        ${isSelected
          ? "bg-soft-purple-light/30 ring-2 ring-soft-purple"
          : "bg-warm-white border border-warm-gray/10 hover:border-soft-purple/30 hover:shadow-sm"}
        ${isUnavailable || !canPick ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {/* Q-count badge */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-outfit font-black text-xs
        ${isSelected ? "bg-soft-purple text-white" : "bg-soft-purple-light/30 text-soft-purple"}`}>
        {cat.data?.length || 0}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-outfit font-bold text-sm text-plum truncate">
          {getCategoryDisplayName(cat.name)}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[9px] font-bold text-plum/40">
            {cat.data?.length || 0} Qs
          </span>
          {cat.is_global && (
            <span className="text-[8px] font-black text-sky/60 bg-sky-light/30 px-1.5 py-0.5 rounded">Global</span>
          )}
          {cat.tags?.filter((t) => t !== "Grid" && !t.startsWith("Theme:")).slice(0, 2).map((tag) => (
            <span key={tag} className="text-[8px] text-plum/30 bg-warm-gray/5 px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      </div>

      <div className="flex-shrink-0">
        {isSelected ? (
          <span className="w-8 h-8 rounded-lg bg-soft-purple text-white flex items-center justify-center">
            <Check className="w-4 h-4" />
          </span>
        ) : isUnavailable ? (
          <span className="text-[10px] font-bold text-plum/30">Taken</span>
        ) : (
          <span className="w-8 h-8 rounded-lg bg-warm-gray/5 flex items-center justify-center text-plum/20
            group-hover:bg-soft-purple-light/30 group-hover:text-soft-purple transition-colors">
            <Plus className="w-4 h-4" />
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Sub-component: SelectedCategoryCard (right panel / selected tab) ──

function SelectedCategoryCard({
  cat,
  index,
  canRemove,
  onRemove,
}: {
  cat: Category;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const colors = [
    "bg-lavender border-soft-purple/30",
    "bg-sky-light/60 border-sky/30",
    "bg-peach-light/60 border-peach/30",
    "bg-mint-light/60 border-mint/30",
    "bg-butter-light/60 border-butter/30",
  ];
  const color = colors[index % colors.length];

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border animate-slide-up-fade ${color}`}>
      <span className="font-outfit font-black text-xs text-plum/40 w-5 text-center flex-shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-outfit font-bold text-sm text-plum truncate">
          {getCategoryDisplayName(cat.name)}
        </div>
        <span className="text-[10px] font-bold text-plum/40">{cat.data?.length || 0} questions</span>
      </div>
      {canRemove && (
        <button
          onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-plum/30
            hover:bg-peach/10 hover:text-peach transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
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
  const [activeThemeFilter, setActiveThemeFilter] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Record<number, Category[]>>(
    initialSettings?.selectedCategories || {},
  );
  const [activeRound, setActiveRound] = useState(1);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);
  const [mobileTab, setMobileTab] = useState<"browse" | "selected">("browse");

  // ── Draft state ────────────────────────────────────────────────────
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>(initialSettings?.draftPicks || []);
  const [draftTurnIndex, setDraftTurnIndex] = useState(initialSettings?.draftTurnIndex || 0);
  const [draftPhase, setDraftPhase] = useState(initialSettings?.draftPhase || "pending");

  const isDraft = mode === "player-draft";
  const canHostPick = isHost && mode === "host-pick";

  // ── Recently used ──────────────────────────────────────────────────
  const recentIds = store.getRecentCategoryIds();
  const recentCategories = useMemo(
    () => recentIds.map((id) => allCategories.find((c) => c.id === id)).filter(Boolean) as Category[],
    [allCategories, recentIds],
  );

  // ── Selected IDs ───────────────────────────────────────────────────
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

  // ── Active round's selected categories ─────────────────────────────
  const activeSelected = selectedCategories[activeRound] || [];
  const activeCount = activeSelected.length;
  const isRoundFull = activeCount >= catsPerRound;

  // ── Theme filters ──────────────────────────────────────────────────
  const themeFilters = useMemo(() => {
    const map = new Map<string, number>();
    for (const cat of allCategories) {
      const theme = getThemeFromTags(cat.tags);
      if (theme) map.set(theme, (map.get(theme) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [allCategories]);

  // ── Filtered & grouped categories ──────────────────────────────────
  const filteredCategories = useMemo(() => {
    let cats = allCategories;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      cats = cats.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.main_category || "").toLowerCase().includes(q) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (activeThemeFilter) {
      cats = cats.filter((c) => getThemeFromTags(c.tags) === activeThemeFilter);
    }
    return cats;
  }, [allCategories, searchQuery, activeThemeFilter]);

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, Category[]>();
    for (const cat of filteredCategories) {
      const key = cat.main_category || "Uncategorized";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(cat);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCategories]);

  // ── Auto-expand first 3 sections ───────────────────────────────────
  useEffect(() => {
    if (expandedSections.size === 0 && groupedCategories.length > 0) {
      setExpandedSections(new Set(groupedCategories.slice(0, 3).map(([k]) => k)));
    }
  }, [groupedCategories.length]);

  // ── Handlers ───────────────────────────────────────────────────────
  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  const fillWithTheme = useCallback(
    (themeName: string) => {
      if (!canHostPick) return;
      const themeCats = allCategories.filter(
        (c) => getThemeFromTags(c.tags) === themeName && !allSelectedIds.has(c.id),
      );
      const toAdd = themeCats.slice(0, catsPerRound);
      const newSelected = { ...selectedCategories, [activeRound]: toAdd };
      setSelectedCategories(newSelected);
      updateLobbySetting("selectedCategories", newSelected);
      broadcast("settings:update", { selectedCategories: newSelected });
      toAdd.forEach((c) => store.addRecentCategory(c.id));
    },
    [canHostPick, allCategories, allSelectedIds, selectedCategories, activeRound, catsPerRound, updateLobbySetting, broadcast],
  );

  const handleDraftPick = useCallback(
    (cat: Category) => {
      if (draftPhase !== "in_progress") return;
      const currentPickerIdx = draftTurnIndex % players.length;
      const currentPicker = players[currentPickerIdx];
      if (!currentPicker || currentPicker.id !== playerId) return;

      const newPick: DraftPick = {
        playerId, playerName,
        categoryId: cat.id, categoryName: cat.name,
        round: activeRound, slotIndex: draftPicks.length,
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

  // ── Total selected across all rounds ───────────────────────────────
  const totalSelected = Object.values(selectedCategories).reduce((s, c) => s + (c?.length || 0), 0);
  const allRoundsFull = rounds > 0 && Array.from({ length: rounds }, (_, i) => i + 1).every(
    (r) => (selectedCategories[r] || []).length >= catsPerRound,
  );

  // ── Dots ───────────────────────────────────────────────────────────
  const dots = Array.from({ length: catsPerRound }, (_, i) => i < activeCount);

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

  // ── Shared: Browser panel content ─────────────────────────────────
  const browserContent = (
    <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-plum/20" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search categories..."
          className="w-full clay-input pl-10 pr-10 py-2.5 text-sm font-outfit font-bold text-plum
            placeholder:text-plum/20 rounded-2xl"
          autoComplete="off"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg
              flex items-center justify-center text-plum/30 hover:text-plum hover:bg-warm-gray/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Theme filter pills */}
      {themeFilters.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveThemeFilter(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black transition-colors ${
              !activeThemeFilter
                ? "bg-soft-purple text-white shadow-sm"
                : "bg-warm-gray/5 text-plum/40 border border-warm-gray/10 hover:border-soft-purple/30 hover:text-soft-purple"
            }`}
          >
            All
          </button>
          {themeFilters.map(({ name, count }) => (
            <button
              key={name}
              onClick={() => setActiveThemeFilter(name)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition-colors flex items-center gap-1.5 ${
                activeThemeFilter === name
                  ? "bg-soft-purple text-white shadow-sm"
                  : "bg-warm-gray/5 text-plum/40 border border-warm-gray/10 hover:border-soft-purple/30 hover:text-soft-purple"
              }`}
            >
              {name}
              <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Fill with Theme quick action */}
      {canHostPick && activeThemeFilter && !isRoundFull && (
        <div className="clay p-3 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-soft-purple flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-plum">
              Fill Round {activeRound} with "{activeThemeFilter}"
            </p>
          </div>
          <button
            onClick={() => fillWithTheme(activeThemeFilter!)}
            className="clay-btn shrink-0 px-4 py-1.5 rounded-xl font-outfit font-bold text-xs
              bg-soft-purple text-white hover:bg-soft-purple/90 transition-colors"
          >
            Fill
          </button>
        </div>
      )}

      {/* Recently Used */}
      {recentCategories.length > 0 && !searchQuery && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-plum/30 px-1">
            Recently Used
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {recentCategories.map((cat) => {
              const isSelected = activeSelectedIds.has(cat.id);
              const isUnavailable = !canHostPick && draftPickedIds.has(cat.id);
              return (
                <BrowseCategoryCard
                  key={cat.id}
                  cat={cat}
                  isSelected={isSelected}
                  isUnavailable={isUnavailable}
                  canPick={canHostPick || (isDraft && draftPhase === "in_progress")}
                  onPick={() => {
                    if (canHostPick) toggleCategory(cat);
                    else if (isDraft && !draftPickedIds.has(cat.id)) handleDraftPick(cat);
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Accordion categories */}
      <div className="space-y-1">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-plum/30 px-1 mb-2">
          {searchQuery ? `Results for "${searchQuery}"` : "All Categories"}
        </h3>

        {groupedCategories.length === 0 ? (
          <div className="clay p-8 text-center space-y-2">
            <span className="text-2xl">📭</span>
            <p className="font-outfit font-bold text-sm text-plum/30">
              {searchQuery ? "No matching categories" : "No categories available"}
            </p>
          </div>
        ) : (
          groupedCategories.map(([groupName, cats]) => {
            const isExpanded = expandedSections.has(groupName);
            const selectedInGroup = cats.filter((c) => activeSelectedIds.has(c.id)).length;
            const draftPickedInGroup = isDraft ? cats.filter((c) => draftPickedIds.has(c.id)).length : 0;

            return (
              <div key={groupName} className="rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggleSection(groupName)}
                  className="w-full clay p-3 flex items-center gap-3 text-left
                    hover:shadow-sm transition-shadow"
                >
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="font-outfit font-bold text-sm text-plum truncate">{groupName}</span>
                    <span className="text-[10px] font-black text-plum/30 bg-warm-gray/5 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {cats.length}
                    </span>
                    {selectedInGroup > 0 && (
                      <span className="text-[10px] font-black text-soft-purple bg-soft-purple-light/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {selectedInGroup}
                      </span>
                    )}
                  </div>
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-plum/30 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-plum/30 flex-shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-1.5 animate-slide-up-fade">
                    {cats.map((cat) => {
                      const isSelected = activeSelectedIds.has(cat.id);
                      const isDraftPicked = draftPickedIds.has(cat.id);
                      const isUnavailable = (!canHostPick && !isDraft) || isDraftPicked;
                      const canPick = canHostPick || (isDraft && draftPhase === "in_progress");

                      return (
                        <BrowseCategoryCard
                          key={cat.id}
                          cat={cat}
                          isSelected={isSelected}
                          isUnavailable={isUnavailable}
                          canPick={canPick}
                          onPick={() => {
                            if (canHostPick) toggleCategory(cat);
                            else if (isDraft && !isDraftPicked) handleDraftPick(cat);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ── Shared: Selected panel content ──────────────────────────────────
  const selectedPanelContent = (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Round tabs */}
      {rounds > 1 && (
        <div className="flex items-center gap-1.5 p-3 overflow-x-auto scrollbar-hide">
          {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
            const count = (selectedCategories[r] || []).length;
            const isComplete = count >= catsPerRound;
            return (
              <button
                key={r}
                onClick={() => setActiveRound(r)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black transition-all flex items-center gap-1 ${
                  activeRound === r
                    ? "bg-soft-purple text-white shadow-sm"
                    : isComplete
                      ? "bg-mint-light/50 text-mint"
                      : "bg-warm-gray/5 text-plum/40 border border-warm-gray/15"
                }`}
              >
                {isComplete && <Check className="w-3 h-3" />}
                R{r}
                <span className="opacity-60">({count}/{catsPerRound})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected cards list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {activeSelected.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="text-3xl opacity-30">{isDraft ? "🎯" : "📋"}</div>
            <p className="text-sm font-bold text-plum/25">
              {isDraft
                ? draftPhase === "in_progress"
                  ? "Categories will appear here as players pick"
                  : "Draft hasn't started yet"
                : canHostPick
                  ? "Tap categories on the left to add them here"
                  : "Waiting for host to select categories"}
            </p>
          </div>
        ) : (
          activeSelected.map((cat, idx) => (
            <SelectedCategoryCard
              key={cat.id}
              cat={cat}
              index={idx}
              canRemove={canHostPick}
              onRemove={() => removeCategory(cat.id)}
            />
          ))
        )}

        {/* Empty slots */}
        {canHostPick && activeSelected.length < catsPerRound && (
          Array.from({ length: catsPerRound - activeSelected.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="p-3 rounded-xl border-2 border-dashed border-warm-gray/15 flex items-center justify-center"
            >
              <span className="text-[10px] font-bold text-plum/20 uppercase tracking-wider">
                Empty slot {activeSelected.length + i + 1}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 p-3 border-t border-clay-border/30 space-y-3 bg-warm-white/50">
        {/* Dots + count */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {dots.map((filled, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  filled
                    ? "bg-soft-purple border-soft-purple"
                    : "bg-transparent border-warm-gray/20"
                }`}
              />
            ))}
            <span className="text-[10px] font-bold text-plum/40 ml-1">
              {activeCount}/{catsPerRound}
            </span>
          </div>

          {canHostPick && activeCount > 0 && (
            <button
              onClick={clearRound}
              className="flex items-center gap-1 text-[10px] font-bold text-peach/60 hover:text-peach transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Confirm button */}
        {canHostPick && (
          <button
            onClick={handleConfirmStart}
            disabled={isStarting || !allRoundsFull}
            className="w-full clay-btn py-3 rounded-xl font-outfit font-bold text-sm
              bg-soft-purple text-white hover:bg-soft-purple/90 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : allRoundsFull ? (
              "Confirm & Start Game"
            ) : (
              `Select ${rounds * catsPerRound - totalSelected} more categories`
            )}
          </button>
        )}

        {!canHostPick && !isDraft && (
          <div className="text-center py-2">
            <div className="animate-pulse flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-soft-purple" />
              <span className="text-xs font-bold text-plum/50">Host is selecting categories...</span>
            </div>
          </div>
        )}

        {isDraft && draftPhase === "complete" && isHost && (
          <button
            onClick={handleConfirmStart}
            disabled={isStarting}
            className="w-full clay-btn py-3 rounded-xl font-outfit font-bold text-sm
              bg-mint text-white hover:bg-mint/90 transition-colors
              flex items-center justify-center gap-2"
          >
            {isStarting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
            ) : (
              "Start Game"
            )}
          </button>
        )}
      </div>
    </div>
  );

  // ── Draft-specific overlays ─────────────────────────────────────────
  const draftOverlay = isDraft && (
    <>
      {/* Start Draft button (host) */}
      {isHost && draftPhase === "pending" && (
        <div className="shrink-0 px-4 py-3 bg-soft-purple-light/30 border-t border-soft-purple/15 text-center">
          <p className="font-outfit font-bold text-sm text-plum/60 mb-2">
            Ready to start the category draft?
          </p>
          <button
            onClick={() => {
              setDraftPhase("in_progress");
              setDraftTurnIndex(0);
              updateLobbySetting("draftPhase", "in_progress");
              updateLobbySetting("draftTurnIndex", 0);
              broadcast("draft:start", { turnIndex: 0 });
              broadcast("settings:update", { draftPhase: "in_progress", draftTurnIndex: 0 });
            }}
            className="clay-btn px-6 py-2.5 rounded-xl font-outfit font-bold text-sm
              bg-soft-purple text-white hover:bg-soft-purple/90 transition-colors"
          >
            Start Draft
          </button>
        </div>
      )}

      {/* Turn banner */}
      {draftPhase === "in_progress" && (
        <div className="shrink-0 px-4 py-3 bg-soft-purple-light/50 border-t border-soft-purple/20 text-center">
          {players[draftTurnIndex % players.length]?.id === playerId ? (
            <p className="font-outfit font-black text-sm text-soft-purple animate-pulse">
              🎮 It's your turn! Pick a category
            </p>
          ) : (
            <p className="font-outfit font-bold text-sm text-plum/50">
              {players[draftTurnIndex % players.length]?.name || "Someone"}'s turn
            </p>
          )}
        </div>
      )}
    </>
  );

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="h-dvh bg-clay-cream flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-clay-border/50 bg-warm-white/80 backdrop-blur-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-plum/60 hover:text-plum transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Lobby
        </button>

        <div className="flex items-center gap-3">
          <h1 className="font-outfit font-black text-sm text-plum">
            🎯 Select Categories
          </h1>
          <span className="text-[10px] font-bold text-soft-purple bg-soft-purple-light/40 px-2 py-0.5 rounded-full">
            {totalSelected}/{rounds * catsPerRound}
          </span>
        </div>

        <button
          onClick={onBack}
          className="text-[10px] font-bold text-plum/40 hover:text-plum/60 transition-colors"
        >
          Cancel
        </button>
      </header>

      {/* ── Mobile tabs ─────────────────────────────────────────────── */}
      <div className="lg:hidden shrink-0 flex border-b border-clay-border/30 bg-warm-white/50">
        <button
          onClick={() => setMobileTab("browse")}
          className={`flex-1 py-2.5 text-xs font-outfit font-bold transition-colors relative ${
            mobileTab === "browse" ? "text-soft-purple" : "text-plum/30"
          }`}
        >
          Browse
          {mobileTab === "browse" && (
            <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-soft-purple rounded-full" />
          )}
        </button>
        <button
          onClick={() => setMobileTab("selected")}
          className={`flex-1 py-2.5 text-xs font-outfit font-bold transition-colors relative ${
            mobileTab === "selected" ? "text-soft-purple" : "text-plum/30"
          }`}
        >
          Selected ({activeCount}/{catsPerRound})
          {mobileTab === "selected" && (
            <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-soft-purple rounded-full" />
          )}
        </button>
      </div>

      {/* ── Mobile: Tab-based view ──────────────────────────────────── */}
      <div className="lg:hidden flex-1 flex flex-col overflow-hidden">
        {mobileTab === "browse" && browserContent}
        {mobileTab === "selected" && selectedPanelContent}
        {draftOverlay}
      </div>

      {/* ── Desktop: Two-panel split ─────────────────────────────────── */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left: Browser */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-clay-border/30">
          {browserContent}
        </div>

        {/* Right: Selected panel */}
        <div className="w-88 flex flex-col overflow-hidden bg-warm-white/30">
          {/* Draft board header */}
          {isDraft && draftPicks.length > 0 && (
            <div className="shrink-0 px-4 py-2 border-b border-clay-border/20">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-plum/40">
                Draft Board ({draftPicks.length} picked)
              </h3>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {draftPicks.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="font-bold text-plum/30 w-8">R{p.round}-S{p.slotIndex + 1}</span>
                    <span className="font-bold text-plum truncate flex-1">{p.categoryName}</span>
                    <span className="text-plum/50 flex-shrink-0">{p.playerName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedPanelContent}
          {draftOverlay}
        </div>
      </div>
    </div>
  );
}
