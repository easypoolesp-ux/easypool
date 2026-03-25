
from django.core.management.base import BaseCommand
from django.db import connection

from apps.buses.models import Bus
from apps.gps.models import BusHourlyDistance


class Command(BaseCommand):
    help = 'Backfill hourly distance analytics from existing GPS points'

    def handle(self, *args, **options):
        self.stdout.write('Starting backfill of hourly distance analytics...')

        buses = Bus.objects.all()
        for bus in buses:
            self.stdout.write(f'Processing bus: {bus.internal_id}')

            # Using the same high-performance SQL as the timeline API to compute hourly sums
            sql = """
                WITH step_distances AS (
                    SELECT
                        bus_id,
                        timestamp,
                        ST_Distance(
                            ST_SetSRID(location, 4326)::geography,
                            LAG(ST_SetSRID(location, 4326)::geography) OVER (PARTITION BY bus_id ORDER BY timestamp)
                        ) as d
                    FROM gps_gpspoint
                    WHERE bus_id = %s
                ),
                hourly_agg AS (
                    SELECT
                        bus_id,
                        date_trunc('hour', timestamp) as hr,
                        SUM(COALESCE(d, 0)) as meters_in_hour
                    FROM step_distances
                    GROUP BY bus_id, hr
                )
                SELECT hr, meters_in_hour FROM hourly_agg;
            """

            with connection.cursor() as cursor:
                cursor.execute(sql, [str(bus.id)])
                rows = cursor.fetchall()

                for hr, meters in rows:
                    if meters > 0:
                        BusHourlyDistance.objects.update_or_create(
                            bus=bus, hour=hr, defaults={'distance_km': meters / 1000.0}
                        )

        self.stdout.write(self.style.SUCCESS('Successfully backfilled analytics data!'))
