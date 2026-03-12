'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, LogOut, Settings, ShieldCheck, ChevronDown, Sun, Moon, Laptop } from 'lucide-react'
import { useTheme } from 'next-themes'

interface UserData {
    id: string
    email: string
    full_name: string
    role: string
    school_name?: string
    photo_url?: string
}

export default function UserProfile() {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const [user, setUser] = useState<UserData | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const token = localStorage.getItem('token')
                if (!token) return
                
                const res = await fetch('/api/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (res.ok) {
                    const data = await res.json()
                    setUser(data)
                }
            } catch (err) {
                console.error("Failed to fetch user profile:", err)
            }
        }
        fetchUser()

        // Close dropdown when clicking outside
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleLogout = () => {
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        router.push('/login')
    }

    if (!user) return null

    const getRoleLabel = (role: string) => {
        const roles: Record<string, string> = {
            'superadmin': 'Super Admin',
            'school_admin': 'School Admin',
            'transporter': 'Transporter',
            'parent': 'Parent'
        }
        return roles[role] || role
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
                        user.full_name.charAt(0).toUpperCase()
                    )}
                </div>
                <div className="hidden md:block text-left">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-none">{user.full_name}</p>
                    <p className="text-[9px] text-slate-500 font-medium">{getRoleLabel(user.role)}</p>
                </div>
                <ChevronDown className={`w-3 h-3 text-slate-400 group-hover:text-primary transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-premium z-[2000] animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                    <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{user.full_name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                        {user.school_name && (
                            <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                                <ShieldCheck className="w-3 h-3 text-green-500" />
                                <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tight">{user.school_name}</span>
                            </div>
                        )}
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
