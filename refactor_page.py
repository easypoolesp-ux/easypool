import re

f = r'D:\easypool_2026\services\dashboard\src\app\dashboard\page.tsx'
c = open(f, 'r', encoding='utf-8').read()

# 1. Add hook import
c = c.replace(
    "import { getStatusConfig, FLEET_STATUSES } from '@/constants/fleetStatus'",
    "import { getStatusConfig, FLEET_STATUSES } from '@/constants/fleetStatus'\nimport { useBusPolling } from '@/hooks/useBusPolling'"
)

# 2. Add Clock and WifiOff icon to lucide-react (if not there)
c = c.replace(
    "import { Bus, MapPin, AlertTriangle, Maximize2, Minimize2, Search, LogOut, Filter, X } from 'lucide-react'",
    "import { Bus, MapPin, AlertTriangle, Maximize2, Minimize2, Search, LogOut, Filter, X, Clock, WifiOff, ExternalLink } from 'lucide-react'"
)

# 3. Move getStatusDisplay outside
old_get_status = """    if (!mounted) return <div className="p-6 text-center">Loading Dashboard...</div>

    /** Use computed_status from backend — colour/label from fleetStatus.ts */
    const getStatusDisplay = (bus: any) => {
        const s = bus.computed_status || bus.status
        const cfg = getStatusConfig(s)
        return {
            label: cfg.label,
            color: cfg.text,
            dot: s === 'moving' ? `${cfg.dot} animate-pulse` : cfg.dot,
            speed: s === 'moving' ? Math.round(bus.speed || 0) : null,
        }
    }"""

new_get_status = """    if (!mounted) return <div className="p-6 text-center">Loading Dashboard...</div>"""

c = c.replace(old_get_status, new_get_status)

# Insert getStatusDisplay before DashboardPage
c = c.replace(
    "export default function DashboardPage() {",
    """/** Use computed_status from backend — colour/label from fleetStatus.ts */
const getStatusDisplay = (bus: any) => {
    const s = bus.computed_status || bus.status
    const cfg = getStatusConfig(s)
    return {
        label: cfg.label,
        color: cfg.text,
        dot: s === 'moving' ? `${cfg.dot} animate-pulse` : cfg.dot,
        speed: s === 'moving' ? Math.round(bus.speed || 0) : null,
    }
}

export default function DashboardPage() {"""
)

# 4. Replace states and fetches with hook
old_states_and_fetches = """    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [buses, setBuses] = useState<BusType[]>([])
    const [alerts, setAlerts] = useState<components['schemas']['Alert'][]>([])
    const [loading, setLoading] = useState(true)
    const [transporters, setTransporters] = useState<any[]>([])
    const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set())
    const [showFilters, setShowFilters] = useState(false)

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
    }"""

new_states_and_fetches = """    const router = useRouter()
    const [mounted, setMounted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [hiddenStatuses, setHiddenStatuses] = useState<Set<string>>(new Set())
    const [showFilters, setShowFilters] = useState(false)
    const { buses, alerts, transporters, loading, error, lastUpdated } = useBusPolling()

    import { useMemo } from 'react' // We will put it at top in step 8
    
    useEffect(() => {
        setMounted(true)
    }, [])"""

c = c.replace(old_states_and_fetches, new_states_and_fetches)

# 5. Fix import of useMemo
c = c.replace(
    "import { useState, useEffect } from 'react'",
    "import { useState, useEffect, useMemo } from 'react'"
)
c = c.replace("    import { useMemo } from 'react' // We will put it at top in step 8\n    ", "")

# 6. Memoize activeBuses and filteredBuses
old_filters = """    // Filter out offline (untracked) buses — they don't belong on the live dashboard
    const activeBuses = buses.filter(b => {
        const cs = (b as any).computed_status || b.status
        return cs !== 'offline'
    })

    const filteredBuses = activeBuses.filter(bus => {
        const cs = (bus as any).computed_status || bus.status
        if (hiddenStatuses.has(cs)) return false
        return bus.internal_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            bus.plate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (bus.route_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    })"""

new_filters = """    // Filter out offline (untracked) buses — they don't belong on the live dashboard
    const activeBuses = useMemo(() => buses.filter(b => {
        const cs = (b as any).computed_status || b.status
        return cs !== 'offline'
    }), [buses])

    const filteredBuses = useMemo(() => activeBuses.filter(bus => {
        const cs = (bus as any).computed_status || bus.status
        if (hiddenStatuses.has(cs)) return false
        return bus.internal_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            bus.plate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (bus.route_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    }), [activeBuses, hiddenStatuses, searchQuery])"""

c = c.replace(old_filters, new_filters)

# 7. Add last updated to header
old_header = """                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Fleet Overview</h1>
                    </div>
                </div>
                <UserProfile />
            </header>"""

new_header = """                    <div className="space-y-1 content-center">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Fleet Overview</h1>
                            <span className="font-bold text-sm bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 shadow-inner">
                                {activeBuses.length} Buses
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                            {error ? (
                                <span className="flex items-center gap-1 text-red-500"><WifiOff size={12}/> {error}</span>
                            ) : loading && !lastUpdated ? (
                                <span className="flex items-center gap-1 animate-pulse"><Clock size={12}/> Loading...</span>
                            ) : (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500">
                                    <Clock size={12}/> Updated {lastUpdated ? lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : 'just now'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <UserProfile />
            </header>"""

c = c.replace(old_header, new_header)

# 8. Fix bus card: Button for focus, Link for Details. Change colors to use getStatusDisplay
old_card = """                                filteredBuses.map((bus) => (
                                    <Link href={`/dashboard/bus/${bus.id}`} key={bus.id} className="block group">
                                        <Card className="hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer border-none shadow-sm bg-white dark:bg-slate-900">
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2.5 rounded-xl ${
                                                    (bus as any).computed_status === 'moving' ? 'bg-blue-500/10 text-blue-600' :
                                                    (bus as any).computed_status === 'idle'   ? 'bg-amber-400/10 text-amber-500' :
                                                    (bus as any).computed_status === 'no_signal' ? 'bg-red-500/10 text-red-500' :
                                                    'bg-slate-100 text-slate-400'
                                                }`}>
                                                        <Bus className="w-5 h-5" />
                                                    </div>"""

new_card = """                                filteredBuses.map((bus) => {
                                    const st = getStatusDisplay(bus)
                                    return (
                                    <div key={bus.id} className="block group relative">
                                        <Card 
                                            onClick={() => window.dispatchEvent(new CustomEvent('map:focusBus', { detail: bus.id }))}
                                            className="hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer border-none shadow-sm bg-white dark:bg-slate-900">
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 ${st.color}`}>
                                                        <Bus className="w-5 h-5" />
                                                    </div>"""

c = c.replace(old_card, new_card)

# Need to also provide the closure for the map
old_card_end = """                                            </CardContent>
                                        </Card>
                                    </Link>
                                ))
                            ) : ("""

new_card_end = """                                                <Link 
                                                    href={`/dashboard/bus/${bus.id}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 bg-white/80 dark:bg-slate-800 text-slate-500 hover:text-blue-500 rounded-md transition-all shadow-sm border border-slate-200 dark:border-slate-700"
                                                    title="View Bus Details"
                                                >
                                                    <ExternalLink size={14} />
                                                </Link>
                                            </CardContent>
                                        </Card>
                                    </div>
                                )})
                            ) : ("""

c = c.replace(old_card_end, new_card_end)

# Also fix the inner getStatusDisplay since we already called it
old_inner = """                                                <div className="flex flex-col items-end gap-1 text-[10px]">
                                                    {(() => {
                                                        const st = getStatusDisplay(bus)
                                                        const hb = (bus as any).last_heartbeat
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
                                                                <span className="text-[9px] text-muted-foreground font-medium text-right leading-tight">
                                                                    {formatTimeDisplay(hb)}
                                                                </span>
                                                            </>
                                                        )
                                                    })()}
                                                </div>"""

new_inner = """                                                <div className="flex flex-col items-end gap-1 text-[10px] pr-4">
                                                    <span className={`${st.color} flex items-center gap-1.5 font-bold uppercase tracking-wider`}>
                                                        <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                                        {st.label}
                                                    </span>
                                                    {st.speed !== null && st.speed > 0 && (
                                                        <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                                                            {st.speed} km/h
                                                        </span>
                                                    )}
                                                    <span className="text-[9px] text-muted-foreground font-medium text-right leading-tight">
                                                        {formatTimeDisplay((bus as any).last_heartbeat)}
                                                    </span>
                                                </div>"""
c = c.replace(old_inner, new_inner)

open(f, 'w', encoding='utf-8').write(c)
print("Done refactoring page.tsx")
