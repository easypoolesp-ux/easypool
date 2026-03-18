'use client'

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bus, MapPin, AlertTriangle, Maximize2, Minimize2, Search, LogOut } from 'lucide-react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { components } from '@/types/api'

import UserProfile from '@/components/layout/UserProfile'

const FleetMap = nextDynamic(() => import('@/components/map/FleetMap'), { ssr: false })

type BusType = components['schemas']['BusList']

import StatusPieChart from '@/components/dashboard/StatusPieChart'

export default function DashboardPage() {
    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [buses, setBuses] = useState<BusType[]>([])
    const [alerts, setAlerts] = useState<components['schemas']['Alert'][]>([])
    const [loading, setLoading] = useState(true)
    const [transporters, setTransporters] = useState<any[]>([])

    // Calculate status distribution
    const statusDistribution = useMemo(() => {
        const dist = { moving: 0, idle: 0, ignition_off: 0, offline: 0 }
        buses.forEach(b => {
            const status = b.status || 'offline'
            if (status in dist) dist[status as keyof typeof dist]++
            else dist.offline++
        })
        return dist
    }, [buses])

    useEffect(() => {
        setMounted(true)
        fetchData()
        const interval = setInterval(fetchData, 10000) // Poll every 10s
        return () => clearInterval(interval)
    }, [])

    const fetchData = async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
            const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
            const ts = Date.now()
            const [busRes, alertRes, transRes] = await Promise.all([
                fetch(`/api/buses?_t=${ts}`, { headers }),
                fetch(`/api/alerts?_t=${ts}`, { headers }),
                fetch(`/api/transporters?_t=${ts}`, { headers })
            ])

            if (busRes.ok) {
                const data = await busRes.json()
                setBuses(data.results || data)
            }
            if (alertRes.ok) {
                const data = await alertRes.json()
                setAlerts(data.results || data)
            }
            if (transRes.ok) {
                const data = await transRes.json()
                setTransporters(data.results || data)
            }
        } catch (err) {
            console.error("Failed to fetch dashboard data:", err)
        } finally {
            setLoading(false)
        }
    }

    if (!mounted || loading) return <div className="p-6 text-center">Loading Dashboard...</div>

    const getStatusInfo = (lastHeartbeat: string | null) => {
        if (!lastHeartbeat) return { label: 'NO DATA', color: 'text-slate-300', dot: 'bg-slate-200' }
        const last = new Date(lastHeartbeat).getTime()
        const now = new Date().getTime()
        const diffMinutes = (now - last) / (1000 * 60)

        if (diffMinutes < 2) return { label: 'LIVE', color: 'text-green-600', dot: 'bg-green-500 animate-pulse' }
        
        if (diffMinutes < 60) {
            return { label: `${Math.round(diffMinutes)}m AGO`, color: 'text-amber-500', dot: 'bg-amber-400' }
        }
        
        const diffHours = Math.round(diffMinutes / 60)
        if (diffHours < 24) {
            return { label: `${diffHours}h AGO`, color: 'text-orange-500', dot: 'bg-orange-400' }
        }

        return { label: `${Math.round(diffHours / 24)}d AGO`, color: 'text-slate-400', dot: 'bg-slate-300' }
    }

    const filteredBuses = buses.filter(bus =>
        bus.internal_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bus.plate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (bus.route_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50/50 dark:bg-transparent min-h-screen">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Fleet Overview</h1>
                    <p className="text-muted-foreground">Monitor real-time status of all active school buses in Kolkata.</p>
                </div>
                <UserProfile />
            </header>

            {/* Top Layout: Stats + Pie Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4 lg:col-span-1">
                    <Card className="border-none shadow-sm bg-primary text-primary-foreground transform transition hover:scale-[1.02] cursor-default">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-[10px] font-black uppercase opacity-60 tracking-widest">Total Fleet</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-4xl font-black italic">{buses.length}</div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm bg-white dark:bg-slate-900 border border-border">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Unresolved Alerts</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className={`text-4xl font-black font-mono tracking-tighter ${alerts.filter(a => !a.is_resolved).length > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                {alerts.filter(a => !a.is_resolved).length}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="lg:col-span-1 border-none shadow-sm bg-white dark:bg-slate-900 p-4 border border-border flex flex-col justify-center">
                    <StatusPieChart data={statusDistribution} />
                </Card>

                <div className="lg:col-span-2 min-h-[250px] bg-muted relative shadow-inner rounded-xl overflow-hidden border border-border">
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="absolute top-4 right-14 z-10 p-2 bg-white/90 dark:bg-slate-800/90 rounded-lg shadow-premium hover:bg-white transition-colors border border-border"
                        title={isFullscreen ? "Exit Fullscreen" : "See Map in Fullscreen"}
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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
                        isFullscreen={false}
                    />
                </div>
            </div>

            <div className={`grid grid-cols-1 ${isFullscreen ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-6 transition-all duration-500`}>
                {isFullscreen && (
                    <div className="fixed inset-4 z-[60] bg-background shadow-2xl rounded-2xl overflow-hidden border border-border">
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="absolute top-6 right-6 z-10 p-4 bg-white/90 dark:bg-slate-800/90 rounded-2xl shadow-premium hover:bg-white transition-all scale-110"
                        >
                            <Minimize2 className="w-6 h-6" />
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
                            isFullscreen={true}
                        />
                    </div>
                )}
                
                {/* Main List */}
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
                                                    <div className={`p-2.5 rounded-xl ${bus.status === 'online' ? 'bg-green-500/10 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
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
                                                <div className="flex items-center gap-2 text-[10px]">
                                                    {(() => {
                                                        const status = getStatusInfo((bus as any).last_heartbeat)
                                                        return (
                                                            <span className={`${status.color} flex items-center gap-1.5 font-bold uppercase tracking-wider`}>
                                                                <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                                                {status.label}
                                                            </span>
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
