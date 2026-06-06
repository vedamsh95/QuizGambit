import clsx from "clsx";
import { Plus, X, Shuffle } from "lucide-react";

// ─── Curated topic list for random picker ───────────────────────────

const RANDOM_TOPICS = [
  "Physics", "Chemistry", "Biology", "World History", "Geography",
  "Astronomy", "Literature", "Art History", "Music Theory", "Mathematics",
  "Computer Science", "Philosophy", "Economics", "Psychology", "Mythology",
  "Oceanography", "Ancient Rome", "Renaissance", "Space Exploration", "Dinosaurs",
];

export interface TopicInputProps {
  topics: string[];
  onChange: (topics: string[]) => void;
  placeholder?: string;
  className?: string;
  /** Previously used topics for quick-select (max 8, most recent first) */
  recentTopics?: string[];
  /** Called when user clicks a recent topic chip — loads existing questions from DB */
  onSelectRecentTopic?: (topic: string) => void;
}

export default function TopicInput({
  topics,
  onChange,
  placeholder = "e.g. Science",
  className,
  recentTopics,
  onSelectRecentTopic,
}: TopicInputProps) {
  const handleChange = (index: number, value: string) => {
    const next = [...topics];
    next[index] = value;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(topics.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...topics, ""]);
  };

  const validTopics = topics.filter((t) => t.trim().length > 0);

  // Ensure at least one input row is always visible
  const displayTopics = topics.length === 0 ? [""] : topics;

  return (
    <div className={clsx("space-y-3", className)}>
      {/* Label + count */}
      <div className="flex items-center justify-between">
        <h4 className="font-outfit font-bold text-sm text-plum">Topics</h4>
        {validTopics.length > 0 && (
          <span className="clay-badge bg-soft-purple-light text-soft-purple text-[9px]">
            {validTopics.length} topic{validTopics.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Input rows */}
      <div className="space-y-2">
        {displayTopics.map((topic, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={topic}
              onChange={(e) => handleChange(i, e.target.value)}
              placeholder={i === 0 ? placeholder : `Topic ${i + 1}`}
              className="clay-input flex-1 font-outfit font-bold text-sm placeholder:text-plum/25"
              autoComplete="off"
            />
            {displayTopics.length > 1 && (
              <button
                onClick={() => handleRemove(i)}
                className="clay-btn p-2 text-plum/25 hover:text-peach transition-colors flex-shrink-0"
                title="Remove topic"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add button */}
      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          className="clay-btn flex-1 py-2.5 text-xs font-bold text-plum/40 hover:text-soft-purple transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add another topic
        </button>

        {/* Random picker */}
        <button
          onClick={() => {
            const unused = RANDOM_TOPICS.filter(
              (t) => !topics.some((existing) => existing.trim().toLowerCase() === t.toLowerCase())
            );
            const pick = unused.length > 0
              ? unused[Math.floor(Math.random() * unused.length)]
              : RANDOM_TOPICS[Math.floor(Math.random() * RANDOM_TOPICS.length)];
            const next = [...topics];
            const firstEmpty = next.findIndex((v) => !v.trim());
            if (firstEmpty >= 0) {
              next[firstEmpty] = pick;
            } else {
              next.push(pick);
            }
            onChange(next);
          }}
          className="clay-btn py-2.5 px-3 text-xs font-bold text-plum/30
            hover:text-soft-purple hover:bg-soft-purple-light/20 transition-colors
            flex items-center justify-center gap-1 rounded-xl"
          title="Surprise me — add a random topic"
        >
          <Shuffle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Recent Topics (compact chips) ─────────────────── */}
      {recentTopics && recentTopics.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold text-plum/25 uppercase tracking-wider flex-shrink-0">
            Your topics:
          </span>
          {recentTopics.slice(0, 6).map((t) => (
            <button
              key={t}
              onClick={() => {
                if (onSelectRecentTopic) {
                  onSelectRecentTopic(t);
                } else {
                  const next = [...topics];
                  const firstEmpty = next.findIndex((v) => !v.trim());
                  if (firstEmpty >= 0) {
                    next[firstEmpty] = t;
                  } else {
                    next.push(t);
                  }
                  onChange(next);
                }
              }}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold text-plum/40
                bg-warm-gray/5 border border-warm-gray/10
                hover:text-soft-purple hover:border-soft-purple/30 hover:bg-soft-purple-light/20
                transition-all"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Help text */}
      <p className="text-[10px] text-plum/30 font-medium">
        Each topic generates a full column of 5 questions for the 5×5 grid
      </p>
    </div>
  );
}
