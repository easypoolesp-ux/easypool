import os
import django
import random
from datetime import datetime, timedelta
from django.utils import timezone

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.gps.models import GPSPoint
from apps.buses.models import Bus

def generate_route(bus, date, start_lat, start_lng):
    """Generate a realistic route for a bus on a specific date."""
    print(f"Generating route for {bus.internal_id} on {date}...")
    
    # Start at 8:00 AM Kolkata time
    start_time = datetime.combine(date, datetime.min.time()).replace(hour=8, minute=0)
    start_time = timezone.make_aware(start_time, timezone.get_current_timezone())
    
    current_lat = start_lat
    current_lng = start_lng
    points = []
    
    # Generate 120 points (2 hours of driving, 1 point per minute)
    for i in range(120):
        timestamp = start_time + timedelta(minutes=i)
        
        # Add some random movement (simulating traveling through Kolkata)
        current_lat += random.uniform(-0.001, 0.001)
        current_lng += random.uniform(-0.001, 0.001)
        speed = random.uniform(20, 50)
        
        points.append(GPSPoint(
            bus=bus,
            lat=current_lat,
            lng=current_lng,
            speed=speed,
            timestamp=timestamp
        ))
    
    # Bulk create for efficiency
    GPSPoint.objects.bulk_create(points)
    print(f"Created {len(points)} points for {bus.internal_id}")

def run_seed():
    # Clear existing points to start fresh if needed (optional)
    # GPSPoint.objects.all().delete()
    
    buses = Bus.objects.all()
    if not buses.exists():
        print("No buses found. Please seed buses first.")
        return

    # Kolkata coordinates
    base_lat = 22.5726
    base_lng = 88.3639
    
    # Target: Today
    today = timezone.now().date()
    
    for i, bus in enumerate(buses):
        # Slightly offset start points for each bus
        offset_lat = base_lat + (i * 0.01)
        offset_lng = base_lng + (i * 0.01)
        generate_route(bus, today, offset_lat, offset_lng)

    print("\n✅ GPS Seeding Complete! Go to the Dashboard to see the history.")

if __name__ == "__main__":
    run_seed()
