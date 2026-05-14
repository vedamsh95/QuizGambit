import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ArrowLeft, ArrowRight, Trophy, Sparkles, GripVertical, Check, Search, BookOpen, Users, Plus, Trash2, Play } from 'lucide-react'

interface LocalPlaySetupProps {
    onStart: (settings: any) => void
}

export default function LocalPlaySetup({ onStart }: LocalPlaySetupProps) {
    const [step, setStep] = useState(1)
    const [config, setConfig] = useState({
        rounds: 3,
        categoriesPerRound: 5,
        timer: 15
    })

    // Categories State
    const [categories, setCategories] = useState<any[]>([])
    const [selectedCategories, setSelectedCategories] = useState<Record<number, any[]>>({})
    const [search, setSearch] = useState('')

    // Players State
    const [players, setPlayers] = useState<string[]>([])
    const [playerInput, setPlayerInput] = useState('')

    const addPlayer = () => {
        if (!playerInput.trim()) return
        setPlayers(prev => [...prev, playerInput.trim().toUpperCase()])
        setPlayerInput('')
    }

    const removePlayer = (index: number) => {
        setPlayers(prev => prev.filter((_, i) => i !== index))
    }

    useEffect(() => {
        fetchCategories()
    }, [])

    const fetchCategories = async () => {
        const { data } = await supabase.from('categories_library').select('*')
        if (data) setCategories(data)
    }

    const handleDragStart = (e: React.DragEvent, category: any) => {
        e.dataTransfer.setData('category', JSON.stringify(category))
    }

    const handleDrop = (e: React.DragEvent, roundIndex: number) => {
        e.preventDefault()
        const rawCategory = JSON.parse(e.dataTransfer.getData('category'))

        // Regenerate IDs for questions to ensure uniqueness for this instance
        const category = {
            ...rawCategory,
            data: rawCategory.data?.map((q: any) => ({
                ...q,
                id: crypto.randomUUID()
            }))
        }

        // Prevent duplicates in the same round
        const currentRoundCats = selectedCategories[roundIndex] || []
        if (currentRoundCats.find(c => c.id === category.id)) return
        if (currentRoundCats.length >= config.categoriesPerRound) return

        setSelectedCategories(prev => ({
            ...prev,
            [roundIndex]: [...(prev[roundIndex] || []), category]
        }))
    }

    const removeCategory = (roundIndex: number, catId: string) => {
        setSelectedCategories(prev => ({
            ...prev,
            [roundIndex]: prev[roundIndex].filter(c => c.id !== catId)
        }))
    }

    const canStart = Object.keys(selectedCategories).length === config.rounds &&
        Object.values(selectedCategories).every(cats => cats.length === config.categoriesPerRound)

    return (
        <div className="w-full max-w-6xl mx-auto glass p-8 rounded-[3rem] animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Step 1: Configuration */}
            {step === 1 && (
                <div className="space-y-12 text-center py-12">
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-emerald/10 text-neon-emerald border border-neon-emerald/20 text-[10px] font-black tracking-[0.3em] uppercase">
                            <Sparkles className="w-3 h-3" /> Phase 1
                        </div>
                        <h2 className="text-4xl font-orbitron font-black text-white uppercase tracking-tighter">Mission Config</h2>
                        <p className="text-white/40 text-sm tracking-widest uppercase">Define the parameters of your engagement</p>
                    </div>

                    <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto">
                        <div className="glass-dark p-8 rounded-3xl space-y-4">
                            <label className="text-neon-emerald font-black tracking-widest uppercase text-xs">Rounds</label>
                            <div className="text-6xl font-orbitron font-black text-white">{config.rounds}</div>
                            <input
                                type="range" min="1" max="5"
                                value={config.rounds}
                                onChange={e => setConfig({ ...config, rounds: parseInt(e.target.value) })}
                                className="w-full accent-neon-emerald"
                            />
                        </div>
                        <div className="glass-dark p-8 rounded-3xl space-y-4">
                            <label className="text-neon-emerald font-black tracking-widest uppercase text-xs">Cats / Round</label>
                            <div className="text-6xl font-orbitron font-black text-white">{config.categoriesPerRound}</div>
                            <input
                                type="range" min="1" max="5"
                                value={config.categoriesPerRound}
                                onChange={e => setConfig({ ...config, categoriesPerRound: parseInt(e.target.value) })}
                                className="w-full accent-neon-emerald"
                            />
                        </div>
                        <div className="glass-dark p-8 rounded-3xl space-y-4">
                            <label className="text-neon-emerald font-black tracking-widest uppercase text-xs">Timer (s)</label>
                            <div className="text-6xl font-orbitron font-black text-white">{config.timer}</div>
                            <input
                                type="range" min="5" max="60" step="5"
                                value={config.timer}
                                onChange={e => setConfig({ ...config, timer: parseInt(e.target.value) })}
                                className="w-full accent-neon-emerald"
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => setStep(2)}
                        className="bg-neon-emerald text-black px-12 py-6 rounded-2xl font-black text-xl tracking-[0.2em] uppercase hover:scale-105 active:scale-95 transition-all emerald-glow flex items-center gap-4 mx-auto"
                    >
                        Initialize Matrix <ArrowRight className="w-6 h-6" />
                    </button>
                </div>
            )}

            {/* Step 2: Category Selection */}
            {step === 2 && (
                <>
                    <div className="h-[700px] flex gap-8">
                        {/* Left: Library Source */}
                        <div className="w-1/3 flex flex-col gap-6">
                            <div className="glass-dark p-6 rounded-3xl space-y-4">
                                <h3 className="text-neon-emerald font-black tracking-widest uppercase text-xs flex items-center gap-2">
                                    <BookOpen className="w-3 h-3" /> Data Source
                                </h3>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                    <input
                                        placeholder="SEARCH ARCHIVES..."
                                        className="w-full bg-black/40 border border-white/5 p-4 pl-12 rounded-xl text-xs font-bold tracking-widest uppercase focus:border-neon-emerald/50 outline-none"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                {(() => {
                                    // Group categories by main_category
                                    const grouped = categories
                                        .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
                                        .reduce((acc, cat) => {
                                            const main = cat.main_category || 'General';
                                            if (!acc[main]) acc[main] = [];
                                            acc[main].push(cat);
                                            return acc;
                                        }, {} as Record<string, any[]>);

                                    return (Object.entries(grouped) as [string, any[]][]).map(([mainCat, subCats]) => (
                                        <div key={mainCat} className="space-y-2">
                                            <button
                                                // Implement collapsible logic if desired, for now keeping open or simple headers
                                                className="w-full text-left px-4 py-2 text-[10px] font-black tracking-[0.2em] text-white/40 uppercase hover:text-white transition-colors flex items-center gap-2"
                                            >
                                                <div className="w-1 h-1 bg-neon-emerald rounded-full" />
                                                {mainCat}
                                            </button>
                                            <div className="grid gap-2 pl-4 border-l border-white/5 ml-2">
                                                {subCats.map(cat => {
                                                    const isArena = cat.tags?.includes('Arena') || cat.name.includes('(Arena)')
                                                    const displayName = cat.name.replace(' (Arena)', '').trim()

                                                    return (
                                                        <div
                                                            key={cat.id}
                                                            draggable
                                                            onDragStart={(e) => handleDragStart(e, cat)}
                                                            className="bg-white/5 p-4 rounded-xl border border-white/5 hover:border-neon-emerald/50 hover:bg-white/10 cursor-grab active:cursor-grabbing transition-all group"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <GripVertical className="w-4 h-4 text-white/20 group-hover:text-neon-emerald" />
                                                                <div>
                                                                    <div className="text-white font-bold text-sm tracking-wider uppercase flex items-center gap-2">
                                                                        {displayName}
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                                        {isArena && (
                                                                            <span className="text-[8px] font-black px-1.5 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded uppercase tracking-wider">
                                                                                Arena
                                                                            </span>
                                                                        )}
                                                                        {cat.is_global && (
                                                                            <span className="text-[8px] font-black px-1.5 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded uppercase tracking-wider">
                                                                                Global
                                                                            </span>
                                                                        )}
                                                                        <span className="text-[8px] font-black px-1.5 py-0.5 bg-white/5 text-white/30 border border-white/10 rounded uppercase tracking-wider">
                                                                            {cat.data?.length || 0} Qs
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>

                        {/* Right: Round Slots */}
                        <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                            {Array.from({ length: config.rounds }).map((_, rIdx) => {
                                const roundNum = rIdx + 1
                                const currentCats = selectedCategories[roundNum] || []
                                const isFull = currentCats.length >= config.categoriesPerRound

                                return (
                                    <div
                                        key={roundNum}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={e => handleDrop(e, roundNum)}
                                        className={`p-6 rounded-[2rem] border-2 transition-all ${isFull
                                            ? 'bg-neon-emerald/5 border-neon-emerald/20'
                                            : 'bg-white/5 border-dashed border-white/10 hover:border-white/20'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="text-xl font-orbitron font-black text-white uppercase tracking-widest">
                                                Round 0{roundNum}
                                            </h3>
                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${isFull ? 'bg-neon-emerald text-black' : 'bg-white/10 text-white/40'
                                                }`}>
                                                {currentCats.length} / {config.categoriesPerRound} Slots Filled
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            {currentCats.map(cat => (
                                                <div key={cat.id} className="bg-black/40 p-3 rounded-xl flex items-center justify-between border border-white/5 group">
                                                    <span className="text-white font-bold text-xs uppercase tracking-wider pl-2">{cat.name}</span>
                                                    <button
                                                        onClick={() => removeCategory(roundNum, cat.id)}
                                                        className="p-2 text-white/20 hover:text-red-500 transition-colors"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                            {!isFull && (
                                                <div className="h-12 rounded-xl border border-dashed border-white/10 flex items-center justify-center text-[10px] font-black text-white/10 uppercase tracking-widest">
                                                    Drop Category Here
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-8 border-t border-white/5 mt-6">
                        <button
                            onClick={() => setStep(1)}
                            className="text-white/40 hover:text-white uppercase tracking-widest text-xs font-bold flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Config
                        </button>

                        <button
                            disabled={!canStart}
                            onClick={() => setStep(3)}
                            className="bg-neon-emerald disabled:opacity-20 disabled:grayscale text-black px-12 py-5 rounded-2xl font-black text-lg tracking-[0.2em] uppercase hover:scale-105 active:scale-95 transition-all emerald-glow flex items-center gap-4"
                        >
                            Confirm Loadout <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                </>
            )}

            {/* Step 3: Player Registration */}
            {step === 3 && (
                <div className="max-w-4xl mx-auto space-y-12 py-12">
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-emerald/10 text-neon-emerald border border-neon-emerald/20 text-[10px] font-black tracking-[0.3em] uppercase">
                            <Users className="w-3 h-3" /> Phase 3
                        </div>
                        <h2 className="text-4xl font-orbitron font-black text-white uppercase tracking-tighter">Register Agents</h2>
                        <p className="text-white/40 text-sm tracking-widest uppercase">Identify the operatives for this session</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Input Area */}
                        <div className="glass-dark p-8 rounded-[2rem] space-y-6">
                            <div className="flex gap-4">
                                <input
                                    value={playerInput}
                                    onChange={e => setPlayerInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addPlayer()}
                                    placeholder="ENTER AGENT NAME"
                                    className="flex-1 bg-black/40 border-2 border-white/5 focus:border-neon-emerald/50 p-4 rounded-xl text-white font-bold tracking-wider outline-none uppercase"
                                />
                                <button
                                    onClick={addPlayer}
                                    className="bg-neon-emerald/10 text-neon-emerald border border-neon-emerald/20 hover:bg-neon-emerald hover:text-black p-4 rounded-xl transition-all"
                                >
                                    <Plus className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                {players.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5 group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-emerald to-emerald-800 flex items-center justify-center text-black font-black text-xs">
                                                {p.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span className="font-bold text-white uppercase tracking-wider">{p}</span>
                                        </div>
                                        <button
                                            onClick={() => removePlayer(i)}
                                            className="text-white/20 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {players.length === 0 && (
                                    <div className="text-center text-white/20 py-8 text-xs font-mono uppercase border-2 border-dashed border-white/5 rounded-xl">
                                        No agents registered
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Preview / Ready State */}
                        <div className="flex flex-col justify-center items-center text-center space-y-6">
                            <div className="w-32 h-32 rounded-full bg-neon-emerald/5 border-4 border-neon-emerald/20 flex items-center justify-center relative">
                                <Users className="w-12 h-12 text-neon-emerald/50" />
                                <div className="absolute -top-2 -right-2 w-10 h-10 bg-neon-emerald rounded-full flex items-center justify-center text-black font-black text-lg shadow-lg shadow-neon-emerald/20">
                                    {players.length}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-xl uppercase tracking-widest mb-2">Ready to Launch</h3>
                                {players.length < 2 ? (
                                    <p className="text-red-400 text-xs font-bold uppercase tracking-wider">Minimum 2 Players Required</p>
                                ) : (
                                    <p className="text-neon-emerald text-xs font-bold uppercase tracking-wider">All Systems Go</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-8 border-t border-white/5">
                        <button
                            onClick={() => setStep(2)}
                            className="text-white/40 hover:text-white uppercase tracking-widest text-xs font-bold flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Agents
                        </button>

                        <button
                            disabled={players.length < 2}
                            onClick={async () => {
                                // Process Categories with Smart Selection
                                const processedCategories: Record<number, any[]> = {}

                                const smartSelect = await import('../lib/smartSelection').then(m => m.smartSelectQuestions)

                                for (const [roundStr, cats] of Object.entries(selectedCategories)) {
                                    const processedCats = []
                                    for (const cat of cats) {
                                        // Filter/Balance logic
                                        const finalQuestions = await smartSelect(cat.data || [], cat.name)
                                        processedCats.push({ ...cat, data: finalQuestions })
                                    }
                                    processedCategories[parseInt(roundStr)] = processedCats
                                }

                                const playerObjects = players.map(name => ({
                                    id: crypto.randomUUID(),
                                    name,
                                    score: 0
                                }))
                                onStart({ ...config, players: playerObjects, round_categories: processedCategories })
                            }}
                            className="bg-neon-emerald disabled:opacity-20 disabled:grayscale text-black px-12 py-5 rounded-2xl font-black text-lg tracking-[0.2em] uppercase hover:scale-105 active:scale-95 transition-all emerald-glow flex items-center gap-4"
                        >
                            <Play className="w-5 h-5" /> INITIALIZE SESSION
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
