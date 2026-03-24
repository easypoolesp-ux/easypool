/**
 * fleetStatus.ts — Single source of truth for fleet status presentation.
 *
 * Backend sends status keys ('moving', 'idle', 'stopped', 'no_signal').
 * This file maps each key → color, label, and Tailwind classes.
 *
 * Every UI component (FleetMap, Dashboard, Donut) imports from here.
 * To change a color or label, edit ONLY this file.
 */

export interface StatusConfig {
  key: string;
  label: string;
  hex: string; // SVG / inline style color
  dot: string; // Tailwind class for small dots
  text: string; // Tailwind class for text
  bg: string; // Tailwind class for backgrounds
}

export const FLEET_STATUSES: StatusConfig[] = [
  {
    key: "moving",
    label: "Moving",
    hex: "#3b82f6",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    key: "idle",
    label: "Idle",
    hex: "#f59e0b",
    dot: "bg-amber-400",
    text: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    key: "ignition_off",
    label: "Stopped",
    hex: "#475569",
    dot: "bg-slate-600",
    text: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-500/10",
  },
  {
    key: "offline",
    label: "No Signal",
    hex: "#ef4444",
    dot: "bg-red-500",
    text: "text-red-500 dark:text-red-400",
    bg: "bg-red-500/10",
  },
];

/** Quick lookup by status key */
const STATUS_MAP = new Map(FLEET_STATUSES.map((s) => [s.key, s]));

/** Get config for a status key. Returns a neutral fallback for unknown keys. */
export function getStatusConfig(status: string): StatusConfig {
  return (
    STATUS_MAP.get(status) ?? {
      key: status,
      label: "Unknown",
      hex: "#94a3b8",
      dot: "bg-slate-400",
      text: "text-slate-400",
      bg: "bg-slate-400/10",
    }
  );
}

/** Get hex colour for a status key (convenience for SVGs/inline styles). */
export function getStatusColor(status: string): string {
  return getStatusConfig(status).hex;
}
