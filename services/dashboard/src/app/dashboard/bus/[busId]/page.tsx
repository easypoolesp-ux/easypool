'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Bus, Camera, MapPin, History, ArrowLeft, Clock } from 'lucide-react'
import Link from 'next/link'
import LiveCamera from '@/components/video/LiveCamera'
import PlaybackCamera from '@/components/video/PlaybackCamera'
import FleetMap from '@/components/map/FleetMap'
import { components } from '@/types/api'

import UserProfile from '@/components/layout/UserProfile'

interface Props {
    params: {
        busId: string
    }
}

type BusDetail = components['schemas']['BusDetail']

export default function BusDetailPage({ params }: Props) {
    const { busId } = params
    const [activeTab, setActiveTab] = useState('live')
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
    const [selectedRecording, setSelectedRecording] = useState<string | null>(null)
    const [selectedCamera, setSelectedCamera] = useState<string>('')
    const [bus, setBus] = useState<BusDetail | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (bus?.cameras && bus.cameras.length > 0 && !selectedCamera) {
            setSelectedCamera(bus.cameras[0].stream_slug || '')
        }
    }, [bus, selectedCamera])

    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = localStorage.getItem('token')
                // Standardized path from single source of truth, trailing slash removed for best practice proxying
                const res = await fetch(`/api/buses/${busId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                if (res.ok) {
                    const data = await res.json()
                    setBus(data)
                }
            } catch (err) {
                console.error("Failed to fetch bus detail:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
        const interval = setInterval(fetchData, 10000) // Poll every 10s
        return () => clearInterval(interval)
    }, [busId])

    if (loading) return <div className="p-6 text-center">Loading monitor...</div>
    if (!bus) return <div className="p-6 text-center text-red-500">Bus not found</div>

    const getStatusInfo = (lastHeartbeat: string | null) => {
        if (!lastHeartbeat) return { label: 'NO DATA', color: 'text-slate-300', dot: 'bg-slate-200' }
        const last = new Date(lastHeartbeat).getTime()
        const now = new Date().getTime()
        const diffMinutes = (now - last) / (1000 * 60)

        if (diffMinutes < 2) return { label: 'LIVE', color: 'text-green-600', dot: 'bg-green-500 animate-pulse' }
        
        if (diffMinutes < 60) {
            return { label: `${Math.round(diffMinutes)}m AGO`, color: 'text-amber-500', dot: 'bg-amber-400' }
        }
        
        const diffHours = Math.round(diffMinutes / 60)
        if (diffHours < 24) {
            return { label: `${diffHours}h AGO`, color: 'text-orange-500', dot: 'bg-orange-400' }
        }

        return { label: `${Math.round(diffHours / 24)}d AGO`, color: 'text-slate-400', dot: 'bg-slate-300' }
    }

    const busMapData = {
        id: (bus as any).id,
        internal_id: bus.internal_id,
        status: bus.status || 'offline',
        lat: (bus as any).lat,
        lng: (bus as any).lng,
        plate: bus.plate_number
    }

    const recordings = [
        { id: 'rec-1', time: '10:30 AM', duration: '15m 30s', type: 'Normal' },
        { id: 'rec-2', time: '12:15 PM', duration: '10m 00s', type: 'Event' },
        { id: 'rec-3', time: '02:45 PM', duration: '20m 15s', type: 'Normal' },
        { id: 'rec-4', time: '04:00 PM', duration: '05m 45s', type: 'Normal' },
    ]

    // Dynamic Media Gateway URL (Cloud or Local)
    const MEDIA_GATEWAY_URL = process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL
    const WHEP_PORT = '8889'
    const HLS_PORT = '8888'

    const activeCamera = bus?.cameras?.find(c => c.stream_slug === selectedCamera)
    
    // PUBLIC TEST STREAM (Zero-Install fallback)
    const TEST_LIVE_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

    // Live URL: Prioritize Gateway WHEP, then internal stream_url, then fallback
    const liveUrl = activeCamera?.stream_slug && MEDIA_GATEWAY_URL
        ? `${MEDIA_GATEWAY_URL}:${WHEP_PORT}/${activeCamera.stream_slug}`
        : activeCamera?.stream_url || TEST_LIVE_URL

    // HLS URL: Prioritize Recordings, then Gateway HLS, then fallback
    const hlsUrl = selectedRecording && MEDIA_GATEWAY_URL
        ? `${MEDIA_GATEWAY_URL}:${HLS_PORT}/${busId}/recordings/${selectedRecording}.m3u8`
        : activeCamera?.stream_slug && MEDIA_GATEWAY_URL
            ? `${MEDIA_GATEWAY_URL}:${HLS_PORT}/${activeCamera.stream_slug}`
            : activeCamera?.stream_url || TEST_LIVE_URL

    const handleRecordingClick = (recId: string) => {
        setSelectedRecording(recId)
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard"
                        className="p-2 hover:bg-muted rounded-full transition-colors group"
                        title="Back to Fleet Overview"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Bus className="w-8 h-8 text-primary" />
                        Bus Monitoring: {bus.internal_id}
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    {(() => {
                        const status = getStatusInfo((bus as any).last_heartbeat)
                        return (
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border shadow-sm text-xs font-bold uppercase tracking-wider ${status.color}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                {status.label}
                            </div>
                        )
                    })()}
                    <UserProfile />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="overflow-hidden border-none shadow-premium">
                        <CardHeader className="bg-muted/30 pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Camera className="w-4 h-4" />
                                    Video Gateway
                                </CardTitle>
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                                    <TabsList className="h-8 p-0.5 bg-muted/60">
                                        <TabsTrigger value="live" className="text-[10px] h-7 px-3 uppercase">Live View</TabsTrigger>
                                        <TabsTrigger value="playback" className="text-[10px] h-7 px-3 uppercase">Recordings</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                            {activeTab === 'live' && bus?.cameras && bus.cameras.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {bus.cameras.map(cam => (
                                        <button
                                            key={cam.id}
                                            onClick={() => setSelectedCamera(cam.stream_slug!)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${selectedCamera === cam.stream_slug ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'}`}
                                        >
                                            {cam.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="p-0 bg-black aspect-video relative">
                            {(!bus.cameras || bus.cameras.length === 0) ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10 text-center p-6 space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                                        <Camera className="w-8 h-8 text-slate-600" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-white font-bold">No Cameras Configured</h3>
                                        <p className="text-slate-400 text-sm max-w-[280px]">This vehicle does not have any active camera streams assigned.</p>
                                    </div>
                                </div>
                            ) : activeTab === 'live' ? (
                                <LiveCamera streamUrl={liveUrl} title={activeCamera?.name || "Bus Camera"} />
                            ) : (
                                <>
                                    <PlaybackCamera
                                        hlsUrl={hlsUrl}
                                        busId={busId}
                                        title={selectedRecording
                                            ? `Recording: ${selectedDate} ${recordings.find(r => r.id === selectedRecording)?.time}`
                                            : "Select a recording to play"}
                                    />
                                    {!selectedRecording && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
                                            <div className="text-center space-y-2">
                                                <Camera className="w-12 h-12 text-muted-foreground mx-auto" />
                                                <p className="text-white font-medium">Select a clip from the list to start playback</p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {activeTab === 'playback' && (
                        <Card className="border-none shadow-premium bg-slate-900/50 backdrop-blur-md">
                            <CardHeader className="flex flex-row items-center justify-between py-4">
                                <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-primary" />
                                    Visual Timeline
                                </CardTitle>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Select Date:</span>
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="text-xs bg-slate-800 border border-white/5 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary/40 text-white"
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="pb-6">
                                {/* Visual Scrubber */}
                                <div className="mb-8 px-2">
                                    <div className="flex justify-between text-[9px] text-slate-500 font-bold mb-2 uppercase tracking-tighter">
                                        <span>06:00 AM</span>
                                        <span>12:00 PM</span>
                                        <span>06:00 PM</span>
                                    </div>
                                    <div className="relative h-10 w-full bg-slate-800/50 rounded-xl border border-white/5 overflow-hidden flex items-center p-1">
                                        {/* Available Slots Map */}
                                        <div className="absolute inset-0 flex items-center px-1">
                                            {recordings.map((rec) => {
                                                // Simple percentage calculation for demo (assumes school day 6am-6pm)
                                                const timeParts = rec.time.split(':');
                                                const hour = parseInt(timeParts[0]);
                                                const min = parseInt(timeParts[1]);
                                                const totalMinutes = (hour * 60 + min) - (6 * 60);
                                                const percentage = Math.max(0, Math.min(100, (totalMinutes / (12 * 60)) * 100));
                                                
                                                return (
                                                    <div 
                                                        key={`slot-${rec.id}`}
                                                        className={`absolute h-6 w-1 rounded-full cursor-pointer transition-all hover:scale-y-125 ${
                                                            selectedRecording === rec.id ? 'bg-primary shadow-[0_0_10px_rgba(37,99,235,0.5)] z-20 h-8' : 'bg-primary/30 z-10'
                                                        }`}
                                                        style={{ left: `${percentage}%` }}
                                                        onClick={() => handleRecordingClick(rec.id)}
                                                        title={`${rec.time} - ${rec.type}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                        {/* Timeline Base Line */}
                                        <div className="w-full h-[1px] bg-white/10" />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-2 italic">Tip: Click the vertical blue lines to jump to a specific time.</p>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    {recordings.map((rec) => (
                                        <button
                                            key={rec.id}
                                            onClick={() => handleRecordingClick(rec.id)}
                                            className={`p-3 rounded-xl border text-left transition-all group ${selectedRecording === rec.id
                                                ? 'bg-primary/10 border-primary ring-1 ring-primary shadow-lg shadow-primary/10'
                                                : 'hover:bg-white/5 border-white/5 bg-slate-800/30'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="text-xs font-bold leading-none text-white">{rec.time}</p>
                                                {rec.type === 'Event' && (
                                                    <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-medium">{rec.duration} • {rec.type}</p>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(bus.cameras || []).filter(c => c.stream_slug !== selectedCamera).map(cam => (
                            <div key={cam.id} className="aspect-video bg-slate-900 rounded-lg flex flex-col items-center justify-center border border-border group relative overflow-hidden">
                                <div className="absolute top-2 left-2 z-10 bg-black/60 px-2 py-0.5 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                                    {cam.name}
                                </div>
                                <div className="text-center space-y-2">
                                    <Camera className="w-6 h-6 text-slate-700 mx-auto" />
                                    <button
                                        onClick={() => setSelectedCamera(cam.stream_slug!)}
                                        className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase"
                                    >
                                        Switch to this view
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-6">
                    <Card className="shadow-premium border-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                Live Location
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="aspect-square bg-muted rounded-xl overflow-hidden border border-border shadow-inner relative group">
                                <FleetMap 
                                    buses={[busMapData]} 
                                    initialBusId={(bus as any).id}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground uppercase font-bold">Vehicle ID</span>
                                    <span className="font-bold">{bus.internal_id}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground uppercase font-bold">Plate Number</span>
                                    <span className="font-bold">{bus.plate_number}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground uppercase font-bold">Route</span>
                                    <span className="font-bold">{bus.route?.name || 'Unassigned'}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-premium border-none">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <History className="w-4 h-4" />
                                Recent Alerts
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border">
                                <div className="p-4 text-center text-xs text-muted-foreground">
                                    No active alerts for this vehicle
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
