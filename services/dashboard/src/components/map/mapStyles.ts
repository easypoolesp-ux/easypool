/**
 * mapStyles.ts — Google Maps style arrays.
 *
 * MONOCHROME strategy: `saturation: -100` strips all colour from the base tiles.
 * Bus markers then become the *only* coloured elements on screen, giving
 * dispatchers an instant, unambiguous visual scan.
 */

export const MONOCHROME_DARK: google.maps.MapTypeStyle[] = [
  { elementType: "all", stylers: [{ saturation: -100 }] },
  { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#334155" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0b1120" }],
  },
  { elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
];

export const MONOCHROME_LIGHT: google.maps.MapTypeStyle[] = [
  { elementType: "all", stylers: [{ saturation: -100 }] },
  { elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#e2e8f0" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#cbd5e1" }],
  },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
];

/** Standard dark theme (full colour, not monochrome) — used when toggle is OFF + dark mode ON */
export const DARK_DEFAULT: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#475569" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#334155" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0b1120" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#1e3a5f" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#131f35" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#14261e" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#243447" }],
  },
];
