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
    Highly simplified Teltonika Codec 8 Parser.
    Extracts the first GPS record from a packet.
    """
    try:
        # Minimum packet size check (CodecID + Count + Timestamp + Lat/Lng + Count)
        # 1 + 1 + 8 + 4 + 4 + 1 = 19 bytes is an absolute minimum
        if len(packet) < 19:
            print(f"Packet too short: {len(packet)}")
            return None

        # Basic Codec 8 structure check
        codec_id = packet[0] # Usually 0x08
        if codec_id != 8:
            print(f"Invalid Codec ID: {codec_id}")
            return None
            
        num_records = packet[1]
        if num_records == 0:
            print("No records in packet")
            return None

        # AVL Data starts at index 2
        # Timestamp: 8 bytes (Big Endian)
        timestamp_raw = struct.unpack('>Q', packet[2:10])[0]
        
        # GPS Element:
        # Longitude: 4 bytes (Signed, 10^7)
        # Latitude: 4 bytes (Signed, 10^7)
        # Altitude: 2 bytes
        # Angle: 2 bytes
        # Satellites: 1 byte
        # Speed: 2 bytes
        
        lng_raw = struct.unpack('>i', packet[11:15])[0]
        lat_raw = struct.unpack('>i', packet[15:19])[0]
        speed_raw = struct.unpack('>H', packet[24:26])[0]

        return {
            "lat": lat_raw / 10000000.0,
            "lng": lng_raw / 10000000.0,
            "speed": speed_raw, # Units depend on device config, usually km/h
            "timestamp": timestamp_raw / 1000.0 # Convert ms to sec
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
        "timestamp": data["timestamp"]
    }
    headers = {"X-API-KEY": API_KEY}
    try:
        print(f"Forwarding to backend: IMEI={imei}, Lat={data['lat']}, Lng={data['lng']}")
        response = requests.post(BACKEND_API_URL, json=payload, headers=headers, timeout=5)
        if response.status_code == 200:
            print(f"Successfully updated GPS for IMEI: {imei}")
        else:
            print(f"Backend error ({response.status_code}): {response.text}")
    except Exception as e:
        print(f"Failed to connect to backend: {e}")

def handle_client(conn, addr):
    print(f"Connection from {addr}")
    try:
        # 1. Handshake: Receive IMEI
        # Teltonika sends: [2 bytes length] [IMEI string]
        header = conn.recv(2)
        if not header: return
        imei_len = struct.unpack('>H', header)[0]
        imei = conn.recv(imei_len).decode()
        print(f"Device IMEI: {imei}")
        
        # Accept connection (Send 0x01)
        conn.send(b'\x01')
        
        while True:
            # 2. Receive Data Packet
            # [4 bytes 0] [4 bytes length] [DATA...] [4 bytes CRC]
            prefix = conn.recv(8)
            if not prefix: break
            
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
