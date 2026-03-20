from django.contrib import admin

from .models import Organisation, School, Transporter, User


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = ('name', 'org_type', 'parent', 'is_active', 'created_at')
    list_filter = ('org_type', 'is_active')
    search_fields = ('name',)
    raw_id_fields = ('parent',)


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ('name', 'organisation', 'contact_email', 'phone', 'is_active', 'created_at')
    search_fields = ('name', 'contact_email')
    list_filter = ('is_active',)
    raw_id_fields = ('organisation',)


@admin.register(Transporter)
class TransporterAdmin(admin.ModelAdmin):
    list_display = ('name', 'organisation', 'contact_person', 'phone', 'is_active')
    search_fields = ('name', 'contact_person', 'email')
    list_filter = ('is_active',)
    raw_id_fields = ('organisation',)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    # Removed legacy `role` field since we rely on Django Groups natively
    list_display = ('email', 'full_name', 'organisation', 'is_active')
    search_fields = ('email', 'full_name')
    list_filter = ('is_active', 'groups')
    raw_id_fields = ('organisation',)
    filter_horizontal = ('groups', 'user_permissions')
