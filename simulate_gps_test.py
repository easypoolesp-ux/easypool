import socket
import struct
import time


def simulate_teltonika(server_ip, port, imei):
    print(f"Connecting to {server_ip}:{port} with IMEI {imei}...")

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(10)
        s.connect((server_ip, port))

        # 1. Send IMEI Handshake
        imei_bytes = imei.encode("utf-8")
        s.send(struct.pack(">H", len(imei_bytes)) + imei_bytes)

        # 2. Receive Handshake Response (expect 0x01)
        resp = s.recv(1)
        if resp == b"\x01":
            print("Handshake successful!")
        else:
            print(f"Handshake failed: {resp}")
            return

        # 3. Construct Codec 8 Data Packet
        # Location: Kolkata (22.5726, 88.3639)
        # Lat: 22.5726 * 10^7 = 225726000
        # Lng: 88.3639 * 10^7 = 883639000
        timestamp = int(time.time() * 1000)
        priority = 0
        lng = 883639000
        lat = 225726000
        alt = 10
        angle = 0
        satellites = 10
        speed = 45  # 45 km/h

        # AVL Data part
        avl_data = struct.pack(">Q", timestamp)
        avl_data += struct.pack(">B", priority)
        avl_data += struct.pack(">i", lng)
        avl_data += struct.pack(">i", lat)
        avl_data += struct.pack(">H", alt)
        avl_data += struct.pack(">H", angle)
        avl_data += struct.pack(">B", satellites)
        avl_data += struct.pack(">H", speed)

        # IO Elements (simplified: 0 IOs)
        avl_data += b"\x00"  # Event IO ID
        avl_data += b"\x00"  # Total IO count
        avl_data += b"\x00"  # 1-byte IO count
        avl_data += b"\x00"  # 2-byte IO count
        avl_data += b"\x00"  # 4-byte IO count
        avl_data += b"\x00"  # 8-byte IO count

        # Full Packet
        # [4 bytes 0] [4 bytes data length] [Codec 08] [1 record] [AVL] [1 record] [4 bytes CRC (ignored by gateway for now)]
        codec_id = 8
        record_count = 1
        data_block = struct.pack(">B", codec_id)
        data_block += struct.pack(">B", record_count)
        data_block += avl_data
        data_block += struct.pack(">B", record_count)

        packet = b"\x00\x00\x00\x00"  # Preamble
        packet += struct.pack(">I", len(data_block))
        packet += data_block
        packet += b"\x00\x00\x00\x00"  # Fake CRC

        print(f"Sending packet ({len(packet)} bytes)...")
        s.send(packet)

        # 4. Receive Acknowledgment (expect 4-byte integer = record_count)
        ack = s.recv(4)
        print(f"Received ACK: {struct.unpack('>I', ack)[0]}")


if __name__ == "__main__":
    simulate_teltonika("35.244.42.0", 5027, "868686868686868")
