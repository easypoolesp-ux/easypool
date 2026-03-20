from django.db.models import OuterRef, Subquery
from rest_framework import decorators, response, viewsets

from apps.gps.models import GPSPoint
from core.permissions import IsAdmin, IsManager, IsViewer, SchoolIsolationMixin

from .models import Bus, Route
from .serializers import BusDetailSerializer, BusListSerializer, RouteSerializer


class RouteViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer
    permission_classes = [IsManager]

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.user.organisation)


class BusViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Bus.objects.all()

    def get_queryset(self):
        # Apply isolation first via super()
        queryset = super().get_queryset()

        # Subquery for latest GPS point per bus
        latest_gps = GPSPoint.objects.filter(bus=OuterRef('pk')).order_by('-timestamp')

        return (
            queryset.select_related('route')
            .annotate(
                latest_lat=Subquery(latest_gps.values('lat')[:1]),
                latest_lng=Subquery(latest_gps.values('lng')[:1]),
                latest_speed=Subquery(latest_gps.values('speed')[:1]),
                latest_heading=Subquery(latest_gps.values('heading')[:1]),
                latest_heartbeat=Subquery(latest_gps.values('timestamp')[:1]),
            )
        )

    permission_classes = [IsAdmin | IsManager | IsViewer]
    filterset_fields = ['status', 'route', 'internal_id', 'transporter']

    def get_serializer_class(self):
        if self.action == 'list':
            return BusListSerializer
        return BusDetailSerializer

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.user.organisation)

    @decorators.action(detail=False, methods=['get'])
    def online(self, request):
        """Return only online buses for the user's scope."""
        buses = self.get_queryset().filter(status='online')
        serializer = BusListSerializer(buses, many=True)
        return response.Response(serializer.data)

    @decorators.action(detail=True, methods=['post'])
    def request_evidence(self, request, pk=None):
        """
        Request a video clip from the bus's SD card.
        This triggers an MQTT command to the edge device.
        """
        bus = self.get_object()
        start_time = request.data.get('start_time')
        duration = request.data.get('duration', 60)  # Default 60 seconds
        camera_slug = request.data.get('camera_slug')

        if not start_time:
            return response.Response({'error': 'start_time is required'}, status=400)

        # SIMULATION: In production, this would send an MQTT message:
        # mqtt.publish(f"bus/{bus.id}/cmd", {"action": "upload_sd_clip", "start": start_time, ...})
        print(f'DEBUG: Evidence requested for Bus {bus.internal_id} at {start_time}')

        return response.Response(
            {
                'status': 'request_queued',
                'message': f'Footage from {start_time} is being synced from SD card to Cloud Storage.',
                'estimated_wait': '20s',
                'download_url': f'https://storage.googleapis.com/easypool-evidence/bus_{bus.internal_id}_{start_time.replace(":", "-")}.mp4',
            }
        )
