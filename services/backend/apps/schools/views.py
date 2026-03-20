from rest_framework import viewsets, decorators, response
from core.permissions import IsSuperAdmin, IsSchoolAdmin, IsTransporter, SchoolIsolationMixin
from .models import School, User, Transporter
from .serializers import SchoolSerializer, UserSerializer, TransporterSerializer


class SchoolViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer
    permission_classes = [IsSuperAdmin | IsSchoolAdmin]

    # Queryset scoping is handled by SchoolIsolationMixin


class TransporterViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Transporter.objects.all()
    serializer_class = TransporterSerializer
    permission_classes = [IsSuperAdmin | IsSchoolAdmin | IsTransporter]

    # Queryset scoping is handled by SchoolIsolationMixin


class UserViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsSuperAdmin | IsSchoolAdmin]

    @decorators.action(detail=False, methods=['get'], permission_classes=[IsSchoolAdmin | IsTransporter])
    def me(self, request):
        """Return the current authenticated user's own profile info."""
        serializer = self.get_serializer(request.user)
        return response.Response(serializer.data)
