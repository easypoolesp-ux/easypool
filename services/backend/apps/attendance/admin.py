from django.contrib import admin
from .models import Attendance

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('student', 'bus', 'direction', 'confidence', 'timestamp')
    list_filter = ('direction', 'timestamp', 'bus')
    raw_id_fields = ('student', 'bus')
    readonly_fields = ('timestamp',)
