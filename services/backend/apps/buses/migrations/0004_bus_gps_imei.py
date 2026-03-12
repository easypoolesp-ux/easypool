from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('buses', '0003_remove_bus_camera_count_camera'),
    ]

    operations = [
        migrations.AddField(
            model_name='bus',
            name='gps_imei',
            field=models.CharField(blank=True, max_length=50, null=True, unique=True),
        ),
    ]
