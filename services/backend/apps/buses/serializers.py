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
    lat = serializers.FloatField(source='latest_lat', read_only=True)
    lng = serializers.FloatField(source='latest_lng', read_only=True)
    speed = serializers.FloatField(source='latest_speed', read_only=True)
    heading = serializers.FloatField(source='latest_heading', read_only=True)
    last_heartbeat = serializers.DateTimeField(source='latest_heartbeat', read_only=True)

    route_name = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_route_name(self, obj):
        return obj.route.name if obj.route else 'Unassigned'

    computed_status = serializers.SerializerMethodField()

    permission_level = serializers.SerializerMethodField()

    location = serializers.SerializerMethodField()

    class Meta:
        model = Bus
        fields = (
            'id',
            'internal_id',
            'plate_number',
            'status',
            'computed_status',
            'lat',
            'lng',
            'location',
            'speed',
            'heading',
            'route_name',
            'driver_name',
            'gps_imei',
            'last_heartbeat',
            'permission_level',
        )

    def get_location(self, obj):
        # We use the annotated latest_lat/lng or the property
        lat = getattr(obj, 'latest_lat', None)
        lng = getattr(obj, 'latest_lng', None)
        if lat is not None and lng is not None:
            return {"type": "Point", "coordinates": [lng, lat]}
        return None

    @extend_schema_field(serializers.CharField())
    def get_permission_level(self, obj):
        user = self.context.get('request').user
        if not user or not user.organisation:
            return 'view'

        if obj.organisation == user.organisation:
            return 'owner'

        from .models import BusAllocation

        alloc = BusAllocation.objects.filter(bus=obj, granted_to=user.organisation).first()
        return alloc.level if alloc else 'view'

    @extend_schema_field(serializers.CharField())
    def get_computed_status(self, obj):
        heartbeat = getattr(obj, 'latest_heartbeat', None)
        if not heartbeat:
            return 'no_signal'

        diff = timezone.now() - heartbeat
        if diff > timedelta(hours=12):
            return 'no_signal'

        speed = float(getattr(obj, 'latest_speed', 0) or 0)
        ignition = getattr(obj, 'latest_ignition', True)

        if not ignition:
            return 'ignition_off'

        return 'moving' if speed > 2 else 'idle'


class CameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Camera
        fields = ('id', 'name', 'stream_slug', 'stream_url', 'is_active')


class BusDetailSerializer(serializers.ModelSerializer):
    route = RouteSerializer(read_only=True)
    cameras = CameraSerializer(many=True, read_only=True)

    lat = serializers.FloatField(source='latest_lat', read_only=True)
    lng = serializers.FloatField(source='latest_lng', read_only=True)
    last_heartbeat = serializers.DateTimeField(source='latest_heartbeat', read_only=True)

    permission_level = serializers.SerializerMethodField()

    class Meta:
        model = Bus
        fields = (
            'id',
            'organisation',
            'transporter',
            'route',
            'vehicle_type',
            'internal_id',
            'plate_number',
            'make',
            'model_name',
            'manufacture_year',
            'fuel_type',
            'seating_capacity',
            'has_ac',
            'has_cctv',
            'gps_imei',
            'router_ip',
            'status',
            'driver_name',
            'driver_phone',
            'cameras',
            'lat',
            'lng',
            'last_heartbeat',
            'permission_level',
        )

    @extend_schema_field(serializers.CharField())
    def get_permission_level(self, obj):
        user = self.context.get('request').user
        if not user or not user.organisation:
            return 'view'

        if obj.organisation == user.organisation:
            return 'owner'

        from .models import BusAllocation

        alloc = BusAllocation.objects.filter(bus=obj, granted_to=user.organisation).first()
        return alloc.level if alloc else 'view'
