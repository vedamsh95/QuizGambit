import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Search, Loader2, BookOpen, Layers, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { QuizGambitQuestion } from "../../lib/ai/types";

// ─── Types ────────────────────────────────────────────────────────────

export interface LibraryTopic {
  id: string;
  name: string;
  mainCategory: string;
  questionCount: number;
  questions: QuizGambitQuestion[];
  tags: string[];
  createdAt: string;
  description?: string;
}

export interface LibraryTheme {
  name: string;
  topicCount: number;
  totalQuestions: number;
}

export interface LoadFromLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelectTopic: (name: string, questions: QuizGambitQuestion[], mainCategory: string) => void;
  onSelectTheme: (themeName: string) => void;
  filterUserId?: string;
}

type Tab = "topics" | "themes";

// ─── Component ────────────────────────────────────────────────────────

export default function LoadFromLibrary({
  open,
  onClose,
  onSelectTopic,
  onSelectTheme,
  filterUserId,
}: LoadFromLibraryProps) {
  const [tab, setTab] = useState<Tab>("topics");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [topics, setTopics] = useState<LibraryTopic[]>([]);
  const [error, setError] = useState("");

  // ── Fetch all topics from DB ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");

    let query = supabase
      .from("categories_library")
      .select("id, name, main_category, data, tags, description, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filterUserId) {
      query = query.eq("created_by", filterUserId);
    }

    query.then(({ data, error: err }) => {
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      const mapped: LibraryTopic[] = [];
      const seenNames = new Set<string>();
      for (const row of data || []) {
        const name = (row as any).name || "";
        if (seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        mapped.push({
          id: (row as any).id,
          name,
          mainCategory: (row as any).main_category || name,
          questionCount: Array.isArray((row as any).data) ? (row as any).data.length : 0,
          questions: Array.isArray((row as any).data) ? (row as any).data : [],
          tags: (row as any).tags || [],
          description: (row as any).description || "",
          createdAt: (row as any).created_at || "",
        });
      }
      setTopics(mapped);
    });
  }, [open, filterUserId]);

  // ── Close on Escape ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // ── Lock body scroll ────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // ── Filtered topics ─────────────────────────────────────────────────
  const filteredTopics = useMemo(() => {
    if (!search.trim()) return topics;
    const q = search.toLowerCase();
    return topics.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.mainCategory.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [topics, search]);

  // ── Grouped topics by mainCategory ──────────────────────────────────
  const groupedTopics = useMemo(() => {
    const groups = new Map<string, LibraryTopic[]>();
    for (const t of filteredTopics) {
      const key = t.mainCategory || "Uncategorized";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTopics]);

  // ── Unique themes ───────────────────────────────────────────────────
  const themes = useMemo(() => {
    const map = new Map<string, LibraryTheme>();
    for (const t of filteredTopics) {
      const key = t.mainCategory || "Uncategorized";
      if (!map.has(key)) {
        map.set(key, { name: key, topicCount: 0, totalQuestions: 0 });
      }
      const th = map.get(key)!;
      th.topicCount++;
      th.totalQuestions += t.questionCount;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredTopics]);

  // ── Handlers ────────────────────────────────────────────────────────
  const handleSelectTopic = useCallback(
    (t: LibraryTopic) => {
      onSelectTopic(t.name, t.questions, t.mainCategory);
      onClose();
    },
    [onSelectTopic, onClose],
  );

  const handleSelectTheme = useCallback(
    (themeName: string) => {
      onSelectTheme(themeName);
      onClose();
    },
    [onSelectTheme, onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop — solid clay overlay, no glass blur */}
      <div
        className="absolute inset-0 bg-plum/50 animate-clay-pop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card — pure clay style with 3D shadow */}
      <div
        className="relative w-full sm:max-w-lg max-h-[85vh] sm:max-h-[80vh]
          clay bg-warm-white rounded-t-[28px] sm:rounded-[28px]
          border border-clay-border/50
          animate-clay-pop overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Load from Library"
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-soft-purple/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-soft-purple" />
            </div>
            <div>
              <h3 className="font-outfit font-extrabold text-lg text-plum leading-tight">
                Load from Library
              </h3>
              <p className="text-[10px] text-plum/30 font-medium">
                Browse saved topics &amp; themes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center
              text-warm-gray/40 hover:text-plum hover:bg-warm-gray/5
              transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Search ────────────────────────────────────────────── */}
        <div className="px-6 pt-1 pb-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-plum/20" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search topics or themes..."
              className="w-full clay-input pl-10 pr-4 py-3 text-sm font-outfit font-bold text-plum
                placeholder:text-plum/20 rounded-2xl"
              autoComplete="off"
            />
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <div className="px-6 pb-4 flex-shrink-0">
          <div className="clay-pressed flex rounded-2xl p-1">
            <button
              onClick={() => setTab("topics")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all
                flex items-center justify-center gap-1.5 ${
                  tab === "topics"
                    ? "clay bg-warm-white text-plum"
                    : "text-plum/35 hover:text-plum/60"
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Topics
            </button>
            <button
              onClick={() => setTab("themes")}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all
                flex items-center justify-center gap-1.5 ${
                  tab === "themes"
                    ? "clay bg-warm-white text-plum"
                    : "text-plum/35 hover:text-plum/60"
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Themes
            </button>
          </div>
        </div>

        {/* ── Content (scrollable) ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-soft-purple" />
              <span className="ml-2.5 text-xs font-bold text-plum/25">
                Loading library...
              </span>
            </div>
          ) : error ? (
            <div className="clay p-6 text-center space-y-2">
              <p className="font-outfit font-bold text-sm text-peach">
                Failed to load library
              </p>
              <p className="text-[10px] text-plum/30">{error}</p>
              <button
                onClick={onClose}
                className="clay-btn px-4 py-1.5 text-[10px] font-bold text-plum/40
                  hover:text-plum transition-colors"
              >
                Close
              </button>
            </div>
          ) : tab === "topics" ? (
            /* ── Topics Tab ── */
            groupedTopics.length === 0 ? (
              <div className="clay p-8 text-center space-y-2">
                <span className="text-2xl">
                  {search ? "🔍" : "📭"}
                </span>
                <p className="font-outfit font-bold text-sm text-plum/30">
                  {search ? "No matching topics" : "No content in library yet"}
                </p>
                <p className="text-[10px] text-plum/20 font-medium">
                  {search
                    ? "Try a different search"
                    : "Generate and save some topics first — they'll appear here"}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {groupedTopics.map(([category, items]) => (
                  <div key={category}>
                    {/* Category header */}
                    <div className="flex items-center gap-2 mb-2.5 px-1">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-plum/35">
                        {category}
                      </h4>
                      <span className="clay-badge bg-warm-gray/5 text-warm-gray/50 text-[9px]">
                        {items.length}
                      </span>
                    </div>

                    {/* Topic cards — clay style */}
                    <div className="space-y-2">
                      {items.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleSelectTopic(t)}
                          className="w-full clay p-3.5 text-left
                            transition-all hover:-translate-y-0.5
                            hover:shadow-[2px_4px_12px_rgba(156,141,160,0.12)]"
                        >
                          <div className="flex items-center gap-3">
                            {/* Question count badge */}
                            <div className="w-10 h-10 rounded-xl bg-soft-purple-light/40
                              flex items-center justify-center flex-shrink-0">
                              <span className="font-outfit font-black text-xs text-soft-purple">
                                {t.questionCount}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="font-outfit font-bold text-sm text-plum truncate">
                                {t.name}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-soft-purple/60">
                                  {t.questionCount} question{t.questionCount !== 1 ? "s" : ""}
                                </span>
                                {t.description && (
                                  <>
                                    <span className="text-warm-gray/30 text-[10px]">·</span>
                                    <span className="text-[10px] text-warm-gray/40 truncate max-w-[120px]">
                                      {t.description}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Load indicator */}
                            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="clay-btn px-3 py-1.5 text-[10px] font-bold
                                bg-soft-purple text-white rounded-xl
                                hover:bg-soft-purple/90 transition-colors">
                                Load
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ── Themes Tab ── */
            themes.length === 0 ? (
              <div className="clay p-8 text-center space-y-2">
                <span className="text-2xl">
                  {search ? "🔍" : "📭"}
                </span>
                <p className="font-outfit font-bold text-sm text-plum/30">
                  {search ? "No matching themes" : "No themes in library yet"}
                </p>
                <p className="text-[10px] text-plum/20 font-medium">
                  Generate themed content to see themes here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {themes.map((th) => (
                  <button
                    key={th.name}
                    onClick={() => handleSelectTheme(th.name)}
                    className="w-full clay p-4 text-left
                      transition-all hover:-translate-y-0.5
                      hover:shadow-[2px_4px_12px_rgba(156,141,160,0.12)]"
                  >
                    <div className="flex items-center gap-3">
                      {/* Theme icon */}
                      <div className="w-11 h-11 rounded-xl bg-soft-purple/10
                        flex items-center justify-center flex-shrink-0">
                        <Layers className="w-5 h-5 text-soft-purple" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-outfit font-bold text-sm text-plum">
                          {th.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-sky">
                            {th.topicCount} topic{th.topicCount !== 1 ? "s" : ""}
                          </span>
                          <span className="text-warm-gray/30 text-[10px]">·</span>
                          <span className="text-[10px] font-bold text-mint">
                            {th.totalQuestions} question{th.totalQuestions !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>

                      {/* Load indicator */}
                      <div className="flex-shrink-0">
                        <span className="clay-btn px-4 py-2 text-[11px] font-bold
                          bg-soft-purple text-white rounded-xl
                          hover:bg-soft-purple/90 transition-colors">
                          Load
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
