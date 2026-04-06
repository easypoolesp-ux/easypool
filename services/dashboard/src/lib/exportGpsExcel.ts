/**
 * exportGpsExcel — Converts GPS history points into a downloadable Excel file.
 *
 * Uses SheetJS (xlsx) — purely client-side, no backend changes needed.
 * All timestamps are converted to IST (Asia/Kolkata) for readability.
 */

import * as XLSX from "xlsx";

export interface GpsExportPoint {
  lat?: number | null;
  lng?: number | null;
  location?: { type: string; coordinates: [number, number] } | null;
  speed?: number | null;
  heading?: number | null;
  ignition?: boolean | null;
  timestamp: string;
}

export interface ExportOptions {
  busId: string;
  busInternalId: string;
  plateNumber: string;
  startDate: string;
  endDate: string;
  startTime?: string; // HH:MM, optional
  endTime?: string;   // HH:MM, optional
  points: GpsExportPoint[];
}

/** Format a UTC ISO timestamp to IST human-readable string */
function toIST(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

export function exportGpsExcel(options: ExportOptions): void {
  const { busInternalId, plateNumber, startDate, endDate, startTime, endTime, points } = options;

  if (points.length === 0) {
    alert("No GPS data available for the selected date range.");
    return;
  }

  // ── Report metadata ─────────────────────────────────────────────────────────
  const generatedAt = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  }).format(new Date());

  const fromLabel = startTime ? `${startDate} ${startTime}` : startDate;
  const toLabel   = endTime   ? `${endDate} ${endTime}`     : endDate;

  // Header rows — written as raw AOA (array-of-arrays) before GPS data
  const headerRows: (string | number)[][] = [
    ["EasyPool GPS Report"],
    [],
    ["Bus ID",          busInternalId],
    ["Plate Number",    plateNumber],
    ["Period (From)",   fromLabel],
    ["Period (To)",     toLabel],
    ["Total Pings",     points.length],
    ["Report Generated", generatedAt + " IST"],
    [],  // blank spacer row
  ];
  // Column headers + data rows, merged after the metadata header block
  const columnHeaders = ["#", "Bus ID", "Plate Number", "Timestamp (IST)",
    "Latitude", "Longitude", "Speed (km/h)", "Heading (°)", "Ignition"];

  const gpsDataRows: (string | number)[][] = points.map((p, idx) => {
    const lat = p.lat ?? p.location?.coordinates?.[1] ?? null;
    const lng = p.lng ?? p.location?.coordinates?.[0] ?? null;
    return [
      idx + 1,
      busInternalId,
      plateNumber,
      toIST(p.timestamp),
      lat != null ? Number(lat.toFixed(6)) : "",
      lng != null ? Number(lng.toFixed(6)) : "",
      p.speed != null ? Number(p.speed.toFixed(1)) : 0,
      p.heading != null ? Number(p.heading.toFixed(1)) : 0,
      p.ignition ? "ON" : "OFF",
    ];
  });

  // Build the full sheet: metadata header + blank + column headers + data
  const fullAoa: (string | number)[][] = [
    ...headerRows,
    columnHeaders,
    ...gpsDataRows,
  ];

  const gpsSheet = XLSX.utils.aoa_to_sheet(fullAoa);
  gpsSheet["!cols"] = [
    { wch: 6 },   // #
    { wch: 14 },  // Bus ID
    { wch: 14 },  // Plate
    { wch: 24 },  // Timestamp
    { wch: 13 },  // Lat
    { wch: 13 },  // Lng
    { wch: 14 },  // Speed
    { wch: 13 },  // Heading
    { wch: 10 },  // Ignition
  ];

  // ── Sheet 2: Daily Summary ───────────────────────────────────────────────────
  // Group points by IST date, compute total KM per day
  const dayMap = new Map<string, { points: GpsExportPoint[]; totalKm: number }>();

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const istDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date(p.timestamp));

    if (!dayMap.has(istDate)) dayMap.set(istDate, { points: [], totalKm: 0 });
    dayMap.get(istDate)!.points.push(p);
  }

  // Compute distance between consecutive points (Haversine)
  function haversineKm(
    lat1: number, lng1: number,
    lat2: number, lng2: number
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const summaryRows: Record<string, unknown>[] = [];
  Array.from(dayMap.entries()).forEach(([date, dayData]) => {
    let totalKm = 0;
    const pts = dayData.points;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const prevLat = prev.lat ?? prev.location?.coordinates?.[1];
      const prevLng = prev.lng ?? prev.location?.coordinates?.[0];
      const currLat = curr.lat ?? curr.location?.coordinates?.[1];
      const currLng = curr.lng ?? curr.location?.coordinates?.[0];
      if (
        prevLat != null && prevLng != null &&
        currLat != null && currLng != null
      ) {
        totalKm += haversineKm(prevLat, prevLng, currLat, currLng);
      }
    }

    // Count ON / OFF ignition events
    const ignitionOn = pts.filter((p: GpsExportPoint) => p.ignition).length;
    const maxSpeed = Math.max(...pts.map((p: GpsExportPoint) => p.speed ?? 0));

    summaryRows.push({
      "Date": date,
      "Bus ID": busInternalId,
      "Plate Number": plateNumber,
      "Total Pings": pts.length,
      "Distance (km)": Number(totalKm.toFixed(2)),
      "Max Speed (km/h)": Number(maxSpeed.toFixed(1)),
      "Ignition ON Pings": ignitionOn,
    });
  });

  // Sort by date ascending
  summaryRows.sort((a, b) => String(a["Date"]).localeCompare(String(b["Date"])));

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet["!cols"] = [
    { wch: 13 }, { wch: 14 }, { wch: 14 }, { wch: 13 },
    { wch: 15 }, { wch: 18 }, { wch: 20 },
  ];

  // ── Assemble workbook ────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, gpsSheet, "GPS Points");
  XLSX.utils.book_append_sheet(wb, summarySheet, "Daily Summary");

  // File name: BusID_PlateNumber_FROMDATE_TODATE.xlsx
  const fileName = `GPS_${busInternalId}_${plateNumber}_${startDate}_to_${endDate}.xlsx`
    .replace(/\s+/g, "_");

  XLSX.writeFile(wb, fileName);
}
