# EasyPool Dashboard — Analysis & Action Plan

---

## 1. 🌙 Dark Map Not Applying

**Root cause confirmed in code:**
The map uses `colorScheme: 'DARK'` which is a *Google Maps Cloud-based Map Styling* feature. It only works when the `mapId` is a **Cloud-customised Map ID** created in [Google Cloud Console → Map Styles](https://console.cloud.google.com/google/maps-apis/studio/maps). Using `'DEMO_MAP_ID'` or a default mapId will **silently ignore** the colorScheme option.

**Fix required:**
1. Go to [Google Maps Platform → Map Management](https://console.cloud.google.com/google/maps-apis/studio/maps)
2. Create a new Map Style → choose **"Dark"** preset → save → copy the Map ID
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=<your-real-ID>` in [.env.local](file:///D:/easypool_2026/services/dashboard/.env.local) and as a Cloud Run build arg

The code itself (`colorScheme: currentTheme === 'dark' ? 'DARK' : 'LIGHT'`) is **correct** — it just needs a real Cloud Map ID.

---

## 2. 🗺️ UX Improvement Suggestions (Dashboard)

### A. Marker Colors — Improve from constant red
Current [getBusColor()](file:///D:/easypool_2026/services/dashboard/src/components/map/FleetMap.tsx#39-46):
- `moving` → Green ✅
- `idle` → Grey ✅
- `ignition_off` → Red ✅
- `offline/default` → Black ✅

**The "constant red" you see is because ignition is not being parsed from the device (see Issue 3).** Once ignition is fixed, statuses will reflect correctly. Additionally, we can:
- Add a **speed indicator** inside the label (e.g., `WB101 • 42 km/h`)
- Add **heading arrow** on the bus icon when moving (rotate SVG based on `heading` field)

### B. Live Trail Toggle — Recommendation
**Should we add a live trail on the main fleet map?**

Yes, with constraints:
- Show **last 2 hours** of trail points (not a full day — too much data)
- Fetch from `/api/gps/playback?bus=<id>&date=today` and filter to last 2h
- Show as a **dim, faded polyline** behind the current marker (opacity ~0.3)
- Add a **toggle button** (like the history button, but a "Live Trail" icon)
- This is different from history mode — live trail stays live, just shows recent path

**On Bus Detail page (single bus view):** Show a compact live trail automatically (no toggle needed), last 30 minutes.

### C. History Panel in Bus Detail Page
The playback timeline in `[busId]/page.tsx` currently shows **mock recordings**. It should pull from the real GPS history to match what the map shows. These should be synced.

### D. Blue "Pulse" Circle on Live Marker
The history playback marker already has the Google-style blue ping animation. We should add it for **live (online/moving) vehicles**, which we already partially do with `ep-ring`. Enhance this to also render the **outer blue pulse** (the classic "you are here" style).

### E. Other UX Wins (quick list)
| Item | Suggestion |
|------|-----------|
| Fleet list panel | Show speed alongside status (e.g., `32 km/h`) |
| Status dot colors | Match exactly to the 4 bus states (Green/Grey/Red/Black) |
| Timestamp | Show "Last seen: 3m ago" instead of raw time |
| Empty state | Show an illustration when no buses have GPS |
| Bus detail header | Show ignition status badge (🔑 ON / OFF) |
| Mobile | The fleet list collapses awkwardly; add a bottom sheet |

---

## 3. 🔥 Ignition Not Detected — Root Cause & Fix

### Diagnosis

**The VM is running `/tmp/gateway.py`** — an older/simpler version of the gateway, NOT the one in the repo at [/services/gps-gateway/gateway.py](file:///D:/easypool_2026/services/gps-gateway/gateway.py).

The old `/tmp/gateway.py` has a **buggy ignition parser** using unreliable byte-search patterns:
```python
# BUGGY — regex-style byte search in binary data (false positives & false negatives)
if b'\x00\x01\x01' in packet:   # Extended
    ignition = True
```

This approach fails because:
1. `0x00 0x01` (ID=1) could appear as GPS coordinate data coincidentally
2. The Codec 8 Extended IO structure requires proper offset-based parsing, not substring search
3. It reads `ignition = False` as default and never positively finds the DIN1=1 signal

### A proper Teltonika Codec 8 / 8E IO parser

The IO Data structure (after GPS element, 24 bytes into the AVL record):

```
For Codec 8:
  IO Event IO ID (1 byte)
  Total IO Count (1 byte)
  1-byte value IOs: count (1 byte), then N × [ID (1B) + Value (1B)]
  2-byte value IOs: ...
  4-byte value IOs: ...
  8-byte value IOs: ...

For Codec 8 Extended (codec_id = 142):
  IO Event IO ID (2 bytes)
  Total IO Count (2 bytes)
  1-byte value IOs: count (2 bytes), then N × [ID (2B) + Value (1B)]
  ...
```

DIN1 (digital input 1 = ignition wire) has **IO ID = 239** in Teltonika's default config.
Some older firmware uses IO ID = **1** for DIN1.

> **Action needed:** Check your Teltonika device configurator to confirm which IO ID your DIN1 is assigned to. Default is **239** (0xEF) for newer firmware.

### Fix — Deploy Updated Gateway

The repo already has the improved version (with proper io_base parsing). The issue is the old `/tmp/gateway.py` is still running on the VM. Fix:

```bash
# On the VM
cp ~/easypool/services/gps-gateway/gateway.py /tmp/gateway.py
# Kill and restart the process
kill $(pgrep -f gateway.py)
cd /tmp && nohup python3 gateway.py > /tmp/gateway.log 2>&1 &
```

But also add **raw packet logging** so you can see what the device is actually sending:

---

## 4. 🧭 Direction / Heading Data

**Good news:** The [GPSPoint](file:///D:/easypool_2026/services/dashboard/src/components/map/FleetMap.tsx#18-24) model **already has a `heading` field** (`FloatField(default=0)`).

**Bad news:** The gateway parser is NOT extracting the heading from the GPS element:

In [gateway.py](file:///D:/easypool_2026/services/gps-gateway/gateway.py), the GPS element structure is:
```
Longitude (4B) + Latitude (4B) + Altitude (2B) + Angle (2B) + Satellites (1B) + Speed (2B) = 15 bytes
```

The **Angle** (heading/bearing, 0–360°) is at bytes `[21:23]` of the AVL record — it IS being read but NOT forwarded to the backend.

### Fix needed in gateway.py:

```python
# Currently skipped:
# Angle: packet[21:23]

# Fix: extract and forward heading
angle_raw = struct.unpack('>H', packet[21:23])[0]  # 0-360 degrees

# Add to return dict:
return {
    "lat": ...,
    "lng": ...,
    "speed": speed_raw,
    "heading": angle_raw,   # ← ADD THIS
    "timestamp": ...,
    "ignition": ignition
}
```

And in [forward_to_backend](file:///D:/easypool_2026/services/gps-gateway/gateway.py#78-98), add `"heading": data["heading"]` to the payload.

The backend [telemetry](file:///D:/easypool_2026/services/backend/apps/gps/views.py#67-109) view also needs to extract `heading` and save it to [GPSPoint](file:///D:/easypool_2026/services/dashboard/src/components/map/FleetMap.tsx#18-24).

### Once heading works:
- Rotate the bus icon on the map using CSS `transform: rotate(Xdeg)`
- Show turning direction in the bus detail panel
- Add a compass in the live map marker

---

## Summary: Priority Actions

| Priority | Action | Where |
|----------|--------|--------|
| 🔴 Critical | Fix ignition detection — update gateway on VM | VM `/tmp/gateway.py` |
| 🔴 Critical | Add heading extraction to gateway | [gateway.py](file:///D:/easypool_2026/services/gps-gateway/gateway.py) + backend telemetry view |
| 🟡 High | Get real Google Maps Cloud Map ID for dark mode | Google Cloud Console |
| 🟡 High | Add live trail toggle on fleet map (last 2h) | [FleetMap.tsx](file:///D:/easypool_2026/services/dashboard/src/components/map/FleetMap.tsx) |
| 🟢 Medium | Rotate bus marker by heading angle | [FleetMap.tsx](file:///D:/easypool_2026/services/dashboard/src/components/map/FleetMap.tsx) |
| 🟢 Medium | Add ignition badge on bus detail page | `[busId]/page.tsx` |
| 🟢 Medium | Speed readout in fleet list | [dashboard/page.tsx](file:///D:/easypool_2026/services/dashboard/src/app/dashboard/page.tsx) |
