from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Organisation, Transporter, User


class OrganisationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = '__all__'


class TransporterSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source='organisation.name', read_only=True)

    class Meta:
        model = Transporter
        fields = '__all__'


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
            'transporter',
            'photo_url',
        )
        read_only_fields = ('id',)

    @extend_schema_field(serializers.CharField())
    def get_organisation_name(self, obj):
        return obj.organisation.name if obj.organisation else None
