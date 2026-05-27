import { useState, useEffect } from 'react'
import { Trophy, Users, Settings2, Check, Layout, Sparkles, LogIn, User, LogOut, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { store } from '../lib/storage'
import Auth from './Auth'
import LocalPlaySetup from './LocalPlaySetup'

interface HomeProps {
    onHost: () => void
    onJoin: (code: string, name: string) => void
    onStartLocal: (settings: any) => void
    onCreateArena: () => void
    onLibrary: () => void
    onAdmin: () => void
    isAdmin: boolean
}

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
    { id: 'gemini', name: 'Gemini', placeholder: 'AIza...' },
    { id: 'groq', name: 'Groq', placeholder: 'gsk_...' },
]

export default function Home({ onHost, onJoin, onStartLocal, onLibrary, onAdmin, isAdmin, onCreateArena }: HomeProps) {
    const [viewMode, setViewMode] = useState<'LOCAL' | 'JOIN'>('LOCAL')
    const [code, setCode] = useState('')
    const [name, setName] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [showAuth, setShowAuth] = useState(false)
    const [user, setUser] = useState<any>(null)

    const [selectedProvider, setSelectedProvider] = useState(() =>
        store.getAiProvider() || 'openai'
    )

    const [keys, setKeys] = useState(() => {
        return store.getAiKeys();
    })

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
            if (session) setShowAuth(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    const handleKeyChange = (val: string) => {
        store.setAiKeyForProvider(selectedProvider, val);
        setKeys(store.getAiKeys());
    }

    const handleProviderSelect = (id: string) => {
        setSelectedProvider(id)
        store.setAiProvider(id)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
    }

    // Shared Button Style
    const btnClass = (active: boolean) => `px-6 py-3 rounded-xl border transition-all text-xs font-black tracking-[0.2em] uppercase ${active
        ? 'bg-neon-emerald text-black border-neon-emerald shadow-[0_0_20px_rgba(16,185,129,0.3)]'
        : 'bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10'}`

    return (
        <div className="flex flex-col min-h-screen bg-deep-void relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-neon-emerald/5 blur-[120px] rounded-full animate-pulse-slow pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/5 blur-[120px] rounded-full animate-pulse-slow pointer-events-none" />

            {/* Sleek Header */}
            <header className="flex items-center justify-between px-8 py-6 z-50 border-b border-white/5 bg-black/20 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-neon-emerald/10 rounded-xl flex items-center justify-center border border-neon-emerald/20 text-neon-emerald shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-orbitron font-black text-white tracking-tighter italic">
                            QUIZGAMBIT
                        </h1>
                        <p className="text-[9px] font-black text-white/50 tracking-[0.4em] uppercase">Emerald Abyss</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={() => setShowSettings(true)}
                        className="text-white/40 hover:text-white transition-colors"
                    >
                        <Settings2 className="w-5 h-5" />
                    </button>

                    <div className="h-6 w-px bg-white/10" />

                    {user ? (
                        <div className="flex items-center gap-4">
                            <span className="text-white/60 text-xs font-bold tracking-widest uppercase truncate max-w-[150px]">
                                {user.email}
                            </span>
                            <button
                                onClick={handleLogout}
                                className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-white/40 hover:text-red-400 transition-all border border-white/5"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAuth(true)}
                            className="flex items-center gap-2 bg-neon-emerald/10 hover:bg-neon-emerald/20 text-neon-emerald px-5 py-2 rounded-lg border border-neon-emerald/20 transition-all text-[10px] font-black tracking-widest uppercase"
                        >
                            <LogIn className="w-3 h-3" />
                            Sign In
                        </button>
                    )}
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col p-8 relative z-10">
                {/* Main Menu Grid / Toggles */}
                <div className="flex flex-wrap justify-center mb-8 gap-3">
                    <button
                        onClick={() => setViewMode('LOCAL')}
                        className={btnClass(viewMode === 'LOCAL')}
                    >
                        Local Play
                    </button>

                    <button
                        onClick={() => setViewMode('JOIN')}
                        className={`px-6 py-3 rounded-xl border transition-all text-xs font-black tracking-[0.2em] uppercase ${viewMode === 'JOIN'
                            ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)]'
                            : 'bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10'
                            }`}
                    >
                        Join Arena
                    </button>

                    {/* Host Mode */}
                    <button onClick={onHost} className={btnClass(false)}>
                        Host Standard
                    </button>

                    {/* Arena Mode */}
                    <button onClick={onCreateArena} className="px-6 py-3 rounded-xl border border-red-500/50 text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-all text-xs font-black tracking-[0.2em] uppercase shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                        Create Arena
                    </button>

                    {/* Library */}
                    <button onClick={onLibrary} className={btnClass(false)}>
                        Library
                    </button>

                    {/* Admin */}
                    {isAdmin && (
                        <button onClick={onAdmin} className={btnClass(false)}>
                            Admin
                        </button>
                    )}
                </div>

                {viewMode === 'LOCAL' ? (
                    <div className="flex-1 flex flex-col">
                        <LocalPlaySetup onStart={onStartLocal} />
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-8 duration-500">
                        <div className="glass p-12 rounded-[3.5rem] max-w-lg w-full text-center space-y-8 border-blue-500/20 shadow-[0_0_50px_rgba(37,99,235,0.1)]">
                            <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center mx-auto border border-blue-600/20 text-blue-500 mb-4">
                                <Users className="w-10 h-10" />
                            </div>

                            <div>
                                <h2 className="text-3xl font-orbitron font-black text-white tracking-widest mb-2">JOIN GAME</h2>
                                <p className="text-white/60 text-[10px] font-black tracking-[0.3em] uppercase">Enter your room code to join</p>
                            </div>

                            <div className="space-y-4">
                                <input
                                    placeholder="ROOM CODE"
                                    maxLength={4}
                                    className="w-full bg-black/60 border border-white/10 p-5 rounded-2xl text-center text-2xl font-orbitron font-black text-blue-500 focus:border-blue-500/50 outline-none transition-all placeholder:text-white/10 uppercase tracking-widest"
                                    value={code}
                                    onChange={e => setCode(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && code && onJoin(code, name || 'Player')}
                                />
                                {name && (
                                    <p className="text-white/60 text-xs">
                                        Playing as <span className="text-neon-emerald font-bold">{name}</span>
                                    </p>
                                )}
                            </div>

                            <button
                                disabled={!code}
                                onClick={() => onJoin(code, name || 'Player')}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-20 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-[0.2em] shadow-lg shadow-blue-900/20"
                            >
                                Enter Room
                            </button>

                            <p className="text-white/40 text-[10px] tracking-widest uppercase">
                                Need a code? Ask your host.
                            </p>
                        </div>
                    </div>
                )}
            </main>

            {/* Modals */}
            {showAuth && <Auth onSuccess={() => setShowAuth(false)} onClose={() => setShowAuth(false)} />}

            {showSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-deep-void/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="glass p-10 rounded-[2.5rem] max-w-lg w-full relative shadow-2xl">
                        <button
                            onClick={() => setShowSettings(false)}
                            className="absolute top-6 right-6 text-white/20 hover:text-white"
                        >✕</button>

                        <div className="mb-8">
                            <h3 className="text-2xl font-orbitron font-bold text-white mb-2">AI ENGINE</h3>
                            <p className="text-white/60 text-xs tracking-widest uppercase">Select your intelligence provider</p>
                        </div>

                        <div className="space-y-8">
                            <div className="grid grid-cols-3 gap-3">
                                {PROVIDERS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => handleProviderSelect(p.id)}
                                        className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${selectedProvider === p.id
                                            ? 'bg-neon-emerald/20 border-neon-emerald text-neon-emerald'
                                            : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        <span className="text-[10px] font-black tracking-widest uppercase">{p.name}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black tracking-widest text-white/40 uppercase">API Access Key</label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        placeholder={PROVIDERS.find(p => p.id === selectedProvider)?.placeholder}
                                        className="w-full bg-black/60 border border-white/10 p-5 rounded-2xl text-white focus:border-neon-emerald/50 outline-none font-mono text-sm"
                                        value={keys[selectedProvider] || ''}
                                        onChange={e => handleKeyChange(e.target.value)}
                                    />
                                    {keys[selectedProvider] && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neon-emerald">
                                            <Check className="w-5 h-5" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => setShowSettings(false)}
                                className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-5 rounded-2xl uppercase text-xs tracking-[0.3em] transition-all"
                            >
                                Confirm Configuration
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}


