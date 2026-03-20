'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Settings, ChevronDown, Sun, Moon, Laptop, Map } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useMapHighContrast } from '@/hooks/useMapHighContrast'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface UserData {
    id: string
    email: string
    full_name: string
    groups: (number | string | { name: string })[]
    photo_url?: string
}

export default function UserProfile() {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const [user, setUser] = useState<UserData | null>(null)
    const [loading, setLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const { enabled: highContrast, toggle: toggleHighContrast } = useMapHighContrast()

    useEffect(() => {
        // Use a reactive listener to handle Firebase's late hydration
        const unsubscribe = auth.onIdTokenChanged(async (firebaseUser) => {
            if (!firebaseUser) {
                setLoading(false)
                return
            }
            try {
                const idToken = await firebaseUser.getIdToken()
                const backendUrl = process.env.NEXT_PUBLIC_API_URL || ''
                const res = await fetch(`${backendUrl}/api/users/me`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                })
                if (res.ok) {
                    const data = await res.json()
                    setUser(data)
                }
            } catch (err) {
                console.error('Profile fetch failed:', err)
            } finally {
                setLoading(false)
            }
        })

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            unsubscribe()
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    const handleLogout = async () => {
        await signOut(auth)
        localStorage.clear()
        sessionStorage.clear()
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Strict'
        router.push('/login')
    }

    if (loading) return <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />;
    
    if (!user) {
        return (
            <div className="flex items-center gap-3 p-1.5 pr-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 opacity-60 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-sm">
                    ?
                </div>
                <div className="hidden md:block text-left">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-none">Guest</p>
                    <p className="text-[9px] text-slate-500 font-medium font-mono tracking-tighter uppercase">No Session</p>
                </div>
            </div>
        );
    }

    const getRoleLabel = (groups: any[]) => {
        if (!groups || groups.length === 0) return 'Viewer'
        // Groups might be IDs or objects with .name
        const first = groups[0]
        const name = typeof first === 'string' ? first : (first?.name || 'User')
        
        const labels: Record<string, string> = {
            'Admin': 'Organisation Admin',
            'Manager': 'Fleet Manager',
            'Viewer': 'Fleet Viewer',
        }
        return labels[name] || name
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 p-1.5 pr-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-primary/30 transition-all shadow-sm group"
            >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {user.photo_url ? (
                        <img src={user.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        user.full_name?.charAt(0).toUpperCase() || 'U'
                    )}
                </div>
                <div className="hidden md:block text-left">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-none">{user.full_name}</p>
                    <p className="text-[9px] text-slate-500 font-medium">{getRoleLabel(user.groups)}</p>
                </div>
                <ChevronDown className={`w-3 h-3 text-slate-400 group-hover:text-primary transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-premium z-[2000] animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                    <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{user.full_name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                    </div>
                    
                    <div className="p-2 space-y-1">
                        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <Settings className="w-4 h-4" />
                            Account Settings
                        </button>
                        
                        <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />
                        
                        <div className="px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-tighter text-slate-400 mb-2">Interface Theme</p>
                            <div className="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-100 dark:border-slate-800">
                                <button 
                                    onClick={() => setTheme('light')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${theme === 'light' ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Sun className="w-3 h-3" /> Light
                                </button>
                                <button 
                                    onClick={() => setTheme('dark')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${theme === 'dark' ? 'bg-slate-900 shadow-lg text-white' : 'text-slate-500 hover:text-slate-400'}`}
                                >
                                    <Moon className="w-3 h-3" /> Dark
                                </button>
                                <button 
                                    onClick={() => setTheme('system')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${theme === 'system' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary dark:text-blue-400' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    <Laptop className="w-3 h-3" /> Auto
                                </button>
                            </div>
                        </div>

                        <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

                        {/* ── Monochrome Map toggle ── */}
                        <div className="px-3 py-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <Map className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 leading-none">Monochrome Map</p>
                                    <p className="text-[9px] text-slate-400 mt-0.5">Bus icons stand out on greyscale</p>
                                </div>
                            </div>
                            <button
                                id="map-high-contrast-toggle"
                                onClick={toggleHighContrast}
                                aria-label="Toggle monochrome map"
                                className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none ${
                                    highContrast ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                                    highContrast ? 'translate-x-4' : 'translate-x-0'
                                }`} />
                            </button>
                        </div>

                        <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
