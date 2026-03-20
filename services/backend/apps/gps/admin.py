from django.contrib import admin
from .models import GPSPoint, Alert

@admin.register(GPSPoint)
class GPSPointAdmin(admin.ModelAdmin):
    list_display = ('bus', 'lat', 'lng', 'speed', 'heading', 'ignition', 'timestamp')
    list_filter = ('bus', 'ignition', 'timestamp')
    readonly_fields = ('timestamp',)

@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ('bus', 'type', 'is_resolved', 'created_at')
    list_filter = ('type', 'is_resolved', 'bus')
    readonly_fields = ('created_at',)
    raw_id_fields = ('bus', 'resolved_by')
