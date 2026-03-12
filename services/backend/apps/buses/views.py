from rest_framework import viewsets, decorators, response, permissions
from core.permissions import IsSchoolAdmin, IsTransporter, SchoolIsolationMixin
from .models import Route, Bus
from .serializers import RouteSerializer, BusListSerializer, BusDetailSerializer

class RouteViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer
    permission_classes = [IsSchoolAdmin]

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

class BusViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Bus.objects.select_related('route').all()
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
    def update_status(self, request, pk=None):
        """Update just the bus status."""
        bus = self.get_object()
        status = request.data.get('status')
        if status in dict(Bus.STATUS_CHOICES):
            bus.status = status
            bus.save()
            return response.Response({'status': 'updated'})
        return response.Response({'error': 'invalid status'}, status=400)
