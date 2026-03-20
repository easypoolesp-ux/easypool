from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0003_gpspoint_ignition'),
    ]

    operations = [
        migrations.AddField(
            model_name='gpspoint',
            name='heading',
            field=models.FloatField(default=0, help_text='Direction of travel in degrees (0-360)'),
        ),
    ]
