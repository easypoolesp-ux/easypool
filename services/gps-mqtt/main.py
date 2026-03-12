import os
import json
import paho.mqtt.client as mqtt
import requests
import time

# Configuration from environment
MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_USER = os.getenv("MQTT_USER") # Optional username
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD") # Optional password
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "bus/gps/#")
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend-api/api/gps/update")
API_KEY = os.getenv("GPS_SERVICE_API_KEY", "your-secure-api-key")

def on_connect(client, userdata, flags, rc):
    print(f"Connected to MQTT Broker with result code {rc}")
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        print(f"Received GPS data for {msg.topic}: {payload}")
        
        # Topic expected: bus/gps/{imei}
        imei = msg.topic.split('/')[-1]
        
        # Forward to Backend API
        # Expected payload: {"lat": 22.5, "lng": 88.3, "speed": 40, ...}
        data = {
            "imei": imei,
            "lat": payload.get("lat"),
            "lng": payload.get("lng"),
            "speed": payload.get("speed"),
            "timestamp": payload.get("timestamp", time.time())
        }
        
        headers = {"X-API-KEY": API_KEY}
        response = requests.post(BACKEND_API_URL, json=data, headers=headers)
        
        if response.status_code == 200:
            print(f"Successfully updated GPS for {bus_id}")
        else:
            print(f"Failed to update GPS for {bus_id}: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"Error processing MQTT message: {str(e)}")

def run():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message

    if MQTT_USER and MQTT_PASSWORD:
        print(f"Using MQTT Authentication (User: {MQTT_USER})")
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

    print(f"Connecting to broker {MQTT_BROKER}:{MQTT_PORT}...")
    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            break
        except Exception as e:
            print(f"Connection failed ({e}), retrying in 5s...")
            time.sleep(5)

    client.loop_forever()

if __name__ == "__main__":
    run()
