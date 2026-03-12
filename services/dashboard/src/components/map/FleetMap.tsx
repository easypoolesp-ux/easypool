'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { History, Play, Pause, X, ChevronLeft, ChevronRight } from 'lucide-react'

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
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://easypool-backend-222076803846.asia-south1.run.app'

export default function FleetMap({ buses, isFullscreen }: Props) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<L.Map | null>(null)
    const markersLayer = useRef<L.LayerGroup | null>(null)
    const historyLayer = useRef<L.LayerGroup | null>(null)

    // History Mode State
    const [isHistoryMode, setIsHistoryMode] = useState(false)
    const [selectedBusId, setSelectedBusId] = useState<string | null>(null)
    const [historyPoints, setHistoryPoints] = useState<GPSPoint[]>([])
    const [playbackIndex, setPlaybackIndex] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

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

    // Toggle History Mode
    const toggleHistoryMode = useCallback(async () => {
        if (isHistoryMode) {
            setIsHistoryMode(false)
            setHistoryPoints([])
            historyLayer.current?.clearLayers()
            return
        }

        if (buses.length === 0) return

        const busId = buses[0].id // Default to first bus
        setSelectedBusId(busId)
        setIsLoading(true)
        setIsHistoryMode(true)

        try {
            const today = new Date().toISOString().split('T')[0]
            const res = await fetch(`${BACKEND_URL}/api/gps/playback/?bus=${busId}&date=${today}`)
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
            }
        } catch (e) {
            console.error('Failed to fetch history:', e)
        } finally {
            setIsLoading(false)
        }
    }, [isHistoryMode, buses])

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

                L.marker(position)
                    .bindPopup(`
            <div style="font-family: sans-serif; padding: 4px;">
              <b style="font-size: 14px;">${bus.id}</b><br/>
              <span style="font-size: 11px; color: #666;">${bus.plate}</span><br/>
              <a href="/dashboard/bus/${bus.id}" style="color: #2563eb; font-size: 10px; font-weight: bold; text-decoration: none; margin-top: 5px; display: block;">View Live Feed</a>
            </div>
          `)
                    .addTo(markersLayer.current!)
            })

        if (bounds.length > 0 && map.current) {
            const latLngBounds = L.latLngBounds(bounds)
            map.current.fitBounds(latLngBounds, { padding: [50, 50], maxZoom: 15 })
        }
    }, [buses, isHistoryMode])

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

        // Remove old marker if any (simple way: keep last child as marker)
        const currentPoint = historyPoints[playbackIndex]
        if (!currentPoint) return

        // Clear only the marker, keep the polyline
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
        <b>${new Date(currentPoint.timestamp).toLocaleTimeString()}</b><br/>
        Speed: ${currentPoint.speed} km/h
      </div>
    `, { permanent: true, direction: 'top', offset: [0, -10] })

    }, [isHistoryMode, historyPoints, playbackIndex])

    return (
        <div className="relative w-full h-full rounded-xl overflow-hidden border border-border shadow-inner bg-slate-100 group">
            <div ref={mapContainer} className="w-full h-full z-0" />

            {/* Float Toggle Button */}
            <button
                onClick={toggleHistoryMode}
                className={`absolute top-4 right-4 z-[1000] p-2 rounded-lg shadow-lg transition-all duration-300 flex items-center gap-2 text-xs font-bold ${isHistoryMode ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
            >
                {isHistoryMode ? <X size={16} /> : <History size={16} />}
                {isHistoryMode ? 'Back to Live' : 'History'}
            </button>

            {/* Playback Control Bar */}
            {isHistoryMode && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white/80 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-2xl flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    disabled={isLoading || historyPoints.length === 0}
                                    className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                                </button>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800">Route Playback</h4>
                                    <p className="text-[10px] text-slate-500">
                                        {isLoading ? 'Loading path...' : historyPoints.length > 0 ? `${new Date(historyPoints[playbackIndex].timestamp).toLocaleTimeString()}` : 'No data for today'}
                                    </p>
                                </div>
                            </div>
                            <div className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                {playbackIndex + 1} / {historyPoints.length}
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min="0"
                                max={Math.max(0, historyPoints.length - 1)}
                                value={playbackIndex}
                                onChange={(e) => setPlaybackIndex(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
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
