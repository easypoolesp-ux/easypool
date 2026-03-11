'use client'

import { useEffect, useRef } from 'react'

interface Props {
    streamUrl: string // e.g., http://[GCP_VM_IP]:8889/bus101
    title?: string
}

export default function LiveCamera({ streamUrl, title }: Props) {
    return (
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-border group">
            {title && (
                <div className="absolute top-2 left-2 z-10 bg-black/60 px-2 py-1 rounded text-xs text-white font-medium">
                    {title}
                </div>
            )}

            {/* 
        MediaMTX Recommendation: Live WebRTC is best embedded via iframe 
        for zero-lag and easy integration.
      */}
            <iframe
                src={streamUrl}
                className="w-full h-full border-none"
                allow="autoplay; fullscreen"
            />

            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1.5 bg-red-600 px-2 py-0.5 rounded text-[10px] text-white font-bold animate-pulse">
                    LIVE
                </div>
            </div>
        </div>
    )
}
