from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import School, Transporter, User


class SchoolSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source='organisation.name', read_only=True)

    class Meta:
        model = School
        fields = ('id', 'organisation', 'organisation_name', 'name', 'address', 'contact_email', 'phone', 'is_active')


class TransporterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transporter
        fields = '__all__'


class UserSerializer(serializers.ModelSerializer):
    organisation_name = serializers.SerializerMethodField()
    school_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'full_name',
            'organisation',
            'organisation_name',
            'school',
            'school_name',
            'transporter',
            'photo_url',
        )
        read_only_fields = ('id',)

    @extend_schema_field(serializers.CharField())
    def get_organisation_name(self, obj):
        return obj.organisation.name if obj.organisation else None

    @extend_schema_field(serializers.CharField())
    def get_school_name(self, obj):
        if obj.school:
            return obj.school.organisation.name if obj.school.organisation else obj.school.name
        return None
