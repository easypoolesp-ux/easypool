'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
    GoogleMap,
    useJsApiLoader,
    Polyline,
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function FleetMap({ buses, isFullscreen, initialBusId }: Props) {
    // 📚 Load required libraries for 2026 guidelines
    const libraries = useMemo<("marker" | "maps" | "places")[]>(() => ["marker"], []);
    
    // 🔑 API Key Environment Variable Check
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'; // Using default if not provided

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey!,
        id: 'google-map-script',
        libraries: libraries,
    })

    const { theme } = useTheme()
    const mapRef = useRef<google.maps.Map | null>(null)
    const markerRefs = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map())
    const historyMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)

    // History Mode State
    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [selectedBusId, setSelectedBusId] = useState<string | null>(initialBusId || null)
    const [playbackDate, setPlaybackDate] = useState(() => 
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    )
    const [historyPoints, setHistoryPoints] = useState<GPSPoint[]>([])
    const [playbackIndex, setPlaybackIndex] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isSmall, setIsSmall] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // ── Markers Management (2026 Advanced Markers) ──────────────────────────
    const updateMarkers = useCallback(() => {
        if (!mapRef.current || isHistoryMode) {
            // Remove all live markers if in history mode
            markerRefs.current.forEach(m => { m.map = null });
            markerRefs.current.clear();
            return;
        }

        const currentBusIds = new Set(buses.map(b => b.id));

        // 1. Remove markers for buses no longer in the list
        markerRefs.current.forEach((marker, id) => {
            if (!currentBusIds.has(id)) {
                marker.map = null;
                markerRefs.current.delete(id);
            }
        });

        // 2. Add or Update markers
        buses.forEach(bus => {
            if (!bus.lat || !bus.lng) return;

            let marker = markerRefs.current.get(bus.id);
            const position = { lat: bus.lat, lng: bus.lng };

            if (!marker) {
                // Create custom pin content
                const pinElement = document.createElement('div');
                pinElement.innerHTML = `
                    <div style="background: ${bus.status === 'active' ? '#2563eb' : '#64748b'}; color: white; padding: 4px 8px; border-radius: 8px; font-size: 11px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transform: translate(-50%, -100%);">
                        ${bus.internal_id}
                    </div>
                `;

                marker = new google.maps.marker.AdvancedMarkerElement({
                    map: mapRef.current!,
                    position: position,
                    title: bus.internal_id,
                    content: pinElement
                });

                marker.addListener("click", () => {
                    // Custom event for View History
                    window.dispatchEvent(new CustomEvent('map:viewHistory', { detail: bus.id }));
                });

                markerRefs.current.set(bus.id, marker);
            } else {
                marker.position = position;
            }
        });
    }, [buses, isHistoryMode]);

    // ── Update History Marker ────────────────────────────────────────────────
    useEffect(() => {
        if (!isHistoryMode || !historyPoints[playbackIndex] || !mapRef.current) {
            if (historyMarkerRef.current) {
                historyMarkerRef.current.map = null;
                historyMarkerRef.current = null;
            }
            return;
        }

        const point = historyPoints[playbackIndex];
        const position = { lat: point.lat, lng: point.lng };

        if (!historyMarkerRef.current) {
            const dot = document.createElement('div');
            dot.style.background = '#2563eb';
            dot.style.width = '14px';
            dot.style.height = '14px';
            dot.style.borderRadius = '50%';
            dot.style.border = '2px solid white';
            dot.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';

            historyMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
                map: mapRef.current!,
                position: position,
                content: dot,
                zIndex: 1000
            });
        } else {
            historyMarkerRef.current.position = position;
        }
    }, [isHistoryMode, historyPoints, playbackIndex]);

    // ── Trigger Marker Update ────────────────────────────────────────────────
    useEffect(() => {
        if (isLoaded) updateMarkers();
    }, [isLoaded, updateMarkers, buses, isHistoryMode]);

    // ── Resizing ─────────────────────────────────────────────────────────────
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

    // Fit bounds
    useEffect(() => {
        if (!mapRef.current || isHistoryMode) return
        const valid = buses.filter(b => b.lat != null && b.lng != null)
        if (valid.length === 0) return
        const bounds = new window.google.maps.LatLngBounds()
        valid.forEach(b => bounds.extend({ lat: b.lat, lng: b.lng }))
        mapRef.current.fitBounds(bounds, 60)
    }, [buses, isHistoryMode])

    // ── History Sync ──────────────────────────────────────────────────────────
    const loadHistory = async (busId: string, date: string) => {
        if (!busId) return
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`${BACKEND_URL}/api/gps/playback?bus=${busId}&date=${date}`, { headers: { Authorization: `Bearer ${token}` } })
            if (!res.ok) {
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
        } catch (e) { console.error(e) } finally { setIsLoading(false) }
    }

    const toggleHistoryMode = useCallback(async (busIdOverride?: string) => {
        if (isHistoryMode && !busIdOverride) {
            setIsHistoryMode(false)
            setHistoryPoints([])
            return
        }
        const busId = busIdOverride || selectedBusId || (buses.length > 0 ? buses[0].id : null)
        if (!busId) return
        setSelectedBusId(busId)
        setIsHistoryMode(true)
        loadHistory(busId, playbackDate)
    }, [isHistoryMode, buses, selectedBusId, playbackDate])

    useEffect(() => {
        const handler = (e: any) => toggleHistoryMode(e.detail)
        window.addEventListener('map:viewHistory', handler)
        return () => window.removeEventListener('map:viewHistory', handler)
    }, [toggleHistoryMode])

    // Playback
    useEffect(() => {
        if (!isPlaying) return
        if (playbackIndex >= historyPoints.length - 1) {
            setIsPlaying(false)
            return
        }
        const timer = setInterval(() => setPlaybackIndex(p => p + 1), 500)
        return () => clearInterval(timer)
    }, [isPlaying, playbackIndex, historyPoints])

    if (loadError) return <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl text-red-400 p-8 text-center">⚠️ Maps Load Error: ApiProjectMapError. Check billing and Maps JavaScript API enablement.</div>
    if (!isLoaded) return <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /><p className="ml-3 text-slate-400">Loading Map…</p></div>
    if (!apiKey) return <div className="w-full h-full flex items-center justify-center bg-red-950/20 text-red-500 rounded-xl">Error: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY missing.</div>

    return (
        <div ref={containerRef} className="relative w-full h-full rounded-xl overflow-hidden border border-border shadow-inner">
            <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={MAP_CENTER}
                zoom={12}
                options={{
                    mapId: mapId, // REQUIRED for Advanced Markers in 2026
                    disableDefaultUI: false,
                    zoomControl: true,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                }}
                onLoad={map => { mapRef.current = map }}
                onUnmount={() => { mapRef.current = null }}
            >
                {/* ── Polyline for Route ── */}
                {isHistoryMode && historyPoints.length > 1 && (
                    <Polyline
                        path={historyPoints.map(p => ({ lat: p.lat, lng: p.lng }))}
                        options={{ strokeColor: '#3b82f6', strokeOpacity: 0.6, strokeWeight: 4 }}
                    />
                )}
            </GoogleMap>

            {/* ── Toggle UI ── */}
            <button
                onClick={() => toggleHistoryMode()}
                className={`absolute top-4 right-4 z-[1000] p-2.5 rounded-lg shadow-lg border ${isHistoryMode ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}
            >
                {isHistoryMode ? <X size={20} /> : <Route size={20} />}
            </button>

            {/* ── Playback Controls ── */}
            {isHistoryMode && (
                <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] ${isSmall ? 'w-full px-2' : 'w-[90%] max-w-lg'}`}>
                    <div className="bg-white/90 backdrop-blur-xl p-3 rounded-2xl shadow-2xl flex flex-col gap-2 border border-slate-200">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 bg-blue-600 text-white rounded-lg">
                                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                                </button>
                                <div>
                                    <p className="text-[10px] text-blue-600 font-bold">{historyPoints.length > 0 ? new Date(historyPoints[playbackIndex].timestamp).toLocaleTimeString() : 'No Logs'}</p>
                                    <p className="text-[9px] text-slate-500 uppercase tracking-wider">{historyPoints[playbackIndex]?.speed || 0} km/h</p>
                                </div>
                            </div>
                            <div className="text-[10px] font-black bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">{playbackIndex + 1}/{historyPoints.length}</div>
                        </div>
                        <input type="range" min="0" max={Math.max(0, historyPoints.length - 1)} value={playbackIndex} onChange={e => setPlaybackIndex(parseInt(e.target.value))} className="w-full accent-blue-600" />
                    </div>
                </div>
            )}
        </div>
    )
}
