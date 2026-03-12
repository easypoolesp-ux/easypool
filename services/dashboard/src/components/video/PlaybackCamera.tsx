'use client'

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

interface Props {
    hlsUrl: string // e.g., http://[GCP_VM_IP]:8888/bus101
    title?: string
}

export default function PlaybackCamera({ hlsUrl, title }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isReady, setIsReady] = useState(false)

    useEffect(() => {
        let hls: Hls | null = null

        if (videoRef.current) {
            if (Hls.isSupported()) {
                hls = new Hls()
                hls.loadSource(hlsUrl)
                hls.attachMedia(videoRef.current)
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsReady(true)
                })
            } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
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

    return (
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-border">
            {title && (
                <div className="absolute top-2 left-2 z-10 bg-black/60 px-2 py-1 rounded text-xs text-white font-medium">
                    {title}
                </div>
            )}

            <video
                ref={videoRef}
                autoPlay
                muted
                controls
                className="w-full h-full object-cover"
                poster="/api/placeholder/1280/720"
            />

            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            )}
        </div>
    )
}
