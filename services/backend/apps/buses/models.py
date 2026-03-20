import uuid

from django.db import models

from apps.schools.models import Organisation, Transporter


# ── Route ──────────────────────────────────────────────────────────────────────
class Route(models.Model):
    TYPE_CHOICES = (
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
        ('custom', 'Custom'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Ownership & Allocation ─────────────────────────────────────────────────
    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.CASCADE, related_name='owned_routes'
    )
    allocated_to = models.ManyToManyField(Organisation, blank=True, related_name='allocated_routes')

    transporter = models.ForeignKey(
        Transporter, null=True, blank=True, on_delete=models.SET_NULL, related_name='routes'
    )

    name = models.CharField(max_length=200)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='morning')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.name} ({self.get_type_display()})'


# ── Vehicle (formerly Bus) ─────────────────────────────────────────────────────
class Bus(models.Model):
    """
    Represents any tracked vehicle in the fleet.
    Supports school buses, vans, minibuses, tempo travellers, carpool cars, etc.
    Model is named 'Bus' for database backwards compatibility but represents
    any vehicle type.
    """

    VEHICLE_TYPE_CHOICES = (
        ('bus', 'Bus'),
        ('minibus', 'Minibus'),
        ('van', 'Van'),
        ('tempo', 'Tempo Traveller'),
        ('sedan', 'Sedan / Car'),
        ('electric_bus', 'Electric Bus'),
        ('truck', 'Truck'),
    )

    FUEL_TYPE_CHOICES = (
        ('diesel', 'Diesel'),
        ('petrol', 'Petrol'),
        ('electric', 'Electric'),
        ('cng', 'CNG'),
        ('hybrid', 'Hybrid'),
    )

    STATUS_CHOICES = (
        ('moving', 'Moving'),  # Green — ignition on, speed > 5
        ('idle', 'Idle'),  # Grey  — ignition on, speed = 0
        ('ignition_off', 'Ignition Off'),  # Red   — ignition off
        ('offline', 'Offline'),  # Black — no heartbeat
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Ownership & Allocation ─────────────────────────────────────────────────
    # The physical owner of the asset (has Write/Edit permissions)
    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.CASCADE, related_name='owned_buses'
    )
    # The clients/tenants who are currently renting/sharing this asset (Read-Only map access)
    allocated_to = models.ManyToManyField(Organisation, blank=True, related_name='allocated_buses')

    transporter = models.ForeignKey(
        Transporter, null=True, blank=True, on_delete=models.SET_NULL, related_name='buses'
    )
    route = models.ForeignKey(
        Route, null=True, blank=True, on_delete=models.SET_NULL, related_name='buses'
    )

    # ── Identity ───────────────────────────────────────────────────────────────
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES, default='bus')
    internal_id = models.CharField(max_length=50)  # e.g. WB101
    plate_number = models.CharField(max_length=50)  # e.g. WB01AB1234

    # ── Vehicle Specifications ─────────────────────────────────────────────────
    make = models.CharField(max_length=100, blank=True)  # e.g. Tata, Mahindra
    model_name = models.CharField(max_length=100, blank=True)  # e.g. Starbus, Winger
    manufacture_year = models.PositiveSmallIntegerField(null=True, blank=True)
    fuel_type = models.CharField(max_length=20, choices=FUEL_TYPE_CHOICES, blank=True)
    seating_capacity = models.PositiveSmallIntegerField(null=True, blank=True)
    has_ac = models.BooleanField(default=False)
    has_cctv = models.BooleanField(default=False)

    # ── GPS & Connectivity ─────────────────────────────────────────────────────
    gps_imei = models.CharField(max_length=50, blank=True, null=True, unique=True)
    router_ip = models.GenericIPAddressField(null=True, blank=True)

    # ── Live Status ────────────────────────────────────────────────────────────
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offline')

    # ── Driver ────────────────────────────────────────────────────────────────
    driver_name = models.CharField(max_length=200, blank=True)
    driver_phone = models.CharField(max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Vehicle'
        verbose_name_plural = 'Vehicles'

    def __str__(self):
        return f'{self.internal_id} - {self.plate_number} ({self.get_vehicle_type_display()})'


# ── Camera ─────────────────────────────────────────────────────────────────────
class Camera(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='cameras')
    name = models.CharField(max_length=100)  # e.g. Front Camera
    stream_slug = models.CharField(max_length=50)  # e.g. front
    stream_url = models.URLField(max_length=500, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.bus.internal_id} - {self.name}'
