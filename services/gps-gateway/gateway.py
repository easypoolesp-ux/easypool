import socket
import struct
import requests
import os
import redis
import json
import socketserver
import threading

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
IGNITION_IO_IDS = {239, 1}


def parse_codec8_packet(packet: bytes):
    try:
        if len(packet) < 26:
            return None

        codec_id    = packet[0]
        num_records = packet[1]
        if num_records == 0:
            return None

        # [Timestamp 8B][Priority 1B][Longitude 4B][Latitude 4B]
        # [Altitude 2B][Angle 2B][Satellites 1B][Speed 2B]
        ts_raw  = struct.unpack('>Q', packet[2:10])[0]
        lng_raw = struct.unpack('>i', packet[11:15])[0]
        lat_raw = struct.unpack('>i', packet[15:19])[0]
        angle   = struct.unpack('>H', packet[21:23])[0]
        speed   = struct.unpack('>H', packet[24:26])[0]

        lat       = lat_raw  / 10_000_000.0
        lng       = lng_raw  / 10_000_000.0
        timestamp = ts_raw   / 1000.0

        # ── IO element ────────────────────────────────────────────────────────
        io_base  = 26
        ignition = False
        
        if codec_id == 0x8E:
            if io_base + 4 <= len(packet):
                pos = io_base + 4
                for val_size in (1, 2, 4, 8):
                    if pos + 2 > len(packet): break
                    n = struct.unpack('>H', packet[pos:pos+2])[0]
                    pos += 2
                    for _ in range(n):
                        if pos + 2 + val_size > len(packet): break
                        io_id  = struct.unpack('>H', packet[pos:pos+2])[0]
                        io_val = int.from_bytes(packet[pos+2:pos+2+val_size], 'big')
                        pos   += 2 + val_size
                        if io_id in IGNITION_IO_IDS:
                            ignition = bool(io_val)

        else:
            if io_base + 2 <= len(packet):
                pos = io_base + 2
                for val_size in (1, 2, 4, 8):
                    if pos + 1 > len(packet): break
                    n   = packet[pos]
                    pos += 1
                    for _ in range(n):
                        if pos + 1 + val_size > len(packet): break
                        io_id  = packet[pos]
                        io_val = int.from_bytes(packet[pos+1:pos+1+val_size], 'big')
                        pos   += 1 + val_size
                        if io_id in IGNITION_IO_IDS:
                            ignition = bool(io_val)

        return {
            "lat": lat, "lng": lng, "speed": speed, "heading": angle,
            "timestamp": timestamp, "ignition": ignition
        }
    except Exception as exc:
        print(f"[ERROR] Parse failed: {exc}")
        return None


def forward_to_backend(imei: str, data: dict):
    payload = {
        "imei": imei, "lat": data["lat"], "lng": data["lng"],
        "speed": data["speed"], "heading": data["heading"],
        "ignition": data["ignition"], "timestamp": data["timestamp"],
    }
    
    # 1. Redis Publish
    if redis_client:
        try:
            redis_client.publish('live_bus_updates', json.dumps(payload))
        except: pass

    # 2. HTTP Forward
    try:
        requests.post(BACKEND_API_URL, json=payload,
                      headers={"X-API-KEY": API_KEY}, timeout=5)
    except: pass


def handle_client(conn: socket.socket, addr):
    try:
        conn.settimeout(60)  # Drop hung connections after 60s
        first = conn.recv(1024)
        if not first: return

        if len(first) == 15 and first.isdigit():
            imei = first.decode()
        elif len(first) > 2:
            imei_len = struct.unpack('>H', first[:2])[0]
            imei = first[2:].decode() if imei_len == len(first) - 2 else first.decode()[-15:]
        else: return

        conn.send(b'\x01')

        while True:
            prefix = conn.recv(8)
            if not prefix or len(prefix) < 8: break

            data_len = struct.unpack('>I', prefix[4:8])[0]
            raw = b""
            while len(raw) < data_len + 4:
                chunk = conn.recv((data_len + 4) - len(raw))
                if not chunk: break
                raw += chunk

            if len(raw) < data_len + 4: break

            body = raw[:-4]
            num_records = body[1]
            conn.send(struct.pack('>I', num_records))

            parsed = parse_codec8_packet(body)
            if parsed:
                forward_to_backend(imei, parsed)
    except Exception as exc:
        print(f"[ERROR] Connection {addr}: {exc}")
    finally:
        conn.close()


class GPSHandler(socketserver.BaseRequestHandler):
    def handle(self):
        handle_client(self.request, self.client_address)

class ThreadedGPSServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

def run_gateway():
    print(f"[START] Threaded Gateway on port {GATEWAY_PORT}")
    with ThreadedGPSServer(('0.0.0.0', GATEWAY_PORT), GPSHandler) as server:
        server.serve_forever()

if __name__ == "__main__":
    run_gateway()
