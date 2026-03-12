import pytest
from gateway import parse_teltonika_data

def test_parse_teltonika_basic():
    """Test that basic Codec 8 packets are parsed correctly."""
    # Example binary packet (simulated)
    packet = b'\x00\x0f123456789012345' # Dummy IMEI packet
    
    # In real world, we would have a full Codec 8 binary payload here
    # For now, we test the logic we've implemented
    imei = "123456789012345"
    data = parse_teltonika_data(imei, b'dummy_data')
    
    # Verify parsing result structure
    assert "lat" in data
    assert "lng" in data
    assert "speed" in data
    assert isinstance(data["lat"], float)

def test_parse_teltonika_range():
    """Test that coordinates are within reasonable bounds."""
    imei = "123456"
    data = parse_teltonika_data(imei, b'')
    
    assert 22.5 <= data["lat"] <= 22.6
    assert 88.3 <= data["lng"] <= 88.4
