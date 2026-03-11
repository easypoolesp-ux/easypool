// All API calls use relative paths — routed through Next.js reverse proxy to the backend
const BASE_URL = ''

async function apiFetch<T>(
    endpoint: string,
    options?: RequestInit
): Promise<T> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

    const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...options,
    })

    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
}

export const fetchBuses = () =>
    apiFetch<any[]>('/api/buses')

export const fetchBusLocation = (busId: string) =>
    apiFetch<any>(`/api/gps/${busId}/latest`)
