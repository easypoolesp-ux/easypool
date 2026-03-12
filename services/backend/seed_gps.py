import os
import django
from django.utils import timezone

# Set up Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.buses.models import Bus
from apps.gps.models import GPSPoint

def seed_gps_points():
    print("Seeding GPS points...")
    
    # 1. Bus: OAK-101 (IMEI: 123456789012345)
    bus1 = Bus.objects.filter(gps_imei="123456789012345").first()
    if bus1:
        GPSPoint.objects.create(
            bus=bus1,
            lat=17.4448, # Hyderabad - Hitech City area
            lng=78.3498,
            speed=40,
            timestamp=timezone.now()
        )
        print(f"Added point for {bus1.internal_id}")
    else:
        print("Bus OAK-101 not found")

    # 2. Bus: OAK-201 (IMEI: 223344556677889)
    bus2 = Bus.objects.filter(gps_imei="223344556677889").first()
    if bus2:
        GPSPoint.objects.create(
            bus=bus2,
            lat=17.4837, # Hyderabad - Gachibowli area
            lng=78.3244,
            speed=35,
            timestamp=timezone.now()
        )
        print(f"Added point for {bus2.internal_id}")
    else:
        print("Bus OAK-201 not found")

if __name__ == "__main__":
    seed_gps_points()
