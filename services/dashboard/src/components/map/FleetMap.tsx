'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
    GoogleMap,
    useJsApiLoader,
    Marker,
    Polyline,
    InfoWindow,
} from '@react-google-maps/api'
import { History, Play, Pause, X, Route } from 'lucide-react'
import { useTheme } from 'next-themes'

// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Constants ─────────────────────────────────────────────────────────────────
const BACKEND_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    'https://easypool-backend-222076803846.asia-south1.run.app'

const MAP_CENTER = { lat: 22.5726, lng: 88.3639 } // Kolkata

// Premium light-style Google Maps styling (standard but cleaner)
const MAP_STYLES_LIGHT: google.maps.MapTypeStyle[] = [
    {
        featureType: 'administrative.land_parcel',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }],
    },
    {
        featureType: 'poi',
        elementType: 'labels.text',
        stylers: [{ visibility: 'off' }],
    },
    {
        featureType: 'poi.business',
        stylers: [{ visibility: 'off' }],
    },
    {
        featureType: 'road',
        elementType: 'labels.icon',
        stylers: [{ visibility: 'off' }],
    },
    {
        featureType: 'road.local',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }],
    },
    {
        featureType: 'transit',
        stylers: [{ visibility: 'off' }],
    },
]

// Premium dark-style Google Maps styling
const MAP_STYLES_DARK: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8a9bb5' }] },
    {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#aab4c8' }],
    },
    {
        featureType: 'poi',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#6b7a9a' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{ color: '#1e2b3c' }],
    },
    {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ color: '#2d3a50' }],
    },
    {
        featureType: 'road',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#1a2333' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [{ color: '#3a4d6b' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#1a2a40' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#aab4c8' }],
    },
    {
        featureType: 'transit',
        elementType: 'geometry',
        stylers: [{ color: '#1e2b3c' }],
    },
    {
        featureType: 'transit.station',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#6b7a9a' }],
    },
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#0f1724' }],
    },
    {
        featureType: 'water',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#3a5070' }],
    },
]

// Bus marker SVG icon (blue pin)
const BUS_ICON_SVG = (color = '#2563eb') => ({
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
    scale: 1.8,
    anchor: new window.google.maps.Point(12, 22),
})

// Playback dot icon
const DOT_ICON = () => ({
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: '#2563eb',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
})

// Kolkata today's date helper
const getKolkataDate = () =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date())

// ── Component ─────────────────────────────────────────────────────────────────
export default function FleetMap({ buses, isFullscreen, initialBusId }: Props) {
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        id: 'google-map-script',
    })

    const { theme } = useTheme()
    const mapRef = useRef<google.maps.Map | null>(null)

    // History Mode State
    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [selectedBusId, setSelectedBusId] = useState<string | null>(
        initialBusId || null
    )
    const [playbackDate, setPlaybackDate] = useState(getKolkataDate)
    const [historyPoints, setHistoryPoints] = useState<GPSPoint[]>([])
    const [playbackIndex, setPlaybackIndex] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [activePopupBusId, setActivePopupBusId] = useState<string | null>(null)
    const [isSmall, setIsSmall] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const currentMapStyles = theme === 'dark' ? MAP_STYLES_DARK : MAP_STYLES_LIGHT

    // Detect small container for adaptive UI
    useEffect(() => {
        if (!containerRef.current) return
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setIsSmall(entry.contentRect.width < 500)
            }
        })
        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    // Sync initialBusId
    useEffect(() => {
        if (initialBusId && !isHistoryMode) {
            setSelectedBusId(initialBusId)
        }
    }, [initialBusId])

    // Invalidate map size on fullscreen toggle
    useEffect(() => {
        if (mapRef.current) {
            setTimeout(() => {
                window.google?.maps.event.trigger(mapRef.current!, 'resize')
            }, 200)
        }
    }, [isFullscreen])

    // Auto-fit bounds to buses (live mode only)
    useEffect(() => {
        if (!mapRef.current || isHistoryMode) return
        const valid = buses.filter(b => b.lat != null && b.lng != null)
        if (valid.length === 0) return
        const bounds = new window.google.maps.LatLngBounds()
        valid.forEach(b => bounds.extend({ lat: b.lat, lng: b.lng }))
        mapRef.current.fitBounds(bounds, 60)
    }, [buses, isHistoryMode])

    // ── Load History ──────────────────────────────────────────────────────────
    const loadHistory = async (busId: string, date: string) => {
        if (!busId) return
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(
                `${BACKEND_URL}/api/gps/playback?bus=${busId}&date=${date}`,
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (!res.ok) {
                console.error('History fetch failed:', await res.text())
                setHistoryPoints([])
                return
            }
            const data: GPSPoint[] = await res.json()
            setHistoryPoints(data)
            setPlaybackIndex(0)

            if (data.length > 0 && mapRef.current) {
                const bounds = new window.google.maps.LatLngBounds()
                data.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
                mapRef.current.fitBounds(bounds, 60)
            }
        } catch (e) {
            console.error('Failed to fetch history:', e)
        } finally {
            setIsLoading(false)
        }
    }

    // ── Toggle History Mode ───────────────────────────────────────────────────
    const toggleHistoryMode = useCallback(
        async (busIdOverride?: string) => {
            if (isHistoryMode && !busIdOverride) {
                setIsHistoryMode(false)
                setHistoryPoints([])
                return
            }
            const busId =
                busIdOverride || selectedBusId || (buses.length > 0 ? buses[0].id : null)
            if (!busId) return
            setSelectedBusId(busId)
            setIsHistoryMode(true)
            loadHistory(busId, playbackDate)
        },
        [isHistoryMode, buses, selectedBusId, playbackDate]
    )

    // Listen for popup "View History" events
    useEffect(() => {
        const handler = (e: any) => toggleHistoryMode(e.detail)
        window.addEventListener('map:viewHistory', handler)
        return () => window.removeEventListener('map:viewHistory', handler)
    }, [toggleHistoryMode])

    // ── Playback Timer ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isPlaying) return
        if (playbackIndex >= historyPoints.length - 1) {
            setIsPlaying(false)
            return
        }
        const timer = setInterval(() => setPlaybackIndex(p => p + 1), 500)
        return () => clearInterval(timer)
    }, [isPlaying, playbackIndex, historyPoints])

    // ── Render ────────────────────────────────────────────────────────────────
    if (loadError) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl text-red-400 text-sm font-medium">
                ⚠️ Failed to load Google Maps. Check your API key.
            </div>
        )
    }

    if (!isLoaded) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-400 text-sm">Loading map…</p>
                </div>
            </div>
        )
    }

    const currentPoint = historyPoints[playbackIndex]

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full rounded-xl overflow-hidden border border-border shadow-inner"
        >
            <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={MAP_CENTER}
                zoom={12}
                options={{
                    styles: currentMapStyles,
                    disableDefaultUI: false,
                    zoomControl: true,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    clickableIcons: false,
                }}
                onLoad={map => { mapRef.current = map }}
                onUnmount={() => { mapRef.current = null }}
            >
                {/* ── Live Bus Markers ── */}
                {!isHistoryMode &&
                    buses
                        .filter(b => b.lat != null && b.lng != null)
                        .map(bus => (
                            <Marker
                                key={bus.id}
                                position={{ lat: bus.lat, lng: bus.lng }}
                                icon={BUS_ICON_SVG(
                                    bus.status === 'active' ? '#2563eb' : '#64748b'
                                )}
                                onClick={() =>
                                    setActivePopupBusId(
                                        activePopupBusId === bus.id ? null : bus.id
                                    )
                                }
                            >
                                {activePopupBusId === bus.id && (
                                    <InfoWindow
                                        onCloseClick={() => setActivePopupBusId(null)}
                                    >
                                        <div style={{ fontFamily: 'sans-serif', padding: '4px', minWidth: '120px' }}>
                                            <b style={{ fontSize: '14px' }}>{bus.internal_id}</b>
                                            <br />
                                            <span style={{ fontSize: '11px', color: '#666' }}>
                                                {bus.plate}
                                            </span>
                                            <br />
                                            <button
                                                onClick={() => {
                                                    setActivePopupBusId(null)
                                                    toggleHistoryMode(bus.id)
                                                }}
                                                style={{
                                                    background: '#2563eb',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '4px 10px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                    marginTop: '6px',
                                                    width: '100%',
                                                }}
                                            >
                                                View History
                                            </button>
                                        </div>
                                    </InfoWindow>
                                )}
                            </Marker>
                        ))}

                {/* ── History Mode: Ghost Polyline ── */}
                {isHistoryMode && historyPoints.length > 0 && (
                    <Polyline
                        path={historyPoints.map(p => ({ lat: p.lat, lng: p.lng }))}
                        options={{
                            strokeColor: '#3b82f6',
                            strokeOpacity: 0.4,
                            strokeWeight: 3,
                            icons: [
                                {
                                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                                    offset: '0',
                                    repeat: '16px',
                                },
                            ],
                        }}
                    />
                )}

                {/* ── History Mode: Playback Dot ── */}
                {isHistoryMode && currentPoint && (
                    <Marker
                        position={{ lat: currentPoint.lat, lng: currentPoint.lng }}
                        icon={DOT_ICON()}
                        label={{
                            text: `${new Date(currentPoint.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            })} · ${currentPoint.speed} km/h`,
                            color: '#ffffff',
                            fontSize: '10px',
                            fontWeight: 'bold',
                        }}
                        zIndex={100}
                    />
                )}
            </GoogleMap>

            {/* ── History Toggle Button ── */}
            <button
                onClick={() => toggleHistoryMode()}
                className={`absolute top-4 right-4 z-[1000] p-2.5 rounded-lg shadow-lg transition-all duration-300 border ${
                    isHistoryMode
                        ? 'bg-blue-600 text-white border-blue-700'
                        : 'bg-white/90 backdrop-blur-sm text-slate-700 border-slate-200 hover:bg-white'
                }`}
                title={isHistoryMode ? 'Back to Live' : 'View Route History'}
            >
                {isHistoryMode ? (
                    <X size={20} className="transition-transform hover:rotate-90" />
                ) : (
                    <Route size={20} className="transition-transform hover:scale-110" />
                )}
            </button>

            {/* ── Playback Control Bar ── */}
            {isHistoryMode && (
                <div
                    className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] transition-all duration-300 ${
                        isSmall ? 'w-[92%]' : 'w-[90%] max-w-lg'
                    }`}
                >
                    <div
                        className={`bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl flex flex-col ${
                            isSmall ? 'p-2 rounded-xl gap-1.5' : 'p-3 rounded-2xl gap-2'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                {/* Play / Pause */}
                                <button
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    disabled={isLoading || historyPoints.length === 0}
                                    className={`${isSmall ? 'p-1.5' : 'p-2'} bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md active:scale-95 disabled:opacity-50`}
                                >
                                    {isPlaying ? (
                                        <Pause size={isSmall ? 14 : 18} fill="currentColor" />
                                    ) : (
                                        <Play size={isSmall ? 14 : 18} fill="currentColor" />
                                    )}
                                </button>

                                <div>
                                    {!isSmall && (
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={selectedBusId || ''}
                                                onChange={e => {
                                                    setSelectedBusId(e.target.value)
                                                    loadHistory(e.target.value, playbackDate)
                                                }}
                                                className="text-[11px] font-bold bg-transparent border-none focus:ring-0 p-0 text-slate-800 cursor-pointer"
                                            >
                                                {buses.map(bus => (
                                                    <option key={bus.id} value={bus.id}>
                                                        {bus.internal_id}
                                                    </option>
                                                ))}
                                            </select>
                                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                                            <input
                                                type="date"
                                                value={playbackDate}
                                                onChange={e => {
                                                    setPlaybackDate(e.target.value)
                                                    if (selectedBusId)
                                                        loadHistory(selectedBusId, e.target.value)
                                                }}
                                                className="text-[10px] font-medium text-slate-500 bg-transparent border-none focus:ring-0 p-0 cursor-pointer"
                                            />
                                        </div>
                                    )}
                                    <p
                                        className={`${isSmall ? 'text-[9px]' : 'text-[10px]'} text-blue-600 font-mono font-bold leading-tight`}
                                    >
                                        {isLoading
                                            ? '...'
                                            : historyPoints.length > 0
                                            ? new Date(
                                                  historyPoints[playbackIndex].timestamp
                                              ).toLocaleTimeString([], {
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                              })
                                            : 'No logs'}
                                    </p>
                                </div>
                            </div>

                            <div
                                className={`${isSmall ? 'text-[8px] px-2 py-0.5' : 'text-[10px] px-3 py-1'} font-black text-blue-600 bg-blue-50/50 rounded-full border border-blue-100/50`}
                            >
                                {playbackIndex + 1} / {historyPoints.length}
                            </div>
                        </div>

                        {/* Scrubber */}
                        <div className="relative flex items-center px-1">
                            <input
                                type="range"
                                min="0"
                                max={Math.max(0, historyPoints.length - 1)}
                                value={playbackIndex}
                                onChange={e => setPlaybackIndex(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
