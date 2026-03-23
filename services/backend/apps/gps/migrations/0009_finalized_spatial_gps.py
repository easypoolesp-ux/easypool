from django.db import migrations
import django.contrib.gis.db.models.fields
from django.contrib.postgres.indexes import GistIndex

class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0008_sync_gps_points'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='gpspoint',
            name='lat',
        ),
        migrations.RemoveField(
            model_name='gpspoint',
            name='lng',
        ),
        migrations.AlterField(
            model_name='gpspoint',
            name='location',
            field=django.contrib.gis.db.models.fields.PointField(srid=4326),
        ),
        migrations.AddIndex(
            model_name='gpspoint',
            index=GistIndex(fields=['location'], name='gps_location_gist'),
        ),
    ]
