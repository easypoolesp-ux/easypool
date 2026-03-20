from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Organisation, User


class OrganisationSerializer(serializers.ModelSerializer):
    vehicle_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Organisation
        fields = (
            'id',
            'name',
            'org_type',
            'parent',
            'address',
            'contact_email',
            'phone',
            'is_active',
            'vehicle_count',
            'created_at',
        )


# Compatibility: The frontend still expects a "transporters" API.
# We point it to Organisation but filter for bus_agency in the view.
class TransporterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = ('id', 'name', 'address', 'contact_email', 'phone', 'is_active', 'created_at')


class UserSerializer(serializers.ModelSerializer):
    organisation_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'full_name',
            'organisation',
            'organisation_name',
            'groups',
            'photo_url',
        )
        read_only_fields = ('id', 'groups')

    @extend_schema_field(serializers.CharField())
    def get_organisation_name(self, obj):
        return obj.organisation.name if obj.organisation else None
