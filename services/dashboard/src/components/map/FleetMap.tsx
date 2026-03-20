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
    route?: string
    speed?: number      // Added speed
    heading?: number    // Added heading
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
const BACKEND_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    'https://easypool-backend-222076803846.asia-south1.run.app'

const MAP_CENTER  = { lat: 22.5726, lng: 88.3639 }
const LIBRARIES: ('marker' | 'maps' | 'places')[] = ['marker']

// ── Google Maps dark/light JSON styles (no Cloud Map ID needed) ───────────────
const DARK_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry',        stylers: [{ color: '#1a1a2e' }] },
    { elementType: 'labels.text.fill',stylers: [{ color: '#8ec3b9' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3c4d' }] },
    { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
    { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#64779e' }] },
    { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
    { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#334e87' }] },
    { featureType: 'landscape.natural',  elementType: 'geometry',       stylers: [{ color: '#023e58' }] },
    { featureType: 'poi',                elementType: 'geometry',       stylers: [{ color: '#283d6a' }] },
    { featureType: 'poi',                elementType: 'labels.text.fill', stylers: [{ color: '#6f9ba4' }] },
    { featureType: 'poi',                elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
    { featureType: 'poi.park',           elementType: 'geometry.fill',  stylers: [{ color: '#023e58' }] },
    { featureType: 'poi.park',           elementType: 'labels.text.fill',stylers: [{ color: '#3C7680' }] },
    { featureType: 'road',               elementType: 'geometry',       stylers: [{ color: '#304a7d' }] },
    { featureType: 'road',               elementType: 'labels.text.fill',stylers: [{ color: '#98a5be' }] },
    { featureType: 'road',               elementType: 'labels.text.stroke',stylers:[{ color: '#1d2c4d' }] },
    { featureType: 'road.highway',       elementType: 'geometry',       stylers: [{ color: '#2c6675' }] },
    { featureType: 'road.highway',       elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
    { featureType: 'road.highway',       elementType: 'labels.text.fill',stylers: [{ color: '#b0d5ce' }] },
    { featureType: 'road.highway',       elementType: 'labels.text.stroke',stylers:[{ color: '#023747' }] },
    { featureType: 'transit',            elementType: 'labels.text.fill',stylers: [{ color: '#98a5be' }] },
    { featureType: 'transit',            elementType: 'labels.text.stroke',stylers:[{ color: '#1d2c4d' }] },
    { featureType: 'transit.line',       elementType: 'geometry.fill',  stylers: [{ color: '#283d6a' }] },
    { featureType: 'transit.station',    elementType: 'geometry',       stylers: [{ color: '#3a4762' }] },
    { featureType: 'water',              elementType: 'geometry',       stylers: [{ color: '#0e1626' }] },
    { featureType: 'water',              elementType: 'labels.text.fill',stylers: [{ color: '#4e6d70' }] },
]
const LIGHT_STYLE: google.maps.MapTypeStyle[] = [] // default Google Maps

// ── Marker colour helper ──────────────────────────────────────────────────────
function getBusColor(status: string): string {
    if (status === 'online' || status === 'moving') return '#22c55e'
    if (status === 'idle') return '#94a3b8'
    if (status === 'ignition_off') return '#ef4444'
    return '#1e293b'
}

function isLive(status: string): boolean {
    return status === 'online' || status === 'moving'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FleetMap({ buses, isFullscreen, initialBusId }: Props) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey!,
        id: 'google-map-script',
        libraries: LIBRARIES,
    })

    // ── Theme ─────────────────────────────────────────────────────────────────
    const { theme, systemTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const currentTheme = mounted ? (theme === 'system' ? systemTheme : theme) : 'light'
    const isDark = currentTheme === 'dark'

    // ── UI state ──────────────────────────────────────────────────────────────
    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [isLiveTrail, setIsLiveTrail]     = useState(false) // Added Live Trail toggle
    const [isMapReady, setIsMapReady]       = useState(false)
    const [selectedBusId, setSelectedBusId] = useState<string | null>(initialBusId || null)
    const [playbackDate, setPlaybackDate]   = useState(() =>
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date())
    )
    const [historyPoints, setHistoryPoints] = useState<GPSPoint[]>([])
    const [playbackIndex, setPlaybackIndex] = useState(0)
    const [isPlaying, setIsPlaying]         = useState(false)
    const [isLoading, setIsLoading]         = useState(false)
    const [isSmall, setIsSmall]             = useState(false)

    // ── Refs ──────────────────────────────────────────────────────────────────
    const mapRef           = useRef<google.maps.Map | null>(null)
    const markerRefs       = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map())
    const historyMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
    const containerRef     = useRef<HTMLDivElement>(null)
    const hasFittedRef     = useRef(false)
    const busesRef         = useRef<Bus[]>(buses)
    useEffect(() => { busesRef.current = buses }, [buses])

    // ── Map options (stable reference — no mapId needed for JSON styles) ───────
    const mapOptions = useMemo<google.maps.MapOptions>(() => ({
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapId: 'b0c049e7fb978545fe9416bf', // User provided Map ID
        // Styles are applied imperatively to react to dashboard theme toggle
    }), [])

    // ── Apply JSON style imperatively when theme changes ──────────────────────
    useEffect(() => {
        if (!mapRef.current || !isMapReady) return
        mapRef.current.setOptions({ styles: isDark ? DARK_STYLE : LIGHT_STYLE })
    }, [isDark, isMapReady])

    // ── Marker management ─────────────────────────────────────────────────────
    const updateMarkers = useCallback(() => {
        if (!mapRef.current) return

        if (isHistoryMode) {
            markerRefs.current.forEach(m => { m.map = null })
            markerRefs.current.clear()
            return
        }

        const currentBuses = busesRef.current
        const currentIds   = new Set(currentBuses.map(b => b.id))

        // Remove stale
        markerRefs.current.forEach((marker, id) => {
            if (!currentIds.has(id)) { marker.map = null; markerRefs.current.delete(id) }
        })

        // Add / update
        currentBuses.forEach(bus => {
            if (!bus.lat || !bus.lng) return
            const position = { lat: bus.lat, lng: bus.lng }
            const existing = markerRefs.current.get(bus.id)

            if (existing) {
                existing.position = position
                // Update rotation if heading exists
                const content = existing.content as HTMLElement
                const busIcon = content.querySelector('.bus-icon-container') as HTMLElement
                if (busIcon && bus.heading != null) {
                    busIcon.style.transform = `rotate(${bus.heading}deg)`
                }
                const speedLabel = content.querySelector('.speed-label') as HTMLElement
                if (speedLabel) {
                    speedLabel.textContent = bus.speed ? `${Math.round(bus.speed)} km/h` : ''
                }
            } else {
                const color = getBusColor(bus.status)
                const live  = isLive(bus.status)
                const SIZE  = 36

                const el = document.createElement('div')
                el.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;width:${SIZE}px;`

                el.innerHTML = `
                    <div class="bus-icon-container" style="position:relative;width:${SIZE}px;height:${SIZE}px;transition:transform 0.5s ease;${bus.heading ? `transform:rotate(${bus.heading}deg);` : ''}">
                        ${live ? `
                        <div style="
                            position:absolute;inset:-5px;border-radius:50%;
                            border:2.5px solid ${color};opacity:0.35;
                            animation:ep-ring 2s ease-out infinite;
                        "></div>
                        <div style="
                            position:absolute;inset:-10px;border-radius:50%;
                            border:2px solid ${color};opacity:0.15;
                            animation:ep-ring 2s ease-out infinite 0.4s;
                        "></div>` : ''}
                        <div style="
                            position:absolute;inset:0;background:${color};border-radius:50%;
                            border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.4);
                            display:flex;align-items:center;justify-content:center;
                        ">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4 16c0 1.1.9 2 2 2h1v1a1 1 0 0 0 2 0v-1h6v1a1 1 0 0 0 2 0v-1h1c1.1 0 2-.9 2-2V8c0-2.2-1.79-4-4-4H8C5.79 4 4 5.8 4 8v8zm3.5-1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM8 6h8l1.5 4H6.5L8 6z"/>
                            </svg>
                        </div>
                        ${bus.speed && bus.speed > 5 ? `
                        <div class="speed-label" style="
                            position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);
                            background:white;color:${color};font-[9px];font-weight:900;
                            padding:0 4px;border-radius:4px;border:1px solid ${color};
                            white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.1);
                        ">${Math.round(bus.speed)} km/h</div>
                        ` : ''}
                    </div>
                    <div style="
                        display:flex;align-items:center;gap:4px;
                        background:rgba(0,0,0,0.75);color:white;
                        font-size:9px;font-weight:800;padding:2px 7px;
                        border-radius:10px;white-space:nowrap;letter-spacing:0.04em;
                        backdrop-filter:blur(4px);
                    ">
                        <div style="width:5px;height:5px;border-radius:50%;background:${color};${live ? 'animation:ep-dot 1.5s ease-in-out infinite;' : ''}"></div>
                        ${bus.internal_id}
                    </div>
                `

                const marker = new google.maps.marker.AdvancedMarkerElement({
                    map: mapRef.current!, position, title: `${bus.internal_id}`, content: el,
                })
                marker.addListener('gmp-click', () => window.dispatchEvent(new CustomEvent('map:viewHistory', { detail: bus.id })))
                markerRefs.current.set(bus.id, marker)
            }
        })

        // Fit bounds once on first load
        if (!hasFittedRef.current) {
            const valid = currentBuses.filter(b => b.lat != null && b.lng != null)
            if (valid.length > 0 && mapRef.current) {
                hasFittedRef.current = true
                if (valid.length === 1) {
                    mapRef.current.setCenter({ lat: valid[0].lat, lng: valid[0].lng })
                    mapRef.current.setZoom(14)
                } else {
                    const bounds = new google.maps.LatLngBounds()
                    valid.forEach(b => bounds.extend({ lat: b.lat, lng: b.lng }))
                    mapRef.current.fitBounds(bounds, 60)
                    google.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
                        if (mapRef.current && mapRef.current.getZoom()! > 14) mapRef.current.setZoom(14)
                    })
                }
            }
        }
    }, [isHistoryMode])

    const onMapLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map
        // Apply style immediately on load
        map.setOptions({ styles: isDark ? DARK_STYLE : LIGHT_STYLE })
        setIsMapReady(true)
        updateMarkers()
    }, [updateMarkers, isDark])

    const onMapUnmount = useCallback(() => {
        mapRef.current = null
        markerRefs.current.forEach(m => { m.map = null })
        markerRefs.current.clear()
        hasFittedRef.current = false
    }, [])

    useEffect(() => {
        if (!mapRef.current) return
        updateMarkers()
    }, [buses, updateMarkers])

    // ── History playback marker — blue pulse (Google "you are here" style) ────
    useEffect(() => {
        if (!isHistoryMode || !historyPoints[playbackIndex] || !mapRef.current) {
            if (historyMarkerRef.current) { historyMarkerRef.current.map = null; historyMarkerRef.current = null }
            return
        }

        const point    = historyPoints[playbackIndex]
        const position = { lat: point.lat, lng: point.lng }

        if (!historyMarkerRef.current) {
            const dot = document.createElement('div')
            dot.style.cssText = 'position:relative;width:28px;height:28px;'
            dot.innerHTML = `
                <div style="position:absolute;inset:0;background:rgba(59,130,246,0.2);border-radius:50%;animation:ep-ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
                <div style="position:absolute;inset:3px;background:rgba(59,130,246,0.15);border-radius:50%;animation:ep-ping 1.5s cubic-bezier(0,0,0.2,1) infinite 0.3s;"></div>
                <div style="position:absolute;inset:7px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 0 14px rgba(59,130,246,0.9),0 2px 8px rgba(0,0,0,0.3);"></div>
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
        const ro = new ResizeObserver(entries => setIsSmall(entries[0]?.contentRect.width < 500))
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
                    if (mapRef.current && mapRef.current.getZoom()! > 16) mapRef.current.setZoom(16)
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

    // ── Live stats for legend ──────────────────────────────────────────────────
    const liveCounts = useMemo(() => ({
        moving:       buses.filter(b => b.status === 'moving' || b.status === 'online').length,
        idle:         buses.filter(b => b.status === 'idle').length,
        ignition_off: buses.filter(b => b.status === 'ignition_off').length,
        offline:      buses.filter(b => b.status === 'offline').length,
    }), [buses])

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

    const currentPoint = historyPoints[playbackIndex]

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
                                icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#60a5fa', strokeWeight: 4, scale: 5 },
                                offset: '0', repeat: '20px',
                            }],
                        }}
                    />
                )}
            </GoogleMap>

            {/* Live legend — bottom-left */}
            {!isHistoryMode && (
                <div className="absolute bottom-4 left-4 z-10 flex gap-1.5 pointer-events-none">
                    {liveCounts.moving > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-[10px] font-bold text-white">{liveCounts.moving} Moving</span>
                        </div>
                    )}
                    {liveCounts.idle > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-slate-400" />
                            <span className="text-[10px] font-bold text-white">{liveCounts.idle} Idle</span>
                        </div>
                    )}
                    {liveCounts.ignition_off > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-[10px] font-bold text-white">{liveCounts.ignition_off} Off</span>
                        </div>
                    )}
                    {liveCounts.offline > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-slate-800" style={{border:'1px solid #475569'}} />
                            <span className="text-[10px] font-bold text-white">{liveCounts.offline} Offline</span>
                        </div>
                    )}
                </div>
            )}

            {/* Top Controls — shifted left to avoid the Fullscreen/Expand button at right-[60px] */}
            <div className="absolute top-4 left-4 right-[110px] flex justify-between pointer-events-none">
                {isHistoryMode && (
                    <div className="pointer-events-auto flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl shadow-xl border border-white/10">
                        <div className="px-3 py-1.5 flex items-center gap-2 border-r border-slate-200 dark:border-slate-800">
                            <Calendar size={14} className="text-blue-500" />
                            <input
                                type="date"
                                value={playbackDate}
                                onChange={e => { setPlaybackDate(e.target.value); if (selectedBusId) loadHistory(selectedBusId, e.target.value) }}
                                className="bg-transparent text-xs font-bold border-none focus:ring-0 p-0 text-slate-800 dark:text-white cursor-pointer"
                            />
                        </div>
                        <select
                            value={selectedBusId || ''}
                            onChange={e => { setSelectedBusId(e.target.value); loadHistory(e.target.value, playbackDate) }}
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

                <div className="ml-auto pointer-events-auto flex gap-2">
                    <button
                        onClick={() => setIsLiveTrail(!isLiveTrail)}
                        className={`p-3 rounded-xl shadow-2xl backdrop-blur-md transition-all active:scale-95 ${
                            isLiveTrail
                                ? 'bg-green-600 text-white'
                                : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white'
                        }`}
                        title={isLiveTrail ? 'Hide Live Trail' : 'Show Live Trail (2h)'}
                    >
                        <Route size={20} className={isLiveTrail ? 'animate-pulse' : ''} />
                    </button>
                    <button
                        onClick={() => toggleHistoryMode()}
                        className={`p-3 rounded-xl shadow-2xl backdrop-blur-md transition-all active:scale-95 ${
                            isHistoryMode
                                ? 'bg-blue-600 text-white'
                                : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white'
                        }`}
                        title={isHistoryMode ? 'Exit History' : 'View Route History'}
                    >
                        {isHistoryMode ? <X size={20} /> : <Calendar size={20} />}
                    </button>
                </div>
            </div>

            {/* History Playback Panel */}
            {isHistoryMode && (
                <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] ${isSmall ? 'w-full px-4' : 'w-[90%] max-w-md'}`}>
                    <div className="bg-slate-900/85 dark:bg-slate-900/95 backdrop-blur-2xl p-4 rounded-3xl shadow-2xl flex flex-col gap-3 border border-white/10">
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
                                            className="p-3 bg-blue-500 text-white rounded-2xl hover:bg-blue-400 shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                                        >
                                            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                        </button>
                                        <div>
                                            <p className="text-xs text-blue-300 font-black tracking-widest">
                                                {currentPoint?.timestamp
                                                    ? new Date(currentPoint.timestamp).toLocaleTimeString()
                                                    : '—'}
                                            </p>
                                            <p className="text-[10px] text-slate-200 font-bold uppercase tracking-tighter">
                                                {currentPoint?.speed || 0} KM / H
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
                @keyframes ep-ring {
                    0%   { transform: scale(1);   opacity: 0.5; }
                    70%  { transform: scale(1.7); opacity: 0; }
                    100% { transform: scale(1.7); opacity: 0; }
                }
                @keyframes ep-ping {
                    75%, 100% { transform: scale(2.2); opacity: 0; }
                }
                @keyframes ep-dot {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.4; }
                }
            `}</style>
        </div>
    )
}
