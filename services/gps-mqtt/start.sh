#!/bin/bash

# Start the Protocol Gateway in the background
echo "Starting Teltonika Gateway..."
python gateway.py &

# Start the MQTT Subscriber in the foreground
echo "Starting MQTT Subscriber..."
python main.py
