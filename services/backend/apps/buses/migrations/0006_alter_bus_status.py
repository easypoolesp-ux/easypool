from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('buses', '0005_camera_stream_url'),
    ]

    operations = [
        migrations.AlterField(
            model_name='bus',
            name='status',
            field=models.CharField(choices=[('moving', 'Moving (Green)'), ('idle', 'Idle (Grey)'), ('ignition_off', 'Ignition Off (Red)'), ('offline', 'Offline (Black)')], default='offline', max_length=20),
        ),
    ]
