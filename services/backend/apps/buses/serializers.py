from datetime import timedelta
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from .models import Bus, Camera, Route

class RouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Route
        fields = '__all__'

class BusListSerializer(serializers.ModelSerializer):
    lat = serializers.SerializerMethodField()
    lng = serializers.SerializerMethodField()
    route_name = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_route_name(self, obj):
        return obj.route.name if obj.route else "Unassigned"

    last_heartbeat = serializers.SerializerMethodField()
    speed = serializers.SerializerMethodField()
    heading = serializers.SerializerMethodField()
    computed_status = serializers.SerializerMethodField()

    class Meta:
        model = Bus
        fields = ('id', 'internal_id', 'plate_number', 'status', 'computed_status', 'lat', 'lng', 'speed', 'heading', 'route_name', 'driver_name', 'gps_imei', 'last_heartbeat')

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

    @extend_schema_field(serializers.FloatField())
    def get_speed(self, obj):
        latest = obj.gps_points.first()
        return float(latest.speed) if latest and latest.speed is not None else 0.0

    @extend_schema_field(serializers.FloatField())
    def get_heading(self, obj):
        latest = obj.gps_points.first()
        return float(latest.heading) if latest and latest.heading is not None else 0.0

    @extend_schema_field(serializers.CharField())
    def get_computed_status(self, obj):
        latest = obj.gps_points.first()
        if not latest: return 'no_signal'
        diff = timezone.now() - latest.timestamp
        if diff > timedelta(hours=12): return 'no_signal'
        return 'moving' if float(latest.speed or 0) > 2 else 'idle'

class CameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Camera
        fields = ('id', 'name', 'stream_slug', 'stream_url', 'is_active')

class BusDetailSerializer(serializers.ModelSerializer):
    route = RouteSerializer(read_only=True)
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
