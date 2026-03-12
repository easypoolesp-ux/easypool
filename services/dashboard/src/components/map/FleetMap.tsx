'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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

interface Props {
    buses: Bus[]
    isFullscreen?: boolean
}

export default function FleetMap({ buses, isFullscreen }: Props) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<L.Map | null>(null)
    const markersLayer = useRef<L.LayerGroup | null>(null)

    useEffect(() => {
        if (!mapContainer.current || map.current) return

        fixLeafletIcon()

        // Initialize Leaflet Map
        // NOTE: Leaflet uses [Lat, Lng]
        map.current = L.map(mapContainer.current).setView([22.5726, 88.3639], 12)

        // Use OpenStreetMap (OSM) Tiles - Completely Free & Reliable
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map.current)

        markersLayer.current = L.layerGroup().addTo(map.current)

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

    if (!map.current || !markersLayer.current) return

    markersLayer.current.clearLayers()

    const bounds: L.LatLngExpression[] = []

    // Only show markers for buses with valid GPS data
    buses
        .filter(bus => bus.lat != null && bus.lng != null)
        .forEach(bus => {
            const position: [number, number] = [bus.lat, bus.lng]
            bounds.push(position)

            const marker = L.marker(position)
                .bindPopup(`
          <div style="font-family: sans-serif; padding: 4px;">
            <b style="font-size: 14px;">${bus.id}</b><br/>
            <span style="font-size: 11px; color: #666;">${bus.plate}</span><br/>
            <a href="/dashboard/bus/${bus.id}" style="color: #2563eb; font-size: 10px; font-weight: bold; text-decoration: none; margin-top: 5px; display: block;">View Live Feed</a>
          </div>
        `)
                .addTo(markersLayer.current!)
        })

    // Auto-center map if we have points
    if (bounds.length > 0 && map.current) {
        const latLngBounds = L.latLngBounds(bounds)
        map.current.fitBounds(latLngBounds, { padding: [50, 50], maxZoom: 15 })
    }
}, [buses])

return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-border shadow-inner bg-slate-100">
        <div ref={mapContainer} className="w-full h-full z-0" />
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
