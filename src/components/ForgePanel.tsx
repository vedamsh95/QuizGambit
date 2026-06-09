/**
 * ForgePanel — Content Forge GUI for the Admin Dashboard.
 *
 * Replicates ALL Forge CLI functionality:
 *   • Theme browser with topic/question counts
 *   • Topic list with mode, fill status, lens info
 *   • Pick → detail → generate brief flow
 *   • 4D Loadout table (lens × form × backdoor × persona)
 *   • Dimension gaps (underused lenses/forms/backdoors)
 *   • Stats overview
 *   • Create / Rename / Delete topics
 *   • Brief generation with copy-to-clipboard
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { generateAdminQuizQuestions } from "../lib/ai";
import { store } from "../lib/storage";
import { reviewQuestions, type ReviewReport } from "../lib/forgeReview";
import type { LensType, FormType, BackdoorType, PlayerPersona, GameMode } from "../lib/ai/types";
import { ProviderConfig } from "./ai-generator";
import type { AIProvider } from "./ai-generator";
import {
  Sparkles, Hammer, Layers, AlertTriangle, Copy, Check, Plus, Trash2,
  Edit2, X, Search, RefreshCw, Target,
  BookOpen, BarChart3, Filter, Zap, RotateCcw, Users, ChevronDown, Loader2, Send, ClipboardCheck,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface DBRow {
  id: string; name: string; main_category: string; description: string;
  data: any[]; tags: string[]; is_global: boolean;
  lens_mode: "diverse" | "focused"; target_lens?: string;
}

interface ThemeStat {
  topics: number; questions: number; diverse: number; focused: number;
}

interface TopicCard {
  id: string; name: string; theme: string; mode: "diverse" | "focused";
  targetLens?: string; questionCount: number; maxQuestions: number;
  fullness: number; status: "FULL" | "FILL" | "EMPTY";
  lenses: Record<string, number>; forms: Record<string, number>; backdoors: Record<string, number>;
}

interface LoadoutRow {
  lens: string; form: string; backdoor: string; persona: string;
  score: number;
}

interface AllStats {
  totalQuestions: number; totalCategories: number; themes: Set<string>;
  diverseCount: number; focusedCount: number;
  fullTopics: number; fillableTopics: number; emptyTopics: number;
  lensCount: Record<string, number>; formCount: Record<string, number>;
  bdCount: Record<string, number>;
}

// ─── Constants ──────────────────────────────────────────────────────

const MAX_FOCUSED = 30;
const MAX_DIVERSE = 30;

const ALL_LENSES = [
  "Origin Story", "The Unexpected", "The Human Element", "Numbers & Scale",
  "The Rivalry", "The Oddity", "Behind the Scenes", "The Connection",
  "What If?", "The Legacy", "The Butterfly Effect", "The Evolution", "The Cultural Impact",
];

const ALL_FORMS = [
  "Form 1 (Action-First)", "Form 2 (Parenthetical Hook)", "Form 3 (Sensory Clue)",
  "Form 4 (Active Quote)", "Form 5 (Direct Narrative)", "Form 6 (The Contradiction)",
  "Form 7 (The Question Lead)", "Form 8 (The Timeline)", "Form 9 (The Misdirection)",
  "Form 10 (Defining Trait)",
];

const ALL_BACKDOORS = [
  "Synonym Bridge", "Contrast Pop", "Everyday Link", "Anagram-Wordplay",
  "Sequence Pattern", "Sensory Logic", "Category Elimination",
  "Etymology / Name Logic", "Functional Logic", "Pop Culture Hook",
];

const ALL_PERSONAS = ["Casual Explorer", "Competitive Duelist", "Party Group", "Speed Runner", "Deep Learner"];

// ─── Quality scores (mirrors smart_matcher.ts registries) ──────────

const FORM_QUALITY: Record<string, { quality: number; readability: number; variety: number }> = {
  "Form 1 (Action-First)": { quality: 8, readability: 9, variety: 7 },
  "Form 2 (Parenthetical Hook)": { quality: 9, readability: 8, variety: 8 },
  "Form 3 (Sensory Clue)": { quality: 8, readability: 9, variety: 6 },
  "Form 4 (Active Quote)": { quality: 9, readability: 8, variety: 7 },
  "Form 5 (Direct Narrative)": { quality: 8, readability: 10, variety: 9 },
  "Form 6 (The Contradiction)": { quality: 9, readability: 7, variety: 8 },
  "Form 7 (The Question Lead)": { quality: 7, readability: 9, variety: 7 },
  "Form 8 (The Timeline)": { quality: 8, readability: 8, variety: 8 },
  "Form 9 (The Misdirection)": { quality: 8, readability: 7, variety: 6 },
  "Form 10 (Defining Trait)": { quality: 7, readability: 8, variety: 6 },
};

const BACKDOOR_QUALITY: Record<string, { quality: number; fun: number; answerability: number }> = {
  "Synonym Bridge": { quality: 8, fun: 7, answerability: 8 },
  "Contrast Pop": { quality: 9, fun: 9, answerability: 7 },
  "Everyday Link": { quality: 8, fun: 8, answerability: 10 },
  "Anagram-Wordplay": { quality: 6, fun: 9, answerability: 4 },
  "Sequence Pattern": { quality: 8, fun: 7, answerability: 7 },
  "Sensory Logic": { quality: 8, fun: 8, answerability: 7 },
  "Category Elimination": { quality: 7, fun: 6, answerability: 9 },
  "Etymology / Name Logic": { quality: 8, fun: 8, answerability: 6 },
  "Functional Logic": { quality: 9, fun: 8, answerability: 7 },
  "Pop Culture Hook": { quality: 7, fun: 10, answerability: 8 },
};

// ─── Real persona quality scores (mirrors smart_matcher.ts PERSONA_REGISTRY) ──

const PERSONA_QUALITY: Record<string, { quality: number; fun: number; answerability: number }> = {
  "Casual Explorer": { quality: 8, fun: 8, answerability: 10 },
  "Competitive Duelist": { quality: 8, fun: 7, answerability: 5 },
  "Party Group": { quality: 9, fun: 10, answerability: 8 },
  "Speed Runner": { quality: 7, fun: 7, answerability: 6 },
  "Deep Learner": { quality: 9, fun: 7, answerability: 4 },
};

// ─── Simple loadout scoring (mirrors smart_matcher) ─────────────────

const LENS_SCORES: Record<string, { fun: number; addictive: number; answerable: number; domains: string[] }> = {
  "Origin Story": { fun: 7, addictive: 7, answerable: 8, domains: ["history", "brands", "food", "inventions", "business"] },
  "The Unexpected": { fun: 9, addictive: 9, answerable: 7, domains: ["science", "nature", "geography", "medicine", "space"] },
  "The Human Element": { fun: 8, addictive: 8, answerable: 9, domains: ["history", "sports", "art", "music", "literature"] },
  "Numbers & Scale": { fun: 7, addictive: 6, answerable: 6, domains: ["space", "astronomy", "economics", "geography", "tech"] },
  "The Rivalry": { fun: 9, addictive: 8, answerable: 8, domains: ["sports", "business", "politics", "tech", "art"] },
  "The Oddity": { fun: 10, addictive: 9, answerable: 7, domains: ["nature", "animals", "history", "law", "culture"] },
  "Behind the Scenes": { fun: 8, addictive: 8, answerable: 7, domains: ["movies", "music", "video games", "politics", "theater"] },
  "The Connection": { fun: 9, addictive: 9, answerable: 6, domains: ["science", "history", "language", "pop culture"] },
  "What If?": { fun: 8, addictive: 7, answerable: 5, domains: ["history", "geopolitics", "science", "sports"] },
  "The Legacy": { fun: 6, addictive: 6, answerable: 9, domains: ["history", "biography", "tech", "literature"] },
  "The Butterfly Effect": { fun: 9, addictive: 10, answerable: 7, domains: ["history", "politics", "science", "everyday life"] },
  "The Evolution": { fun: 7, addictive: 7, answerable: 8, domains: ["biology", "tech", "fashion", "language", "architecture"] },
  "The Cultural Impact": { fun: 8, addictive: 7, answerable: 9, domains: ["pop culture", "internet", "music", "food", "media"] },
};

function scoreLoadouts(domain: string, limit = 8): LoadoutRow[] {
  const dom = domain.toLowerCase().trim();
  const results: LoadoutRow[] = [];

  for (const lens of ALL_LENSES) {
    const ls = LENS_SCORES[lens] || { fun: 5, addictive: 5, answerable: 5, domains: [] };
    const lensBase = ls.fun * 0.30 + ls.addictive * 0.15 + ls.answerable * 0.20;
    const domainBonus = ls.domains.some(d => dom.includes(d) || d.includes(dom)) ? 2.5 : 0;

    for (const form of ALL_FORMS) {
      const fq = FORM_QUALITY[form] || { quality: 7, readability: 8, variety: 7 };
      const formBase = fq.quality * 0.35 + fq.readability * 0.10 + fq.variety * 0.075;

      for (const backdoor of ALL_BACKDOORS) {
        const bq = BACKDOOR_QUALITY[backdoor] || { quality: 7, fun: 7, answerability: 7 };
        const bdBase = bq.quality * 0.25 + bq.fun * 0.15 + bq.answerability * 0.15;

        for (const persona of ALL_PERSONAS) {
          const pq = PERSONA_QUALITY[persona] || { quality: 7, fun: 7, answerability: 7 };
          const personaBonus = pq.quality * 0.4 + pq.fun * 0.3 + pq.answerability * 0.2;

          let score = lensBase + formBase + bdBase + personaBonus + domainBonus;

          results.push({ lens, form, backdoor, persona, score: Math.round(score * 100) / 100 });
        }
      }
    }
  }

  // Sort by score, then deduplicate lens + form + backdoor —
  // each row gets a unique combo of these 3 (persona can repeat)
  const sorted = results.sort((a, b) => b.score - a.score);
  const seenLenses = new Set<string>();
  const seenForms = new Set<string>();
  const seenBackdoors = new Set<string>();
  const diverse: LoadoutRow[] = [];
  for (const row of sorted) {
    if (
      !seenLenses.has(row.lens) &&
      !seenForms.has(row.form) &&
      !seenBackdoors.has(row.backdoor)
    ) {
      seenLenses.add(row.lens);
      seenForms.add(row.form);
      seenBackdoors.add(row.backdoor);
      diverse.push(row);
      if (diverse.length >= limit) break;
    }
  }
  return diverse;
}

// ─── Component ──────────────────────────────────────────────────────

export default function ForgePanel({ onDataChange }: { onDataChange?: () => void }) {
  // Data
  const [allRows, setAllRows] = useState<DBRow[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<TopicCard | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [briefText, setBriefText] = useState("");
  const [briefCopied, setBriefCopied] = useState(false);


  // CRUD modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", theme: "General", mode: "diverse" as "diverse" | "focused", lens: "" });
  const [showCreateTheme, setShowCreateTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<TopicCard | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showRenameModal, setShowRenameModal] = useState<TopicCard | null>(null);
  const [renameTo, setRenameTo] = useState("");

  // AI provider config
  const [forgeProvider, setForgeProvider] = useState<AIProvider>(
    () => (store.getAiProvider() as AIProvider) || "gemini",
  );
  const [forgeApiKey, setForgeApiKey] = useState(() => {
    const keys = store.getAiKeys();
    return keys[store.getAiProvider()] || "";
  });
  const [forgeModel, setForgeModel] = useState(() => {
    const p = store.getAiProvider();
    if (p === "gemini") return "gemini-2.0-flash";
    if (p === "openai") return "gpt-4o";
    return "llama3-70b-8192";
  });
  const [forgeConfigCollapsed, setForgeConfigCollapsed] = useState(true);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");
  const [genError, setGenError] = useState("");

  // Review state
  const [reviewReport, setReviewReport] = useState<ReviewReport | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // ─── Fetch data ──────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("categories_library")
      .select("id, name, main_category, description, data, tags, is_global, lens_mode, target_lens");
    setAllRows((data || []) as unknown as DBRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Computed stats ──────────────────────────────────────────────

  const stats = useMemo((): AllStats & { personaCount: Record<string, number> } => {
    const allQs = allRows.flatMap(r => r.data || []);
    const lensCount: Record<string, number> = {};
    const formCount: Record<string, number> = {};
    const bdCount: Record<string, number> = {};
    const personaCount: Record<string, number> = {};
    allQs.forEach((q: any) => {
      if (q.lens) lensCount[q.lens] = (lensCount[q.lens] || 0) + 1;
      if (q.form) formCount[q.form] = (formCount[q.form] || 0) + 1;
      if (q.backdoor_type) bdCount[q.backdoor_type] = (bdCount[q.backdoor_type] || 0) + 1;
      if (q.persona) personaCount[q.persona] = (personaCount[q.persona] || 0) + 1;
    });

    const diverseCount = allRows.filter(r => r.lens_mode !== "focused").length;
    const focusedCount = allRows.filter(r => r.lens_mode === "focused").length;
    const fullTopics = allRows.filter(r => (r.data || []).length >= (r.lens_mode === "focused" ? MAX_FOCUSED : MAX_DIVERSE)).length;
    const emptyTopics = allRows.filter(r => (r.data || []).length === 0).length;

    return {
      totalQuestions: allQs.length,
      totalCategories: allRows.length,
      themes: new Set(allRows.map(r => r.main_category)),
      diverseCount, focusedCount,
      fullTopics, fillableTopics: allRows.length - fullTopics - emptyTopics, emptyTopics,
      lensCount, formCount, bdCount, personaCount,
    };
  }, [allRows]);

  // ─── Theme list ──────────────────────────────────────────────────

  const themes = useMemo(() => {
    const map: Record<string, ThemeStat> = {};
    for (const row of allRows) {
      const t = row.main_category || "Uncategorized";
      if (!map[t]) map[t] = { topics: 0, questions: 0, diverse: 0, focused: 0 };
      map[t].topics++;
      map[t].questions += (row.data || []).length;
      if (row.lens_mode === "focused") map[t].focused++;
      else map[t].diverse++;
    }
    return Object.entries(map).sort(([, a], [, b]) => b.topics - a.topics);
  }, [allRows]);

  // ─── Topic cards ─────────────────────────────────────────────────

  const topicCards = useMemo((): TopicCard[] => {
    let rows = allRows;
    if (selectedTheme) rows = rows.filter(r => r.main_category === selectedTheme);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.main_category.toLowerCase().includes(q));
    }
    return rows.map(r => {
      const data = r.data || [];
      const maxQ = r.lens_mode === "focused" ? MAX_FOCUSED : MAX_DIVERSE;
      const qCount = data.length;
      const lenses: Record<string, number> = {};
      const forms: Record<string, number> = {};
      const bds: Record<string, number> = {};
      data.forEach((d: any) => {
        if (d.lens) lenses[d.lens] = (lenses[d.lens] || 0) + 1;
        if (d.form) forms[d.form] = (forms[d.form] || 0) + 1;
        if (d.backdoor_type) bds[d.backdoor_type] = (bds[d.backdoor_type] || 0) + 1;
      });
      return {
        id: r.id, name: r.name, theme: r.main_category,
        mode: (r.lens_mode as "diverse" | "focused") || "diverse",
        targetLens: r.target_lens,
        questionCount: qCount, maxQuestions: maxQ,
        fullness: qCount / maxQ,
        status: qCount >= maxQ ? "FULL" : qCount > 0 ? "FILL" : "EMPTY",
        lenses, forms, backdoors: bds,
      };
    });
  }, [allRows, selectedTheme, searchQuery]);

  // ─── Loadout table ───────────────────────────────────────────────

  const loadouts = useMemo(() => {
    const domain = selectedTopic?.theme || selectedTheme || "general";
    return scoreLoadouts(domain, 8);
  }, [selectedTopic, selectedTheme]);

  // ─── Dimension gaps ──────────────────────────────────────────────

  const dimensionGaps = useMemo(() => {
    const underLenses = ALL_LENSES.filter(l => (stats.lensCount[l] || 0) < 3);
    const underForms = ALL_FORMS.filter(f => (stats.formCount[f] || 0) < 3);
    const underBds = ALL_BACKDOORS.filter(b => (stats.bdCount[b] || 0) < 3);
    return { lenses: underLenses, forms: underForms, backdoors: underBds };
  }, [stats]);

  // ─── Generate brief ──────────────────────────────────────────────

  const generateBrief = useCallback(() => {
    if (!selectedTopic) return;
    const topic = selectedTopic;

    const topLoadout = loadouts[0];
    const domain = topic.theme;
    const themeInfo = themes.find(([t]) => t === domain);

    let brief = `# FORGE BRIEF — ${topic.name}\n\n`;
    brief += `> Generated: ${new Date().toISOString()}\n\n`;
    brief += `---\n\n`;
    brief += `## 📋 Topic: **${topic.name}**\n\n`;
    brief += `- **Theme:** ${domain}\n`;
    brief += `- **Mode:** ${topic.mode.toUpperCase()}${topic.targetLens ? ` → ${topic.targetLens}` : ""}\n`;
    brief += `- **Questions:** ${topic.questionCount}/${topic.maxQuestions}\n`;
    brief += `- **Status:** ${topic.status}\n`;
    if (themeInfo) {
      brief += `- **Theme stats:** ${themeInfo[1].topics} topics, ${themeInfo[1].questions} questions\n`;
    }

    brief += `\n### 🎯 Recommended Loadout\n\n`;
    if (topLoadout) {
      brief += `| # | Lens | Form | Backdoor | Persona | Score |\n`;
      brief += `|---|------|------|----------|---------|-------|\n`;
      loadouts.forEach((l, i) => {
        brief += `| ${i + 1} | ${l.lens} | ${l.form} | ${l.backdoor} | ${l.persona} | ${l.score.toFixed(1)} |\n`;
      });
    }

    brief += `\n### 📊 Database Context\n\n`;
    brief += `- Total: ${stats.totalQuestions} questions across ${stats.totalCategories} categories\n`;
    brief += `- ${stats.diverseCount} diverse + ${stats.focusedCount} focused topics\n`;
    brief += `- Lens types used: ${Object.keys(stats.lensCount).length}/13\n`;
    brief += `- Form types used: ${Object.keys(stats.formCount).length}/10\n`;
    brief += `- Backdoor types used: ${Object.keys(stats.bdCount).length}/10\n`;
    if (Object.keys(stats.personaCount).length > 0) {
      brief += `- Persona types used: ${Object.keys(stats.personaCount).length}/5\n`;
    }

    if (dimensionGaps.lenses.length > 0) {
      brief += `\n### ⚡ Underutilized Lenses\n\n${dimensionGaps.lenses.map(l => `- ${l}`).join("\n")}\n`;
    }

    brief += `\n### 📝 Generation Instructions\n\n`;
    const remaining = topic.maxQuestions - topic.questionCount;
    if (remaining > 0) {
      brief += `Generate **${remaining} questions** for "${topic.name}".\n`;
      if (topic.mode === "focused" && topic.targetLens) {
        brief += `All questions must use the **${topic.targetLens}** lens.\n`;
      }
      brief += `Vary forms and backdoors across all available options.\n`;
      brief += `Target: easy/medium/challenging/expert mix.\n`;
    } else {
      brief += `⚠️ This topic is FULL. Create a new sibling topic with a different lens.\n`;
    }

    brief += `\n---\n\n` +
      `Paste this brief into Codebuff chat to generate questions.\n` +
      `Then import: npx tsx scripts/forge/2_import_batch.ts scripts/forge/batches/batch_XXX.ts\n`;

    setBriefText(brief);
  }, [loadouts, themes, stats, dimensionGaps]);

  useEffect(() => {
    if (selectedTopic) generateBrief();
  }, [selectedTopic, generateBrief]);

  const refreshAll = () => { fetchData(); onDataChange?.(); };

  // Track mount state for aborting in-flight generations
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ─── CRUD handlers ───────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    const tags = ["Grid", createForm.theme, createForm.name];
    if (createForm.mode === "focused" && createForm.lens) {
      tags.push(`Lens:${createForm.lens}`, "Mode:Focused");
    } else {
      tags.push("Mode:Diverse");
    }
    const { error } = await supabase.from("categories_library").insert({
      name: createForm.name,
      main_category: createForm.theme,
      description: `${createForm.mode} topic — ${createForm.theme}`,
      data: [], tags, is_global: true,
      lens_mode: createForm.mode,
      target_lens: createForm.lens || null,
    } as any);
    if (error) { alert("Create failed: " + error.message); return; }
    setShowCreateModal(false);
    setCreateForm({ name: "", theme: "General", mode: "diverse", lens: "" });
    setSelectedTopic(null);
    refreshAll();
  };

  const handleCreateTheme = async () => {
    if (!newThemeName.trim()) return;
    // Case-insensitive duplicate check
    const lower = newThemeName.trim().toLowerCase();
    const existing = allRows.some(r => r.main_category.toLowerCase() === lower);
    if (existing) { alert(`Theme "${newThemeName}" already exists.`); return; }
    const { error } = await supabase.from("categories_library").insert({
      name: `${newThemeName} (Placeholder)`,
      main_category: newThemeName,
      description: `Auto-created theme: ${newThemeName}`,
      data: [], tags: ["Grid", newThemeName, "Theme:Placeholder"],
      is_global: true, lens_mode: "diverse", target_lens: null,
    } as any);
    if (error) { alert("Create theme failed: " + error.message); return; }
    setShowCreateTheme(false);
    setNewThemeName("");
    refreshAll();
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) return;
    // Safety: require typing name for non-empty topics
    if (showDeleteConfirm.questionCount > 0 && deleteConfirmText !== showDeleteConfirm.name) {
      alert(`Type "${showDeleteConfirm.name}" to confirm deletion.`);
      return;
    }
    const { error } = await supabase.from("categories_library").delete().eq("id", showDeleteConfirm.id);
    if (error) { alert("Delete failed: " + error.message); return; }
    setShowDeleteConfirm(null);
    setDeleteConfirmText("");
    setSelectedTopic(null);
    refreshAll();
  };

  const handleRename = async () => {
    if (!showRenameModal || !renameTo.trim()) return;
    const old = showRenameModal;
    // Conflict check: new name must not already exist (case-insensitive)
    const conflict = allRows.find(r => r.name.toLowerCase() === renameTo.trim().toLowerCase() && r.id !== old.id);
    if (conflict) { alert(`"${renameTo}" already exists. Choose a different name.`); return; }
    const updatedTags = (allRows.find(r => r.id === old.id)?.tags || []).map(t => t === old.name ? renameTo : t);
    const { error } = await supabase.from("categories_library")
      .update({ name: renameTo, tags: updatedTags }).eq("id", old.id);
    if (error) { alert("Rename failed: " + error.message); return; }
    setShowRenameModal(null);
    setRenameTo("");
    setSelectedTopic(null);
    refreshAll();
  };

  const copyBrief = () => {
    navigator.clipboard.writeText(briefText);
    setBriefCopied(true);
    setTimeout(() => setBriefCopied(false), 2000);
  };

  // ─── Review ──────────────────────────────────────────────────

  const handleReview = useCallback(() => {
    if (!selectedTopic) return;
    setReviewing(true);
    const dbRow = allRows.find(r => r.id === selectedTopic.id);
    const questions = dbRow?.data || [];
    // reviewQuestions handles empty arrays natively
    const report = reviewQuestions(questions);
    setReviewReport(report);
    setReviewing(false);
  }, [selectedTopic, allRows]);

  // Clear review report when switching topics
  useEffect(() => {
    setReviewReport(null);
  }, [selectedTopic?.id]);

  // ─── One-Click Generation ─────────────────────────────────────

  const handleGenerateQuestions = async () => {
    if (!selectedTopic) return;
    if (generating) return;

    const topic = selectedTopic;
    const remaining = topic.maxQuestions - topic.questionCount;
    if (remaining <= 0) { alert("Topic is already full!"); return; }

    if (!forgeApiKey) {
      alert("No API key configured. Expand the AI Configuration section above to set your key.");
      return;
    }

    // Determine lenses: if focused with target lens, use only that lens
    const selectedLenses: LensType[] = topic.targetLens ? [topic.targetLens as LensType] : ALL_LENSES as LensType[];

    // Use the top loadout recommendations for persona
    const topPersona: PlayerPersona = (loadouts[0]?.persona || "Casual Explorer") as PlayerPersona;

    setGenerating(true);
    setGenError("");
    setGenProgress(`Generating ${remaining} questions for "${topic.name}"...`);

    try {
      const result = await generateAdminQuizQuestions({
        topics: [topic.name],
        questionCount: remaining,
        persona: topPersona,
        personas: ALL_PERSONAS as PlayerPersona[],
        mode: "STANDARD" as GameMode,
        provider: forgeProvider,
        apiKey: forgeApiKey,
        model: forgeModel,
        selectedLenses,
        selectedForms: ALL_FORMS as FormType[],
        selectedBackdoors: ALL_BACKDOORS as BackdoorType[],
      });

      if (!mountedRef.current) return;

      if (!result.questions || result.questions.length === 0) {
        throw new Error("No questions generated — the AI returned empty results.");
      }

      setGenProgress(`Writing ${result.questions.length} questions to database...`);

      // Get existing questions for this topic
      const dbRow = allRows.find(r => r.id === topic.id);
      const existingData = dbRow?.data || [];
      const updatedData = [...existingData, ...result.questions];

      const { error } = await supabase
        .from("categories_library")
        .update({ data: updatedData })
        .eq("id", topic.id);

      if (error) throw new Error(`DB write failed: ${error.message}`);
      if (!mountedRef.current) return;

      setGenProgress("");
      setGenerating(false);
      await refreshAll();

      // Auto-review after generation
      if (mountedRef.current && updatedData.length > 0) {
        const report = reviewQuestions(updatedData);
        setReviewReport(report);
      }

      console.log(`[Forge] Generated ${result.questions.length} questions in ${result.total_api_calls} API calls`);
      if (result.regenerations > 0) console.log(`[Forge]  ${result.regenerations} regenerations`);
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.error("[Forge] Generation failed:", err);
      setGenProgress("");
      setGenError(err.message || "Unknown error");
      setGenerating(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────

  const statusColors = { FULL: "text-mint bg-mint/10", FILL: "text-butter bg-butter/10", EMPTY: "text-plum/30 bg-plum/5" };

  return (
    <div className="space-y-6">
      {/* ── Stats Bar ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "Questions", value: stats.totalQuestions, icon: <BarChart3 className="w-4 h-4" />, color: "bg-soft-purple/10 border-soft-purple/20" },
          { label: "Topics", value: stats.totalCategories, icon: <Layers className="w-4 h-4" />, color: "bg-mint/10 border-mint/20" },
          { label: "Themes", value: stats.themes.size, icon: <Filter className="w-4 h-4" />, color: "bg-sky/10 border-sky/20" },
          { label: "Full", value: stats.fullTopics, icon: <Check className="w-4 h-4" />, color: "bg-mint/10 border-mint/20" },
          { label: "Fillable", value: stats.fillableTopics, icon: <Edit2 className="w-4 h-4" />, color: "bg-butter/10 border-butter/20" },
          { label: "Lenses", value: `${Object.keys(stats.lensCount).length}/13`, icon: <Target className="w-4 h-4" />, color: "bg-soft-purple/10 border-soft-purple/20" },
          { label: "Backdoors", value: `${Object.keys(stats.bdCount).length}/10`, icon: <Target className="w-4 h-4" />, color: "bg-sky/10 border-sky/20" },
          { label: "Personas", value: `${Object.keys(stats.personaCount).length}/5`, icon: <Users className="w-4 h-4" />, color: "bg-butter/10 border-butter/20" },
        ].map((s, i) => (
          <div key={i} className={`clay p-3 border ${s.color} space-y-1`}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-plum/30 uppercase tracking-wider">{s.label}</span>
              <span className="text-plum/20">{s.icon}</span>
            </div>
            <div className="text-lg font-outfit font-black text-plum">{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Main Layout ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT: Browser ──────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Theme pills */}
          <div className="clay p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-outfit font-bold text-xs text-plum/60 uppercase tracking-wider flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" /> Themes ({themes.length})
              </h3>
              <div className="flex items-center gap-1.5">
                <button onClick={() => { setShowCreateTheme(true); setNewThemeName(""); }} className="text-[9px] font-bold text-plum/30 hover:text-soft-purple px-2 py-0.5 rounded transition-colors">
                  <Plus className="w-3 h-3 inline mr-0.5" /> New
                </button>
                <button onClick={() => setSelectedTheme(null)} className={`text-[9px] font-bold px-2 py-0.5 rounded transition-colors ${!selectedTheme ? "bg-soft-purple/10 text-soft-purple" : "text-plum/30 hover:text-plum"}`}>
                  All
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {themes.map(([theme, stat]) => (
                <button
                  key={theme}
                  onClick={() => setSelectedTheme(selectedTheme === theme ? null : theme)}
                  className={`text-[9px] font-bold px-2.5 py-1 rounded-full transition-all whitespace-nowrap ${selectedTheme === theme ? "bg-soft-purple text-white" : "bg-plum/5 text-plum/50 hover:bg-plum/10 hover:text-plum"}`}
                >
                  {theme} <span className="opacity-60 ml-0.5">{stat.topics}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-plum/20" />
              <input
                type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search topics..."
                className="w-full pl-8 pr-4 py-2 text-xs bg-plum/[0.03] border border-plum/10 rounded-xl focus:border-soft-purple/30 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Topic list */}
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {topicCards.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <span className="text-2xl">📭</span>
                <p className="text-xs font-bold text-plum/30">No topics found</p>
              </div>
            )}
            {topicCards.map(topic => (
              <div
                key={topic.id}
                onClick={() => setSelectedTopic(selectedTopic?.id === topic.id ? null : topic)}
                className={`clay p-3 cursor-pointer transition-all border ${selectedTopic?.id === topic.id ? "border-soft-purple/30 bg-soft-purple/[0.03]" : "border-plum/5 bg-white/50 hover:-translate-y-0.5"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-outfit font-bold text-xs text-plum truncate">{topic.name}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${statusColors[topic.status]}`}>
                        {topic.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-plum/30">{topic.theme}</span>
                      <span className="text-[9px] text-plum/20">·</span>
                      <span className={`text-[9px] font-bold ${topic.mode === "focused" ? "text-soft-purple" : "text-mint"}`}>
                        {topic.mode}
                      </span>
                      {topic.targetLens && (
                        <span className="text-[8px] bg-soft-purple/10 text-soft-purple px-1 rounded">{topic.targetLens}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-outfit font-black text-plum">{topic.questionCount}</span>
                    <span className="text-[9px] text-plum/30">/{topic.maxQuestions}</span>
                    <div className="w-full bg-plum/5 rounded-full h-1 mt-1">
                      <div className={`h-1 rounded-full transition-all ${topic.fullness >= 1 ? "bg-mint" : topic.fullness >= 0.5 ? "bg-butter" : "bg-soft-purple"}`}
                        style={{ width: `${Math.min(topic.fullness * 100, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={() => setShowCreateModal(true)} className="flex-1 clay-btn py-2.5 text-xs font-bold text-mint/70 hover:text-mint hover:bg-mint/5 flex items-center justify-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Topic
            </button>
            <button onClick={fetchData} disabled={loading} className="clay-btn p-2.5 text-plum/30 hover:text-plum transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── RIGHT: Analysis ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Provider Config (collapsible) */}
          <ProviderConfig
            provider={forgeProvider}
            onProviderChange={setForgeProvider}
            apiKey={forgeApiKey}
            onApiKeyChange={setForgeApiKey}
            model={forgeModel}
            onModelChange={setForgeModel}
            collapsed={forgeConfigCollapsed}
            onToggleCollapse={() => setForgeConfigCollapsed(!forgeConfigCollapsed)}
          />

          {!selectedTopic ? (
            <div className="clay p-12 text-center space-y-3">
              <Hammer className="w-10 h-10 text-plum/15 mx-auto" />
              <p className="font-outfit font-bold text-sm text-plum/40">Select a topic to analyze</p>
              <p className="text-[10px] text-plum/30 font-medium max-w-sm mx-auto">
                Click any topic from the list on the left 👈 to see its 4D loadout, dimension gaps, and the <strong className="text-soft-purple">Generate Questions</strong> button.
              </p>
              <button onClick={() => setShowCreateModal(true)} className="clay-btn px-4 py-2 text-xs font-bold text-soft-purple hover:bg-soft-purple/5 flex items-center gap-1.5 mx-auto">
                <Plus className="w-3.5 h-3.5" /> Create a new topic first
              </button>
            </div>
          ) : (
            <>
              {/* Topic detail header */}
              <div className="clay p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-soft-purple/10 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-soft-purple" />
                    </div>
                    <div>
                      <h3 className="font-outfit font-black text-base text-plum">{selectedTopic.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-plum/40">{selectedTopic.theme}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${selectedTopic.mode === "focused" ? "bg-soft-purple/10 text-soft-purple" : "bg-mint/10 text-mint"}`}>{selectedTopic.mode}</span>
                        {selectedTopic.targetLens && <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-soft-purple/10 text-soft-purple">{selectedTopic.targetLens}</span>}
                        <span className="text-[10px] text-plum/30">{selectedTopic.questionCount}/{selectedTopic.maxQuestions} questions</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={handleReview} disabled={reviewing || selectedTopic.questionCount === 0} className={`clay-btn p-2 transition-colors ${reviewReport ? "text-mint" : "text-plum/20 hover:text-mint"}`} title="Review questions"><ClipboardCheck className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setShowRenameModal(selectedTopic); setRenameTo(selectedTopic.name); }} className="clay-btn p-2 text-plum/20 hover:text-plum"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setShowDeleteConfirm(selectedTopic); setDeleteConfirmText(""); }} className="clay-btn p-2 text-plum/15 hover:text-peach"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {/* Generate Questions — primary action */}
                {selectedTopic.status !== "FULL" && (
                  <div className="pt-2">
                    {genError && (
                      <div className="mb-2 p-2 bg-peach/5 border border-peach/20 rounded-xl text-[10px] text-peach font-medium">
                        ❌ {genError}
                        <button onClick={() => setGenError("")} className="ml-2 underline">Dismiss</button>
                      </div>
                    )}
                    {generating ? (
                      <div className="flex items-center gap-3 p-3 bg-soft-purple/5 border border-soft-purple/20 rounded-xl">
                        <Loader2 className="w-4 h-4 text-soft-purple animate-spin flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-soft-purple">{genProgress}</p>
                          <p className="text-[9px] text-plum/30 mt-0.5">This may take 30-60 seconds...</p>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleGenerateQuestions}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-soft-purple text-white font-outfit font-black text-xs uppercase tracking-wider hover:shadow-lg hover:bg-soft-purple/90 transition-all"
                      >
                        <Send className="w-4 h-4" />
                        Generate {selectedTopic.maxQuestions - selectedTopic.questionCount} Questions
                      </button>
                    )}
                  </div>
                )}
                {selectedTopic.status === "FULL" && (
                  <div className="p-2 bg-mint/5 border border-mint/20 rounded-xl text-[10px] text-mint font-medium text-center">
                    ✅ Topic is full — {selectedTopic.questionCount}/{selectedTopic.maxQuestions} questions generated.
                  </div>
                )}

                {/* Diversity breakdown — named lenses/forms/backdoors with counts */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[{ label: "Lenses", data: selectedTopic.lenses, color: "soft-purple" },
                    { label: "Forms", data: selectedTopic.forms, color: "sky" },
                    { label: "Backdoors", data: selectedTopic.backdoors, color: "mint" }].map(d => (
                    <div key={d.label} className={`bg-${d.color}/5 rounded-xl p-3 space-y-1.5`}>
                      <span className="text-[9px] font-black text-plum/40 uppercase flex items-center justify-between">
                        {d.label}
                        <span className="text-lg font-outfit font-black text-plum">{Object.keys(d.data).length}</span>
                      </span>
                      {Object.keys(d.data).length > 0 ? (
                        <div className="space-y-0.5">
                          {Object.entries(d.data).sort(([,a], [,b]) => b - a).slice(0, 6).map(([name, count]) => (
                            <div key={name} className="flex items-center justify-between text-[9px]">
                              <span className="text-plum/50 truncate max-w-[120px]">{d.label === "Forms" ? name.replace(/^Form \d+ \((.+)\)$/, "$1") : name}</span>
                              <span className="font-mono font-bold text-plum/30">{count}</span>
                            </div>
                          ))}
                          {Object.keys(d.data).length > 6 && (
                            <p className="text-[8px] text-plum/20">+{Object.keys(d.data).length - 6} more</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[9px] text-plum/25">None yet</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Results Card */}
              {(reviewReport || reviewing) && selectedTopic.questionCount > 0 && (
                <div className="clay p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-outfit font-bold text-xs text-plum/60 uppercase tracking-wider flex items-center gap-2">
                      <ClipboardCheck className="w-3.5 h-3.5 text-mint" /> Question Review
                    </h3>
                    {reviewReport && (
                      <button onClick={handleReview} disabled={reviewing} className="text-[9px] font-bold text-plum/30 hover:text-mint transition-colors flex items-center gap-1">
                        <RefreshCw className={`w-3 h-3 ${reviewing ? "animate-spin" : ""}`} /> Re-run
                      </button>
                    )}
                  </div>
                  {reviewing ? (
                    <div className="flex items-center gap-3 p-3 bg-mint/5 border border-mint/20 rounded-xl">
                      <Loader2 className="w-4 h-4 text-mint animate-spin" />
                      <p className="text-xs font-bold text-mint">Reviewing {selectedTopic.questionCount} questions...</p>
                    </div>
                  ) : reviewReport ? (
                    <>
                      {/* Score & Grade */}
                      <div className="flex items-center gap-4">
                        <div className={`text-4xl font-outfit font-black ${
                          reviewReport.grade.startsWith('A') ? 'text-mint' :
                          reviewReport.grade.startsWith('B') ? 'text-butter' : 'text-peach'
                        }`}>
                          {reviewReport.grade}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-outfit font-black text-plum">{reviewReport.score}/100</span>
                            <span className="text-[9px] text-plum/30">·</span>
                            <span className="text-[9px] text-plum/40">{reviewReport.passes} passed, {reviewReport.failures} failed</span>
                          </div>
                          <p className="text-[9px] text-plum/30">{reviewReport.summary}</p>
                        </div>
                      </div>

                      {/* Issues List */}
                      {reviewReport.issues.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[9px] font-black text-peach/60 uppercase">Issues Found ({reviewReport.issues.length})</p>
                          <div className="space-y-1 max-h-[200px] overflow-y-auto">
                            {reviewReport.issues.map((issue, i) => (
                              <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-[9px] ${
                                issue.severity === 'critical' ? 'bg-peach/5 border border-peach/10' : 'bg-butter/5 border border-butter/10'
                              }`}>
                                <span className="flex-shrink-0 mt-0.5">{issue.severity === 'critical' ? '🔴' : '🟠'}</span>
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-plum/70">Q{issue.questionIndex + 1}</span>
                                  <span className="text-plum/50"> · {issue.detail}</span>
                                  <p className="text-plum/30 mt-0.5 truncate">"{issue.questionText.slice(0, 80)}..."</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Diversity Quick Stats */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-sky/5 rounded-lg p-2 text-center">
                          <p className="text-[8px] font-black text-plum/40 uppercase">Forms</p>
                          <p className="text-sm font-outfit font-black text-sky">{reviewReport.diversity.formsUsed}/10</p>
                        </div>
                        <div className="bg-mint/5 rounded-lg p-2 text-center">
                          <p className="text-[8px] font-black text-plum/40 uppercase">Backdoors</p>
                          <p className="text-sm font-outfit font-black text-mint">{reviewReport.diversity.backdoorsUsed}/10</p>
                        </div>
                        <div className="bg-soft-purple/5 rounded-lg p-2 text-center">
                          <p className="text-[8px] font-black text-plum/40 uppercase">Difficulty</p>
                          <p className="text-[9px] font-outfit font-bold text-soft-purple">
                            E{reviewReport.diversity.difficultySpread.easy} M{reviewReport.diversity.difficultySpread.medium} C{reviewReport.diversity.difficultySpread.challenging} X{reviewReport.diversity.difficultySpread.expert}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {/* 4D Loadout Table */}
              <div className="clay p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-outfit font-bold text-xs text-plum/60 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-butter" /> Top Loadouts
                  </h3>
                  <span className="text-[9px] text-plum/30">{selectedTopic.theme} domain</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-plum/5">
                        <th className="pb-2 text-[9px] font-black text-plum/30 uppercase w-8">#</th>
                        <th className="pb-2 text-[9px] font-black text-plum/30 uppercase">Lens</th>
                        <th className="pb-2 text-[9px] font-black text-plum/30 uppercase">Form</th>
                        <th className="pb-2 text-[9px] font-black text-plum/30 uppercase">Backdoor</th>
                        <th className="pb-2 text-[9px] font-black text-plum/30 uppercase">Persona</th>
                        <th className="pb-2 text-[9px] font-black text-plum/30 uppercase text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadouts.map((l, i) => (
                        <tr key={i} className={`border-b border-plum/[0.03] ${i === 0 ? "bg-butter/[0.03]" : ""}`}>
                          <td className="py-2 text-[10px] font-mono text-plum/25">{i + 1}</td>
                          <td className="py-2 text-[10px] font-bold text-soft-purple">{l.lens}</td>
                          <td className="py-2 text-[10px] text-sky">{l.form.replace(/^Form \d+ \((.+)\)$/, "$1")}</td>
                          <td className="py-2 text-[10px] text-mint">{l.backdoor}</td>
                          <td className="py-2 text-[10px] text-plum/60">{l.persona}</td>
                          <td className="py-2 text-right">
                            <span className={`text-[10px] font-outfit font-black ${i === 0 ? "text-butter" : "text-plum/40"}`}>{l.score.toFixed(1)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dimension Gaps */}
              {dimensionGaps.lenses.length + dimensionGaps.forms.length + dimensionGaps.backdoors.length > 0 && (
                <div className="clay p-5 space-y-2">
                  <h3 className="font-outfit font-bold text-xs text-plum/60 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-peach" /> Underutilized Dimensions
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {dimensionGaps.lenses.length > 0 && (
                      <div className="bg-peach/5 rounded-xl p-3">
                        <p className="text-[9px] font-black text-peach/60 uppercase mb-1">Lenses ({dimensionGaps.lenses.length})</p>
                        {dimensionGaps.lenses.map(l => <p key={l} className="text-[9px] text-plum/50">{l}</p>)}
                      </div>
                    )}
                    {dimensionGaps.forms.length > 0 && (
                      <div className="bg-butter/5 rounded-xl p-3">
                        <p className="text-[9px] font-black text-butter/60 uppercase mb-1">Forms ({dimensionGaps.forms.length})</p>
                        {dimensionGaps.forms.map(f => <p key={f} className="text-[9px] text-plum/50">{f.replace(/^Form \d+ \((.+)\)$/, "$1")}</p>)}
                      </div>
                    )}
                    {dimensionGaps.backdoors.length > 0 && (
                      <div className="bg-sky/5 rounded-xl p-3">
                        <p className="text-[9px] font-black text-sky/60 uppercase mb-1">Backdoors ({dimensionGaps.backdoors.length})</p>
                        {dimensionGaps.backdoors.map(b => <p key={b} className="text-[9px] text-plum/50">{b}</p>)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Brief Preview */}
              {briefText && (
                <div className="clay p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-outfit font-bold text-xs text-plum/60 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-soft-purple" /> Brief Preview
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <button onClick={generateBrief} className="clay-btn px-2 py-1.5 text-[10px] font-bold text-plum/30 hover:text-soft-purple transition-colors flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" /> Regenerate
                      </button>
                      <button onClick={copyBrief} className={`clay-btn px-3 py-1.5 text-[10px] font-bold flex items-center gap-1.5 transition-colors ${briefCopied ? "text-mint" : "text-plum/40 hover:text-soft-purple"}`}>
                        {briefCopied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                      </button>
                    </div>
                  </div>
                  <pre className="bg-plum/[0.02] border border-plum/5 rounded-2xl p-4 text-[9px] text-plum/60 font-mono whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed">
                    {briefText}
                  </pre>
                  <p className="text-[9px] text-plum/25 text-center">
                    💡 Or click <strong className="text-soft-purple">Generate Questions</strong> above to create them directly with AI — no copy-paste needed.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Create Topic Modal ───────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 space-y-6 shadow-2xl animate-slide-up-fade border border-plum/5">
            <div className="flex items-center justify-between">
              <h3 className="font-outfit font-black text-lg text-plum">New Topic</h3>
              <button onClick={() => setShowCreateModal(false)} className="clay-btn p-2 text-plum/30 hover:text-plum"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase">Topic Name</label>
                <input className="w-full clay-input p-3 text-sm" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. Science Surprises" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase">Theme</label>
                <div className="relative">
                  <input className="w-full clay-input p-3 text-sm" value={createForm.theme}
                    onChange={e => setCreateForm({ ...createForm, theme: e.target.value })}
                    placeholder="Type or select..." list="theme-suggestions" />
                  <datalist id="theme-suggestions">
                    {Array.from(stats.themes).sort().map(t => <option key={t} value={t} />)}
                  </datalist>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-plum/20 pointer-events-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-plum/40 uppercase">Mode</label>
                  <select className="w-full clay-input p-3 text-sm" value={createForm.mode} onChange={e => setCreateForm({ ...createForm, mode: e.target.value as "diverse" | "focused" })}>
                    <option value="diverse">Diverse (30q max)</option>
                    <option value="focused">Focused (30q max)</option>
                  </select>
                </div>
                {createForm.mode === "focused" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-plum/40 uppercase">Target Lens</label>
                    <select className="w-full clay-input p-3 text-sm" value={createForm.lens} onChange={e => setCreateForm({ ...createForm, lens: e.target.value })}>
                      <option value="">Auto (recommended)</option>
                      {ALL_LENSES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="pt-2 flex gap-4">
              <button onClick={() => setShowCreateModal(false)} className="flex-1 clay-btn py-3 text-xs font-bold text-plum/30">Cancel</button>
              <button onClick={handleCreate} className="flex-1 clay-btn py-3 bg-soft-purple text-white text-xs font-black uppercase tracking-wider hover:shadow-lg">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirm Modal ─────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 space-y-6 shadow-2xl animate-slide-up-fade border border-plum/5 text-center">
            <span className="text-3xl">⚠️</span>
            <h3 className="font-outfit font-black text-lg text-plum">Delete Topic?</h3>
            <p className="text-sm text-plum/50 font-medium">
              <strong>{showDeleteConfirm.name}</strong><br />
              {showDeleteConfirm.questionCount} questions will be permanently deleted.
            </p>
            {showDeleteConfirm.questionCount > 0 ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase">
                  Type <strong className="text-peach">{showDeleteConfirm.name}</strong> to confirm
                </label>
                <input
                  className="w-full clay-input p-3 text-sm text-center"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={showDeleteConfirm.name}
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && handleDelete()}
                />
              </div>
            ) : (
              <></>
            )}
            <div className="flex gap-4">
              <button onClick={() => { setShowDeleteConfirm(null); setDeleteConfirmText(""); }} className="flex-1 clay-btn py-3 text-xs font-bold text-plum/30">Cancel</button>
              <button onClick={handleDelete} disabled={showDeleteConfirm.questionCount > 0 && deleteConfirmText !== showDeleteConfirm.name}
                className={`flex-1 clay-btn py-3 text-xs font-black uppercase transition-all ${
                  (showDeleteConfirm.questionCount > 0 && deleteConfirmText !== showDeleteConfirm.name)
                    ? "bg-plum/10 text-plum/30 cursor-not-allowed" : "bg-peach text-white hover:shadow-lg"
                }`}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Rename Modal ─────────────────────────────────────── */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 space-y-6 shadow-2xl animate-slide-up-fade border border-plum/5">
            <div className="flex items-center justify-between">
              <h3 className="font-outfit font-black text-lg text-plum">Rename Topic</h3>
              <button onClick={() => setShowRenameModal(null)} className="clay-btn p-2 text-plum/30 hover:text-plum"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-plum/40 uppercase">New Name</label>
              <input className="w-full clay-input p-3 text-sm" value={renameTo} onChange={e => setRenameTo(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleRename()} autoFocus />
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowRenameModal(null)} className="flex-1 clay-btn py-3 text-xs font-bold text-plum/30">Cancel</button>
              <button onClick={handleRename} className="flex-1 clay-btn py-3 bg-soft-purple text-white text-xs font-black uppercase">Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Create Theme Modal ──────────────────────────────── */}
      {showCreateTheme && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 space-y-6 shadow-2xl animate-slide-up-fade border border-plum/5">
            <div className="flex items-center justify-between">
              <h3 className="font-outfit font-black text-lg text-plum">New Theme</h3>
              <button onClick={() => setShowCreateTheme(false)} className="clay-btn p-2 text-plum/30 hover:text-plum"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-plum/40 uppercase">Theme Name</label>
              <input className="w-full clay-input p-3 text-sm" value={newThemeName} onChange={e => setNewThemeName(e.target.value)}
                placeholder="e.g. Music" autoFocus
                onKeyDown={e => e.key === "Enter" && handleCreateTheme()} />
            </div>
            <div className="flex gap-4">
              <button onClick={() => setShowCreateTheme(false)} className="flex-1 clay-btn py-3 text-xs font-bold text-plum/30">Cancel</button>
              <button onClick={handleCreateTheme} className="flex-1 clay-btn py-3 bg-soft-purple text-white text-xs font-black uppercase">Create Theme</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
