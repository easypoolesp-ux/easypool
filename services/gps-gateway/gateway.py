import asyncio
import struct
import aiohttp
import os
import redis.asyncio as redis
import json

# ── Configuration ─────────────────────────────────────────────────────────────
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend-api/api/gps/telemetry")
API_KEY = os.getenv("GPS_SERVICE_API_KEY", "easypool_gps_secret_2026")
GATEWAY_PORT = int(os.getenv("GATEWAY_PORT", 5027))
REDIS_URL = os.getenv("REDIS_URL", "redis://:easypool_live_redis_2026@127.0.0.1:6379/0")

# ── Global Clients ────────────────────────────────────────────────────────────
redis_client = None
http_session = None

# Teltonika DIN1 (ignition wire) IO IDs.
IGNITION_IO_IDS = {239, 1}


async def init_clients():
    global redis_client, http_session
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        await redis_client.ping()
        print(f"[REDIS] Connected to {REDIS_URL}")
    except Exception as e:
        print(f"[ERROR] Redis failed: {e}")
        redis_client = None

    timeout = aiohttp.ClientTimeout(total=5)
    http_session = aiohttp.ClientSession(
        timeout=timeout, headers={"X-API-KEY": API_KEY}
    )


def parse_codec8_packet(packet: bytes):
    """Sync parsing logic for Teltonika Codec 8."""
    try:
        if len(packet) < 26:
            return None

        codec_id = packet[0]
        num_records = packet[1]
        if num_records == 0:
            return None

        ts_raw = struct.unpack(">Q", packet[2:10])[0]
        lng_raw = struct.unpack(">i", packet[11:15])[0]
        lat_raw = struct.unpack(">i", packet[15:19])[0]
        angle = struct.unpack(">H", packet[21:23])[0]
        speed = struct.unpack(">H", packet[24:26])[0]

        lat = lat_raw / 10_000_000.0
        lng = lng_raw / 10_000_000.0
        timestamp = ts_raw / 1000.0

        io_base = 26
        ignition = False

        if codec_id == 0x8E:
            if io_base + 4 <= len(packet):
                pos = io_base + 4
                for val_size in (1, 2, 4, 8):
                    if pos + 2 > len(packet):
                        break
                    n = struct.unpack(">H", packet[pos : pos + 2])[0]
                    pos += 2
                    for _ in range(n):
                        if pos + 2 + val_size > len(packet):
                            break
                        io_id = struct.unpack(">H", packet[pos : pos + 2])[0]
                        io_val = int.from_bytes(
                            packet[pos + 2 : pos + 2 + val_size], "big"
                        )
                        pos += 2 + val_size
                        if io_id in IGNITION_IO_IDS:
                            ignition = bool(io_val)
        else:
            if io_base + 2 <= len(packet):
                pos = io_base + 2
                for val_size in (1, 2, 4, 8):
                    if pos + 1 > len(packet):
                        break
                    n = packet[pos]
                    pos += 1
                    for _ in range(n):
                        if pos + 1 + val_size > len(packet):
                            break
                        io_id = packet[pos]
                        io_val = int.from_bytes(
                            packet[pos + 1 : pos + 1 + val_size], "big"
                        )
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
    # This keeps the map 100% real-time regardless of DB batching.
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
    bulk_url = BACKEND_API_URL.rstrip('/') + "/bulk/"
    
    while True:
        if not redis_client or not http_session:
            await asyncio.sleep(5)
            continue
            
        try:
            # Check queue pressure
            q_len = await redis_client.llen('gps_offline_queue')
            if q_len == 0:
                await asyncio.sleep(2) # Relaxed wait when idle
                continue

            # Intelligence: Scale batch size based on pressure
            # If queue is flooding (>500), clear it faster with larger batches
            batch_size = 200 if q_len > 500 else 50
            
            # Multi-pop from Redis (efficient chunking)
            # Note: r.lpop with count=N returns a list of values
            batch_data = await redis_client.rpop('gps_offline_queue', count=batch_size)
            if not batch_data:
                continue

            # Ensure we treat single result (if older redis version) as list
            if isinstance(batch_data, str):
                batch_data = [batch_data]

            payload_batch = [json.loads(p) for p in batch_data]
            
            # Try sending bulk to backend
            async with http_session.post(bulk_url, json=payload_batch) as resp:
                if resp.status not in [200, 201]:
                    print(f"[ERROR] Bulk Backend returned {resp.status}, requeuing {len(payload_batch)} items...")
                    # Re-queue items in reverse order to preserve time-sequence as much as possible
                    for p_str in reversed(batch_data):
                        await redis_client.rpush('gps_offline_queue', p_str)
                    await asyncio.sleep(5) 
                else:
                    if q_len > 500:
                        print(f"[SYNC] Processed high-pressure batch: {len(payload_batch)} items")
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
            if not first:
                return

            if len(first) == 15 and first.isdigit():
                imei = first.decode()
            elif len(first) > 2:
                # Teltonika sends 2B length + IMEI string
                imei_len = struct.unpack(">H", first[:2])[0]
                imei = (
                    first[2:].decode()
                    if imei_len == len(first) - 2
                    else first.decode()[-15:]
                )
            else:
                return

            print(f"[HANDSHAKE] IMEI={imei} from {addr}")
            writer.write(b"\x01")
            await writer.drain()
        except asyncio.TimeoutError:
            print(f"[TIMEOUT] Handshake timed out from {addr}")
            return

        # Data Loop
        while True:
            try:
                prefix = await asyncio.wait_for(reader.read(8), timeout=60)
                if not prefix or len(prefix) < 8:
                    break

                data_len = struct.unpack(">I", prefix[4:8])[0]
                raw = b""
                while len(raw) < data_len + 4:
                    chunk = await reader.read((data_len + 4) - len(raw))
                    if not chunk:
                        break
                    raw += chunk

                if len(raw) < data_len + 4:
                    break

                body = raw[:-4]
                num_records = body[1]
                writer.write(struct.pack(">I", num_records))
                await writer.drain()

                parsed = parse_codec8_packet(body)
                if parsed:
                    # Fire-and-forget forwarding (doesn't wait for backend to process next packet)
                    asyncio.create_task(forward_to_backend(imei, parsed))

            except asyncio.TimeoutError:
                print(f"[TIMEOUT] No data from {imei or addr} for 60s.")
                break

    except Exception as exc:
        print(f"[ERROR] Connection {imei or addr}: {exc}")
    finally:
        print(f"[DISCONN] {imei or addr} disconnected")
        writer.close()
        await writer.wait_closed()


async def run_gateway():
    await init_clients()
    asyncio.create_task(sync_queue_to_backend())
    server = await asyncio.start_server(handle_bus, '0.0.0.0', GATEWAY_PORT)
    addr = server.sockets[0].getsockname()
    print(f"[START] AsyncIO Gateway on {addr}")

    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(run_gateway())
    except KeyboardInterrupt:
        pass
