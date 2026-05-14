import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LogIn, UserPlus, Mail, Lock, Loader2, Github } from 'lucide-react'

interface AuthProps {
    onSuccess: () => void
    onClose: () => void
}

export default function Auth({ onSuccess, onClose }: AuthProps) {
    const [isLogin, setIsLogin] = useState(true)
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const { error } = isLogin
                ? await supabase.auth.signInWithPassword({ email, password })
                : await supabase.auth.signUp({ email, password })

            if (error) throw error
            onSuccess()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-deep-void/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="glass p-8 rounded-[2rem] max-w-md w-full relative shadow-2xl border-white/10">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 text-white/20 hover:text-white transition-colors"
                >
                    ✕
                </button>

                <div className="text-center mb-8">
                    <h2 className="text-3xl font-orbitron font-bold text-neon-emerald mb-2">
                        {isLogin ? 'WELCOME BACK' : 'JOIN THE ARENA'}
                    </h2>
                    <p className="text-white/40 text-sm tracking-widest uppercase">
                        {isLogin ? 'Sign in to access your library' : 'Create an account to save in cloud'}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-xs mb-6 animate-shake">
                        {error}
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-4">
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                        <input
                            type="email"
                            placeholder="EMAIL ADDRESS"
                            required
                            className="w-full bg-black/40 border border-white/5 p-4 pl-12 rounded-xl text-white focus:border-neon-emerald/50 outline-none transition-colors"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                        <input
                            type="password"
                            placeholder="PASSWORD"
                            required
                            className="w-full bg-black/40 border border-white/5 p-4 pl-12 rounded-xl text-white focus:border-neon-emerald/50 outline-none transition-colors"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-neon-emerald hover:bg-emerald-400 text-[#050505] font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] emerald-glow mt-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : isLogin ? (
                            <LogIn className="w-5 h-5" />
                        ) : (
                            <UserPlus className="w-5 h-5" />
                        )}
                        <span className="tracking-widest uppercase">{isLogin ? 'Login' : 'Sign Up'}</span>
                    </button>
                </form>

                <div className="mt-8 text-center space-y-4">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-white/40 hover:text-neon-emerald text-xs tracking-widest uppercase transition-colors"
                    >
                        {isLogin ? "Don't have an account? Create one" : "Already have an account? Sign in"}
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                        <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-[#121212] px-4 text-white/20 tracking-widest">Or continue with</span></div>
                    </div>

                    <button className="w-full bg-white/5 hover:bg-white/10 text-white p-3 rounded-xl border border-white/5 flex items-center justify-center gap-2 transition-colors">
                        <Github className="w-4 h-4" />
                        <span className="text-xs font-bold tracking-widest uppercase">GitHub</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
