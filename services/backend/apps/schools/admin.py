from django.contrib import admin

from .models import Organisation, User


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'org_type',
        'parent',
        'is_active',
        'vehicle_count_display',
        'created_at',
    )
    list_filter = ('org_type', 'is_active')
    search_fields = ('name',)
    raw_id_fields = ('parent',)

    def get_queryset(self, request):
        from django.db.models import Count

        queryset = super().get_queryset(request)
        return queryset.annotate(
            _vehicle_count=Count('owned_buses', distinct=True)
            + Count('allocated_buses', distinct=True)
        )

    def vehicle_count_display(self, obj):
        return getattr(obj, '_vehicle_count', 0)

    vehicle_count_display.short_description = 'Vehicles'
    vehicle_count_display.admin_order_field = '_vehicle_count'


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'full_name', 'organisation', 'is_active')
    search_fields = ('email', 'full_name')
    list_filter = ('is_active', 'groups')
    raw_id_fields = ('organisation',)
    filter_horizontal = ('groups', 'user_permissions')
