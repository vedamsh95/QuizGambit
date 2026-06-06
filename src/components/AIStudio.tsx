import { useState, useCallback, useRef, useMemo } from "react";
import { ArrowLeft, Sparkles, Loader2, ChevronDown, Eye, EyeOff, SlidersHorizontal, Zap, ShieldCheck, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { store } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { generateAdminQuizQuestions, reverifyQuestion } from "../lib/ai";
import { buildCustomSystemPrompt } from "../lib/ai/prompts/system";
import type { PlayerPersona, LensType, FormType, BackdoorType, GenerationResult, AdminGeneratorConfig, QuizGambitQuestion, CustomLLMParams, GameMode, TopicType, KnowledgeDomain, QuizStyle } from "../lib/ai/types";
import { ALL_LENSES, ALL_FORMS, ALL_BACKDOORS, ALL_TOPIC_TYPES, ALL_KNOWLEDGE_DOMAINS, ALL_QUIZ_STYLES } from "../lib/ai/types";
import {
  ProviderConfig,
  TopicInput,
  ThemeInput,
  ModeSelector,
  PersonaPicker,
  PickerGrid,
  DescriptionPanel,
  QuestionPreview,
  AuditPanel,
  GenerationLogs,
  SaveToLibrary,
  LoadFromLibrary,
  GenerateButton,
} from "./ai-generator";
import type { AIProvider } from "./ai-generator";
import type { LogEntry } from "./ai-generator/GenerationLogs";
import type { TopicData } from "./ai-generator/SaveToLibrary";
import { PERSONA_META } from "./ai-generator/PersonaPicker";
import type { ThemeSubtopic } from "../lib/ai/types";
import { generateThemeSubtopics, rerollSubtopic } from "../lib/ai/themes";

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

function getLensIcon(lens: LensType): string {
  const map: Record<string, string> = {
    "Origin Story": "🔮", "The Unexpected": "⚡", "The Human Element": "👤",
    "Numbers & Scale": "📊", "The Rivalry": "⚔️", "The Oddity": "🤔",
    "Behind the Scenes": "🎬", "The Connection": "🔗", "What If?": "🤷", "The Legacy": "🏛️",
    "The Butterfly Effect": "🦋", "The Evolution": "🦎", "The Cultural Impact": "🌍",
  };
  return map[lens] || "💡";
}

function getLensSubtitle(lens: LensType): string {
  const map: Record<string, string> = {
    "Origin Story": "Wonder, discovery", "The Unexpected": "Surprise, shock",
    "The Human Element": "Empathy, drama", "Numbers & Scale": "Awe, scale",
    "The Rivalry": "Tension, drama", "The Oddity": "Amusement, curiosity",
    "Behind the Scenes": "Insider-feeling", "The Connection": "Mind-blown",
    "What If?": "Imagination, play", "The Legacy": "Significance, meaning",
    "The Butterfly Effect": "Small action, huge result",
    "The Evolution": "Change over time",
    "The Cultural Impact": "Shaped modern society",
  };
  return map[lens] || "";
}

function getFormIcon(form: FormType): string {
  const map: Record<string, string> = {
    "Form 1 (Action-First)": "🏃", "Form 2 (Parenthetical Hook)": "🔄",
    "Form 3 (Sensory Clue)": "👁️", "Form 4 (Active Quote)": "💬", "Form 5 (Direct Narrative)": "📖",
    "Form 6 (The Contradiction)": "🔄", "Form 7 (The Question Lead)": "❓",
    "Form 8 (The Timeline)": "📅", "Form 9 (The Misdirection)": "🎭",
    "Form 10 (Defining Trait)": "🏷️",
  };
  return map[form] || "📝";
}

function getFormSubtitle(form: FormType): string {
  const map: Record<string, string> = {
    "Form 1 (Action-First)": "Dynamic participle", "Form 2 (Parenthetical Hook)": "Dramatic contrast",
    "Form 3 (Sensory Clue)": "Color, texture", "Form 4 (Active Quote)": "Iconic phrase",
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
    "Synonym Bridge": "🔑", "Contrast Pop": "🎭", "Everyday Link": "🔗",
    "Anagram-Wordplay": "🧩", "Sequence Pattern": "🔢", "Sensory Logic": "👃", "Category Elimination": "🎯",
    "Etymology / Name Logic": "🗣️", "Functional Logic": "⚙️", "Pop Culture Hook": "🎬",
  };
  return map[b] || "🚪";
}

function getBackdoorSubtitle(b: BackdoorType): string {
  const map: Record<string, string> = {
    "Synonym Bridge": "Descriptive phrase", "Contrast Pop": "Familiar contrast",
    "Everyday Link": "Daily life connection", "Anagram-Wordplay": "Text pattern",
    "Sequence Pattern": "Recognizable order", "Sensory Logic": "Physical properties",
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

export interface AIStudioProps {
  onBack: () => void;
}

export default function AIStudio({ onBack }: AIStudioProps) {
  // ── Provider config ───────────────────────────────────────────────
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
  const [generationMode, setGenerationMode] = useState<"topic" | "themed">("topic");

  // ── Topic mode params ────────────────────────────────────────────
  const [topics, setTopics] = useState<string[]>([""]);

  // ── Theme mode params ────────────────────────────────────────────
  const [theme, setTheme] = useState("");
  const [subtopics, setSubtopics] = useState<ThemeSubtopic[]>([]);
  const [generatingSubtopics, setGeneratingSubtopics] = useState(false);
  const [rerollingIndex, setRerollingIndex] = useState<number | undefined>(undefined);
  const [appendingSubtopics, setAppendingSubtopics] = useState(false);
  const recentThemes = store.getRecentThemes();
  const recentTopics = store.getRecentTopics();

  // ── Theme matrix selectors (admin-only — which Types/Domains/Styles AI can use) ──
  const [selectedThemeTypes, setSelectedThemeTypes] = useState<string[]>(
    ALL_TOPIC_TYPES.map((t) => t),
  );
  const [selectedThemeDomains, setSelectedThemeDomains] = useState<string[]>(
    ALL_KNOWLEDGE_DOMAINS.map((d) => d),
  );
  const [selectedThemeStyles, setSelectedThemeStyles] = useState<string[]>(
    ALL_QUIZ_STYLES.map((s) => s),
  );

  // ── Shared params ────────────────────────────────────────────────
  const [personas, setPersonas] = useState<PlayerPersona[]>(["Casual Explorer"]);

  // ── Lens/form/backdoor selection ──────────────────────────────────
  const [selectedLenses, setSelectedLenses] = useState<string[]>(
    ALL_LENSES.map((l) => l),
  );
  const [selectedForms, setSelectedForms] = useState<string[]>(
    ALL_FORMS.map((f) => f),
  );
  const [selectedBackdoors, setSelectedBackdoors] = useState<string[]>(
    ALL_BACKDOORS.map((b) => b),
  );
  const [advancedViewMode, setAdvancedViewMode] = useState<"tiles" | "detailed">("tiles");

  // ── Custom LLM params (admin-only feature) ────────────────────────
  const [showLLMParams, setShowLLMParams] = useState(false);
  const [customLLMParams, setCustomLLMParams] = useState<CustomLLMParams>({
    temperature: 0.72,
    presence_penalty: 0.35,
    frequency_penalty: 0.18,
    top_p: 0.90,
  });

  // ── Quality checks (admin-only feature) ───────────────────────────
  const [runSolver, setRunSolver] = useState(false);
  const [runFactCheck, setRunFactCheck] = useState(false);

  // ── System prompt viewer (collapsed by default) ───────────────────
  const [showPrompt, setShowPrompt] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────
  const [configCollapsed, setConfigCollapsed] = useState(true);
  const [showLoadLibrary, setShowLoadLibrary] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [topicNames, setTopicNames] = useState<string[]>([]);
  const [logsCollapsed, setLogsCollapsed] = useState(false);
  const [reverifying, setReverifying] = useState<Record<string, boolean>>({});
  const [reverifyResults, setReverifyResults] = useState<Record<string, { solved: boolean; confidence: number; verified: boolean }>>({});
  const resultsRef = useRef<HTMLDivElement>(null);

  // ── Helpers ───────────────────────────────────────────────────────
  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const now = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { timestamp: now, message, type }]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // ── Build preview prompt (shown in viewer) ────────────────────────
  const previewPrompt = useMemo(() => {
    const topicList =
      generationMode === "themed"
        ? subtopics.map((s) => s.name).filter((n) => n.trim().length > 0)
        : topics.map((t) => t.trim()).filter((t) => t.length > 0);
    if (topicList.length === 0) return "";
    const effectivePersona = personas.length > 0 ? personas[0] : "Casual Explorer";
    return buildCustomSystemPrompt(
      effectivePersona,
      "GRID",
      topicList.join(", "),
      5,
      selectedLenses as LensType[],
      selectedForms as FormType[],
      selectedBackdoors as BackdoorType[],
      showLLMParams ? customLLMParams : undefined,
    );
  }, [topics, personas, selectedLenses, selectedForms, selectedBackdoors, showLLMParams, customLLMParams]);

  // ── Load from Library: Topic callback ─────────────────────────────
  const handleLoadTopic = (name: string, questions: any[], mainCategory: string) => {
    setGenerationMode("topic");
    setTopics([name]);
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
    setReverifyResults({});
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
      const { data } = await supabase
        .from("categories_library")
        .select("name, tags")
        .eq("main_category", themeName);

      if (data && data.length > 0) {
        const seen = new Set<string>();
        const loaded: ThemeSubtopic[] = [];
        for (const row of data) {
          const name = row.name;
          if (!name || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          const tags: string[] = row.tags || [];
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
    } catch (e) {
      // Non-critical
    }
  };

  // ── Recent Topic: Load existing questions from DB ──────────────────
  const handleSelectRecentTopic = async (topicName: string) => {
    setTopics([topicName]);

    try {
      const { data } = await supabase
        .from("categories_library")
        .select("name, data, main_category, tags")
        .eq("name", topicName)
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
          setReverifyResults({});
          setStatus("success");
        addLog(`📚 Loaded ${questions.length} existing questions for "${topicName}"`, "info");
        addLog(`✨ Click "Generate" to append 5 more questions to this topic`, "info");
      } else {
        addLog(`📝 No existing questions found for "${topicName}" — generate fresh`, "info");
      }
    } catch (e) {
      // Topic doesn't exist or has no questions — that's fine
    }
  };

  // ── Theme: Generate Subtopics (first batch, replaces) ─────────────
  const handleThemeGenerate = async () => {
    if (!theme.trim() || !apiKey) return;

    setGeneratingSubtopics(true);
    setSubtopics([]);

    // Fetch previously generated subtopic names for this theme as exclusions
    let excludeNames: string[] | undefined;
    try {
      const { data } = await supabase
        .from("categories_library")
        .select("name")
        .eq("main_category", theme.trim());
      if (data && data.length > 0) {
        excludeNames = data.map((row: any) => row.name);
        addLog(`📚 Found ${excludeNames.length} previously generated subtopics for "${theme}" — will avoid repeats`, "info");
      }
    } catch (e) {
      // Non-critical — proceed without exclusions if query fails
    }

    addLog(`🧠 Generating 5 subtopics for theme: "${theme}"...`, "info");

    try {
      const result = await generateThemeSubtopics(theme.trim(), {
        provider,
        apiKey,
        model,
      }, excludeNames!, selectedThemeTypes as TopicType[], selectedThemeDomains as KnowledgeDomain[], selectedThemeStyles as QuizStyle[]);

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
      const { data } = await supabase
        .from("categories_library")
        .select("name")
        .eq("main_category", theme.trim());
      if (data && data.length > 0) {
        const dbNames = data.map((row: any) => row.name);
        excludeNames = [...new Set([...currentNames, ...dbNames])];
      }
    } catch (e) {
      // Non-critical
    }

    addLog(`🧠 Appending 5 more subtopics for theme: "${theme}" (excluding ${excludeNames.length} existing names)...`, "info");

    try {
      const result = await generateThemeSubtopics(theme.trim(), {
        provider,
        apiKey,
        model,
      }, excludeNames, selectedThemeTypes as TopicType[], selectedThemeDomains as KnowledgeDomain[], selectedThemeStyles as QuizStyle[]);

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
    const topicList =
      generationMode === "themed"
        ? subtopics.map((s) => s.name).filter((n) => n.trim().length > 0)
        : topics.map((t) => t.trim()).filter((t) => t.length > 0);

    if (topicList.length === 0) return;
    if (!apiKey) {
      addLog("Error: API Key is required to generate questions.", "error");
      return;
    }

    // Guard against obviously invalid API keys
    if (apiKey.trim() === "sa:1" || apiKey.length < 10) {
      addLog("❌ API Key looks invalid (too short or placeholder). Please check your key.", "error");
      setStatus("error");
      return;
    }

    // When appending, skip the clear — keep existing results
    // Also verify the topic name matches (prevent wrong-topic append)
    const appending = isAppendingQuestions && topicList.length === 1
      && topicNames.length === 1 && topicNames[0] === topicList[0];
    if (!appending) {
      setResults([]);
      setTopicNames(topicList);
      setReverifyResults({});
      clearLogs();
    } else {
      addLog(`📎 Appending 5 more questions to existing ${results[0].questions.length} for "${topicList[0]}"`, "info");
    }

    setStatus("generating");

    addLog("🔧 AI Studio — Admin generation initialized", "info");
    if (generationMode === "themed") {
      addLog(`Theme: "${theme}"`, "info");
    }
    addLog(`Topics: ${topicList.join(", ")}`, "info");
    addLog(`Personas: ${personas.join(", ")}`, "info");
    addLog(`Lenses: ${selectedLenses.length}/${ALL_LENSES.length} · Forms: ${selectedForms.length}/${ALL_FORMS.length} · Backdoors: ${selectedBackdoors.length}/${ALL_BACKDOORS.length}`, "info");

    if (showLLMParams) {
      addLog(`Custom LLM: T=${customLLMParams.temperature} PP=${customLLMParams.presence_penalty} FP=${customLLMParams.frequency_penalty} Top-P=${customLLMParams.top_p}`, "info");
    } else {
      addLog("Using calibrated LLM defaults (T=0.72, PP=0.35, FP=0.18, Top-P=0.90)", "info");
    }

    if (runSolver) addLog("🧩 Auto-solver enabled", "info");
    if (runFactCheck) addLog("✅ Auto-fact-check enabled", "info");

    try {
      addLog(`Calling AI (${provider} / ${model})...`, "info");

      const resultsArr: GenerationResult[] = [];

      for (let i = 0; i < topicList.length; i++) {
        const topic = topicList[i];
        addLog(`\n── Topic ${i + 1}/${topicList.length}: "${topic}" ──`, "info");

        const config: AdminGeneratorConfig = {
          topics: [topic],
          questionCount: 5,
          persona: personas[0] || "Casual Explorer",
          personas,
          mode: "GRID" as GameMode,
          provider,
          apiKey,
          model,
          selectedLenses: selectedLenses as LensType[],
          selectedForms: selectedForms as FormType[],
          selectedBackdoors: selectedBackdoors as BackdoorType[],
          customLLMParams: showLLMParams ? customLLMParams : undefined,
          runSolver,
          runFactCheck,
        };

        const result = await generateAdminQuizQuestions(config);
        resultsArr.push(result);

        addLog(`✅ "${topic}": ${result.questions.length} questions · ${result.total_api_calls} API calls · ${result.regenerations} regenerations`, "success");

        if (result.solver_results) {
          const solved = result.solver_results.filter((r) => r.solved_correctly).length;
          addLog(`🧩 Solver: ${solved}/${result.solver_results.length} solvable`, solved === result.solver_results.length ? "success" : "warning");
        }
        if (result.fact_check) {
          addLog(`✅ Fact-check: ${result.fact_check.all_verified ? "All verified" : "Issues found"}`, result.fact_check.all_verified ? "success" : "warning");
        }

        // Track topic for recent quick-pick
        store.addRecentTopic(topic);
      }

      if (appending && results.length === 1) {
        // Append: merge new questions into the existing result
        const existing = results[0];
        const merged: GenerationResult = {
          ...existing,
          questions: [...existing.questions, ...resultsArr[0].questions],
          total_api_calls: existing.total_api_calls + resultsArr[0].total_api_calls,
          regenerations: existing.regenerations + resultsArr[0].regenerations,
        };
        setResults([merged]);
        addLog(
          `✅ Appended ${resultsArr[0].questions.length} questions — total: ${merged.questions.length}`,
          "success",
        );
      } else {
        addLog(`\n🎉 Generation complete! ${resultsArr.length} topic(s), ${resultsArr.reduce((sum, r) => sum + r.questions.length, 0)} total questions`, "success");
        setResults(resultsArr);
      }
      setStatus("success");

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch (err: any) {
      addLog(`❌ Generation failed: ${err.message}`, "error");
      setStatus("error");
    }
  };

  // ── Re-verify a single question ───────────────────────────────────
  const handleReverify = async (question: QuizGambitQuestion, topicIdx: number, questionIdx: number) => {
    const key = `${topicIdx}-${questionIdx}`;
    setReverifying((prev) => ({ ...prev, [key]: true }));

    try {
      addLog(`🔄 Re-verifying Q${questionIdx + 1} (topic ${topicIdx + 1})...`, "info");
      const result = await reverifyQuestion(question, provider, apiKey, model);

      setReverifyResults((prev) => ({
        ...prev,
        [key]: {
          solved: result.solver?.solved_correctly ?? false,
          confidence: result.solver?.confidence ?? 0,
          verified: result.factCheck?.verified ?? false,
        },
      }));

      if (result.solver) {
        addLog(
          `🧩 Q${questionIdx + 1} solver: ${result.solver.solved_correctly ? "Solved correctly" : "Failed"} (confidence: ${(result.solver.confidence * 100).toFixed(0)}%)`,
          result.solver.solved_correctly ? "success" : "warning",
        );
      }
      if (result.factCheck) {
        addLog(
          `✅ Q${questionIdx + 1} fact-check: ${result.factCheck.verified ? "Verified" : "Issues found"}`,
          result.factCheck.verified ? "success" : "warning",
        );
      }
    } catch (err: any) {
      addLog(`❌ Re-verify failed for Q${questionIdx + 1}: ${err.message}`, "error");
    } finally {
      setReverifying((prev) => ({ ...prev, [key]: false }));
    }
  };

  // ── Convert results to TopicData for SaveToLibrary ────────────────
  const saveTopics: TopicData[] = results.map((r, i) => {
    const topicName = topicNames[i] || `Topic ${i + 1}`;
    const subtopicMeta = generationMode === "themed" ? subtopics[i] : undefined;
    const tags = ["Grid", topicName];
    if (generationMode === "themed" && theme.trim()) {
      tags.push(`Theme:${theme.trim()}`);
    }
    if (subtopicMeta) {
      tags.push(subtopicMeta.type, subtopicMeta.domain, subtopicMeta.style);
    }
    const uniquePersonas = new Set<string>();
    const uniqueLenses = new Set<string>();
    r.questions.forEach((q: any) => {
      if (q.persona) uniquePersonas.add(q.persona);
      if (q.lens) uniqueLenses.add(q.lens);
    });
    uniquePersonas.forEach((p) => tags.push(`Persona:${p}`));
    uniqueLenses.forEach((l) => tags.push(`Lens:${l}`));
    return {
      name: topicName,
      mainCategory: generationMode === "themed" && theme.trim() ? theme.trim() : topicName,
      questions: r.questions,
      tags,
      description: `AI Studio: ${topicName}${generationMode === "themed" ? ` (Theme: ${theme.trim()})` : ""}`,
    };
  });

  // ── Estimated question count ──────────────────────────────────────
  const topicCount =
    generationMode === "themed"
      ? subtopics.length
      : topics.filter((t) => t.trim()).length;
  const estimatedQuestions = topicCount * 5;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-clay-cream">
      {/* Header */}
      <header className="flex items-center gap-4 p-4 sm:p-6 max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="clay-btn p-3 flex items-center justify-center text-plum/60 hover:text-plum transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-soft-purple/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-soft-purple" />
          </div>
          <div>
            <h1 className="font-outfit font-black text-xl sm:text-2xl text-plum">
              AI Studio
            </h1>
            <p className="text-[10px] text-plum/40 font-medium mt-0.5">
              Full-control question generation — lenses, forms, backdoors, quality verification
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 space-y-6">
        {/* Provider config (collapsed) */}
        <ProviderConfig
          provider={provider}
          onProviderChange={setProvider}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          model={model}
          onModelChange={setModel}
          collapsed={configCollapsed}
          onToggleCollapse={() => setConfigCollapsed(!configCollapsed)}
        />

        {/* ── Generation Mode Toggle ──────────────────────────── */}
        <div className="flex gap-2">
          <button
            onClick={() => setGenerationMode("topic")}
            className={`clay-btn flex-1 py-3 rounded-xl font-outfit font-bold text-sm transition-colors ${
              generationMode === "topic"
                ? "bg-soft-purple text-white hover:bg-soft-purple/90"
                : "bg-warm-white text-plum/50 border border-warm-gray/15 hover:text-plum hover:border-soft-purple/30"
            }`}
          >
            📝 Topic Mode
          </button>
          <button
            onClick={() => setGenerationMode("themed")}
            className={`clay-btn flex-1 py-3 rounded-xl font-outfit font-bold text-sm transition-colors ${
              generationMode === "themed"
                ? "bg-soft-purple text-white hover:bg-soft-purple/90"
                : "bg-warm-white text-plum/50 border border-warm-gray/15 hover:text-plum hover:border-soft-purple/30"
            }`}
          >
            🎯 Themed Mode
          </button>
        </div>

        {/* ── Themed Mode: How It Works (compact info) ──────────── */}
        {generationMode === "themed" && subtopics.length === 0 && (
          <div className="clay p-4 space-y-2 text-center">
            <p className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
              🧠 AI uses a 3D matrix to create diverse subtopics
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <span className="text-[9px] font-bold text-soft-purple bg-soft-purple-light/30 px-2 py-0.5 rounded-full">6 Types</span>
              <span className="text-[9px] text-plum/20">×</span>
              <span className="text-[9px] font-bold text-sky bg-sky-light/30 px-2 py-0.5 rounded-full">5 Domains</span>
              <span className="text-[9px] text-plum/20">×</span>
              <span className="text-[9px] font-bold text-mint bg-mint-light/30 px-2 py-0.5 rounded-full">4 Styles</span>
              <span className="text-[9px] text-plum/20">=</span>
              <span className="text-[9px] font-black text-plum/60">120 combos</span>
            </div>
            <p className="text-[9px] text-plum/25 font-medium leading-relaxed max-w-md mx-auto">
              Core · Niche · Human · Surprise · Scale · Mystery &nbsp;|&nbsp;
              Facts · Stories · Concepts · Data · Connections &nbsp;|&nbsp;
              Classic · Trick · Visual · Timeline
            </p>
          </div>
        )}

        {/* ── Load from Library ────────────────────────────── */}
        <div className="clay p-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="font-outfit font-bold text-sm text-plum">
              📚 Load Previously Saved Content
            </p>
            <p className="text-[10px] text-plum/30 font-medium mt-0.5">
              Browse topics and themes you&apos;ve already generated — pick one to append more questions
            </p>
          </div>
          <button
            onClick={() => setShowLoadLibrary(true)}
            className="clay-btn px-5 py-3 rounded-xl font-outfit font-bold text-sm
              bg-soft-purple text-white hover:bg-soft-purple/90 transition-colors
              flex items-center gap-2 flex-shrink-0"
          >
            Browse Library
          </button>
        </div>

        {/* ── Topic/Theme Input ────────────────────────────────── */}
        <div className="clay p-5 sm:p-6">
          {generationMode === "topic" ? (
            <TopicInput
              topics={topics}
              onChange={setTopics}
              placeholder="Quantum Physics"
              recentTopics={recentTopics}
              onSelectRecentTopic={handleSelectRecentTopic}
            />
          ) : (
            <ThemeInput
              theme={theme}
              onThemeChange={setTheme}
              subtopics={subtopics}
              onSubtopicsChange={setSubtopics}
              isGenerating={generatingSubtopics}
              onGenerate={handleThemeGenerate}
              onAppend={handleThemeAppend}
              appending={appendingSubtopics}
              onReroll={handleRerollSubtopic}
              rerollingIndex={rerollingIndex}
              recentThemes={recentThemes}
              onSelectRecentTheme={handleSelectRecentTheme}
            />
          )}
        </div>

        {/* Mode + Persona row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="clay p-5 sm:p-6">
            <ModeSelector />
          </div>
          <div className="clay p-5 sm:p-6">
            <PersonaPicker selected={personas} onChange={setPersonas} />
          </div>
        </div>

        {/* ─── ADMIN-ONLY: Lens/Form/Backdoor selection (always visible) ─── */}
        <div className="clay p-5 sm:p-6 space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-outfit font-bold text-sm text-plum/70 uppercase tracking-wider">
              🎨 Content Palette
            </h3>
            <span className="text-[10px] text-plum/30 font-medium ml-auto">
              Select which lenses, forms, and backdoors the AI can use
            </span>
          </div>

          <div className="space-y-6 pt-2">
            {/* View Toggle */}
            <div className="flex items-center justify-between border-b border-clay-border pb-3">
              <span className="text-[10px] text-plum/50 font-bold uppercase tracking-wider">
                Selection View
              </span>
              <div className="flex gap-1 bg-clay-cream p-0.5 rounded-lg border border-clay-border">
                <button
                  onClick={() => setAdvancedViewMode("tiles")}
                  className={clsx(
                    "px-3 py-1 rounded-md text-[10px] font-bold transition-all duration-200",
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
                    "px-3 py-1 rounded-md text-[10px] font-bold transition-all duration-200",
                    advancedViewMode === "detailed"
                      ? "bg-white text-plum shadow-sm"
                      : "text-plum/50 hover:text-plum"
                  )}
                >
                  📖 Detailed List
                </button>
              </div>
            </div>

            {advancedViewMode === "tiles" ? (
              <>
                {/* Lenses */}
                <PickerGrid
                  label="Conceptual Lenses"
                  subtitle="Pick which lenses to use. Each question gets a unique lens."
                  items={LENS_ITEMS}
                  selected={selectedLenses}
                  onChange={setSelectedLenses}
                />

                {/* Forms */}
                <PickerGrid
                  label="Syntactic Forms"
                  subtitle="Pick which sentence structures to use. Rotate through all selected."
                  items={FORM_ITEMS}
                  selected={selectedForms}
                  onChange={setSelectedForms}
                  columns={5}
                />

                {/* Backdoors */}
                <PickerGrid
                  label="Backdoor Types"
                  subtitle="Pick which logical pathways are available. LLM picks the best fit per question."
                  items={BACKDOOR_ITEMS}
                  selected={selectedBackdoors}
                  onChange={setSelectedBackdoors}
                />

                {/* Selection summary when subsets are selected */}
                {(selectedLenses.length < ALL_LENSES.length ||
                  selectedForms.length < ALL_FORMS.length ||
                  selectedBackdoors.length < ALL_BACKDOORS.length) && (
                  <DescriptionPanel
                    title="Custom Selection"
                    items={[
                      ...selectedLenses.map((l: string) => ({
                        id: l,
                        label: l,
                        subtitle: getLensSubtitle(l as LensType),
                        description: getLensDescription(l as LensType),
                        icon: getLensIcon(l as LensType),
                        color: "purple" as const,
                      })),
                      ...selectedForms.map((f: string) => ({
                        id: f,
                        label: f.replace(/^Form \d+ \((.+)\)$/, "$1"),
                        subtitle: getFormSubtitle(f as FormType),
                        description: getFormDescription(f as FormType),
                        icon: getFormIcon(f as FormType),
                        color: "sky" as const,
                      })),
                      ...selectedBackdoors.map((b: string) => ({
                        id: b,
                        label: b,
                        subtitle: getBackdoorSubtitle(b as BackdoorType),
                        description: getBackdoorDescription(b as BackdoorType),
                        icon: getBackdoorIcon(b as BackdoorType),
                        color: "mint" as const,
                      })),
                    ]}
                  />
                )}
              </>
            ) : (
              <div className="space-y-8">
                {/* Detailed Lenses */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-outfit font-bold text-sm text-plum">Conceptual Lenses</h4>
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
                      <h4 className="font-outfit font-bold text-sm text-plum">Syntactic Forms</h4>
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
                      <h4 className="font-outfit font-bold text-sm text-plum">Backdoor Types</h4>
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

        {/* ─── Theme Matrix Selectors (Themed Mode only) ─── */}
        {generationMode === "themed" && subtopics.length === 0 && (
          <div className="clay p-5 sm:p-6 space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-outfit font-bold text-sm text-plum/70 uppercase tracking-wider">
                🧩 Theme Matrix
              </h3>
              <span className="text-[10px] text-plum/30 font-medium ml-auto">
                Select which Types, Domains &amp; Styles the AI uses for subtopics
              </span>
            </div>

            <div className="space-y-6 pt-2">
              {/* Topic Types */}
              <PickerGrid
                label="Topic Types"
                subtitle="Pick which types to use. AI picks 5 different ones from your selection."
                items={[
                  { id: "Core", label: "Core", subtitle: "Obvious, expected", icon: "🎯", color: "purple" as const },
                  { id: "Niche", label: "Niche", subtitle: "Expert deep dive", icon: "🔬", color: "purple" as const },
                  { id: "Human", label: "Human", subtitle: "People & stories", icon: "👤", color: "purple" as const },
                  { id: "Surprise", label: "Surprise", subtitle: "Unexpected angle", icon: "💡", color: "purple" as const },
                  { id: "Scale", label: "Scale", subtitle: "Mind-bending scope", icon: "🌌", color: "purple" as const },
                  { id: "Mystery", label: "Mystery", subtitle: "Unsolved, controversial", icon: "❓", color: "purple" as const },
                ]}
                selected={selectedThemeTypes}
                onChange={setSelectedThemeTypes}
                columns={6}
              />

              {/* Knowledge Domains */}
              <PickerGrid
                label="Knowledge Domains"
                subtitle="Pick which knowledge types are available."
                items={[
                  { id: "Facts", label: "Facts", subtitle: "Definitions & dates", icon: "📋", color: "sky" as const },
                  { id: "Stories", label: "Stories", subtitle: "Narratives & drama", icon: "📖", color: "sky" as const },
                  { id: "Concepts", label: "Concepts", subtitle: "Abstract ideas", icon: "💭", color: "sky" as const },
                  { id: "Data", label: "Data", subtitle: "Numbers & records", icon: "📊", color: "sky" as const },
                  { id: "Connections", label: "Connections", subtitle: "Links between ideas", icon: "🔗", color: "sky" as const },
                ]}
                selected={selectedThemeDomains}
                onChange={setSelectedThemeDomains}
                columns={5}
              />

              {/* Quiz Styles */}
              <PickerGrid
                label="Quiz Styles"
                subtitle="Pick which play-style flavors are available."
                items={[
                  { id: "Classic", label: "Classic", subtitle: "Standard Q&A", icon: "📋", color: "mint" as const },
                  { id: "Trick", label: "Trick", subtitle: "Misconceptions", icon: "🎭", color: "mint" as const },
                  { id: "Visual", label: "Visual", subtitle: "Imagery-rich", icon: "👁️", color: "mint" as const },
                  { id: "Timeline", label: "Timeline", subtitle: "Chronological", icon: "⏳", color: "mint" as const },
                ]}
                selected={selectedThemeStyles}
                onChange={setSelectedThemeStyles}
                columns={4}
              />
            </div>
          </div>
        )}

        {/* ─── ADMIN-ONLY: Custom LLM Parameters (collapsible) ─── */}
        <div className="clay p-5 sm:p-6 space-y-1">
          <button
            onClick={() => setShowLLMParams(!showLLMParams)}
            className="flex items-center gap-2 text-sm font-outfit font-bold text-plum/60 hover:text-soft-purple transition-colors w-full"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Custom LLM Parameters
            {!showLLMParams && (
              <span className="text-[10px] text-plum/30 font-normal ml-auto">
                Using calibrated defaults (T=0.72, PP=0.35, FP=0.18, Top-P=0.90)
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ml-auto ${
                showLLMParams ? "rotate-0" : "-rotate-90"
              }`}
            />
          </button>

          {showLLMParams && (
            <div className="space-y-5 pt-4 animate-slide-up-fade">
              {/* Temperature */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-plum/60 uppercase tracking-wider">Temperature</label>
                  <span className="text-xs font-mono text-plum/40">{customLLMParams.temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  value={customLLMParams.temperature}
                  onChange={(e) => setCustomLLMParams({ ...customLLMParams, temperature: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-clay-cream rounded-full appearance-none cursor-pointer accent-soft-purple"
                />
                <div className="flex justify-between text-[8px] text-plum/20 font-medium">
                  <span>0.0 (deterministic)</span>
                  <span>2.0 (creative)</span>
                </div>
              </div>

              {/* Presence Penalty */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-plum/60 uppercase tracking-wider">Presence Penalty</label>
                  <span className="text-xs font-mono text-plum/40">{customLLMParams.presence_penalty.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.01"
                  value={customLLMParams.presence_penalty}
                  onChange={(e) => setCustomLLMParams({ ...customLLMParams, presence_penalty: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-clay-cream rounded-full appearance-none cursor-pointer accent-soft-purple"
                />
                <div className="flex justify-between text-[8px] text-plum/20 font-medium">
                  <span>-2.0 (unconstrained)</span>
                  <span>2.0 (varied)</span>
                </div>
              </div>

              {/* Frequency Penalty */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-plum/60 uppercase tracking-wider">Frequency Penalty</label>
                  <span className="text-xs font-mono text-plum/40">{customLLMParams.frequency_penalty.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.01"
                  value={customLLMParams.frequency_penalty}
                  onChange={(e) => setCustomLLMParams({ ...customLLMParams, frequency_penalty: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-clay-cream rounded-full appearance-none cursor-pointer accent-soft-purple"
                />
                <div className="flex justify-between text-[8px] text-plum/20 font-medium">
                  <span>-2.0 (repetitive)</span>
                  <span>2.0 (unique)</span>
                </div>
              </div>

              {/* Top-P */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-plum/60 uppercase tracking-wider">Top-P</label>
                  <span className="text-xs font-mono text-plum/40">{customLLMParams.top_p.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={customLLMParams.top_p}
                  onChange={(e) => setCustomLLMParams({ ...customLLMParams, top_p: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-clay-cream rounded-full appearance-none cursor-pointer accent-soft-purple"
                />
                <div className="flex justify-between text-[8px] text-plum/20 font-medium">
                  <span>0.0 (focused)</span>
                  <span>1.0 (diverse)</span>
                </div>
              </div>

              {/* Reset button */}
              <button
                onClick={() => setCustomLLMParams({ temperature: 0.72, presence_penalty: 0.35, frequency_penalty: 0.18, top_p: 0.90 })}
                className="clay-btn px-3 py-1.5 text-[10px] font-bold text-plum/40 hover:text-plum transition-colors"
              >
                <RotateCcw className="w-3 h-3 inline mr-1" />
                Reset to Calibrated Defaults
              </button>
            </div>
          )}
        </div>

        {/* ─── ADMIN-ONLY: Quality Checks ─── */}
        <div className="clay p-5 sm:p-6">
          <h3 className="font-outfit font-bold text-sm text-plum/70 uppercase tracking-wider mb-4">
            🛡️ Quality Verification
          </h3>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={runSolver}
                onChange={(e) => setRunSolver(e.target.checked)}
                className="w-4 h-4 accent-soft-purple rounded"
              />
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-soft-purple/60" />
                <span className="text-sm font-bold text-plum/70">Auto-Solver</span>
              </div>
              <span className="text-[10px] text-plum/30">Runs after generation — verifies each question has a unique correct answer</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={runFactCheck}
                onChange={(e) => setRunFactCheck(e.target.checked)}
                className="w-4 h-4 accent-mint rounded"
              />
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-mint/60" />
                <span className="text-sm font-bold text-plum/70">Auto Fact-Check</span>
              </div>
              <span className="text-[10px] text-plum/30">Verifies factual claims against knowledge base</span>
            </label>
          </div>
        </div>

        {/* ─── ADMIN-ONLY: System Prompt Viewer (collapsible) ─── */}
        <div className="clay p-5 sm:p-6 space-y-1">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center gap-2 text-sm font-outfit font-bold text-plum/60 hover:text-soft-purple transition-colors w-full"
          >
            {showPrompt ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPrompt ? "Hide System Prompt" : "View System Prompt"}
            <span className="text-[10px] text-plum/30 font-normal ml-auto">
              {showPrompt ? "Scroll to read the full prompt" : "Inspect the exact prompt sent to the LLM"}
            </span>
          </button>

          {showPrompt && (
            <div className="pt-3 animate-slide-up-fade">
              <div className="bg-plum/5 border border-plum/10 rounded-2xl p-4 max-h-[500px] overflow-y-auto">
                <pre className="text-[10px] text-plum/60 font-mono whitespace-pre-wrap leading-relaxed">
                  {previewPrompt || "Enter topics above to preview the system prompt."}
                </pre>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewPrompt);
                  addLog("📋 System prompt copied to clipboard", "info");
                }}
                className="clay-btn mt-2 px-3 py-1.5 text-[10px] font-bold text-plum/40 hover:text-plum transition-colors"
              >
                Copy Prompt to Clipboard
              </button>
            </div>
          )}
        </div>

        {/* Persona description panel */}
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

        {/* Generate button */}
        {generationMode === "topic" ? (
          <GenerateButton
            onClick={handleGenerate}
            loading={status === "generating"}
            disabled={topics.filter((t) => t.trim()).length === 0}
            fullWidth
            large
            icon={<Sparkles className="w-5 h-5" />}
          >
            {status === "generating"
              ? `Generating ${estimatedQuestions} Questions...`
              : isAppendingQuestions
                ? `Append 5 Questions (total: ${(results[0]?.questions.length || 0) + 5})`
                : `Generate ${estimatedQuestions} Questions${runSolver ? " + Solver" : ""}${runFactCheck ? " + Fact-Check" : ""}`}
          </GenerateButton>
        ) : (
          <GenerateButton
            onClick={handleGenerate}
            loading={status === "generating"}
            disabled={generatingSubtopics || subtopics.length === 0}
            fullWidth
            large
            icon={<Sparkles className="w-5 h-5" />}
          >
            {status === "generating"
              ? `Generating ${estimatedQuestions} Questions...`
              : isAppendingQuestions
                ? `Append 5 Questions (total: ${(results[0]?.questions.length || 0) + 5})`
                : `Generate ${estimatedQuestions} Questions${runSolver ? " + Solver" : ""}${runFactCheck ? " + Fact-Check" : ""}`}
          </GenerateButton>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div ref={resultsRef} className="space-y-8 animate-slide-up-fade">
            <div className="flex items-center gap-3">
              <h2 className="font-outfit font-black text-lg text-plum">Results</h2>
              <span className="clay-badge bg-mint-light text-mint text-[10px]">
                {results.reduce((sum, r) => sum + r.questions.length, 0)} questions
              </span>
              <span className="clay-badge bg-soft-purple-light text-soft-purple text-[10px]">
                {results.reduce((sum, r) => sum + r.total_api_calls, 0)} API calls
              </span>
            </div>

            {results.map((result, topicIdx) => (
              <div key={topicIdx} className="space-y-4">
                {/* Topic header */}
                <div className="flex items-center gap-3">
                  <h3 className="font-outfit font-bold text-sm text-plum/60 uppercase tracking-wider">
                    {topicNames[topicIdx] || `Topic ${topicIdx + 1}`}
                  </h3>
                  <span className="text-plum/30 text-xs font-medium">
                    ({result.questions.length} questions)
                  </span>
                  {result.solver_results && (
                    <span className={`text-[10px] font-bold ${result.solver_results.filter((r) => r.solved_correctly).length === result.solver_results.length ? "text-mint" : "text-peach"}`}>
                      🧩 {result.solver_results.filter((r) => r.solved_correctly).length}/{result.solver_results.length} solved
                    </span>
                  )}
                  {result.fact_check && (
                    <span className={`text-[10px] font-bold ${result.fact_check.all_verified ? "text-mint" : "text-peach"}`}>
                      ✅ {result.fact_check.all_verified ? "All verified" : "Issues"}
                    </span>
                  )}
                </div>

                {/* Questions */}
                <div className="space-y-3">
                  {result.questions.map((q, qi) => {
                    const rvKey = `${topicIdx}-${qi}`;
                    const rvResult = reverifyResults[rvKey];
                    const isReverifying = reverifying[rvKey];

                    return (
                      <div key={qi} className="relative">
                        <QuestionPreview
                          question={q}
                          index={qi}
                          solverResult={
                            rvResult
                              ? { solved_correctly: rvResult.solved, confidence: rvResult.confidence }
                              : result.solver_results?.[qi]
                                ? { solved_correctly: result.solver_results[qi].solved_correctly, confidence: result.solver_results[qi].confidence }
                                : undefined
                          }
                          factCheckResult={
                            rvResult
                              ? { verified: rvResult.verified }
                              : result.fact_check
                                ? { verified: result.fact_check.all_verified }
                                : undefined
                          }
                        />
                        {/* Re-Verify button per question (admin-only) */}
                        <button
                          onClick={() => handleReverify(q, topicIdx, qi)}
                          disabled={isReverifying}
                          className="absolute top-3 right-3 clay-btn px-2 py-1 text-[9px] font-bold text-plum/30 hover:text-soft-purple transition-colors flex items-center gap-1"
                        >
                          {isReverifying ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Re-Verify
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Audit */}
                <AuditPanel
                  audit={result.audit}
                  apiCalls={result.total_api_calls}
                  regenerations={result.regenerations}
                />
              </div>
            ))}

            {/* Save to Library */}
            <SaveToLibrary topics={saveTopics} />

            {/* Logs */}
            <GenerationLogs
              logs={logs}
              collapsed={logsCollapsed}
              onToggleCollapse={() => setLogsCollapsed(!logsCollapsed)}
              onClear={clearLogs}
            />
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && status === "idle" && (
          <div className="clay p-8 text-center space-y-3">
            <span className="text-3xl">🔧</span>
            <p className="font-outfit font-bold text-sm text-plum/40">
              Configure your generation and click Generate
            </p>
            <p className="text-[10px] text-plum/30 font-medium max-w-md mx-auto">
              Full-control mode gives you every knob — select exactly which lenses, forms, backdoors, and LLM parameters to use. Enable solver and fact-check for quality verification.
            </p>
          </div>
        )}

        {/* Error state */}
        {status === "error" && results.length === 0 && (
          <div className="clay p-6 text-center space-y-3 border-peach/30">
            <span className="text-2xl">❌</span>
            <p className="font-outfit font-bold text-sm text-peach">Generation failed</p>
            <p className="text-[10px] text-plum/40 font-medium">
              Check the logs for details. Verify your API key and try again.
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
      />
    </div>
  );
}
