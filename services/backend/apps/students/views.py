from rest_framework import decorators, response, viewsets

from core.permissions import IsManager, SchoolIsolationMixin

from .models import Parent, Student
from .serializers import ParentSerializer, StudentDetailSerializer, StudentListSerializer


class StudentViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Student.objects.all()
    filterset_fields = ['bus', 'grade']
    permission_classes = [IsManager]

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
    permission_classes = [IsManager]
