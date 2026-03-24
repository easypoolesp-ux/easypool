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
    """
    Sync parsing logic for Teltonika Codec 8 and Codec 8 Extended.
    Expects payload: [CodecID (1B)] [Count (1B)] [Records...] [Count (1B)]
    Returns a list of parsed GPS records.
    """
    try:
        if len(packet) < 4:
            return []

        codec_id = packet[0]
        record_count = packet[1]
        footer_count = packet[-1]
        
        if record_count != footer_count:
            print(f"[WARN] Record count mismatch: {record_count} != {footer_count}")
            # We still try to parse if count > 0
            if record_count == 0: return []

        is_extended = (codec_id == 0x8E)
        records = []
        pos = 2 # Start after Codec ID and Count

        for i in range(record_count):
            # Minimum size of a GPS record without IO is ~24 bytes.
            if pos + 24 > len(packet): 
                print(f"[ERROR] Packet truncated at record {i+1}/{record_count}")
                break

            # 1. Timestamp (8 bytes)
            ts_raw = struct.unpack(">Q", packet[pos : pos + 8])[0]
            timestamp = ts_raw / 1000.0
            pos += 8

            # 2. Priority (1 byte)
            pos += 1

            # 3. GPS Element (15 bytes)
            lng_raw = struct.unpack(">i", packet[pos : pos + 4])[0]
            lat_raw = struct.unpack(">i", packet[pos + 4 : pos + 8])[0]
            alt = struct.unpack(">H", packet[pos + 8 : pos + 10])[0]
            angle = struct.unpack(">H", packet[pos + 10 : pos + 12])[0]
            sat = packet[pos + 12]
            speed = struct.unpack(">H", packet[pos + 13 : pos + 15])[0]
            
            lat = lat_raw / 10000000.0
            lng = lng_raw / 10000000.0
            pos += 15

            # 4. IO Elements
            # Each IO section iterates through 1B, 2B, 4B, 8B values.
            ignition = False
            
            # Event ID
            event_id_size = 2 if is_extended else 1
            pos += event_id_size
            
            # Total IO count
            total_io_size = 2 if is_extended else 1
            if pos + total_io_size > len(packet): break
            pos += total_io_size

            # IO Groups (1, 2, 4, 8 bytes)
            for val_size in (1, 2, 4, 8):
                size_prefix = 2 if is_extended else 1
                if pos + size_prefix > len(packet): break
                
                if is_extended:
                    num_ios = struct.unpack(">H", packet[pos : pos + 2])[0]
                else:
                    num_ios = packet[pos]
                pos += size_prefix
                
                for _ in range(num_ios):
                    io_id_size = 2 if is_extended else 1
                    if pos + io_id_size + val_size > len(packet): break
                    
                    if is_extended:
                        io_id = struct.unpack(">H", packet[pos : pos + 2])[0]
                    else:
                        io_id = packet[pos]
                    
                    io_val = int.from_bytes(packet[pos + io_id_size : pos + io_id_size + val_size], "big")
                    pos += io_id_size + val_size
                    
                    if io_id in IGNITION_IO_IDS:
                        ignition = bool(io_val)

            # Handle Variable-Length IO elements for Codec 8 Extended
            if is_extended:
                if pos + 2 > len(packet): break
                nx_ios = struct.unpack(">H", packet[pos : pos + 2])[0]
                pos += 2
                
                for _ in range(nx_ios):
                    if pos + 4 > len(packet): break # 2 bytes ID + 2 bytes Length
                    io_id = struct.unpack(">H", packet[pos : pos + 2])[0]
                    io_len = struct.unpack(">H", packet[pos + 2 : pos + 4])[0]
                    pos += 4
                    
                    if pos + io_len > len(packet): break
                    pos += io_len

            records.append({
                "lat": lat,
                "lng": lng,
                "speed": speed,
                "heading": angle,
                "timestamp": timestamp,
                "ignition": ignition,
            })

        return records
    except Exception as exc:
        print(f"[ERROR] Parse failed: {exc}")
        import traceback
        traceback.print_exc()
        return []


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
        # 1. Handshake: IMEI Receipt
        try:
            first = await asyncio.wait_for(reader.read(1024), timeout=30)
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

        # 2. Data Stream: Teltonika TCP Transport Protocol
        while True:
            try:
                # Read Header: 4B Preamble (0s) + 4B Length
                header = await asyncio.wait_for(reader.readexactly(8), timeout=120)
                if not header: break
                
                if header[0:4] != b'\x00\x00\x00\x00':
                    print(f"[ERROR] Invalid packet preamble from {imei}")
                    break
                
                data_len = struct.unpack(">I", header[4:8])[0]
                if data_len > 8192: # Safety limit
                    print(f"[ERROR] Packet too large ({data_len}) from {imei}")
                    break
                
                # Read Body: [Codec ID] [Count] [Records...] [Count] [CRC (4 bytes)]
                # Total length to read is data_len + 4 (for the CRC)
                full_payload = await reader.readexactly(data_len + 4)
                
                # Records block is everything except the 4B CRC at the end
                records_packet = full_payload[:-4]
                
                parsed_records = parse_codec8_packet(records_packet)
                if parsed_records:
                    count = len(parsed_records)
                    print(f"[DATA] {imei} sent {count} records")
                    for record in parsed_records:
                        asyncio.create_task(forward_to_backend(imei, record))
                    
                    # MANDATORY: Acknowledge with a 4-byte integer (Big Endian) of records accepted
                    writer.write(struct.pack(">I", count))
                    await writer.drain()
                
            except asyncio.IncompleteReadError:
                break
            except asyncio.TimeoutError:
                break

    except Exception as exc:
        print(f"[ERROR] Session {imei or addr}: {exc}")
    finally:
        print(f"[DISCONN] {imei or addr} disconnected")
        writer.close()
        try:
            await writer.wait_closed()
        except:
            pass


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



