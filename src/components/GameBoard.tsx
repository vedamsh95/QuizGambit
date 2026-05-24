import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Trophy, Clock, Zap, XCircle, Play, Eye, Users, Plus, Minus, Edit2, Save, RotateCcw, Lock, Unlock, Timer as TimerIcon, Trash2, LogOut, Wifi, WifiOff } from 'lucide-react'
import confetti from 'canvas-confetti'
import { pickQuestionsForGame } from '../lib/spacedRepetition'
import { useRealtimeChannel } from '../hooks/useRealtimeChannel'

interface GameBoardProps {
    lobbyCode: string
    settings: any
    isLocal?: boolean
    initialCategories?: any // Local mode categories group
    onExit?: () => void
    onReturnToLobby?: () => void // Sticky lobby — return to lobby for next game
}

// Neon Color Palette for Categories
const CATEGORY_COLORS = [
    { name: 'emerald', bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500/50', gradient: 'from-emerald-500/20' },
    { name: 'blue', bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500/50', gradient: 'from-blue-500/20' },
    { name: 'purple', bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500/50', gradient: 'from-purple-500/20' },
    { name: 'pink', bg: 'bg-pink-500', text: 'text-pink-500', border: 'border-pink-500/50', gradient: 'from-pink-500/20' },
    { name: 'yellow', bg: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500/50', gradient: 'from-yellow-500/20' },
    { name: 'orange', bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500/50', gradient: 'from-orange-500/20' },
]

export default function GameBoard({ lobbyCode, settings, isLocal = false, initialCategories, onExit, onReturnToLobby }: GameBoardProps) {

    const [currentRound, setCurrentRound] = useState(1)
    const [activeQuestion, setActiveQuestion] = useState<any>(null)
    const [status, setStatus] = useState('LOBBY')

    // Players & Game State
    const [players, setPlayers] = useState<any[]>(isLocal && settings?.players ? settings.players : [])
    const [revealedQuestions, setRevealedQuestions] = useState<string[]>(settings?.revealed_questions || [])
    const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null)
    const [timer, setTimer] = useState(settings?.timer || 15)
    const [isTimerRunning, setIsTimerRunning] = useState(false)
    const [isAnswerRevealed, setIsAnswerRevealed] = useState(false)
    const [gradedPlayers, setGradedPlayers] = useState<Record<string, 'correct' | 'wrong'>>({})

    // UI State
    const [activeTab, setActiveTab] = useState<'CONTROLS' | 'SCORES'>('CONTROLS')
    const [editingScoreId, setEditingScoreId] = useState<string | null>(null)
    const [editScoreValue, setEditScoreValue] = useState<string>("")
    const [localScores, setLocalScores] = useState<Record<string, number>>({})

    const [remoteCategories, setRemoteCategories] = useState<any[]>([])

    // Fetch remote categories (from questions table) for Host mode
    useEffect(() => {
        if (!isLocal && lobbyCode) {
            const fetchRemoteCategories = async () => {
                const { data: questions } = await supabase
                    .from('questions')
                    .select('*')
                    .eq('lobby_code', lobbyCode)

                if (questions && questions.length > 0) {
                    const grouped: Record<string, any> = {}
                    questions.forEach((q: any) => {
                        if (!grouped[q.category]) {
                            grouped[q.category] = {
                                id: q.category,
                                name: q.category,
                                data: []
                            }
                        }
                        grouped[q.category].data.push(q)
                    })
                    // sort questions by points
                    Object.values(grouped).forEach((cat: any) => {
                        cat.data.sort((a: any, b: any) => a.points - b.points)
                    })
                    setRemoteCategories(Object.values(grouped))
                }
            }
            fetchRemoteCategories()
        }
    }, [lobbyCode, isLocal])

    // ... existing hooks ...

    // ── Realtime Channel (Broadcast + Presence + postgres_changes) ────────────
    const { broadcast, onBroadcast, presences, isConnected } = useRealtimeChannel({
        channelName: `standard:${lobbyCode}`,
        enablePresence: !isLocal && !!lobbyCode,
        presenceData: !isLocal ? { playerId: 'host', name: 'Host', status: 'connected' as const } : undefined,
        subscribeLobby: !isLocal ? lobbyCode : undefined,
        subscribePlayers: !isLocal ? lobbyCode : undefined,
        onLobbyChange: (payload: any) => {
            const newLobby = payload.new
            if (newLobby.status) setStatus(newLobby.status)
            if (newLobby.buzzed_player_id !== undefined) setBuzzedPlayerId(newLobby.buzzed_player_id)
        },
        onPlayerChange: async () => {
            const { data } = await supabase.from('players').select('*').eq('lobby_code', lobbyCode)
            if (data) setPlayers(data.sort((a: any, b: any) => b.score - a.score))
        },
    })

    // ── Broadcast event handlers ─────────────────────────────────────────────
    useEffect(() => {
        if (isLocal) return

        const unsubs: (() => void)[] = []

        // Handle buzzer press from players
        unsubs.push(onBroadcast('buzzer:press', (payload: any) => {
            if (payload.playerId) {
                setBuzzedPlayerId(payload.playerId)
            }
        }))

        // Handle timer ticks from host (non-host clients sync display)
        unsubs.push(onBroadcast('timer:tick', (payload: any) => {
            if (payload.remainingSec !== undefined) {
                setTimer(payload.remainingSec)
                if (payload.remainingSec > 0 && !isTimerRunning) setIsTimerRunning(true)
                if (payload.remainingSec <= 0) setIsTimerRunning(false)
            }
        }))

        // Handle score updates
        unsubs.push(onBroadcast('score:update', (payload: any) => {
            if (payload.playerId && payload.score !== undefined) {
                setPlayers(prev => {
                    const updated = prev.map(p =>
                        p.id === payload.playerId ? { ...p, score: payload.score } : p
                    ).sort((a: any, b: any) => b.score - a.score)
                    return updated
                })
            }
        }))

        // Handle question open (phase transition)
        unsubs.push(onBroadcast('question:open', (payload: any) => {
            if (payload.questionId) {
                setStatus('READING')
                setBuzzedPlayerId(null)
            }
        }))

        // Handle question close (phase transition)
        unsubs.push(onBroadcast('question:close', (payload: any) => {
            setActiveQuestion(null)
            setIsAnswerRevealed(false)
            setGradedPlayers({})
            setStatus('LOBBY')
            setBuzzedPlayerId(null)
        }))

        return () => unsubs.forEach(fn => fn())
    }, [onBroadcast, isLocal])

    // ── Online player count from Presence ────────────────────────────────────
    const onlineCount = useMemo(() => {
        if (isLocal) return players.length
        return Object.keys(presences).length || players.length
    }, [presences, players.length, isLocal])

    // ── Timer Logic (host broadcasts ticks) ──────────────────────────────────
    useEffect(() => {
        let interval: any
        if (isTimerRunning && timer > 0) {
            interval = setInterval(() => {
                setTimer((t: number) => {
                    const next = t - 1
                    if (!isLocal) {
                        broadcast('timer:tick', { remainingSec: next })
                    }
                    return next
                })
            }, 1000)
        } else if (timer === 0) {
            setIsTimerRunning(false)
            if (!isLocal) broadcast('timer:tick', { remainingSec: 0 })
        }
        return () => clearInterval(interval)
    }, [isTimerRunning, timer, isLocal, broadcast])

    // (Replaced by useRealtimeChannel — postgres_changes handled via onLobbyChange / onPlayerChange)

    const closeQuestion = async () => {
        if (!activeQuestion) return

        // Mark as revealed if answer was shown
        if (isAnswerRevealed) {
            const newRevealed = [...revealedQuestions, activeQuestion.id]
            setRevealedQuestions(newRevealed)

            if (!isLocal) {
                // Atomic append to revealed_questions — no read-modify-write race
                await supabase.rpc('append_revealed_question', {
                    p_lobby_code: lobbyCode,
                    p_question_id: activeQuestion.id
                })
                await supabase.from('lobbies').update({
                    status: 'LOBBY',
                    buzzed_player_id: null
                }).eq('code', lobbyCode)
            }
        } else {
            if (!isLocal) {
                await supabase.from('lobbies').update({ status: 'LOBBY', buzzed_player_id: null }).eq('code', lobbyCode)
            }
        }

        // Broadcast close event for instant phase sync
        if (!isLocal) broadcast('question:close', { questionId: activeQuestion.id })

        // Close logic
        setActiveQuestion(null)
        setIsAnswerRevealed(false)
        setGradedPlayers({})
        // Reset status locally
        setStatus('LOBBY')
        setBuzzedPlayerId(null)
    }

    const currentRoundCats = initialCategories?.[currentRound]
        ? initialCategories[currentRound]
        : (() => {
            // Check for explicit round mapping (New Host Mode)
            const mapping = settings?.round_categories?.[currentRound]
            if (mapping && Array.isArray(mapping)) {
                return remoteCategories.filter(c => mapping.includes(c.name))
            }
            return remoteCategories
        })()

    // Use spaced repetition to pick one question per difficulty level
    // Memoize per category to avoid re-picking on every render
    const [pickedQuestions, setPickedQuestions] = useState<Record<string, any[]>>({})

    const getQuestionsForCategory = (cat: any): any[] => {
        const categoryId = cat.id || cat.name

        // If already picked questions for this category in this session, return them
        if (pickedQuestions[categoryId]) {
            return pickedQuestions[categoryId]
        }

        // Pick questions using spaced repetition
        if (Array.isArray(cat.data) && cat.data.length > 0) {
            const picked = pickQuestionsForGame(cat.data, categoryId)
            // Store for this session so re-renders don't re-pick
            setPickedQuestions(prev => ({ ...prev, [categoryId]: picked }))
            return picked
        }
        return []
    }

    const handleReveal = async (q: any) => {
        setActiveQuestion(q)
        setIsAnswerRevealed(false)
        setGradedPlayers({}) // Reset grading for new question
        if (!isLocal) {
            // Set to READING first, players wait for host to Open Buzzers
            setStatus('READING')
            setBuzzedPlayerId(null)
            // Broadcast for instant phase sync
            broadcast('question:open', { questionId: q.id, category: q.category, points: q.points })
            await supabase.from('lobbies').update({ status: 'READING', current_question_id: q.id, buzzed_player_id: null }).eq('code', lobbyCode)
        }
    }



    // --- Host Controls ---

    const handleOpenBuzzers = async () => {
        setStatus('BUZZING')
        if (!isLocal) {
            broadcast('phase:change', { phase: 'BUZZING' })
            await supabase.from('lobbies').update({ status: 'BUZZING' }).eq('code', lobbyCode)
        }
    }

    const handleCloseBuzzers = async () => {
        setStatus('READING')
        if (!isLocal) {
            broadcast('phase:change', { phase: 'READING' })
            await supabase.from('lobbies').update({ status: 'READING' }).eq('code', lobbyCode)
        }
    }

    const handleClearBuzzer = async () => {
        setStatus('BUZZING')
        setBuzzedPlayerId(null)
        if (!isLocal) {
            broadcast('buzzer:clear', {})
            await supabase.from('lobbies').update({ buzzed_player_id: null, status: 'BUZZING' }).eq('code', lobbyCode)
        }
    }

    const adjustScore = async (playerId: string, delta: number, type: 'correct' | 'wrong') => {
        const player = players.find(p => p.id === playerId)
        if (!player) return

        const newScore = (player.score || 0) + delta

        // Optimistic update
        setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, score: newScore } : p).sort((a, b) => b.score - a.score))
        setGradedPlayers(prev => ({ ...prev, [playerId]: type }))

        if (type === 'correct') {
            confetti({
                particleCount: 50,
                spread: 60,
                origin: { x: 0.8, y: 0.5 },
                colors: ['#10B981', '#34D399']
            })
        }

        await supabase.from('players').update({ score: newScore }).eq('id', playerId)
        // Broadcast score update for instant leaderboard refresh
        if (!isLocal) broadcast('score:update', { playerId, score: newScore })
    }

    const handleManualScoreEdit = async (playerId: string) => {
        const val = parseInt(editScoreValue)
        if (isNaN(val)) return

        setEditingScoreId(null)
        setEditScoreValue("")

        setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, score: val } : p).sort((a, b) => b.score - a.score))
        await supabase.from('players').update({ score: val }).eq('id', playerId)
    }

    // ── Refs for latest function references (avoids stale closures in keyboard handler) ──
    const closeQuestionRef = useRef(closeQuestion)
    const handleOpenBuzzersRef = useRef(handleOpenBuzzers)
    const handleCloseBuzzersRef = useRef(handleCloseBuzzers)
    const statusRef = useRef(status)
    const activeQuestionRef = useRef(activeQuestion)
    const isAnswerRevealedRef = useRef(isAnswerRevealed)
    const currentRoundRef = useRef(currentRound)

    // Keep refs in sync with latest function/state values
    useEffect(() => { closeQuestionRef.current = closeQuestion })
    useEffect(() => { handleOpenBuzzersRef.current = handleOpenBuzzers })
    useEffect(() => { handleCloseBuzzersRef.current = handleCloseBuzzers })
    useEffect(() => { statusRef.current = status })
    useEffect(() => { activeQuestionRef.current = activeQuestion })
    useEffect(() => { isAnswerRevealedRef.current = isAnswerRevealed })
    useEffect(() => { currentRoundRef.current = currentRound })

    // ── Keyboard Shortcuts (always uses latest values via refs) ───────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

            const aq = activeQuestionRef.current
            const revealed = isAnswerRevealedRef.current
            const st = statusRef.current
            const cr = currentRoundRef.current

            switch (e.key) {
                case ' ':
                case 'Spacebar':
                    e.preventDefault()
                    if (aq) {
                        if (!revealed) {
                            setIsAnswerRevealed(true)
                        } else if (st !== 'BUZZING') {
                            handleOpenBuzzersRef.current()
                        } else {
                            handleCloseBuzzersRef.current()
                        }
                    }
                    break
                case 'Escape':
                    e.preventDefault()
                    if (aq) {
                        closeQuestionRef.current()
                    }
                    break
                case 'ArrowLeft':
                    if (!aq && cr > 1) {
                        setCurrentRound(r => r - 1)
                    }
                    break
                case 'ArrowRight':
                    if (!aq && cr < (settings.rounds || 1)) {
                        setCurrentRound(r => r + 1)
                    }
                    break
                case 'r':
                case 'R':
                    if (!e.ctrlKey && !e.metaKey && aq && !revealed) {
                        setIsAnswerRevealed(true)
                    }
                    break
                case 'c':
                case 'C':
                    if (!e.ctrlKey && !e.metaKey && aq && revealed) {
                        closeQuestionRef.current()
                    }
                    break
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [settings.rounds])

    return (
        <div className="fixed inset-0 bg-deep-void p-2 md:p-4 flex flex-col gap-2 md:gap-4 overflow-hidden">
            {/* Reconnection Banner */}
            {!isLocal && !isConnected && (
                <div className="shrink-0 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-center gap-3 animate-pulse">
                    <WifiOff className="w-4 h-4 text-red-500" />
                    <span className="text-red-400 text-xs font-bold uppercase tracking-widest">
                        Connection lost — reconnecting...
                    </span>
                    <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                </div>
            )}
            {/* Top Bar: Round & Stats */}
            <div className="h-10 md:h-12 flex items-center justify-between shrink-0 flex-wrap gap-1">
                <div className="flex items-center gap-2 md:gap-6 flex-1 min-w-0">
                    <div className="glass-dark px-2 md:px-4 py-1 md:py-2 rounded-lg md:rounded-xl border-white/5 flex items-center gap-1 md:gap-3">
                        <Trophy className="w-3 h-3 md:w-4 md:h-4 text-neon-emerald" />
                        <span className="font-orbitron font-bold text-white tracking-widest uppercase text-[9px] md:text-xs">
                            R{currentRound}/{settings.rounds || 1}
                        </span>
                    </div>
                    <div className="glass-dark px-2 md:px-4 py-1 md:py-2 rounded-lg md:rounded-xl border-white/5 flex items-center gap-1 md:gap-3">
                        <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${status === 'BUZZING' ? 'bg-neon-emerald animate-pulse' : 'bg-red-500'}`} />
                        <span className="font-orbitron font-bold text-white tracking-widest uppercase text-[9px] md:text-xs hidden sm:inline">
                            {status}
                        </span>
                    </div>
                    {!isLocal && (
                        <div className="glass-dark px-4 py-2 rounded-xl border-white/5 flex items-center gap-2">
                            {isConnected ? (
                                <Wifi className="w-4 h-4 text-neon-emerald" />
                            ) : (
                                <WifiOff className="w-4 h-4 text-red-500" />
                            )}
                            <span className={`font-orbitron font-bold tracking-widest uppercase text-xs ${isConnected ? 'text-neon-emerald' : 'text-red-500'}`}>
                                {isConnected ? `${onlineCount} online` : 'Reconnecting...'}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    {currentRound > 1 && (
                        <button onClick={() => setCurrentRound(r => r - 1)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs">Prev</button>
                    )}
                    {currentRound < (settings.rounds || 1) && (
                        <button onClick={() => setCurrentRound(r => r + 1)} className="px-4 py-2 rounded-lg bg-neon-emerald text-black font-bold text-xs uppercase tracking-wider">Next Round</button>
                    )}
                </div>

                {onReturnToLobby && (
                    <button onClick={onReturnToLobby} className="px-4 py-2 rounded-lg bg-neon-emerald/10 hover:bg-neon-emerald/20 text-neon-emerald border border-neon-emerald/30 hover:border-neon-emerald/50 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all">
                        <RotateCcw className="w-4 h-4" /> Back to Lobby
                    </button>
                )}
                {onExit && (
                    <button onClick={onExit} className="ml-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/50 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all">
                        <LogOut className="w-4 h-4" /> End Game
                    </button>
                )}
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden relative">
                {/* Main Content Area */}
                <div className="flex-1 flex flex-col h-full relative">
                    {activeQuestion ? (
                        <div className="absolute inset-0 z-30 glass p-6 md:p-12 rounded-3xl flex flex-col items-center justify-center text-center space-y-8 animate-in zoom-in-95 duration-300">
                            <div className="absolute top-6 left-6 flex gap-2">
                                {/* Exit button moved to header */}
                            </div>

                            <button
                                onClick={closeQuestion}
                                className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all"
                            >
                                <XCircle className="w-8 h-8" />
                            </button>

                            <div className="space-y-6 relative z-10 w-full max-w-4xl">
                                <div className="text-neon-emerald font-orbitron font-black text-[10px] tracking-[0.5em] uppercase px-4 py-2 bg-neon-emerald/10 rounded-full inline-block mb-4 border border-neon-emerald/20">
                                    {activeQuestion.category} | {activeQuestion.points} PTS
                                </div>
                                <h2 className="text-3xl md:text-5xl font-orbitron font-black text-white leading-tight tracking-tight drop-shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                                    {activeQuestion.question_text}
                                </h2>

                                <div className="mt-12 min-h-[100px] flex flex-col items-center justify-center gap-6">
                                    {/* Question Reveal / Answer - MCQ Support for PvP Sets */}
                                    {activeQuestion.q_type === 'MCQ' && activeQuestion.options ? (
                                        // MCQ Display
                                        <div className="w-full max-w-2xl space-y-3">
                                            <div className="text-[10px] font-black text-white/20 uppercase tracking-widest text-center mb-4">
                                                {isAnswerRevealed ? 'Answer Revealed' : 'Select an Option'}
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {activeQuestion.options.map((option: string, idx: number) => {
                                                    const isCorrect = option === activeQuestion.answer_text
                                                    const showResult = isAnswerRevealed
                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={() => setIsAnswerRevealed(true)}
                                                            disabled={isAnswerRevealed}
                                                            className={`p-4 rounded-xl border text-left transition-all ${showResult
                                                                ? isCorrect
                                                                    ? 'bg-neon-emerald/20 border-neon-emerald text-neon-emerald font-bold'
                                                                    : 'bg-white/5 border-white/10 text-white/40'
                                                                : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/30 text-white cursor-pointer'
                                                                }`}
                                                        >
                                                            <span className="text-xs font-bold opacity-50 mr-2">{String.fromCharCode(65 + idx)}.</span>
                                                            {option}
                                                            {showResult && isCorrect && <span className="ml-2">✓</span>}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                            {!isAnswerRevealed && (
                                                <button
                                                    onClick={() => setIsAnswerRevealed(true)}
                                                    className="w-full mt-4 px-6 py-3 bg-neon-emerald/10 hover:bg-neon-emerald/20 border border-neon-emerald/30 rounded-xl text-neon-emerald font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    Reveal Answer
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        // Standard Text Answer Display
                                        !isAnswerRevealed ? (
                                            <button
                                                onClick={() => setIsAnswerRevealed(true)}
                                                className="px-8 py-4 bg-white/5 hover:bg-neon-emerald/20 border border-white/10 hover:border-neon-emerald rounded-2xl text-white/40 hover:text-white font-orbitron font-bold tracking-widest uppercase transition-all flex items-center gap-3 group/reveal backdrop-blur-md"
                                            >
                                                <Eye className="w-5 h-5 group-hover/reveal:scale-110 transition-transform" />
                                                <span>Reveal Answer</span>
                                            </button>
                                        ) : (
                                            <div className="px-8 py-6 bg-neon-emerald/10 rounded-2xl border border-neon-emerald/20 text-neon-emerald font-mono text-2xl font-bold animate-in fade-in slide-in-from-bottom-4 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
                                                {activeQuestion.answer_text}
                                            </div>
                                        )
                                    )}

                                    {/* Host Controls for Active Question */}
                                    {/* Host Buzzer Controls (Remote Only) */}
                                    {!isLocal && (
                                        <div className="flex flex-col gap-6 w-full max-w-2xl animate-in fade-in slide-in-from-bottom-8 delay-150">
                                            {/* Buzzer Controls */}
                                            <div className="flex items-center justify-center gap-4">
                                                <button
                                                    onClick={handleOpenBuzzers}
                                                    className={`p-4 rounded-xl flex items-center gap-2 transition-all border ${status === 'BUZZING' ? 'bg-neon-emerald text-black border-neon-emerald opacity-50 cursor-not-allowed' : 'bg-white/10 text-neon-emerald border-neon-emerald hover:bg-neon-emerald hover:text-black font-bold'}`}
                                                    disabled={status === 'BUZZING'}
                                                >
                                                    <Unlock className="w-5 h-5" />
                                                    <span className="text-xs uppercase tracking-widest">Unlock Buzzers</span>
                                                </button>

                                                <button
                                                    onClick={handleCloseBuzzers}
                                                    disabled={status !== 'BUZZING'}
                                                    className={`p-4 rounded-xl flex items-center gap-2 transition-all border ${status !== 'BUZZING' ? 'opacity-30 cursor-not-allowed' : 'bg-red-500/10 text-red-500 border-red-500 hover:bg-red-500 hover:text-white'}`}
                                                >
                                                    <Lock className="w-5 h-5" />
                                                    <span className="text-xs uppercase tracking-widest">Lock</span>
                                                </button>

                                                <button
                                                    onClick={handleClearBuzzer}
                                                    className="p-4 rounded-xl flex items-center gap-2 bg-white/5 text-white/40 hover:text-red-400 border border-white/10 hover:border-red-400/50 transition-all ml-4"
                                                >
                                                    <RotateCcw className="w-5 h-5" />
                                                    <span className="text-xs uppercase tracking-widest">Reset</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Universal Scoring Panel - Visible when Answer Revealed */}
                                    {isAnswerRevealed && (
                                        <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-8 delay-150 flex flex-col gap-4">
                                            <div className="bg-black/40 border border-white/10 rounded-2xl p-4 overflow-hidden flex flex-col gap-2">
                                                <div className="text-[10px] font-black text-white/20 uppercase tracking-widest text-center">Quick Scoring</div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                                    {players.map(p => {
                                                        const isGraded = gradedPlayers[p.id]
                                                        return (
                                                            <div key={p.id} className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                                                                <span className="text-xs font-bold text-white truncate max-w-[120px]">{p.name}</span>

                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        disabled={isGraded === 'correct'}
                                                                        onClick={() => adjustScore(p.id, activeQuestion.points, 'correct')}
                                                                        className={`p-1.5 rounded transition-all ${isGraded === 'correct' ? 'bg-neon-emerald text-black' : 'bg-white/5 hover:bg-neon-emerald/20 text-white/20 hover:text-neon-emerald'}`}
                                                                    >
                                                                        <Plus className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        disabled={isGraded === 'wrong'}
                                                                        onClick={() => adjustScore(p.id, -activeQuestion.points, 'wrong')}
                                                                        className={`p-1.5 rounded transition-all ${isGraded === 'wrong' ? 'bg-red-500 text-white' : 'bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-500'}`}
                                                                    >
                                                                        <Minus className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>

                                            {/* Explicit Close Button for Clarity */}
                                            <button
                                                onClick={closeQuestion}
                                                className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold uppercase tracking-widest text-xs transition-all border border-white/5 hover:border-white/20"
                                            >
                                                Return to Board
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full grid gap-1 md:gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(currentRoundCats.length, typeof window !== 'undefined' && window.innerWidth >= 1024 ? 6 : 3)}, minmax(0, 1fr))` }}>
                            {currentRoundCats.map((cat: any, colIndex: number) => {
                                const questions = getQuestionsForCategory(cat);
                                const theme = CATEGORY_COLORS[colIndex % CATEGORY_COLORS.length]

                                return (
                                    <div key={cat.id} className="flex flex-col gap-2 h-full">
                                        {/* Header */}
                                        <div className={`h-16 md:h-20 glass rounded-lg flex items-center justify-center text-center p-2 border relative group overflow-hidden ${theme.border} bg-gradient-to-b ${theme.gradient} to-transparent`}>
                                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity ${theme.bg}`} />
                                            <span className="text-white font-black text-[9px] md:text-[10px] uppercase tracking-widest leading-relaxed line-clamp-3 relative z-10 drop-shadow-md">
                                                {cat.name}
                                            </span>
                                        </div>

                                        {/* Questions */}
                                        <div className="flex-1 flex flex-col gap-2">
                                            {questions.map((q: any, rowIndex: number) => {
                                                const isRevealed = revealedQuestions.includes(q.id)
                                                // Calculate opacity for unrevealed cards based on difficulty (row index)
                                                // 0 (low) -> 0.1, 4 (high) -> 0.5
                                                const opacity = 0.1 + (rowIndex * 0.1)

                                                return (
                                                    <button
                                                        key={rowIndex}
                                                        onClick={() => handleReveal(q)}
                                                        disabled={isRevealed} // Optional: define if we want to allow re-opening
                                                        className={`flex-1 rounded flex flex-col items-center justify-center transition-all group relative overflow-hidden border ${isRevealed
                                                            ? 'bg-black/40 border-white/5 grayscale'
                                                            : `hover:bg-white/10 ${theme.border} border-opacity-30`
                                                            }`}
                                                        style={{
                                                            backgroundColor: !isRevealed ? theme.bg.replace('bg-', 'rgb(var(--color-') + ') / ' + opacity : undefined
                                                        }}
                                                    >
                                                        {!isRevealed && (
                                                            <div className={`absolute inset-0 ${theme.bg}`} style={{ opacity }} />
                                                        )}

                                                        {isRevealed ? (
                                                            <span className="text-[10px] p-2 text-center font-medium text-white/50 leading-tight">
                                                                {q.answer_text || "DONE"}
                                                            </span>
                                                        ) : (
                                                            <span className={`text-xl md:text-2xl font-orbitron font-black opacity-80 group-hover:scale-110 group-hover:opacity-100 transition-all drop-shadow-md text-white`}>
                                                                {q.points}
                                                            </span>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Mobile: Tab toggle for sidebar */}
                <button
                    onClick={() => setActiveTab(t => t === 'CONTROLS' ? 'SCORES' : 'CONTROLS')}
                    className="lg:hidden px-3 py-1.5 rounded-lg bg-white/10 text-white/60 text-[10px] font-bold uppercase tracking-widest"
                >
                    {activeTab === 'CONTROLS' ? 'Scores →' : '← Controls'}
                </button>

                {/* Sidebar (Tabs: Controls vs Scores) */}
                <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 transition-all border-t lg:border-t-0 lg:border-l border-white/5 pt-2 lg:pt-0 lg:pl-4">
                    {/* Tabs */}
                    <div className="flex p-1 bg-white/5 rounded-xl">
                        <button
                            onClick={() => setActiveTab('CONTROLS')}
                            className={`flex-1 py-2 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all ${activeTab === 'CONTROLS' ? 'bg-neon-emerald text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                        >
                            Controls
                        </button>
                        <button
                            onClick={() => setActiveTab('SCORES')}
                            className={`flex-1 py-2 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all ${activeTab === 'SCORES' ? 'bg-neon-emerald text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                        >
                            Scores
                        </button>
                    </div>

                    <div className="flex-1 rounded-2xl overflow-hidden flex flex-col bg-black/20 border border-white/5 relative">
                        {/* CONTROLS TAB */}
                        {activeTab === 'CONTROLS' && (
                            <div className="flex-1 p-4 flex flex-col gap-6 animate-in fade-in slide-in-from-right-4">
                                {/* Buzzer Status Section */}
                                <div className="space-y-3">
                                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                                        <Zap className="w-3 h-3" /> Buzzer System
                                    </h3>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={handleOpenBuzzers}
                                            disabled={status === 'BUZZING'}
                                            className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all border ${status === 'BUZZING' ? 'bg-neon-emerald text-black border-neon-emerald opacity-100' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'}`}
                                        >
                                            <Unlock className="w-6 h-6" />
                                            <span className="text-[10px] font-black uppercase">UNLOCK</span>
                                        </button>
                                        <button
                                            onClick={handleCloseBuzzers}
                                            disabled={status !== 'BUZZING'}
                                            className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all border ${status !== 'BUZZING' ? 'bg-red-500/20 text-red-500 border-red-500/50' : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10'}`}
                                        >
                                            <Lock className="w-6 h-6" />
                                            <span className="text-[10px] font-black uppercase">LOCK</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Current Buzzer Display */}
                                <div className="space-y-3 flex-1">
                                    <h3 className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                                        <Users className="w-3 h-3" /> Active Buzzer
                                    </h3>

                                    {buzzedPlayerId ? (
                                        <div className="bg-neon-emerald/10 border border-neon-emerald/30 p-4 rounded-xl flex flex-col items-center text-center animate-pulse">
                                            <div className="w-12 h-12 bg-neon-emerald text-black rounded-full flex items-center justify-center mb-2 font-black text-xl">
                                                {players.find(p => p.id === buzzedPlayerId)?.name?.[0] || "?"}
                                            </div>
                                            <span className="text-white font-bold text-lg mb-1">
                                                {players.find(p => p.id === buzzedPlayerId)?.name || "Unknown"}
                                            </span>
                                            <span className="text-neon-emerald text-[10px] uppercase tracking-widest">HAS BUZZED IN!</span>

                                            <button
                                                onClick={handleClearBuzzer}
                                                className="mt-4 w-full py-2 bg-red-500/20 hover:bg-red-500/40 text-red-500 rounded-lg text-xs font-bold uppercase flex items-center justify-center gap-2"
                                            >
                                                <Trash2 className="w-3 h-3" /> Clear / Reset
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="h-32 flex items-center justify-center bg-white/5 rounded-xl border-2 border-dashed border-white/10 text-white/20 text-xs font-mono uppercase">
                                            Waiting for buzz...
                                        </div>
                                    )}
                                </div>

                                {/* Timer Section */}
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Timer</span>
                                        <TimerIcon className="w-3 h-3 text-white/40" />
                                    </div>

                                    <div className="flex items-center justify-between gap-2">
                                        <button onClick={() => setTimer((t: number) => Math.max(0, t - 1))} className="p-2 text-white/20 hover:text-white hover:bg-white/10 rounded"><Minus className="w-4 h-4" /></button>
                                        <div className="text-4xl font-mono font-black text-white text-center tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                                            00:{timer.toString().padStart(2, '0')}
                                        </div>
                                        <button onClick={() => setTimer((t: number) => t + 1)} className="p-2 text-white/20 hover:text-white hover:bg-white/10 rounded"><Plus className="w-4 h-4" /></button>
                                    </div>

                                    <div className="flex gap-2">
                                        {!isTimerRunning ? (
                                            <button
                                                onClick={() => setIsTimerRunning(true)}
                                                disabled={timer === 0}
                                                className="flex-1 py-3 bg-neon-emerald/10 hover:bg-neon-emerald text-neon-emerald hover:text-black border border-neon-emerald rounded-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setIsTimerRunning(false)}
                                                className="flex-1 py-3 bg-yellow-500/10 hover:bg-yellow-500 text-yellow-500 hover:text-black border border-yellow-500 rounded-lg transition-all flex items-center justify-center"
                                            >
                                                <div className="w-4 h-4 flex items-center justify-center gap-[2px]">
                                                    <div className="w-1 h-3 bg-current rounded-full" />
                                                    <div className="w-1 h-3 bg-current rounded-full" />
                                                </div>
                                            </button>
                                        )}

                                        <button
                                            onClick={() => { setIsTimerRunning(false); setTimer(settings?.timer || 15); }}
                                            className="px-4 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-lg transition-all"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SCORES TAB */}
                        {activeTab === 'SCORES' && (
                            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar p-2 animate-in fade-in slide-in-from-right-4">
                                {players.length === 0 ? (
                                    <div className="text-white/20 text-center text-[10px] mt-10">Waiting for players...</div>
                                ) : (
                                    players.map((p, i) => {
                                        const isGraded = gradedPlayers[p.id];
                                        return (
                                            <div key={p.id} className={`flex flex-col p-3 rounded-lg border transition-all ${isGraded ? 'bg-white/10' : 'bg-white/5'} border-white/5`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`text-[10px] font-bold w-4 ${i === 0 ? 'text-yellow-400' : 'text-white/20'}`}>{i + 1}</span>
                                                        <span className="text-xs font-bold text-white truncate max-w-[100px]">{p.name}</span>
                                                    </div>

                                                    {/* Manual Edit Mode */}
                                                    {editingScoreId === p.id ? (
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                autoFocus
                                                                type="number"
                                                                value={editScoreValue}
                                                                onChange={(e) => setEditScoreValue(e.target.value)}
                                                                className="w-16 bg-black text-white text-xs p-1 rounded border border-neon-emerald outline-none"
                                                                onKeyDown={(e) => e.key === 'Enter' && handleManualScoreEdit(p.id)}
                                                            />
                                                            <button onClick={() => handleManualScoreEdit(p.id)} className="text-neon-emerald"><Save className="w-3 h-3" /></button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 group/score">
                                                            <span className="text-neon-emerald font-mono text-sm font-bold">{p.score}</span>
                                                            <button onClick={() => { setEditingScoreId(p.id); setEditScoreValue(p.score.toString()) }} className="text-white/20 hover:text-white transition-colors">
                                                                <Edit2 className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Grading Controls (Only show when question active) */}
                                                {activeQuestion && (
                                                    <div className={`grid grid-cols-2 gap-2 pt-2 border-t border-white/5 transition-all ${isAnswerRevealed ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                                        <button
                                                            disabled={isGraded === 'correct'}
                                                            onClick={() => adjustScore(p.id, activeQuestion.points, 'correct')}
                                                            className={`p-2 rounded flex items-center justify-center gap-1 transition-all ${isGraded === 'correct' ? 'bg-neon-emerald text-black' : 'bg-white/5 hover:bg-neon-emerald/20 text-white/40 hover:text-neon-emerald'}`}
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            disabled={isGraded === 'wrong'}
                                                            onClick={() => adjustScore(p.id, -activeQuestion.points, 'wrong')}
                                                            className={`p-2 rounded flex items-center justify-center gap-1 transition-all ${isGraded === 'wrong' ? 'bg-red-500 text-white' : 'bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500'}`}
                                                        >
                                                            <Minus className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    )
}

function Crown({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z" /><path d="M12 17v4" /><path d="m9 21 3-2 3 2" />
        </svg>
    )
}
