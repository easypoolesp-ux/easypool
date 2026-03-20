from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta
from .models import Route, Bus, Camera
from apps.schools.serializers import SchoolSerializer
from drf_spectacular.utils import extend_schema_field

class RouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Route
        fields = '__all__'

class BusListSerializer(serializers.ModelSerializer):
    lat             = serializers.SerializerMethodField()
    lng             = serializers.SerializerMethodField()
    route_name      = serializers.CharField(source='route.name', read_only=True)
    last_heartbeat  = serializers.SerializerMethodField()
    speed           = serializers.SerializerMethodField()
    heading         = serializers.SerializerMethodField()
    computed_status = serializers.SerializerMethodField()

    class Meta:
        model = Bus
        fields = ('id', 'internal_id', 'plate_number', 'status', 'computed_status',
                  'lat', 'lng', 'speed', 'heading', 'route_name',
                  'driver_name', 'gps_imei', 'last_heartbeat')

    @extend_schema_field(serializers.DateTimeField())
    def get_last_heartbeat(self, obj):
        if hasattr(obj, 'latest_heartbeat'):
            return obj.latest_heartbeat
        latest = obj.gps_points.first()
        return latest.timestamp if latest else None

    @extend_schema_field(serializers.FloatField())
    def get_lat(self, obj):
        if hasattr(obj, 'latest_lat'):
            return obj.latest_lat
        latest = obj.gps_points.first()
        return latest.lat if latest else None

    @extend_schema_field(serializers.FloatField())
    def get_lng(self, obj):
        if hasattr(obj, 'latest_lng'):
            return obj.latest_lng
        latest = obj.gps_points.first()
        return latest.lng if latest else None

    @extend_schema_field(serializers.FloatField())
    def get_speed(self, obj):
        if hasattr(obj, 'latest_speed'):
            return obj.latest_speed
        latest = obj.gps_points.first()
        return float(latest.speed) if latest and latest.speed is not None else 0.0

    @extend_schema_field(serializers.FloatField())
    def get_heading(self, obj):
        if hasattr(obj, 'latest_heading'):
            return obj.latest_heading
        latest = obj.gps_points.first()
        return float(latest.heading) if latest and latest.heading is not None else 0.0

    @extend_schema_field(serializers.CharField())
    def get_computed_status(self, obj):
        """
        Compute real-time status from live data:
        - 'offline'   : manually marked as inactive/maintenance
        - 'no_signal' : no GPS data in the last 12 hours (device issue)
        - 'moving'    : GPS received AND speed > 2 km/h
        - 'idle'      : GPS received AND speed <= 2 km/h (engine on, stationary)
        """
        # Grey — manually deactivated (maintenance, not in service, etc.)
        if obj.status == 'offline':
            return 'offline'

        heartbeat = getattr(obj, 'latest_heartbeat', None)
        if not heartbeat:
            latest = obj.gps_points.first()
            heartbeat = latest.timestamp if latest else None

        # Red — no GPS signal in 12 hours (device problem or bus not used)
        if not heartbeat or (timezone.now() - heartbeat) > timedelta(hours=12):
            return 'no_signal'

        speed = getattr(obj, 'latest_speed', None) or 0
        # Green — actively moving
        if float(speed) > 2:
            return 'moving'
        # Amber — ignition on, not moving
        return 'idle'

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
    def get_speed(self, obj):
        latest = obj.gps_points.first()
        return latest.speed if latest else 0

    @extend_schema_field(serializers.FloatField())
    def get_heading(self, obj):
        latest = obj.gps_points.first()
        return latest.heading if latest else 0

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
