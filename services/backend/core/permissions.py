from rest_framework import permissions

# ── Core Permission Classes ────────────────────────────────────────────────────
#
# These use Django's built-in Group system for RBAC.
# Groups are managed in Django Admin — no code deploy needed to change a user's role.
#
# Standard Groups:
#   Admin      → full CRUD access within their organisation scope
#   Manager    → day-to-day operations
#   Viewer     → read-only (SAFE_METHODS)
#   Parent     → read-only to their child


def _in_group(user, *group_names):
    """Returns True if the user is in any of the named Django Groups, or is a superuser."""
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name__in=group_names).exists()


class IsAdmin(permissions.BasePermission):
    """Full access. Mapped to the 'Admin' Group."""

    message = 'This action requires Admin access.'

    def has_permission(self, request, view):
        return _in_group(request.user, 'Admin')


class IsManager(permissions.BasePermission):
    """Operational access. Mapped to 'Manager' Group."""

    message = 'This action requires Manager access.'

    def has_permission(self, request, view):
        return _in_group(request.user, 'Admin', 'Manager')


class IsViewer(permissions.BasePermission):
    """Read-only access. Mapped to 'Viewer' Group."""

    message = 'This action requires Viewer access.'

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return _in_group(request.user, 'Admin', 'Manager', 'Viewer')
        return _in_group(request.user, 'Admin', 'Manager')  # Only Admin/Manager can write


class IsParent(permissions.BasePermission):
    """Read-only access for parents. Members of 'Parent' Group."""

    message = 'This action requires Parent access.'

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return _in_group(request.user, 'Admin', 'Manager', 'Viewer', 'Parent')
        return False


# ── School / Transporter Data Isolation Mixin ─────────────────────────────────
#
# Automatically filters querysets so users only see data belonging to their
# school or transporter. SuperAdmins see everything.
#
# SECURITY: Unauthenticated requests are NEVER allowed through — they return
# an empty queryset rather than leaking data, so the view's permission_classes
# will issue a 403 before the data is even fetched.


def apply_isolation(user, queryset):
    """
    Applies multi-tenant isolation filters to a queryset.
    """
    if not user.is_authenticated or not user.is_active:
        return queryset.none()

    if user.is_superuser:
        return queryset

    model = queryset.model

    # ── Organisation-level isolation (Multi-Tenant) ───────────────────────────
    if hasattr(user, 'organisation') and user.organisation:
        user_orgs = user.organisation.get_descendants()
        user_orgs.append(user.organisation)

        from django.db.models import Q

        from apps.schools.models import Organisation

        # 0. If the model IS Organisation itself
        if model == Organisation:
            queryset = queryset.filter(id__in=[org.id for org in user_orgs])

        # 1. Model is a Bus
        elif model.__name__ == 'Bus':
            queryset = queryset.filter(
                Q(organisation__in=user_orgs) | Q(allocations__granted_to__in=user_orgs)
            ).distinct()

        # 2. Model is linked to a Bus (GPSPoint, Camera, etc.)
        elif hasattr(model, 'bus'):
            queryset = queryset.filter(
                Q(bus__organisation__in=user_orgs) | Q(bus__allocations__granted_to__in=user_orgs)
            ).distinct()

        # 3. Model is a Route
        elif model.__name__ == 'Route':
            # Routes currently don't have an allocation model yet, but we'll follow similar logic
            queryset = queryset.filter(organisation__in=user_orgs)

    return queryset


class SchoolIsolationMixin:
    """
    Mixin for ViewSets to automatically apply organization isolation.
    """

    def get_queryset(self):
        queryset = super().get_queryset()
        return apply_isolation(self.request.user, queryset)
