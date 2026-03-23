import uuid

from django.contrib.postgres.indexes import BrinIndex
from django.db import models
from django.contrib.gis.db import models as gis_models
from django.contrib.gis.geos import Point

from apps.buses.models import Bus
from apps.schools.models import User


class GPSPoint(models.Model):
    id = models.BigAutoField(primary_key=True)
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='gps_points')
    lat = models.FloatField()
    lng = models.FloatField()
    location = gis_models.PointField(null=True, blank=True, srid=4326)
    speed = models.FloatField(default=0)
    heading = models.FloatField(default=0, help_text='Direction of travel in degrees (0-360)')
    accuracy = models.FloatField(null=True, blank=True)
    timestamp = models.DateTimeField()
    ignition = models.BooleanField(default=False)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['bus', '-timestamp']),
            BrinIndex(fields=['timestamp']),
        ]

    def save(self, *args, **kwargs):
        # Automatically sync location if lat/lng are present but location is not
        if (self.lat and self.lng) and not self.location:
            self.location = Point(self.lng, self.lat)
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.bus.internal_id} @ {self.timestamp}'


class Alert(models.Model):
    TYPE_CHOICES = (
        ('sos', 'SOS'),
        ('overspeed', 'Overspeed'),
        ('off_route', 'Off Route'),
        ('camera_offline', 'Camera Offline'),
        ('student_missing', 'Student Missing'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='alerts')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    message = models.TextField()
    is_resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='resolved_alerts'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.get_type_display()} - {self.bus.internal_id}'
