import socket
import time
import struct
import binascii

def send_fake_gps(host, port, imei, is_extended=False):
    # Ensure IMEI is 15 digits
    imei = imei.zfill(15)
    codec_name = "8 Extended" if is_extended else "8"
    print(f"[*] Targeting {host}:{port} with IMEI {imei} using Codec {codec_name}")

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(10)
            s.connect((host, port))
            print("[+] Connected to gateway")

            s.sendall(imei.encode())
            
            # Expect 0x01 response
            resp = s.recv(1)
            if resp == b'\x01':
                print("[+] Handshake accepted")
            else:
                print(f"[-] Handshake failed, received: {resp.hex()}")
                return

            timestamp = int(time.time() * 1000)
            lat = int(28.6139 * 10000000)
            lng = int(77.2090 * 10000000)
            alt = 200
            angle = 90
            sat = 12
            speed = 45 # km/h
            
            body = bytearray()
            body.append(0x8E if is_extended else 0x08) # Codec ID
            body.append(0x05)      # Number of Data 1
            for i in range(5):
                body.extend(struct.pack(">Q", timestamp + i*1000)) # TS (8 bytes)
                body.append(0x01)      # Priority (1 byte)
                body.extend(struct.pack(">i", lng))       # Lng (4 bytes)
                body.extend(struct.pack(">i", lat))       # Lat (4 bytes)
                body.extend(struct.pack(">H", alt))       # Alt (2 bytes)
                body.extend(struct.pack(">H", angle))     # Angle (2 bytes)
                body.append(sat)       # Sat (1 byte)
                body.extend(struct.pack(">H", speed))     # Speed (2 bytes)
                
                # IO Elements
                if is_extended:
                    body.extend(b'\x00\x00') # Event ID
                    body.extend(b'\x00\x00') # Total IO count
                    body.extend(b'\x00\x00') # 1B IO count
                    body.extend(b'\x00\x00') # 2B IO count
                    body.extend(b'\x00\x00') # 4B IO count
                    body.extend(b'\x00\x00') # 8B IO count
                    body.extend(b'\x00\x00') # X-BYte IO count (The Fix!)
                else:
                    body.append(0x00) # Event ID
                    body.append(0x00) # Total IO count
                    body.append(0x00) # 1B IO count
                    body.append(0x00) # 2B IO count
                    body.append(0x00) # 4B IO count
                    body.append(0x00) # 8B IO count
            
            body.append(0x05) # Num Data 1 (footer count)
            
            packet = bytearray()
            packet.extend(b'\x00\x00\x00\x00')
            packet.extend(struct.pack(">I", len(body)))
            packet.extend(body)
            packet.extend(b'\x00\x00\x00\x00') # Placeholder CRC
            
            print(f"[+] Sending data: {binascii.hexlify(packet).decode()}")
            s.sendall(packet)
            
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
    args = sys.argv[1:]
    is_extended = "--extended" in args
    if is_extended:
        args.remove("--extended")
    
    target_host = args[0] if len(args) > 0 else "127.0.0.1"
    target_port = 5027
    send_fake_gps(target_host, target_port, "1234567890", is_extended)
