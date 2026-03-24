import asyncio
import struct
import aiohttp
import os
import redis.asyncio as redis
import json

# ── Configuration ─────────────────────────────────────────────────────────────
# BASE_URL must end with /api/gps/ -- the script appends the action name perfectly.
BACKEND_BASE_URL = os.getenv("BACKEND_API_URL", "https://easypool-backend-222076803846.asia-south1.run.app/api/gps/")
API_KEY          = os.getenv("GPS_SERVICE_API_KEY", "easypool_gps_secret_2026")
GATEWAY_PORT     = int(os.getenv("GATEWAY_PORT", 5027))
REDIS_URL        = os.getenv("REDIS_URL", "redis://:easypool_live_redis_2026@127.0.0.1:6379/0")

# API Endpoints (Derived from openapi.yaml SSOT)
ENDPOINT_TELEMETRY      = "telemetry"
ENDPOINT_BULK_TELEMETRY = "bulk_telemetry"

# ── Global Clients ────────────────────────────────────────────────────────────
redis_client = None
http_session = None

# Teltonika DIN1 (ignition wire) IO IDs.
IGNITION_IO_IDS = {239, 1}


async def init_clients():
    global redis_client, http_session
    try:
        # decode_responses=True is essential for string handling
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        await redis_client.ping()
        print(f"[REDIS] Connected to {REDIS_URL}")
        
        timeout = aiohttp.ClientTimeout(total=5)
        http_session = aiohttp.ClientSession(
            timeout=timeout, headers={"X-API-KEY": API_KEY}
        )
        print("[HTTP] Session initialized")
    except Exception as e:
        print(f"[ERROR] Initialization failed: {e}")
        redis_client = None
        http_session = None


def parse_codec8_packet(packet: bytes):
    """Sync parsing logic for Teltonika Codec 8."""
    try:
        if len(packet) < 26:
            return None

        # Basic Codec 8 Check
        # packet[0] = Codec ID (8 or 8E)
        # packet[1] = Number of Data records
        ts_raw = struct.unpack(">Q", packet[2:10])[0]
        lng_raw = struct.unpack(">i", packet[11:15])[0]
        lat_raw = struct.unpack(">i", packet[15:19])[0]
        alt = struct.unpack(">H", packet[19:21])[0]
        angle = struct.unpack(">H", packet[21:23])[0]
        sat = packet[23]
        speed = struct.unpack(">H", packet[24:26])[0]

        lat = lat_raw / 10000000.0
        lng = lng_raw / 10000000.0
        timestamp = ts_raw / 1000.0

        # IO Elements (simplified check for ignition)
        ignition = False
        pos = 26
        if pos + 1 <= len(packet):
            # Event ID (1 byte)
            # Total IO count (1 byte)
            pos += 2 
            for val_size in (1, 2, 4, 8):
                if pos + 1 > len(packet): break
                n = packet[pos] # Count of IOs with this size
                pos += 1
                for _ in range(n):
                    if pos + 1 + val_size > len(packet): break
                    io_id = packet[pos]
                    io_val = int.from_bytes(packet[pos+1 : pos+1+val_size], "big")
                    pos += 1 + val_size
                    if io_id in IGNITION_IO_IDS:
                        ignition = bool(io_val)

        return {
            "lat": lat,
            "lng": lng,
            "speed": speed,
            "heading": angle,
            "timestamp": timestamp,
            "ignition": ignition,
        }
    except Exception as exc:
        print(f"[ERROR] Parse failed: {exc}")
        return None


async def forward_to_backend(imei: str, data: dict):
    """Async forwarding to Redis and Django Backend."""
    payload = {
        "imei": imei,
        "coords": [data["lng"], data["lat"]],
        "speed": data["speed"],
        "heading": data["heading"],
        "ignition": data["ignition"],
        "timestamp": data["timestamp"],
    }

    # 1. Path A: Instant Live Hub (Redis Pub/Sub)
    if redis_client:
        try:
            payload_str = json.dumps(payload)
            await redis_client.publish('live_bus_updates', payload_str)
            
            # 2. Path B: Persistence Queue (for Bulk SQL)
            await redis_client.lpush('gps_offline_queue', payload_str)
        except Exception as e:
            print(f"[ERROR] Redis push failed: {e}")


async def sync_queue_to_backend():
    """Smarter background task with Adaptive Batching."""
    print("[SYNC] Started high-performance adaptive sync")
    
    while True:
        if not redis_client or not http_session:
            await asyncio.sleep(5)
            continue
            
        try:
            q_len = await redis_client.llen('gps_offline_queue')
            if q_len == 0:
                await asyncio.sleep(2)
                continue

            # Adaptive Batching
            batch_size = 200 if q_len > 500 else 50
            
            # Multi-pop
            items = await redis_client.rpop('gps_offline_queue', count=batch_size)
            if not items:
                continue

            if isinstance(items, (str, bytes)):
                items = [items]
            
            payload_batch = [json.loads(p) for p in items]
            
            async with http_session.post(
            BACKEND_BASE_URL.rstrip('/') + "/" + ENDPOINT_BULK_TELEMETRY,
            json=payload_batch,
            headers={"X-API-KEY": API_KEY},
            timeout=10
        ) as resp:
                if resp.status not in [200, 201]:
                    print(f"[ERROR] Bulk Backend returned {resp.status}, requeuing...")
                    for p_str in reversed(items):
                        await redis_client.rpush('gps_offline_queue', p_str)
                    await asyncio.sleep(5) 
                else:
                    if q_len > 500:
                        print(f"[SYNC] Flushed large batch: {len(payload_batch)} items")
        except Exception as e:
            print(f"[ERROR] Sync task failed: {e}")
            await asyncio.sleep(5)


async def handle_bus(reader, writer):
    """Handle an individual bus connection asynchronously."""
    addr = writer.get_extra_info("peername")
    print(f"[CONN] {addr} connected")
    imei = None

    try:
        # Handshake: IMEI Receipt
        try:
            first = await asyncio.wait_for(reader.read(1024), timeout=60)
            if not first: return

            if len(first) == 15 and first.isdigit():
                imei = first.decode()
            elif len(first) > 2:
                # Teltonika sends 2B length + IMEI string
                imei_raw = first[2:17]
                if len(imei_raw) == 15:
                    imei = imei_raw.decode()
            
            if imei:
                print(f"[AUTH] {imei} identified")
                writer.write(b'\x01') # Accept connection
                await writer.drain()
            else:
                print(f"[AUTH-FAIL] Could not identify {addr}")
                return

        except asyncio.TimeoutError:
            print(f"[TIMEOUT] No handshake from {addr}")
            return

        # Data Stream
        while True:
            try:
                data = await asyncio.wait_for(reader.read(1024), timeout=120)
                if not data: break
                
                # Teltonika packets usually start with 4 bytes of 0s
                # Then 4 bytes of length, then Codec, then Data...
                if len(data) > 12 and data[0:4] == b'\x00\x00\x00\x00':
                    # Extract body (Codec ID onwards)
                    body = data[8:-4] 
                    parsed = parse_codec8_packet(body)
                    if parsed:
                        asyncio.create_task(forward_to_backend(imei, parsed))
                
            except asyncio.TimeoutError:
                break

    except Exception as exc:
        print(f"[ERROR] Session {imei or addr}: {exc}")
    finally:
        print(f"[DISCONN] {imei or addr} disconnected")
        writer.close()
        await writer.wait_closed()


async def run_gateway():
    await init_clients()
    asyncio.create_task(sync_queue_to_backend())
    server = await asyncio.start_server(handle_bus, '0.0.0.0', GATEWAY_PORT)
    print(f"[START] GPS Gateway on port {GATEWAY_PORT}")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(run_gateway())
    except KeyboardInterrupt:
        pass
