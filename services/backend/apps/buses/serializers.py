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
    last_heartbeat = serializers.SerializerMethodField()
    
    class Meta:
        model = Bus
        fields = ('id', 'internal_id', 'plate_number', 'status', 'lat', 'lng', 'route_name', 'driver_name', 'gps_imei', 'last_heartbeat')

    @extend_schema_field(serializers.DateTimeField())
    def get_last_heartbeat(self, obj):
        latest = obj.gps_points.first()
        return latest.timestamp if latest else None

    @extend_schema_field(serializers.FloatField())
    def get_lat(self, obj):
        latest = obj.gps_points.first()
        return latest.lat if latest else None

    @extend_schema_field(serializers.FloatField())
    def get_lng(self, obj):
        latest = obj.gps_points.first()
        return latest.lng if latest else None

class CameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Camera
        fields = ('id', 'name', 'stream_slug', 'stream_url', 'is_active')

class BusDetailSerializer(serializers.ModelSerializer):
    route = RouteSerializer(read_only=True)
    school = SchoolSerializer(read_only=True)
    cameras = CameraSerializer(many=True, read_only=True)
    lat = serializers.SerializerMethodField()
    lng = serializers.SerializerMethodField()
    last_heartbeat = serializers.SerializerMethodField()
    
    class Meta:
        model = Bus
        fields = '__all__'

    @extend_schema_field(serializers.FloatField())
    def get_lat(self, obj):
        latest = obj.gps_points.first()
        return latest.lat if latest else None

    @extend_schema_field(serializers.FloatField())
    def get_lng(self, obj):
        latest = obj.gps_points.first()
        return latest.lng if latest else None

    @extend_schema_field(serializers.DateTimeField())
    def get_last_heartbeat(self, obj):
        latest = obj.gps_points.first()
        return latest.timestamp if latest else None
