# Final trigger for production deployment verification - verified gold-standard CLI deploy
import sys
import traceback
from collections import defaultdict
import zoneinfo
from datetime import datetime, time, timedelta

from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D  # noqa: F401 — available for future geo-filters
from django.db import connection
from django.db.models import F, Max, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import decorators, permissions, response, viewsets

from apps.buses.models import Bus
from core.permissions import (
    IsAdmin,
    IsManager,
    IsViewer,
    SchoolIsolationMixin,
    apply_isolation,
)

from .models import Alert, GPSPoint
from .serializers import (
    AlertSerializer,
    GPSLatestSerializer,
    GPSPlaybackSerializer,
    GPSPointSerializer,
)


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
        """Return historical GPS points for a bus over a date range."""
        bus_id = request.query_params.get('bus')
        if not bus_id:
            return response.Response({'error': 'bus_id is required'}, status=400)

        bus_qs = apply_isolation(request.user, Bus.objects.filter(id=bus_id))
        if not bus_qs.exists():
            return response.Response({'error': 'Unauthorized or invalid bus_id'}, status=403)

        qs = GPSPoint.objects.filter(bus_id=bus_id)

        # Timezone-aware boundary builder (IST)
        ist = zoneinfo.ZoneInfo('Asia/Kolkata')

        start_str = request.query_params.get('start_date') or request.query_params.get('date')
        end_str   = request.query_params.get('end_date')
        hours     = request.query_params.get('hours')

        if hours:
            # hours takes priority — "last N hours" is always relative to now
            try:
                qs = qs.filter(timestamp__gte=timezone.now() - timedelta(hours=int(hours)))
            except ValueError:
                return response.Response({'error': 'Invalid hours'}, status=400)
        elif start_str:
            start_date = parse_date(start_str)
            if not start_date:
                return response.Response({'error': 'Invalid start_date'}, status=400)
            end_date = parse_date(end_str) if end_str else start_date
            if end_date < start_date:
                return response.Response({'error': 'end_date must be >= start_date'}, status=400)
            # Explicit IST boundaries — no reliance on DB timezone conversion
            start_dt = datetime.combine(start_date, time.min, tzinfo=ist)
            end_dt   = datetime.combine(end_date, time(23, 59, 59, 999999), tzinfo=ist)
            qs = qs.filter(timestamp__gte=start_dt, timestamp__lte=end_dt)
        else:
            # Fallback: today in IST
            today = timezone.now().astimezone(ist).date()
            start_dt = datetime.combine(today, time.min, tzinfo=ist)
            end_dt   = datetime.combine(today, time(23, 59, 59, 999999), tzinfo=ist)
            qs = qs.filter(timestamp__gte=start_dt, timestamp__lte=end_dt)

        # Cap at 5000 points to keep payload sane over multi-day ranges
        return response.Response(
            GPSPlaybackSerializer(qs.order_by('timestamp')[:5000], many=True).data
        )

    @extend_schema(
        summary='GPS Staleness Report',
        description=(
            'Returns every bus in scope with its last GPS timestamp and a \'stale\' flag '
            'for vehicles that have not reported in more than `threshold_minutes` (default 15). '
            'Use this to distinguish: device offline, gateway down, or backend ingestion failure.'
        ),
        parameters=[
            OpenApiParameter(
                'threshold_minutes',
                OpenApiTypes.INT,
                description='Minutes of silence before a bus is marked stale (default: 15)',
            )
        ],
        responses={200: OpenApiTypes.ANY},
    )
    @decorators.action(detail=False, methods=['get'], permission_classes=[IsManager | IsViewer])
    def staleness(self, request):
        """Flag buses that haven't sent GPS data for > threshold_minutes."""
        try:
            threshold_minutes = int(request.query_params.get('threshold_minutes', 15))
        except ValueError:
            threshold_minutes = 15

        cutoff = timezone.now() - timedelta(minutes=threshold_minutes)
        buses = apply_isolation(request.user, Bus.objects.all())

        # One query: latest timestamp per bus
        latest_per_bus = (
            GPSPoint.objects.filter(bus__in=buses)
            .values('bus_id')
            .annotate(last_ts=Max('timestamp'))
        )
        ts_map = {str(row['bus_id']): row['last_ts'] for row in latest_per_bus}

        results = []
        for bus in buses:
            last_ts = ts_map.get(str(bus.id))
            stale = last_ts is None or last_ts < cutoff
            age_seconds = int((timezone.now() - last_ts).total_seconds()) if last_ts else None
            results.append({
                'bus_id': str(bus.id),
                'internal_id': bus.internal_id,
                'plate_number': bus.plate_number,
                'gps_imei': bus.gps_imei,
                'last_gps_at': last_ts.isoformat() if last_ts else None,
                'age_seconds': age_seconds,
                'stale': stale,
            })

        # Stale buses first, then by age descending
        results.sort(key=lambda x: (not x['stale'], x['age_seconds'] or 999999), reverse=False)
        stale_count = sum(1 for r in results if r['stale'])

        return response.Response({
            'threshold_minutes': threshold_minutes,
            'checked_at': timezone.now().isoformat(),
            'total_buses': len(results),
            'stale_count': stale_count,
            'buses': results,
        })

    @extend_schema(
        summary='Cumulative KM Timeline',
        description='Return cumulative KM series per bus, computed in PostGIS.',
        parameters=[
            OpenApiParameter('start', OpenApiTypes.DATE, description='ISO date (default: today)'),
            OpenApiParameter('end', OpenApiTypes.DATE, description='ISO date (default: start)'),
            OpenApiParameter('bus', OpenApiTypes.STR, description='Comma-separated bus IDs'),
        ],
        responses={200: OpenApiTypes.ANY},
    )
    @decorators.action(detail=False, methods=['get'], permission_classes=[IsManager | IsViewer])
    def timeline(self, request):
        """Return cumulative KM series per bus, computed in PostGIS."""
        today = timezone.now().date()
        start_date = parse_date(request.query_params.get('start', '')) or today
        end_date = parse_date(request.query_params.get('end', '')) or start_date

        if end_date < start_date:
            return response.Response({'error': 'end must be >= start'}, status=400)

        buses = apply_isolation(request.user, Bus.objects.all())
        bus_filter = request.query_params.get('bus')
        if bus_filter:
            ids = [b.strip() for b in bus_filter.split(',') if b.strip()]
            buses = buses.filter(id__in=ids)

        result = []
        try:
            from .models import BusHourlyDistance

            bus_map = {str(b.id): b.internal_id for b in buses}
            if not bus_map:
                return response.Response([])

            # Query pre-calculated hourly distances
            stats = BusHourlyDistance.objects.filter(
                bus__in=buses, hour__date__range=[start_date, end_date]
            ).order_by('bus', 'hour')

            # Group by bus and compute cumulative totals
            bus_series = defaultdict(list)
            for entry in stats:
                b_id = str(entry.bus_id)
                last_km = bus_series[b_id][-1]['cumulative_km'] if bus_series[b_id] else 0.0
                bus_series[b_id].append(
                    {
                        'timestamp': entry.hour.isoformat(),
                        'cumulative_km': round(last_km + entry.distance_km, 3),
                    }
                )

            for b_id, series in bus_series.items():
                result.append(
                    {'bus_id': b_id, 'internal_id': bus_map.get(b_id, 'Unknown'), 'series': series}
                )

        except Exception as e:
            error_details = traceback.format_exc()
            print(f'Timeline API error: {error_details}', file=sys.stderr)
            return response.Response({'error': str(e), 'details': error_details}, status=500)

        return response.Response(result)

    @decorators.action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def telemetry(self, request):
        """Update GPS point for a bus (called by TCP gateway)."""
        api_key = request.headers.get('X-API-KEY')
        if api_key != 'easypool_gps_secret_2026':
            return response.Response({'error': 'Unauthorized'}, status=401)

        imei = request.data.get('imei')
        try:
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
                from .models import BusHourlyDistance

                # Truncate to hour
                hr_ts = ts.replace(minute=0, second=0, microsecond=0)

                # Get last point (cached would be better, but this is accurate)
                prev_point = GPSPoint.objects.filter(bus=bus, timestamp__lt=ts).first()
                if prev_point and prev_point.location:
                    # Calculate distance in meters using PostGIS logic (via ORM)
                    new_point_loc = Point(lng, lat, srid=4326)

                    # RAW SQL execution for maximum precision and performance in ingestion
                    with connection.cursor() as cursor:
                        cursor.execute(
                            'SELECT ST_Distance(%s::geography, %s::geography)',
                            [new_point_loc.ewkt, prev_point.location.ewkt],
                        )
                        d_meters = cursor.fetchone()[0] or 0

                        # Update hourly aggregate
                        stats, _ = BusHourlyDistance.objects.get_or_create(bus=bus, hour=hr_ts)
                        stats.distance_km += d_meters / 1000.0
                        stats.save()
            except Exception as stats_err:
                # Don't fail the ingestion if stats calculation fails
                print(f'Stats pre-calc error: {stats_err}', file=sys.stderr)

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

        points_to_create = []

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

        # Pre-calculation for Industry-Standard Analytics
        try:
            # Group points by bus for efficient processing
            bus_points = defaultdict(list)
            for entry in data_list:
                imei = entry.get('imei')
                bus = bus_map.get(imei)
                if bus and entry.get('coords') and entry.get('timestamp'):
                    bus_points[bus].append(entry)

            for bus, entries in bus_points.items():
                self._update_hourly_stats(bus, entries)

        except Exception:
            print(f'Bulk Stats pre-calc error: {traceback.format_exc()}', file=sys.stderr)

        return response.Response({'status': 'success', 'count': len(points_to_create)})

    def _update_hourly_stats(self, bus, entries):
        """Helper to compute and update hourly distance aggregates."""
        from .models import BusHourlyDistance

        # Sort entries by timestamp
        entries.sort(key=lambda x: float(x['timestamp']))

        # Get the absolute previous point from DB only once per bus
        first_ts = datetime.fromtimestamp(float(entries[0]['timestamp']), tz=timezone.utc)
        prev_point = GPSPoint.objects.filter(bus=bus, timestamp__lt=first_ts).first()
        last_loc = prev_point.location if prev_point else None

        # Track hourly deltas in memory to minimize DB writes
        hourly_deltas = defaultdict(float)

        for entry in entries:
            coords = entry['coords']
            ts = datetime.fromtimestamp(float(entry['timestamp']), tz=timezone.utc)
            hr_ts = ts.replace(minute=0, second=0, microsecond=0)

            new_loc = Point(float(coords[0]), float(coords[1]), srid=4326)

            if last_loc:
                # Use raw SQL for accurate distance calculation
                with connection.cursor() as cursor:
                    cursor.execute(
                        'SELECT ST_Distance(%s::geography, %s::geography)',
                        [new_loc.ewkt, last_loc.ewkt],
                    )
                    d_meters = cursor.fetchone()[0] or 0
                    hourly_deltas[hr_ts] += d_meters / 1000.0

            last_loc = new_loc

        # Bulk update hourly stats
        for hr, dist in hourly_deltas.items():
            stats, _ = BusHourlyDistance.objects.get_or_create(bus=bus, hour=hr)
            stats.distance_km += dist
            stats.save()


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
