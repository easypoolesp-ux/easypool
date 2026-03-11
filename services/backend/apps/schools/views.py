from rest_framework import viewsets
from core.permissions import IsSuperAdmin, IsSchoolAdmin, SchoolIsolationMixin
from .models import School, User
from .serializers import SchoolSerializer, UserSerializer

class SchoolViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = School.objects.all()
    serializer_class = SchoolSerializer
    permission_classes = [IsSuperAdmin | IsSchoolAdmin]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'superadmin':
            return School.objects.all()
        return School.objects.filter(id=user.school_id)

class UserViewSet(SchoolIsolationMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsSuperAdmin | IsSchoolAdmin]
