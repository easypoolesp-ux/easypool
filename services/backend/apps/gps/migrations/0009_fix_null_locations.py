# Generated manually by Antigravity on 2026-03-23

from django.db import migrations

def delete_null_locations(apps, schema_editor):
    GPSPoint = apps.get_model('gps', 'GPSPoint')
    # Delete any legacy points that had missing coordinates so we can enforce NOT NULL
    GPSPoint.objects.filter(location__isnull=True).delete()

def reverse_sync(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0008_sync_gps_points'),
    ]

    operations = [
        migrations.RunPython(delete_null_locations, reverse_sync),
    ]
