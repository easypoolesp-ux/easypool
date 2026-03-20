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

const DARK_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3c4d' }] },
    { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
    { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#023e58' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
]
const LIGHT_STYLE: google.maps.MapTypeStyle[] = []

function getBusColor(status: string): string {
    if (status === 'online' || status === 'moving') return '#22c55e'
    if (status === 'idle') return '#94a3b8'
    if (status === 'ignition_off') return '#ef4444'
    return '#1e293b'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FleetMap({ buses, isFullscreen, initialBusId }: Props) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey!,
        id: 'google-map-script',
        libraries: LIBRARIES,
    })

    const { theme, systemTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const currentTheme = mounted ? (theme === 'system' ? systemTheme : theme) : 'light'
    const isDark = currentTheme === 'dark'

    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [isLiveTrail, setIsLiveTrail]     = useState(false)
    const [liveTrails, setLiveTrails]       = useState<Map<string, GPSPoint[]>>(new Map())
    const [isMapReady, setIsMapReady]       = useState(false)
    const [selectedBusId, setSelectedBusId] = useState<string | null>(initialBusId || null)
    
    const [playbackDate, setPlaybackDate] = useState(() =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    )
    const [historyPoints, setHistoryPoints] = useState<GPSPoint[]>([])
    const [playbackIndex, setPlaybackIndex] = useState(0)
    const [isPlaying, setIsPlaying]         = useState(false)
    const [isLoading, setIsLoading]         = useState(false)

    const mapRef           = useRef<google.maps.Map | null>(null)
    const markerRefs       = useRef<Map<string, google.maps.Marker>>(new Map())
    const historyMarkerRef = useRef<google.maps.Marker | null>(null)
    const hasFittedRef     = useRef(false)

    const mapOptions = useMemo<google.maps.MapOptions>(() => ({
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'b0c049e7fb978545fe9416bf', // Use secret, with fallback
        styles: isDark ? DARK_STYLE : LIGHT_STYLE,
    }), [isDark])

    // Update markers and bounds
    useEffect(() => {
        if (!isLoaded || !mapRef.current) return

        if (isHistoryMode) {
            markerRefs.current.forEach(m => m.setMap(null))
            markerRefs.current.clear()
            return
        }

        const ids = new Set(buses.map(b => b.id))
        markerRefs.current.forEach((m, id) => {
            if (!ids.has(id)) { m.setMap(null); markerRefs.current.delete(id) }
        })

        buses.forEach(bus => {
            if (!bus.lat || !bus.lng) return
            const pos = { lat: bus.lat, lng: bus.lng }
            const color = getBusColor(bus.status)
            const existing = markerRefs.current.get(bus.id)

            if (existing) {
                existing.setPosition(pos)
                existing.setIcon({
                    path: "M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z",
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 2,
                    scale: 1.2,
                    rotation: bus.heading || 0,
                    anchor: new google.maps.Point(12, 12),
                })
            } else {
                const m = new google.maps.Marker({
                    map: mapRef.current!,
                    position: pos,
                    title: bus.internal_id,
                    icon: {
                        path: "M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z",
                        fillColor: color,
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 2,
                        scale: 1.2,
                        rotation: bus.heading || 0,
                        anchor: new google.maps.Point(12, 12),
                    }
                })
                m.addListener('click', () => window.dispatchEvent(new CustomEvent('map:viewHistory', { detail: bus.id })))
                markerRefs.current.set(bus.id, m)
            }
        })

        // FOCUS / BOUNDS optimization
        if (buses.length > 0) {
            const bounds = new google.maps.LatLngBounds()
            let count = 0
            buses.forEach(b => {
                if (b.lat && b.lng) { bounds.extend({ lat: b.lat, lng: b.lng }); count++ }
            })
            if (count > 0) {
                if (count === 1 && !hasFittedRef.current) {
                    mapRef.current.panTo({ lat: buses[0].lat, lng: buses[0].lng })
                    mapRef.current.setZoom(15)
                    hasFittedRef.current = true
                } else if (count > 1) {
                    mapRef.current.fitBounds(bounds, 80)
                }
            }
        }
    }, [isLoaded, buses, isHistoryMode, isDark])

    // Live Trail Fetcher
    useEffect(() => {
        if (!isLiveTrail || !isLoaded) { setLiveTrails(new Map()); return }
        const fetchAllTrails = async () => {
            const token = localStorage.getItem('token')
            const date  = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
            const nextTrails = new Map<string, GPSPoint[]>()
            const visibleBuses = buses.slice(0, 10) // limit to avoid spam

            await Promise.all(visibleBuses.map(async bus => {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/gps/playback?bus=${bus.id}&date=${date}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                    if (res.ok) {
                        const data: GPSPoint[] = await res.json()
                        const threshold = Date.now() - 2 * 60 * 60 * 1000
                        nextTrails.set(bus.id, data.filter(p => new Date(p.timestamp).getTime() > threshold))
                    }
                } catch (err) {}
            }))
            setLiveTrails(nextTrails)
        }
        fetchAllTrails()
        const interval = setInterval(fetchAllTrails, 30000)
        return () => clearInterval(interval)
    }, [isLiveTrail, isLoaded, buses])

    // Playback Focus
    useEffect(() => {
        if (!isHistoryMode || !historyPoints[playbackIndex] || !mapRef.current) {
            if (historyMarkerRef.current) { historyMarkerRef.current.setMap(null); historyMarkerRef.current = null }
            return
        }
        const pt = historyPoints[playbackIndex]
        const pos = { lat: pt.lat, lng: pt.lng }
        if (!historyMarkerRef.current) {
            historyMarkerRef.current = new google.maps.Marker({
                map: mapRef.current!,
                position: pos,
                icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#3b82f6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, scale: 10 },
                zIndex: 1000
            })
        } else {
            historyMarkerRef.current.setPosition(pos)
        }
        if (isPlaying) mapRef.current.panTo(pos)
    }, [playbackIndex, isHistoryMode, historyPoints, isPlaying])

    // History Loader
    const loadHistory = useCallback(async (busId: string, date: string) => {
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`${BACKEND_URL}/api/gps/playback?bus=${busId}&date=${date}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await res.json()
            setHistoryPoints(Array.isArray(data) ? data : [])
            setPlaybackIndex(0)
            if (Array.isArray(data) && data.length > 0 && mapRef.current) {
                const b = new google.maps.LatLngBounds()
                data.forEach(p => b.extend({ lat: p.lat, lng: p.lng }))
                mapRef.current.fitBounds(b, 50)
            }
        } catch (e) {} finally { setIsLoading(false) }
    }, [])

    const toggleHistoryMode = useCallback((bid?: string) => {
        if (isHistoryMode && !bid) { setIsHistoryMode(false); setHistoryPoints([]); return }
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

    useEffect(() => {
        if (!isPlaying) return
        if (playbackIndex >= historyPoints.length - 1) { setIsPlaying(false); return }
        const t = setInterval(() => setPlaybackIndex(v => v + 1), 500)
        return () => clearInterval(t)
    }, [isPlaying, playbackIndex, historyPoints])

    if (loadError) return <div className="p-8 text-red-500">Error loading maps.</div>
    if (!isLoaded) return <div className="p-8 text-blue-500 animate-pulse">Initializing Fleet Map...</div>

    return (
        <div className="relative w-full h-full rounded-xl overflow-hidden border border-border bg-slate-100 dark:bg-slate-900 shadow-2xl">
            <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={MAP_CENTER}
                zoom={12}
                onLoad={m => { mapRef.current = m; setIsMapReady(true) }}
                options={mapOptions}
            >
                {/* Live Trails */}
                {isLiveTrail && Array.from(liveTrails.values()).map((t, idx) => (
                    <Polyline key={`t-${idx}`} path={t.map(p => ({ lat: p.lat, lng: p.lng }))} options={{ strokeColor: '#22c55e', strokeOpacity: 0.6, strokeWeight: 4 }} />
                ))}

                {/* History Line */}
                {isHistoryMode && historyPoints.length > 1 && (
                    <Polyline 
                        path={historyPoints.map(p => ({ lat: p.lat, lng: p.lng }))} 
                        options={{ strokeColor: '#3b82f6', strokeWeight: 3, strokeOpacity: 0.8 }} 
                    />
                )}
            </GoogleMap>

            {/* Buttons */}
            <div className="absolute top-4 left-4 right-[120px] pointer-events-none flex justify-between">
                <div></div>
                <div className="flex gap-2 pointer-events-auto">
                    <button 
                        onClick={() => setIsLiveTrail(!isLiveTrail)}
                        className={`p-3 rounded-xl shadow-lg backdrop-blur-md transition-all ${isLiveTrail ? 'bg-green-600 text-white' : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200'}`}
                    >
                        <Route size={20} className={isLiveTrail ? 'animate-pulse' : ''} />
                    </button>
                    <button 
                        onClick={() => toggleHistoryMode()}
                        className={`p-3 rounded-xl shadow-lg backdrop-blur-md transition-all ${isHistoryMode ? 'bg-blue-600 text-white' : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200'}`}
                    >
                        {isHistoryMode ? <X size={20} /> : <Calendar size={20} />}
                    </button>
                </div>
            </div>

            {/* Playback Controls */}
            {isHistoryMode && historyPoints.length > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-50">
                    <div className="bg-slate-900/90 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border border-white/10 text-white flex flex-col gap-3">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsPlaying(!isPlaying)} className="p-3 bg-blue-500 rounded-2xl">
                                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                            </button>
                            <div className="flex-1">
                                <p className="text-xs font-black">{new Date(historyPoints[playbackIndex].timestamp).toLocaleTimeString()}</p>
                                <p className="text-[10px] opacity-70 uppercase tracking-widest">{Math.round(historyPoints[playbackIndex].speed)} KM/H</p>
                            </div>
                            <div className="text-xs opacity-50">{playbackIndex + 1} / {historyPoints.length}</div>
                        </div>
                        <input type="range" min="0" max={historyPoints.length - 1} value={playbackIndex} onChange={e => setPlaybackIndex(Number(e.target.value))} className="w-full accent-blue-500" />
                    </div>
                </div>
            )}
        </div>
    )
}
