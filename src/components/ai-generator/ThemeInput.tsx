import { useState, useCallback } from "react";
import { Sparkles, Loader2, RefreshCw, X, Plus, Pencil, Shuffle } from "lucide-react";
import type { ThemeSubtopic, TopicType, KnowledgeDomain, QuizStyle } from "../../lib/ai/types";
import GenerateButton from "./GenerateButton";

// ─── Curated theme list for random picker ───────────────────────────

const RANDOM_THEMES = [
  "Science", "History", "Movies", "Sports", "Music",
  "Space", "Nature", "Technology", "Literature", "Food",
  "Art", "Mythology", "Geography", "Animals", "Inventions",
  "Ancient Civilizations", "Pop Culture", "World War II", "Oceans", "Philosophy",
];

// ─── Metadata helpers ────────────────────────────────────────────────

const TYPE_META: Record<TopicType, { icon: string; label: string }> = {
  Core: { icon: "🎯", label: "Core" },
  Niche: { icon: "🔬", label: "Niche" },
  Human: { icon: "👤", label: "Human" },
  Surprise: { icon: "💡", label: "Surprise" },
  Scale: { icon: "🌌", label: "Scale" },
  Mystery: { icon: "❓", label: "Mystery" },
};

const DOMAIN_META: Record<KnowledgeDomain, { color: string }> = {
  Facts: { color: "text-sky" },
  Stories: { color: "text-soft-purple" },
  Concepts: { color: "text-mint" },
  Data: { color: "text-peach" },
  Connections: { color: "text-butter" },
};

const STYLE_META: Record<QuizStyle, { icon: string }> = {
  Classic: { icon: "📋" },
  Trick: { icon: "🎭" },
  Visual: { icon: "👁️" },
  Timeline: { icon: "⏳" },
};

// ─── Props ───────────────────────────────────────────────────────────

export interface ThemeInputProps {
  /** Current theme name */
  theme: string;
  /** Called when the theme name changes */
  onThemeChange: (theme: string) => void;
  /** Generated subtopics (empty array before generation) */
  subtopics: ThemeSubtopic[];
  /** Called when subtopics change (full replacement) */
  onSubtopicsChange: (subtopics: ThemeSubtopic[]) => void;
  /** Whether subtopics are currently being generated */
  isGenerating: boolean;
  /** Called when user clicks "Generate Subtopics" */
  onGenerate: () => void;
  /** Called when user clicks re-roll on a specific subtopic */
  onReroll: (index: number) => void;
  /** Whether a specific re-roll is in progress */
  rerollingIndex?: number;
  /** Whether the user is authenticated (disables generate if false) */
  disabled?: boolean;
  /** Previously used themes for quick-select (max 8, most recent first) */
  recentThemes?: string[];
  /** Whether subtopics are being appended (not first generation) */
  appending?: boolean;
  /** Called when user clicks "Append 5 More Subtopics" */
  onAppend?: () => void;
  /** Called when user clicks a recent theme chip — loads existing subtopics from DB */
  onSelectRecentTheme?: (theme: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────

export default function ThemeInput({
  theme,
  onThemeChange,
  subtopics,
  onSubtopicsChange,
  isGenerating,
  onGenerate,
  onReroll,
  rerollingIndex,
  disabled = false,
  recentThemes,
  appending = false,
  onAppend,
  onSelectRecentTheme,
}: ThemeInputProps) {
  const [isEditingTheme, setIsEditingTheme] = useState(false);
  const [editThemeValue, setEditThemeValue] = useState(theme);

  const hasSubtopics = subtopics.length > 0;

  // ── Remove a subtopic ──────────────────────────────────────────────
  const handleRemove = useCallback(
    (index: number) => {
      const updated = subtopics.filter((_, i) => i !== index);
      onSubtopicsChange(updated);
    },
    [subtopics, onSubtopicsChange],
  );

  // ── Add custom topic ────────────────────────────────────────────────
  const [customTopic, setCustomTopic] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleAddCustom = useCallback(() => {
    const trimmed = customTopic.trim();
    if (!trimmed) return;
    const custom: ThemeSubtopic = {
      name: trimmed,
      type: "Core",
      domain: "Facts",
      style: "Classic",
    };
    onSubtopicsChange([...subtopics, custom]);
    setCustomTopic("");
    setShowCustomInput(false);
  }, [customTopic, subtopics, onSubtopicsChange]);

  // ── Save theme rename ──────────────────────────────────────────────
  const handleSaveThemeRename = useCallback(() => {
    const trimmed = editThemeValue.trim();
    if (trimmed && trimmed !== theme) {
      onThemeChange(trimmed);
      // Reset subtopics since the theme changed
      onSubtopicsChange([]);
    }
    setIsEditingTheme(false);
  }, [editThemeValue, theme, onThemeChange, onSubtopicsChange]);

  // ── Recent themes chip row (reusable) ──────────────────────────────
  const recentChips = recentThemes && recentThemes.length > 0 && (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      <span className="text-[9px] font-bold text-plum/25 uppercase tracking-wider">
        Your themes:
      </span>
      {recentThemes.slice(0, 6).map((t) => (
        <button
          key={t}
          onClick={() => {
            if (onSelectRecentTheme) {
              onSelectRecentTheme(t);
            } else {
              onThemeChange(t);
            }
          }}
          disabled={isGenerating || appending || disabled}
          className="px-2.5 py-1 rounded-full text-[10px] font-bold text-plum/40
            bg-warm-gray/5 border border-warm-gray/10
            hover:text-soft-purple hover:border-soft-purple/30 hover:bg-soft-purple-light/20
            transition-all disabled:opacity-50"
        >
          {t}
        </button>
      ))}
    </div>
  );

  // ── Render: Before generation (theme input) ────────────────────────
  if (!hasSubtopics) {
    return (
      <div className="space-y-4">
        <label className="text-[10px] font-black uppercase tracking-wider text-plum/60">
          What theme should we build a game around?
        </label>

        <div className="flex gap-2">
          <input
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && theme.trim() && !isGenerating) {
                onGenerate();
              }
            }}
            placeholder='e.g. "Science", "Movies", "History"...'
            disabled={isGenerating || disabled}
            className="flex-1 clay-input px-4 py-3 text-sm font-outfit font-bold text-plum
              placeholder:text-warm-gray/30 rounded-xl bg-warm-white border border-warm-gray/20
              focus:border-soft-purple/50 focus:outline-none disabled:opacity-50"
          />

          {/* Random picker */}
          <button
            onClick={() => {
              const unused = RANDOM_THEMES.filter(
                (t) => t.toLowerCase() !== theme.toLowerCase()
              );
              const pick = unused.length > 0
                ? unused[Math.floor(Math.random() * unused.length)]
                : RANDOM_THEMES[Math.floor(Math.random() * RANDOM_THEMES.length)];
              onThemeChange(pick);
            }}
            disabled={isGenerating || disabled}
            className="clay-btn p-3 flex items-center justify-center text-plum/30
              hover:text-soft-purple hover:bg-soft-purple-light/20 transition-colors
              rounded-xl disabled:opacity-50"
            title="Surprise me — pick a random theme"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <GenerateButton
            onClick={onGenerate}
            loading={isGenerating}
            disabled={!theme.trim() || disabled}
            icon={<Sparkles className="w-4 h-4" />}
          >
            {isGenerating ? "Thinking..." : "Generate Subtopics"}
          </GenerateButton>
        </div>

        <p className="text-[10px] text-plum/30 font-medium text-center">
          AI will generate 5 creative subtopics for your 5×5 grid
        </p>

        {recentChips}
      </div>
    );
  }

  // ── Render: Subtopics exist ────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Theme header with edit */}
      <div className="flex items-center gap-2">
        {isEditingTheme ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={editThemeValue}
              onChange={(e) => setEditThemeValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveThemeRename();
                if (e.key === "Escape") setIsEditingTheme(false);
              }}
              className="clay-input px-3 py-1.5 text-sm font-outfit font-bold text-plum
                rounded-lg bg-warm-white border border-soft-purple/50 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleSaveThemeRename}
              className="text-[10px] font-bold text-soft-purple hover:text-soft-purple/80"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditingTheme(false)}
              className="text-[10px] font-bold text-plum/30 hover:text-plum/60"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <h3 className="font-outfit font-black text-sm text-plum">
              Theme: {theme}
            </h3>
            <button
              onClick={() => {
                setEditThemeValue(theme);
                setIsEditingTheme(true);
              }}
              className="p-1 text-plum/30 hover:text-soft-purple transition-colors"
              title="Change theme"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      <p className="text-[10px] font-medium text-plum/40">
        {subtopics.length} subtopic{subtopics.length !== 1 ? "s" : ""}. Review, edit, re-roll, or append more:
      </p>

      {/* Subtopics list */}
      <div className="space-y-2">
        {subtopics.map((sub, i) => {
          const typeMeta = TYPE_META[sub.type] || TYPE_META.Core;
          const domainColor = DOMAIN_META[sub.domain]?.color || "text-warm-gray/60";
          const styleIcon = STYLE_META[sub.style]?.icon || "📋";
          const isRerolling = rerollingIndex === i;

          return (
            <div
              key={`${sub.name}-${i}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-warm-white border border-warm-gray/15
                group hover:border-soft-purple/20 transition-all"
            >
              {/* Type icon */}
              <span className="text-lg flex-shrink-0" title={sub.type}>
                {typeMeta.icon}
              </span>

              {/* Name + metadata */}
              <div className="flex-1 min-w-0">
                <div className="font-outfit font-bold text-sm text-plum truncate">
                  {sub.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[9px] font-bold ${domainColor}`}>
                    {sub.domain}
                  </span>
                  <span className="text-[9px] text-warm-gray/40">·</span>
                  <span className="text-[9px] text-warm-gray/60">
                    {styleIcon} {sub.style}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Re-roll */}
                <button
                  onClick={() => onReroll(i)}
                  disabled={isRerolling || !!rerollingIndex}
                  className="p-1.5 rounded-lg text-plum/30 hover:text-soft-purple hover:bg-soft-purple-light/30
                    transition-colors disabled:opacity-50"
                  title="Re-roll this subtopic"
                >
                  {isRerolling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Remove */}
                <button
                  onClick={() => handleRemove(i)}
                  disabled={!!rerollingIndex}
                  className="p-1.5 rounded-lg text-plum/30 hover:text-peach hover:bg-peach-light/30
                    transition-colors disabled:opacity-50"
                  title="Remove this subtopic"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Append More + Add custom + Recent themes */}
      <div className="pt-2 space-y-3">
        {/* Append 5 More button */}
        <div className="flex gap-2">
          <GenerateButton
            onClick={() => onAppend?.()}
            loading={appending || isGenerating}
            disabled={!theme.trim() || !!rerollingIndex || disabled || !onAppend}
            fullWidth
            icon={<Sparkles className="w-3.5 h-3.5" />}
            className="!bg-soft-purple/10 !text-soft-purple !font-bold !text-xs hover:!bg-soft-purple/20"
          >
            {appending || isGenerating ? "Appending..." : "Append 5 More Subtopics"}
          </GenerateButton>
        </div>

        {/* Add custom topic */}
        <div>
          {showCustomInput ? (
            <div className="flex gap-2">
              <input
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCustom();
                  if (e.key === "Escape") setShowCustomInput(false);
                }}
                placeholder="Custom topic name..."
                className="flex-1 clay-input px-3 py-2 text-xs font-outfit font-bold text-plum
                  rounded-lg bg-warm-white border border-warm-gray/20 focus:border-soft-purple/50
                  focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleAddCustom}
                disabled={!customTopic.trim()}
                className="clay-btn px-3 py-2 text-xs font-bold text-soft-purple
                  hover:bg-soft-purple-light/30 rounded-lg transition-colors disabled:opacity-30"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomInput(true)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-plum/30
                hover:text-soft-purple transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add custom topic
            </button>
          )}
        </div>

        {/* Recent Themes chips */}
        {recentChips}
      </div>
    </div>
  );
}
