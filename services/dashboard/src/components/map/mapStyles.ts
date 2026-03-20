/**
 * mapStyles.ts — Google Maps style arrays.
 *
 * MONOCHROME strategy: `saturation: -100` strips all colour from the base tiles.
 * Bus markers then become the *only* coloured elements on screen, giving
 * dispatchers an instant, unambiguous visual scan.
 */

export const MONOCHROME_DARK: google.maps.MapTypeStyle[] = [
    { elementType: 'all',        stylers: [{ saturation: -100 }] },
    { elementType: 'geometry',   stylers: [{ color: '#0f172a' }] },
    { featureType: 'road',       elementType: 'geometry',         stylers: [{ color: '#1e293b' }] },
    { featureType: 'road.highway', elementType: 'geometry',       stylers: [{ color: '#334155' }] },
    { featureType: 'water',      elementType: 'geometry',         stylers: [{ color: '#0b1120' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#475569' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
]

export const MONOCHROME_LIGHT: google.maps.MapTypeStyle[] = [
    { elementType: 'all',        stylers: [{ saturation: -100 }] },
    { elementType: 'geometry',   stylers: [{ color: '#f1f5f9' }] },
    { featureType: 'road',       elementType: 'geometry',         stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry',       stylers: [{ color: '#e2e8f0' }] },
    { featureType: 'water',      elementType: 'geometry',         stylers: [{ color: '#cbd5e1' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#64748b' }] },
]
