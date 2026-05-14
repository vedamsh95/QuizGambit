import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Save, Upload, FileJson, Trash2, ShieldCheck, Database, LayoutPanelTop, Terminal, Sparkles, Copy, X, BookOpen, Plus, Edit2, CheckSquare } from 'lucide-react'
import AIGeneratorView from './AIGeneratorView'
import { SYSTEM_PROMPT_STANDARD, SYSTEM_PROMPT_ARENA } from '../lib/prompts'

interface AdminDashboardProps {
    onBack: () => void
}

export default function AdminDashboard({ onBack }: AdminDashboardProps) {
    const [jsonInput, setJsonInput] = useState('')
    const [categories, setCategories] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [stats, setStats] = useState({ users: 0, categories: 0, lobbies: 0 })

    // CRUD State
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingItem, setEditingItem] = useState<any>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [editForm, setEditForm] = useState({
        name: '',
        main_category: '',
        description: '',
        is_global: true,
        tags: ''
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
        const { count: catCount } = await supabase.from('categories_library').select('*', { count: 'exact', head: true })
        const { count: lobbyCount } = await supabase.from('lobbies').select('*', { count: 'exact', head: true })

        setStats({
            users: userCount || 0,
            categories: catCount || 0,
            lobbies: lobbyCount || 0
        })

        const { data } = await supabase
            .from('categories_library')
            .select('*')
            .eq('is_global', true)
            .order('created_at', { ascending: false })
        if (data) setCategories(data)
    }

    const handleJsonImport = async () => {
        try {
            const parsed = JSON.parse(jsonInput)
            setLoading(true)

            let itemsToImport = [];

            if (parsed.categories && Array.isArray(parsed.categories)) {
                itemsToImport = parsed.categories;
            } else if (Array.isArray(parsed)) {
                itemsToImport = parsed;
            } else {
                itemsToImport = [parsed];
            }

            const userId = (await supabase.auth.getUser()).data.user?.id

            for (const item of itemsToImport) {
                const { error } = await supabase
                    .from('categories_library')
                    .insert([{
                        name: item.name,
                        main_category: item.main_category || 'General',
                        description: item.description || `Imported: ${item.name}`,
                        data: item.data || item.questions, // Support both 'data' and 'questions' key
                        is_global: true,
                        created_by: userId
                    }])
                if (error) throw error
            }

            setJsonInput('')
            alert(`Import Successful: ${itemsToImport.length} categories archived.`)
            fetchData()
        } catch (err: any) {
            alert('Import Error: ' + err.message)
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    // --- CRUD Handlers ---

    const openCreateModal = () => {
        setEditingItem(null)
        setEditForm({ name: '', main_category: '', description: '', is_global: true, tags: '' })
        setShowEditModal(true)
    }

    const openEditModal = (item: any) => {
        setEditingItem(item)
        setEditForm({
            name: item.name,
            main_category: item.main_category,
            description: item.description,
            is_global: item.is_global,
            tags: item.tags ? item.tags.join(', ') : ''
        })
        setShowEditModal(true)
    }

    const handleDelete = async (id: string, confirmMsg = 'Are you sure you want to PERMANENTLY delete this asset? This cannot be undone.') => {
        if (!confirm(confirmMsg)) return

        const { error } = await supabase.from('categories_library').delete().eq('id', id)

        if (error) {
            alert('Delete failed: ' + error.message)
        } else {
            fetchData()
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} assets? This cannot be undone.`)) return

        setLoading(true)
        const { error } = await supabase.from('categories_library').delete().in('id', Array.from(selectedIds))

        if (error) {
            alert('Bulk delete failed: ' + error.message)
        } else {
            setSelectedIds(new Set())
            fetchData()
        }
        setLoading(false)
    }

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedIds(newSet)
    }

    const handleSave = async () => {
        if (!editForm.name || !editForm.main_category) {
            alert('Name and Main Category are required.')
            return
        }

        const payload = {
            name: editForm.name,
            main_category: editForm.main_category,
            description: editForm.description,
            is_global: editForm.is_global,
            tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean)
        }

        setLoading(true)
        try {
            if (editingItem) {
                // Update
                const { error } = await supabase
                    .from('categories_library')
                    .update(payload)
                    .eq('id', editingItem.id)
                if (error) throw error
            } else {
                // Create
                const { error } = await supabase
                    .from('categories_library')
                    .insert([{
                        ...payload,
                        created_by: (await supabase.auth.getUser()).data.user?.id,
                        data: [] // Empty data for new manual entry
                    }])
                if (error) throw error
            }

            setShowEditModal(false)
            fetchData()
        } catch (err: any) {
            alert('Operation failed: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const [view, setView] = useState<'DASHBOARD' | 'AI' | 'PROMPTS'>('DASHBOARD')


    if (view === 'AI') {
        return <AIGeneratorView onBack={() => setView('DASHBOARD')} isAdmin={true} />
    }

    if (view === 'PROMPTS') {
        return (
            <div className="min-h-screen bg-deep-void p-8 space-y-8 animate-in fade-in duration-500">
                <header className="flex items-center justify-between">
                    <button
                        onClick={() => setView('DASHBOARD')}
                        className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-widest">Return to Command</span>
                    </button>
                    <div className="flex items-center gap-3">
                        <Terminal className="w-5 h-5 text-neon-emerald" />
                        <h1 className="text-xl font-orbitron font-bold text-white tracking-widest uppercase">System Prompts Library</h1>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-7xl mx-auto">
                    {[
                        { title: 'Standard Protocol', desc: 'Default quiz generation schema', prompt: SYSTEM_PROMPT_STANDARD },
                        { title: 'Arena Combat Protocol', desc: 'High-velocity competitive schema', prompt: SYSTEM_PROMPT_ARENA }
                    ].map((item, idx) => (
                        <div key={idx} className="glass p-8 rounded-3xl space-y-6 border border-white/5 hover:border-neon-emerald/20 transition-all group">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-white uppercase tracking-wider text-neon-emerald">{item.title}</h3>
                                    <p className="text-[10px] text-white/30 uppercase tracking-widest">{item.desc}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(item.prompt);
                                        alert('Protocol copied to clipboard');
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-neon-emerald/20 hover:text-neon-emerald rounded-xl border border-white/5 text-[10px] font-bold text-white/60 uppercase tracking-widest transition-all"
                                >
                                    <Copy className="w-4 h-4" />
                                    Copy Code
                                </button>
                            </div>
                            <div className="relative">
                                <pre className="w-full h-[500px] p-6 bg-black/60 rounded-2xl border border-white/5 text-[11px] text-white/60 font-mono whitespace-pre-wrap leading-relaxed overflow-y-auto select-all custom-scrollbar shadow-inner">
                                    {item.prompt.trim()}
                                </pre>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-deep-void p-8 space-y-8 animate-in fade-in duration-700">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <button
                        onClick={onBack}
                        className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all text-white/40 hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-neon-emerald/20 flex items-center justify-center border border-neon-emerald/30 text-neon-emerald">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-orbitron font-black text-white tracking-tighter uppercase italic">COMMAND CENTER</h1>
                            <p className="text-white/20 text-[10px] font-black tracking-[0.4em] uppercase mt-1">Superuser terminal & central data node</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setView('PROMPTS')}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-6 py-3 rounded-xl border border-white/5 transition-all text-[10px] font-black tracking-widest uppercase"
                    >
                        <BookOpen className="w-4 h-4" />
                        System Prompts
                    </button>
                    <button
                        onClick={() => setView('AI')}
                        className="flex items-center gap-2 bg-neon-emerald/10 hover:bg-neon-emerald/20 text-neon-emerald px-6 py-3 rounded-xl border border-neon-emerald/20 transition-all text-[10px] font-black tracking-widest uppercase hover:scale-105 active:scale-95"
                    >
                        <Sparkles className="w-4 h-4" />
                        Launch Neural Forge
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-8">
                {/* Stats Grid */}
                <div className="col-span-12 grid grid-cols-4 gap-6">
                    <div className="glass p-6 rounded-3xl border-white/5 space-y-2">
                        <div className="text-[10px] font-black text-white/20 tracking-[0.3em] uppercase">Total Citizens</div>
                        <div className="text-4xl font-orbitron font-black text-white">{stats.users}</div>
                    </div>
                    <div className="glass p-6 rounded-3xl border-neon-emerald/20 space-y-2 bg-neon-emerald/5">
                        <div className="text-[10px] font-black text-neon-emerald/60 tracking-[0.3em] uppercase">Global Assets</div>
                        <div className="text-4xl font-orbitron font-black text-neon-emerald">{stats.categories}</div>
                    </div>
                    <div className="glass p-6 rounded-3xl border-white/5 space-y-2">
                        <div className="text-[10px] font-black text-white/20 tracking-[0.3em] uppercase">Active Arenas</div>
                        <div className="text-4xl font-orbitron font-black text-white">{stats.lobbies}</div>
                    </div>
                    <div className="glass p-6 rounded-3xl border-white/5 space-y-2">
                        <div className="text-[10px] font-black text-white/20 tracking-[0.3em] uppercase">Uptime Score</div>
                        <div className="text-4xl font-orbitron font-black text-white">99.9%</div>
                    </div>
                </div>

                {/* JSON Importer */}
                <div className="col-span-12 lg:col-span-5 space-y-6">
                    <div className="glass p-8 rounded-[3rem] space-y-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <FileJson className="w-32 h-32 text-white" />
                        </div>

                        <div className="flex items-center gap-3">
                            <Terminal className="w-5 h-5 text-neon-emerald" />
                            <h3 className="text-lg font-orbitron font-bold text-white tracking-widest uppercase italic">Injective Port</h3>
                        </div>

                        <p className="text-[10px] font-medium text-white/30 uppercase tracking-[0.2em] leading-relaxed">
                            Paste raw JSON schema to broadcast globally. Supports single object or "categories" array.
                        </p>

                        <textarea
                            className="w-full h-64 bg-black/60 border border-white/10 p-6 rounded-2xl text-xs font-mono text-neon-emerald focus:border-neon-emerald/50 outline-none resize-none transition-all shadow-inner"
                            placeholder='{ "categories": [...] }'
                            value={jsonInput}
                            onChange={e => setJsonInput(e.target.value)}
                        />

                        <button
                            onClick={handleJsonImport}
                            disabled={loading || !jsonInput}
                            className="w-full bg-neon-emerald hover:bg-emerald-400 text-[#010a01] font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] emerald-glow uppercase tracking-[0.2em] disabled:opacity-20"
                        >
                            {loading ? <Upload className="w-5 h-5 animate-bounce" /> : <Save className="w-5 h-5" />}
                            Execute Import
                        </button>
                    </div>
                </div>

                {/* Global Assets Manager */}
                <div className="col-span-7 space-y-6">
                    <div className="glass p-8 rounded-[3rem] space-y-8 flex flex-col h-[700px]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Database className="w-5 h-5 text-blue-500" />
                                <h3 className="text-lg font-orbitron font-bold text-white tracking-widest uppercase italic">Asset Registry</h3>
                            </div>
                            <div className="flex items-center gap-3">
                                {selectedIds.size > 0 && (
                                    <button
                                        onClick={handleBulkDelete}
                                        className="bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                                    >
                                        <Trash2 className="w-3 h-3" /> Delete ({selectedIds.size})
                                    </button>
                                )}
                                <div className="text-[8px] font-black tracking-widest text-white/20 bg-white/5 border border-white/5 p-2 rounded-md uppercase">Read/Write Access</div>
                                <button
                                    onClick={openCreateModal}
                                    className="p-2 bg-neon-emerald/10 text-neon-emerald rounded-lg hover:bg-neon-emerald hover:text-black transition-all"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 pr-4">
                            {categories.map(cat => {
                                const isArena = cat.tags?.includes('Arena') || cat.name.includes('(Arena)')
                                const displayName = cat.name.replace(' (Arena)', '').trim()

                                return (
                                    <div key={cat.id} className={`bg-white/5 border p-5 rounded-3xl flex items-center gap-6 hover:bg-white/10 transition-all group ${selectedIds.has(cat.id) ? 'border-neon-emerald/50 bg-neon-emerald/5' : 'border-white/5'}`}>
                                        <div className="flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(cat.id)}
                                                onChange={() => toggleSelection(cat.id)}
                                                className="w-4 h-4 accent-neon-emerald opacity-20 group-hover:opacity-100 transition-opacity"
                                            />
                                        </div>
                                        <div className="w-12 h-12 rounded-xl bg-black/40 flex items-center justify-center border border-white/5 text-white/20 group-hover:text-neon-emerald transition-colors">
                                            <LayoutPanelTop className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <h4 className="font-bold text-white tracking-wider uppercase text-sm">{displayName}</h4>
                                                {isArena && (
                                                    <span className="text-[8px] font-black px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded uppercase">Arena</span>
                                                )}
                                                <span className="text-[8px] font-black px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded uppercase">Core Asset</span>
                                            </div>
                                            <p className="text-[10px] text-white/30 font-medium tracking-widest uppercase line-clamp-1">{cat.description || 'Global trivia broadcast content'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openEditModal(cat)}
                                                className="p-3 bg-white/5 rounded-xl text-white/20 hover:text-white transition-colors"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cat.id)}
                                                className="p-3 bg-white/5 rounded-xl text-white/10 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
                {/* Closing Grid */}
            </div>

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-deep-void w-full max-w-lg border border-white/10 rounded-3xl p-8 space-y-6 shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-orbitron font-bold text-white uppercase tracking-widest">
                                {editingItem ? 'Edit Asset' : 'New Asset'}
                            </h3>
                            <button onClick={() => setShowEditModal(false)} className="text-white/40 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Asset Name</label>
                                <input
                                    className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-neon-emerald/50 outline-none"
                                    value={editForm.name}
                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Main Category (Topic)</label>
                                <input
                                    className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-neon-emerald/50 outline-none"
                                    value={editForm.main_category}
                                    onChange={e => setEditForm({ ...editForm, main_category: e.target.value })}
                                    placeholder="e.g. Science, History"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Tags (Shared by comma)</label>
                                <input
                                    className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-neon-emerald/50 outline-none"
                                    value={editForm.tags}
                                    onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                                    placeholder="e.g. Arena, Hard, 101"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Description</label>
                                <textarea
                                    className="w-full h-24 bg-black/40 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-neon-emerald/50 outline-none resize-none"
                                    value={editForm.description}
                                    onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={editForm.is_global}
                                    onChange={e => setEditForm({ ...editForm, is_global: e.target.checked })}
                                    className="w-4 h-4 accent-neon-emerald"
                                />
                                <label className="text-xs text-white uppercase tracking-wider">Public Asset (Global)</label>
                            </div>
                        </div>

                        <div className="pt-4 flex gap-4">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="flex-1 py-4 rounded-xl border border-white/10 text-white/40 hover:bg-white/5 hover:text-white text-xs font-bold uppercase tracking-widest transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="flex-1 py-4 rounded-xl bg-neon-emerald text-black hover:bg-emerald-400 text-xs font-bold uppercase tracking-widest transition-all shadow-lg hover:shadow-neon-emerald/20"
                            >
                                {loading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

