from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gps', '0003_gpspoint_ignition'),
    ]

    operations = [
        migrations.RunSQL(
            """
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gps_gpspoint' AND column_name='heading') THEN
                ALTER TABLE gps_gpspoint ADD COLUMN heading double precision DEFAULT 0;
              END IF;
            END
            $$;
            """,
            reverse_sql="ALTER TABLE gps_gpspoint DROP COLUMN IF EXISTS heading;"
        ),
    ]
