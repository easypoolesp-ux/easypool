import pytest
from django.urls import reverse
from apps.gps.models import GPSPoint

@pytest.mark.django_db
def test_playback_by_uuid_success(auth_client, bus):
    """Verify that playback API returns data when queried by UUID."""
    # Seed some data
    GPSPoint.objects.create(bus=bus, lat=22.5, lng=88.3, timestamp="2026-03-12T10:00:00Z")
    
    url = f"{reverse('gps-playback')}?bus={bus.id}&date=2026-03-12"
    response = auth_client.get(url)
    
    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]['lat'] == 22.5

@pytest.mark.django_db
def test_transporters_visibility(auth_client, transporter):
    """Verify that transporters are visible to school admins."""
    url = reverse('transporter-list')
    response = auth_client.get(url)
    
    assert response.status_code == 200
    # The viewset might be paginated or return a list
    data = response.data.get('results', response.data)
    assert len(data) >= 1
    assert data[0]['name'] == transporter.name

@pytest.mark.django_db
def test_seed_history_links_groups(api_client, bus, school):
    """Verify that seeding script links buses to groups as requested by user."""
    # Ensure bus is not linked to transporter initially (or linked to a different one)
    bus.transporter = None
    bus.save()
    
    # Create transporter for school
    from apps.schools.models import Transporter
    Transporter.objects.get_or_create(school=school, name="Test Group")
    
    url = reverse('gps-seed-history')
    headers = {'HTTP_X_API_KEY': 'easypool_gps_secret_2026'}
    response = api_client.post(url, **headers)
    
    assert response.status_code == 200
    
    # Refresh bus and check link
    bus.refresh_from_db()
    assert bus.transporter is not None
    assert "Group" in bus.transporter.name
