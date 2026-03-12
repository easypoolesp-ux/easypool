import pytest
from django.contrib.auth import get_user_model
from apps.schools.models import School, Transporter
from apps.buses.models import Bus

@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()

@pytest.fixture
def school(db):
    return School.objects.create(name="Test School", address="123 Test St")

@pytest.fixture
def transporter(db, school):
    return Transporter.objects.create(name="Test Fleet", school=school, email="fleet@test.com")

@pytest.fixture
def bus(db, school, transporter):
    return Bus.objects.create(
        internal_id="TEST-101",
        plate_number="TS-00-AA-0000",
        school=school,
        transporter=transporter,
        gps_imei="123456789012345"
    )

@pytest.fixture
def auth_client(api_client, db, school):
    User = get_user_model()
    user = User.objects.create_user(email='test@test.com', password='password', school=school, role='school_admin')
    api_client.force_authenticate(user=user)
    return api_client
