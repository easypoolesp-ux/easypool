from rest_framework import serializers

from apps.buses.serializers import BusListSerializer

from .models import Alert, GPSPoint


class GPSPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = GPSPoint
        fields = '__all__'


class GPSLatestSerializer(serializers.ModelSerializer):
    location = serializers.SerializerMethodField()

    class Meta:
        model = GPSPoint
        fields = ('bus', 'lat', 'lng', 'location', 'speed', 'heading', 'timestamp', 'ignition')

    def get_location(self, obj):
        if obj.location:
            return {'type': 'Point', 'coordinates': [obj.location.x, obj.location.y]}
        return None


class GPSPlaybackSerializer(serializers.ModelSerializer):
    location = serializers.SerializerMethodField()

    class Meta:
        model = GPSPoint
        fields = ('lat', 'lng', 'location', 'speed', 'timestamp', 'ignition')

    def get_location(self, obj):
        if obj.location:
            return {'type': 'Point', 'coordinates': [obj.location.x, obj.location.y]}
        return None


class AlertSerializer(serializers.ModelSerializer):
    bus = BusListSerializer(read_only=True)

    class Meta:
        model = Alert
        fields = '__all__'
