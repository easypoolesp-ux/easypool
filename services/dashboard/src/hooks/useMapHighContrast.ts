"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "map_high_contrast";
const EVENT_NAME = "map:highContrastChange";

/**
 * Persists the "Monochrome Map" toggle state in localStorage.
 * Broadcasts changes via a CustomEvent so any component (e.g. FleetMap)
 * can react without prop-drilling.
 *
 * Default: ON (true).
 */
export function useMapHighContrast() {
  const [enabled, setEnabled] = useState(true);

  // Hydrate from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setEnabled(saved === "true");
  }, []);

  const toggle = () => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
      return next;
    });
  };

  return { enabled, toggle };
}

/**
 * Read-only side: subscribes to changes broadcast by `useMapHighContrast`.
 * Use this in FleetMap to avoid prop-drilling through the page.
 */
export function useMapHighContrastListener() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    const handler = (e: Event) =>
      setEnabled((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  return enabled;
}
