from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0010_finalized_spatial_gps'),
    ]

    operations = [
        migrations.CreateModel(
            name='BusHourlyDistance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('hour', models.DateTimeField(help_text='The start of the hour (e.g., 2026-03-24 10:00:00)')),
                ('distance_km', models.FloatField(default=0, help_text='Total distance traveled during this hour.')),
                ('bus', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hourly_distances', to='buses.bus')),
            ],
            options={
                'unique_together': {('bus', 'hour')},
            },
        ),
        migrations.AddIndex(
            model_name='bushourlydistance',
            index=models.Index(fields=['bus', 'hour'], name='gps_bushour_bus_id_66c421_idx'),
        ),
        migrations.AddIndex(
            model_name='bushourlydistance',
            index=models.Index(fields=['hour'], name='gps_bushour_hour_fc75a5_idx'),
        ),
    ]
