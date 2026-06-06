import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LogIn, UserPlus, Mail, Lock, Loader2, X } from 'lucide-react'

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-plum/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <div className="clay-elevated p-8 rounded-[2.5rem] max-w-md w-full relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 p-2 rounded-xl text-plum/30 hover:text-plum hover:bg-cream transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-soft-purple-light flex items-center justify-center mx-auto mb-4">
                        {isLogin ? (
                            <LogIn className="w-6 h-6 text-soft-purple" />
                        ) : (
                            <UserPlus className="w-6 h-6 text-soft-purple" />
                        )}
                    </div>
                    <h2 className="text-2xl font-outfit font-black text-plum mb-1">
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h2>
                    <p className="text-sm text-plum/40 font-medium">
                        {isLogin ? 'Sign in to access admin tools' : 'Create an account to get started'}
                    </p>
                </div>

                {error && (
                    <div className="bg-peach-light border border-peach/30 text-peach p-4 rounded-2xl text-xs font-bold mb-5 animate-shake">
                        {error}
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-4">
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-plum/30" />
                        <input
                            type="email"
                            placeholder="Email address"
                            required
                            className="clay-input pl-11 pr-4 py-3.5 text-sm font-outfit font-bold w-full"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="email"
                        />
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-plum/30" />
                        <input
                            type="password"
                            placeholder="Password"
                            required
                            className="clay-input pl-11 pr-4 py-3.5 text-sm font-outfit font-bold w-full"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full clay-btn bg-soft-purple text-white font-outfit font-bold py-3.5 text-sm rounded-2xl flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 shadow-md shadow-soft-purple/20 mt-2"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : isLogin ? (
                            <LogIn className="w-4 h-4" />
                        ) : (
                            <UserPlus className="w-4 h-4" />
                        )}
                        <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(null); }}
                        className="text-sm text-plum/50 hover:text-soft-purple font-medium transition-colors"
                    >
                        {isLogin ? "Don't have an account? Create one" : "Already have an account? Sign in"}
                    </button>
                </div>
            </div>
        </div>
    )
}
