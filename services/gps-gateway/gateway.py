import socket
import struct
import requests
import os
import redis
import json

# ── Configuration ─────────────────────────────────────────────────────────────
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend-api/api/gps/telemetry")
API_KEY         = os.getenv("GPS_SERVICE_API_KEY", "easypool_gps_secret_2026")
GATEWAY_PORT    = int(os.getenv("GATEWAY_PORT", 5027))
REDIS_URL       = os.getenv("REDIS_URL", "redis://:easypool_live_redis_2026@127.0.0.1:6379/0")

# ── Redis Client ──────────────────────────────────────────────────────────────
try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
    print(f"[REDIS] Successfully connected to {REDIS_URL}")
except Exception as e:
    print(f"[ERROR] Redis connection failed: {e}")
    redis_client = None

# Teltonika DIN1 (ignition wire) IO IDs.
# Newer FMB920 firmware uses 239 (0xEF); older firmware may use 1.
# Both are checked so the parser works regardless of firmware version.
# Trigger CI/CD refresh. Correct Codec 8 / 8E IO parser.
IGNITION_IO_IDS = {239, 1}


def parse_codec8_packet(packet: bytes):
    """
    Full Teltonika Codec 8 / Codec 8 Extended (8E) parser.

    Codec 8  (codec_id = 0x08): IO IDs 1-byte, counts 1-byte
    Codec 8E (codec_id = 0x8E = 142): IO IDs 2-bytes, counts 2-bytes

    Returns dict(lat, lng, speed, heading, ignition, timestamp) or None.
    """
    try:
        if len(packet) < 26:
            print(f"[WARN] Packet too short ({len(packet)} B), skipping.")
            return None

        codec_id    = packet[0]
        num_records = packet[1]
        print(f"[PARSE] codec=0x{codec_id:02X}  records={num_records}  pkt_len={len(packet)}")

        if num_records == 0:
            return None

        # ── GPS element (first AVL record, index 2) ───────────────────────────
        # [Timestamp 8B][Priority 1B][Longitude 4B][Latitude 4B]
        # [Altitude 2B][Angle 2B][Satellites 1B][Speed 2B]  → 24 bytes total
        ts_raw  = struct.unpack('>Q', packet[2:10])[0]
        lng_raw = struct.unpack('>i', packet[11:15])[0]
        lat_raw = struct.unpack('>i', packet[15:19])[0]
        angle   = struct.unpack('>H', packet[21:23])[0]   # 0–360°
        speed   = struct.unpack('>H', packet[24:26])[0]   # km/h

        lat       = lat_raw  / 10_000_000.0
        lng       = lng_raw  / 10_000_000.0
        timestamp = ts_raw   / 1000.0

        print(f"[GPS] lat={lat:.6f} lng={lng:.6f} spd={speed} hdg={angle}°")

        # ── IO element (starts at byte 26) ────────────────────────────────────
        io_base  = 26
        ignition = False

        if codec_id == 0x8E:                              # Codec 8 Extended
            if io_base + 4 > len(packet):
                print("[WARN] Packet too short for 8E IO header")
            else:
                event_id = struct.unpack('>H', packet[io_base:io_base+2])[0]
                total_io = struct.unpack('>H', packet[io_base+2:io_base+4])[0]
                print(f"[IO/8E] event_id={event_id}  total_io={total_io}")
                pos = io_base + 4

                for val_size in (1, 2, 4, 8):
                    if pos + 2 > len(packet):
                        break
                    n = struct.unpack('>H', packet[pos:pos+2])[0]
                    pos += 2
                    for _ in range(n):
                        if pos + 2 + val_size > len(packet):
                            break
                        io_id  = struct.unpack('>H', packet[pos:pos+2])[0]
                        io_val = int.from_bytes(packet[pos+2:pos+2+val_size], 'big')
                        pos   += 2 + val_size
                        print(f"[IO/8E] id={io_id}  val={io_val}  ({val_size}B)")
                        if val_size == 1 and io_id in IGNITION_IO_IDS:
                            ignition = bool(io_val)
                            print(f"[IGNITION] id={io_id} → {'ON' if ignition else 'OFF'}")

        else:                                             # Codec 8 Standard
            if io_base + 2 > len(packet):
                print("[WARN] Packet too short for std IO header")
            else:
                event_id = packet[io_base]
                total_io = packet[io_base + 1]
                print(f"[IO/std] event_id={event_id}  total_io={total_io}")
                pos = io_base + 2

                for val_size in (1, 2, 4, 8):
                    if pos + 1 > len(packet):
                        break
                    n   = packet[pos]
                    pos += 1
                    for _ in range(n):
                        if pos + 1 + val_size > len(packet):
                            break
                        io_id  = packet[pos]
                        io_val = int.from_bytes(packet[pos+1:pos+1+val_size], 'big')
                        pos   += 1 + val_size
                        print(f"[IO/std] id={io_id}  val={io_val}  ({val_size}B)")
                        if val_size == 1 and io_id in IGNITION_IO_IDS:
                            ignition = bool(io_val)
                            print(f"[IGNITION] id={io_id} → {'ON' if ignition else 'OFF'}")

        return {
            "lat":       lat,
            "lng":       lng,
            "speed":     speed,
            "heading":   angle,
            "timestamp": timestamp,
            "ignition":  ignition,
        }

    except Exception as exc:
        import traceback
        print(f"[ERROR] Parse failed: {exc}")
        traceback.print_exc()
        return None


def forward_to_backend(imei: str, data: dict):
    """Posts parsed telemetry to the Django backend and publishes to Redis."""
    payload = {
        "imei":      imei,
        "lat":       data["lat"],
        "lng":       data["lng"],
        "speed":     data["speed"],
        "heading":   data["heading"],
        "ignition":  data["ignition"],
        "timestamp": data["timestamp"],
    }
    print(
        f"[→BACKEND] IMEI={imei}  lat={data['lat']:.6f}  lng={data['lng']:.6f}  "
        f"spd={data['speed']}  hdg={data['heading']}°  ign={'ON' if data['ignition'] else 'OFF'}"
    )
    
    # ── 1. Publish to Redis (Instant Live Update) ──────────────────────────
    if redis_client:
        try:
            redis_client.publish('live_bus_updates', json.dumps(payload))
            print(f"[OK] Redis   published IMEI={imei}")
        except Exception as e:
            print(f"[WARN] Redis publish failed: {e}")

    # ── 2. Forward to Backend HTTP (History/DB saving) ─────────────────────
    try:
        r = requests.post(BACKEND_API_URL, json=payload,
                          headers={"X-API-KEY": API_KEY}, timeout=5)
        if r.status_code == 200:
            print(f"[OK] Backend updated  IMEI={imei}")
        else:
            print(f"[FAIL] Backend {r.status_code}: {r.text[:300]}")
    except Exception as exc:
        print(f"[ERROR] Backend unreachable: {exc}")


def handle_client(conn: socket.socket, addr):
    print(f"\n[CONN] {addr} connected")
    try:
        # ── 1. IMEI handshake ────────────────────────────────────────────────
        first = conn.recv(1024)
        if not first:
            return

        print(f"[HANDSHAKE] hex={first.hex()}")

        if len(first) == 15 and first.isdigit():
            imei = first.decode()
        elif len(first) > 2:
            imei_len = struct.unpack('>H', first[:2])[0]
            imei = first[2:].decode() if imei_len == len(first) - 2 else first.decode()[-15:]
        else:
            print("[WARN] Bad handshake, closing.")
            return

        print(f"[HANDSHAKE] IMEI={imei}")
        conn.send(b'\x01')   # Accepted

        # ── 2. Data loop ─────────────────────────────────────────────────────
        while True:
            prefix = conn.recv(8)
            if not prefix:
                break
            if len(prefix) < 8:
                print(f"[WARN] Short prefix {prefix.hex()}, closing.")
                break

            data_len = struct.unpack('>I', prefix[4:8])[0]
            print(f"[PACKET] expecting {data_len} data bytes + 4 CRC")

            raw = b""
            while len(raw) < data_len + 4:
                chunk = conn.recv((data_len + 4) - len(raw))
                if not chunk:
                    break
                raw += chunk

            if len(raw) < data_len + 4:
                print("[WARN] Incomplete packet, closing.")
                break

            body        = raw[:-4]          # strip 4-byte CRC
            num_records = body[1]
            conn.send(struct.pack('>I', num_records))  # acknowledge

            print(f"[PACKET] hex(64B)={body[:64].hex()}")

            parsed = parse_codec8_packet(body)
            if parsed:
                forward_to_backend(imei, parsed)
            else:
                print("[WARN] Parser returned None — see hex dump above")

    except Exception as exc:
        import traceback
        print(f"[ERROR] Client handler: {exc}")
        traceback.print_exc()
    finally:
        conn.close()
        print(f"[CONN] {addr} closed")


def run_gateway():
    print(f"[START] Teltonika TCP Gateway  port={GATEWAY_PORT}")
    print(f"[START] Backend URL: {BACKEND_API_URL}")
    print(f"[START] Ignition IO IDs watched: {IGNITION_IO_IDS}")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('0.0.0.0', GATEWAY_PORT))
        s.listen(10)
        while True:
            conn, addr = s.accept()
            handle_client(conn, addr)


if __name__ == "__main__":
    run_gateway()
