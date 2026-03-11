from rest_framework import serializers
from .models import School, Transporter, User

class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = ('id', 'name', 'address', 'contact_email', 'phone', 'is_active')

class TransporterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transporter
        fields = '__all__'

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'full_name', 'role', 'school', 'transporter', 'photo_url')
        read_only_fields = ('id',)
