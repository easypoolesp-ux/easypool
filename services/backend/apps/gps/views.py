# Final trigger for production deployment verification - verified gold-standard CLI deploy
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D  # noqa: F401 — available for future geo-filters
from rest_framework import decorators, permissions, response, viewsets

from django.conf import settings
from apps.buses.models import Bus
from core.permissions import IsAdmin, IsManager, IsViewer, SchoolIsolationMixin, apply_isolation

from .models import Alert, GPSPoint
from .serializers import (
    AlertSerializer,
    GPSLatestSerializer,
    GPSPlaybackSerializer,
    GPSPointSerializer,
)
from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes
import sys
import traceback
from collections import defaultdict
from datetime import datetime
from django.utils import timezone
from django.db import connection


class GPSPointViewSet(SchoolIsolationMixin, viewsets.ReadOnlyModelViewSet):
    queryset = GPSPoint.objects.all()
    serializer_class = GPSPointSerializer
    permission_classes = [IsManager]

    def get_queryset(self):
        qs = super().get_queryset()
        bus_id = self.request.query_params.get('bus')
        start = self.request.query_params.get('start')
        end = self.request.query_params.get('end')

        if bus_id:
            qs = qs.filter(bus_id=bus_id)
        if start and end:
            qs = qs.filter(timestamp__range=[start, end])

        return qs[:1000]

    @decorators.action(detail=False, methods=['get'], permission_classes=[IsManager | IsViewer])
    def latest(self, request):
        """Return latest GPS point for every bus in the user's scope."""
        user = request.user
        buses = apply_isolation(user, Bus.objects.all())

        latest_points = []
        for bus in buses.distinct():
            point = GPSPoint.objects.filter(bus=bus).first()
            if point:
                latest_points.append(GPSLatestSerializer(point).data)
        return response.Response(latest_points)

    @decorators.action(detail=False, methods=['get'], permission_classes=[IsManager | IsViewer])
    def playback(self, request):
        """Return historical points for a bus on a specific date."""
        bus_id = request.query_params.get('bus')
        date_str = request.query_params.get('date')

        if not bus_id:
            return response.Response({'error': 'bus_id is required'}, status=400)

        user = request.user
        bus_qs = apply_isolation(user, Bus.objects.filter(id=bus_id))

        if not bus_qs.exists():
            return response.Response({'error': 'Unauthorized or invalid bus_id'}, status=403)

        qs = GPSPoint.objects.filter(bus_id=bus_id)

        hours = request.query_params.get('hours')

        if date_str:
            from django.utils.dateparse import parse_date

            target_date = parse_date(date_str)
            if target_date:
                qs = qs.filter(timestamp__date=target_date)
            else:
                return response.Response({'error': 'Invalid date format'}, status=400)
        elif hours:
            from django.utils import timezone
            from datetime import timedelta

            try:
                hours_int = int(hours)
                qs = qs.filter(timestamp__gte=timezone.now() - timedelta(hours=hours_int))
            except ValueError:
                return response.Response({'error': 'Invalid hours format'}, status=400)
        else:
            from django.utils import timezone

            qs = qs.filter(timestamp__date=timezone.now().date())

        return response.Response(GPSPlaybackSerializer(qs.order_by('timestamp'), many=True).data)

    @extend_schema(
        summary="Cumulative KM Timeline",
        description="Return cumulative KM series per bus, computed in PostGIS.",
        parameters=[
            OpenApiParameter("start", OpenApiTypes.DATE, description="ISO date (default: today)"),
            OpenApiParameter("end", OpenApiTypes.DATE, description="ISO date (default: start)"),
            OpenApiParameter("bus", OpenApiTypes.STR, description="Comma-separated bus IDs"),
        ],
        responses={200: OpenApiTypes.ANY}
    )
    @decorators.action(detail=False, methods=['get'], permission_classes=[IsManager | IsViewer])
    def timeline(self, request):
        """Return cumulative KM series per bus, computed in PostGIS.

        PostgreSQL computes ST_Distance between consecutive points using a LAG
        window function — the browser receives ready-to-plot {timestamp, km} pairs.

        Query params:
          start  ISO date (default: today)
          end    ISO date (default: start)
          bus    comma-separated bus IDs (optional)
        """
        from django.db import connection
        from django.utils import timezone
        from django.utils.dateparse import parse_date

        today = timezone.now().date()
        start_date = parse_date(request.query_params.get('start', '')) or today
        end_date   = parse_date(request.query_params.get('end',   '')) or start_date

        if end_date < start_date:
            return response.Response({'error': 'end must be >= start'}, status=400)

        buses = apply_isolation(request.user, Bus.objects.all())
        bus_filter = request.query_params.get('bus')
        if bus_filter:
            ids = [b.strip() for b in bus_filter.split(',') if b.strip()]
            buses = buses.filter(id__in=ids)

        result = []
        try:
            import sys
            import traceback
            from collections import defaultdict

            bus_map = {str(b.id): b.internal_id for b in buses}
            if not bus_map:
                return response.Response([])

            # Multi-step hourly aggregation: 100% accurate distance but tiny payload size (1/1000th).
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
                    WHERE bus_id = ANY(%s)
                      AND timestamp >= %s::timestamp
                      AND timestamp < (%s::timestamp + interval '1 day')
                      AND location IS NOT NULL
                ),
                hourly_agg AS (
                    SELECT
                        bus_id,
                        date_trunc('hour', timestamp) as hr,
                        SUM(COALESCE(d, 0)) as meters_in_hour
                    FROM step_distances
                    GROUP BY bus_id, hr
                )
                SELECT 
                    bus_id, 
                    hr as timestamp, 
                    ROUND(SUM(meters_in_hour) OVER (PARTITION BY bus_id ORDER BY hr) / 1000.0, 3) as cumulative_km
                FROM hourly_agg
                ORDER BY bus_id, hr
            """
            
            with connection.cursor() as cursor:
                # Pass bus IDs as a list of strings
                params = [list(bus_map.keys()), str(start_date), str(end_date)]
                
                # Debug logging for troubleshooting
                print(f"Timeline Query SQL: {sql}", file=sys.stderr)
                print(f"Timeline Query Params: {params}", file=sys.stderr)
                
                cursor.execute(sql, params)
                rows = cursor.fetchall()
                print(f"Timeline Query returned {len(rows)} rows", file=sys.stderr)

            # Group rows by bus_id
            grouped_data = defaultdict(list)
            for row in rows:
                b_id = str(row[0])
                grouped_data[b_id].append({
                    'timestamp': row[1].isoformat() if hasattr(row[1], 'isoformat') else str(row[1]),
                    'cumulative_km': float(row[2]) if row[2] is not None else 0.0
                })

            for b_id, series in grouped_data.items():
                result.append({
                    'bus_id': b_id,
                    'internal_id': bus_map.get(b_id, "Unknown"),
                    'series': series
                })

        except Exception as e:
            error_details = traceback.format_exc()
            print(f"Timeline API error: {error_details}", file=sys.stderr)
            # Re-throw with more context or return detailed response
            return response.Response({
                'error': str(e),
                'details': error_details,  # Force details for investigation
                'sql_context': {
                    'bus_ids': list(bus_map.keys()),
                    'start_date': str(start_date),
                    'end_date': str(end_date)
                }
            }, status=500)

        return response.Response(result)

    @decorators.action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def telemetry(self, request):
        """Update GPS point for a bus (called by TCP gateway)."""
        api_key = request.headers.get('X-API-KEY')
        if api_key != 'easypool_gps_secret_2026':
            return response.Response({'error': 'Unauthorized'}, status=401)

        imei = request.data.get('imei')
        try:
            from django.utils import timezone
            from datetime import datetime

            bus = Bus.objects.get(gps_imei=imei)
            lat, lng = request.data.get('lat'), request.data.get('lng')
            speed = float(request.data.get('speed', 0))
            heading = float(request.data.get('heading', 0))
            ignition = request.data.get('ignition', False)
            
            # Use provided timestamp or fallback to now
            ts_raw = request.data.get('timestamp')
            if ts_raw:
                ts = datetime.fromtimestamp(float(ts_raw), tz=timezone.utc)
            else:
                ts = timezone.now()

            if isinstance(ignition, str):
                ignition = ignition.lower() == 'true'

            GPSPoint.objects.create(
                bus=bus,
                location=Point(lng, lat),
                speed=speed,
                heading=heading,
                ignition=ignition,
                timestamp=ts,
            )

            # Pre-calculation for Industry-Standard Analytics
            try:
                from django.contrib.gis.db.models.functions import Distance
                from .models import BusHourlyDistance
                
                # Truncate to hour
                hr_ts = ts.replace(minute=0, second=0, microsecond=0)
                
                # Get last point (cached would be better, but this is accurate)
                prev_point = GPSPoint.objects.filter(bus=bus, timestamp__lt=ts).first()
                if prev_point and prev_point.location:
                    # Calculate distance in meters using PostGIS logic (via ORM)
                    # For performance at scale, this should be moved to a background task
                    # but here we do it to ensure 'Industry' pre-calculation.
                    new_point_loc = Point(lng, lat, srid=4326)
                    
                    # RAW SQL execution for maximum precision and performance in ingestion
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "SELECT ST_Distance(%s::geography, %s::geography)",
                            [new_point_loc.ewkt, prev_point.location.ewkt]
                        )
                        d_meters = cursor.fetchone()[0] or 0
                        
                        # Update hourly aggregate
                        stats, _ = BusHourlyDistance.objects.get_or_create(bus=bus, hour=hr_ts)
                        stats.distance_km += (d_meters / 1000.0)
                        stats.save()
            except Exception as stats_err:
                # Don't fail the ingestion if stats calculation fails
                print(f"Stats pre-calc error: {stats_err}", file=sys.stderr)

            return response.Response({'status': 'success'})
        except Exception as e:
            traceback.print_exc()
            return response.Response({'error': str(e)}, status=400)

    @decorators.action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def bulk_telemetry(self, request):
        """Batch update for GPS points (called by smarter Gateway)."""
        api_key = request.headers.get('X-API-KEY')
        if api_key != 'easypool_gps_secret_2026':
            return response.Response({'error': 'Unauthorized'}, status=401)

        data_list = request.data
        if not isinstance(data_list, list):
            return response.Response({'error': 'Expected a list of points'}, status=400)

        from django.utils import timezone

        points_to_create = []
        buses_to_update = {}  # imei -> (bus, ignition, speed)
        
        # Batch lookup buses to avoid N+1 queries
        imeis = {p.get('imei') for p in data_list if p.get('imei')}
        bus_map = {b.gps_imei: b for b in Bus.objects.filter(gps_imei__in=imeis)}

        for entry in data_list:
            imei = entry.get('imei')
            bus = bus_map.get(imei)
            if not bus:
                continue

            coords = entry.get('coords')  # [lng, lat]
            if not coords or len(coords) < 2:
                continue

            speed = float(entry.get('speed', 0))
            ignition = entry.get('ignition', False)
            if isinstance(ignition, str):
                ignition = ignition.lower() == 'true'

            # Parse original GPS timestamp
            ts_raw = entry.get('timestamp')
            if ts_raw:
                from datetime import datetime
                ts = datetime.fromtimestamp(float(ts_raw), tz=timezone.utc)
            else:
                ts = timezone.now()

            points_to_create.append(
                GPSPoint(
                    bus=bus,
                    location=Point(float(coords[0]), float(coords[1])),
                    speed=speed,
                    heading=float(entry.get('heading', 0)),
                    ignition=ignition,
                    timestamp=ts,
                )
            )
            # Track latest status per bus in this batch
            buses_to_update[imei] = (bus, ignition, speed)

        # Pre-calculation for Industry-Standard Analytics
        try:
            from django.db import connection
            from .models import BusHourlyDistance
            
            for entry in data_list:
                imei = entry.get('imei')
                bus = bus_map.get(imei)
                if not bus: continue
                
                coords = entry.get('coords')
                ts_raw = entry.get('timestamp')
                if not coords or not ts_raw: continue
                
                ts = datetime.fromtimestamp(float(ts_raw), tz=timezone.utc)
                hr_ts = ts.replace(minute=0, second=0, microsecond=0)
                
                # We need the previous point to calculate distance.
                # In bulk, we might have multiple points for the same bus.
                # Simplification: get distance from the point just before this batch.
                prev_point = GPSPoint.objects.filter(bus=bus, timestamp__lt=ts).first()
                if prev_point and prev_point.location:
                    new_loc = Point(float(coords[0]), float(coords[1]), srid=4326)
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "SELECT ST_Distance(%s::geography, %s::geography)",
                            [new_loc.ewkt, prev_point.location.ewkt]
                        )
                        d_meters = cursor.fetchone()[0] or 0
                        stats, _ = BusHourlyDistance.objects.get_or_create(bus=bus, hour=hr_ts)
                        stats.distance_km += (d_meters / 1000.0)
                        stats.save()
        except Exception as stats_err:
            print(f"Bulk Stats pre-calc error: {stats_err}", file=sys.stderr)

        return response.Response({'status': 'success', 'count': len(points_to_create)})


class AlertViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Alert.objects.all()
    serializer_class = AlertSerializer
    permission_classes = [IsAdmin | IsManager | IsViewer]

    @decorators.action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        alert = self.get_object()
        alert.is_resolved = True
        alert.resolved_by = request.user
        alert.save()
        return response.Response({'status': 'resolved'})
