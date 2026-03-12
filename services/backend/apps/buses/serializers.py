from rest_framework import serializers
from .models import Route, Bus, Camera
from apps.schools.serializers import SchoolSerializer
from drf_spectacular.utils import extend_schema_field

class RouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Route
        fields = '__all__'

class BusListSerializer(serializers.ModelSerializer):
    lat = serializers.SerializerMethodField()
    lng = serializers.SerializerMethodField()
    route_name = serializers.CharField(source='route.name', read_only=True)
    
    class Meta:
        model = Bus
        fields = ('id', 'internal_id', 'plate_number', 'status', 'lat', 'lng', 'route_name', 'driver_name', 'gps_imei')

    @extend_schema_field(serializers.FloatField())
    def get_lat(self, obj):
        latest = obj.gps_points.first()
        return latest.lat if latest else 22.5726 # Default to Kolkata center

    @extend_schema_field(serializers.FloatField())
    def get_lng(self, obj):
        latest = obj.gps_points.first()
        return latest.lng if latest else 88.3639

class CameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Camera
        fields = ('id', 'name', 'stream_slug', 'is_active')

class BusDetailSerializer(serializers.ModelSerializer):
    route = RouteSerializer(read_only=True)
    school = SchoolSerializer(read_only=True)
    cameras = CameraSerializer(many=True, read_only=True)
    lat = serializers.SerializerMethodField()
    lng = serializers.SerializerMethodField()
    
    class Meta:
        model = Bus
        fields = '__all__'

    @extend_schema_field(serializers.FloatField())
    def get_lat(self, obj):
        latest = obj.gps_points.first()
        return latest.lat if latest else 22.5726

    @extend_schema_field(serializers.FloatField())
    def get_lng(self, obj):
        latest = obj.gps_points.first()
        return latest.lng if latest else 88.3639
