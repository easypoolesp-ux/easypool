from django.contrib.gis import admin

from .models import Alert, GPSPoint


@admin.register(GPSPoint)
class GPSPointAdmin(admin.GISModelAdmin):
    list_display = ('bus', 'location', 'speed', 'heading', 'ignition', 'timestamp')
    list_filter = ('bus', 'ignition', 'timestamp')
    readonly_fields = ('timestamp',)


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ('bus', 'type', 'is_resolved', 'created_at')
    list_filter = ('type', 'is_resolved', 'bus')
    readonly_fields = ('created_at',)
    raw_id_fields = ('bus', 'resolved_by')
