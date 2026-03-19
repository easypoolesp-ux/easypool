'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, Polyline } from '@react-google-maps/api'
import { Play, Pause, X, Route, Calendar } from 'lucide-react'
import { useTheme } from 'next-themes'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Bus {
    id: string
    internal_id: string
    status: string
    lat: number
    lng: number
    plate: string
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

// ── Module-level constants (never change) ─────────────────────────────────────
const BACKEND_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    'https://easypool-backend-222076803846.asia-south1.run.app'

const MAP_CENTER = { lat: 22.5726, lng: 88.3639 } // Kolkata
const LIBRARIES: ('marker' | 'maps' | 'places')[] = ['marker'] // stable reference

// ── Marker colour helper ───────────────────────────────────────────────────────
function getBusColor(status: string): string {
    if (status === 'online' || status === 'moving') return '#22c55e'   // green
    if (status === 'idle') return '#94a3b8'                            // grey
    if (status === 'ignition_off') return '#ef4444'                    // red
    return '#1e293b'                                                    // offline / black
}

function isLive(status: string): boolean {
    return status === 'online' || status === 'moving'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FleetMap({ buses, isFullscreen, initialBusId }: Props) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    const mapId  = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

    // ── Google Maps API loader ─────────────────────────────────────────────────
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey!,
        id: 'google-map-script', // singleton — prevents duplicate loads
        libraries: LIBRARIES,
    })

    // ── Theme ──────────────────────────────────────────────────────────────────
    const { theme, systemTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const currentTheme = mounted ? (theme === 'system' ? systemTheme : theme) : 'light'

    // ── UI state ───────────────────────────────────────────────────────────────
    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [selectedBusId, setSelectedBusId] = useState<string | null>(initialBusId || null)
    const [playbackDate, setPlaybackDate] = useState(() =>
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date())
    )
    const [historyPoints, setHistoryPoints] = useState<GPSPoint[]>([])
    const [playbackIndex, setPlaybackIndex] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isSmall, setIsSmall] = useState(false)

    // ── Refs (never cause re-renders) ──────────────────────────────────────────
    const mapRef           = useRef<google.maps.Map | null>(null)
    const markerRefs       = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map())
    const historyMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
    const containerRef     = useRef<HTMLDivElement>(null)
    const hasFittedRef     = useRef(false)
    // Live snapshot of buses — updateMarkers reads this ref instead of closing
    // over the `buses` prop, so the callback never needs to be recreated.
    const busesRef = useRef<Bus[]>(buses)
    useEffect(() => { busesRef.current = buses }, [buses])

    // ── Stable mapOptions — created ONCE, never mutated via props ──────────────
    // colorScheme / backgroundColor are applied imperatively below.
    // This stops @react-google-maps/api from calling map.setOptions() on every
    // render, which was visually reloading map tiles.
    const mapOptions = useMemo<google.maps.MapOptions>(() => ({
        mapId,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
    }), [mapId]) // mapId is env var — stable for the lifetime of the app

    // ── Apply colorScheme imperatively (no map re-mount) ──────────────────────
    useEffect(() => {
        if (!mapRef.current || !mounted) return
        // @ts-ignore — colorScheme is supported but not yet in @types/google.maps
        mapRef.current.setOptions({ colorScheme: currentTheme === 'dark' ? 'DARK' : 'LIGHT' })
    }, [currentTheme, mounted])

    // ── Marker management ──────────────────────────────────────────────────────
    // Imperative: runs against the map directly. Never touches React state.
    const updateMarkers = useCallback(() => {
        if (!mapRef.current) return

        if (isHistoryMode) {
            // Hide all fleet markers while in history playback
            markerRefs.current.forEach(m => { m.map = null })
            markerRefs.current.clear()
            return
        }

        const currentBuses = busesRef.current
        const currentIds   = new Set(currentBuses.map(b => b.id))

        // Remove stale markers
        markerRefs.current.forEach((marker, id) => {
            if (!currentIds.has(id)) {
                marker.map = null
                markerRefs.current.delete(id)
            }
        })

        // Add / update markers
        currentBuses.forEach(bus => {
            if (!bus.lat || !bus.lng) return
            const position = { lat: bus.lat, lng: bus.lng }
            const existing = markerRefs.current.get(bus.id)

            if (existing) {
                // Smooth position update — no DOM rebuild
                existing.position = position
            } else {
                // Create new marker element
                const color = getBusColor(bus.status)
                const live  = isLive(bus.status)

                const el = document.createElement('div')
                el.style.cssText = 'position:relative; cursor:pointer;'
                el.innerHTML = `
                    <div style="
                        background: ${color};
                        color: white;
                        padding: 5px 12px;
                        border-radius: 20px;
                        font-size: 11px;
                        font-weight: 800;
                        letter-spacing: 0.05em;
                        border: 2.5px solid white;
                        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
                        white-space: nowrap;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    ">
                        <span style="
                            display:inline-block;
                            width:7px; height:7px;
                            background:white;
                            border-radius:50%;
                            flex-shrink:0;
                            ${live ? 'animation: ep-pulse 1.5s infinite;' : 'opacity:0.5;'}
                        "></span>
                        ${bus.internal_id}
                    </div>
                `

                const marker = new google.maps.marker.AdvancedMarkerElement({
                    map: mapRef.current!,
                    position,
                    title: bus.internal_id,
                    content: el,
                })

                marker.addListener('click', () => {
                    window.dispatchEvent(new CustomEvent('map:viewHistory', { detail: bus.id }))
                })

                markerRefs.current.set(bus.id, marker)
            }
        })

        // Fit bounds once on first data load — no pan on subsequent polls
        if (!hasFittedRef.current) {
            const valid = currentBuses.filter(b => b.lat != null && b.lng != null)
            if (valid.length > 0 && mapRef.current) {
                hasFittedRef.current = true
                if (valid.length === 1) {
                    // Single bus — just centre on it
                    mapRef.current.setCenter({ lat: valid[0].lat, lng: valid[0].lng })
                    mapRef.current.setZoom(14)
                } else {
                    const bounds = new google.maps.LatLngBounds()
                    valid.forEach(b => bounds.extend({ lat: b.lat, lng: b.lng }))
                    mapRef.current.fitBounds(bounds, 60)
                    // Cap zoom SYNCHRONOUSLY after fitBounds to avoid jarring over-zoom
                    google.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
                        if (mapRef.current && mapRef.current.getZoom()! > 14) {
                            mapRef.current.setZoom(14)
                        }
                    })
                }
            }
        }
    }, [isHistoryMode]) // only re-created when history mode changes — buses read from ref

    // ── onLoad: initialise map state imperatively, then draw markers immediately
    const onMapLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map

        // Apply correct colorScheme right after creation
        // @ts-ignore
        map.setOptions({ colorScheme: currentTheme === 'dark' ? 'DARK' : 'LIGHT' })

        // Draw cached/available bus markers immediately — no waiting for next render
        updateMarkers()
    }, [updateMarkers, currentTheme])

    const onMapUnmount = useCallback(() => {
        mapRef.current = null
        markerRefs.current.forEach(m => { m.map = null })
        markerRefs.current.clear()
        hasFittedRef.current = false
    }, [])

    // ── Re-draw markers whenever buses data changes ────────────────────────────
    useEffect(() => {
        if (!mapRef.current) return // map not ready yet; onMapLoad will call updateMarkers
        updateMarkers()
    }, [buses, updateMarkers])

    // ── History playback marker ────────────────────────────────────────────────
    useEffect(() => {
        if (!isHistoryMode || !historyPoints[playbackIndex] || !mapRef.current) {
            if (historyMarkerRef.current) {
                historyMarkerRef.current.map = null
                historyMarkerRef.current = null
            }
            return
        }

        const point    = historyPoints[playbackIndex]
        const position = { lat: point.lat, lng: point.lng }

        if (!historyMarkerRef.current) {
            const dot = document.createElement('div')
            dot.style.cssText = 'position:relative; width:24px; height:24px;'
            dot.innerHTML = `
                <div style="position:absolute;inset:0;background:rgba(59,130,246,0.25);border-radius:50%;animation:ep-ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
                <div style="position:absolute;inset:4px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 0 12px rgba(59,130,246,0.8),0 2px 8px rgba(0,0,0,0.3);"></div>
            `
            historyMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
                map: mapRef.current!, position, content: dot, zIndex: 1000,
            })
        } else {
            historyMarkerRef.current.position = position
        }
    }, [isHistoryMode, historyPoints, playbackIndex])

    // ── Container resize observer ──────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return
        const ro = new ResizeObserver(entries => {
            setIsSmall(entries[0]?.contentRect.width < 500)
        })
        ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [])

    // ── History loading ────────────────────────────────────────────────────────
    const loadHistory = useCallback(async (busId: string, date: string) => {
        if (!busId) return
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res   = await fetch(
                `${BACKEND_URL}/api/gps/playback?bus=${busId}&date=${date}`,
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (!res.ok) { setHistoryPoints([]); return }
            const data: GPSPoint[] = await res.json()
            setHistoryPoints(data)
            setPlaybackIndex(0)
            if (data.length > 0 && mapRef.current) {
                const bounds = new google.maps.LatLngBounds()
                data.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
                mapRef.current.fitBounds(bounds, 40)
                google.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
                    if (mapRef.current && mapRef.current.getZoom()! > 16) {
                        mapRef.current.setZoom(16)
                    }
                })
            }
        } catch (e) { console.error(e) }
        finally { setIsLoading(false) }
    }, [])

    const toggleHistoryMode = useCallback(async (busIdOverride?: string) => {
        if (isHistoryMode && !busIdOverride) {
            setIsHistoryMode(false)
            setHistoryPoints([])
            return
        }
        const busId = busIdOverride || selectedBusId || (busesRef.current[0]?.id ?? null)
        if (!busId) return
        setSelectedBusId(busId)
        setIsHistoryMode(true)
        loadHistory(busId, playbackDate)
    }, [isHistoryMode, selectedBusId, playbackDate, loadHistory])

    useEffect(() => {
        const handler = (e: any) => toggleHistoryMode(e.detail)
        window.addEventListener('map:viewHistory', handler)
        return () => window.removeEventListener('map:viewHistory', handler)
    }, [toggleHistoryMode])

    // ── Playback timer ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isPlaying) return
        if (playbackIndex >= historyPoints.length - 1) { setIsPlaying(false); return }
        const timer = setInterval(() => setPlaybackIndex(p => p + 1), 500)
        return () => clearInterval(timer)
    }, [isPlaying, playbackIndex, historyPoints.length])

    // ── Render ─────────────────────────────────────────────────────────────────
    if (loadError) return (
        <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl text-red-400 p-8 text-center font-bold">
            ⚠️ Maps API Error — check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY build arg.
        </div>
    )
    if (!isLoaded) return (
        <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
    )

    return (
        <div ref={containerRef} className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={MAP_CENTER}
                zoom={12}
                options={mapOptions}
                onLoad={onMapLoad}
                onUnmount={onMapUnmount}
            >
                {isHistoryMode && historyPoints.length > 1 && (
                    <Polyline
                        path={historyPoints.map(p => ({ lat: p.lat, lng: p.lng }))}
                        options={{
                            strokeColor: '#60a5fa',
                            strokeOpacity: 0,
                            strokeWeight: 0,
                            icons: [{
                                icon: {
                                    path: 'M 0,-1 0,1',
                                    strokeOpacity: 0.9,
                                    strokeColor: '#60a5fa',
                                    strokeWeight: 4,
                                    scale: 5,
                                },
                                offset: '0',
                                repeat: '20px',
                            }],
                        }}
                    />
                )}
            </GoogleMap>

            {/* Top Controls Overlay */}
            <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
                {isHistoryMode && (
                    <div className="pointer-events-auto flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl shadow-xl border border-white/10">
                        <div className="px-3 py-1.5 flex items-center gap-2 border-r border-slate-200 dark:border-slate-800">
                            <Calendar size={14} className="text-blue-500" />
                            <input
                                type="date"
                                value={playbackDate}
                                onChange={e => {
                                    setPlaybackDate(e.target.value)
                                    if (selectedBusId) loadHistory(selectedBusId, e.target.value)
                                }}
                                className="bg-transparent text-xs font-bold border-none focus:ring-0 p-0 text-slate-800 dark:text-white cursor-pointer"
                            />
                        </div>
                        <select
                            value={selectedBusId || ''}
                            onChange={e => {
                                setSelectedBusId(e.target.value)
                                loadHistory(e.target.value, playbackDate)
                            }}
                            className="bg-white dark:bg-slate-800 text-xs font-bold border-none focus:ring-0 py-1.5 pl-2 pr-8 text-slate-800 dark:text-white cursor-pointer rounded-lg"
                        >
                            {buses.map(b => (
                                <option key={b.id} value={b.id} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">
                                    {b.internal_id}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="ml-auto pointer-events-auto">
                    <button
                        onClick={() => toggleHistoryMode()}
                        className={`p-3 rounded-xl shadow-2xl backdrop-blur-md transition-all active:scale-95 ${
                            isHistoryMode
                                ? 'bg-blue-600 text-white'
                                : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white'
                        }`}
                    >
                        {isHistoryMode ? <X size={20} /> : <Route size={20} />}
                    </button>
                </div>
            </div>

            {/* History Playback Panel */}
            {isHistoryMode && (
                <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] ${isSmall ? 'w-full px-4' : 'w-[90%] max-w-md'}`}>
                    <div className="bg-slate-900/80 dark:bg-slate-900/95 backdrop-blur-2xl p-4 rounded-3xl shadow-2xl flex flex-col gap-3 border border-white/10">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : historyPoints.length === 0 ? (
                            <p className="text-center text-slate-400 text-xs py-2 italic">No data for this date</p>
                        ) : (
                            <>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => setIsPlaying(!isPlaying)}
                                            className="p-3 bg-blue-500 text-white rounded-2xl hover:bg-blue-400 shadow-lg shadow-blue-500/30"
                                        >
                                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                        </button>
                                        <div>
                                            <p className="text-xs text-blue-300 font-black tracking-widest">
                                                {historyPoints[playbackIndex]?.timestamp
                                                    ? new Date(historyPoints[playbackIndex].timestamp).toLocaleTimeString()
                                                    : '—'}
                                            </p>
                                            <p className="text-[10px] text-slate-200 font-bold uppercase tracking-tighter">
                                                {historyPoints[playbackIndex]?.speed || 0} KM / H
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-[11px] font-black bg-white/10 text-white px-4 py-1.5 rounded-full border border-white/5">
                                        {playbackIndex + 1} <span className="text-white/30 px-1">/</span> {historyPoints.length}
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max={Math.max(0, historyPoints.length - 1)}
                                    value={playbackIndex}
                                    onChange={e => setPlaybackIndex(parseInt(e.target.value))}
                                    className="w-full accent-blue-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                                />
                            </>
                        )}
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes ep-pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.6); opacity: 0.6; }
                }
                @keyframes ep-ping {
                    75%, 100% { transform: scale(2); opacity: 0; }
                }
            `}</style>
        </div>
    )
}
