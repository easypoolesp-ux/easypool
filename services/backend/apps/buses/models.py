import uuid
from django.db import models
from apps.schools.models import School, Transporter

class Route(models.Model):
    TYPE_CHOICES = (
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
        ('custom', 'Custom'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='routes')
    transporter = models.ForeignKey(Transporter, null=True, blank=True, on_delete=models.SET_NULL, related_name='routes')
    name = models.CharField(max_length=200)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='morning')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"

class Bus(models.Model):
    STATUS_CHOICES = (
        ('online', 'Online'),
        ('offline', 'Offline'),
        ('idle', 'Idle'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='buses')
    transporter = models.ForeignKey(Transporter, null=True, blank=True, on_delete=models.SET_NULL, related_name='buses')
    route = models.ForeignKey(Route, null=True, blank=True, on_delete=models.SET_NULL, related_name='buses')
    internal_id = models.CharField(max_length=50) # e.g. WB101
    plate_number = models.CharField(max_length=50) # e.g. WB01AB1234
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offline')
    router_ip = models.GenericIPAddressField(null=True, blank=True)
    gps_imei = models.CharField(max_length=50, blank=True, null=True, unique=True) # Unique ID for hardware
    driver_name = models.CharField(max_length=200, blank=True)
    driver_phone = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.internal_id} - {self.plate_number}"

    class Meta:
        verbose_name_plural = "Buses"

class Camera(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='cameras')
    name = models.CharField(max_length=100) # e.g. Front Camera
    stream_slug = models.CharField(max_length=50) # e.g. front
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.bus.internal_id} - {self.name}"
