import random
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.gps.models import GPSPoint
from apps.buses.models import Bus

class Command(BaseCommand):
    help = 'Seeds realistic historical GPS data for all buses for today'

    def handle(self, *args, **options):
        buses = Bus.objects.all()
        if not buses.exists():
            self.stdout.write(self.style.ERROR('No buses found. Seed help: python manage.py seed_isolation'))
            return

        # Kolkata Region Center
        base_lat, base_lng = 22.5726, 88.3639
        today = timezone.now().date()
        
        # Start at 8 AM local time
        start_time = datetime.combine(today, datetime.min.time()).replace(hour=8, minute=0)
        start_time = timezone.make_aware(start_time, timezone.get_current_timezone())

        self.stdout.write(self.style.SUCCESS(f"Starting seed for {buses.count()} buses..."))

        total_created = 0
        for i, bus in enumerate(buses):
            points = []
            # Offset start position for each bus
            current_lat = base_lat + (i * 0.01)
            current_lng = base_lng + (i * 0.01)

            # Generate 180 points (3 hours of travel, 1 point per minute)
            for j in range(180):
                ts = start_time + timedelta(minutes=j)
                
                # Move slightly towards the city center or random direction
                current_lat += random.uniform(-0.0005, 0.0005)
                current_lng += random.uniform(-0.0005, 0.0005)
                speed = random.uniform(20, 45)

                points.append(GPSPoint(
                    bus=bus,
                    lat=current_lat,
                    lng=current_lng,
                    speed=speed,
                    timestamp=ts
                ))
            
            GPSPoint.objects.bulk_create(points)
            total_created += len(points)
            self.stdout.write(f"  - Created {len(points)} points for {bus.internal_id}")

        self.stdout.write(self.style.SUCCESS(f"\n✅ Total {total_created} GPS points seeded for today!"))
