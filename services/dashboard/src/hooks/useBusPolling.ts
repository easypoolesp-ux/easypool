import { useState, useEffect, useCallback, useRef } from 'react'
import { components } from '@/types/api'

type BusType = components['schemas']['BusList']
type AlertType = components['schemas']['Alert']

interface UseBusPollingReturn {
    buses: BusType[]
    alerts: AlertType[]
    transporters: any[]
    loading: boolean
    error: string | null
    lastUpdated: Date | null
}

export function useBusPolling(): UseBusPollingReturn {
    const [buses, setBuses] = useState<BusType[]>([])
    const [alerts, setAlerts] = useState<AlertType[]>([])
    const [transporters, setTransporters] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [tick, setTick] = useState(0)

    // Refs for intervals and abort controllers
    const abortControllerRef = useRef<AbortController | null>(null)

    useEffect(() => {
        // Load cached bus positions for instant display
        if (typeof window !== 'undefined') {
            const cachedBuses = localStorage.getItem('cached_buses')
            if (cachedBuses) {
                try {
                    setBuses(JSON.parse(cachedBuses))
                } catch (e) {
                    console.error('Failed to parse cached buses:', e)
                }
            }
        }

        fetchBuses()
        fetchMeta()

        // Setup polling intervals
        const busInterval = setInterval(fetchBuses, 10000)
        const metaInterval = setInterval(fetchMeta, 60000)

        // Cleanup
        return () => {
            clearInterval(busInterval)
            clearInterval(metaInterval)
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
        }
    }, [])

    const fetchBuses = useCallback(async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
        }
        const controller = new AbortController()
        abortControllerRef.current = controller

        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
            const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
            
            const res = await fetch(`/api/buses?_t=${Date.now()}`, { 
                headers,
                signal: controller.signal
            })
            
            if (res.ok) {
                const data = await res.json()
                const results = data.results || data
                setBuses(results)
                setLastUpdated(new Date())
                setError(null)
                
                // Cache results (throttle or debounce might be needed for very large lists, but doing it here is okay for now)
                if (typeof window !== 'undefined') {
                    localStorage.setItem('cached_buses', JSON.stringify(results))
                }
            } else {
                setError(`Failed to fetch buses: ${res.statusText}`)
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error('Bus fetch error:', err)
                setError('Failed to fetch bus data. Please check your connection.')
            }
        } finally {
            // Keep loading true on first mount, false on subsequent polls
            setLoading(prev => prev ? false : prev)
            setTick(t => t + 1) // Force re-render to ensure relative times update
        }
    }, [])

    const fetchMeta = useCallback(async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
            const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
            const ts = Date.now()
            
            const [alertRes, transRes] = await Promise.all([
                fetch(`/api/alerts?_t=${ts}`, { headers }),
                fetch(`/api/transporters?_t=${ts}`, { headers })
            ])
            
            if (alertRes.ok) { 
                const d = await alertRes.json()
                setAlerts(d.results || d) 
            }
            if (transRes.ok) { 
                const d = await transRes.json()
                setTransporters(d.results || d) 
            }
        } catch (err) {
            console.error('Meta fetch error:', err)
        }
    }, [])

    return { buses, alerts, transporters, loading, error, lastUpdated }
}
