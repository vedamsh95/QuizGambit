import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Users, Settings2, Play, Crown, Clock, Hash, Zap, ChevronRight, Share2, LogOut } from 'lucide-react'
import { useRealtimeChannel } from '../hooks/useRealtimeChannel'
import { getAvatar } from '../assets/avatars'
import { GameHeaderButton, GameConnectionBadge } from './ui'

interface LobbyProps {
    lobbyCode: string
    onStartGame: (settings: any) => void
    onEndGame?: () => void
}

export default function Lobby({ lobbyCode, onStartGame, onEndGame }: LobbyProps) {
    const [players, setPlayers] = useState<any[]>([])
    const [settings, setSettings] = useState({
        rounds: 5,
        timer: 15,
        hasBuzzer: true,
        categories: 5,
        selectionMode: 'HOST', // 'HOST' | 'PLAYER'
        categorySource: 'both' // 'global' | 'host' | 'both'
    })
    const [syncing, setSyncing] = useState(false)

    // ── Realtime Channel (Presence + Broadcast) ─────────────────────────────
    const { broadcast, onBroadcast, presences, isConnected } = useRealtimeChannel({
        channelName: `lobby:${lobbyCode}`,
        enablePresence: true,
        presenceData: { playerId: 'host', name: 'Host', status: 'connected' as const },
        subscribeLobby: lobbyCode,
        onLobbyChange: (payload: any) => {
            const updated = payload.new
            if (updated?.settings) {
                setSettings(prev => ({ ...prev, ...updated.settings }))
            }
        },
    })

    // ── Broadcast: settings sync ────────────────────────────────────────────
    useEffect(() => {
        const unsubs: (() => void)[] = []
        unsubs.push(onBroadcast('settings:update', (payload: any) => {
            if (payload && typeof payload === 'object') {
                setSettings(prev => ({ ...prev, ...payload }))
            }
        }))
        return () => unsubs.forEach(fn => fn())
    }, [onBroadcast])

    // ── Presence-based player tracking ──────────────────────────────────────
    const onlineCount = useMemo(() => {
        const presenceCount = Object.keys(presences).length
        return presenceCount > 0 ? presenceCount : players.length
    }, [presences, players.length])

    useEffect(() => {
        // Initial fetch
        const fetchLobby = async () => {
            const { data: lobbyData } = await supabase
                .from('lobbies')
                .select('settings')
                .eq('code', lobbyCode)
                .single()

            if (lobbyData?.settings) {
                setSettings(prev => ({ ...prev, ...lobbyData.settings }))
            }
        }

        const fetchPlayers = async () => {
            const { data } = await supabase
                .from('players')
                .select('*')
                .eq('lobby_code', lobbyCode)
            if (data) setPlayers(data)
        }

        fetchLobby()
        fetchPlayers()

        // Players subscription via postgres_changes (DB authority)
        const playersChannel = supabase.channel(`lobby_players:${lobbyCode}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'players',
                filter: `lobby_code=eq.${lobbyCode}`
            }, () => {
                fetchPlayers()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(playersChannel)
        }
    }, [lobbyCode])

    const updateSetting = async (key: string, val: any) => {
        const newSettings = { ...settings, [key]: val }
        setSettings(newSettings)
        setSyncing(true)

        // Targeted jsonb_set RPC — avoids read-modify-write race conditions
        const { error } = await supabase.rpc('update_lobby_setting_key', {
            p_lobby_code: lobbyCode,
            p_key: key,
            p_value: typeof val === 'boolean' ? val : val
        })

        if (error) console.error('Error updating settings:', error)
        else broadcast('settings:update', { [key]: val })
        setSyncing(false)
    }

    return (
        <div className="min-h-screen bg-deep-void p-8 flex gap-8">
            {/* Sidebar: Game Controls */}
            <div className="w-96 flex flex-col gap-6">
                <div className="glass-dark p-8 rounded-[2.5rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Crown className="w-16 h-16 text-neon-emerald" />
                    </div>

                    <label className="text-xs font-orbitron tracking-[0.3em] text-neon-emerald/60 block mb-2 uppercase">Lobby Code</label>
                    <div className="flex items-center justify-between">
                        <span className="text-6xl font-orbitron font-black text-white tracking-tighter">{lobbyCode}</span>
                        <button className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 active:scale-90">
                            <Share2 className="w-5 h-5 text-white/40" />
                        </button>
                    </div>
                    <p className="mt-4 text-white/70 text-xs font-bold tracking-widest uppercase flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-neon-emerald animate-pulse" />
                        Waiting for players...
                    </p>
                    {onEndGame && (
                        <GameHeaderButton
                            variant="danger"
                            icon={<LogOut className="w-3 h-3" />}
                            onClick={onEndGame}
                            className="w-full justify-center"
                        >
                            End Game
                        </GameHeaderButton>
                    )}
                </div>

                <div className="glass p-8 rounded-[2.5rem] flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-sm font-orbitron tracking-widest text-white uppercase">Arena Settings</h3>
                        <div className={`transition-opacity duration-300 ${syncing ? 'opacity-100' : 'opacity-0'}`}>
                            <div className="w-4 h-4 border-2 border-neon-emerald border-t-transparent rounded-full animate-spin" />
                        </div>
                    </div>

                    <div className="space-y-6 flex-1">
                        {/* Rounds */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs font-bold tracking-widest text-white/70 uppercase">
                                <div className="flex items-center gap-2"><Hash className="w-3 h-3" /> Rounds</div>
                                <span>{settings.rounds}</span>
                            </div>
                            <input
                                type="range" min="1" max="10" step="1"
                                className="w-full accent-neon-emerald"
                                value={settings.rounds}
                                onChange={(e) => updateSetting('rounds', parseInt(e.target.value))}
                            />
                        </div>

                        {/* Categories */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs font-bold tracking-widest text-white/70 uppercase">
                                <div className="flex items-center gap-2"><Settings2 className="w-3 h-3" /> Categories</div>
                                <span>{settings.categories}</span>
                            </div>
                            <input
                                type="range" min="1" max="5" step="1"
                                className="w-full accent-neon-emerald"
                                value={settings.categories}
                                onChange={(e) => updateSetting('categories', parseInt(e.target.value))}
                            />
                        </div>

                        {/* Timer */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs font-bold tracking-widest text-white/70 uppercase">
                                <div className="flex items-center gap-2"><Clock className="w-3 h-3" /> Timer (sec)</div>
                                <span>{settings.timer}s</span>
                            </div>
                            <input
                                type="range" min="5" max="60" step="5"
                                className="w-full accent-neon-emerald"
                                value={settings.timer}
                                onChange={(e) => updateSetting('timer', parseInt(e.target.value))}
                            />
                        </div>

                        {/* Buzzer Toggle */}
                        <button
                            onClick={() => updateSetting('hasBuzzer', !settings.hasBuzzer)}
                            className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between ${settings.hasBuzzer ? 'bg-neon-emerald/10 border-neon-emerald/30 text-neon-emerald' : 'bg-white/5 border-white/5 text-white/40'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <Zap className={`w-4 h-4 ${settings.hasBuzzer ? 'fill-neon-emerald' : ''}`} />
                                <span className="text-xs font-bold tracking-widest uppercase">Buzzer Mode</span>
                            </div>
                            <div className={`w-10 h-6 rounded-full p-1 transition-all ${settings.hasBuzzer ? 'bg-neon-emerald' : 'bg-white/10'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full transition-all ${settings.hasBuzzer ? 'translate-x-4' : 'translate-x-0'}`} />
                            </div>
                        </button>

                        {/* Selection Mode Toggle */}
                        <div className="space-y-3 pt-4 border-t border-white/5">
                            <label className="text-xs font-bold tracking-widest text-white/70 uppercase block">Category Selection</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => updateSetting('selectionMode', 'HOST')}
                                    className={`p-3 rounded-xl border text-xs font-bold tracking-wider uppercase transition-all ${settings.selectionMode !== 'PLAYER'
                                        ? 'bg-neon-emerald/20 border-neon-emerald text-neon-emerald'
                                        : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                        }`}
                                >
                                    Host Pick
                                </button>
                                <button
                                    onClick={() => updateSetting('selectionMode', 'PLAYER')}
                                    className={`p-3 rounded-xl border text-xs font-bold tracking-wider uppercase transition-all ${settings.selectionMode === 'PLAYER'
                                        ? 'bg-blue-500/20 border-blue-500 text-blue-500'
                                        : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                        }`}
                                >
                                    Player Draft
                                </button>
                            </div>
                        </div>

                        {/* Category Source Toggle (visible only for Player Draft) */}
                        {settings.selectionMode === 'PLAYER' && (
                            <div className="space-y-3 pt-4 border-t border-white/5">
                                <label className="text-xs font-bold tracking-widest text-white/70 uppercase block">Category Pool</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => updateSetting('categorySource', 'global')}
                                        className={`p-3 rounded-xl border text-[10px] font-bold tracking-wider uppercase transition-all ${settings.categorySource === 'global'
                                            ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                            : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        Global
                                    </button>
                                    <button
                                        onClick={() => updateSetting('categorySource', 'host')}
                                        className={`p-3 rounded-xl border text-[10px] font-bold tracking-wider uppercase transition-all ${settings.categorySource === 'host'
                                            ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                                            : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        My Sets
                                    </button>
                                    <button
                                        onClick={() => updateSetting('categorySource', 'both')}
                                        className={`p-3 rounded-xl border text-[10px] font-bold tracking-wider uppercase transition-all ${settings.categorySource === 'both'
                                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                                            : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        Both
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => onStartGame(settings)}
                        disabled={players.length === 0}
                        className="w-full bg-white text-black font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase tracking-[0.2em] mt-8 disabled:opacity-20 hover:bg-neon-emerald hover:text-black hover:emerald-glow border-none"
                    >
                        Start Broadcast
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Main Area: Player Grid */}
            <div className="flex-1 space-y-8">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-orbitron font-bold text-white tracking-widest uppercase">Manifest</h2>                        <div className="flex items-center gap-4">
                        <button
                            onClick={() => {
                                const fetchPlayers = async () => {
                                    const { data } = await supabase
                                        .from('players')
                                        .select('*')
                                        .eq('lobby_code', lobbyCode)
                                    if (data) setPlayers(data)
                                }
                                fetchPlayers()
                            }}
                            className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-all"
                            title="Force Refresh"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                        </button>
                        <GameConnectionBadge isConnected={isConnected} onlineCount={onlineCount} />
                        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                            <Users className="w-4 h-4 text-neon-emerald" />
                            <span className="text-sm font-bold text-white/60">{onlineCount} Online</span>
                        </div>
                    </div>
                </div>

                {players.length === 0 ? (
                    <div className="h-[400px] glass rounded-[3rem] border-dashed border-white/5 flex flex-col items-center justify-center text-center p-12 space-y-6">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                            <Users className="w-10 h-10 text-white/10" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-orbitron font-bold text-white/60 uppercase tracking-widest">Awaiting Connections</h3>
                            <p className="text-white/60 text-sm max-w-xs font-medium uppercase tracking-[0.2em]">Share the lobby code to recruit your challengers</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                        {players.map((p, i) => (
                            <div key={p.id} className="glass group hover:border-neon-emerald/30 p-6 rounded-[2rem] transition-all flex items-center gap-4 animate-in zoom-in-95 duration-500">
                                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden">
                                    {p.metadata?.avatar ? (
                                        <img
                                            src={getAvatar(p.metadata.avatar).src}
                                            alt={getAvatar(p.metadata.avatar).label}
                                            className="w-10 h-10 object-contain"
                                        />
                                    ) : (
                                        <span className="font-orbitron font-bold text-neon-emerald text-lg">
                                            {p.name.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-white tracking-wider uppercase text-sm truncate">{p.name}</h4>
                                    <p className="text-xs text-white/60 font-black tracking-widest uppercase">In Lobby</p>
                                </div>
                                <div className="w-2 h-2 rounded-full bg-neon-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
