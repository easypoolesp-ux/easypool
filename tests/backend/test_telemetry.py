import pytest
from django.urls import reverse
from apps.gps.models import GPSPoint

@pytest.mark.django_db
def test_telemetry_endpoint_success(api_client, bus):
    """Test that valid telemetry data is accepted and saved."""
    url = reverse('gpspoint-telemetry')
    payload = {
        "imei": bus.gps_imei,
        "lat": 22.5,
        "lng": 88.3,
        "speed": 45
    }
    
    # Must include the secure API KEY
    headers = {'HTTP_X_API_KEY': 'easypool_gps_secret_2026'}
    
    response = api_client.post(url, payload, format='json', **headers)
    
    assert response.status_code == 200
    assert response.data['status'] == 'success'
    
    # Verify data in DB
    point = GPSPoint.objects.filter(bus=bus).first()
    assert point is not None
    assert point.lat == 22.5
    assert point.lng == 88.3

@pytest.mark.django_db
def test_telemetry_unauthorized(api_client, bus):
    """Test that unauthorized requests are rejected."""
    url = reverse('gpspoint-telemetry')
    payload = {"imei": bus.gps_imei, "lat": 22.5, "lng": 88.3}
    
    # Missing API Key
    response = api_client.post(url, payload, format='json')
    assert response.status_code == 401

@pytest.mark.django_db
def test_telemetry_invalid_imei(api_client):
    """Test that invalid IMEI returns 404."""
    url = reverse('gpspoint-telemetry')
    payload = {"imei": "NON_EXISTENT", "lat": 22.5, "lng": 88.3}
    headers = {'HTTP_X_API_KEY': 'easypool_gps_secret_2026'}
    
    response = api_client.post(url, payload, format='json', **headers)
    assert response.status_code == 404
