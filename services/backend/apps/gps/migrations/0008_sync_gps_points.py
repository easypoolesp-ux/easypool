# Generated manually by Antigravity on 2026-03-23

from django.db import migrations
from django.contrib.gis.geos import Point

def sync_gps_points(apps, schema_editor):
    GPSPoint = apps.get_model('gps', 'GPSPoint')
    # Using iterator for memory efficiency with large datasets
    for point in GPSPoint.objects.all().iterator():
        if point.lat and point.lng:
            # PostGIS uses (longitude, latitude) order
            point.location = Point(point.lng, point.lat)
            point.save(update_fields=['location'])

def reverse_sync(apps, schema_editor):
    # Removing location data is already handled by dropping the column in schema migrations
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0007_gpspoint_location'),
    ]

    operations = [
        migrations.RunPython(sync_gps_points, reverse_sync),
    ]
