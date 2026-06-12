import { useState, useCallback, useRef, useEffect } from "react";
import { ArrowLeft, Sparkles, ChevronDown, LogIn, Pencil, X, Plus, Save, RefreshCw, Loader2, HelpCircle } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { generateCompactQuizQuestions } from "../lib/ai";
import type { PlayerPersona, LensType, FormType, BackdoorType, GenerationResult } from "../lib/ai/types";
import { ALL_LENSES, ALL_FORMS, ALL_BACKDOORS, ALL_TOPIC_TYPES, ALL_KNOWLEDGE_DOMAINS, ALL_QUIZ_STYLES } from "../lib/ai/types";
import {
  ProviderConfig,
  TopicInput,
  ThemeInput,
  PickerGrid,
  DescriptionPanel,
  QuestionPreview,
  AuditPanel,
  GenerationLogs,
  LoadFromLibrary,
  GenerateButton,
} from "./ai-generator";
import type { AIProvider } from "./ai-generator";
import type { LogEntry } from "./ai-generator/GenerationLogs";
import PersonaPicker, { PERSONA_META } from "./ai-generator/PersonaPicker";
import type { ThemeSubtopic, TopicType, KnowledgeDomain, QuizStyle } from "../lib/ai/types";
import { generateThemeSubtopics, rerollSubtopic } from "../lib/ai/themes";
import { determinePhase, PHASE_ICONS } from "../lib/phaseDiscovery";
import type { PhaseConfig } from "../lib/phaseDiscovery";
import Auth from "./Auth";

// ─── Theme subtopic metadata for list rendering ──────────────────────

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

// ─── Lens/Form/Backdoor metadata for pickers ────────────────────────

const LENS_ITEMS = ALL_LENSES.map((l: LensType) => ({
  id: l,
  label: l,
  subtitle: getLensSubtitle(l),
  icon: getLensIcon(l),
  color: "purple" as const,
}));

const FORM_ITEMS = ALL_FORMS.map((f: FormType) => ({
  id: f,
  label: f.replace(/^Form \d+ \((.+)\)$/, "$1"),
  subtitle: getFormSubtitle(f),
  icon: getFormIcon(f),
  color: "sky" as const,
}));

const BACKDOOR_ITEMS = ALL_BACKDOORS.map((b: BackdoorType) => ({
  id: b,
  label: b,
  subtitle: getBackdoorSubtitle(b),
  icon: getBackdoorIcon(b),
  color: "mint" as const,
}));

const THEME_TYPE_ITEMS = ALL_TOPIC_TYPES.map((t) => ({
  id: t,
  label: t,
  subtitle: t === "Core" ? "Foundational" : t === "Niche" ? "Deep dive" : t === "Human" ? "Biography/Culture" : t === "Surprise" ? "Unexpected/Fun" : t === "Scale" ? "Big numbers" : "Obscure/Mystery",
  icon: TYPE_META[t]?.icon || "📝",
  color: "purple" as const,
}));

const THEME_DOMAIN_ITEMS = ALL_KNOWLEDGE_DOMAINS.map((d) => ({
  id: d,
  label: d,
  subtitle: d === "Facts" ? "Raw info" : d === "Stories" ? "Narrative" : d === "Concepts" ? "Theories/Ideas" : d === "Data" ? "Stats/Charts" : "Interconnections",
  icon: d === "Facts" ? "📖" : d === "Stories" ? "🎬" : d === "Concepts" ? "🧠" : d === "Data" ? "📊" : "🔗",
  color: "sky" as const,
}));

const THEME_STYLE_ITEMS = ALL_QUIZ_STYLES.map((s) => ({
  id: s,
  label: s,
  subtitle: s === "Classic" ? "Standard Q&A" : s === "Trick" ? "Misdirection" : s === "Visual" ? "Sensory/Imagery" : "Time/History",
  icon: STYLE_META[s]?.icon || "📋",
  color: "mint" as const,
}));

function getLensIcon(lens: LensType): string {
  const map: Record<string, string> = {
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
    "The Butterfly Effect": "🦋",
    "The Evolution": "🦎",
    "The Cultural Impact": "🌍",
  };
  return map[lens] || "💡";
}

function getLensSubtitle(lens: LensType): string {
  const map: Record<string, string> = {
    "Origin Story": "Wonder, discovery",
    "The Unexpected": "Surprise, shock",
    "The Human Element": "Empathy, drama",
    "Numbers & Scale": "Awe, scale",
    "The Rivalry": "Tension, drama",
    "The Oddity": "Amusement, curiosity",
    "Behind the Scenes": "Insider-feeling",
    "The Connection": "Mind-blown",
    "What If?": "Imagination, play",
    "The Legacy": "Significance, meaning",
    "The Butterfly Effect": "Small action, huge result",
    "The Evolution": "Change over time",
    "The Cultural Impact": "Shaped modern society",
  };
  return map[lens] || "";
}

function getFormIcon(form: FormType): string {
  const map: Record<string, string> = {
    "Form 1 (Action-First)": "🏃",
    "Form 2 (Parenthetical Hook)": "🔄",
    "Form 3 (Sensory Clue)": "👁️",
    "Form 4 (Active Quote)": "💬",
    "Form 5 (Direct Narrative)": "📖",
    "Form 6 (The Contradiction)": "🔄",
    "Form 7 (The Question Lead)": "❓",
    "Form 8 (The Timeline)": "📅",
    "Form 9 (The Misdirection)": "🎭",
    "Form 10 (Defining Trait)": "🏷️",
  };
  return map[form] || "📝";
}

function getFormSubtitle(form: FormType): string {
  const map: Record<string, string> = {
    "Form 1 (Action-First)": "Dynamic participle",
    "Form 2 (Parenthetical Hook)": "Dramatic contrast",
    "Form 3 (Sensory Clue)": "Color, texture",
    "Form 4 (Active Quote)": "Iconic phrase",
    "Form 5 (Direct Narrative)": "Story-driven",
    "Form 6 (The Contradiction)": "Pivot on assumption",
    "Form 7 (The Question Lead)": "Thought experiment",
    "Form 8 (The Timeline)": "Chronological sequence",
    "Form 9 (The Misdirection)": "Sounds like X, is Y",
    "Form 10 (Defining Trait)": "Adjective heavy",
  };
  return map[form] || "";
}

function getBackdoorIcon(b: BackdoorType): string {
  const map: Record<string, string> = {
    "Synonym Bridge": "🔑",
    "Contrast Pop": "🎭",
    "Everyday Link": "🔗",
    "Anagram-Wordplay": "🧩",
    "Sequence Pattern": "🔢",
    "Sensory Logic": "👃",
    "Category Elimination": "🎯",
    "Etymology / Name Logic": "🗣️",
    "Functional Logic": "⚙️",
    "Pop Culture Hook": "🎬",
  };
  return map[b] || "🚪";
}

function getBackdoorSubtitle(b: BackdoorType): string {
  const map: Record<string, string> = {
    "Synonym Bridge": "Descriptive phrase",
    "Contrast Pop": "Familiar contrast",
    "Everyday Link": "Daily life connection",
    "Anagram-Wordplay": "Text pattern",
    "Sequence Pattern": "Recognizable order",
    "Sensory Logic": "Physical properties",
    "Category Elimination": "Narrowing field",
    "Etymology / Name Logic": "Name/root translation",
    "Functional Logic": "How it works/purpose",
    "Pop Culture Hook": "Movie/meme reference",
  };
  return map[b] || "";
}

function getLensDescription(lens: LensType): string {
  const map: Record<string, string> = {
    "Origin Story": "Questions framed as founding moments — how did this begin? The spark that started it all. Players feel awe and curiosity.",
    "The Unexpected": "Questions that contradict common belief. The \"wait, what?!\" moment that makes players lean in and want to know more.",
    "The Human Element": "Questions focused on the person behind the fact — their struggle, triumph, or peculiarity. Empathy-driven engagement.",
    "Numbers & Scale": "Mind-bending statistics and comparisons. How big, fast, or many? Creates a sense of awe through sheer scale.",
    "The Rivalry": "Clash and conflict. The drama of opposing forces. Tension-driven questions that feel like a story unfolding.",
    "The Oddity": "Weird, bizarre details that make you go \"huh?\" Amusement and curiosity through the unexpected and peculiar.",
    "Behind the Scenes": "Hidden secrets and insider knowledge. What happens when nobody's watching? Makes players feel like they're in on something.",
    "The Connection": "Unexpected links between seemingly unrelated things. The mind-blowing realization that two worlds collide.",
    "What If?": "Alternative history and roads not taken. Imagination-driven questions that explore counterfactuals.",
    "The Legacy": "How did this change everything? Questions about lasting impact, significance, and meaning.",
    "The Butterfly Effect": "A tiny event that caused a massive historical outcome. Tone: awe, realization.",
    "The Evolution": "How something drastically changed or adapted over time. Tone: progression, reflection.",
    "The Cultural Impact": "How a factual event shaped modern society, slang, or media. Tone: relevance, familiarity.",
  };
  return map[lens] || "";
}

function getFormDescription(form: FormType): string {
  const map: Record<string, string> = {
    "Form 1 (Action-First)": "Starts with a dynamic participle like \"Pioneering...\", \"Fleeing...\", or \"Defying...\". Creates immediate momentum.",
    "Form 2 (Parenthetical Hook)": "Opens with dramatic contrast — \"Unlike...\", \"Though...\", \"Despite...\". Sets up surprise right away.",
    "Form 3 (Sensory Clue)": "Begins with color, texture, or physical description. Paints a vivid picture before revealing the question.",
    "Form 4 (Active Quote)": "Starts with an iconic phrase, nickname, or quote. Humanizes the question through voice and character.",
    "Form 5 (Direct Narrative)": "Clean, elegant, story-driven opener. Classic storytelling structure with a satisfying reveal.",
    "Form 6 (The Contradiction)": "Starts by setting up an assumption, then pivot. \"Despite being known as...\"",
    "Form 7 (The Question Lead)": "Start with a rhetorical question or thought experiment. \"What happens when you mix...\"",
    "Form 8 (The Timeline)": "Frame the clue as a rapid chronological sequence. \"First developed in 1991, then adopted in 2001...\"",
    "Form 9 (The Misdirection)": "Sounds like it's describing one thing, but shifts to the real answer. \"It may sound like a type of fancy Italian pasta, but...\"",
    "Form 10 (Defining Trait)": "Lead heavily with adjectives and defining characteristics. \"Flightless, nocturnal, and highly endangered...\"",
  };
  return map[form] || "";
}

function getBackdoorDescription(b: BackdoorType): string {
  const map: Record<string, string> = {
    "Synonym Bridge": "Uses a descriptive phrase that points to the answer (e.g. \"leather sphere\" → cricket ball). Players can deduce through vocabulary.",
    "Contrast Pop": "Contrasts with a familiar concept (e.g. \"Unlike bony fish...\" → sharks). The difference itself is the clue.",
    "Everyday Link": "Connects obscure facts to daily life (e.g. \"charred sewing thread\" → light bulb filament). Familiarity unlocks the answer.",
    "Anagram-Wordplay": "The answer is embedded in the question's text structure. Pattern recognition leads to the solution.",
    "Sequence Pattern": "Names or facts form a recognizable sequence. Players spot the pattern to find the answer.",
    "Sensory Logic": "Physical properties like color, texture, or sound lead to the answer. Sensory reasoning is the key.",
    "Category Elimination": "Narrows the field dramatically through qualifiers (e.g. \"Southern Indian cricketing state\"). Process of elimination works.",
    "Etymology / Name Logic": "Translates root words to deduce answer (e.g. \"Greek for star sailor\" → Astronaut).",
    "Functional Logic": "Describes how something works or its purpose (e.g. \"passing current through a tungsten filament\" → Lightbulb).",
    "Pop Culture Hook": "Drops a subtle reference to a famous movie, song, or meme related to the factual topic.",
  };
  return map[b] || "";
}

// ─── Component ──────────────────────────────────────────────────────

export interface CompactGeneratorProps {
  onBack: () => void;
}

export default function CompactGenerator({ onBack }: CompactGeneratorProps) {
  // ── Auth state ───────────────────────────────────────────────────
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  // ── Config state ──────────────────────────────────────────────────
  const [provider, setProvider] = useState<AIProvider>(
    () => (store.getAiProvider() as AIProvider) || "gemini",
  );
  const [apiKey, setApiKey] = useState(() => {
    const keys = store.getAiKeys();
    return keys[store.getAiProvider()] || "";
  });
  const [model, setModel] = useState(() => {
    const p = store.getAiProvider();
    if (p === "gemini") return "gemini-1.5-pro";
    if (p === "openai") return "gpt-4o";
    return "llama3-70b-8192";
  });

  // ── Generation mode ─────────────────────────────────────────────
  const [generationMode, setGenerationMode] = useState<"topic" | "themed">("themed");
  const [showModeHelp, setShowModeHelp] = useState(false);
  const [showStrategyHelp, setShowStrategyHelp] = useState(false);

  // ── Unified Input State ──────────────────────────────────────────
  const [rawInput, setRawInput] = useState("");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Derived state/helpers to maintain compatibility with existing functions:
  const topics = rawInput.trim() ? rawInput.split(/[,\n]+/).map(t => t.trim()).filter(Boolean) : [];
  const theme = rawInput;

  const setTopics = useCallback((list: string[]) => {
    setRawInput(list.join(", "));
  }, []);

  const setTheme = useCallback((val: string) => {
    setRawInput(val);
  }, []);

  // ── Theme mode params ────────────────────────────────────────────
  const [subtopics, setSubtopics] = useState<ThemeSubtopic[]>([]);
  const [generatingSubtopics, setGeneratingSubtopics] = useState(false);
  const [rerollingIndex, setRerollingIndex] = useState<number | undefined>(undefined);
  const [appendingSubtopics, setAppendingSubtopics] = useState(false);
  const [savingSubtopics, setSavingSubtopics] = useState(false);
  const [autoPhase, setAutoPhase] = useState<PhaseConfig | null>(null);

  // Subtopics inline editing state
  const [isEditingTheme, setIsEditingTheme] = useState(false);
  const [editThemeValue, setEditThemeValue] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleRemoveSubtopic = useCallback(
    (index: number) => {
      setSubtopics(subtopics.filter((_, i) => i !== index));
    },
    [subtopics]
  );

  const handleAddCustomSubtopic = useCallback(() => {
    const trimmed = customTopic.trim();
    if (!trimmed) return;
    const custom: ThemeSubtopic = {
      name: trimmed,
      type: "Core",
      domain: "Facts",
      style: "Classic",
    };
    setSubtopics([...subtopics, custom]);
    setCustomTopic("");
    setShowCustomInput(false);
  }, [customTopic, subtopics]);

  const handleSaveThemeRename = useCallback(() => {
    const trimmed = editThemeValue.trim();
    if (trimmed && trimmed !== theme) {
      setRawInput(trimmed);
      setSubtopics([]);
    }
    setIsEditingTheme(false);
  }, [editThemeValue, theme]);

  const recentThemes = store.getRecentThemes();
  const recentTopics = store.getRecentTopics();

  // ── Shared params ────────────────────────────────────────────────
  const [personas, setPersonas] = useState<PlayerPersona[]>(["Casual Explorer"]);
  const [lensMode, setLensMode] = useState<"diverse" | "focused">("diverse");
  const [questionCount, setQuestionCount] = useState<number>(5);

  // ── Advanced options ──────────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedLenses, setSelectedLenses] = useState<string[]>(
    ALL_LENSES.map((l) => l),
  );
  const [selectedForms, setSelectedForms] = useState<string[]>(
    ALL_FORMS.map((f) => f),
  );
  const [selectedBackdoors, setSelectedBackdoors] = useState<string[]>(
    ALL_BACKDOORS.map((b) => b),
  );
  const [selectedThemeTypes, setSelectedThemeTypes] = useState<string[]>(
    ALL_TOPIC_TYPES.map((t) => t),
  );
  const [selectedThemeDomains, setSelectedThemeDomains] = useState<string[]>(
    ALL_KNOWLEDGE_DOMAINS.map((d) => d),
  );
  const [selectedThemeStyles, setSelectedThemeStyles] = useState<string[]>(
    ALL_QUIZ_STYLES.map((s) => s),
  );
  const [advancedViewMode, setAdvancedViewMode] = useState<"tiles" | "detailed">("tiles");

  // ── Auth modal state ────────────────────────────────────────────
  const [showAuth, setShowAuth] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────
  const [configCollapsed, setConfigCollapsed] = useState(true);
  const [showLoadLibrary, setShowLoadLibrary] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [topicNames, setTopicNames] = useState<string[]>([]);
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  const [revealedTopics, setRevealedTopics] = useState<Record<number, boolean>>({});
  const resultsRef = useRef<HTMLDivElement>(null);

  // ── Helpers ───────────────────────────────────────────────────────
  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const now = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { timestamp: now, message, type }]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // ── Load from Library: Topic callback ─────────────────────────────
  const handleLoadTopic = (name: string, questions: any[], mainCategory: string) => {
    // Switch to topic mode so the input and results are visible
    setGenerationMode("topic");
    // Set the topic in the input
    setTopics([name]);
    // Create a result from loaded questions
    const existingResult: GenerationResult = {
      questions,
      analysis: [],
      audit: {
        lenses_used: [],
        forms_used: [],
        all_lenses_unique: false,
        all_forms_represented: false,
        no_consecutive_form_repeats: false,
        no_duplicate_grammatical_patterns: false,
        difficulty_ramp_valid: false,
        issues: ["Loaded from library — no audit available"],
      },
      total_api_calls: 0,
      regenerations: 0,
    };
    setResults([existingResult]);
    setTopicNames([name]);
    setStatus("success");
    addLog(`📚 Loaded ${questions.length} existing questions for "${name}" from library`, "info");
    addLog(`✨ Click "Generate" to append 5 more questions to this topic`, "info");
  };

  // ── Load from Library: Theme callback ─────────────────────────────
  const handleLoadTheme = (themeName: string) => {
    setGenerationMode("themed");
    handleSelectRecentTheme(themeName);
  };

  // ── Recent Theme: Load existing subtopics from DB ──────────────────

  const handleSelectRecentTheme = async (themeName: string) => {
    setTheme(themeName);
    setSubtopics([]);

    try {
      if (user) {
        const { data, error } = await supabase
          .from("categories_library")
          .select("name, tags")
          .eq("main_category", themeName)
          .eq("created_by", user.id);

        if (data && data.length > 0) {
          // Extract unique subtopic names (dedup by name) and type/domain/style from tags
          const seen = new Set<string>();
          const loaded: ThemeSubtopic[] = [];
          for (const row of data) {
            const name = row.name;
            if (!name || seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            const tags: string[] = row.tags || [];
            // Tags are like: ["Grid", "TopicName", "Theme:Movies", "Core", "Facts", "Classic"]
            // The last 3 non-theme tags are type, domain, style
            const nonMeta = tags.filter((t) => !t.startsWith("Theme:") && t !== "Grid" && t !== name);
            const type = (nonMeta[nonMeta.length - 3] as TopicType) || "Core";
            const domain = (nonMeta[nonMeta.length - 2] as KnowledgeDomain) || "Facts";
            const style = (nonMeta[nonMeta.length - 1] as QuizStyle) || "Classic";
            loaded.push({ name, type, domain, style });
          }
          setSubtopics(loaded);
          addLog(`📚 Loaded ${loaded.length} existing subtopics for "${themeName}"`, "info");
        } else {
          addLog(`📝 No existing subtopics found for "${themeName}" — generate fresh`, "info");
        }
      }
    } catch (e) {
      // Non-critical
    }
  };

  // ── Recent Topic: Load existing questions from DB ──────────────────
  const handleSelectRecentTopic = async (topicName: string) => {
    // Set the topic in the input
    setTopics([topicName]);

    try {
      if (user) {
        const { data } = await supabase
          .from("categories_library")
          .select("name, data, main_category, tags")
          .eq("name", topicName)
          .eq("created_by", user.id)
          .limit(1)
          .maybeSingle();

        if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
          const questions = data.data;
          const existingResult: GenerationResult = {
            questions,
            analysis: [],
            audit: {
              lenses_used: [],
              forms_used: [],
              all_lenses_unique: false,
              all_forms_represented: false,
              no_consecutive_form_repeats: false,
              no_duplicate_grammatical_patterns: false,
              difficulty_ramp_valid: false,
              issues: ["Loaded from library — no audit available"],
            },
            total_api_calls: 0,
            regenerations: 0,
          };
          setResults([existingResult]);
          setTopicNames([topicName]);
          setStatus("success");
          addLog(`📚 Loaded ${questions.length} existing questions for "${topicName}"`, "info");
          addLog(`✨ Click "Generate" to append 5 more questions to this topic`, "info");
        } else {
          addLog(`📝 No existing questions found for "${topicName}" — generate fresh`, "info");
        }
      }
    } catch (e) {
      // Topic doesn't exist or has no questions — that's fine
    }
  };

  // ── Theme: Generate Subtopics (first batch, replaces) ─────────────
  const handleThemeGenerate = async () => {
    if (!theme.trim() || !apiKey) return;

    setGenerationMode("themed");
    setGeneratingSubtopics(true);
    setSubtopics([]);

    // Fetch previously generated subtopic names for this theme as exclusions
    let excludeNames: string[] | undefined;
    let existingTopicInfos: { name: string; tags: string[] }[] = [];
    try {
      if (user) {
        const { data } = await supabase
          .from("categories_library")
          .select("name, tags")
          .eq("main_category", theme.trim())
          .eq("created_by", user.id);
        if (data && data.length > 0) {
          excludeNames = data.map((row: any) => row.name);
          existingTopicInfos = data.map((row: any) => ({
            name: row.name,
            tags: row.tags || [],
          }));
          addLog(`📚 Found ${excludeNames.length} previously generated subtopics for "${theme}" — will avoid repeats`, "info");
        }
      }
    } catch (e) {
      // Non-critical — proceed without exclusions if query fails
    }

    // Detect if user manually changed the matrix checkboxes (not all-selected = manual mode)
    const allTypesSelected = selectedThemeTypes.length === ALL_TOPIC_TYPES.length;
    const allDomainsSelected = selectedThemeDomains.length === ALL_KNOWLEDGE_DOMAINS.length;
    const allStylesSelected = selectedThemeStyles.length === ALL_QUIZ_STYLES.length;
    const usingManualMatrix = !allTypesSelected || !allDomainsSelected || !allStylesSelected;

    let effectiveTypes: TopicType[];
    let effectiveDomains: KnowledgeDomain[];
    let effectiveStyles: QuizStyle[];

    if (usingManualMatrix) {
      effectiveTypes = selectedThemeTypes as TopicType[];
      effectiveDomains = selectedThemeDomains as KnowledgeDomain[];
      effectiveStyles = selectedThemeStyles as QuizStyle[];
      setAutoPhase(null);
      addLog(`⚙️ Custom Theme Matrix enabled: Types (${selectedThemeTypes.length}/6), Domains (${selectedThemeDomains.length}/5), Styles (${selectedThemeStyles.length}/4)`, "info");
    } else {
      const phase = determinePhase(existingTopicInfos);
      setAutoPhase(phase);
      effectiveTypes = phase.types;
      effectiveDomains = phase.domains;
      effectiveStyles = phase.styles;
      addLog(`${PHASE_ICONS[phase.phase]} Phase ${phase.phase}/4 — ${phase.label}: ${phase.rationale}`, "info");
    }

    addLog(`🧠 Generating 5 subtopics for theme: "${theme}"...`, "info");

    try {
      const result = await generateThemeSubtopics(
        theme.trim(),
        { provider, apiKey, model },
        excludeNames,
        effectiveTypes,
        effectiveDomains,
        effectiveStyles
      );

      setSubtopics(result.subtopics);
      store.addRecentTheme(theme.trim());
      addLog(
        `✅ Generated ${result.subtopics.length} subtopics: ${result.subtopics.map((s) => s.name).join(", ")}`,
        "success",
      );
    } catch (err: any) {
      addLog(`❌ Theme generation failed: ${err.message}`, "error");
    } finally {
      setGeneratingSubtopics(false);
    }
  };

  // ── Theme: Append 5 More Subtopics (keeps existing) ────────────────
  const handleThemeAppend = async () => {
    if (!theme.trim() || !apiKey) return;

    setAppendingSubtopics(true);

    // Build exclusion list: current subtopic names + DB exclusions
    const currentNames = subtopics.map((s) => s.name);
    let excludeNames: string[] = [...currentNames];
    try {
      if (user) {
        const { data } = await supabase
          .from("categories_library")
          .select("name")
          .eq("main_category", theme.trim())
          .eq("created_by", user.id);
        if (data && data.length > 0) {
          const dbNames = data.map((row: any) => row.name);
          // Merge with current names, dedup
          excludeNames = [...new Set([...currentNames, ...dbNames])];
        }
      }
    } catch (e) {
      // Non-critical
    }

    addLog(`🧠 Appending 5 more subtopics for theme: "${theme}" (excluding ${excludeNames.length} existing names)...`, "info");

    // Use same matrix as the generate phase (auto or manual)
    const allThemeTypesSelected = selectedThemeTypes.length === ALL_TOPIC_TYPES.length;
    const allThemeDomainsSelected = selectedThemeDomains.length === ALL_KNOWLEDGE_DOMAINS.length;
    const allThemeStylesSelected = selectedThemeStyles.length === ALL_QUIZ_STYLES.length;
    const usingManualThemeMatrix = !allThemeTypesSelected || !allThemeDomainsSelected || !allThemeStylesSelected;

    let effectiveThemeTypes: TopicType[];
    let effectiveThemeDomains: KnowledgeDomain[];
    let effectiveThemeStyles: QuizStyle[];

    if (usingManualThemeMatrix) {
      effectiveThemeTypes = selectedThemeTypes as TopicType[];
      effectiveThemeDomains = selectedThemeDomains as KnowledgeDomain[];
      effectiveThemeStyles = selectedThemeStyles as QuizStyle[];
    } else if (autoPhase) {
      effectiveThemeTypes = autoPhase.types;
      effectiveThemeDomains = autoPhase.domains;
      effectiveThemeStyles = autoPhase.styles;
    } else {
      effectiveThemeTypes = ALL_TOPIC_TYPES as TopicType[];
      effectiveThemeDomains = ALL_KNOWLEDGE_DOMAINS as KnowledgeDomain[];
      effectiveThemeStyles = ALL_QUIZ_STYLES as QuizStyle[];
    }

    try {
      const result = await generateThemeSubtopics(
        theme.trim(),
        { provider, apiKey, model },
        excludeNames,
        effectiveThemeTypes,
        effectiveThemeDomains,
        effectiveThemeStyles
      );

      // Append, don't replace
      setSubtopics((prev) => [...prev, ...result.subtopics]);
      addLog(
        `✅ Appended ${result.subtopics.length} subtopics: ${result.subtopics.map((s) => s.name).join(", ")} (total: ${subtopics.length + result.subtopics.length})`,
        "success",
      );
    } catch (err: any) {
      addLog(`❌ Append failed: ${err.message}`, "error");
    } finally {
      setAppendingSubtopics(false);
    }
  };

  // ── Theme: Save Subtopics to Library ──────────────────────────────
  const handleSaveSubtopics = async () => {
    if (!theme.trim() || subtopics.length === 0) return;

    setSavingSubtopics(true);
    addLog(`💾 Saving ${subtopics.length} subtopics for theme "${theme}" to library...`, "info");

    let saved = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const sub of subtopics) {
      try {
        // Check if this subtopic already exists
        const { data: existing } = await supabase
          .from("categories_library")
          .select("id")
          .eq("name", sub.name)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const tags = [
          "Grid",
          sub.name,
          `Theme:${theme.trim()}`,
          sub.type,
          sub.domain,
          sub.style,
          "Mode:Diverse",
          "AI:Suggested",
        ];

        const { error } = await supabase.from("categories_library").insert([
          {
            name: sub.name,
            main_category: theme.trim(),
            description: `AI-suggested ${sub.type} · ${sub.domain} · ${sub.style} — ${theme.trim()}`,
            data: [],
            tags,
            is_global: true,
            lens_mode: "diverse",
            target_lens: null,
            created_by: user?.id,
          },
        ]);

        if (error) {
          errors.push(`${sub.name}: ${error.message}`);
        } else {
          saved++;
        }
      } catch (err: any) {
        errors.push(`${sub.name}: ${err.message}`);
      }
    }

    if (saved > 0) {
      addLog(`✅ Saved ${saved} subtopic(s) to library${skipped > 0 ? ` (${skipped} already existed, skipped)` : ""}`, "success");
    }
    if (errors.length > 0) {
      errors.forEach((e) => addLog(`❌ Save error: ${e}`, "error"));
    }
    if (saved === 0 && errors.length === 0) {
      addLog(`📝 All ${skipped} subtopics already exist in the library — nothing new to save`, "info");
    }

    setSavingSubtopics(false);
  };

  // ── Theme: Re-roll single subtopic ────────────────────────────────
  const handleRerollSubtopic = async (index: number) => {
    if (!apiKey) return;

    setRerollingIndex(index);
    addLog(`🔄 Re-rolling subtopic "${subtopics[index].name}"...`, "info");

    try {
      const newSubtopic = await rerollSubtopic(
        theme.trim(),
        subtopics,
        index,
        { provider, apiKey, model },
      );

      const updated = [...subtopics];
      updated[index] = newSubtopic;
      setSubtopics(updated);
      addLog(`✅ New subtopic: "${newSubtopic.name}" (${newSubtopic.type} · ${newSubtopic.domain} · ${newSubtopic.style})`, "success");
    } catch (err: any) {
      addLog(`❌ Re-roll failed: ${err.message}`, "error");
    } finally {
      setRerollingIndex(undefined);
    }
  };

  // ── Generate Questions (shared) ───────────────────────────────────
  // If results already exist (loaded from DB), append instead of replacing
  const isAppendingQuestions = results.length > 0 && status === "success";

  const handleGenerate = async () => {
    const activeMode = subtopics.length > 0 ? "themed" : "topic";
    setGenerationMode(activeMode);

    const topicList =
      activeMode === "themed"
        ? subtopics.map((s) => s.name).filter((n) => n.trim().length > 0)
        : rawInput.split(/[,\n]+/).map((t) => t.trim()).filter((t) => t.length > 0);

    if (topicList.length === 0) return;
    if (!apiKey) {
      addLog("Error: API Key is required to generate questions.", "error");
      return;
    }

    // When appending, skip the clear — keep existing results
    // Also verify the topic name matches (prevent wrong-topic append)
    const appending = isAppendingQuestions && topicList.length === 1
      && topicNames.length === 1 && topicNames[0] === topicList[0];
    if (!appending) {
      setResults([]);
      clearLogs();
    } else {
      addLog(`📎 Appending ${questionCount} more questions to existing ${results[0].questions.length} for "${topicList[0]}"`, "info");
    }

    setStatus("generating");
    if (!appending) {
      setTopicNames(topicList);
    }

    addLog("Initializing generation pipeline...", "info");
    if (generationMode === "themed") {
      addLog(`Theme: "${theme}"`, "info");
    }
    addLog(`Topics: ${topicList.join(", ")}`, "info");
    addLog(`Personas: ${personas.join(", ")}`, "info");

    // Guard against obviously invalid API keys
    if (apiKey.trim() === "sa:1" || apiKey.length < 10) {
      addLog("❌ API Key looks invalid (too short or placeholder). Please check your key.", "error");
      setStatus("error");
      return;
    }

    try {
      const allSelected = selectedLenses.length === ALL_LENSES.length
        && selectedForms.length === ALL_FORMS.length
        && selectedBackdoors.length === ALL_BACKDOORS.length;

      addLog(
        allSelected
          ? "Using all lenses, forms, and backdoors (default)."
          : `Custom selection: ${selectedLenses.length} lenses, ${selectedForms.length} forms, ${selectedBackdoors.length} backdoors.`,
        "info",
      );

      addLog(`Calling AI (${provider} / ${model})...`, "info");

      let existingAnswers: string[] | undefined;
      let existingLenses: string[] | undefined;
      
      if (appending && results.length === 1) {
        existingAnswers = results[0].questions.map(q => q.answer_text).filter(Boolean);
        existingLenses = results[0].questions.map(q => q.lens).filter(Boolean);
      }

      const genResults = await generateCompactQuizQuestions({
        topics: topicList,
        personas,
        provider,
        apiKey,
        model,
        questionCount,
        lensMode,
        existingAnswers,
        existingLenses,
        onProgress: (msg) => addLog(msg, "info"),
        selectedLenses: allSelected ? undefined : (selectedLenses as LensType[]),
        selectedForms: allSelected ? undefined : (selectedForms as FormType[]),
        selectedBackdoors: allSelected ? undefined : (selectedBackdoors as BackdoorType[]),
        ...(generationMode === "themed" ? { theme: theme.trim(), subtopics } : {}),
      });

      let finalResults = genResults;
      if (appending && results.length === 1) {
        // Append: merge new questions into the existing result for this topic
        const existing = results[0];
        const merged: GenerationResult = {
          ...existing,
          questions: [...existing.questions, ...genResults[0].questions],
          total_api_calls: existing.total_api_calls + genResults[0].total_api_calls,
          regenerations: existing.regenerations + genResults[0].regenerations,
        };
        finalResults = [merged];
        setResults(finalResults);
        addLog(
          `✅ Appended ${genResults[0].questions.length} questions — total: ${merged.questions.length}`,
          "success",
        );
      } else {
        addLog(`✅ Generation complete! ${genResults.length} topic(s) generated.`, "success");

        // Log per-topic stats
        for (let i = 0; i < genResults.length; i++) {
          const r = genResults[i];
          addLog(
            `Topic ${i + 1}: ${r.questions.length} questions · ${r.total_api_calls} API calls · ${r.regenerations} regenerations`,
            "info",
          );
          // Track topic for recent quick-pick
          store.addRecentTopic(topicNames[i] || topicList[i]);
        }

        setResults(finalResults);
      }
      setStatus("success");

      // Auto-save logic
      if (user) {
        let savedCount = 0;
        addLog("💾 Auto-saving to library...", "info");
        for (let i = 0; i < finalResults.length; i++) {
          const r = finalResults[i];
          const topicName = topicNames[i] || `Topic ${i + 1}`;
          const subtopicMeta = generationMode === "themed" ? subtopics[i] : undefined;
          const tags = ["Grid", topicName];
          if (generationMode === "themed" && theme.trim()) {
            tags.push(`Theme:${theme.trim()}`);
          }
          if (subtopicMeta) {
            tags.push(subtopicMeta.type, subtopicMeta.domain, subtopicMeta.style);
          }
          const topicPersona = personas[i % personas.length] || "Casual Explorer";
          const uniquePersonas = new Set<string>();
          const uniqueLenses = new Set<string>();
          r.questions.forEach((q: any) => {
            if (q.persona) uniquePersonas.add(q.persona);
            else if (topicPersona) uniquePersonas.add(topicPersona);
            if (q.lens) uniqueLenses.add(q.lens);
          });
          uniquePersonas.forEach((p) => tags.push(`Persona:${p}`));
          uniqueLenses.forEach((l) => tags.push(`Lens:${l}`));
          try {
            // Check if topic exists in library for this user
            const { data: existingTopic } = await supabase
              .from("categories_library")
              .select("id, data")
              .eq("name", topicName)
              .eq("created_by", user.id)
              .single();

            if (existingTopic) {
              // Merge questions without duplicates (by question text)
              const existingQuestions = existingTopic.data || [];
              const newQuestions = r.questions.filter(
                (nq) => !existingQuestions.some((eq: any) => (eq.question_text || eq.question) === nq.question_text)
              );

              if (newQuestions.length > 0) {
                const mergedQuestions = [...existingQuestions, ...newQuestions];
                const { error } = await supabase
                  .from("categories_library")
                  .update({ data: mergedQuestions, tags })
                  .eq("id", existingTopic.id);
                if (!error) savedCount++;
              } else {
                addLog(`⚠️ No new questions appended for ${topicName} (all were duplicates).`, "info");
              }
            } else {
              // Insert new topic
              const { error } = await supabase.from("categories_library").insert([
                {
                  name: topicName,
                  main_category: generationMode === "themed" && theme.trim() ? theme.trim() : topicName,
                  description: `AI Generated: ${topicName}${generationMode === "themed" ? ` (Theme: ${theme.trim()})` : ""}`,
                  data: r.questions,
                  is_global: true,
                  tags,
                  created_by: user.id,
                },
              ]);
              if (!error) savedCount++;
            }
          } catch (e: any) {
            addLog(`❌ Auto-save failed for ${topicName}: ${e.message}`, "error");
          }
        }
        if (savedCount > 0) {
          addLog(`✅ Saved ${savedCount} topic(s) to your library!`, "success");
        }
      }

      // Auto-scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch (err: any) {
      addLog(`❌ Generation failed: ${err.message}`, "error");
      setStatus("error");
    }
  };

  // ── Auth gate: non-authenticated users see a prompt ───────────────
  if (authChecked && !user) {
    return (
      <div className="min-h-screen bg-clay-cream">
        <header className="flex items-center gap-4 p-4 sm:p-6 max-w-3xl mx-auto">
          <button
            onClick={onBack}
            className="clay-btn p-3 flex items-center justify-center text-plum/60 hover:text-plum transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-outfit font-black text-xl sm:text-2xl text-plum">
              🧠 AI Quiz Generator
            </h1>
            <p className="text-[10px] text-plum/40 font-medium mt-0.5">
              Generate quiz questions for your 5×5 grid
            </p>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 pt-20">
          <div className="clay p-10 text-center space-y-6">
            <span className="text-5xl">🔐</span>
            <div className="space-y-2">
              <h2 className="font-outfit font-black text-lg text-plum">
                Login to Create Your Own Content
              </h2>
              <p className="text-xs text-plum/40 font-medium max-w-sm mx-auto leading-relaxed">
                Sign in to generate and save quiz questions to your library.
                Your content will be available across all your games.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => setShowAuth(true)}
                className="clay-btn bg-soft-purple text-white font-outfit font-bold py-3 px-8 text-sm flex items-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
              <button
                onClick={onBack}
                className="text-[10px] font-bold text-plum/30 hover:text-plum/60 transition-colors"
              >
                Back to Home
              </button>
            </div>

            {/* Auth Modal */}
            {showAuth && (
              <Auth
                onSuccess={() => setShowAuth(false)}
                onClose={() => setShowAuth(false)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Auth check loading ────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-clay-cream">
      {/* Header */}
      <header className="flex items-center gap-4 p-4 sm:p-6 max-w-3xl mx-auto">
        <button
          onClick={onBack}
          className="clay-btn p-3 flex items-center justify-center text-plum/60 hover:text-plum transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-outfit font-black text-xl sm:text-2xl text-plum">
            🧠 AI Quiz Generator
          </h1>
          <p className="text-[10px] text-plum/40 font-medium mt-0.5">
            Generate quiz questions for your 5×5 grid in seconds
          </p>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 space-y-6">

        {/* ── 1. Unified Smart Input Card ────────────────────── */}
        <div className="clay p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black uppercase tracking-wider text-plum/60">
              {generationMode === "topic" ? "What do you feel like playing?" : "What theme do you feel like exploring?"}
            </label>
            <button
              onClick={() => setShowLoadLibrary(true)}
              className="text-[10px] font-bold text-soft-purple hover:underline flex items-center gap-1"
            >
              📚 Browse Library
            </button>
          </div>

          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={
              generationMode === "topic"
                ? 'Type whatever you feel like! e.g. "Physics, Chemistry, Astronomy" OR describe your game (e.g. "An easy history quiz for kids", "Classic rock hits")'
                : 'Type whatever you feel like! e.g. "Ancient Rome", "Marvel Cinematic Universe", or "1990s Hip Hop"'
            }
            className="w-full h-24 clay-input p-3.5 font-outfit font-bold text-sm placeholder:text-plum/25 rounded-xl bg-warm-white border border-warm-gray/20 focus:border-soft-purple/50 focus:outline-none resize-none"
          />

          <p className="text-[10px] text-plum/40 font-medium">
            ✨ Feel free to type anything! You can list categories, enter a theme, or describe the specific quiz style or audience you want in plain English.
          </p>

          {/* Minimal row for necessary settings: Mode, Count & Strategy */}
          <div className="flex flex-col gap-3 text-xs font-outfit font-bold text-plum/60 bg-plum/[0.02] border border-clay-border/10 p-3.5 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Generation Mode Selector */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  Mode:
                  <button
                    onClick={() => setShowModeHelp(!showModeHelp)}
                    className={clsx(
                      "p-0.5 rounded-full hover:bg-warm-gray/10 transition-colors",
                      showModeHelp ? "text-soft-purple" : "text-plum/30"
                    )}
                    title="Explain modes"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </span>
                <div className="flex bg-clay-cream p-0.5 rounded-lg border border-clay-border/10">
                  <button
                    onClick={() => {
                      setGenerationMode("topic");
                      setSubtopics([]); // clear subtopics when switching to topic mode
                    }}
                    className={clsx(
                      "px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-200",
                      generationMode === "topic"
                        ? "bg-white text-plum shadow-sm"
                        : "text-plum/50 hover:text-plum"
                    )}
                  >
                    📝 Topic Mode
                  </button>
                  <button
                    onClick={() => setGenerationMode("themed")}
                    className={clsx(
                      "px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-200",
                      generationMode === "themed"
                        ? "bg-white text-plum shadow-sm"
                        : "text-plum/50 hover:text-plum"
                    )}
                  >
                    🎭 Theme Mode
                  </button>
                </div>
              </div>

              {/* Questions per Topic Selector */}
              <div className="flex items-center gap-2">
                <span>Questions per Topic:</span>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                  className="clay-input py-1.5 px-3 rounded-lg text-xs font-bold bg-warm-white border border-warm-gray/15 text-plum focus:outline-none cursor-pointer"
                >
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                  <option value={15}>15 Questions</option>
                  <option value={20}>20 Questions</option>
                  <option value={25}>25 Questions</option>
                  <option value={30}>30 Questions</option>
                </select>
              </div>

              {/* Strategy Selector */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  Strategy:
                  <button
                    onClick={() => setShowStrategyHelp(!showStrategyHelp)}
                    className={clsx(
                      "p-0.5 rounded-full hover:bg-warm-gray/10 transition-colors",
                      showStrategyHelp ? "text-soft-purple" : "text-plum/30"
                    )}
                    title="Explain strategies"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </span>
                <div className="flex bg-clay-cream p-0.5 rounded-lg border border-clay-border/10">
                  <button
                    onClick={() => setLensMode("diverse")}
                    className={clsx(
                      "px-3 py-1 rounded-md text-[10px] font-bold transition-all duration-200",
                      lensMode === "diverse"
                        ? "bg-white text-plum shadow-sm"
                        : "text-plum/50 hover:text-plum"
                    )}
                    title="Diverse: AI rotates conceptual lenses per question"
                  >
                    🔀 Diverse
                  </button>
                  <button
                    onClick={() => setLensMode("focused")}
                    className={clsx(
                      "px-3 py-1 rounded-md text-[10px] font-bold transition-all duration-200",
                      lensMode === "focused"
                        ? "bg-white text-plum shadow-sm"
                        : "text-plum/50 hover:text-plum"
                    )}
                    title="Focused: AI locks onto one conceptual lens for all questions"
                  >
                    🎯 Focused
                  </button>
                </div>
              </div>
            </div>

            {/* Mode Explanations (Detailed with Examples) */}
            {showModeHelp && (
              <div className="text-[10px] text-plum/50 font-medium leading-relaxed border-t border-clay-border/5 pt-2.5 space-y-2 animate-slide-up-fade">
                <div>
                  <p className="font-bold text-plum/70 flex items-center gap-1">
                    <span>📝 Topic Mode</span>
                  </p>
                  <p className="mt-0.5">
                    Generates questions directly for multiple distinct categories or areas. You type them as a comma-separated list (e.g. <code>Physics, Chemistry, Astronomy</code>). The AI will generate a set of questions for each. Best when you already know your grid categories.
                  </p>
                </div>
                <div>
                  <p className="font-bold text-plum/70 flex items-center gap-1">
                    <span>🎭 Theme Mode (Default)</span>
                  </p>
                  <p className="mt-0.5">
                    Builds a fully-integrated thematic experience from a single overarching idea (e.g. <code>Ancient Rome</code> or <code>1990s Pop Hits</code>). The AI will brainstorm 5 subtopics representing different facets, allowing you to edit and customize them before generating questions. Perfect for cohesive themed game nights.
                  </p>
                </div>
              </div>
            )}

            {/* Strategy Explanations (Detailed with Examples) */}
            {showStrategyHelp && (
              <div className="text-[10px] text-plum/50 font-medium leading-relaxed border-t border-clay-border/5 pt-2.5 space-y-2 animate-slide-up-fade">
                <div>
                  <p className="font-bold text-plum/70 flex items-center gap-1">
                    <span>🔀 Diverse Strategy</span>
                  </p>
                  <p className="mt-0.5">
                    Rotates conceptual lenses (e.g. Origin Story, Rivalry, Numbers, Cultural Impact) per question. For example, Q1 might focus on a founder story, Q2 on a bitter feud, and Q3 on a mind-boggling scale. This ensures a varied, multi-faceted round that stays fresh.
                  </p>
                </div>
                <div>
                  <p className="font-bold text-plum/70 flex items-center gap-1">
                    <span>🎯 Focused Strategy</span>
                  </p>
                  <p className="mt-0.5">
                    Locks the entire round into one single conceptual lens (e.g. all 5 questions are written strictly through the lens of "The Unexpected" or "Behind the Scenes"). Best for specific rounds where you want a very uniform style or tone.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {generationMode === "topic" ? (
              <button
                onClick={handleGenerate}
                disabled={!rawInput.trim() || status === "generating"}
                className="flex-1 clay-btn py-3 bg-soft-purple text-white font-outfit font-bold text-sm hover:bg-soft-purple/90 transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {status === "generating" ? "Generating Questions..." : "Generate Questions"}
              </button>
            ) : subtopics.length === 0 ? (
              <button
                onClick={handleThemeGenerate}
                disabled={!rawInput.trim() || generatingSubtopics}
                className="flex-1 clay-btn py-3 bg-soft-purple text-white font-outfit font-bold text-sm hover:bg-soft-purple/90 transition-colors flex items-center justify-center gap-2"
              >
                {generatingSubtopics ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generatingSubtopics ? "Suggesting Subtopics..." : "Suggest 5 Subtopics"}
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={generatingSubtopics || subtopics.length === 0 || status === "generating"}
                className="flex-1 clay-btn py-3 bg-soft-purple text-white font-outfit font-bold text-sm hover:bg-soft-purple/90 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {status === "generating"
                  ? "Generating Questions..."
                  : isAppendingQuestions
                    ? `Append 5 Questions (total: ${(results[0]?.questions.length || 0) + 5})`
                    : `Generate ${subtopics.length * 5} Questions`}
              </button>
            )}
          </div>

          {/* Quick Pick Chips */}
          {((recentTopics && recentTopics.length > 0) || (recentThemes && recentThemes.length > 0)) && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-clay-border/10">
              <span className="text-[9px] font-bold text-plum/25 uppercase tracking-wider flex-shrink-0">
                Quick Picks:
              </span>
              {Array.from(new Set([...(recentTopics || []), ...(recentThemes || [])]))
                .slice(0, 8)
                .map((t) => (
                  <button
                    key={t}
                    onClick={() => setRawInput(t)}
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
        </div>

        {/* ── Themed Mode: Auto-Phase Banner ──────────── */}
        {generationMode === "themed" && autoPhase && subtopics.length === 0 && (
          <div className="clay p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{PHASE_ICONS[autoPhase.phase]}</span>
              <span className="font-outfit font-black text-sm text-plum">
                Phase {autoPhase.phase}/4 — {autoPhase.label}
              </span>
            </div>
            <p className="text-[10px] text-plum/40 font-medium">
              {autoPhase.rationale}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-bold text-soft-purple bg-soft-purple-light/30 px-2 py-0.5 rounded-full">
                {autoPhase.types.length}/6 Types
              </span>
              <span className="text-[9px] font-bold text-sky bg-sky-light/30 px-2 py-0.5 rounded-full">
                {autoPhase.domains.length}/5 Domains
              </span>
              <span className="text-[9px] font-bold text-mint bg-mint-light/30 px-2 py-0.5 rounded-full">
                {autoPhase.styles.length}/4 Styles
              </span>
            </div>
          </div>
        )}

        {/* ── 2. Suggested Subtopics List Card ─────────────────── */}
        {subtopics.length > 0 && (
          <div className="clay p-5 sm:p-6 space-y-4 animate-slide-up-fade">
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
              {subtopics.length} subtopics suggested. Review, re-roll, delete or customize:
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
                    <span className="text-lg flex-shrink-0" title={sub.type}>
                      {typeMeta.icon}
                    </span>
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
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRerollSubtopic(i)}
                        disabled={isRerolling || typeof rerollingIndex === "number"}
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
                      <button
                        onClick={() => handleRemoveSubtopic(i)}
                        disabled={typeof rerollingIndex === "number"}
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

            {/* Subtopic actions */}
            <div className="pt-2 space-y-3">
              {/* Save to library */}
              {user && (
                <div className="clay p-3 bg-mint-light/10 border border-mint/15 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="font-outfit font-bold text-xs text-mint">
                        💾 Save {subtopics.length} subtopic{subtopics.length !== 1 ? 's' : ''} to Library
                      </p>
                      <p className="text-[9px] text-plum/30 font-medium mt-0.5">
                        Saves theme "{theme}" and all subtopics as empty topics — generate questions later
                      </p>
                    </div>
                    <button
                      onClick={handleSaveSubtopics}
                      disabled={savingSubtopics || typeof rerollingIndex === "number"}
                      className="clay-btn px-4 py-2 rounded-xl font-outfit font-bold text-xs
                        bg-mint text-white hover:bg-mint/90 transition-colors
                        flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingSubtopics ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {savingSubtopics ? 'Saving...' : 'Save to Library'}
                    </button>
                  </div>
                </div>
              )}

              {/* Append & Add Custom */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleThemeAppend}
                  disabled={appendingSubtopics || generatingSubtopics || typeof rerollingIndex === "number"}
                  className="flex-1 clay-btn py-2.5 rounded-xl font-outfit font-bold text-xs bg-soft-purple/10 text-soft-purple hover:bg-soft-purple/20 transition-all flex items-center justify-center gap-1.5"
                >
                  {appendingSubtopics ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {appendingSubtopics ? "Appending..." : "Append 5 More Subtopics"}
                </button>
              </div>

              {/* Add custom topic form */}
              <div>
                {showCustomInput ? (
                  <div className="flex gap-2">
                    <input
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddCustomSubtopic();
                        if (e.key === "Escape") setShowCustomInput(false);
                      }}
                      placeholder="Custom topic name..."
                      className="flex-1 clay-input px-3 py-2 text-xs font-outfit font-bold text-plum
                        rounded-lg bg-warm-white border border-warm-gray/20 focus:border-soft-purple/50
                        focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleAddCustomSubtopic}
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

              {/* Generate questions button for subtopics */}
              <button
                onClick={handleGenerate}
                disabled={generatingSubtopics || subtopics.length === 0 || status === "generating"}
                className="w-full clay-btn py-3 bg-soft-purple text-white font-outfit font-bold text-sm hover:bg-soft-purple/90 transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Sparkles className="w-4 h-4" />
                {status === "generating"
                  ? "Generating Questions..."
                  : isAppendingQuestions
                    ? `Append 5 Questions (total: ${(results[0]?.questions.length || 0) + 5})`
                    : `Generate ${subtopics.length * 5} Questions`}
              </button>
            </div>
          </div>
        )}

        {/* ── 3. Collapsible Advanced Settings Accordion ───────── */}
        <div className="clay p-5 sm:p-6 space-y-1">
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="flex items-center gap-2 text-sm font-outfit font-bold text-plum/60 hover:text-soft-purple transition-colors w-full"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                showAdvancedSettings ? "rotate-0" : "-rotate-90"
              }`}
            />
            ⚙️ Advanced Customization Settings
            <span className="text-[10px] text-plum/30 font-normal ml-auto">
              {showAdvancedSettings ? "Hide customization options" : "Configure strategy, personas, and styles"}
            </span>
          </button>

          {showAdvancedSettings && (
            <div className="space-y-6 pt-4 border-t border-clay-border/10 mt-4 animate-slide-up-fade">
              {/* Provider Config */}
              <ProviderConfig
                provider={provider}
                onProviderChange={setProvider}
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
                model={model}
                onModelChange={setModel}
                collapsed={false}
                onToggleCollapse={() => {}}
              />

              {/* Volume & Strategy (Now handled in minimal format inside main card) */}

              {/* Persona Picker */}
              <div className="border-t border-clay-border/10 pt-4">
                <PersonaPicker selected={personas} onChange={setPersonas} />
              </div>

              {/* Selected Persona details */}
              {personas.length > 0 && (
                <DescriptionPanel
                  title="Selected Personas"
                  icon={<span>👥</span>}
                  items={personas.map((p) => {
                    const meta = PERSONA_META.find((m) => m.id === p);
                    return {
                      id: p,
                      label: meta?.label || p,
                      subtitle: meta?.subtitle || "",
                      description: meta?.description || "",
                      icon: meta?.icon,
                      color: meta?.color,
                    };
                  })}
                />
              )}

              {/* Theme Mode subtopic matrix picker grids */}
              {generationMode === "themed" && (
                <div className="border-t border-clay-border/10 pt-4 space-y-6">
                  <span className="text-[10px] text-plum/50 font-bold uppercase tracking-wider block">
                    Theme Subtopic Suggestion Settings
                  </span>
                  <div className="text-[10px] text-plum/40 font-medium leading-relaxed bg-plum/[0.01] p-3 rounded-lg border border-plum/[0.03]">
                    💡 AI automatically discovers which subtopic Types, Domains, and Styles to suggest based on your current library count (Phase discovery). To manually customize what subtopics to get, uncheck any items below.
                  </div>
                  <PickerGrid
                    label="🎯 Subtopic Types"
                    subtitle="Select which subtopic types AI can suggest."
                    items={THEME_TYPE_ITEMS}
                    selected={selectedThemeTypes}
                    onChange={setSelectedThemeTypes}
                  />
                  <PickerGrid
                    label="📖 Knowledge Domains"
                    subtitle="Select which knowledge categories AI can suggest."
                    items={THEME_DOMAIN_ITEMS}
                    selected={selectedThemeDomains}
                    onChange={setSelectedThemeDomains}
                  />
                  <PickerGrid
                    label="📋 Quiz Styles"
                    subtitle="Select which quiz gameplay styles AI can suggest."
                    items={THEME_STYLE_ITEMS}
                    selected={selectedThemeStyles}
                    onChange={setSelectedThemeStyles}
                  />
                </div>
              )}

              {/* Lenses, Forms, Backdoors Picker grids */}
              <div className="border-t border-clay-border/10 pt-4 space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-plum/50 font-bold uppercase tracking-wider">
                    Advanced Settings grids
                  </span>
                  <div className="flex gap-1 bg-clay-cream p-0.5 rounded-lg border border-clay-border/10">
                    <button
                      onClick={() => setAdvancedViewMode("tiles")}
                      className={clsx(
                        "px-3 py-1 rounded-md text-[9px] font-bold transition-all duration-200",
                        advancedViewMode === "tiles"
                          ? "bg-white text-plum shadow-sm"
                          : "text-plum/50 hover:text-plum"
                      )}
                    >
                      🎴 Tiles
                    </button>
                    <button
                      onClick={() => setAdvancedViewMode("detailed")}
                      className={clsx(
                        "px-3 py-1 rounded-md text-[9px] font-bold transition-all duration-200",
                        advancedViewMode === "detailed"
                          ? "bg-white text-plum shadow-sm"
                          : "text-plum/50 hover:text-plum"
                      )}
                    >
                      📖 Detailed
                    </button>
                  </div>
                </div>

                {advancedViewMode === "tiles" ? (
                  <>
                    <PickerGrid
                      label="🎨 Conceptual Lenses"
                      subtitle="Which lenses to use. Each question gets a unique lens."
                      items={LENS_ITEMS}
                      selected={selectedLenses}
                      onChange={setSelectedLenses}
                    />
                    <PickerGrid
                      label="📝 Syntactic Forms"
                      subtitle="Which sentence structures to use. Rotate through all selected."
                      items={FORM_ITEMS}
                      selected={selectedForms}
                      onChange={setSelectedForms}
                      columns={5}
                    />
                    <PickerGrid
                      label="🔑 Backdoor Types"
                      subtitle="Which logical pathways are available. LLM picks the best fit per question."
                      items={BACKDOOR_ITEMS}
                      selected={selectedBackdoors}
                      onChange={setSelectedBackdoors}
                    />
                  </>
                ) : (
                  <div className="space-y-8">
                    {/* Detailed Lenses */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-outfit font-bold text-sm text-plum">🎨 Conceptual Lenses</h4>
                          <p className="text-[10px] text-plum/50 font-medium">Pick which lenses to use. Each question gets a unique lens.</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedLenses(ALL_LENSES.map(l => l))}
                            className="text-[9px] font-bold text-soft-purple hover:underline"
                          >
                            Select All
                          </button>
                          <span className="text-plum/20 text-[9px] font-bold">|</span>
                          <button
                            onClick={() => setSelectedLenses([])}
                            className="text-[9px] font-bold text-peach hover:underline"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {ALL_LENSES.map((l) => {
                          const isSelected = selectedLenses.includes(l);
                          return (
                            <label
                              key={l}
                              className={clsx(
                                "flex items-start gap-3 p-3 clay hover:bg-plum/5 cursor-pointer transition-colors",
                                isSelected && "ring-1 ring-soft-purple/20 bg-soft-purple-light/5"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedLenses(selectedLenses.filter(x => x !== l));
                                  } else {
                                    setSelectedLenses([...selectedLenses, l]);
                                  }
                                }}
                                className="mt-1 accent-soft-purple rounded"
                              />
                              <span className="text-lg flex-shrink-0">{getLensIcon(l)}</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-outfit font-bold text-xs sm:text-sm text-plum">{l}</span>
                                  <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-soft-purple bg-soft-purple-light/20 px-1.5 py-0.5 rounded">
                                    {getLensSubtitle(l)}
                                  </span>
                                </div>
                                <p className="text-[10px] sm:text-xs text-plum/60 leading-relaxed mt-1">
                                  {getLensDescription(l)}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Detailed Forms */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-outfit font-bold text-sm text-plum">📝 Syntactic Forms</h4>
                          <p className="text-[10px] text-plum/50 font-medium">Pick which sentence structures to use. Rotate through all selected.</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedForms(ALL_FORMS.map(f => f))}
                            className="text-[9px] font-bold text-soft-purple hover:underline"
                          >
                            Select All
                          </button>
                          <span className="text-plum/20 text-[9px] font-bold">|</span>
                          <button
                            onClick={() => setSelectedForms([])}
                            className="text-[9px] font-bold text-peach hover:underline"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {ALL_FORMS.map((f) => {
                          const isSelected = selectedForms.includes(f);
                          const label = f.replace(/^Form \d+ \((.+)\)$/, "$1");
                          return (
                            <label
                              key={f}
                              className={clsx(
                                "flex items-start gap-3 p-3 clay hover:bg-plum/5 cursor-pointer transition-colors",
                                isSelected && "ring-1 ring-sky/20 bg-sky-light/5"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedForms(selectedForms.filter(x => x !== f));
                                  } else {
                                    setSelectedForms([...selectedForms, f]);
                                  }
                                }}
                                className="mt-1 accent-sky rounded"
                              />
                              <span className="text-lg flex-shrink-0">{getFormIcon(f)}</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-outfit font-bold text-xs sm:text-sm text-plum">{label}</span>
                                  <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-sky bg-sky-light/20 px-1.5 py-0.5 rounded">
                                    {getFormSubtitle(f)}
                                  </span>
                                </div>
                                <p className="text-[10px] sm:text-xs text-plum/60 leading-relaxed mt-1">
                                  {getFormDescription(f)}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Detailed Backdoors */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-outfit font-bold text-sm text-plum">🔑 Backdoor Types</h4>
                          <p className="text-[10px] text-plum/50 font-medium">Pick which logical pathways are available. LLM picks the best fit per question.</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedBackdoors(ALL_BACKDOORS.map(b => b))}
                            className="text-[9px] font-bold text-soft-purple hover:underline"
                          >
                            Select All
                          </button>
                          <span className="text-plum/20 text-[9px] font-bold">|</span>
                          <button
                            onClick={() => setSelectedBackdoors([])}
                            className="text-[9px] font-bold text-peach hover:underline"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {ALL_BACKDOORS.map((b) => {
                          const isSelected = selectedBackdoors.includes(b);
                          return (
                            <label
                              key={b}
                              className={clsx(
                                "flex items-start gap-3 p-3 clay hover:bg-plum/5 cursor-pointer transition-colors",
                                isSelected && "ring-1 ring-mint/20 bg-mint-light/5"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedBackdoors(selectedBackdoors.filter(x => x !== b));
                                  } else {
                                    setSelectedBackdoors([...selectedBackdoors, b]);
                                  }
                                }}
                                className="mt-1 accent-mint rounded"
                              />
                              <span className="text-lg flex-shrink-0">{getBackdoorIcon(b)}</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-outfit font-bold text-xs sm:text-sm text-plum">{b}</span>
                                  <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-mint bg-mint-light/20 px-1.5 py-0.5 rounded">
                                    {getBackdoorSubtitle(b)}
                                  </span>
                                </div>
                                <p className="text-[10px] sm:text-xs text-plum/60 leading-relaxed mt-1">
                                  {getBackdoorDescription(b)}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div ref={resultsRef} className="space-y-8 animate-slide-up-fade">
            <div className="flex items-center gap-3">
              <h2 className="font-outfit font-black text-lg text-plum">Results</h2>
              <span className="clay-badge bg-mint-light text-mint text-[10px]">
                {results.reduce((sum, r) => sum + r.questions.length, 0)} questions
              </span>
            </div>

            {results.map((result, topicIdx) => (
              <div key={topicIdx} className="space-y-4">
                {/* Topic header */}
                <h3 className="font-outfit font-bold text-sm text-plum/60 uppercase tracking-wider">
                  {topicNames[topicIdx] || `Topic ${topicIdx + 1}`}
                  <span className="text-plum/30 ml-2 font-normal normal-case">
                    ({result.questions.length} questions)
                  </span>
                </h3>

                {/* Questions Blocked for Suspense */}
                <div className="clay p-5 text-center bg-soft-purple-light/20 border-soft-purple/30 flex flex-col items-center gap-3">
                  <div>
                    <p className="font-outfit font-black text-soft-purple text-lg mb-1">🤫 Questions Hidden</p>
                    <p className="text-sm font-medium text-plum/60">
                      The {result.questions.length} questions have been auto-saved to your Library. We hide them here so you can play with your friends without seeing the answers!
                    </p>
                  </div>
                  <button
                    onClick={() => setRevealedTopics((prev) => ({ ...prev, [topicIdx]: !prev[topicIdx] }))}
                    className="clay-btn bg-soft-purple text-white px-5 py-2.5 rounded-xl text-xs font-bold font-outfit hover:bg-soft-purple/90 transition-colors"
                  >
                    {revealedTopics[topicIdx] ? "🙈 Hide Questions" : "👁️ Reveal Questions"}
                  </button>
                </div>

                {/* Question Preview List (revealed on demand) */}
                {revealedTopics[topicIdx] && (
                  <div className="space-y-4 animate-slide-up-fade">
                    {result.questions.map((q: any, qIdx: number) => (
                      <QuestionPreview key={qIdx} question={q} index={qIdx} />
                    ))}
                  </div>
                )}

                {/* Audit */}
                <AuditPanel
                  audit={result.audit}
                  apiCalls={result.total_api_calls}
                  regenerations={result.regenerations}
                />
              </div>
            ))}

            {/* Logs */}
            <GenerationLogs
              logs={logs}
              collapsed={logsCollapsed}
              onToggleCollapse={() => setLogsCollapsed(!logsCollapsed)}
              onClear={clearLogs}
            />
          </div>
        )}

        {/* Empty state (before first generation) */}
        {results.length === 0 && status === "idle" && (
          <div className="clay p-8 text-center space-y-3">
            <span className="text-3xl">✨</span>
            <p className="font-outfit font-bold text-sm text-plum/40">
              Enter topics above and click Generate
            </p>
            <p className="text-[10px] text-plum/30 font-medium">
              Your questions will appear here with full metadata — lens, form, backdoor, tags, and quality checks.
            </p>
          </div>
        )}

        {/* Error state */}
        {status === "error" && results.length === 0 && (
          <div className="clay p-6 text-center space-y-3 border-peach/30">
            <span className="text-2xl">❌</span>
            <p className="font-outfit font-bold text-sm text-peach">
              Generation failed
            </p>
            <p className="text-[10px] text-plum/40 font-medium">
              Check the logs above for details. Verify your API key and try again.
            </p>
            <button
              onClick={handleGenerate}
              className="clay-btn px-4 py-2 text-xs font-bold text-peach/70 hover:text-peach"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Load from Library modal */}
      <LoadFromLibrary
        open={showLoadLibrary}
        onClose={() => setShowLoadLibrary(false)}
        onSelectTopic={handleLoadTopic}
        onSelectTheme={handleLoadTheme}
        filterUserId={user?.id}
      />
    </div>
  );
}
