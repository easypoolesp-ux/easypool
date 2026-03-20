'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, Polyline } from '@react-google-maps/api'
import { Play, Pause, X, Route, Calendar } from 'lucide-react'
import { useTheme } from 'next-themes'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Bus {
    id: string
    internal_id: string
    status: string            // raw stored status (may be stale)
    computed_status?: string  // derived: moving | idle | no_signal | offline
    lat: number
    lng: number
    plate_number?: string
    route_name?: string
    speed?: number
    heading?: number
}

interface GPSPoint {
    lat: number
    lng: number
    speed: number
    timestamp: string
}

interface Props {
    buses: Bus[]
    isFullscreen?: boolean
    initialBusId?: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://easypool-backend-222076803846.asia-south1.run.app'
const MAP_CENTER  = { lat: 22.5726, lng: 88.3639 }
const LIBRARIES: ('marker' | 'maps' | 'places')[] = ['marker']

// ── Map Styles (no mapId — so dark mode JSON styles actually work) ─────────────
const DARK_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry',              stylers: [{ color: '#0f172a' }] },
    { elementType: 'labels.text.fill',      stylers: [{ color: '#64748b' }] },
    { elementType: 'labels.text.stroke',    stylers: [{ color: '#0f172a' }] },
    { featureType: 'road',                  elementType: 'geometry',         stylers: [{ color: '#1e293b' }] },
    { featureType: 'road',                  elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { featureType: 'road.highway',          elementType: 'geometry',         stylers: [{ color: '#334155' }] },
    { featureType: 'water',                 elementType: 'geometry',         stylers: [{ color: '#0b1120' }] },
    { featureType: 'water',                 elementType: 'labels.text.fill', stylers: [{ color: '#1e3a5f' }] },
    { featureType: 'landscape',             elementType: 'geometry',         stylers: [{ color: '#131f35' }] },
    { featureType: 'poi',                   elementType: 'geometry',         stylers: [{ color: '#1e293b' }] },
    { featureType: 'poi.park',              elementType: 'geometry',         stylers: [{ color: '#14261e' }] },
    { featureType: 'transit',               elementType: 'geometry',         stylers: [{ color: '#1e293b' }] },
    { featureType: 'administrative',        elementType: 'geometry.stroke',  stylers: [{ color: '#243447' }] },
]
const LIGHT_STYLE: google.maps.MapTypeStyle[] = []

// ── Status → visual helpers ───────────────────────────────────────────────────
/**
 * Four real statuses (from computed_status):
 *  moving    → #22c55e  green
 *  idle      → #f59e0b  amber
 *  no_signal → #ef4444  red
 *  offline   → #64748b  slate (manual / maintenance)
 */
function getStatusColor(status: string): string {
    switch (status) {
        case 'moving':    return '#3b82f6'   // blue — visible on all map themes
        case 'idle':      return '#f59e0b'
        case 'no_signal': return '#ef4444'
        default:          return '#64748b' // offline / unknown
    }
}

function getStatusLabel(status: string): string {
    switch (status) {
        case 'moving':    return 'Moving'
        case 'idle':      return 'Idle'
        case 'no_signal': return 'No Signal'
        case 'offline':   return 'Offline'
        default:          return 'Unknown'
    }
}

/**
 * Google Maps-style fleet marker:
 * - Solid colored circle with white border
 * - When moving: semi-transparent field-of-view cone in heading direction
 * - When idle/offline: just the circle, no cone
 */
function buildMarkerSvg(color: string, heading: number, isMoving: boolean): string {
    const svg = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${isMoving ? `
      <!-- Field of view cone -->
      <g transform="rotate(${heading}, 32, 32)">
        <path d="M32,32 L20,2 A30,30 0 0,1 44,2 Z" fill="${color}" opacity="0.18"/>
      </g>` : ''}
      <!-- Outer soft ring -->
      <circle cx="32" cy="32" r="14" fill="${color}" stroke="white" stroke-width="3"/>
      <!-- Inner highlight -->
      <circle cx="32" cy="32" r="5" fill="white" opacity="0.85"/>
    </svg>`
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FleetMap({ buses, initialBusId }: Props) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey!,
        id: 'google-map-script',
        libraries: LIBRARIES,
    })

    // Theme
    const { theme, systemTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const isDark = mounted ? (theme === 'system' ? systemTheme : theme) === 'dark' : false

    // State
    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [isLiveTrail, setIsLiveTrail]     = useState(false)
    const [liveTrails, setLiveTrails]       = useState<Map<string, GPSPoint[]>>(new Map())
    const [selectedBusId, setSelectedBusId] = useState<string | null>(initialBusId || null)
    const [playbackDate, setPlaybackDate]   = useState(() =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    )
    const [historyPoints, setHistoryPoints] = useState<GPSPoint[]>([])
    const [playbackIndex, setPlaybackIndex] = useState(0)
    const [isPlaying, setIsPlaying]         = useState(false)
    const [isLoading, setIsLoading]         = useState(false)
    const [isMapReady, setIsMapReady]       = useState(false)

    // Refs
    const mapRef           = useRef<google.maps.Map | null>(null)
    const markerRefs       = useRef<Map<string, google.maps.Marker>>(new Map())
    const historyMarkerRef = useRef<google.maps.Marker | null>(null)

    // Map options — JSON styles only, no mapId (mapId disables styles)
    const mapOptions = useMemo<google.maps.MapOptions>(() => ({
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: isDark ? DARK_STYLE : LIGHT_STYLE,
    }), [isDark])

    // Imperatively sync theme changes to live map
    useEffect(() => {
        if (mapRef.current) {
            mapRef.current.setOptions({ styles: isDark ? DARK_STYLE : LIGHT_STYLE })
        }
    }, [isDark])

    // ── Marker management ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!isLoaded || !isMapReady || !mapRef.current) return
        if (isHistoryMode) {
            markerRefs.current.forEach(m => m.setMap(null))
            markerRefs.current.clear()
            return
        }

        // Remove stale
        const ids = new Set(buses.map(b => b.id))
        markerRefs.current.forEach((m, id) => {
            if (!ids.has(id)) { m.setMap(null); markerRefs.current.delete(id) }
        })

        buses.forEach(bus => {
            if (bus.lat == null || bus.lng == null) return
            const effectiveStatus = bus.computed_status || bus.status
            const color   = getStatusColor(effectiveStatus)
            const heading = bus.heading || 0
            const pos     = { lat: bus.lat, lng: bus.lng }
            const isMoving = effectiveStatus === 'moving'
            const iconUrl = buildMarkerSvg(color, heading, isMoving)
            const iconSize = new google.maps.Size(64, 64)
            const iconAnchor = new google.maps.Point(32, 32)

            const existing = markerRefs.current.get(bus.id)
            if (existing) {
                existing.setPosition(pos)
                existing.setIcon({ url: iconUrl, scaledSize: iconSize, anchor: iconAnchor, labelOrigin: new google.maps.Point(32, 72) })
                existing.setLabel({
                    text: bus.internal_id,
                    color: isDark ? '#ffffff' : '#0f172a',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    className: 'bus-map-label',
                })
            } else {
                const m = new google.maps.Marker({
                    map: mapRef.current!,
                    position: pos,
                    title: bus.internal_id,
                    icon: { url: iconUrl, scaledSize: iconSize, anchor: iconAnchor, labelOrigin: new google.maps.Point(32, 72) },
                    label: {
                        text: bus.internal_id,
                        color: isDark ? '#ffffff' : '#0f172a',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        className: 'bus-map-label',
                    },
                })
                m.addListener('click', () =>
                    window.dispatchEvent(new CustomEvent('map:viewHistory', { detail: bus.id }))
                )
                markerRefs.current.set(bus.id, m)
            }
        })

        // Auto-focus when bus list changes (search/filter)
        const valid = buses.filter(b => b.lat != null && b.lng != null)
        if (valid.length > 0 && mapRef.current) {
            if (valid.length === 1) {
                mapRef.current.panTo({ lat: valid[0].lat, lng: valid[0].lng })
                if ((mapRef.current.getZoom() ?? 0) < 15) mapRef.current.setZoom(15)
            } else {
                const bounds = new google.maps.LatLngBounds()
                valid.forEach(v => bounds.extend({ lat: v.lat, lng: v.lng }))
                mapRef.current.fitBounds(bounds, 80)
            }
        }
    }, [isLoaded, isMapReady, buses, isHistoryMode, isDark])

    // ── Live Trail Fetcher ────────────────────────────────────────────────────
    useEffect(() => {
        if (!isLiveTrail || !isLoaded) { setLiveTrails(new Map()); return }

        const fetch2HrTrails = async () => {
            const token = localStorage.getItem('token')
            const date  = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
            const result = new Map<string, GPSPoint[]>()
            const subset = buses.filter(b => b.lat != null && b.lng != null).slice(0, 10)

            await Promise.all(subset.map(async bus => {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/gps/playback?bus=${bus.id}&date=${date}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                    if (res.ok) {
                        const data: GPSPoint[] = await res.json()
                        const threshold = Date.now() - 2 * 60 * 60 * 1000
                        const filtered  = data.filter(p => new Date(p.timestamp).getTime() > threshold)
                        if (filtered.length > 0) result.set(bus.id, filtered)
                    }
                } catch {}
            }))
            setLiveTrails(result)
        }

        fetch2HrTrails()
        const interval = setInterval(fetch2HrTrails, 30_000)
        return () => clearInterval(interval)
    }, [isLiveTrail, isLoaded, buses])

    // ── Playback Marker + Auto-Follow ─────────────────────────────────────────
    useEffect(() => {
        if (!isHistoryMode || !historyPoints[playbackIndex] || !mapRef.current) {
            historyMarkerRef.current?.setMap(null)
            historyMarkerRef.current = null
            return
        }

        const pt  = historyPoints[playbackIndex]
        const pos = { lat: pt.lat, lng: pt.lng }

        if (!historyMarkerRef.current) {
            historyMarkerRef.current = new google.maps.Marker({
                map: mapRef.current!,
                position: pos,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: '#3b82f6',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 3,
                    scale: 11,
                },
                zIndex: 1000
            })
        } else {
            historyMarkerRef.current.setPosition(pos)
        }
        // Auto-follow during playback
        if (isPlaying) mapRef.current.panTo(pos)
    }, [playbackIndex, isHistoryMode, historyPoints, isPlaying])

    // ── History fetching ──────────────────────────────────────────────────────
    const loadHistory = useCallback(async (busId: string, date: string) => {
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res   = await fetch(`${BACKEND_URL}/api/gps/playback?bus=${busId}&date=${date}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await res.json()
            setHistoryPoints(Array.isArray(data) ? data : [])
            setPlaybackIndex(0)
            if (Array.isArray(data) && data.length > 0 && mapRef.current) {
                const bounds = new google.maps.LatLngBounds()
                data.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
                mapRef.current.fitBounds(bounds, 50)
            }
        } catch {} finally { setIsLoading(false) }
    }, [])

    const toggleHistoryMode = useCallback((bid?: string) => {
        if (isHistoryMode && !bid) {
            setIsHistoryMode(false)
            setHistoryPoints([])
            return
        }
        const id = bid || selectedBusId || buses[0]?.id
        if (!id) return
        setSelectedBusId(id)
        setIsHistoryMode(true)
        loadHistory(id, playbackDate)
    }, [isHistoryMode, selectedBusId, buses, playbackDate, loadHistory])

    useEffect(() => {
        const h = (e: any) => toggleHistoryMode(e.detail)
        window.addEventListener('map:viewHistory', h)
        return () => window.removeEventListener('map:viewHistory', h)
    }, [toggleHistoryMode])

    // Playback timer
    useEffect(() => {
        if (!isPlaying) return
        if (playbackIndex >= historyPoints.length - 1) { setIsPlaying(false); return }
        const t = setInterval(() => setPlaybackIndex(v => v + 1), 500)
        return () => clearInterval(t)
    }, [isPlaying, playbackIndex, historyPoints])

    // Live status legend counts
    const counts = useMemo(() => ({
        moving:    buses.filter(b => (b.computed_status || b.status) === 'moving').length,
        idle:      buses.filter(b => (b.computed_status || b.status) === 'idle').length,
        no_signal: buses.filter(b => (b.computed_status || b.status) === 'no_signal').length,
        offline:   buses.filter(b => (b.computed_status || b.status) === 'offline').length,
    }), [buses])

    // ── Render ────────────────────────────────────────────────────────────────
    if (loadError) return <div className="p-8 text-red-500 text-sm font-bold">⚠️ Maps failed to load. Check API Key.</div>
    if (!isLoaded) return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-xl">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
    )

    const currentPt = historyPoints[playbackIndex]

    return (
        <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl">
            <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={MAP_CENTER}
                zoom={12}
                onLoad={m => { mapRef.current = m; setIsMapReady(true) }}
                options={mapOptions}
            >
                {/* Live Trails — blue dashed */}
                {isLiveTrail && Array.from(liveTrails.values()).map((trail, i) => (
                    <Polyline
                        key={`trail-${i}`}
                        path={trail.map(p => ({ lat: p.lat, lng: p.lng }))}
                        options={{
                            strokeColor: '#3b82f6',
                            strokeOpacity: 0,
                            icons: [{
                                icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, scale: 5, strokeWeight: 5 },
                                offset: '0', repeat: '18px'
                            }]
                        }}
                    />
                ))}

                {/* History playback line */}
                {isHistoryMode && historyPoints.length > 1 && (
                    <Polyline
                        path={historyPoints.map(p => ({ lat: p.lat, lng: p.lng }))}
                        options={{ strokeColor: '#3b82f6', strokeWeight: 3, strokeOpacity: 0.75 }}
                    />
                )}
            </GoogleMap>

            {/* Status Legend — bottom left */}
            {!isHistoryMode && (
                <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-1.5 pointer-events-none max-w-[260px]">
                    {counts.moving > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-[10px] font-bold text-white">{counts.moving} Moving</span>
                        </div>
                    )}
                    {counts.idle > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                            <span className="text-[10px] font-bold text-white">{counts.idle} Idle</span>
                        </div>
                    )}
                    {counts.no_signal > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-[10px] font-bold text-white">{counts.no_signal} No Signal</span>
                        </div>
                    )}
                    {counts.offline > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-slate-500" />
                            <span className="text-[10px] font-bold text-white">{counts.offline} Offline</span>
                        </div>
                    )}
                </div>
            )}

            {/* Map Control Buttons — stacked vertically below expand button */}
            <div className="absolute top-[68px] right-4 z-10 flex flex-col gap-2">
                <button
                    onClick={() => setIsLiveTrail(!isLiveTrail)}
                    className={`p-3 rounded-xl shadow-lg backdrop-blur-md transition-all active:scale-95 ${ isLiveTrail ? 'bg-blue-600 text-white' : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white' }`}
                    title={isLiveTrail ? 'Hide Trail' : 'Show Trail (2h)'}
                >
                    <Route size={20} className={isLiveTrail ? 'animate-pulse' : ''} />
                </button>
                <button
                    onClick={() => toggleHistoryMode()}
                    className={`p-3 rounded-xl shadow-lg backdrop-blur-md transition-all active:scale-95 ${ isHistoryMode ? 'bg-blue-600 text-white' : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white' }`}
                    title={isHistoryMode ? 'Exit History' : 'History Playback'}
                >
                    {isHistoryMode ? <X size={20} /> : <Calendar size={20} />}
                </button>
            </div>

            {/* History Controls (date + bus picker) */}
            {isHistoryMode && (
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl shadow-xl border border-white/10">
                    <Calendar size={14} className="text-blue-500 ml-2" />
                    <input
                        type="date"
                        value={playbackDate}
                        onChange={e => { setPlaybackDate(e.target.value); if (selectedBusId) loadHistory(selectedBusId, e.target.value) }}
                        className="bg-transparent text-xs font-bold border-none focus:ring-0 p-0 text-slate-800 dark:text-white cursor-pointer pr-2"
                    />
                    <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                    <select
                        value={selectedBusId || ''}
                        onChange={e => { setSelectedBusId(e.target.value); loadHistory(e.target.value, playbackDate) }}
                        className="bg-transparent text-xs font-bold border-none focus:ring-0 py-1 px-2 text-slate-800 dark:text-white cursor-pointer"
                    >
                        {buses.map(b => (
                            <option key={b.id} value={b.id}>{b.internal_id}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Playback Timeline */}
            {isHistoryMode && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[92%] max-w-[420px] z-50">
                    <div className="bg-slate-900/92 backdrop-blur-2xl p-4 rounded-3xl shadow-2xl border border-white/10 text-white flex flex-col gap-3">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-3">
                                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : historyPoints.length === 0 ? (
                            <p className="text-center text-slate-400 text-xs italic py-1">No data for this date</p>
                        ) : (
                            <>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setIsPlaying(!isPlaying)}
                                        className="p-3 bg-blue-500 hover:bg-blue-400 text-white rounded-2xl shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                                    >
                                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black text-blue-300 truncate">
                                            {currentPt ? new Date(currentPt.timestamp).toLocaleTimeString('en-IN') : '—'}
                                        </p>
                                        <p className="text-[11px] text-white/60 font-semibold">
                                            {currentPt ? `${Math.round(currentPt.speed)} km/h` : '—'}
                                        </p>
                                    </div>
                                    <div className="text-[11px] font-black bg-white/10 text-white/70 px-3 py-1.5 rounded-full">
                                        {playbackIndex + 1} <span className="opacity-40">/</span> {historyPoints.length}
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={Math.max(0, historyPoints.length - 1)}
                                    value={playbackIndex}
                                    onChange={e => setPlaybackIndex(Number(e.target.value))}
                                    className="w-full accent-blue-500 h-1.5 rounded-full cursor-pointer"
                                />
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
