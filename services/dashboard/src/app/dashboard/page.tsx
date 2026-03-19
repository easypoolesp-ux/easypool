"use client"

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { 
    Bus, 
    Map as MapIcon, 
    ShieldAlert, 
    RefreshCcw, 
    Maximize2, 
    Minimize2, 
    Activity,
    Clock,
    PowerOff,
    Search,
    PieChart as PieChartIcon
} from "lucide-react"
import dynamic from 'next/dynamic'
import Link from 'next/link'
import StatusPieChart from '@/components/dashboard/StatusPieChart'

const FleetMap = dynamic(() => import('@/components/map/FleetMap'), { 
    ssr: false,
    loading: () => <div className="w-full h-full bg-slate-100 dark:bg-slate-900 animate-pulse flex items-center justify-center font-bold text-xs uppercase tracking-widest opacity-50">Map Engine Initializing...</div>
})

interface BusData {
    id: string;
    internal_id: string;
    plate_number: string;
    status: 'moving' | 'idle' | 'ignition_off' | 'offline';
    lat: number;
    lng: number;
    driver_name?: string;
    route_name?: string;
    last_heartbeat?: string;
}

export default function DashboardPage() {
    const [buses, setBuses] = useState<BusData[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [selectedBusId, setSelectedBusId] = useState<string | null>(null)

    const fetchBuses = async () => {
        try {
            const ts = new Date().getTime()
            const response = await fetch(`/api/buses?_t=${ts}`)
            const data = await response.json()
            setBuses(data.results || [])
        } catch (error) {
            console.error('Error fetching buses:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchBuses()
        const interval = setInterval(fetchBuses, 10000)
        return () => clearInterval(interval)
    }, [])

    const handleRefresh = (manual = false) => {
        if (manual) setLoading(true)
        fetchBuses()
    }

    const filteredBuses = useMemo(() => {
        return buses.filter(bus => 
            bus.internal_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            bus.plate_number.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [buses, searchQuery])

    const statusStats = useMemo(() => {
        return {
            moving: buses.filter(b => b.status === 'moving').length,
            idle: buses.filter(b => b.status === 'idle').length,
            ignition_off: buses.filter(b => b.status === 'ignition_off').length,
            offline: buses.filter(b => b.status === 'offline').length
        }
    }, [buses])

    const onlineCount = statusStats.moving + statusStats.idle

    // Premium common scrollbar class
    const scrollbarStyles = "scrollbar-thin scrollbar-thumb-indigo-500/20 scrollbar-track-transparent hover:scrollbar-thumb-indigo-500/40"

    return (
        <div className="max-w-[1700px] mx-auto space-y-8 p-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* 1. Dashboard Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-border/40 pb-6 gap-4">
                <div className="space-y-1">
                    <h1 className="text-4xl font-extrabold tracking-tighter bg-gradient-to-br from-slate-950 via-indigo-600 to-indigo-400 dark:from-white dark:via-indigo-400 dark:to-indigo-300 bg-clip-text text-transparent">
                        Fleet Operations
                    </h1>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-60">
                        Real-time Asset Intelligence & Diagnostics
                    </p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 leading-none">Last Sync</p>
                        <p className="text-xs font-mono font-bold text-indigo-500">{new Date().toLocaleTimeString()}</p>
                    </div>
                </div>
            </div>

            {/* 2. Top Stats Overview (4 Columns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                    { label: 'Moving Fleet', val: statusStats.moving, icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                    { label: 'Idle State', val: statusStats.idle, icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/10' },
                    { label: 'Ignition Off', val: statusStats.ignition_off, icon: PowerOff, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                    { label: 'Total Assets', val: buses.length, icon: Bus, color: 'text-indigo-500', bg: 'bg-indigo-500/10' }
                ].map((s, idx) => (
                    <Card key={idx} className="border-none shadow-premium bg-card/10 backdrop-blur-md overflow-hidden relative group">
                        <div className={`absolute top-0 left-0 w-1 h-full ${s.color.replace('text', 'bg')}`} />
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">{s.label}</p>
                                <h3 className="text-3xl font-black tracking-tight">{s.val}</h3>
                            </div>
                            <div className={`p-4 rounded-2xl ${s.bg} transition-all group-hover:scale-110 duration-500`}>
                                <s.icon className={`w-6 h-6 ${s.color}`} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* 3. Main Dashboard Layout (Map/Sidebar) */}
            <div className={`grid grid-cols-1 ${isFullscreen ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-8 transition-all duration-700`}>
                
                {/* Map Area (2/3 width on Left) */}
                <div className={`${isFullscreen ? 'fixed inset-0 z-[100] bg-background' : 'lg:col-span-2 min-h-[650px] shadow-3xl rounded-[2.5rem] overflow-hidden border border-border/20'}`}>
                    <div className="relative w-full h-full group/map">
                        {/* Map Overlay Controls */}
                        <div className="absolute top-6 right-6 z-[10] flex flex-col gap-3">
                             <button 
                                onClick={() => handleRefresh(true)}
                                disabled={loading}
                                className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white/95 dark:bg-slate-900/95 shadow-premium border border-border/40 hover:bg-white text-foreground transition-all active:scale-95 disabled:opacity-50"
                             >
                                <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
                             </button>
                             <button 
                                onClick={() => setIsFullscreen(!isFullscreen)}
                                className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white/95 dark:bg-slate-900/95 shadow-premium border border-border/40 hover:bg-white text-foreground transition-all active:scale-95"
                             >
                                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                             </button>
                        </div>

                        {/* Map Status indicator */}
                        <div className="absolute top-6 left-6 z-[10] flex items-center bg-white/95 dark:bg-slate-900/95 px-5 py-3 rounded-2xl shadow-premium border border-border/40 gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                            <span className="text-[11px] font-black uppercase tracking-widest text-foreground">Global Monitor</span>
                        </div>

                        <FleetMap 
                            buses={buses.map(b => ({
                                id: b.id,
                                internal_id: b.internal_id,
                                status: b.status,
                                lat: b.lat,
                                lng: b.lng,
                                plate: b.plate_number
                            }))} 
                            initialBusId={selectedBusId}
                            isFullscreen={isFullscreen}
                        />
                    </div>
                </div>

                {/* Sidebar Area (1/3 width on Right) */}
                {!isFullscreen && (
                    <div className="lg:col-span-1 space-y-8 flex flex-col min-h-[650px]">
                        {/* Distribution Chart */}
                        <Card className="border-none shadow-premium bg-card/20 backdrop-blur-lg rounded-[2.5rem] p-8">
                            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-8 flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                                    <PieChartIcon className="w-3.5 h-3.5" />
                                </div>
                                Fleet Connectivity
                            </h4>
                            <div className="h-44">
                                <StatusPieChart data={statusStats} />
                            </div>
                        </Card>

                        {/* Searchable Asset List */}
                        <div className="flex-1 flex flex-col bg-card/30 backdrop-blur-2xl rounded-[2.5rem] border border-border/40 overflow-hidden shadow-premium">
                             <div className="p-6 border-b border-border/20 space-y-4 bg-gradient-to-br from-white/5 to-transparent">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Live Registry</h4>
                                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-500 rounded-full text-[9px] font-black tracking-widest border border-indigo-500/20">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                                        SYNCED
                                    </div>
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-50" />
                                    <input
                                        type="text"
                                        placeholder="Identification Search..."
                                        className="w-full bg-background/50 border border-border/40 rounded-2xl pl-11 pr-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all font-bold placeholder:text-[10px] placeholder:font-black placeholder:uppercase placeholder:tracking-widest placeholder:opacity-40"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Bus Items List */}
                            <div className={`flex-1 overflow-y-auto px-4 py-6 space-y-3 ${scrollbarStyles} max-h-[420px]`}>
                                {filteredBuses.map((bus) => (
                                    <div 
                                        key={bus.id}
                                        onClick={() => setSelectedBusId(bus.id)}
                                        className={`p-5 rounded-[1.5rem] border transition-all duration-500 flex items-center justify-between cursor-pointer group/item ${
                                            selectedBusId === bus.id 
                                                ? 'bg-indigo-500/15 border-indigo-500/30 shadow-indigo-500/10 shadow-lg' 
                                                : 'bg-card/40 border-border/10 hover:border-border/40 hover:bg-card/70'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl ${
                                                bus.status === 'moving' ? 'bg-emerald-500/15 text-emerald-500' :
                                                bus.status === 'idle' ? 'bg-slate-500/15 text-slate-500' :
                                                bus.status === 'ignition_off' ? 'bg-rose-500/15 text-rose-500' :
                                                'bg-zinc-100 text-slate-400'
                                            } transition-transform group-hover/item:scale-110`}>
                                                <Bus className="w-5 h-5" />
                                            </div>
                                            <div className="space-y-0.5">
                                                <h5 className="font-bold text-sm tracking-tight">{bus.internal_id}</h5>
                                                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest flex items-center gap-1.5 opacity-50">
                                                    {bus.plate_number}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5">
                                            <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_12px] ${
                                                bus.status === 'moving' ? 'bg-emerald-500 shadow-emerald-500/60 animate-pulse' :
                                                bus.status === 'idle' ? 'bg-slate-400 shadow-slate-400/60' :
                                                bus.status === 'ignition_off' ? 'bg-rose-500 shadow-rose-500/60' :
                                                'bg-zinc-800'
                                            }`} />
                                            <span className="text-[8px] font-black uppercase tracking-[0.15em] opacity-40">
                                                {bus.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {filteredBuses.length === 0 && (
                                    <div className="py-24 text-center">
                                        <div className="inline-block p-4 rounded-full bg-slate-100 dark:bg-slate-900 mb-4">
                                            <Search className="w-6 h-6 opacity-20" />
                                        </div>
                                        <p className="text-xs font-black uppercase tracking-widest opacity-20">No Assets Matched</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
