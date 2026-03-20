'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { GoogleMap, useJsApiLoader, Polyline } from '@react-google-maps/api'
import { Play, Pause, X, Route, Calendar, Crosshair, Maximize, Unlock } from 'lucide-react'
import { useTheme } from 'next-themes'
import { MONOCHROME_DARK, MONOCHROME_LIGHT, DARK_DEFAULT } from './mapStyles'
import { useMapHighContrastListener } from '@/hooks/useMapHighContrast'
import { getStatusColor, getStatusConfig, FLEET_STATUSES } from '@/constants/fleetStatus'

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

// ── Map styles moved to mapStyles.ts (single-responsibility) ─────────────────

// ── Status helpers: imported from @/constants/fleetStatus ─────────────────────

/**
 * Google Maps-style premium fleet marker:
 * - Solid colored circle with crisp white border
 * - Heading Beam: Soft radial gradient cone (only when moving)
 */
function buildMarkerSvg(color: string, heading: number, isMoving: boolean): string {
    const beamId = `beam-${color.replace('#','')}`
    const svg = `<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${beamId}" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.4" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${isMoving ? `
      <!-- Soft heading beam (FOV) -->
      <g transform="rotate(${heading}, 40, 40)">
        <path d="M40,40 L16,4 A36,36 0 0,1 64,4 Z" fill="url(#${beamId})"/>
      </g>` : ''}
      <!-- Main Marker -->
      <circle cx="40" cy="40" r="14" fill="${color}" stroke="white" stroke-width="3"/>
      <!-- Inner core highlight -->
      <circle cx="40" cy="40" r="5" fill="white" opacity="0.9"/>
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

    // Theme + monochrome map setting
    const { theme, systemTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const isDark = mounted ? (theme === 'system' ? systemTheme : theme) === 'dark' : false
    const highContrast = useMapHighContrastListener()

    // State
    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [liveTrailMode, setLiveTrailMode] = useState<'off' | '2h' | 'today'>('off')
    const [liveTrails, setLiveTrails]       = useState<Map<string, GPSPoint[]>>(new Map())
    const [selectedBusId, setSelectedBusId] = useState<string | null>(initialBusId || null)
    const [cameraMode, setCameraMode] = useState<'free' | 'follow' | 'overview'>('free')
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
    const markerStateRefs  = useRef<Map<string, string>>(new Map()) // Hash of lat,lng,status,heading
    const historyMarkerRef = useRef<google.maps.Marker | null>(null)

    // Map options — JSON styles only, no mapId (mapId disables styles)
    const mapOptions = useMemo<google.maps.MapOptions>(() => ({
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: highContrast
            ? (isDark ? MONOCHROME_DARK : MONOCHROME_LIGHT)
            : (isDark ? DARK_DEFAULT : []),
    }), [isDark, highContrast])

    // Imperatively sync theme + high-contrast changes to live map
    useEffect(() => {
        if (mapRef.current) {
            mapRef.current.setOptions({
                styles: highContrast
            ? (isDark ? MONOCHROME_DARK : MONOCHROME_LIGHT)
            : (isDark ? DARK_DEFAULT : [])
            })
        }
    }, [isDark, highContrast])

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
            if (!ids.has(id)) { 
                m.setMap(null)
                markerRefs.current.delete(id) 
                markerStateRefs.current.delete(id)
            }
        })

        buses.forEach(bus => {
            if (bus.lat == null || bus.lng == null) return
            const effectiveStatus = bus.computed_status || bus.status
            const color   = getStatusColor(effectiveStatus)
            const heading = bus.heading || 0
            const pos     = { lat: bus.lat, lng: bus.lng }
            const isMoving = effectiveStatus === 'moving'

            // Generate a state hash to skip redundant Google Maps DOM/Canvas updates
            const stateHash = `${bus.lat},${bus.lng},${effectiveStatus},${heading},${isDark}`
            if (markerStateRefs.current.get(bus.id) === stateHash) return
            markerStateRefs.current.set(bus.id, stateHash)

            const iconUrl = buildMarkerSvg(color, heading, isMoving)
            const iconSize = new google.maps.Size(80, 80)
            const iconAnchor = new google.maps.Point(40, 40)

            const existing = markerRefs.current.get(bus.id)
            if (existing) {
                existing.setPosition(pos)
                existing.setIcon({ url: iconUrl, scaledSize: iconSize, anchor: iconAnchor, labelOrigin: new google.maps.Point(40, 72) })
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
                    icon: { url: iconUrl, scaledSize: iconSize, anchor: iconAnchor, labelOrigin: new google.maps.Point(40, 72) },
                    label: {
                        text: bus.internal_id,
                        color: isDark ? '#ffffff' : '#0f172a',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        className: 'bus-map-label',
                    },
                })
                m.addListener('click', () => {
                    setSelectedBusId(bus.id)
                    setCameraMode('follow')
                })
                markerRefs.current.set(bus.id, m)
            }
        })

        // Camera Mode Logic
        if (mapRef.current && !isHistoryMode) {
            if (cameraMode === 'follow' && selectedBusId) {
                // Follow: pan to the selected bus
                const target = buses.find(b => b.id === selectedBusId)
                if (target && target.lat != null && target.lng != null) {
                    mapRef.current.panTo({ lat: target.lat, lng: target.lng })
                    if ((mapRef.current.getZoom() ?? 0) < 15) mapRef.current.setZoom(15)
                }
            } else if (cameraMode === 'overview') {
                // Overview: fit all visible buses, then snap back to free
                const valid = buses.filter(b => b.lat != null && b.lng != null)
                if (valid.length > 0) {
                    const bounds = new google.maps.LatLngBounds()
                    valid.forEach(v => bounds.extend({ lat: v.lat, lng: v.lng }))
                    mapRef.current.fitBounds(bounds, 80)
                }
                setCameraMode('free')
            }
            // cameraMode === 'free' → do nothing, let user explore
        }
    }, [isLoaded, isMapReady, buses, isHistoryMode, isDark, cameraMode, selectedBusId])

    // ── Live Trail Fetcher ────────────────────────────────────────────────────
    useEffect(() => {
        if (liveTrailMode === 'off' || !isLoaded) { setLiveTrails(new Map()); return }

        const fetchLiveTrails = async () => {
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
                        let data: GPSPoint[] = await res.json()
                        // If only 2h mode, filter by threshold
                        if (liveTrailMode === '2h') {
                            const threshold = Date.now() - 2 * 60 * 60 * 1000
                            data = data.filter(p => new Date(p.timestamp).getTime() > threshold)
                        }
                        if (data.length > 0) result.set(bus.id, data)
                    }
                } catch {}
            }))
            setLiveTrails(result)
        }

        fetchLiveTrails()
        const interval = setInterval(fetchLiveTrails, 30_000)
        return () => clearInterval(interval)
    }, [isLoaded, liveTrailMode, buses])

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
        // Auto-follow during playback if user has selected the target mode
        if (isPlaying && cameraMode === 'follow') mapRef.current.panTo(pos)
    }, [playbackIndex, isHistoryMode, historyPoints, isPlaying, cameraMode])

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

    // Select + Follow bus (from sidebar/alert clicks)
    useEffect(() => {
        const h = (e: any) => {
            setSelectedBusId(e.detail)
            setCameraMode('follow')
        }
        window.addEventListener('map:focusBus', h)
        return () => window.removeEventListener('map:focusBus', h)
    }, [])

    // Enter history mode (from dedicated history button or sidebar)
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
        stopped:   buses.filter(b => (b.computed_status || b.status) === 'stopped').length,
        no_signal: buses.filter(b => (b.computed_status || b.status) === 'no_signal').length,
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
                {liveTrailMode !== 'off' && Array.from(liveTrails.values()).map((trail, i) => (
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


            {/* Map Control Buttons — stacked vertically below expand button */}
            <div className="absolute top-[68px] right-4 z-10 flex flex-col gap-2">
                <button
                    onClick={() => {
                        if (cameraMode === 'free') setCameraMode(selectedBusId ? 'follow' : 'overview')
                        else if (cameraMode === 'follow') setCameraMode('overview')
                        else setCameraMode('free')
                    }}
                    className={`p-3 relative rounded-xl shadow-lg backdrop-blur-md transition-all active:scale-95 ${
                        cameraMode !== 'free'
                            ? 'bg-blue-600 text-white shadow-blue-500/20'
                            : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white'
                    }`}
                    title={cameraMode === 'free' ? 'Free Browse' : cameraMode === 'follow' ? 'Following Bus' : 'Fit All'}
                >
                    {cameraMode === 'free' && <Unlock size={20} />}
                    {cameraMode === 'follow' && <Crosshair size={20} className="animate-pulse" />}
                    {cameraMode === 'overview' && <Maximize size={20} />}
                    {cameraMode !== 'free' && (
                        <span className="absolute -bottom-1 -right-1 bg-white text-blue-600 text-[7px] font-bold px-1 rounded-sm shadow-sm border border-blue-100">
                            {cameraMode === 'follow' ? 'LOCK' : 'ALL'}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => {
                        if (liveTrailMode === 'off') setLiveTrailMode('2h')
                        else if (liveTrailMode === '2h') setLiveTrailMode('today')
                        else setLiveTrailMode('off')
                    }}
                    className={`p-3 relative rounded-xl shadow-lg backdrop-blur-md transition-all active:scale-95 ${ liveTrailMode !== 'off' ? 'bg-blue-600 text-white shadow-blue-500/20' : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white' }`}
                    title={`Live Trail: ${liveTrailMode === 'off' ? 'Off' : liveTrailMode === '2h' ? 'Last 2 Hours' : 'Today (Full)'}`}
                >
                    <Route size={20} className={liveTrailMode !== 'off' ? 'animate-pulse' : ''} />
                    {liveTrailMode !== 'off' && (
                        <span className="absolute -bottom-1 -right-1 bg-white text-blue-600 text-[8px] font-bold px-1 rounded-sm shadow-sm border border-blue-100">
                            {liveTrailMode === '2h' ? '2H' : 'DAY'}
                        </span>
                    )}
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

            {/* Global override for Google Maps native InfoWindow Close button visibility in dark mode */}
            <style dangerouslySetInnerHTML={{ __html: `
                .gm-ui-hover-effect {
                    background: #ffffffdd !important;
                    border-radius: 50% !important;
                    margin: 8px !important;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
                    padding: 4px !important;
                    display: block !important;
                    width: 32px !important;
                    height: 32px !important;
                    transition: all 0.2s !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                }
                .gm-ui-hover-effect:hover {
                    background: #ffffffff !important;
                    transform: scale(1.1);
                }
                .gm-ui-hover-effect img, .gm-ui-hover-effect svg {
                    filter: brightness(0) !important;
                    width: 14px !important;
                    height: 14px !important;
                }
            `}} />

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
