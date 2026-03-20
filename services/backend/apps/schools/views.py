from rest_framework import decorators, response, viewsets

from core.permissions import IsAdmin, IsManager, IsViewer, SchoolIsolationMixin

from .models import Organisation, User
from .serializers import OrganisationSerializer, UserSerializer


class OrganisationViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Organisation.objects.all()
    serializer_class = OrganisationSerializer
    permission_classes = [IsAdmin | IsManager]

    def get_queryset(self):
        from django.db.models import Count, Q

        queryset = super().get_queryset()
        return queryset.annotate(
            owned_count=Count('owned_buses', distinct=True),
            allocated_count=Count(
                'allocations_received',
                filter=Q(allocations_received__is_active=True),
                distinct=True,
            ),
        )


# Compatibility Bridge: Maps the old Transporter API
# to the new pure-Organisation model (type: bus_agency).
class TransporterViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = Organisation.objects.filter(org_type='bus_agency')
    serializer_class = OrganisationSerializer
    permission_classes = [IsAdmin | IsManager | IsViewer]


class UserViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin | IsManager]

    @decorators.action(detail=False, methods=['get'], permission_classes=[IsManager | IsViewer])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return response.Response(serializer.data)
