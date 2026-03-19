'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
    GoogleMap,
    useJsApiLoader,
    Polyline,
} from '@react-google-maps/api'
import { History, Play, Pause, X, Route, Calendar } from 'lucide-react'
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

// Google Maps built-in dark theme via colorScheme: 'DARK' | 'LIGHT'
// Gives the standard deep blue Night theme natively — no custom styles needed.

// ── Component ─────────────────────────────────────────────────────────────────
export default function FleetMap({ buses, isFullscreen, initialBusId }: Props) {
    const libraries = useMemo<("marker" | "maps" | "places")[]>(() => ["marker"], []);
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: apiKey!,
        id: 'google-map-script',
        libraries: libraries,
    })

    const { theme, systemTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
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
    
    const mapRef = useRef<google.maps.Map | null>(null)
    const markerRefs = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map())
    const historyMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const hasFittedBoundsRef = useRef(false)

    // Handle Hydration and Dynamic Theme
    useEffect(() => setMounted(true), [])
    
    const currentTheme = useMemo(() => {
        if (!mounted) return 'light'
        return theme === 'system' ? systemTheme : theme
    }, [mounted, theme, systemTheme])

    const mapOptions = useMemo<google.maps.MapOptions>(() => ({
        mapId: mapId,
        colorScheme: currentTheme === 'dark' ? 'DARK' : 'LIGHT',
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        backgroundColor: currentTheme === 'dark' ? '#1a1a2e' : '#f5f5f5'
    }), [currentTheme, mapId])

    const updateMarkers = useCallback(() => {
        if (!mapRef.current || isHistoryMode) {
            markerRefs.current.forEach(m => { m.map = null });
            markerRefs.current.clear();
            return;
        }

        const currentBusIds = new Set(buses.map(b => b.id));
        markerRefs.current.forEach((marker, id) => {
            if (!currentBusIds.has(id)) {
                marker.map = null;
                markerRefs.current.delete(id);
            }
        });

        buses.forEach(bus => {
            if (!bus.lat || !bus.lng) return;
            let marker = markerRefs.current.get(bus.id);
            const position = { lat: bus.lat, lng: bus.lng };

            if (!marker) {
                const pinElement = document.createElement('div');
                pinElement.innerHTML = `
                    <div style="background: ${bus.status === 'active' ? '#3b82f6' : '#94a3b8'}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; border: 2px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4); transform: translate(-50%, -50%); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); white-space: nowrap;">
                        <span style="display: inline-block; width: 6px; height: 6px; background: white; border-radius: 50%; margin-right: 6px; vertical-align: middle; ${bus.status === 'active' ? 'animation: pulse 1.5s infinite;' : ''}"></span>
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
                    window.dispatchEvent(new CustomEvent('map:viewHistory', { detail: bus.id }));
                });

                markerRefs.current.set(bus.id, marker);
            } else {
                marker.position = position;
            }
        });
    }, [buses, isHistoryMode]);

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
            dot.style.position = 'relative';
            dot.style.width = '24px';
            dot.style.height = '24px';
            dot.innerHTML = `
                <div style="
                    position: absolute; inset: 0;
                    background: rgba(59, 130, 246, 0.25);
                    border-radius: 50%;
                    animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
                "></div>
                <div style="
                    position: absolute; inset: 4px;
                    background: #3b82f6;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 0 12px rgba(59, 130, 246, 0.8), 0 2px 8px rgba(0,0,0,0.3);
                "></div>
            `;

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

    useEffect(() => {
        if (isLoaded) updateMarkers();
    }, [isLoaded, updateMarkers, buses, isHistoryMode]);

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

    useEffect(() => {
        if (!mapRef.current || isHistoryMode || hasFittedBoundsRef.current) return
        const valid = buses.filter(b => b.lat != null && b.lng != null)
        if (valid.length === 0) return
        hasFittedBoundsRef.current = true
        const bounds = new window.google.maps.LatLngBounds()
        valid.forEach(b => bounds.extend({ lat: b.lat, lng: b.lng }))
        mapRef.current.fitBounds(bounds, 60)
        // Cap max zoom so close-together buses don't over-zoom
        const listener = mapRef.current.addListener('idle', () => {
            if (mapRef.current && mapRef.current.getZoom()! > 14) {
                mapRef.current.setZoom(14)
            }
            google.maps.event.removeListener(listener)
        })
    }, [buses, isHistoryMode])

    const loadHistory = async (busId: string, date: string) => {
        if (!busId) return
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`${BACKEND_URL}/api/gps/playback?bus=${busId}&date=${date}`, { headers: { Authorization: `Bearer ${token}` } })
            if (!res.ok) { setHistoryPoints([]); return; }
            const data: GPSPoint[] = await res.json()
            setHistoryPoints(data)
            setPlaybackIndex(0)
            if (data.length > 0 && mapRef.current) {
                const bounds = new window.google.maps.LatLngBounds()
                data.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
                mapRef.current.fitBounds(bounds, 40)
                // Cap max zoom so short routes don't over-zoom
                const listener = mapRef.current.addListener('idle', () => {
                    if (mapRef.current && mapRef.current.getZoom()! > 16) {
                        mapRef.current.setZoom(16)
                    }
                    google.maps.event.removeListener(listener)
                })
            }
        } catch (e) { console.error(e) } finally { setIsLoading(false) }
    }

    const toggleHistoryMode = useCallback(async (busIdOverride?: string) => {
        if (isHistoryMode && !busIdOverride) { setIsHistoryMode(false); setHistoryPoints([]); return; }
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

    useEffect(() => {
        if (!isPlaying) return
        if (playbackIndex >= historyPoints.length - 1) { setIsPlaying(false); return; }
        const timer = setInterval(() => setPlaybackIndex(p => p + 1), 500)
        return () => clearInterval(timer)
    }, [isPlaying, playbackIndex, historyPoints])

    if (loadError) return <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl text-red-400 p-8 text-center font-bold">⚠️ Maps API Error. Use Build Args to pass API Key.</div>
    if (!isLoaded || !mounted) return <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>

    return (
        <div ref={containerRef} className="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl">
            <GoogleMap
                key={currentTheme}
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={MAP_CENTER}
                zoom={12}
                options={mapOptions}
                onLoad={map => { mapRef.current = map }}
                onUnmount={() => { mapRef.current = null }}
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
                                    if(selectedBusId) loadHistory(selectedBusId, e.target.value)
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
                                <option key={b.id} value={b.id} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white">{b.internal_id}</option>
                            ))}
                        </select>
                    </div>
                )}
                
                <div className="ml-auto pointer-events-auto">
                    <button
                        onClick={() => toggleHistoryMode()}
                        className={`p-3 rounded-xl shadow-2xl backdrop-blur-md transition-all active:scale-95 ${isHistoryMode ? 'bg-blue-600 text-white' : 'bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-white'}`}
                    >
                        {isHistoryMode ? <X size={20} /> : <Route size={20} />}
                    </button>
                </div>
            </div>

            {isHistoryMode && (
                <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] ${isSmall ? 'w-full px-4' : 'w-[90%] max-w-md'}`}>
                    <div className="bg-slate-900/80 dark:bg-slate-900/95 backdrop-blur-2xl p-4 rounded-3xl shadow-2xl flex flex-col gap-3 border border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsPlaying(!isPlaying)} className="p-3 bg-blue-500 text-white rounded-2xl hover:bg-blue-400 shadow-lg shadow-blue-500/30">
                                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                                </button>
                                <div>
                                    <p className="text-xs text-blue-300 font-black tracking-widest">{historyPoints[playbackIndex]?.timestamp ? new Date(historyPoints[playbackIndex].timestamp).toLocaleTimeString() : 'LIVE'}</p>
                                    <p className="text-[10px] text-slate-200 font-bold uppercase tracking-tighter">{historyPoints[playbackIndex]?.speed || 0} KM / H</p>
                                </div>
                            </div>
                            <div className="text-[11px] font-black bg-white/10 text-white px-4 py-1.5 rounded-full border border-white/5">{playbackIndex + 1} <span className="text-white/30 px-1">/</span> {historyPoints.length}</div>
                        </div>
                        <input type="range" min="0" max={Math.max(0, historyPoints.length - 1)} value={playbackIndex} onChange={e => setPlaybackIndex(parseInt(e.target.value))} className="w-full accent-blue-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer" />
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.5); opacity: 0.5; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes ping {
                    75%, 100% { transform: scale(2); opacity: 0; }
                }
            `}</style>
        </div>
    )
}
