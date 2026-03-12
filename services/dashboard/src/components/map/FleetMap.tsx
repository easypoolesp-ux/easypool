'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { History, Play, Pause, X, ChevronLeft, ChevronRight, Route } from 'lucide-react'

// Fix for default marker icons in Leaflet + Next.js
const fixLeafletIcon = () => {
    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
}

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

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://easypool-backend-222076803846.asia-south1.run.app'

export default function FleetMap({ buses, isFullscreen, initialBusId }: Props) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<L.Map | null>(null)
    const markersLayer = useRef<L.LayerGroup | null>(null)
    const historyLayer = useRef<L.LayerGroup | null>(null)

    // History Mode State
    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [selectedBusId, setSelectedBusId] = useState<string | null>(initialBusId || null)
    
    // Timezone-aware "Today" for Kolkata
    const getKolkataDate = () => {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date())
    }
    
    const [playbackDate, setPlaybackDate] = useState(getKolkataDate())
    const [historyPoints, setHistoryPoints] = useState<GPSPoint[]>([])
    const [playbackIndex, setPlaybackIndex] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isSmall, setIsSmall] = useState(false)

    // Detect small container for adaptive UI
    useEffect(() => {
        if (!mapContainer.current) return
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                setIsSmall(entry.contentRect.width < 500)
            }
        })
        observer.observe(mapContainer.current)
        return () => observer.disconnect()
    }, [])

    // Handle initialBusId changes
    useEffect(() => {
        if (initialBusId && !isHistoryMode) {
            setSelectedBusId(initialBusId)
            // Removed auto-trigger of history mode as per user request
        }
    }, [initialBusId])

    useEffect(() => {
        if (!mapContainer.current || map.current) return

        fixLeafletIcon()

        // Initialize Leaflet Map
        map.current = L.map(mapContainer.current).setView([22.5726, 88.3639], 12)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map.current)

        markersLayer.current = L.layerGroup().addTo(map.current)
        historyLayer.current = L.layerGroup().addTo(map.current)

        return () => {
            map.current?.remove()
            map.current = null
        }
    }, [])

    // Handle resizing when fullscreen toggles
    useEffect(() => {
        if (map.current) {
            setTimeout(() => {
                map.current?.invalidateSize()
            }, 200)
        }
    }, [isFullscreen])

    // Load History Data
    const loadHistory = async (busId: string, date: string) => {
        if (!busId) return
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`${BACKEND_URL}/api/gps/playback?bus=${busId}&date=${date}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            if (!res.ok) {
                const errorText = await res.text()
                console.error('History fetch failed:', errorText)
                setHistoryPoints([])
                return
            }
            const data = await res.json()
            setHistoryPoints(data)
            setPlaybackIndex(0)

            if (data.length > 0 && map.current) {
                const polylinePoints = data.map((p: any) => [p.lat, p.lng])
                historyLayer.current?.clearLayers()
                
                // Draw ghost path
                L.polyline(polylinePoints, {
                    color: '#3b82f6',
                    weight: 3,
                    opacity: 0.4,
                    dashArray: '5, 10'
                }).addTo(historyLayer.current!)

                map.current.fitBounds(L.polyline(polylinePoints).getBounds(), { padding: [50, 50] })
            } else {
                historyLayer.current?.clearLayers()
            }
        } catch (e) {
            console.error('Failed to fetch history:', e)
        } finally {
            setIsLoading(false)
        }
    }

    // Toggle History Mode
    const toggleHistoryMode = useCallback(async (busIdOverride?: string) => {
        if (isHistoryMode && !busIdOverride) {
            setIsHistoryMode(false)
            setHistoryPoints([])
            historyLayer.current?.clearLayers()
            return
        }

        const busId = busIdOverride || selectedBusId || (buses.length > 0 ? buses[0].id : null)
        if (!busId) return

        setSelectedBusId(busId)
        setIsHistoryMode(true)
        loadHistory(busId, playbackDate)
    }, [isHistoryMode, buses, selectedBusId, playbackDate])

    // Update Live Markers (Only if NOT in history mode)
    useEffect(() => {
        if (!map.current || !markersLayer.current || isHistoryMode) {
            markersLayer.current?.clearLayers()
            return
        }

        markersLayer.current.clearLayers()
        const bounds: L.LatLngExpression[] = []

        buses
            .filter(bus => bus.lat != null && bus.lng != null)
            .forEach(bus => {
                const position: [number, number] = [bus.lat, bus.lng]
                bounds.push(position)

                const marker = L.marker(position)
                    .bindPopup(`
            <div style="font-family: sans-serif; padding: 4px;">
              <b style="font-size: 14px;">${bus.internal_id}</b><br/>
              <span style="font-size: 11px; color: #666;">${bus.plate}</span><br/>
              <button onclick="window.dispatchEvent(new CustomEvent('map:viewHistory', {detail: '${bus.id}'}))" style="background: #2563eb; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; margin-top: 5px;">View History</button>
            </div>
          `)
                    .addTo(markersLayer.current!)
            })

        if (bounds.length > 0 && map.current) {
            const latLngBounds = L.latLngBounds(bounds)
            map.current.fitBounds(latLngBounds, { padding: [50, 50], maxZoom: 15 })
        }
    }, [buses, isHistoryMode])

    // Listen for custom "View History" events from popups
    useEffect(() => {
        const handler = (e: any) => {
            toggleHistoryMode(e.detail)
        }
        window.addEventListener('map:viewHistory', handler)
        return () => window.removeEventListener('map:viewHistory', handler)
    }, [toggleHistoryMode])

    // Playback Logic
    useEffect(() => {
        let timer: any
        if (isPlaying && playbackIndex < historyPoints.length - 1) {
            timer = setInterval(() => {
                setPlaybackIndex(prev => prev + 1)
            }, 500)
        } else {
            setIsPlaying(false)
        }
        return () => clearInterval(timer)
    }, [isPlaying, playbackIndex, historyPoints])

    // Update History Marker
    useEffect(() => {
        if (!isHistoryMode || historyPoints.length === 0 || !historyLayer.current) return

        // Remove old marker if any
        const currentPoint = historyPoints[playbackIndex]
        if (!currentPoint) return

        historyLayer.current.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                historyLayer.current?.removeLayer(layer)
            }
        })

        const marker = L.marker([currentPoint.lat, currentPoint.lng], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #2563eb; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            })
        }).addTo(historyLayer.current)

        marker.bindTooltip(`
      <div style="font-size: 11px;">
        <b>${new Date(currentPoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b><br/>
        Speed: ${currentPoint.speed} km/h
      </div>
    `, { permanent: true, direction: 'top', offset: [0, -10] })

    }, [isHistoryMode, historyPoints, playbackIndex])

    return (
        <div className="relative w-full h-full rounded-xl overflow-hidden border border-border shadow-inner bg-slate-100 group">
            <div ref={mapContainer} className="w-full h-full z-0" />

            {/* Premium Square History Toggle - Matching Expand Button Style */}
            <button
                onClick={() => toggleHistoryMode()}
                className={`absolute top-4 right-4 z-[1000] p-2.5 rounded-lg shadow-premium transition-all duration-300 border border-border group ${isHistoryMode ? 'bg-blue-600 text-white border-blue-700' : 'bg-white/90 backdrop-blur-sm text-slate-700 hover:bg-white'}`}
                title={isHistoryMode ? 'Back to Live' : 'View Route History'}
            >
                {isHistoryMode ? <X size={20} className="group-hover:rotate-90 transition-transform" /> : <Route size={20} className="group-hover:scale-110 transition-transform" />}
            </button>

            {/* Playback Control Bar */}
            {isHistoryMode && (
                <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] transition-all duration-300 ${isSmall ? 'w-[92%]' : 'w-[90%] max-w-lg'}`}>
                    <div className={`bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl flex flex-col ${isSmall ? 'p-2 rounded-xl gap-1.5' : 'p-3 rounded-2xl gap-2'}`}>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    disabled={isLoading || historyPoints.length === 0}
                                    className={`${isSmall ? 'p-1.5' : 'p-2'} bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md active:scale-95 disabled:opacity-50`}
                                >
                                    {isPlaying ? <Pause size={isSmall ? 14 : 18} fill="currentColor" /> : <Play size={isSmall ? 14 : 18} fill="currentColor" />}
                                </button>
                                <div>
                                    {!isSmall && (
                                        <div className="flex items-center gap-2">
                                            <select 
                                                value={selectedBusId || ''} 
                                                onChange={(e) => {
                                                  setSelectedBusId(e.target.value)
                                                  loadHistory(e.target.value, playbackDate)
                                                }}
                                                className="text-[11px] font-bold bg-transparent border-none focus:ring-0 p-0 text-slate-800 cursor-pointer"
                                            >
                                                {buses.map(bus => (
                                                  <option key={bus.id} value={bus.id}>{bus.internal_id}</option>
                                                ))}
                                            </select>
                                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                                            <input 
                                                type="date" 
                                                value={playbackDate}
                                                onChange={(e) => {
                                                  setPlaybackDate(e.target.value)
                                                  if (selectedBusId) loadHistory(selectedBusId, e.target.value)
                                                }}
                                                className="text-[10px] font-medium text-slate-500 bg-transparent border-none focus:ring-0 p-0 cursor-pointer"
                                            />
                                        </div>
                                    )}
                                    <p className={`${isSmall ? 'text-[9px]' : 'text-[10px]'} text-blue-600 font-mono font-bold leading-tight`}>
                                        {isLoading ? '...' : historyPoints.length > 0 ? `${new Date(historyPoints[playbackIndex].timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'No logs'}
                                    </p>
                                </div>
                            </div>
                            <div className={`${isSmall ? 'text-[8px] px-2 py-0.5' : 'text-[10px] px-3 py-1'} font-black text-blue-600 bg-blue-50/50 rounded-full border border-blue-100/50`}>
                                {playbackIndex + 1} / {historyPoints.length}
                            </div>
                        </div>

                        <div className="relative flex items-center group/slider px-1">
                            <input
                                type="range"
                                min="0"
                                max={Math.max(0, historyPoints.length - 1)}
                                value={playbackIndex}
                                onChange={(e) => setPlaybackIndex(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                            />
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
        .leaflet-container {
          width: 100%;
          height: 100%;
          background: #f8fafc;
        }
        .leaflet-control-attribution {
          font-size: 8px !important;
        }
      `}</style>
        </div>
    )
}
