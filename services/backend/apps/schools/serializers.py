from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Organisation, User

class OrganisationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = '__all__'

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
            'photo_url',
        )
        read_only_fields = ('id',)

    @extend_schema_field(serializers.CharField())
    def get_organisation_name(self, obj):
        return obj.organisation.name if obj.organisation else None
