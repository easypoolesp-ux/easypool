import pytest
from django.urls import reverse
from apps.gps.models import GPSPoint


@pytest.mark.django_db
def test_playback_by_uuid_success(auth_client, bus):
    """Verify that playback API returns data when queried by UUID."""
    # Seed some data
    GPSPoint.objects.create(
        bus=bus, lat=22.5, lng=88.3, timestamp="2026-03-12T10:00:00Z"
    )

    url = f"{reverse('gps-playback')}?bus={bus.id}&date=2026-03-12"
    response = auth_client.get(url)

    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]["lat"] == 22.5


@pytest.mark.django_db
def test_bus_list_includes_heartbeat(auth_client, bus):
    """Verify that bus list includes the last_heartbeat field for staleness logic."""
    from apps.gps.models import GPSPoint

    GPSPoint.objects.create(
        bus=bus, lat=22.5, lng=88.3, timestamp="2026-03-12T10:00:00Z"
    )

    url = reverse("bus-list")
    response = auth_client.get(url)

    assert response.status_code == 200
    data = response.data.get("results", response.data)
    assert data[0]["last_heartbeat"] is not None


@pytest.mark.django_db
def test_transporters_visibility(auth_client, transporter):
    """Verify that transporters are visible to school admins."""
    url = reverse("transporter-list")
    response = auth_client.get(url)

    assert response.status_code == 200
    # The viewset might be paginated or return a list
    data = response.data.get("results", response.data)
    assert len(data) >= 1
    assert data[0]["name"] == transporter.name


@pytest.mark.django_db
def test_seed_history_links_groups(api_client, bus, school):
    """Verify that seeding script links buses to groups as requested by user."""
    # Ensure bus is not linked to transporter initially (or linked to a different one)
    bus.transporter = None
    bus.save()

    # Create transporter for school
    from apps.schools.models import Transporter

    Transporter.objects.get_or_create(school=school, name="Test Group")

    url = reverse("gps-seed-history")
    headers = {"HTTP_X_API_KEY": "easypool_gps_secret_2026"}
    response = api_client.post(url, **headers)

    assert response.status_code == 200

    # Refresh bus and check link
    bus.refresh_from_db()
    assert bus.transporter is not None
    assert "Group" in bus.transporter.name


@pytest.mark.django_db
def test_hardcoded_url_contracts(auth_client, bus):
    """
    Industry-Level Contract Test:
    Verify that exact URL strings used by the frontend work in the backend.
    This catches 'trailing slash' issues that reverse() would hide.
    """
    # 1. Playback API (The 404 we just fixed)
    # Frontend uses: `${BACKEND_URL}/api/gps/playback?bus=${busId}&date=${date}`
    playback_url = f"/api/gps/playback?bus={bus.id}&date=2026-03-12"
    response = auth_client.get(playback_url)
    assert response.status_code != 404, (
        "Playback API 404: Check trailing_slash config in urls.py"
    )

    # 2. Transporters API (The '0 groups' issue)
    # Frontend matches: `/api/transporters`
    transporter_url = "/api/transporters"
    response = auth_client.get(transporter_url)
    assert response.status_code != 404, (
        "Transporters API 404: Check router registration in config/urls.py"
    )
