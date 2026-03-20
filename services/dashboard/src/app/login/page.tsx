'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react'
import Image from 'next/image'
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function LoginPage() {
    const router = useRouter()

    // Clear any existing tokens on mount
    useEffect(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        // Wait for auth to initialize before signing out (optional but clean)
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                auth.signOut()
            }
            unsubscribe()
        })
    }, [])

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadingGoogle, setLoadingGoogle] = useState(false)
    const [error, setError] = useState('')

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) {
            setError('Please enter both email and password.')
            return
        }
        setLoading(true)
        setError('')

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password)
            const token = await userCredential.user.getIdToken(true) // Force fresh token
            
            localStorage.setItem('token', token)
            document.cookie = `token=${token}; path=/; max-age=3600`
            
            router.push('/dashboard')
        } catch (err: any) {
            console.error('Login error:', err)
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError('Invalid email or password.')
            } else {
                setError(err.message || 'Connection failed. Please check your network.')
            }
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        setLoadingGoogle(true)
        setError('')
        try {
            const provider = new GoogleAuthProvider()
            const userCredential = await signInWithPopup(auth, provider)
            const token = await userCredential.user.getIdToken(true)
            
            localStorage.setItem('token', token)
            document.cookie = `token=${token}; path=/; max-age=3600`
            
            router.push('/dashboard')
        } catch (err: any) {
            console.error('Google Sign-In error:', err)
            // User closed the popup before finishing
            if (err.code !== 'auth/popup-closed-by-user') {
                setError(err.message || 'Google Sign-In failed.')
            }
        } finally {
            setLoadingGoogle(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 space-y-8">

                    <div className="text-center space-y-3">
                        <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-white/10 mx-auto shadow-2xl">
                            <Image 
                                src="/logo.jpeg" 
                                alt="EasyPool Logo" 
                                fill 
                                className="object-cover"
                                priority
                            />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">EasyPool</h1>
                            <p className="text-sm text-slate-400 mt-1">Fleet Management Dashboard</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <button
                            onClick={handleGoogleLogin}
                            disabled={loadingGoogle || loading}
                            className="w-full py-3.5 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 shadow-lg"
                        >
                            {loadingGoogle ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Connecting to Google...
                                </>
                            ) : (
                                <>
                                    {/* Minimalist Google 'G' Logo SVG */}
                                    <svg viewBox="0 0 24 24" className="w-5 h-5">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                    Sign in with Google
                                </>
                            )}
                        </button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10"></div>
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="px-2 bg-slate-900/50 backdrop-blur-xl text-slate-400">or sign in with email</span>
                            </div>
                        </div>

                        <form onSubmit={handleEmailLogin} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    placeholder="admin@easypool.com"
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-all text-sm"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-all text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                                    <Shield className="w-4 h-4 shrink-0" />
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || loadingGoogle}
                                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Checking credentials...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </button>
                        </form>
                    </div>

                </div>
            </div>
        </div>
    )
}
