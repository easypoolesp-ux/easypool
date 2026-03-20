from django.contrib import admin
from .models import Route, Bus, Camera

@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ('name', 'organisation', 'type', 'is_active')
    search_fields = ('name',)
    list_filter = ('type', 'is_active')
    raw_id_fields = ('organisation',)
    filter_horizontal = ('allocated_to',)

class CameraInline(admin.TabularInline):
    model = Camera
    extra = 1

@admin.register(Bus)
class BusAdmin(admin.ModelAdmin):
    # Displays the Owner (organisation). The `allocated_to` field provides guest visibility.
    list_display = ('internal_id', 'plate_number', 'vehicle_type', 'organisation', 'status')
    search_fields = ('internal_id', 'plate_number', 'driver_name')
    list_filter = ('status', 'vehicle_type')
    raw_id_fields = ('organisation', 'route')
    filter_horizontal = ('allocated_to',)
    inlines = [CameraInline]
