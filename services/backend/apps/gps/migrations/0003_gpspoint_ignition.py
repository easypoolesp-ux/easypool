from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='gpspoint',
            name='ignition',
            field=models.BooleanField(default=True),
        ),
    ]
