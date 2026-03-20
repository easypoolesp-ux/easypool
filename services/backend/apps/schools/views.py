from rest_framework import decorators, response, viewsets

from core.permissions import IsAdmin, IsManager, IsViewer, SchoolIsolationMixin

from .models import School, Transporter, User
from .serializers import SchoolSerializer, TransporterSerializer, UserSerializer


class SchoolViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer
    permission_classes = [IsAdmin | IsManager]

    # Queryset scoping is handled by SchoolIsolationMixin


class TransporterViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Transporter.objects.all()
    serializer_class = TransporterSerializer
    permission_classes = [IsAdmin | IsManager | IsViewer]

    # Queryset scoping is handled by SchoolIsolationMixin


class UserViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin | IsManager]

    @decorators.action(detail=False, methods=['get'], permission_classes=[IsManager | IsViewer])
    def me(self, request):
        """Return the current authenticated user's own profile info."""
        serializer = self.get_serializer(request.user)
        return response.Response(serializer.data)
