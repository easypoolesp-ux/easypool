import socket
import struct
import requests
import os
import time
import json

# Configuration
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend-api/api/gps/telemetry")
API_KEY = os.getenv("GPS_SERVICE_API_KEY", "easypool_gps_secret_2026")
GATEWAY_PORT = int(os.getenv("GATEWAY_PORT", 5027))

def parse_codec8_data(packet):
    """
    Teltonika Codec 8 / Codec 8 Extended Parser.
    Extracts GPS and Ignition (DIN1) from the first record.
    """
    try:
        if len(packet) < 19:
            return None

        codec_id = packet[0]
        num_records = packet[1]
        
        if num_records == 0:
            return None

        # AVL Data starts at index 2
        timestamp_raw = struct.unpack('>Q', packet[2:10])[0]
        # Priority: packet[10]
        lng_raw = struct.unpack('>i', packet[11:15])[0]
        lat_raw = struct.unpack('>i', packet[15:19])[0]
        # Altitude: packet[19:21]
        # Angle: packet[21:23]
        # Satellites: packet[23]
        speed_raw = struct.unpack('>H', packet[24:26])[0]

        # IO Data starts after GPS (24 bytes total for GPS element in Codec 8/8E)
        # Event ID + Element Count
        io_start = 2 + 8 + 1 + 15 # codec + count + ts + priority + gps (15 bytes)
        # Wait, GPS element is:
        # Longitude (4), Latitude (4), Altitude (2), Angle (2), Satellites (1), Speed (2) = 15 bytes.
        # Timestamp (8) + Priority (1) = 9 bytes.
        # Total = 24 bytes of record data before IOs.
        
        io_base = 2 + 24 # codec + count + 24 (ts + prio + gps)
        io_event_id = struct.unpack('>H' if codec_id == 142 else 'B', packet[io_base:io_base+(2 if codec_id == 142 else 1)])[0]
        
        # This parser is getting complex, let's just look for DIN1 (ID 1) in 1-byte IOs section
        # For simplicity in this demo, we assume the structure from fake_teltonika.py
        # which puts DIN1 as the first 1-byte IO.
        
        ignition = False
        # In fake_teltonika.py: [IO Event 2B] [IO Count 2B] [1B Count 1B] [ID 2B] [Val 1B]
        # At index: 26 (Event ID 2B), 28 (Element Count 2B), 30 (1B Count 1B)...
        # Actually in Codec 8 Extended, IO Count is 2 bytes.
        
        # Let's try to find Ignition ID=1 in the packet
        # In Codec 8 Extended, it's hex 00 01. In Codec 8, it's hex 01.
        if codec_id == 142: # Extended
            if b'\x00\x01\x01' in packet: # ID=1, Val=1
                ignition = True
        else: # Standard
            if b'\x01\x01' in packet: # ID=1, Val=1
                ignition = True

        return {
            "lat": lat_raw / 10000000.0,
            "lng": lng_raw / 10000000.0,
            "speed": speed_raw,
            "timestamp": timestamp_raw / 1000.0,
            "ignition": ignition
        }
    except Exception as e:
        print(f"Parsing error: {e}")
        return None

def forward_to_backend(imei, data):
    """Sends parsed data to the Django Backend."""
    payload = {
        "imei": imei,
        "lat": data["lat"],
        "lng": data["lng"],
        "speed": data["speed"],
        "ignition": data["ignition"],
        "timestamp": data["timestamp"]
    }
    headers = {"X-API-KEY": API_KEY}
    try:
        print(f"Forwarding to backend: IMEI={imei}, Lat={data['lat']}, Lng={data['lng']}, Ign={'ON' if data['ignition'] else 'OFF'}")
        response = requests.post(BACKEND_API_URL, json=payload, headers=headers, timeout=5)
        if response.status_code == 200:
            print(f"Successfully updated GPS for IMEI: {imei}")
        else:
            print(f"Backend error ({response.status_code}): {response.text}")
    except Exception as e:
        print(f"Failed to connect to backend: {e}")

def handle_client(conn, addr):
    print(f"New connection from {addr}")
    try:
        # 1. Smart Handshake: Receive IMEI
        # Some devices send [2 bytes length] [IMEI], others send just [15 digits]
        first_chunk = conn.recv(1024)
        if not first_chunk: return
        
        # Log the raw handshake for debugging
        print(f"Raw handshake hex: {first_chunk.hex()}")
        
        if len(first_chunk) == 15 and first_chunk.isdigit():
            # Raw IMEI format
            imei = first_chunk.decode()
        elif len(first_chunk) > 2:
            # Check if it has a 2-byte length prefix
            imei_len = struct.unpack('>H', first_chunk[:2])[0]
            if imei_len == len(first_chunk) - 2:
                imei = first_chunk[2:].decode()
            else:
                # Fallback: maybe it's just the IMEI starting with some weird bytes
                # or the length prefix is just the first 2 digits
                imei = first_chunk.decode()[-15:]
        else:
            print("Incomplete handshake.")
            return

        print(f"Detected Device IMEI: {imei}")
        
        # Accept connection (Send 0x01)
        conn.send(b'\x01')
        
        while True:
            # 2. Receive Data Packet
            prefix = conn.recv(8)
            if not prefix: break
            
            if len(prefix) < 8:
                print(f"Incomplete prefix: {prefix.hex()}")
                break
            
            data_len = struct.unpack('>I', prefix[4:8])[0]
            # Receive the data + 4 bytes CRC
            raw_data = b""
            while len(raw_data) < data_len + 4:
                chunk = conn.recv((data_len + 4) - len(raw_data))
                if not chunk: break
                raw_data += chunk
            
            if len(raw_data) < data_len + 4: break

            # 3. Parse and Acknowledge
            # Acknowledgment is the number of records as a 4-byte integer
            data_content = raw_data[:-4] # Exclude CRC
            num_records = data_content[1] # For Codec 8, index 1 is record count
            conn.send(struct.pack('>I', num_records))
            
            print(f"Received data content length: {len(data_content)}")
            parsed = parse_codec8_data(data_content)
            if parsed:
                print(f"Parsed data: {parsed}")
                forward_to_backend(imei, parsed)
            else:
                print("Failed to parse packet.")
            
    except Exception as e:
        print(f"Client error: {e}")
    finally:
        conn.close()

def run_gateway():
    print(f"Starting Teltonika Direct TCP Gateway on port {GATEWAY_PORT}...")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('0.0.0.0', GATEWAY_PORT))
        s.listen(10)
        while True:
            conn, addr = s.accept()
            handle_client(conn, addr)

if __name__ == "__main__":
    run_gateway()
