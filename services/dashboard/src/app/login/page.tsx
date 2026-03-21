'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react'
import Image from 'next/image'
import {
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from 'firebase/auth'
import { setUserId, logEvent } from 'firebase/analytics'
import { auth, analytics } from '@/lib/firebase'

// ── Helpers ───────────────────────────────────────────────────────────────────

function clearAllSessionData() {
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax'
}

async function verifyBackendAccess(idToken: string): Promise<{ ok: boolean; message: string }> {
    try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || ''
        const res = await fetch(`${backendUrl}/api/users/me`, {
            headers: { 'Authorization': `Bearer ${idToken}` },
            signal: AbortSignal.timeout(8000),
        })
        if (res.ok) return { ok: true, message: '' }
        if (res.status === 403) {
            let detail = ''
            try { const body = await res.json(); detail = body?.detail || '' } catch (_) {}
            return {
                ok: false,
                message: detail || 'Your account is not registered in EasyPool. Please contact your administrator.'
            }
        }
        return { ok: false, message: 'Authorization check failed. Please try again.' }
    } catch (err: any) {
        if (err?.name === 'TimeoutError') return { ok: false, message: 'Backend is unreachable. Please check your network.' }
        return { ok: false, message: 'Authorization check failed. Please try again.' }
    }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadingGoogle, setLoadingGoogle] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        clearAllSessionData()
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) signOut(auth)
            unsubscribe()
        })
    }, [])

    async function handlePostFirebaseAuth(uid: string, method: 'email' | 'google') {
        const firebaseUser = auth.currentUser
        if (!firebaseUser) { setError('Authentication state lost. Please try again.'); return }

        const idToken = await firebaseUser.getIdToken(true)
        const { ok, message } = await verifyBackendAccess(idToken)

        if (!ok) {
            await signOut(auth)
            clearAllSessionData()
            setError(message)
            return
        }

        // Set token in Cookie so Middleware can see it
        document.cookie = `token=${idToken}; path=/; max-age=3600; SameSite=Lax`
        localStorage.setItem('token', idToken)

        if (analytics) {
            setUserId(analytics, uid)
            logEvent(analytics, 'login', { method })
        }

        router.push('/dashboard')
    }

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) { setError('Please enter both email and password.'); return }
        setLoading(true)
        setError('')
        try {
            const { user } = await signInWithEmailAndPassword(auth, email, password)
            await handlePostFirebaseAuth(user.uid, 'email')
        } catch (err: any) {
            if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(err.code)) {
                setError('Invalid email or password.')
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many failed attempts. Please wait a few minutes and try again.')
            } else {
                setError('Sign-in failed. Please check your network and try again.')
            }
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        setLoadingGoogle(true)
        setError('')
        try {
            const { user } = await signInWithPopup(auth, new GoogleAuthProvider())
            await handlePostFirebaseAuth(user.uid, 'google')
        } catch (err: any) {
            if (err.code !== 'auth/popup-closed-by-user') setError('Google Sign-In failed. Please try again.')
        } finally {
            setLoadingGoogle(false)
        }
    }

    const busy = loading || loadingGoogle

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl">

                {/* Logo + title above the card */}
                <div className="text-center mb-8 space-y-3">
                    <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-white/10 mx-auto shadow-2xl">
                        <Image src="/logo.jpeg" alt="EasyPool Logo" fill className="object-cover" priority />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">EasyPool</h1>
                        <p className="text-sm text-slate-400 mt-1">Fleet Management Dashboard</p>
                    </div>
                </div>

                {/* Two-panel card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[420px]">

                    {/* LEFT — Email / Password */}
                    <div className="flex-1 p-8 flex flex-col justify-center space-y-5">
                        <div>
                            <h2 className="text-base font-bold text-white">Sign in with email</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Enter your registered email and password</p>
                        </div>

                        <form onSubmit={handleEmailLogin} className="space-y-4">
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
                                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                                    <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={busy}
                                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" />Verifying access...</>
                                ) : 'Sign In'}
                            </button>
                        </form>
                    </div>

                    {/* Divider */}
                    <div className="hidden md:flex flex-col items-center justify-center px-2 py-8">
                        <div className="w-px flex-1 bg-white/10" />
                        <span className="text-xs text-slate-600 py-3 font-medium">or</span>
                        <div className="w-px flex-1 bg-white/10" />
                    </div>
                    <div className="flex md:hidden items-center px-8 gap-3">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-slate-600 font-medium">or</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {/* RIGHT — Google */}
                    <div className="flex-1 p-8 flex flex-col justify-center items-center space-y-5">
                        <div className="text-center">
                            <h2 className="text-base font-bold text-white">Sign in with Google</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Use your organisation Google account</p>
                        </div>

                        <button
                            onClick={handleGoogleLogin}
                            disabled={busy}
                            className="w-full py-3.5 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 shadow-lg"
                        >
                            {loadingGoogle ? (
                                <><Loader2 className="w-5 h-5 animate-spin" />Verifying access...</>
                            ) : (
                                <>
                                    <svg viewBox="0 0 24 24" className="w-5 h-5">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                    Continue with Google
                                </>
                            )}
                        </button>

                        <p className="text-center text-xs text-slate-600 px-4">
                            Access is invite-only. Contact your EasyPool administrator to request access.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    )
}
