import { HelpCircle } from 'lucide-react'

interface Category {
    id: string
    name: string
    description: string
    main_category: string
    tags?: string[]
}

interface DraftGridProps {
    categories: Category[]
    unavailableIds: Set<string>
    isMysteryMode: boolean
    canPick: boolean
    onSelect: (cat: Category) => void
}

export default function CategoryDraftGrid({ categories, unavailableIds, isMysteryMode, canPick, onSelect }: DraftGridProps) {
    if (categories.length === 0) {
        return (
            <div className="text-center p-8 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-white/40 text-sm mb-2">No categories found in this pool.</p>
                <div className="text-[10px] text-white/30 font-mono">Waiting for server content...</div>
            </div>
        )
    }

    return (
        <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map(cat => {
                const isTaken = unavailableIds.has(cat.id)
                // In Mystery Mode, available picks are mystery. Taken picks show their true face? 
                // Or: "Content Redacted" until picked.
                // Let's stick to existing logic: If Mystery Mode is ON, hide details unless...
                // Actually existing logic was: `isMystery = settings.isMystery && !isTaken`.
                // So once taken, it might be revealed or remain hidden.
                // For simplicity and suspense: Show as Mystery if (MysteryMode AND !Taken).
                const isMystery = isMysteryMode && !isTaken

                return (
                    <button
                        key={cat.id}
                        disabled={!canPick || isTaken}
                        onClick={() => onSelect(cat)}
                        aria-label={isMystery ? `Mystery category` : `${cat.name} — ${cat.description}`}
                        aria-disabled={!canPick || isTaken}
                        className={`p-6 rounded-2xl text-left transition-all active:scale-95 border group focus-visible:ring-2 focus-visible:ring-neon-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-black ${isTaken
                            ? 'bg-black/20 border-white/5 opacity-50 cursor-not-allowed grayscale'
                            : !canPick
                                ? 'bg-white/5 border-white/5 opacity-50 cursor-wait'
                                : isMystery
                                    ? 'bg-neon-purple/5 border-neon-purple/30 hover:bg-neon-purple/10 hover:shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                                    : 'bg-white/5 border-white/5 hover:bg-neon-emerald/10 hover:border-neon-emerald hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                            }`}
                    >
                        <h3 className="font-orbitron font-bold text-white mb-1 flex items-center gap-2">
                            {isMystery ? (
                                <span className="flex items-center gap-2 text-neon-purple group-hover:animate-pulse">
                                    <HelpCircle className="w-4 h-4" />
                                    MYSTERY PROTOCOL
                                </span>
                            ) : (
                                <>
                                    {cat.name}
                                    {(cat.tags?.includes('Arena') || cat.main_category === 'Arena') && (
                                        <span className="text-[8px] bg-red-600/20 text-red-500 border border-red-600/30 px-1 rounded uppercase tracking-wider">PVP</span>
                                    )}
                                </>
                            )}
                        </h3>
                        <p className="text-xs text-white/40 line-clamp-2">
                            {isMystery ? "Content Redacted. Select to Decrypt." : cat.description}
                        </p>
                        {isTaken && <span className="text-[9px] text-red-400 uppercase tracking-widest mt-2 block">Taken</span>}
                    </button>
                )
            })}
        </div>
    )
}
