from rest_framework import viewsets, decorators, response, permissions
from core.permissions import IsSchoolAdmin, SchoolIsolationMixin
from .models import GPSPoint, Alert
from .serializers import GPSPointSerializer, GPSLatestSerializer, AlertSerializer

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
            
        return qs[:1000] # Limit trail points

    @decorators.action(detail=False, methods=['get'])
    def latest(self, request):
        """Return latest GPS point for every bus in the school."""
        buses = self.request.user.school.buses.all()
        latest_points = []
        for bus in buses:
            point = GPSPoint.objects.filter(bus=bus).first()
            if point:
                latest_points.append(GPSLatestSerializer(point).data)
        return response.Response(latest_points)

    @decorators.action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def update(self, request):
        """Update GPS point for a bus (called by MQTT subscriber)."""
        api_key = request.headers.get('X-API-KEY')
        if api_key != "easypool_gps_secret_2026": # Should match GH Secret
            return response.Response({'error': 'Unauthorized'}, status=401)

        imei = request.data.get('imei')
        try:
            from apps.buses.models import Bus
            from django.utils import timezone
            import datetime
            
            bus = Bus.objects.get(gps_imei=imei) # Lookup by IMEI
            lat = request.data.get('lat')
            lng = request.data.get('lng')
            speed = request.data.get('speed', 0)
            
            # Create the point
            GPSPoint.objects.create(
                bus=bus,
                lat=lat,
                lng=lng,
                speed=speed,
                timestamp=timezone.now()
            )
            
            # Optionally update bus status to online if we are getting GPS
            if bus.status == 'offline':
                bus.status = 'online'
                bus.save()
                
            return response.Response({'status': 'success'})
        except Bus.DoesNotExist:
            return response.Response({'error': 'Bus not found'}, status=404)
        except Exception as e:
            return response.Response({'error': str(e)}, status=400)

class AlertViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Alert.objects.all()
    serializer_class = AlertSerializer
    permission_classes = [permissions.AllowAny] # Relax for dashboard demo

    @decorators.action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        alert = self.get_object()
        alert.is_resolved = True
        alert.resolved_by = request.user
        alert.save()
        return response.Response({'status': 'resolved'})
