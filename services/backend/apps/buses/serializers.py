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
        Ultimate 5-status hierarchy:
        1. 'no_signal' (Red)   : silence > 12h
        2. 'offline'   (Grey)  : manually deactivated (maintenance)
        3. 'moving'    (Blue)  : < 10m signal + engine ON + speed > 2
        4. 'idle'      (Amber) : < 10m signal + engine ON + speed <= 2
        5. 'stopped'   (Black) : < 10m signal + engine OFF (parked) OR silence > 10m
        """
        # Grey — manually deactivated for maintenance
        if obj.status == 'offline': return 'offline'

        latest    = obj.gps_points.first()
        heartbeat = getattr(obj, 'latest_heartbeat', None) or (latest.timestamp if latest else None)
        if not heartbeat: return 'no_signal'

        now  = timezone.now()
        diff = now - heartbeat

        # Red — long-term failure
        # 1. 12-hour absolute silence = NO SIGNAL (Red)
        if diff > timedelta(hours=12):
            return 'no_signal'
        
        # Pull ignition state
        ignition = getattr(obj, 'latest_ignition', None)
        if ignition is None: ignition = latest.ignition if latest else False

        # 2. Critical Alert: Engine was ON but silence > 15m = NO SIGNAL (Red)
        if ignition and diff > timedelta(minutes=15):
            return 'no_signal'
        
        # 3. Parked: Engine is OFF and seen < 12h ago = STOPPED (Slate)
        if not ignition:
            return 'stopped'

        # 4. Engine is ON + Recent (< 5m): check speed for Moving vs Idle
        speed = getattr(obj, 'latest_speed', None)
        if speed is None: speed = float(latest.speed or 0) if latest else 0
        return 'moving' if float(speed) > 2 else 'idle'

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
