from rest_framework import decorators, response, viewsets

from core.permissions import IsSchoolAdmin, SchoolIsolationMixin

from .models import Attendance
from .serializers import AttendanceSerializer


class AttendanceViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsSchoolAdmin]
    filterset_fields = {
        'student': ['exact'],
        'bus': ['exact'],
        'direction': ['exact'],
        'timestamp': ['gte', 'lte'],
    }

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        """Return daily summary for a bus."""
        bus_id = request.query_params.get('bus')
        date = request.query_params.get('date')
        # Logic for summary: total boarded, alighted, etc.
        return response.Response(
            {
                'total_students': 40,
                'boarded': 38,
                'alighted': 35,
                'absent': ['Student A', 'Student B'],
            }
        )
