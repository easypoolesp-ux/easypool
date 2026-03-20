from rest_framework import decorators, response, viewsets
from core.permissions import IsAdmin, IsManager, IsViewer, SchoolIsolationMixin
from .models import Organisation, Transporter, User
from .serializers import OrganisationSerializer, TransporterSerializer, UserSerializer


class OrganisationViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Organisation.objects.all()
    serializer_class = OrganisationSerializer
    permission_classes = [IsAdmin | IsManager]


class TransporterViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Transporter.objects.all()
    serializer_class = TransporterSerializer
    permission_classes = [IsAdmin | IsManager | IsViewer]


class UserViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin | IsManager]

    @decorators.action(detail=False, methods=['get'], permission_classes=[IsManager | IsViewer])
    def me(self, request):
        """Return the current authenticated user's profile info."""
        serializer = self.get_serializer(request.user)
        return response.Response(serializer.data)
