import socket
import struct
import paho.mqtt.client as mqtt
import json
import os

# MQTT Configuration
MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))

# Gateway Configuration
GATEWAY_PORT = 5027 # Standard Teltonika Port

def parse_teltonika_data(imei, packet):
    """
    Parser for Teltonika Codec 8 data.
    Internal logic for coordinate extraction.
    """
    # Simple simulation: Extracting values for demo
    # Real Codec 8 parsing requires bit-by-bit extraction
    # For this MVP, we return simulated valid coordinates
    return {
        "lat": 22.5,
        "lng": 88.3,
        "speed": 0,
        "imei": imei,
        "protocol": "teltonika"
    }

def handle_teltonika_client(conn, addr, mqtt_client):
    print(f"New Teltonika connection from {addr}")
    try:
        # 1. Receive IMEI
        # Teltonika sends 2 bytes length + IMEI string
        imei_len_data = conn.recv(2)
        if not imei_len_data: return
        imei_len = struct.unpack('>H', imei_len_data)[0]
        imei = conn.recv(imei_len).decode()
        print(f"Device IMEI: {imei}")
        
        # Accept connection
        conn.send(b'\x01')
        
        while True:
            # 2. Receive Data Packet
            packet = conn.recv(1024)
            if not packet: break
            
            # Acknowledge packet
            num_data = 1 # Simplified for demo
            conn.send(struct.pack('>I', num_data))
            
            # Parse and Publish
            payload = parse_teltonika_data(imei, packet)
            topic = f"bus/gps/{imei}"
            mqtt_client.publish(topic, json.dumps(payload))
            print(f"Relayed data for {imei} to MQTT")
            
    except Exception as e:
        print(f"Gateway error: {e}")
    finally:
        conn.close()

def run_gateway():
    mqtt_client = mqtt.Client()
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT)
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('0.0.0.0', GATEWAY_PORT))
        s.listen()
        print(f"Teltonika Gateway listening on port {GATEWAY_PORT}...")
        while True:
            conn, addr = s.accept()
            handle_teltonika_client(conn, addr, mqtt_client)

if __name__ == "__main__":
    run_gateway()
