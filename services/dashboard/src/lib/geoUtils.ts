/** Convert PostGIS-computed series to lightweight-charts UTCTimestamp format.
 *  The backend already ran ST_Distance — values are pre-computed KM.  */
export interface KmPoint {
  timestamp: string;   // ISO string from backend
  cumulative_km: number;
}

export interface ChartPoint {
  time: number;   // Unix seconds (UTCTimestamp for lightweight-charts)
  value: number;  // cumulative KM
}

export function toChartSeries(series: KmPoint[]): ChartPoint[] {
  return series.map((pt) => ({
    time: Math.floor(new Date(pt.timestamp).getTime() / 1000),
    value: pt.cumulative_km,
  }));
}

/** Last value = total KM for the day */
export function totalKmFromSeries(series: KmPoint[]): number {
  return series.length > 0 ? series[series.length - 1].cumulative_km : 0;
}
