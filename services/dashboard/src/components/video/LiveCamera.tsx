'use client'

import { useEffect, useRef } from 'react'
import { ShieldAlert, ExternalLink } from 'lucide-react'

interface Props {
    streamUrl: string // e.g., http://[GCP_VM_IP]:8889/bus101
    title?: string
}

export default function LiveCamera({ streamUrl, title }: Props) {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const isStreamHttp = streamUrl.startsWith('http://')
    const isBlocked = isHttps && isStreamHttp

    return (
        <div className="relative w-full h-full bg-slate-950 rounded-lg overflow-hidden border border-border group">
            {title && (
                <div className="absolute top-3 left-3 z-20 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] text-white font-bold uppercase tracking-widest border border-white/10 shadow-xl">
                    {title}
                </div>
            )}

            {isBlocked ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm z-10 p-8 text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                        <ShieldAlert className="w-8 h-8 text-amber-500" />
                    </div>
                    <div className="space-y-2 max-w-sm">
                        <h3 className="text-white font-bold text-base leading-tight">Secure Connection Required</h3>
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Your browser blocked this video stream because it is being served over insecure HTTP, while this dashboard is using HTTPS.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <a
                            href={streamUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-600/20"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open Stream in New Tab
                        </a>
                    </div>
                    <p className="text-[10px] text-slate-500 italic max-w-xs leading-tight">
                        Note: Once the new tab opens, you may need to click "Advanced" and "Proceed" if your browser shows a safety warning for the VM's IP address.
                    </p>
                </div>
            ) : (
                <iframe
                    src={streamUrl}
                    className="w-full h-full border-none"
                    allow="autoplay; fullscreen"
                />
            )}

            <div className="absolute top-3 right-3 flex gap-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded-md text-[9px] text-white font-black tracking-tighter animate-pulse shadow-lg shadow-red-600/20">
                    LIVE
                </div>
            </div>
        </div>
    )
}
