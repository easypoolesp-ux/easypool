# Generated manually by Antigravity on 2026-03-23

import django.contrib.gis.db.models.fields
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0006_alter_gpspoint_timestamp_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='gpspoint',
            name='location',
            field=django.contrib.gis.db.models.fields.PointField(blank=True, null=True, srid=4326),
        ),
    ]
