import socket
import time
import struct
import binascii

def send_fake_gps(host, port, imei):
    # Ensure IMEI is 15 digits
    imei = imei.zfill(15)
    print(f"[*] Targeting {host}:{port} with IMEI {imei}")

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(10)
            s.connect((host, port))
            print("[+] Connected to gateway")

            # 1. Handshake: Send IMEI
            # Some Teltonika devices send length prefix (2 bytes), others send plain string.
            # Our gateway handles both. Let's send plain string if it's 15 chars.
            s.sendall(imei.encode())
            
            # Expect 0x01 response
            resp = s.recv(1)
            if resp == b'\x01':
                print("[+] Handshake accepted")
            else:
                print(f"[-] Handshake failed, received: {resp.hex()}")
                return

            # 2. Construct Codec 8 Packet
            # Sample coordinates: New Delhi (28.6139, 77.2090)
            timestamp = int(time.time() * 1000)
            lat = int(28.6139 * 10000000)
            lng = int(77.2090 * 10000000)
            alt = 200
            angle = 90
            sat = 12
            speed = 45 # km/h
            
            # BODY (Codec 8)
            # Codec ID (0x08) + Num Data (0x01) + Record... + Num Data (0x01)
            # Note: The gateway simplified parser expects body[0]=CodecID, body[2:10]=TS
            # Wait, let's look at parse_codec8_packet again.
            # ts_raw = packet[2:10]
            # lng_raw = packet[11:15]
            # lat_raw = packet[15:19]
            
            body = bytearray()
            body.append(0x08)      # Codec ID
            body.append(0x01)      # Number of Data 1
            body.extend(struct.pack(">Q", timestamp)) # TS (8 bytes)
            body.append(0x01)      # Priority (1 byte)
            body.extend(struct.pack(">i", lng))       # Lng (4 bytes)
            body.extend(struct.pack(">i", lat))       # Lat (4 bytes)
            body.extend(struct.pack(">H", alt))       # Alt (2 bytes)
            body.extend(struct.pack(">H", angle))     # Angle (2 bytes)
            body.append(sat)       # Sat (1 byte)
            body.extend(struct.pack(">H", speed))     # Speed (2 bytes)
            
            # IO Elements (0 IOs for simplicity, but gateway loop needs to not crash)
            body.append(0x00) # Event ID
            body.append(0x00) # Total IO count
            body.append(0x00) # 1B IO count
            body.append(0x00) # 2B IO count
            body.append(0x00) # 4B IO count
            body.append(0x00) # 8B IO count
            
            body.append(0x01) # Num Data 1 (footer count)
            
            # WRAPPER
            # 00 00 00 00 + LENGTH (4B) + BODY + CRC (4B)
            # Length = len(body)
            
            packet = bytearray()
            packet.extend(b'\x00\x00\x00\x00')
            packet.extend(struct.pack(">I", len(body)))
            packet.extend(body)
            packet.extend(b'\x00\x00\x00\x00') # Placeholder CRC
            
            print(f"[+] Sending data: {binascii.hexlify(packet).decode()}")
            s.sendall(packet)
            
            # 3. Wait for Acknowledgment (4 bytes)
            ack_raw = s.recv(4)
            if len(ack_raw) == 4:
                ack_count = struct.unpack(">I", ack_raw)[0]
                print(f"[+] Received ACK: {ack_count} records accepted")
            else:
                print(f"[-] Failed to receive proper ACK, got: {ack_raw.hex()}")
            
            print("[+] Test complete")
            
    except Exception as e:
        print(f"[ERROR] {e}")

if __name__ == "__main__":
    import sys
    # Default to localhost if no host provided
    target_host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    target_port = 5027
    send_fake_gps(target_host, target_port, "1234567890")
