"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  LineSeries,
  IChartApi,
  ISeriesApi,
  Time,
} from "lightweight-charts";
import { BusTimeline } from "@/hooks/useTimelineData";
import { toChartSeries } from "@/lib/geoUtils";

export const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6",
];

interface Props {
  data: BusTimeline[];
  isLoading: boolean;
}

type LineSeriesType = ISeriesApi<"Line", Time>;

export default function KmChart({ data, isLoading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMap = useRef<Map<string, LineSeriesType>>(new Map());

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.07)", style: LineStyle.Dashed },
        horzLines: { color: "rgba(148,163,184,0.07)", style: LineStyle.Dashed },
      },
      crosshair: {
        vertLine: { color: "rgba(148,163,184,0.5)", labelBackgroundColor: "#1e293b" },
        horzLine: { color: "rgba(148,163,184,0.5)", labelBackgroundColor: "#1e293b" },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.1)",
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.1)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesMap.current.clear();
    };
  }, []);

  // Sync series whenever data changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const newIds = new Set(data.map((b) => b.bus_id));

    // Remove stale series
    seriesMap.current.forEach((series, id) => {
      if (!newIds.has(id)) {
        chart.removeSeries(series);
        seriesMap.current.delete(id);
      }
    });

    // Add / update series
    data.forEach((bus, idx) => {
      const color = PALETTE[idx % PALETTE.length];
      const chartData = toChartSeries(bus.series);
      if (!chartData.length) return;

      let series = seriesMap.current.get(bus.bus_id);
      if (!series) {
        // v5 API: addSeries(LineSeries, options)
        series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          lastValueVisible: true,
          priceLineVisible: false,
          title: bus.internal_id,
        });
        seriesMap.current.set(bus.bus_id, series);
      }
      series.setData(chartData);
    });

    if (data.length > 0) chart.timeScale().fitContent();
  }, [data]);

  return (
    <div className="relative w-full h-full min-h-[300px]">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm rounded-2xl">
          <span className="text-slate-400 text-sm animate-pulse">Loading chart…</span>
        </div>
      )}
      {!isLoading && data.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
          <span className="text-3xl">📈</span>
          <p className="text-sm">No GPS data for this date range.</p>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
