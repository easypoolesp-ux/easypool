import uuid

from django.contrib.gis.db import models as gis_models

# Trigger: Spatial Migration Build (Unblocked CI)
from django.contrib.postgres.indexes import BrinIndex, GistIndex
from django.db import models

from apps.buses.models import Bus
from apps.schools.models import User


class GPSPoint(models.Model):
    id = models.BigAutoField(primary_key=True)
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='gps_points')
    location = gis_models.PointField(srid=4326)  # No longer null
    speed = models.FloatField(default=0)
    heading = models.FloatField(default=0, help_text="Direction of travel in degrees (0-360)")
    accuracy = models.FloatField(null=True, blank=True)
    timestamp = models.DateTimeField()
    ignition = models.BooleanField(default=False)

    @property
    def lat(self):
        return self.location.y if self.location else None

    @property
    def lng(self):
        return self.location.x if self.location else None

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['bus', '-timestamp'], name='gps_gpspoin_bus_id_de6d73_idx'),
            BrinIndex(fields=['timestamp'], name='gps_gpspoin_timesta_eb9802_brin'),
            GistIndex(fields=['location'], name='gps_location_gist'),
        ]

    def save(self, *args, **kwargs):
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
