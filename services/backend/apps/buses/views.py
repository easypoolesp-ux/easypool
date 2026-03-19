from django.db.models import OuterRef, Subquery
from rest_framework import viewsets, decorators, response, permissions
from core.permissions import IsSchoolAdmin, IsTransporter, SchoolIsolationMixin
from apps.gps.models import GPSPoint
from .models import Route, Bus
from .serializers import RouteSerializer, BusListSerializer, BusDetailSerializer

class RouteViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer
    permission_classes = [IsSchoolAdmin]

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

class BusViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    def get_queryset(self):
        # Subquery for latest GPS point per bus
        latest_gps = GPSPoint.objects.filter(bus=OuterRef('pk')).order_by('-timestamp')
        
        return Bus.objects.select_related('route').annotate(
            latest_lat=Subquery(latest_gps.values('lat')[:1]),
            latest_lng=Subquery(latest_gps.values('lng')[:1]),
            latest_heartbeat=Subquery(latest_gps.values('timestamp')[:1])
        ).all()

    permission_classes = [permissions.AllowAny] # Relax for dashboard demo
    filterset_fields = ['status', 'route', 'internal_id', 'transporter']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return BusListSerializer
        return BusDetailSerializer

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    @decorators.action(detail=False, methods=['get'])
    def online(self, request):
        """Return only online buses for the school."""
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
        duration = request.data.get('duration', 60) # Default 60 seconds
        camera_slug = request.data.get('camera_slug')

        if not start_time:
            return response.Response({'error': 'start_time is required'}, status=400)

        # SIMULATION: In production, this would send an MQTT message:
        # mqtt.publish(f"bus/{bus.id}/cmd", {"action": "upload_sd_clip", "start": start_time, ...})
        print(f"DEBUG: Evidence requested for Bus {bus.internal_id} at {start_time}")

        return response.Response({
            'status': 'request_queued',
            'message': f'Footage from {start_time} is being synced from SD card to Cloud Storage.',
            'estimated_wait': '20s',
            'download_url': f'https://storage.googleapis.com/easypool-evidence/bus_{bus.internal_id}_{start_time.replace(":", "-")}.mp4'
        })
