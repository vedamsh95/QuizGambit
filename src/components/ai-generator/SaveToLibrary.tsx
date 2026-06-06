import { useState } from "react";
import clsx from "clsx";
import { Save, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { QuizGambitQuestion } from "../../lib/ai/types";

export interface TopicData {
  name: string;
  mainCategory: string;
  questions: QuizGambitQuestion[];
  tags: string[];
  description: string;
}

export interface SaveToLibraryProps {
  topics: TopicData[];
  onSaved?: () => void;
  className?: string;
}

export default function SaveToLibrary({
  topics,
  onSaved,
  className,
}: SaveToLibraryProps) {
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const handleSave = async () => {
    if (topics.length === 0) return;
    setSaving(true);
    setErrors([]);
    setSavedCount(0);

    let saved = 0;
    const errs: string[] = [];

    for (const topic of topics) {
      try {
        const { error } = await supabase.from("categories_library").insert([
          {
            name: topic.name,
            main_category: topic.mainCategory,
            description: topic.description || `AI Generated: ${topic.name}`,
            data: topic.questions,
            is_global: true,
            tags: topic.tags,
            created_by: (await supabase.auth.getUser()).data.user?.id,
          },
        ]);

        if (error) {
          errs.push(`${topic.name}: ${error.message}`);
        } else {
          saved++;
        }
      } catch (err: any) {
        errs.push(`${topic.name}: ${err.message}`);
      }
    }

    setSavedCount(saved);
    setErrors(errs);
    setSaving(false);
    if (saved > 0) onSaved?.();
  };

  if (topics.length === 0) return null;

  return (
    <div className={clsx("space-y-3", className)}>
      <button
        onClick={handleSave}
        disabled={saving}
        className="clay-btn w-full bg-soft-purple text-white font-outfit font-bold py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {saving ? "Saving..." : `Save ${topics.length} Topic${topics.length !== 1 ? "s" : ""} to Library`}
      </button>

      {/* Results */}
      {savedCount > 0 && !saving && (
        <p className="text-xs text-mint font-bold text-center">
          ✅ Saved {savedCount}/{topics.length} topic{savedCount !== 1 ? "s" : ""} to library
        </p>
      )}

      {errors.length > 0 && (
        <div className="space-y-0.5">
          {errors.map((err, i) => (
            <p key={i} className="text-[10px] text-peach font-medium">
              ❌ {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
