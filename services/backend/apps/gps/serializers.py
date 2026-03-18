from rest_framework import serializers
from .models import GPSPoint, Alert
from apps.buses.serializers import BusListSerializer

class GPSPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = GPSPoint
        fields = '__all__'

class GPSLatestSerializer(serializers.ModelSerializer):
    class Meta:
        model = GPSPoint
        fields = ('bus', 'lat', 'lng', 'speed', 'heading', 'timestamp', 'ignition')

class GPSPlaybackSerializer(serializers.ModelSerializer):
    class Meta:
        model = GPSPoint
        fields = ('lat', 'lng', 'speed', 'timestamp', 'ignition')

class AlertSerializer(serializers.ModelSerializer):
    bus = BusListSerializer(read_only=True)
    
    class Meta:
        model = Alert
        fields = '__all__'
