import paho.mqtt.client as mqtt
import json
import time
import random

# CONFIGURATION
# Set this to your VM's Public IP address
MQTT_BROKER = "YOUR_VM_IP_ADDRESS" 
MQTT_PORT = 1883
DEVICE_IMEI = "123456789012345" # This must match 'gps_imei' in your Dashboard
TOPIC = f"bus/gps/{DEVICE_IMEI}"

def simulate_bus():
    client = mqtt.Client()
    
    print(f"Connecting to {MQTT_BROKER}...")
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    # Starting coordinates (Kolkata example)
    lat = 22.5726
    lng = 88.3639

    print(f"Starting simulation for Bus {BUS_ID}. Press Ctrl+C to stop.")
    
    try:
        while True:
            # Simulate slight movement
            lat += random.uniform(-0.0001, 0.0001)
            lng += random.uniform(-0.0001, 0.0001)
            speed = random.randint(30, 60)
            
            payload = {
                "lat": lat,
                "lng": lng,
                "speed": speed,
                "timestamp": time.time()
            }
            
            print(f"Sending: {payload}")
            client.publish(TOPIC, json.dumps(payload))
            
            time.sleep(2) # Send update every 2 seconds
    except KeyboardInterrupt:
        print("\nSimulation stopped.")
        client.disconnect()

if __name__ == "__main__":
    simulate_bus()
