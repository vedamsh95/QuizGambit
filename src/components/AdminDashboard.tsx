import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  ArrowLeft,
  Trash2,
  ShieldCheck,
  Database,
  LayoutPanelTop,
  FileJson,
  Upload,
  Save,
  Zap,
  Users,
  Gamepad2,
  Clock,
  Edit2,
  Plus,
  X,
  BookOpen,
  ChevronDown,
  Search,
  ChevronRight,
  RotateCcw,
  Loader2,
  ArrowUpDown,
  LayoutList,
  GripVertical,
  Hammer,
} from "lucide-react";
import AIStudio from "./AIStudio";
import ForgePanel from "./ForgePanel";
import { store } from "../lib/storage";
import { reverifyQuestion } from "../lib/ai";

// ─── Types ──────────────────────────────────────────────────────────

interface AdminDashboardProps {
  onBack: () => void;
}

type AdminTab = "DASHBOARD" | "CONTENT" | "AI_STUDIO" | "FORGE" | "JSON_IMPORT";

interface EditForm {
  name: string;
  main_category: string;
  description: string;
  is_global: boolean;
  tags: string;
  lens_mode: "diverse" | "focused";
  target_lens: string;
}

const ALL_LENSES_EDIT = [
  "Origin Story","The Unexpected","The Human Element","Numbers & Scale",
  "The Rivalry","The Oddity","Behind the Scenes","The Connection",
  "What If?","The Legacy","The Butterfly Effect","The Evolution","The Cultural Impact",
];

// ─── Sidebar Tab Config ─────────────────────────────────────────────

const TABS: { id: AdminTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "DASHBOARD", label: "Dashboard", icon: <ShieldCheck className="w-4 h-4" />, color: "text-soft-purple" },
  { id: "CONTENT", label: "Content Library", icon: <BookOpen className="w-4 h-4" />, color: "text-mint" },
  { id: "AI_STUDIO", label: "AI Studio", icon: <Zap className="w-4 h-4" />, color: "text-sky" },
  { id: "FORGE", label: "Content Forge", icon: <Hammer className="w-4 h-4" />, color: "text-butter" },
  { id: "JSON_IMPORT", label: "JSON Import", icon: <FileJson className="w-4 h-4" />, color: "text-butter" },
];

// ─── Component ──────────────────────────────────────────────────────

export default function AdminDashboard({ onBack }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("DASHBOARD");

  // ── Stats ─────────────────────────────────────────────────────────
  const [stats, setStats] = useState({ users: 0, categories: 0, lobbies: 0 });
  const [loading, setLoading] = useState(false);

  // ── Content Library state ─────────────────────────────────────────
  const [categories, setCategories] = useState<any[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    main_category: "",
    description: "",
    is_global: true,
    tags: "",
    lens_mode: "diverse",
    target_lens: "",
  });

  // ── Question-level state ─────────────────────────────────────────
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{ catId: string; qIdx: number; q: any } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Bulk question selection ─────────────────────────────────────
  const [selectedQuestionKeys, setSelectedQuestionKeys] = useState<Set<string>>(new Set());
  const qKey = (catId: string, qIdx: number) => `${catId}-${qIdx}`;

  // ── Re-verify state ─────────────────────────────────────────────
  const [reverifyingQuestions, setReverifyingQuestions] = useState<Set<string>>(new Set());
  const [questionVerifyResults, setQuestionVerifyResults] = useState<Record<string, { solved: boolean; confidence: number; verified: boolean }>>({});

  // ── Table view state ────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ── JSON Import state ─────────────────────────────────────────────
  const [jsonInput, setJsonInput] = useState("");

  // ── Data fetching ─────────────────────────────────────────────────
  useEffect(() => {
    fetchStats();
    fetchCategories();
  }, []);

  const fetchStats = async () => {
    const { count: userCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });
    const { count: catCount } = await supabase
      .from("categories_library")
      .select("*", { count: "exact", head: true });
    const { count: lobbyCount } = await supabase
      .from("lobbies")
      .select("*", { count: "exact", head: true });

    setStats({
      users: userCount || 0,
      categories: catCount || 0,
      lobbies: lobbyCount || 0,
    });
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("categories_library")
      .select("*")
      .eq("is_global", true)
      .order("created_at", { ascending: false });
    if (data) setCategories(data);
  };

  // ── JSON Import ───────────────────────────────────────────────────
  const handleJsonImport = async () => {
    try {
      const parsed = JSON.parse(jsonInput);
      setLoading(true);

      let itemsToImport: any[] = [];
      if (parsed.categories && Array.isArray(parsed.categories)) {
        itemsToImport = parsed.categories;
      } else if (Array.isArray(parsed)) {
        itemsToImport = parsed;
      } else {
        itemsToImport = [parsed];
      }

      const userId = (await supabase.auth.getUser()).data.user?.id;

      for (const item of itemsToImport) {
        const { error } = await supabase.from("categories_library").insert([
          {
            name: item.name,
            main_category: item.main_category || "General",
            description: item.description || `Imported: ${item.name}`,
            data: item.data || item.questions,
            is_global: true,
            created_by: userId,
          },
        ]);
        if (error) throw error;
      }

      setJsonInput("");
      alert(`✅ Import Successful: ${itemsToImport.length} categories archived.`);
    } catch (err: any) {
      alert("❌ Import Error: " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
      // Refetch after import (don't let refetch errors shadow import success)
      try { await fetchStats(); } catch {}
      try { await fetchCategories(); } catch {}
    }
  };

  // ── CRUD Handlers ─────────────────────────────────────────────────
  const openCreateModal = () => {
    setEditingItem(null);
    setEditForm({ name: "", main_category: "", description: "", is_global: true, tags: "", lens_mode: "diverse", target_lens: "" });
    setShowEditModal(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      main_category: item.main_category,
      description: item.description,
      is_global: item.is_global,
      tags: item.tags ? item.tags.join(", ") : "",
      lens_mode: item.lens_mode || "diverse",
      target_lens: item.target_lens || "",
    });
    setShowEditModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to PERMANENTLY delete this asset? This cannot be undone.")) return;
    const { error } = await supabase.from("categories_library").delete().eq("id", id);
    if (error) {
      alert("Delete failed: " + error.message);
    } else {
      try { await fetchCategories(); } catch {}
      try { await fetchStats(); } catch {}
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} assets? This cannot be undone.`)) return;
    setLoading(true);
    const { error } = await supabase.from("categories_library").delete().in("id", Array.from(selectedIds));
    if (error) {
      alert("Bulk delete failed: " + error.message);
    } else {
      setSelectedIds(new Set());
      try { await fetchCategories(); } catch {}
      try { await fetchStats(); } catch {}
    }
    setLoading(false);
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // ── Category expand/collapse ────────────────────────────────────
  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedCategories(newSet);
  };

  // ── Question CRUD ───────────────────────────────────────────────
  const openQuestionEditor = (catId: string, qIdx: number, q: any) => {
    setEditingQuestion({ catId, qIdx, q: { ...q } });
    setShowQuestionModal(true);
  };

  const handleDeleteQuestion = async (catId: string, qIdx: number) => {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    const cat = categories.find((c) => c.id === catId);
    if (!cat || !Array.isArray(cat.data)) return;
    const updatedData = [...cat.data];
    updatedData.splice(qIdx, 1);

    const { error } = await supabase
      .from("categories_library")
      .update({ data: updatedData })
      .eq("id", catId);
    if (error) {
      alert("Failed to delete question: " + error.message);
    } else {
      try { await fetchCategories(); } catch {}
    }
  };

  const handleSaveQuestion = async () => {
    if (!editingQuestion) return;
    const { catId, qIdx, q } = editingQuestion;
    const cat = categories.find((c) => c.id === catId);
    if (!cat || !Array.isArray(cat.data)) return;

    // Validate minimum 4 non-empty options
    const validOptions = (q.options || []).filter((o: string) => o.trim().length > 0);
    if (validOptions.length < 4) {
      alert("All 4 options are required. Each option must be non-empty.");
      return;
    }
    // Validate answer matches one of the options
    if (!q.options?.includes(q.answer_text)) {
      alert(`The answer "${q.answer_text}" must match one of the 4 options.`);
      return;
    }

    const updatedData = [...cat.data];
    updatedData[qIdx] = q;

    setLoading(true);
    const { error } = await supabase
      .from("categories_library")
      .update({ data: updatedData })
      .eq("id", catId);
    setLoading(false);

    if (error) {
      alert("Failed to save question: " + error.message);
    } else {
      setShowQuestionModal(false);
      setEditingQuestion(null);
      try { await fetchCategories(); } catch {}
    }
  };

  // ── Re-verify single question ──────────────────────────────────
  const handleReverifyLibrary = async (catId: string, qIdx: number, q: any) => {
    const key = qKey(catId, qIdx);
    if (reverifyingQuestions.has(key)) return;

    setReverifyingQuestions((prev) => new Set(prev).add(key));

    try {
      const storedKeys = store.getAiKeys();
      const storedProvider = store.getAiProvider();
      const apiKey = storedKeys[storedProvider] || storedKeys["gemini"] || "";

      if (!apiKey) {
        alert("No API key configured. Set up your AI provider in AI Studio first.");
        return;
      }

      const result = await reverifyQuestion(q, storedProvider || "gemini", apiKey, "gemini-1.5-pro");

      setQuestionVerifyResults((prev) => ({
        ...prev,
        [key]: {
          solved: result.solver?.solved_correctly ?? false,
          confidence: result.solver?.confidence ?? 0,
          verified: result.factCheck?.verified ?? false,
        },
      }));
    } catch (err: any) {
      alert("Re-verify failed: " + err.message);
    } finally {
      setReverifyingQuestions((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // ── Bulk question selection ────────────────────────────────────
  const toggleQuestionSelection = (catId: string, qIdx: number) => {
    const key = qKey(catId, qIdx);
    const next = new Set(selectedQuestionKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedQuestionKeys(next);
  };

  const handleBulkDeleteQuestions = async () => {
    if (selectedQuestionKeys.size === 0) return;
    if (!confirm(`Delete ${selectedQuestionKeys.size} selected question(s)? This cannot be undone.`)) return;

    // Group by category
    const byCategory: Record<string, number[]> = {};
    selectedQuestionKeys.forEach((key) => {
      const [catId, idxStr] = key.split("-");
      const qIdx = parseInt(idxStr);
      if (!byCategory[catId]) byCategory[catId] = [];
      byCategory[catId].push(qIdx);
    });

    setLoading(true);
    let failed = 0;

    for (const [catId, indices] of Object.entries(byCategory)) {
      const cat = categories.find((c) => c.id === catId);
      if (!cat || !Array.isArray(cat.data)) continue;
      // Sort descending to splice from end first (avoids index shift)
      const sorted = [...indices].sort((a, b) => b - a);
      const updatedData = [...cat.data];
      sorted.forEach((idx) => updatedData.splice(idx, 1));

      const { error } = await supabase
        .from("categories_library")
        .update({ data: updatedData })
        .eq("id", catId);
      if (error) failed++;
    }

    setLoading(false);
    setSelectedQuestionKeys(new Set());
    if (failed > 0) alert(`Bulk delete complete with ${failed} error(s).`);
    try { await fetchCategories(); } catch {}
  };

  // ── Search/filter logic ─────────────────────────────────────────
  const matchCategory = (cat: any, q: string): boolean => {
    if (!q.trim()) return true;
    const ql = q.toLowerCase();
    const nameMatch = cat.name?.toLowerCase().includes(ql);
    const descMatch = cat.description?.toLowerCase().includes(ql);
    const tagMatch = cat.tags?.some((t: string) => t.toLowerCase().includes(ql));
    const questionMatch = Array.isArray(cat.data)
      ? cat.data.some((d: any) =>
          d.question_text?.toLowerCase().includes(ql) ||
          d.answer_text?.toLowerCase().includes(ql) ||
          d.lens?.toLowerCase().includes(ql) ||
          d.backdoor_type?.toLowerCase().includes(ql)
        )
      : false;
    return nameMatch || descMatch || tagMatch || questionMatch;
  };

  const filteredCategories = categories.filter((cat) => matchCategory(cat, searchQuery));

  // Flat question list for table view
  const allTableQuestions: { catId: string; catName: string; catTags: string[]; qIdx: number; q: any }[] = [];
  filteredCategories.forEach((cat) => {
    const questions: any[] = Array.isArray(cat.data) ? cat.data : [];
    questions.forEach((q, i) => {
      allTableQuestions.push({ catId: cat.id, catName: cat.name, catTags: cat.tags || [], qIdx: i, q });
    });
  });
  if (sortColumn) {
    allTableQuestions.sort((a, b) => {
      const va = (a.q[sortColumn] ?? "").toString().toLowerCase();
      const vb = (b.q[sortColumn] ?? "").toString().toLowerCase();
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  // ── Table column config ────────────────────────────────────────
  const TABLE_COLS = [
    { key: "", label: "#", w: "w-8" },
    { key: "question_text", label: "Question", w: "" },
    { key: "answer_text", label: "Answer", w: "w-28" },
    { key: "lens", label: "Lens", w: "w-28" },
    { key: "form", label: "Form", w: "w-24" },
    { key: "backdoor_type", label: "Backdoor", w: "w-28" },
    { key: "difficulty_tier", label: "Diff", w: "w-16" },
    { key: "points", label: "Pts", w: "w-12" },
    { key: "tag", label: "Tag", w: "w-20" },
  ];

  const handleSave = async () => {
    if (!editForm.name || !editForm.main_category) {
      alert("Name and Main Category are required.");
      return;
    }
    const payload = {
      name: editForm.name,
      main_category: editForm.main_category,
      description: editForm.description,
      is_global: editForm.is_global,
      tags: editForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      lens_mode: editForm.lens_mode,
      target_lens: editForm.lens_mode === "focused" ? editForm.target_lens || null : null,
    };
    setLoading(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from("categories_library")
          .update(payload)
          .eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories_library").insert([
          {
            ...payload,
            created_by: (await supabase.auth.getUser()).data.user?.id,
            data: [],
          },
        ]);
        if (error) throw error;
      }
      setShowEditModal(false);
    } catch (err: any) {
      alert("Operation failed: " + err.message);
    } finally {
      setLoading(false);
      try { await fetchCategories(); } catch {}
      try { await fetchStats(); } catch {}
    }
  };

  // ── Stats cards data ──────────────────────────────────────────────
  const STATS_CARDS = [
    { label: "Registered Users", value: stats.users, icon: <Users className="w-5 h-5" />, accent: "bg-soft-purple/10 border-soft-purple/20" },
    { label: "Global Categories", value: stats.categories, icon: <Database className="w-5 h-5" />, accent: "bg-mint/10 border-mint/20" },
    { label: "Active Lobbies", value: stats.lobbies, icon: <Gamepad2 className="w-5 h-5" />, accent: "bg-sky/10 border-sky/20" },
    { label: "Uptime", value: "99.9%", icon: <Clock className="w-5 h-5" />, accent: "bg-butter/10 border-butter/20" },
  ];

  // ── Render: AI Studio (full-screen) ───────────────────────────────
  if (activeTab === "AI_STUDIO") {
    return <AIStudio onBack={() => setActiveTab("DASHBOARD")} />;
  }

  // ── Render: Main Admin Shell ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-clay-cream flex">
      {/* ─── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-56 bg-white border-r border-plum/5 flex flex-col flex-shrink-0">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-4 text-xs font-bold text-plum/40 hover:text-plum uppercase tracking-wider transition-colors border-b border-plum/5"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit Admin
        </button>

        {/* Nav tabs */}
        <nav className="flex-1 py-4 space-y-1 px-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedIds(new Set());
                setSelectedQuestionKeys(new Set());
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-outfit font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-soft-purple/10 text-soft-purple border border-soft-purple/20"
                  : "text-plum/40 hover:text-plum/70 hover:bg-plum/5"
              }`}
            >
              <span className={activeTab === tab.id ? tab.color : "text-plum/30"}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-plum/5">
          <div className="flex items-center gap-2 text-[10px] text-plum/30 font-medium">
            <ShieldCheck className="w-3 h-3" />
            Admin Console
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="px-8 py-6 border-b border-plum/5 bg-white/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-soft-purple/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-soft-purple" />
            </div>
            <div>
              <h1 className="font-outfit font-black text-xl text-plum">Admin Console</h1>
              <p className="text-[10px] text-plum/30 font-medium mt-0.5 uppercase tracking-wider">
                {TABS.find((t) => t.id === activeTab)?.label}
              </p>
            </div>
          </div>
        </header>

        {/* Tab content */}
        <div className="p-8 space-y-8">
          {/* ─── DASHBOARD TAB ──────────────────────────────────── */}
          {activeTab === "DASHBOARD" && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {STATS_CARDS.map((card, i) => (
                  <div
                    key={i}
                    className={`clay p-5 border ${card.accent} space-y-2`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-plum/30 uppercase tracking-[0.2em]">
                        {card.label}
                      </span>
                      <span className="text-plum/20">{card.icon}</span>
                    </div>
                    <div className="text-3xl font-outfit font-black text-plum">
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setActiveTab("AI_STUDIO")}
                  className="clay p-5 text-left space-y-2 hover:border-soft-purple/30 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-soft-purple" />
                    <span className="font-outfit font-bold text-sm text-plum group-hover:text-soft-purple transition-colors">
                      AI Studio
                    </span>
                  </div>
                  <p className="text-[10px] text-plum/30 font-medium">
                    Full-control question generation with custom lenses, forms, backdoors, and quality verification.
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab("JSON_IMPORT")}
                  className="clay p-5 text-left space-y-2 hover:border-butter/30 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <FileJson className="w-4 h-4 text-butter" />
                    <span className="font-outfit font-bold text-sm text-plum group-hover:text-butter transition-colors">
                      JSON Import
                    </span>
                  </div>
                  <p className="text-[10px] text-plum/30 font-medium">
                    Bulk import categories from JSON — paste raw schema to broadcast globally.
                  </p>
                </button>

                <button
                  onClick={() => setActiveTab("CONTENT")}
                  className="clay p-5 text-left space-y-2 hover:border-mint/30 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-mint" />
                    <span className="font-outfit font-bold text-sm text-plum group-hover:text-mint transition-colors">
                      Content Library
                    </span>
                  </div>
                  <p className="text-[10px] text-plum/30 font-medium">
                    Manage global categories — edit metadata, browse questions, delete stale content.
                  </p>
                </button>
              </div>

              {/* Recent activity placeholder */}
              <div className="clay p-6 space-y-1">
                <h3 className="font-outfit font-bold text-sm text-plum/60 uppercase tracking-wider">
                  Recent Activity
                </h3>
                <p className="text-[10px] text-plum/25 font-medium pt-2">
                  Activity feed coming soon — will show recent imports, generations, and content changes.
                </p>
              </div>
            </>
          )}

          {/* ─── CONTENT LIBRARY TAB ────────────────────────────── */}
          {activeTab === "CONTENT" && (
            <div className="clay p-6 space-y-6">
              {/* Toolbar */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-mint" />
                  <h3 className="font-outfit font-bold text-sm text-plum uppercase tracking-wider">
                    Global Categories ({filteredCategories.length}{searchQuery ? ` of ${categories.length}` : ""})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {/* Bulk question delete */}
                  {selectedQuestionKeys.size > 0 && (
                    <button
                      onClick={handleBulkDeleteQuestions}
                      disabled={loading}
                      className="clay-btn px-3 py-2 text-[10px] font-bold text-peach/70 hover:text-peach hover:bg-peach/5 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Qs ({selectedQuestionKeys.size})
                    </button>
                  )}
                  {/* Bulk category delete */}
                  {selectedIds.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      disabled={loading}
                      className="clay-btn px-3 py-2 text-[10px] font-bold text-peach/70 hover:text-peach hover:bg-peach/5 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete ({selectedIds.size})
                    </button>
                  )}
                  {/* View toggle */}
                  <div className="flex bg-plum/[0.03] rounded-xl p-0.5">
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        viewMode === 'cards' ? "bg-white text-plum shadow-sm" : "text-plum/25"
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 inline mr-1" />
                      Cards
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        viewMode === 'table' ? "bg-white text-plum shadow-sm" : "text-plum/25"
                      }`}
                    >
                      <LayoutList className="w-3.5 h-3.5 inline mr-1" />
                      Table
                    </button>
                  </div>
                  <button
                    onClick={openCreateModal}
                    className="clay-btn px-3 py-2 text-[10px] font-bold text-mint/70 hover:text-mint hover:bg-mint/5 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Category
                  </button>
                </div>
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-plum/20" />
                <input
                  type="text"
                  className="w-full clay-input pl-10 pr-4 py-2.5 text-sm"
                  placeholder="Search categories, questions, answers, tags..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim()) {
                      const q = e.target.value.toLowerCase();
                      const matchingIds = new Set<string>();
                      categories.forEach((cat) => { if (matchCategory(cat, q)) matchingIds.add(cat.id); });
                      setExpandedCategories(matchingIds);
                    } else {
                      setExpandedCategories(new Set());
                    }
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setExpandedCategories(new Set()); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 clay-btn p-1 text-plum/20 hover:text-plum"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* ── TABLE VIEW ───────────────────────────────── */}
              {viewMode === 'table' && (
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-2xl border border-plum/5">
                  {allTableQuestions.length === 0 ? (
                    <div className="text-center py-12 space-y-2">
                      <span className="text-3xl">📭</span>
                      <p className="text-sm font-bold text-plum/30">
                        {searchQuery ? "No results found" : "No questions in library"}
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-plum/[0.02] border-b border-plum/5">
                          <th className="p-3 w-8">
                            <input
                              type="checkbox"
                              checked={selectedQuestionKeys.size > 0 && allTableQuestions.every(t => selectedQuestionKeys.has(qKey(t.catId, t.qIdx)))}                                  onChange={() => {
                                    if (allTableQuestions.every(t => selectedQuestionKeys.has(qKey(t.catId, t.qIdx)))) {
                                      const next = new Set(selectedQuestionKeys);
                                      allTableQuestions.forEach(t => next.delete(qKey(t.catId, t.qIdx)));
                                      setSelectedQuestionKeys(next);
                                    } else {
                                      setSelectedQuestionKeys(new Set(allTableQuestions.map(t => qKey(t.catId, t.qIdx))));
                                    }
                                  }}
                              className="w-3.5 h-3.5 accent-soft-purple rounded"
                            />
                          </th>
                          {TABLE_COLS.map((col) => (
                            <th
                              key={col.key}
                              className={`p-3 ${col.w}`}
                            >
                              {col.key ? (
                                <button
                                  onClick={() => {
                                    if (sortColumn === col.key) setSortDir(s => s === 'asc' ? 'desc' : 'asc');
                                    else { setSortColumn(col.key); setSortDir('asc'); }
                                  }}
                                  className="flex items-center gap-1 text-[9px] font-black text-plum/30 uppercase tracking-wider hover:text-plum/50 transition-colors"
                                >
                                  {col.label}
                                  {sortColumn === col.key && (
                                    <ArrowUpDown className={`w-3 h-3 ${sortDir === 'desc' ? 'rotate-180' : ''}`} />
                                  )}
                                </button>
                              ) : (
                                <span className="text-[9px] font-black text-plum/30 uppercase tracking-wider">{col.label}</span>
                              )}
                            </th>
                          ))}
                          <th className="p-3 w-28">
                            <span className="text-[9px] font-black text-plum/30 uppercase tracking-wider">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTableQuestions.map((t) => {
                          const key = qKey(t.catId, t.qIdx);
                          const isSelected = selectedQuestionKeys.has(key);
                          const vr = questionVerifyResults[key];
                          const isReverifying = reverifyingQuestions.has(key);
                          return (
                            <tr
                              key={key}
                              className={`border-b border-plum/[0.03] hover:bg-plum/[0.02] transition-colors ${
                                isSelected ? "bg-soft-purple/[0.03]" : ""
                              }`}
                            >
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleQuestionSelection(t.catId, t.qIdx)}
                                  className="w-3.5 h-3.5 accent-soft-purple rounded"
                                />
                              </td>
                              <td className="p-3 text-[10px] font-mono text-plum/25">{t.qIdx + 1}</td>
                              <td className="p-3">
                                <div className="space-y-1 max-w-xs">
                                  <p className="text-[11px] text-plum/60 font-medium leading-relaxed italic line-clamp-2">{t.q.question_text || "—"}</p>
                                  <span className="text-[9px] text-plum/20">{t.catName}</span>
                                </div>
                              </td>
                              <td className="p-3">
                                <span className="text-[11px] font-bold text-mint">{t.q.answer_text || "—"}</span>
                              </td>
                              <td className="p-3">
                                {t.q.lens && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-soft-purple/10 text-soft-purple uppercase">{t.q.lens}</span>}
                              </td>
                              <td className="p-3">
                                {t.q.form && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-sky/10 text-sky uppercase">{t.q.form.replace(/^Form \d \((.+)\)$/, "$1")}</span>}
                              </td>
                              <td className="p-3">
                                {t.q.backdoor_type && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-mint/10 text-mint uppercase">{t.q.backdoor_type}</span>}
                              </td>
                              <td className="p-3">
                                {t.q.difficulty_tier && (
                                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                    t.q.difficulty_tier === "expert" ? "bg-peach/10 text-peach" :
                                    t.q.difficulty_tier === "challenging" ? "bg-butter/10 text-butter" :
                                    "bg-mint/10 text-mint"
                                  }`}>{t.q.difficulty_tier}</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className="text-[10px] font-mono text-plum/25">{t.q.points || 100}</span>
                              </td>
                              <td className="p-3">
                                {t.q.tag && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-butter/10 text-butter uppercase">{t.q.tag}</span>}
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => openQuestionEditor(t.catId, t.qIdx, t.q)}
                                    className="clay-btn p-1.5 text-plum/15 hover:text-soft-purple transition-colors"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleReverifyLibrary(t.catId, t.qIdx, t.q)}
                                    disabled={isReverifying}
                                    className="clay-btn p-1.5 text-plum/10 hover:text-sky transition-colors"
                                    title="Re-verify with AI solver + fact-check"
                                  >
                                    {isReverifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                  </button>
                                  {vr && (
                                    <span className={`text-[8px] ${vr.solved && vr.verified ? "text-mint" : "text-peach"}`}>
                                      {vr.solved ? "✓" : "✗"}{vr.verified ? "✓" : "✗"}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleDeleteQuestion(t.catId, t.qIdx)}
                                    className="clay-btn p-1.5 text-plum/10 hover:text-peach transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── CARDS VIEW (default) ─────────────────────── */}
              {viewMode === 'cards' && (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredCategories.length === 0 && (
                  <div className="text-center py-12 space-y-2">
                    <span className="text-3xl">📭</span>
                    <p className="text-sm font-bold text-plum/30">
                      {searchQuery ? "No results found" : "No categories yet"}
                    </p>
                    <p className="text-[10px] text-plum/20">
                      {searchQuery ? "Try a different search term" : "Import JSON or generate questions to populate the library"}
                    </p>
                  </div>
                )}

                {filteredCategories.map((cat) => {
                  const questionCount = Array.isArray(cat.data) ? cat.data.length : 0;
                  const isExpanded = expandedCategories.has(cat.id);
                  const questions: any[] = Array.isArray(cat.data) ? cat.data : [];
                  const filteredQuestions = searchQuery.trim()
                    ? questions.map((q: any, i: number) => ({ q, i })).filter(({ q }: { q: any }) => {
                        const s = searchQuery.toLowerCase();
                        return q.question_text?.toLowerCase().includes(s) || q.answer_text?.toLowerCase().includes(s) || q.lens?.toLowerCase().includes(s) || q.backdoor_type?.toLowerCase().includes(s);
                      })
                    : questions.map((q: any, i: number) => ({ q, i }));

                  return (
                    <div key={cat.id}>
                      <div
                        className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                          selectedIds.has(cat.id) ? "border-soft-purple/30 bg-soft-purple/[0.03]" : "border-plum/5 bg-white/50 hover:-translate-y-0.5"
                        }`}
                        onClick={(e) => { if ((e.target as HTMLElement).closest("input, button")) return; toggleExpand(cat.id); }}
                      >
                        <input type="checkbox" checked={selectedIds.has(cat.id)} onChange={() => toggleSelection(cat.id)} className="w-4 h-4 accent-soft-purple rounded flex-shrink-0" onClick={(e) => e.stopPropagation()} />
                        <span className="text-plum/20 flex-shrink-0">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                        <div className="w-10 h-10 rounded-xl bg-plum/5 flex items-center justify-center flex-shrink-0"><LayoutPanelTop className="w-5 h-5 text-plum/30" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="font-outfit font-bold text-sm text-plum truncate">{cat.name}</h4>
                            {cat.tags?.map((tag: string, i: number) => (<span key={i} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-plum/5 text-plum/30 uppercase whitespace-nowrap">{tag}</span>))}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-plum/25 font-medium">
                            <span>{questionCount} questions</span><span>·</span><span>{cat.main_category}</span><span>·</span><span>{new Date(cat.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); openEditModal(cat); }} className="clay-btn p-2 text-plum/20 hover:text-plum transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(cat.id); }} className="clay-btn p-2 text-plum/10 hover:text-peach transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ml-12 mt-1 space-y-1.5 animate-slide-up-fade">
                          {filteredQuestions.length === 0 && (
                            <div className="text-center py-6"><p className="text-[10px] text-plum/25 font-medium">{searchQuery ? "No matching questions" : "No questions in this category"}</p></div>
                          )}
                          {filteredQuestions.map(({ q, i: actualIdx }: { q: any; i: number }) => {
                            const rvKey = qKey(cat.id, actualIdx);
                            const vr = questionVerifyResults[rvKey];
                            const isReverifying = reverifyingQuestions.has(rvKey);
                            const isQSelected = selectedQuestionKeys.has(rvKey);
                            return (
                              <div key={rvKey} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors group ${
                                isQSelected ? "bg-soft-purple/[0.04] border-soft-purple/20" : "bg-plum/[0.02] border-plum/[0.04] hover:bg-plum/[0.04]"
                              }`}>
                                <input type="checkbox" checked={isQSelected} onChange={() => toggleQuestionSelection(cat.id, actualIdx)} className="w-3.5 h-3.5 accent-soft-purple rounded mt-0.5 flex-shrink-0" />
                                <span className="text-[10px] font-mono font-bold text-plum/20 mt-0.5 flex-shrink-0 w-6">Q{actualIdx + 1}</span>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {q.lens && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-soft-purple/10 text-soft-purple uppercase">{q.lens}</span>}
                                    {q.form && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-sky/10 text-sky uppercase">{q.form.replace(/^Form \d \((.+)\)$/, "$1")}</span>}
                                    {q.backdoor_type && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-mint/10 text-mint uppercase">{q.backdoor_type}</span>}
                                    {q.tag && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-butter/10 text-butter uppercase">{q.tag}</span>}
                                    {q.difficulty_tier && (<span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${q.difficulty_tier === "expert" ? "bg-peach/10 text-peach" : q.difficulty_tier === "challenging" ? "bg-butter/10 text-butter" : "bg-mint/10 text-mint"}`}>{q.difficulty_tier}</span>)}
                                    <span className="text-[8px] font-mono text-plum/20">{q.points || 100}pts</span>
                                    {vr && (<span className={`text-[8px] font-bold px-1 py-0.5 rounded ${vr.solved && vr.verified ? "bg-mint/10 text-mint" : "bg-peach/10 text-peach"}`}>{vr.solved ? "🧩" : "❌"}{vr.verified ? "✅" : "❓"}</span>)}
                                  </div>
                                  <p className="text-xs text-plum/60 font-medium leading-relaxed italic line-clamp-2">{q.question_text || "No question text"}</p>
                                  <div className="flex items-center gap-2"><span className="text-[9px] font-bold text-plum/25 uppercase">Answer:</span><span className="text-[11px] font-bold text-mint">{q.answer_text || "N/A"}</span></div>
                                  {Array.isArray(q.options) && q.options.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {q.options.map((opt: string, oi: number) => (<span key={oi} className={`text-[9px] px-2 py-0.5 rounded font-medium ${opt === q.answer_text ? "bg-mint/10 text-mint border border-mint/20" : "bg-plum/[0.03] text-plum/40"}`}>{String.fromCharCode(65 + oi)}. {opt}</span>))}
                                    </div>
                                  )}
                                  {q.backdoor_explanation && (<details className="text-[9px] text-plum/30"><summary className="cursor-pointer font-bold text-plum/40">Backdoor</summary><p className="mt-1 pl-2 border-l-2 border-mint/20">{q.backdoor_explanation}</p></details>)}
                                </div>
                                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openQuestionEditor(cat.id, actualIdx, q)} className="clay-btn p-1.5 text-plum/15 hover:text-soft-purple transition-colors"><Edit2 className="w-3 h-3" /></button>
                                  <button onClick={() => handleReverifyLibrary(cat.id, actualIdx, q)} disabled={isReverifying} className="clay-btn p-1.5 text-plum/10 hover:text-sky transition-colors" title="Re-verify with AI solver + fact-check">{isReverifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}</button>
                                  <button onClick={() => handleDeleteQuestion(cat.id, actualIdx)} className="clay-btn p-1.5 text-plum/10 hover:text-peach transition-colors"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {/* ─── FORGE TAB ───────────────────────────────────── */}
          {activeTab === "FORGE" && <ForgePanel onDataChange={fetchCategories} />}

          {/* ─── JSON IMPORT TAB ────────────────────────────────── */}
          {activeTab === "JSON_IMPORT" && (
            <div className="clay p-6 space-y-6">
              <div className="flex items-center gap-2">
                <FileJson className="w-4 h-4 text-butter" />
                <h3 className="font-outfit font-bold text-sm text-plum uppercase tracking-wider">
                  JSON Import
                </h3>
              </div>

              <p className="text-[10px] text-plum/30 font-medium leading-relaxed">
                Paste raw JSON schema to broadcast globally. Supports single object or "categories" array.
                Each category needs: name, main_category, description, and data (array of questions).
              </p>

              <textarea
                className="w-full h-64 bg-plum/[0.03] border border-plum/10 p-5 rounded-2xl text-xs font-mono text-plum/70 focus:border-soft-purple/50 outline-none resize-none transition-all placeholder:text-plum/20"
                placeholder='{ "categories": [...] }'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
              />

              <button
                onClick={handleJsonImport}
                disabled={loading || !jsonInput}
                className="clay-btn w-full bg-butter text-plum font-outfit font-black py-4 text-sm flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-lg transition-all"
              >
                {loading ? (
                  <>
                    <Upload className="w-4 h-4 animate-bounce" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Execute Import
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ─── Category Edit Modal ──────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 space-y-6 shadow-2xl animate-slide-up-fade border border-plum/5">
            <div className="flex items-center justify-between">
              <h3 className="font-outfit font-black text-lg text-plum">
                {editingItem ? "Edit Category" : "New Category"}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="clay-btn p-2 text-plum/30 hover:text-plum transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
                  Category Name
                </label>
                <input
                  className="w-full clay-input p-3 text-sm"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. World History"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
                  Main Category (Topic)
                </label>
                <input
                  className="w-full clay-input p-3 text-sm"
                  value={editForm.main_category}
                  onChange={(e) => setEditForm({ ...editForm, main_category: e.target.value })}
                  placeholder="e.g. History"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
                  Tags (comma-separated)
                </label>
                <input
                  className="w-full clay-input p-3 text-sm"
                  value={editForm.tags}
                  onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                  placeholder="e.g. Grid, History, Hard"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  className="w-full h-24 clay-input p-3 text-sm resize-none"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              {/* Lens Mode + Target Lens */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">Lens Mode</label>
                  <select className="w-full clay-input p-3 text-sm" value={editForm.lens_mode}
                    onChange={(e) => setEditForm({ ...editForm, lens_mode: e.target.value as "diverse" | "focused" })}>
                    <option value="diverse">Diverse (5q max)</option>
                    <option value="focused">Focused (30q max)</option>
                  </select>
                </div>
                {editForm.lens_mode === "focused" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">Target Lens</label>
                    <select className="w-full clay-input p-3 text-sm" value={editForm.target_lens}
                      onChange={(e) => setEditForm({ ...editForm, target_lens: e.target.value })}>
                      <option value="">Auto (recommended)</option>
                      {ALL_LENSES_EDIT.map((l: string) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.is_global}
                  onChange={(e) => setEditForm({ ...editForm, is_global: e.target.checked })}
                  className="w-4 h-4 accent-soft-purple rounded"
                />
                <span className="text-xs font-bold text-plum/50 uppercase tracking-wider">
                  Public Asset (Global)
                </span>
              </label>
            </div>

            <div className="pt-2 flex gap-4">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 clay-btn py-3 text-xs font-bold text-plum/30 hover:text-plum transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 clay-btn py-3 bg-soft-purple text-white text-xs font-black uppercase tracking-wider hover:shadow-lg disabled:opacity-50 transition-all"
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Question Edit Modal ──────────────────────────────── */}
      {showQuestionModal && editingQuestion && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-8 space-y-6 shadow-2xl animate-slide-up-fade border border-plum/5">
            <div className="flex items-center justify-between">
              <h3 className="font-outfit font-black text-lg text-plum">
                Edit Question Q{editingQuestion.qIdx + 1}
              </h3>
              <button
                onClick={() => { setShowQuestionModal(false); setEditingQuestion(null); }}
                className="clay-btn p-2 text-plum/30 hover:text-plum transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Question text */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
                  Question Text
                </label>
                <textarea
                  className="w-full h-20 clay-input p-3 text-sm resize-none"
                  value={editingQuestion.q.question_text || ""}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, question_text: e.target.value } })}
                />
              </div>

              {/* Answer text */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
                  Answer Text
                </label>
                <input
                  className="w-full clay-input p-3 text-sm"
                  value={editingQuestion.q.answer_text || ""}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, answer_text: e.target.value } })}
                />
              </div>

              {/* Options */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
                  Options (4 — one must match the answer)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(editingQuestion.q.options || ["", "", "", ""]).slice(0, 4).map((opt: string, oi: number) => (
                    <input
                      key={oi}
                      className={`w-full clay-input p-2.5 text-xs ${opt === editingQuestion.q.answer_text ? "border-mint/30 bg-mint/[0.03]" : ""}`}
                      placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      value={opt}
                      onChange={(e) => {
                        const newOptions = [...(editingQuestion.q.options || ["", "", "", ""])];
                        newOptions[oi] = e.target.value;
                        setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, options: newOptions } });
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Lens + Form row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">Lens</label>
                  <select
                    className="w-full clay-input p-3 text-sm"
                    value={editingQuestion.q.lens || ""}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, lens: e.target.value } })}
                  >
                    <option value="">Select lens</option>
                    {["Origin Story","The Unexpected","The Human Element","Numbers & Scale","The Rivalry","The Oddity","Behind the Scenes","The Connection","What If?","The Legacy"].map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">Form</label>
                  <select
                    className="w-full clay-input p-3 text-sm"
                    value={editingQuestion.q.form || ""}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, form: e.target.value } })}
                  >
                    <option value="">Select form</option>
                    {["Form 1 (Action-First)","Form 2 (Parenthetical Hook)","Form 3 (Sensory Clue)","Form 4 (Active Quote)","Form 5 (Direct Narrative)"].map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Backdoor + Difficulty row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">Backdoor Type</label>
                  <select
                    className="w-full clay-input p-3 text-sm"
                    value={editingQuestion.q.backdoor_type || ""}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, backdoor_type: e.target.value } })}
                  >
                    <option value="">Select backdoor</option>
                    {["Synonym Bridge","Contrast Pop","Everyday Link","Anagram-Wordplay","Sequence Pattern","Sensory Logic","Category Elimination"].map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">Difficulty</label>
                  <select
                    className="w-full clay-input p-3 text-sm"
                    value={editingQuestion.q.difficulty_tier || "easy"}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, difficulty_tier: e.target.value } })}
                  >
                    {["easy","medium","challenging","expert"].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Points + Tag row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">Points</label>
                  <input
                    type="number"
                    className="w-full clay-input p-3 text-sm"
                    value={editingQuestion.q.points || 100}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, points: parseInt(e.target.value) || 100 } })}
                    min={100}
                    max={500}
                    step={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">Tag (1-2 words)</label>
                  <input
                    className="w-full clay-input p-3 text-sm"
                    value={editingQuestion.q.tag || ""}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, tag: e.target.value } })}
                    placeholder="e.g. Flame"
                  />
                </div>
              </div>

              {/* Backdoor explanation */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-plum/40 uppercase tracking-wider">
                  Backdoor Explanation
                </label>
                <textarea
                  className="w-full h-16 clay-input p-3 text-xs resize-none"
                  value={editingQuestion.q.backdoor_explanation || ""}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, q: { ...editingQuestion.q, backdoor_explanation: e.target.value } })}
                />
              </div>
            </div>

            <div className="pt-2 flex gap-4">
              <button
                onClick={() => { setShowQuestionModal(false); setEditingQuestion(null); }}
                className="flex-1 clay-btn py-3 text-xs font-bold text-plum/30 hover:text-plum transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuestion}
                disabled={loading}
                className="flex-1 clay-btn py-3 bg-soft-purple text-white text-xs font-black uppercase tracking-wider hover:shadow-lg disabled:opacity-50 transition-all"
              >
                {loading ? "Saving..." : "Save Question"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
