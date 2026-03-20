from django.contrib import admin

from .models import Organisation, User


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'org_type',
        'parent',
        'is_active',
        'owned_count_display',
        'allocated_count_display',
        'created_at',
    )
    list_filter = ('org_type', 'is_active')
    search_fields = ('name',)
    raw_id_fields = ('parent',)

    def get_queryset(self, request):
        from django.db.models import Count

        queryset = super().get_queryset(request)
        return queryset.annotate(
            _owned_count=Count('owned_buses', distinct=True),
            _allocated_count=Count('allocations_received', distinct=True),
        )

    def owned_count_display(self, obj):
        return getattr(obj, '_owned_count', 0)

    owned_count_display.short_description = 'Owned'
    owned_count_display.admin_order_field = '_owned_count'

    def allocated_count_display(self, obj):
        return getattr(obj, '_allocated_count', 0)

    allocated_count_display.short_description = 'Allocated'
    allocated_count_display.admin_order_field = '_allocated_count'


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        'email',
        'full_name',
        'organisation',
        'org_owned_count',
        'org_allocated_count',
        'is_active',
    )
    search_fields = ('email', 'full_name')
    list_filter = ('is_active', 'groups')
    raw_id_fields = ('organisation',)
    filter_horizontal = ('groups', 'user_permissions')

    def get_queryset(self, request):
        from django.db.models import Count

        queryset = super().get_queryset(request)
        return queryset.annotate(
            _org_owned_count=Count('organisation__owned_buses', distinct=True),
            _org_allocated_count=Count('organisation__allocations_received', distinct=True),
        )

    def org_owned_count(self, obj):
        return getattr(obj, '_org_owned_count', 0)

    org_owned_count.short_description = 'Org Owned'

    def org_allocated_count(self, obj):
        return getattr(obj, '_org_allocated_count', 0)

    org_allocated_count.short_description = 'Org Allocated'
