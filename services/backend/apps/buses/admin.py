from django.contrib import admin

from .models import Bus, BusAllocation, Camera, Route


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ('name', 'organisation', 'type', 'is_active')
    search_fields = ('name',)
    list_filter = ('type', 'is_active')
    raw_id_fields = ('organisation',)


class CameraInline(admin.TabularInline):
    model = Camera
    extra = 1


@admin.register(Bus)
class BusAdmin(admin.ModelAdmin):
    # Displays the Owner (organisation). The `BusAllocation` model provides guest visibility.
    list_display = ('internal_id', 'plate_number', 'vehicle_type', 'organisation', 'status')
    search_fields = ('internal_id', 'plate_number', 'driver_name')
    list_filter = ('status', 'vehicle_type')
    raw_id_fields = ('organisation', 'route')
    inlines = [CameraInline]


@admin.register(BusAllocation)
class BusAllocationAdmin(admin.ModelAdmin):
    list_display = ('bus', 'granted_by', 'granted_to', 'level', 'created_at')
    list_filter = ('level',)
    search_fields = ('bus__internal_id', 'granted_to__name')
    raw_id_fields = ('bus', 'granted_by', 'granted_to')

    def has_change_permission(self, request, obj=None):
        if obj and not request.user.is_superuser:
            # Only the grantor (or owner of the bus) can change it
            is_grantor = obj.granted_by == getattr(request.user, 'organisation', None)
            is_owner = obj.bus.organisation == getattr(request.user, 'organisation', None)
            if not (is_grantor or is_owner):
                return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if obj and not request.user.is_superuser:
            # Only the grantor (or owner of the bus) can delete it
            is_grantor = obj.granted_by == getattr(request.user, 'organisation', None)
            is_owner = obj.bus.organisation == getattr(request.user, 'organisation', None)
            if not (is_grantor or is_owner):
                return False
        return super().has_delete_permission(request, obj)

    def save_model(self, request, obj, form, change):
        # Auto-set grantor from user's organisation if not superuser
        if not request.user.is_superuser and not obj.granted_by:
            obj.granted_by = request.user.organisation
        super().save_model(request, obj, form, change)
