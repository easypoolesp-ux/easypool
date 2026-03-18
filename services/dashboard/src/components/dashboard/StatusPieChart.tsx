'use client'

import React from 'react'

interface StatusPieChartProps {
    data: {
        moving: number
        idle: number
        ignition_off: number
        offline: number
    }
}

const COLORS = {
    moving: '#22c55e',       // Green
    idle: '#94a3b8',         // Grey
    ignition_off: '#ef4444', // Red
    offline: '#0f172a'        // Black
}

export default function StatusPieChart({ data }: StatusPieChartProps) {
    const total = Object.values(data).reduce((a, b) => a + b, 0)
    
    if (total === 0) return <div className="h-full flex items-center justify-center text-xs italic text-muted-foreground">No stats yet</div>

    // Calculate segments
    let currentAngle = 0
    const segments = Object.entries(data).map(([key, value]) => {
        const percentage = (value / total) * 100
        const angle = (value / total) * 360
        const startAngle = currentAngle
        currentAngle += angle
        
        // Circular arc path
        const x1 = Math.cos((startAngle - 90) * Math.PI / 180) * 40 + 50
        const y1 = Math.sin((startAngle - 90) * Math.PI / 180) * 40 + 50
        const x2 = Math.cos((currentAngle - 90) * Math.PI / 180) * 40 + 50
        const y2 = Math.sin((currentAngle - 90) * Math.PI / 180) * 40 + 50
        
        const largeArcFlag = angle > 180 ? 1 : 0
        
        const pathData = total === value ? 
            "M 50, 10 A 40, 40 0 1 1 49.99, 10 Z" : // Full circle case
            `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`

        return {
            key,
            value,
            percentage,
            pathData,
            color: COLORS[key as keyof typeof COLORS]
        }
    })

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="white" className="dark:fill-slate-900" />
                    {segments.map((s) => (
                        <path 
                            key={s.key} 
                            d={s.pathData} 
                            fill={s.color} 
                            className="transition-all hover:opacity-80 cursor-pointer"
                        />
                    ))}
                    <circle cx="50" cy="50" r="28" fill="white" className="dark:fill-slate-900" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black leading-none">{total}</span>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Buses</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full text-[10px] font-bold uppercase tracking-tight">
                {segments.map(s => (
                    <div key={s.key} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-muted-foreground flex-1">{s.key.replace('_', ' ')}</span>
                        <span className="tabular-nums">{s.value}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
