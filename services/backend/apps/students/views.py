from rest_framework import viewsets, decorators, response
from core.permissions import IsSchoolAdmin, SchoolIsolationMixin
from .models import Student, Parent
from .serializers import StudentListSerializer, StudentDetailSerializer, ParentSerializer

class StudentViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Student.objects.all()
    filterset_fields = ['bus', 'grade']
    permission_classes = [IsSchoolAdmin]

    def get_serializer_class(self):
        if self.action == 'list':
            return StudentListSerializer
        return StudentDetailSerializer

    @decorators.action(detail=True, methods=['post'])
    def upload_photo(self, request, pk=None):
        """Mock photo upload and trigger embedding generation."""
        student = self.get_object()
        # In real world: upload to GCS, then trigger AI
        return response.Response({'status': 'photo uploaded, processing started'})

class ParentViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Parent.objects.all()
    serializer_class = ParentSerializer
    permission_classes = [IsSchoolAdmin]
