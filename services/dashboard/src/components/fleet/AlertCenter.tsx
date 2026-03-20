'use client'

import React from 'react'
import { AlertCircle, CheckCircle2, MapPin } from 'lucide-react'

interface AlertBus {
    id: string
    internal_id: string
}

interface Props {
    criticalBuses: AlertBus[]
    onViewBus?: (id: string) => void
}

const AlertCenter: React.FC<Props> = ({ criticalBuses, onViewBus }) => {
    const criticalCount = criticalBuses.length

    return (
        <div className={`overflow-hidden rounded-xl border transition-all duration-300 shadow-sm ${
            criticalCount > 0 
                ? 'bg-red-50/50 dark:bg-red-900/10 border-red-200/60 dark:border-red-800/20' 
                : 'bg-emerald-50/30 dark:bg-emerald-900/5 border-emerald-100/60 dark:border-emerald-800/10'
        }`}>
            <div className="p-3">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-2">
                    <h3 className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                        criticalCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                        {criticalCount > 0 ? (
                            <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                        ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        Alert Center
                    </h3>
                    
                    {criticalCount === 0 && (
                        <span className="text-[10px] font-bold text-emerald-500/80">System Healthy</span>
                    )}
                </div>

                {/* Body Content */}
                {criticalCount > 0 ? (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-red-500/80 mb-2">
                            {criticalCount} {criticalCount === 1 ? 'Bus' : 'Buses'} lost signal:
                        </p>
                        <div className="grid grid-cols-1 gap-1">
                            {criticalBuses.map(bus => (
                                <button
                                    key={bus.id}
                                    onClick={() => onViewBus?.(bus.id)}
                                    className="flex items-center justify-between p-2 rounded-lg bg-white/60 dark:bg-slate-900/40 border border-red-100/50 dark:border-red-800/10 hover:border-red-300 dark:hover:border-red-700 transition-all group"
                                >
                                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">
                                        {bus.internal_id}
                                    </span>
                                    <div className="flex items-center gap-1 text-red-500 group-hover:translate-x-0.5 transition-transform">
                                        <span className="text-[9px] font-bold">Track</span>
                                        <MapPin className="w-3 h-3" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 py-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 italic">
                            All buses currently connected and sending signal.
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AlertCenter
