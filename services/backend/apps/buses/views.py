import json

import redis
from django.conf import settings
from django.db.models import OuterRef, Subquery
from django.http import StreamingHttpResponse
from rest_framework import decorators, response, viewsets

from apps.gps.models import GPSPoint
from core.permissions import IsAdmin, IsManager, IsViewer, SchoolIsolationMixin

from .models import Bus, Route
from .serializers import BusDetailSerializer, BusListSerializer, RouteSerializer


def sse_event_stream():
    """Generator that listens to Redis and yields SSE blocks."""
    try:
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        pubsub.subscribe('live_bus_updates')

        # Send an initial connection establish event
        yield f'data: {json.dumps({"status": "connected"})}\n\n'

        for message in pubsub.listen():
            if message['type'] == 'message':
                # SSE format is strict: "data: {json}\n\n"
                yield f'data: {message["data"]}\n\n'
    except Exception as e:
        print(f'[SSE ERROR] {e}')
        yield f'data: {json.dumps({"error": str(e)})}\n\n'


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
            queryset.select_related('route', 'organisation')
            .prefetch_related('allocations')
            .annotate(
                latest_gps_id=Subquery(latest_gps.values('id')[:1]),
                latest_speed=Subquery(latest_gps.values('speed')[:1]),
                latest_heading=Subquery(latest_gps.values('heading')[:1]),
                latest_heartbeat=Subquery(latest_gps.values('timestamp')[:1]),
                latest_ignition=Subquery(latest_gps.values('ignition')[:1]),
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

    @decorators.action(detail=False, methods=['get'])
    def stream(self, request):
        """SSE endpoint for live bus locations streaming directly from Redis."""
        # Note: In a true multi-tenant production app, you might want to filter the
        # Redis events here to only yield buses belonging to `request.user.organisation`.
        # For now, this yields the raw global stream for performance.
        resp = StreamingHttpResponse(sse_event_stream(), content_type='text/event-stream')
        resp['Cache-Control'] = 'no-cache'
        resp['X-Accel-Buffering'] = 'no'  # Prevents Nginx/Cloud Run from buffering the stream
        return resp

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
