import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Plus, Search, BookOpen, Trash2, Cloud, HardDrive, Sparkles, Filter, Loader2, X } from 'lucide-react'
import { generateQuizQuestions } from '../lib/ai'

interface LibraryProps {
    onBack: () => void
    onOpenGenerator: () => void
}

export default function Library({ onBack, onOpenGenerator }: LibraryProps) {
    const [categories, setCategories] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<'all' | 'mine' | 'global'>('all')
    const [userId, setUserId] = useState<string | null>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id || null))
        fetchCategories()
    }, [filter])

    const fetchCategories = async () => {
        setLoading(true)
        let query = supabase.from('categories_library').select('*')

        if (filter === 'mine') {
            query = query.eq('is_global', false)
        } else if (filter === 'global') {
            query = query.eq('is_global', true)
        }

        const { data } = await query.order('created_at', { ascending: false })
        if (data) setCategories(data)
        setLoading(false)
    }

    const deleteCategory = async (id: string) => {
        if (!confirm('Are you sure you want to delete this category?')) return
        await supabase.from('categories_library').delete().eq('id', id)
        fetchCategories()
    }

    const filteredCategories = categories.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.description?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="min-h-screen bg-deep-void p-8 space-y-8 animate-in fade-in duration-500 relative">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <button
                        onClick={onBack}
                        className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all text-white/40 hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-4xl font-orbitron font-black text-white tracking-tighter uppercase italic">Knowledge Base</h1>
                        <p className="text-white/20 text-[10px] font-black tracking-[0.4em] uppercase mt-1">Managed library of quiz protocols</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={onOpenGenerator}
                        className="flex items-center gap-2 bg-neon-emerald/10 hover:bg-neon-emerald/20 text-neon-emerald px-6 py-4 rounded-2xl border border-neon-emerald/20 transition-all text-xs font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                        <Sparkles className="w-4 h-4" />
                        AI Generator
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-8">
                {/* Sidebar Filter */}
                <div className="col-span-3 space-y-6">
                    <div className="glass p-8 rounded-[2rem] space-y-6">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <input
                                placeholder="SEARCH ARCHIVES..."
                                className="w-full bg-black/40 border border-white/5 p-4 pl-12 rounded-xl text-xs font-bold tracking-widest uppercase focus:border-neon-emerald/50 outline-none transition-all"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black tracking-widest text-white/20 uppercase px-4 flex items-center gap-2">
                                <Filter className="w-3 h-3" /> Filter Logic
                            </label>
                            {(['all', 'mine', 'global'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`w-full text-left p-4 rounded-xl text-xs font-bold tracking-widest uppercase transition-all ${filter === f ? 'bg-neon-emerald/10 text-neon-emerald border border-neon-emerald/20' : 'text-white/40 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    {f} Archives
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="glass p-8 rounded-[2rem] border-white/5">
                        <h3 className="text-xs font-orbitron tracking-widest text-white/40 uppercase mb-4">Storage Info</h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                <Cloud className="w-4 h-4 text-neon-emerald" />
                                <div className="flex-1">
                                    <div className="text-[10px] font-bold text-white uppercase tracking-wider">Cloud Sync</div>
                                    <div className="text-[8px] text-white/40 uppercase tracking-widest italic">30 Day Retention</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                <HardDrive className="w-4 h-4 text-blue-500" />
                                <div className="flex-1">
                                    <div className="text-[10px] font-bold text-white uppercase tracking-wider">Local Only</div>
                                    <div className="text-[8px] text-white/40 uppercase tracking-widest italic">Browser Storage</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Categories Grid */}
                <div className="col-span-9 space-y-6">
                    {loading ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="h-64 glass animate-pulse rounded-[2.5rem]" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {filteredCategories.length === 0 ? (
                                <div className="h-96 flex flex-col items-center justify-center text-center p-12 glass rounded-[3rem] border-dashed border-white/5">
                                    <BookOpen className="w-16 h-16 text-white/5 mb-6" />
                                    <h3 className="text-xl font-orbitron font-bold text-white/20 uppercase tracking-tightest">No Archives Found</h3>
                                    <p className="text-white/10 text-xs font-medium uppercase tracking-[0.2em] mt-2">Initialize your first AI category scan</p>
                                </div>
                            ) : (
                                (() => {
                                    // Group categories
                                    const grouped = filteredCategories.reduce((acc, cat) => {
                                        const main = cat.main_category || 'General';
                                        if (!acc[main]) acc[main] = [];
                                        acc[main].push(cat);
                                        return acc;
                                    }, {} as Record<string, any[]>);

                                    return (Object.entries(grouped) as [string, any[]][]).map(([mainCat, subCats]) => (
                                        <div key={mainCat} className="space-y-4">
                                            <h2 className="text-2xl font-orbitron font-black text-white/20 uppercase tracking-[0.2em] pl-4 border-l-4 border-neon-emerald/20">
                                                {mainCat}
                                            </h2>
                                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                                                {subCats.map((cat: any) => (
                                                    <div key={cat.id} className="glass group hover:border-neon-emerald/30 p-8 rounded-[2.5rem] transition-all flex flex-col space-y-6 relative overflow-hidden">
                                                        {/* Badges */}
                                                        <div className="absolute top-4 right-4 flex items-center gap-2">
                                                            {(cat.main_category === 'Arena' || (cat.tags && cat.tags.includes('Arena'))) && (
                                                                <span className="text-[8px] bg-red-600/20 text-red-500 border border-red-600/30 px-2 py-1 rounded-md font-black tracking-wider uppercase">PVP</span>
                                                            )}
                                                            {cat.is_global && (
                                                                <span className="bg-neon-emerald/10 text-neon-emerald text-[8px] font-black px-2 py-1 rounded-md tracking-tighter uppercase border border-neon-emerald/20">Global</span>
                                                            )}
                                                        </div>

                                                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-110 group-hover:bg-neon-emerald/10 group-hover:border-neon-emerald/20 transition-all duration-500">
                                                            <BookOpen className="w-8 h-8 text-white/40 group-hover:text-neon-emerald transition-colors" />
                                                        </div>

                                                        <div className="flex-1">
                                                            <h4 className="text-lg font-orbitron font-bold text-white tracking-widest mb-2 group-hover:text-neon-emerald transition-colors">{cat.name}</h4>
                                                            <p className="text-white/30 text-[10px] font-medium leading-relaxed uppercase tracking-widest line-clamp-3">{cat.description || 'No description provided.'}</p>
                                                        </div>

                                                        <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-neon-emerald/50" />
                                                                <span className="text-[10px] font-black tracking-widest text-white/20 uppercase">{cat.data?.length || 0} Qs</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {!cat.is_global && (
                                                                    <button
                                                                        onClick={() => deleteCategory(cat.id)}
                                                                        className="p-2 text-white/10 hover:text-red-500 transition-colors"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ));
                                })()
                            )}
                        </div>
                    )}
                </div>
            </div>

        </div>
    )
}
