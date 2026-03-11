from django.contrib import admin
from .models import Route, Bus, Camera

@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ('name', 'school', 'transporter', 'type', 'is_active')
    search_fields = ('name',)
    list_filter = ('school', 'transporter', 'type', 'is_active')
    raw_id_fields = ('school', 'transporter')

class CameraInline(admin.TabularInline):
    model = Camera
    extra = 1

@admin.register(Bus)
class BusAdmin(admin.ModelAdmin):
    list_display = ('internal_id', 'plate_number', 'school', 'transporter', 'status')
    search_fields = ('internal_id', 'plate_number', 'driver_name')
    list_filter = ('status', 'school', 'transporter')
    raw_id_fields = ('school', 'transporter', 'route')
    inlines = [CameraInline]
