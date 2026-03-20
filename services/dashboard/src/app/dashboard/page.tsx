'use client'

export const dynamic = "force-dynamic";

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bus, MapPin, AlertTriangle, Maximize2, Minimize2, Search, LogOut } from 'lucide-react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { components } from '@/types/api'
import Image from 'next/image'


import UserProfile from '@/components/layout/UserProfile'

const FleetMap = nextDynamic(() => import('@/components/map/FleetMap'), { ssr: false })

type BusType = components['schemas']['BusList']

export default function DashboardPage() {
    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [buses, setBuses] = useState<BusType[]>([])
    const [alerts, setAlerts] = useState<components['schemas']['Alert'][]>([])
    const [loading, setLoading] = useState(true)
    const [transporters, setTransporters] = useState<any[]>([])

    useEffect(() => {
        setMounted(true)

        // Load cached bus positions for instant display
        const cachedBuses = typeof window !== 'undefined' ? localStorage.getItem('cached_buses') : null
        if (cachedBuses) {
            try { setBuses(JSON.parse(cachedBuses)) } catch (e) {}
        }

        // Buses: poll every 10s (live tracking)
        fetchBuses()
        const busInterval = setInterval(fetchBuses, 10000)

        // Alerts + transporters: poll every 60s (rarely change)
        fetchMeta()
        const metaInterval = setInterval(fetchMeta, 60000)

        return () => {
            clearInterval(busInterval)
            clearInterval(metaInterval)
        }
    }, [])

    const fetchBuses = async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
            const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
            const res = await fetch(`/api/buses?_t=${Date.now()}`, { headers })
            if (res.ok) {
                const data = await res.json()
                const results = data.results || data
                setBuses(results)
                localStorage.setItem('cached_buses', JSON.stringify(results))
            }
        } catch (err) {
            console.error('Bus fetch error:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchMeta = async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
            const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
            const ts = Date.now()
            const [alertRes, transRes] = await Promise.all([
                fetch(`/api/alerts?_t=${ts}`, { headers }),
                fetch(`/api/transporters?_t=${ts}`, { headers })
            ])
            if (alertRes.ok) { const d = await alertRes.json(); setAlerts(d.results || d) }
            if (transRes.ok) { const d = await transRes.json(); setTransporters(d.results || d) }
        } catch (err) {
            console.error('Meta fetch error:', err)
        }
    }

    if (!mounted) return <div className="p-6 text-center">Loading Dashboard...</div>

    /** Use computed_status from backend for accurate real-time status */
    const getStatusDisplay = (bus: any) => {
        const s = bus.computed_status || bus.status
        switch (s) {
            case 'moving':    return { label: 'Moving',    color: 'text-green-600 dark:text-green-400', dot: 'bg-green-500 animate-pulse', speed: Math.round(bus.speed || 0) }
            case 'idle':      return { label: 'Idle',      color: 'text-amber-500 dark:text-amber-400', dot: 'bg-amber-400',              speed: null }
            case 'no_signal': return { label: 'No Signal', color: 'text-red-500 dark:text-red-400',   dot: 'bg-red-500',                 speed: null }
            case 'offline':   return { label: 'Offline',   color: 'text-slate-400',                    dot: 'bg-slate-400',               speed: null }
            default:          return { label: 'Unknown',   color: 'text-slate-300',                    dot: 'bg-slate-300',               speed: null }
        }
    }

    const filteredBuses = buses.filter(bus =>
        bus.internal_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bus.plate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (bus.route_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50/50 dark:bg-transparent min-h-screen">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="relative w-12 h-12 overflow-hidden rounded-full border border-border shadow-md bg-white p-1.5 flex items-center justify-center">
                        <div className="relative w-full h-full overflow-hidden rounded-full">
                            <Image 
                                src="/logo.jpeg" 
                                alt="EasyPool Logo" 
                                fill 
                                className="object-cover"
                                priority
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Fleet Overview</h1>
                    </div>
                </div>
                <UserProfile />
            </header>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-none shadow-sm bg-primary text-primary-foreground transition-all hover:scale-[1.02]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase opacity-90">Total Buses</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold italic">{buses.length}</div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white dark:bg-slate-900 border border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Company Groups</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-500 font-mono tracking-tighter">
                            {transporters.length}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white dark:bg-slate-900 border border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">Active Now</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-500 font-mono tracking-tighter">
                            {buses.filter(b => b.status === 'online').length}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white dark:bg-slate-900 border border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">System Alerts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-bold font-mono tracking-tighter ${alerts.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                            {alerts.length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className={`grid grid-cols-1 ${isFullscreen ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-6 transition-all duration-500`}>
                {/* Main Fleet Map with Fullscreen Toggle */}
                <div className={`${isFullscreen ? 'lg:col-span-1 fixed inset-4 z-50 bg-background shadow-2xl' : 'lg:col-span-2 min-h-[500px] bg-muted relative shadow-inner'} rounded-xl overflow-hidden border border-border`}>
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="absolute top-4 right-[60px] z-10 p-3 bg-white/90 dark:bg-slate-800/90 rounded-xl shadow-2xl backdrop-blur-md hover:bg-white transition-all active:scale-95 border border-border group"
                        title={isFullscreen ? "Exit Fullscreen" : "See Map in Fullscreen"}
                    >
                        {isFullscreen ? <Minimize2 className="w-5 h-5 group-hover:scale-110 transition-transform" /> : <Maximize2 className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                    </button>
                    <FleetMap
                        buses={filteredBuses.map(b => ({
                            id: (b as any).id,
                            internal_id: b.internal_id,
                            status: b.status || 'offline',
                            lat: b.lat,
                            lng: b.lng,
                            plate: b.plate_number,
                            route: b.route_name
                        }))}
                        isFullscreen={isFullscreen}
                    />
                </div>

                {/* Bus Status List - Hide when map is fullscreen for focus */}
                {!isFullscreen && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col h-[500px]">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Bus className="w-5 h-5 text-primary" />
                                Fleet Status
                            </h2>
                        </div>

                        {/* Search Bar */}
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder="Search Plate, ID, or Route..."
                                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {filteredBuses.length > 0 ? (
                                filteredBuses.map((bus) => (
                                    <Link href={`/dashboard/bus/${bus.id}`} key={bus.id} className="block group">
                                        <Card className="hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer border-none shadow-sm bg-white dark:bg-slate-900">
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2.5 rounded-xl ${
                                                    (bus as any).computed_status === 'moving' ? 'bg-green-500/10 text-green-600' :
                                                    (bus as any).computed_status === 'idle'   ? 'bg-amber-400/10 text-amber-500' :
                                                    (bus as any).computed_status === 'no_signal' ? 'bg-red-500/10 text-red-500' :
                                                    'bg-slate-100 text-slate-400'
                                                }`}>
                                                        <Bus className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-bold truncate flex items-center gap-1.5 tracking-tight">
                                                            {bus.internal_id}
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono font-normal">
                                                                {bus.plate_number}
                                                            </span>
                                                        </h3>
                                                        <p className="text-[11px] text-muted-foreground truncate italic">{bus.route_name || 'No Route assigned'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1 text-[10px]">
                                                    {(() => {
                                                        const st = getStatusDisplay(bus)
                                                        // Time ago from last_heartbeat
                                                        const hb = (bus as any).last_heartbeat
                                                        let ago = ''
                                                        if (hb) {
                                                            const diffMs = Date.now() - new Date(hb).getTime()
                                                            const mins = Math.floor(diffMs / 60000)
                                                            if (mins < 1) ago = 'Just now'
                                                            else if (mins < 60) ago = `${mins}m ago`
                                                            else if (mins < 1440) ago = `${Math.floor(mins / 60)}h ago`
                                                            else ago = `${Math.floor(mins / 1440)}d ago`
                                                        }
                                                        return (
                                                            <>
                                                                <span className={`${st.color} flex items-center gap-1.5 font-bold uppercase tracking-wider`}>
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                                                    {st.label}
                                                                </span>
                                                                {st.speed !== null && st.speed > 0 && (
                                                                    <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                                                                        {st.speed} km/h
                                                                    </span>
                                                                )}
                                                                {ago && (
                                                                    <span className="text-[9px] text-muted-foreground font-medium">
                                                                        {ago}
                                                                    </span>
                                                                )}
                                                            </>
                                                        )
                                                    })()}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                ))
                            ) : (
                                <div className="text-center py-10 text-muted-foreground text-xs italic">
                                    No buses matching "{searchQuery}"
                                </div>
                            )}
                        </div>

                        {/* Emergency Alert Card - Dynamic from API */}
                        {alerts.filter(a => !a.is_resolved).slice(0, 1).map(alert => (
                            <Card key={alert.id} className="bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/10 border-none shadow-sm outline outline-1 outline-red-200 dark:outline-red-900/20 mt-auto animate-pulse">
                                <CardContent className="p-4 flex gap-3 text-red-700 dark:text-red-400">
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    <div className="text-[10px]">
                                        <p className="font-bold uppercase tracking-tighter text-red-600">Urgent: {alert.type} - {alert.bus.internal_id}</p>
                                        <p className="opacity-80 font-medium leading-tight">{alert.message}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
