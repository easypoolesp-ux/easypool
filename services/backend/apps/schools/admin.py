from django.contrib import admin
from .models import School, Transporter, User

@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ('name', 'contact_email', 'phone', 'is_active', 'created_at')
    search_fields = ('name', 'contact_email')
    list_filter = ('is_active',)
    ordering = ('-created_at',)

@admin.register(Transporter)
class TransporterAdmin(admin.ModelAdmin):
    list_display = ('name', 'school', 'contact_person', 'phone', 'is_active')
    search_fields = ('name', 'contact_person', 'email')
    list_filter = ('school', 'is_active')
    raw_id_fields = ('school',)

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'full_name', 'role', 'school', 'transporter', 'is_active')
    search_fields = ('email', 'full_name')
    list_filter = ('role', 'is_active', 'school', 'transporter')
    raw_id_fields = ('school', 'transporter')
