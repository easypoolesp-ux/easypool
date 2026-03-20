import uuid

from django.db import models

from apps.schools.models import Organisation


# ── Route ──────────────────────────────────────────────────────────────────────
class Route(models.Model):
    TYPE_CHOICES = (
        ('morning', 'Morning'),
        ('afternoon', 'Afternoon'),
        ('custom', 'Custom'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.CASCADE, related_name='owned_routes'
    )

    transporter = models.ForeignKey(
        Organisation,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='operated_routes',
        limit_choices_to={'org_type': 'bus_agency'},
    )

    name = models.CharField(max_length=200)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='morning')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.name} ({self.get_type_display()})'


# ── Vehicle ────────────────────────────────────────────────────────────────────
class Bus(models.Model):
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
        ('moving', 'Moving'),
        ('idle', 'Idle'),
        ('ignition_off', 'Ignition Off'),
        ('offline', 'Offline'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.CASCADE, related_name='owned_buses'
    )

    # Transporter is now a Bus Agency Organisation
    transporter = models.ForeignKey(
        Organisation,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='operated_buses',
        limit_choices_to={'org_type': 'bus_agency'},
    )
    route = models.ForeignKey(
        Route, null=True, blank=True, on_delete=models.SET_NULL, related_name='buses'
    )

    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES, default='bus')
    internal_id = models.CharField(max_length=50)
    plate_number = models.CharField(max_length=50)

    make = models.CharField(max_length=100, blank=True)
    model_name = models.CharField(max_length=100, blank=True)
    manufacture_year = models.PositiveSmallIntegerField(null=True, blank=True)
    fuel_type = models.CharField(max_length=20, choices=FUEL_TYPE_CHOICES, blank=True)
    seating_capacity = models.PositiveSmallIntegerField(null=True, blank=True)
    has_ac = models.BooleanField(default=False)
    has_cctv = models.BooleanField(default=False)

    gps_imei = models.CharField(max_length=50, blank=True, null=True, unique=True)
    router_ip = models.GenericIPAddressField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offline')

    driver_name = models.CharField(max_length=200, blank=True)
    driver_phone = models.CharField(max_length=20, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Vehicle'
        verbose_name_plural = 'Vehicles'

    def __str__(self):
        return f'{self.internal_id} - {self.plate_number} ({self.get_vehicle_type_display()})'


class Camera(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='cameras')
    name = models.CharField(max_length=100)
    stream_slug = models.CharField(max_length=50)
    stream_url = models.URLField(max_length=500, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.bus.internal_id} - {self.name}'


class BusAllocation(models.Model):
    """
    Defines who shared a bus with whom, and at what level of authority.
    This is the SSOT for non-owned access.
    """

    LEVEL_CHOICES = (
        ('view', 'View Only'),
        ('edit', 'Edit Details'),
        ('admin', 'Full (Can Share/Allocate)'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='allocations')
    granted_by = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name='allocations_granted'
    )
    granted_to = models.ForeignKey(
        Organisation, on_delete=models.CASCADE, related_name='allocations_received'
    )
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES, default='view')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('bus', 'granted_to')
        verbose_name = 'Bus Allocation'
        verbose_name_plural = 'Bus Allocations'

    def clean(self):
        from django.core.exceptions import ValidationError

        # 1. Self-allocation check
        if self.granted_by == self.granted_to:
            raise ValidationError('An organisation cannot allocate a bus to itself.')

        # 2. Authority Check: Grantor must be the Owner or have 'admin' level allocation
        is_owner = self.bus.organisation == self.granted_by

        # Check if grantor has an existing allocation from someone else
        grantor_alloc = BusAllocation.objects.filter(
            bus=self.bus, granted_to=self.granted_by
        ).first()

        if not is_owner:
            if not grantor_alloc or grantor_alloc.level != 'admin':
                raise ValidationError(
                    f"Organisation {self.granted_by.name} does not have 'admin' authority to allocate this bus."
                )

        # 3. Level Check: Cannot grant more power than you have
        level_weights = {'admin': 3, 'edit': 2, 'view': 1}
        requested_weight = level_weights.get(self.level, 0)

        if not is_owner:
            grantor_weight = level_weights.get(grantor_alloc.level, 0)
            if requested_weight > grantor_weight:
                raise ValidationError(
                    f"Cannot grant '{self.get_level_display()}' level because you only have '{grantor_alloc.get_level_display()}' authority."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.bus.internal_id} -> {self.granted_to.name} ({self.get_level_display()})'
