import pytest
import importlib

def test_gps_mqtt_imports():
    """Verify GPS-MQTT services can be imported."""
    modules = [
        'main',
        'gateway',
    ]
    for module in modules:
        try:
            importlib.import_module(module)
        except ImportError as e:
            pytest.fail(f"Failed to import {module}: {e}")

def test_paho_mqtt_available():
    """Verify paho-mqtt is installed."""
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        pytest.fail("paho-mqtt is not installed")
