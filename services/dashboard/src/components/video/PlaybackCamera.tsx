'use client'

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Camera, Download, Loader2 } from 'lucide-react'

interface Props {
    hlsUrl: string // e.g., http://localhost:8888/bus101/index.m3u8
    title?: string
}

export default function PlaybackCamera({ hlsUrl, title }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isReady, setIsReady] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let hls: Hls | null = null

        if (videoRef.current && hlsUrl) {
            setIsReady(false)
            if (Hls.isSupported()) {
                hls = new Hls()
                hls.loadSource(hlsUrl)
                hls.attachMedia(videoRef.current)
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsReady(true)
                })
                hls.on(Hls.Events.ERROR, (_, data) => {
                    if (data.fatal) {
                        setError("Failed to load recording")
                    }
                })
            } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                videoRef.current.src = hlsUrl
                setIsReady(true)
            }
        }

        return () => {
            if (hls) {
                hls.destroy()
            }
        }
    }, [hlsUrl])

    const [isRequesting, setIsRequesting] = useState(false)
    const [requestStatus, setRequestStatus] = useState<string | null>(null)

    const takeSnapshot = () => {
        if (!videoRef.current) return
        const canvas = document.createElement('canvas')
        canvas.width = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0)
            const dataUrl = canvas.toDataURL('image/png')
            const link = document.createElement('a')
            link.href = dataUrl
            link.download = `playback_snap_${new Date().toISOString()}.png`
            link.click()
        }
    }

    const requestEvidence = async () => {
        setIsRequesting(true)
        setRequestStatus("Requesting from SD Card...")
        
        try {
            // Extraction of time from title or hlsUrl would be real logic
            // For demo, we use current timestamp
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/buses/request_evidence/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_time: new Date().toLocaleTimeString('en-GB').slice(0, 5),
                    duration: 60
                })
            })
            
            const data = await response.json()
            setRequestStatus(data.message)
            
            // Simulation: Wait 3 seconds then "finish"
            setTimeout(() => {
                const link = document.createElement('a')
                link.href = data.download_url
                link.download = `evidence_${new Date().getTime()}.mp4`
                link.target = "_blank"
                link.click()
                setIsRequesting(false)
                setRequestStatus(null)
            }, 3000)

        } catch (err) {
            setError("Request failed")
            setIsRequesting(false)
        }
    }

    return (
        <div className="relative w-full h-full bg-black rounded-lg overflow-hidden border border-border group flex items-center justify-center">
            {title && (
                <div className="absolute top-3 left-3 z-20 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] text-white font-bold uppercase tracking-widest border border-white/10 shadow-xl">
                    {title}
                </div>
            )}

            {isRequesting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md z-30 p-6 text-center animate-in fade-in duration-300">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <div className="space-y-2">
                        <h3 className="text-white font-bold text-sm tracking-tight">Syncing from Edge...</h3>
                        <p className="text-slate-400 text-[11px] leading-relaxed max-w-[200px]">
                            {requestStatus}
                        </p>
                    </div>
                </div>
            )}

            <video
                ref={videoRef}
                autoPlay
                muted
                controls
                className="w-full h-full object-contain"
            />

            {!isReady && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm z-10">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10 p-4 text-center">
                    <p className="text-red-400 text-sm font-medium">{error}</p>
                </div>
            )}

            <div className="absolute top-3 right-3 flex gap-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={takeSnapshot}
                    className="p-2 rounded-md bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/10 shadow-lg"
                    title="Take Snapshot"
                >
                    <Camera className="w-4 h-4" />
                </button>
                <button
                    onClick={requestEvidence}
                    disabled={isRequesting}
                    className="p-2 rounded-md bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/10 shadow-lg disabled:opacity-50"
                    title="Download Evidence"
                >
                    <Download className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}
