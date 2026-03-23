from rest_framework import decorators, permissions, response, viewsets

from apps.buses.models import Bus
from core.permissions import IsAdmin, IsManager, IsViewer, SchoolIsolationMixin, apply_isolation

from django.contrib.gis.geos import Point

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

        if date_str:
            from django.utils.dateparse import parse_date

            target_date = parse_date(date_str)
            if target_date:
                qs = qs.filter(timestamp__date=target_date)
            else:
                return response.Response({'error': 'Invalid date format'}, status=400)
        else:
            from django.utils import timezone

            qs = qs.filter(timestamp__date=timezone.now().date())

        return response.Response(GPSPlaybackSerializer(qs.order_by('timestamp'), many=True).data)

    @decorators.action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def telemetry(self, request):
        """Update GPS point for a bus (called by TCP gateway)."""
        api_key = request.headers.get('X-API-KEY')
        if api_key != 'easypool_gps_secret_2026':
            return response.Response({'error': 'Unauthorized'}, status=401)

        imei = request.data.get('imei')
        try:
            from django.utils import timezone

            bus = Bus.objects.get(gps_imei=imei)
            lat, lng = request.data.get('lat'), request.data.get('lng')
            speed = float(request.data.get('speed', 0))
            heading = float(request.data.get('heading', 0))
            ignition = request.data.get('ignition', False)
            if isinstance(ignition, str):
                ignition = ignition.lower() == 'true'

            GPSPoint.objects.create(
                bus=bus,
                location=Point(lng, lat),
                speed=speed,
                heading=heading,
                ignition=ignition,
                timestamp=timezone.now(),
            )

            if not ignition:
                bus.status = 'ignition_off'
            elif speed > 5:
                bus.status = 'moving'
            else:
                bus.status = 'idle'
            bus.save()
            return response.Response({'status': 'success'})
        except Exception as e:
            return response.Response({'error': str(e)}, status=400)


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
