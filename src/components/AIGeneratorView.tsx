import { useState, useEffect } from 'react'
import { ArrowLeft, Sparkles, Loader2, Save, Settings, BrainCircuit, GraduationCap } from 'lucide-react'
import { generateQuizQuestions } from '../lib/ai'
import { supabase } from '../lib/supabase'
import { SYSTEM_PROMPT_STANDARD, SYSTEM_PROMPT_ARENA } from '../lib/prompts'

interface AIGeneratorViewProps {
    onBack: () => void
    isAdmin?: boolean
}

export default function AIGeneratorView({ onBack, isAdmin = false }: AIGeneratorViewProps) {
    // Config State
    const [provider, setProvider] = useState(localStorage.getItem('qb_ai_provider') || 'gemini')
    const [apiKey, setApiKey] = useState('')
    const [status, setStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle')
    const [logs, setLogs] = useState<string[]>([])
    const [isFetchingModels, setIsFetchingModels] = useState(false)

    // New Prompt Logic
    const [mode, setMode] = useState<'STANDARD' | 'ARENA'>('STANDARD')
    const [showPromptModal, setShowPromptModal] = useState(false)
    const [currentPrompt, setCurrentPrompt] = useState(SYSTEM_PROMPT_STANDARD)
    const [difficulty, setDifficulty] = useState<string>('General')

    const difficultyLevels = [
        "Middle School",
        "High School",
        "Undergrad",
        "Postgrad",
        "General"
    ]

    // Reset prompt when mode changes
    useEffect(() => {
        setCurrentPrompt(mode === 'ARENA' ? SYSTEM_PROMPT_ARENA : SYSTEM_PROMPT_STANDARD)
    }, [mode])

    // Model Options
    const [models, setModels] = useState<Record<string, string[]>>({
        openai: ['gpt-3.5-turbo', 'gpt-4o', 'gpt-4-turbo'],
        groq: ['llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
        gemini: [
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-1.0-pro',
            'gemini-pro',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro-latest'
        ]
    })
    const [selectedModel, setSelectedModel] = useState('')

    // Inputs
    const [topicInput, setTopicInput] = useState('')
    const [questionCount, setQuestionCount] = useState(5)

    // Load saved key on provider change
    useEffect(() => {
        const savedKeys = JSON.parse(localStorage.getItem('qb_ai_keys') || '{}')
        setApiKey(savedKeys[provider] || '')

        // Default model selection
        if (!selectedModel || !models[provider]?.includes(selectedModel)) {
            if (models[provider] && models[provider].length > 0) {
                setSelectedModel(models[provider][0])
            }
        }
    }, [provider, models])

    const saveKey = (val: string) => {
        setApiKey(val)
        const savedKeys = JSON.parse(localStorage.getItem('qb_ai_keys') || '{}')
        savedKeys[provider] = val
        localStorage.setItem('qb_ai_keys', JSON.stringify(savedKeys))
        localStorage.setItem('qb_ai_provider', provider)
    }

    const log = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

    const fetchModels = async () => {
        if (!apiKey) {
            log("Error: API Key required to fetch models.")
            return
        }
        setIsFetchingModels(true)
        log(`Fetching available models for ${provider}...`)

        try {
            let newModels: string[] = []

            if (provider === 'openai') {
                const res = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                })
                if (!res.ok) throw new Error(await res.text())
                const data = await res.json()
                newModels = data.data.map((m: any) => m.id).filter((id: string) => id.includes('gpt'))
            }
            else if (provider === 'gemini') {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
                if (!res.ok) throw new Error(await res.text())
                const data = await res.json()
                // Gemini returns models like "models/gemini-1.5-flash"
                newModels = data.models.map((m: any) => m.name.replace('models/', ''))
            }
            else if (provider === 'groq') {
                const res = await fetch('https://api.groq.com/openai/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                })
                if (!res.ok) throw new Error(await res.text())
                const data = await res.json()
                newModels = data.data.map((m: any) => m.id)
            }

            if (newModels.length > 0) {
                setModels(prev => ({ ...prev, [provider]: newModels }))
                setSelectedModel(newModels[0])
                log(`Successfully updated model list. Found ${newModels.length} models.`)
            } else {
                log("No compatible models found.")
            }

        } catch (err: any) {
            log(`Failed to fetch models: ${err.message}`)
        } finally {
            setIsFetchingModels(false)
        }
    }

    const handleGenerate = async () => {
        if (!topicInput || !apiKey) return
        setStatus('generating')
        setLogs([])
        log("Initializing Generation Sequence...")

        const topics = topicInput.split(',').map(t => t.trim()).filter(t => t.length > 0)
        log(`Identified ${topics.length} topics: ${topics.join(', ')}`)

        try {
            setLogs(prev => [...prev, `Identified ${topics.length} topics: ${topics.join(', ')}`])

            try {
                setLogs(prev => [...prev, `Synthesizing protocols for ${topics.length} topics in batch...`])

                const config = {
                    provider,
                    apiKey,
                    model: selectedModel,
                    questionCount,
                    mode,
                    difficulty,
                    customPrompt: currentPrompt
                }

                // --- UI SAFETY: API Key Check ---
                if (apiKey.trim() === 'sa:1' || apiKey.length < 10) {
                    const confirm = window.confirm("WARNING: Your API Key looks invalid (it is too short or is a placeholder). The generation will likely fail. Do you want to proceed anyway?");
                    if (!confirm) {
                        setStatus('idle');
                        return;
                    }
                }

                // Single Batch Request (Optimized for Cost)
                // The Prompt now handles multiple topics correctly.
                const result = await generateQuizQuestions(topics, config)

                if (!Array.isArray(result)) {
                    throw new Error("AI did not return a valid list of categories")
                }

                setLogs(prev => [...prev, `Synthesis complete. Received ${result.length} categories. Archiving...`])

                let savedCount = 0;
                for (const cat of result) {
                    // Insert into DB
                    const { error } = await supabase.from('categories_library').insert([{
                        name: cat.name,
                        main_category: cat.main_category,
                        description: cat.description || `AI Generated: ${cat.name}`,
                        data: cat.questions || cat.data,
                        is_global: true,
                        tags: cat.tags || (mode === 'ARENA' ? ['Arena', cat.name] : [cat.name]),
                        created_by: (await supabase.auth.getUser()).data.user?.id
                    }])

                    if (error) {
                        console.error(error)
                        setLogs(prev => [...prev, `[ERROR] Database insert failed for ${cat.name}: ${error.message}`])
                    } else {
                        setLogs(prev => [...prev, `[SUCCESS] Archived: "${cat.name}"`])
                        savedCount++
                    }
                }

                setLogs(prev => [...prev, `Batch Complete. Successfully generated ${savedCount}/${topics.length} assets.`])
                if (savedCount > 0) {
                    alert(`Generation Complete! ${savedCount} new assets available in the Registry.`)
                    setStatus('success')
                } else {
                    setStatus('error')
                    setLogs(prev => [...prev, `[WARN] No assets were saved.`])
                }
            } catch (err: any) {
                log(`CRITICAL FAILURE: ${err.message}`)
                setStatus('error')
            }

        } catch (err: any) {
            log(`CRITICAL FAILURE: ${err.message}`)
            setStatus('error')
        }
    }

    return (
        <div className="min-h-screen bg-deep-void p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <button
                        onClick={onBack}
                        className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all text-white/40 hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-4xl font-orbitron font-black text-white tracking-tighter uppercase italic">Neural Forge</h1>
                        <p className="text-white/20 text-[10px] font-black tracking-[0.4em] uppercase mt-1">Advanced Content Synthesis Terminal</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-8">
                {/* Configuration Panel */}
                <div className="col-span-4 space-y-6">
                    <div className="glass p-8 rounded-[2.5rem] space-y-6">
                        <h3 className="flex items-center gap-2 text-neon-emerald font-black tracking-widest uppercase text-xs">
                            <Settings className="w-4 h-4" /> System Configuration
                        </h3>

                        <div className="space-y-4">
                            {/* Provider */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">AI Core</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['gemini', 'openai', 'groq'] as const).map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setProvider(p)}
                                            className={`p-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${provider === p
                                                ? 'bg-neon-emerald/20 border-neon-emerald text-white'
                                                : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Model */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider flex justify-between items-center">
                                    Model Architecture
                                    <button
                                        onClick={fetchModels}
                                        disabled={isFetchingModels || !apiKey}
                                        className="text-[9px] text-neon-emerald hover:text-white disabled:opacity-30 disabled:hover:text-neon-emerald transition-colors uppercase tracking-widest flex items-center gap-1"
                                    >
                                        {isFetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                        Fetch Latest
                                    </button>
                                </label>
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white text-xs font-bold uppercase tracking-wider focus:border-neon-emerald/50 outline-none appearance-none"
                                >
                                    {models[provider]?.map(m => (
                                        <option key={m} value={m}>{m.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>

                            {/* API Key */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Access Token</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => saveKey(e.target.value)}
                                    placeholder={`ENTER ${provider.toUpperCase()} KEY`}
                                    className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white text-xs font-mono focus:border-neon-emerald/50 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="glass p-8 rounded-[2.5rem] space-y-6">
                        <h3 className="flex items-center gap-2 text-blue-400 font-black tracking-widest uppercase text-xs">
                            <BrainCircuit className="w-4 h-4" /> Output Parameters
                        </h3>

                        <div className="space-y-4">
                            {/* Mode Selector */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Generation Mode</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setMode('STANDARD')}
                                        className={`p-3 rounded-xl border text-xs font-bold uppercase ${mode === 'STANDARD' ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 border-white/5 text-white/40'}`}
                                    >
                                        Standard
                                    </button>
                                    <button
                                        onClick={() => setMode('ARENA')}
                                        className={`p-3 rounded-xl border text-xs font-bold uppercase ${mode === 'ARENA' ? 'bg-red-600 text-white border-red-500' : 'bg-white/5 border-white/5 text-white/40'}`}
                                    >
                                        Arena PVP
                                    </button>
                                </div>
                            </div>

                            {/* Difficulty Selector */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider flex items-center gap-2">
                                    <GraduationCap className="w-3 h-3" /> Target Difficulty
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {difficultyLevels.map(level => (
                                        <button
                                            key={level}
                                            onClick={() => setDifficulty(level)}
                                            className={`p-2 rounded-lg border text-[10px] font-bold uppercase transition-all ${difficulty === level
                                                ? 'bg-purple-600/50 border-purple-500 text-white'
                                                : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                                                }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Questions per Topic</label>
                                <input
                                    type="number"
                                    min={1} max={20}
                                    value={questionCount}
                                    onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                                    className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-white text-xl font-orbitron font-black focus:border-blue-400/50 outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Workflow */}
                <div className="col-span-8 space-y-6">
                    <div className="glass p-8 rounded-[2.5rem] min-h-[500px] flex flex-col">
                        <textarea
                            value={topicInput}
                            onChange={(e) => setTopicInput(e.target.value)}
                            placeholder="ENTER TOPICS (COMMA SEPARATED)...&#10;EXAMPLE: QUANTUM PHYSICS, 90S HIP HOP, ANCIENT ROME"
                            className="flex-1 w-full bg-transparent border-none text-2xl font-orbitron font-bold text-white placeholder-white/10 focus:ring-0 outline-none resize-none p-4 custom-scrollbar leading-relaxed uppercase"
                            spellCheck={false}
                        />

                        <div className="pt-8 border-t border-white/5 flex items-center justify-between">
                            <div className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                                {topicInput.split(',').filter(t => t.trim().length > 0).length} Topics Queued
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={status === 'generating'}
                                className="bg-neon-emerald text-black px-8 py-4 rounded-xl font-black uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 disabled:grayscale"
                            >
                                {status === 'generating' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                Initiate Synthesis
                            </button>
                        </div>
                    </div>

                    {/* Logs Console */}
                    <div className="glass-dark p-6 rounded-3xl border border-white/5 font-mono text-xs space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                        {logs.length === 0 && <div className="text-white/20 italic">System Ready. Waiting for input...</div>}
                        {logs.map((l, i) => (
                            <div key={i} className={`tracking-tight ${l.includes('FAILURE') || l.includes('Error') ? 'text-red-400' : l.includes('Success') ? 'text-neon-emerald' : 'text-white/60'}`}>
                                {l}
                            </div>
                        ))}
                    </div>
                </div>
            </div >
        </div >
    )
}
