"use client"

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
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
    loading: () => <div className="w-full h-full bg-slate-100 dark:bg-slate-900 animate-pulse flex items-center justify-center">Loading Engine...</div>
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
    const [selectedBus, setSelectedBus] = useState<BusData | null>(null)

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
            bus.plate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (bus.route_name?.toLowerCase().includes(searchQuery.toLowerCase()))
        )
    }, [buses, searchQuery])

    const statusDistribution = useMemo(() => {
        const dist = [
            { name: 'Moving', value: 0, color: '#10b981' },
            { name: 'Idle', value: 0, color: '#94a3b8' },
            { name: 'Off', value: 0, color: '#f43f5e' },
            { name: 'Offline', value: 0, color: '#18181b' },
        ]

        buses.forEach(bus => {
            if (bus.status === 'moving') dist[0].value++
            else if (bus.status === 'idle') dist[1].value++
            else if (bus.status === 'ignition_off') dist[2].value++
            else dist[3].value++
        })

        return dist
    }, [buses])

    const onlineCount = buses.filter(b => b.status === 'moving' || b.status === 'idle').length

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700 p-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-indigo-500 to-indigo-400 bg-clip-text text-transparent">
                        Fleet Intelligence
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm font-medium">
                        Real-time tracking and diagnostics for your local transportation network.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest leading-none">Last Synchronized</p>
                        <p className="text-xs font-mono font-bold text-indigo-500">{new Date().toLocaleTimeString()}</p>
                    </div>
                </div>
            </div>

            {/* Top Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-emerald-500/5 border-emerald-500/10 shadow-premium group hover:bg-emerald-500/10 transition-colors">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-600 mb-1">Alive Fleet</p>
                            <h3 className="text-3xl font-black tracking-tight text-emerald-700">{onlineCount}</h3>
                        </div>
                        <div className="p-3 bg-emerald-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                            <Activity className="w-6 h-6 text-emerald-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-500/5 border-slate-500/10 shadow-premium group hover:bg-slate-500/10 transition-colors">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-600 mb-1">Idle State</p>
                            <h3 className="text-3xl font-black tracking-tight text-slate-700">{buses.filter(b => b.status === 'idle').length}</h3>
                        </div>
                        <div className="p-3 bg-slate-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                            <Clock className="w-6 h-6 text-slate-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-rose-500/5 border-rose-500/10 shadow-premium group hover:bg-rose-500/10 transition-colors">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-rose-600 mb-1">Ignition Off</p>
                            <h3 className="text-3xl font-black tracking-tight text-rose-700">{buses.filter(b => b.status === 'ignition_off').length}</h3>
                        </div>
                        <div className="p-3 bg-rose-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                            <PowerOff className="w-6 h-6 text-rose-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-indigo-500/5 border-indigo-500/10 shadow-premium group hover:bg-indigo-500/10 transition-colors">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-indigo-600 mb-1">Total Assets</p>
                            <h3 className="text-3xl font-black tracking-tight text-indigo-700">{buses.length}</h3>
                        </div>
                        <div className="p-3 bg-indigo-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                            <Bus className="w-6 h-6 text-indigo-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Interactive Row */}
            <div className={`grid grid-cols-1 ${isFullscreen ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-6 transition-all duration-500`}>
                {/* Map (2/3 width) - Now on the LEFT */}
                <div className={`${isFullscreen ? 'fixed inset-0 z-[100] bg-background' : 'lg:col-span-2 min-h-[600px] shadow-2xl rounded-3xl overflow-hidden border border-border/40'}`}>
                    <div className="relative w-full h-full">
                        <div className="absolute top-4 right-4 z-[10] flex gap-2">
                             <Button 
                                variant="secondary" 
                                size="icon" 
                                className="rounded-xl shadow-premium backdrop-blur-md bg-white/80 dark:bg-slate-800/80 hover:bg-white text-foreground"
                                onClick={() => handleRefresh(true)}
                                disabled={loading}
                             >
                                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                             </Button>
                             <Button 
                                variant="secondary" 
                                size="icon" 
                                className="rounded-xl shadow-premium backdrop-blur-md bg-white/80 dark:bg-slate-800/80 hover:bg-white text-foreground"
                                onClick={() => setIsFullscreen(!isFullscreen)}
                             >
                                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                             </Button>
                        </div>
                        <div className="absolute top-4 left-4 z-[10] bg-background/80 backdrop-blur-md border border-border/40 px-4 py-2 rounded-2xl shadow-premium flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold tracking-tight">LIVE MONITORING</span>
                        </div>
                        
                        <FleetMap 
                            buses={buses.map(b => ({
                                id: b.id,
                                internal_id: b.internal_id,
                                status: b.status,
                                lat: b.lat,
                                lng: b.lng,
                                plate: b.plate_number,
                                route: b.route_name
                            }))} 
                            onBusSelect={setSelectedBus} 
                            selectedBusId={selectedBus?.id}
                            isFullscreen={isFullscreen}
                        />
                    </div>
                </div>

                {/* Sidebar (1/3 width) - Now on the RIGHT */}
                {!isFullscreen && (
                    <div className="space-y-6 lg:col-span-1 flex flex-col min-h-[600px]">
                        {/* Fleet Distribution Chart */}
                        <Card className="border-none shadow-premium bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950/50 rounded-3xl overflow-hidden">
                            <CardContent className="p-6">
                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <PieChartIcon className="w-4 h-4 text-indigo-500" />
                                    Fleet Connectivity
                                </h4>
                                <div className="h-40 flex items-center justify-center">
                                    <StatusPieChart data={statusDistribution} />
                                </div>
                                <div className="mt-6 flex flex-wrap gap-3 justify-center">
                                    {statusDistribution.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-background/50 rounded-lg border border-border/40">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                            <span className="text-[10px] font-bold uppercase tracking-tight opacity-70">{item.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Searchable Bus List */}
                        <div className="flex-1 flex flex-col bg-card/10 backdrop-blur-xs rounded-3xl border border-border/40 overflow-hidden shadow-premium">
                            <div className="p-4 border-b border-border/40 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Assets</h4>
                                    <div className="px-2 py-0.5 bg-indigo-500/10 text-indigo-500 rounded text-[9px] font-black uppercase">
                                        Real-time
                                    </div>
                                </div>
                                <div className="relative group">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    <input
                                        type="text"
                                        placeholder="Search plate or ID..."
                                        className="w-full bg-background/50 border border-border/60 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                            <ScrollArea className="flex-1">
                                <div className="p-4 space-y-2 overflow-y-auto max-h-[400px]">
                                    {filteredBuses.map((bus) => (
                                        <div 
                                            key={bus.id}
                                            onClick={() => setSelectedBus(bus)}
                                            className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between cursor-pointer group-hover:scale-[1.02] active:scale-[0.98] ${
                                                selectedBus?.id === bus.id 
                                                    ? 'bg-indigo-500/10 border-indigo-500/20 shadow-sm' 
                                                    : 'bg-card/40 border-border/10 hover:border-border/40 hover:bg-card/70'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`p-2.5 rounded-xl ${
                                                    bus.status === 'moving' ? 'bg-emerald-500/10 text-emerald-600' :
                                                    bus.status === 'idle' ? 'bg-slate-400/10 text-slate-500' :
                                                    bus.status === 'ignition_off' ? 'bg-rose-500/10 text-rose-600' :
                                                    'bg-zinc-100 text-slate-400'
                                                }`}>
                                                    <Bus className="w-5 h-5" />
                                                </div>
                                                <div className="overflow-hidden max-w-[120px]">
                                                    <h5 className="font-bold text-[13px] tracking-tight truncate">{bus.internal_id}</h5>
                                                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">{bus.plate_number}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <div className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${
                                                    bus.status === 'moving' ? 'bg-emerald-500 shadow-emerald-500/50 animate-pulse' :
                                                    bus.status === 'idle' ? 'bg-slate-400 shadow-slate-400/50' :
                                                    bus.status === 'ignition_off' ? 'bg-rose-500 shadow-rose-500/50' :
                                                    'bg-zinc-800'
                                                }`} />
                                                <span className="text-[9px] font-black uppercase tracking-widest opacity-40">
                                                    {bus.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredBuses.length === 0 && (
                                        <div className="text-center py-20 opacity-30 italic text-xs font-bold tracking-widest uppercase">
                                            No Vehicles Found
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
