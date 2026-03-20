from rest_framework import decorators, permissions, response, viewsets

from core.permissions import IsSchoolAdmin, IsSuperAdmin, IsTransporter, SchoolIsolationMixin

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
    permission_classes = [IsSchoolAdmin]

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

    @decorators.action(detail=False, methods=['get'])
    def latest(self, request):
        """Return latest GPS point for every bus in the school."""
        buses = self.request.user.school.buses.all()
        latest_points = []
        for bus in buses:
            # We use first() because for each bus, we want the most recent point (ordered by -timestamp)
            point = GPSPoint.objects.filter(bus=bus).first()
            if point:
                latest_points.append(GPSLatestSerializer(point).data)
        return response.Response(latest_points)

    @decorators.action(detail=False, methods=['get'])
    def playback(self, request):
        """Return historical points for a bus on a specific date."""
        bus_id = request.query_params.get('bus')
        date_str = request.query_params.get('date')  # Format: YYYY-MM-DD

        if not bus_id:
            return response.Response({'error': 'bus_id is required'}, status=400)

        # Security: Ensure bus belongs to the user's school (Standardized on UUID)
        if not request.user.school.buses.filter(id=bus_id).exists():
            return response.Response({'error': 'Unauthorized or invalid bus_id'}, status=403)

        qs = GPSPoint.objects.filter(bus_id=bus_id)

        if date_str:
            from django.utils.dateparse import parse_date

            target_date = parse_date(date_str)
            if target_date:
                qs = qs.filter(timestamp__date=target_date)
            else:
                return response.Response(
                    {'error': 'Invalid date format (use YYYY-MM-DD)'}, status=400
                )
        else:
            # Default to today in current timezone (Kolkata)
            from django.utils import timezone

            qs = qs.filter(timestamp__date=timezone.now().date())

        # Order by timestamp for playback order
        qs = qs.order_by('timestamp')

        return response.Response(GPSPlaybackSerializer(qs, many=True).data)

    @decorators.action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def telemetry(self, request):
        """Update GPS point for a bus (called by TCP gateway)."""
        api_key = request.headers.get('X-API-KEY')
        if api_key != 'easypool_gps_secret_2026':
            return response.Response({'error': 'Unauthorized'}, status=401)

        imei = request.data.get('imei')
        try:
            from django.utils import timezone

            from apps.buses.models import Bus

            bus = Bus.objects.get(gps_imei=imei)
            lat = request.data.get('lat')
            lng = request.data.get('lng')
            speed = float(request.data.get('speed', 0))
            heading = float(request.data.get('heading', 0))  # 0-360°
            ignition = request.data.get('ignition', False)

            # Create the GPS point (heading now stored)
            GPSPoint.objects.create(
                bus=bus,
                lat=lat,
                lng=lng,
                speed=speed,
                heading=heading,
                ignition=ignition,
                timestamp=timezone.now(),
            )

            # Derive bus status from live telemetry
            if not ignition:
                bus.status = 'ignition_off'  # Red
            elif speed > 5:
                bus.status = 'moving'  # Green
            else:
                bus.status = 'idle'  # Grey

            bus.save()
            return response.Response({'status': 'success'})
        except Bus.DoesNotExist:
            return response.Response({'error': 'Bus not found'}, status=404)
        except Exception as e:
            return response.Response({'error': str(e)}, status=400)

    @decorators.action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def seed_history(self, request):
        """Seed realistic GPS history for today's playback demo."""
        api_key = request.headers.get('X-API-KEY')
        if api_key != 'easypool_gps_secret_2026':
            return response.Response({'error': 'Unauthorized'}, status=401)

        import random
        from datetime import datetime, timedelta

        from django.utils import timezone

        from apps.buses.models import Bus

        buses = Bus.objects.all()
        today = timezone.now().date()

        # Start at 8 AM local time
        start_time = datetime.combine(today, datetime.min.time()).replace(hour=8, minute=0)
        start_time = timezone.make_aware(start_time, timezone.get_current_timezone())

        from apps.schools.models import Transporter

        # Create a default transporter for the school if none exists to demo "Groups"
        for school in list(set([b.school for b in buses])):
            if not Transporter.objects.filter(school=school).exists():
                Transporter.objects.create(
                    school=school,
                    name=f'{school.name} - Official Group',
                    contact_person='Admin',
                    is_active=True,
                )

        default_transporters = {t.school_id: t for t in Transporter.objects.all()}

        total_points = 0
        for i, bus in enumerate(buses):
            # Assing to group if unassigned to address user's "Groups" question
            if not bus.transporter:
                bus.transporter = default_transporters.get(bus.school_id)
                bus.save()

            # Clear existing data for today to avoid duplicates
            GPSPoint.objects.filter(bus=bus, timestamp__date=today).delete()

            points = []
            cur_lat, cur_lng = 22.5726 + (i * 0.005), 88.3639 + (i * 0.005)

            # Generate 150 points (2.5 hours, 1 per min)
            for j in range(150):
                ts = start_time + timedelta(minutes=j)
                cur_lat += random.uniform(-0.0006, 0.0006)
                cur_lng += random.uniform(-0.0006, 0.0006)
                points.append(
                    GPSPoint(
                        bus=bus,
                        lat=cur_lat,
                        lng=cur_lng,
                        speed=random.uniform(15, 40),
                        timestamp=ts,
                    )
                )

            GPSPoint.objects.bulk_create(points)
            total_points += len(points)

        return response.Response(
            {
                'status': 'success',
                'message': f'Seeded {total_points} points across {buses.count()} buses for {today}',
            }
        )


class AlertViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Alert.objects.all()
    serializer_class = AlertSerializer
    permission_classes = [IsSuperAdmin | IsSchoolAdmin | IsTransporter]

    @decorators.action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        alert = self.get_object()
        alert.is_resolved = True
        alert.resolved_by = request.user
        alert.save()
        return response.Response({'status': 'resolved'})
