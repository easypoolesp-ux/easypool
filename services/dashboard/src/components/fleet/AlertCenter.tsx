'use client'

import React from 'react'
import { MapPin } from 'lucide-react'

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
        <div className={`rounded-xl border px-3 py-2 shadow-sm transition-all duration-300 ${
            criticalCount > 0 
                ? 'bg-red-50/50 dark:bg-red-900/10 border-red-200/60 dark:border-red-800/20' 
                : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/50 dark:border-slate-700/50'
        }`}>
            {/* Header / Counter */}
            <div className={`text-[10px] font-black uppercase tracking-widest flex items-center justify-between ${
                criticalCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'
            }`}>
                <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${criticalCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    Alerts: {criticalCount}
                </div>
            </div>

            {/* Critical List (Only if > 0) */}
            {criticalCount > 0 && (
                <div className="grid grid-cols-1 gap-1 mt-2">
                    {criticalBuses.map(bus => (
                        <button
                            key={bus.id}
                            onClick={() => onViewBus?.(bus.id)}
                            className="flex items-center justify-between p-2 rounded-lg bg-white/60 dark:bg-slate-900/40 border border-red-100/50 dark:border-red-800/10 hover:border-red-300 dark:hover:border-red-700 transition-all group"
                        >
                            <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">
                                {bus.internal_id}
                            </span>
                            <div className="flex items-center gap-1 text-red-500 group-hover:translate-x-0.5 transition-all">
                                <span className="text-[9px] font-bold">Pin</span>
                                <MapPin className="w-3 h-3" />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default AlertCenter
